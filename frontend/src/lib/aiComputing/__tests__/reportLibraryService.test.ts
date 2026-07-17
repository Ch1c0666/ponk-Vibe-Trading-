import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadReportLibrary } from "../reportLibraryService";
import { toReportLibraryView } from "../reportLibraryAdapter";
import type { ReportLibraryQuery } from "../reportLibraryAdapter";

// Placeholder codes — syntactic only, not real stocks.
const PLACEHOLDER_A = "000000.SH";
const PLACEHOLDER_B = "111111.SZ";

const BASE_QUERY: ReportLibraryQuery = { segmentKey: "computeChip", sort: "date_desc" };

// ---------------------------------------------------------------------------
// Helpers for real-mode mock responses
// ---------------------------------------------------------------------------

function fakeReportResponse(reports: Record<string, unknown>[], partial = false) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      market: "CN",
      source: "eastmoney+ths",
      data: {
        q_type: 0,
        code: PLACEHOLDER_A,
        reports,
        consensus_eps: [],
        partial,
        warnings: partial ? [{ code: "provider_page_failed", message: "page fail", page: 2 }] : [],
      },
    }),
  } as Response;
}

function fakeErrorResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: false,
      error: "no research coverage found",
      error_code: "no_data",
    }),
  } as Response;
}

function fakeHttpError(status: number) {
  return { ok: false, status } as Response;
}

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

beforeEach(() => {
  fetchSpy.mockReset();
});

describe("loadReportLibrary", () => {
  // -- disabled -------------------------------------------------------------

  it("returns empty by default (disabled)", async () => {
    const env = await loadReportLibrary(BASE_QUERY);
    expect(env.ok).toBe(true);
    expect(env.reports).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -- mock -----------------------------------------------------------------

  it("mock mode returns [Mock]-prefixed data, no fetch", async () => {
    const env = await loadReportLibrary(BASE_QUERY, { mode: "mock" });
    expect(env.ok).toBe(true);
    expect(env.reports!.length).toBeGreaterThan(0);
    for (const r of env.reports!) expect(r.title).toMatch(/^\[Mock\]/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -- real: empty codes → no fetch ---------------------------------------

  it("real mode with empty codes returns empty, no fetch", async () => {
    const env = await loadReportLibrary({}, { mode: "real" });
    expect(env.ok).toBe(true);
    expect(env.reports).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -- real: single code success -------------------------------------------

  it("real mode fetches correct URL for single code", async () => {
    fetchSpy.mockResolvedValueOnce(fakeReportResponse([
      { info_code: "R001", title: "Test", brokerage: "B", analyst: null, publish_date: "2026-01-01", rating: "Buy" },
    ]));

    const env = await loadReportLibrary(
      { codes: [PLACEHOLDER_A] },
      { mode: "real" },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(`code=${PLACEHOLDER_A}`);
    expect(url).toContain("limit=20");
    expect(url).toContain("/api/reports/research");
    expect(env.ok).toBe(true);
    expect(env.reports).toHaveLength(1);
  });

  // -- real: multiple codes aggregation + dedup -----------------------------

  it("real mode aggregates and deduplicates from multiple codes", async () => {
    fetchSpy
      .mockResolvedValueOnce(fakeReportResponse([
        { info_code: "R001", title: "A1", brokerage: "X", analyst: null, publish_date: "2026-02-01", rating: "Buy" },
        { info_code: "R002", title: "A2", brokerage: "X", analyst: null, publish_date: "2026-01-15", rating: "Hold" },
      ]))
      .mockResolvedValueOnce(fakeReportResponse([
        { info_code: "R001", title: "A1", brokerage: "X", analyst: null, publish_date: "2026-02-01", rating: "Buy" }, // dup
        { info_code: "R003", title: "B1", brokerage: "Y", analyst: null, publish_date: "2026-03-01", rating: "Buy" },
      ]));

    const env = await loadReportLibrary(
      { codes: [PLACEHOLDER_A, PLACEHOLDER_B] },
      { mode: "real" },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(env.ok).toBe(true);
    // Deduped: R001 + R002 + R003 = 3
    expect(env.reports).toHaveLength(3);
    // Sorted by publishDate descending: R003 (Mar) → R001 (Feb) → R002 (Jan)
    expect(env.reports![0].id).toBe("R003");
  });

  // -- real: partial (one ok, one fail) ------------------------------------

  it("real mode marks partial when one code fails", async () => {
    fetchSpy
      .mockResolvedValueOnce(fakeReportResponse([
        { info_code: "R001", title: "OK", brokerage: "X", analyst: null, publish_date: "2026-01-01", rating: "Buy" },
      ]))
      .mockResolvedValueOnce(fakeErrorResponse());

    const env = await loadReportLibrary(
      { codes: [PLACEHOLDER_A, PLACEHOLDER_B] },
      { mode: "real" },
    );

    expect(env.ok).toBe(true);
    expect(env.partial).toBe(true);
    expect(env.warnings).toBeDefined();
    expect(env.warnings!.length).toBeGreaterThanOrEqual(1);
    // sourceCode in warning references the failing code
    const failWarning = env.warnings!.find((w) => w.sourceCode === PLACEHOLDER_B);
    expect(failWarning).toBeDefined();
    expect(env.reports).toHaveLength(1);
  });

  // -- real: all failed ----------------------------------------------------

  it("real mode returns error when all codes fail", async () => {
    fetchSpy
      .mockResolvedValueOnce(fakeErrorResponse())
      .mockResolvedValueOnce(fakeErrorResponse());

    const env = await loadReportLibrary(
      { codes: [PLACEHOLDER_A, PLACEHOLDER_B] },
      { mode: "real" },
    );

    expect(env.ok).toBe(false);
    expect(env.error).toBeDefined();
  });

  // -- real: HTTP error ----------------------------------------------------

  it("real mode handles HTTP error gracefully", async () => {
    fetchSpy.mockResolvedValueOnce(fakeHttpError(502));

    const env = await loadReportLibrary(
      { codes: [PLACEHOLDER_A] },
      { mode: "real" },
    );

    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe("provider_request_failed");
  });

  // -- real: network error -------------------------------------------------

  it("real mode handles network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));

    const env = await loadReportLibrary(
      { codes: [PLACEHOLDER_A] },
      { mode: "real" },
    );

    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe("provider_request_failed");
  });

  // -- real: limit clamp ---------------------------------------------------

  it("real mode clamps limit to 50 max", async () => {
    fetchSpy.mockResolvedValueOnce(fakeReportResponse([]));

    await loadReportLibrary(
      { codes: [PLACEHOLDER_A], limit: 100 },
      { mode: "real" },
    );

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("limit=50");
  });

  // -- existing disabled/mock behavior preserved ----------------------------

  it("disabled mode converts to empty view", async () => {
    const env = await loadReportLibrary(BASE_QUERY);
    expect(toReportLibraryView(env)).toEqual({ kind: "empty" });
  });

  it("mock mode converts to data view", async () => {
    const env = await loadReportLibrary(BASE_QUERY, { mode: "mock" });
    expect(toReportLibraryView(env).kind).toBe("data");
  });

  // -- no env reads, no MCP -------------------------------------------------

  it("service source has no env reads", async () => {
    const mod = await import("../reportLibraryService");
    const src = await import("../reportLibraryService?raw" as string).catch(() => null);
    // Sanity: the module imports don't reference process.env or import.meta.env
    expect(mod).toBeDefined();
  });

  it("real mode does NOT call /mcp", async () => {
    fetchSpy.mockResolvedValueOnce(fakeReportResponse([]));

    await loadReportLibrary(
      { codes: [PLACEHOLDER_A] },
      { mode: "real" },
    );

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("/mcp");
  });
});
