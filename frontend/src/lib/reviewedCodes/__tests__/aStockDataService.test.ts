// ---------------------------------------------------------------------------
// aStockDataService unit tests.
// Only placeholder codes: 000000.SH, MOCK, TEST.
// No real stock codes.  No network.  No env reads.
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeEach, vi } from "vitest";
import { loadAStockData } from "../aStockDataService";

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

beforeEach(() => {
  fetchSpy.mockReset();
});

describe("aStockDataService disabled mode", () => {
  it("returns ok with empty data, no fetch", async () => {
    const result = await loadAStockData("000000.SH");
    expect(result.ok).toBe(true);
    expect(result.source).toBe("disabled");
    expect(result.data).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("disabled is the default mode", async () => {
    const result = await loadAStockData("000000.SH", {});
    expect(result.source).toBe("disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("aStockDataService mock mode", () => {
  it("returns [Mock] data with all families, no fetch", async () => {
    const result = await loadAStockData("000000.SH", { mode: "mock" });
    expect(result.ok).toBe(true);
    expect(result.source).toContain("[Mock]");
    expect(result.data.news?.ok).toBe(true);
    expect(result.data.fundamentals?.ok).toBe(true);
    expect(result.data.reports?.ok).toBe(true);
    expect(result.data.announcements?.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("aStockDataService real mode", () => {
  it("calls correct URL with non-quote include list", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, source: "a-stock-data", code: "000000.SH", data: {} }),
    });

    await loadAStockData("000000.SH", { mode: "real" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/api/a-stocks/data?code=000000.SH");
    expect(url).toContain("include=news");
    expect(url).toContain("fundamentals");
    expect(url).toContain("reports");
    expect(url).toContain("announcements");
  });

  it("does NOT call /api/reports/research", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: {} }),
    });

    await loadAStockData("000000.SH", { mode: "real" });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("/api/reports/research");
  });

  it("does NOT call /mcp", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: {} }),
    });

    await loadAStockData("000000.SH", { mode: "real" });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("/mcp");
  });

  it("returns error envelope on fetch failure", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network down"));

    const result = await loadAStockData("000000.SH", { mode: "real" });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("provider_request_failed");
    expect(result.error).toContain("Network down");
  });

  it("returns error envelope on non-JSON response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error("parse error"); },
    });

    const result = await loadAStockData("000000.SH", { mode: "real" });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("provider_parse_error");
  });
});
