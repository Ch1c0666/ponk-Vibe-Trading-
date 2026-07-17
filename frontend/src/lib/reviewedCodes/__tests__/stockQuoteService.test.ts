import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadStockQuote } from "../stockQuoteService";

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

beforeEach(() => { fetchSpy.mockReset(); });

describe("loadStockQuote", () => {
  it("disabled mode returns no data, no fetch", async () => {
    const r = await loadStockQuote("688041.SH", { mode: "disabled" });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("disabled");
    expect(r.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mock mode returns [Mock] data, no fetch", async () => {
    const r = await loadStockQuote("688041.SH", { mode: "mock" });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("[Mock] tencent");
    expect(r.data?.price).toBe(100.0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("real mode fetches correct URL", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, source: "tencent", code: "688041.SH", data: { name: "X", price: 304 } }),
    } as Response);

    const r = await loadStockQuote("688041.SH", { mode: "real" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/api/stocks/quote?code=688041.SH");
    expect(url).not.toContain("/api/reports");
    expect(r.ok).toBe(true);
    expect(r.data?.price).toBe(304);
  });

  it("real mode handles HTTP error (403)", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, error_code: "code_not_reviewed", error: "not reviewed" }),
    } as Response);

    const r = await loadStockQuote("688041.SH", { mode: "real" });
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("code_not_reviewed");
  });

  it("real mode handles network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("down"));
    const r = await loadStockQuote("688041.SH", { mode: "real" });
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("provider_request_failed");
  });

  it("real mode handles non-JSON", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error("bad json"); },
    } as unknown as Response);
    const r = await loadStockQuote("688041.SH", { mode: "real" });
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("provider_parse_error");
  });
});
