import { describe, expect, it } from "vitest";
import { loadReportLibrary } from "../reportLibraryService";
import { toReportLibraryView } from "../reportLibraryAdapter";
import type { ReportLibraryQuery } from "../reportLibraryAdapter";

// ---------------------------------------------------------------------------
// Fail-closed service tests — no network, no env, no real data.
// ---------------------------------------------------------------------------

const BASE_QUERY: ReportLibraryQuery = {
  segmentKey: "computeChip",
  sort: "date_desc",
};

describe("loadReportLibrary", () => {
  // -- disabled mode (default) ----------------------------------------------

  it("returns empty ok envelope by default (disabled mode)", async () => {
    const envelope = await loadReportLibrary(BASE_QUERY);
    expect(envelope.ok).toBe(true);
    expect(envelope.reports).toEqual([]);
    expect(envelope.total).toBe(0);
    expect(envelope.partial).toBeFalsy();
  });

  it("disabled mode converts to empty ReportLibraryView", async () => {
    const envelope = await loadReportLibrary(BASE_QUERY);
    const view = toReportLibraryView(envelope);
    expect(view).toEqual({ kind: "empty" });
  });

  it("disabled mode explicitly passed also returns empty", async () => {
    const envelope = await loadReportLibrary(BASE_QUERY, { mode: "disabled" });
    expect(envelope.ok).toBe(true);
    expect(envelope.reports).toEqual([]);
  });

  // -- mock mode ------------------------------------------------------------

  it("mock mode returns placeholder envelope with [Mock] titles", async () => {
    const envelope = await loadReportLibrary(BASE_QUERY, { mode: "mock" });
    expect(envelope.ok).toBe(true);
    expect(envelope.reports).toBeDefined();
    expect(envelope.reports!.length).toBeGreaterThan(0);

    for (const r of envelope.reports!) {
      expect(r.title).toMatch(/^\[Mock\]/);
      expect(r.brokerage).toMatch(/^\[Mock\]/);
      if (r.analyst) expect(r.analyst).toMatch(/^\[Mock\]/);
      if (r.rating) expect(r.rating).toMatch(/^\[Mock\]/);
    }
  });

  it("mock mode converts to data ReportLibraryView", async () => {
    const envelope = await loadReportLibrary(BASE_QUERY, { mode: "mock" });
    const view = toReportLibraryView(envelope);
    expect(view.kind).toBe("data");
    if (view.kind === "data") {
      expect(view.reports.length).toBeGreaterThan(0);
      for (const r of view.reports) {
        expect(r.title).toMatch(/^\[Mock\]/);
      }
    }
  });

  // -- query is accepted but does not drive network --------------------------

  it("accepts various query shapes without side effects", async () => {
    const queries: ReportLibraryQuery[] = [
      {},
      { segmentKey: "hbm" },
      { keyword: "[Mock] test" },
      { fromDate: "2026-01-01", toDate: "2026-12-31" },
      { sort: "date_asc" },
    ];

    for (const q of queries) {
      const envelope = await loadReportLibrary(q);
      expect(envelope.ok).toBe(true);
      // disabled mode always returns empty regardless of query
      expect(envelope.reports).toEqual([]);
    }
  });

  // -- safety: mock data integrity ------------------------------------------

  it("mock envelope all display fields use [Mock] prefix and placeholder IDs", async () => {
    const envelope = await loadReportLibrary(BASE_QUERY, { mode: "mock" });

    for (const r of envelope.reports ?? []) {
      expect(r.title).toMatch(/^\[Mock\]/);
      expect(r.brokerage).toMatch(/^\[Mock\]/);
      if (r.analyst) expect(r.analyst).toMatch(/^\[Mock\]/);
      if (r.rating) expect(r.rating).toMatch(/^\[Mock\]/);
      expect(r.id).not.toMatch(/^\d{6}\.(SH|SZ|BJ)$/);
    }
  });

  it("mock envelope contains no real stock code patterns in any field", async () => {
    const envelope = await loadReportLibrary(BASE_QUERY, { mode: "mock" });

    for (const r of envelope.reports ?? []) {
      expect(r.id).not.toMatch(/^\d{6}\.(SH|SZ|BJ)$/);
      expect(r.title).not.toMatch(/\d{6}\.(SH|SZ|BJ)/);
    }
  });
});
