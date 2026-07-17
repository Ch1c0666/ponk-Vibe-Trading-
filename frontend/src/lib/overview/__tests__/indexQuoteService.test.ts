import { describe, expect, it, vi } from "vitest";
import { loadIndexQuotes, INDEX_CODE_ALLOWLIST } from "../indexQuoteService";

describe("loadIndexQuotes", () => {
  it("disabled mode returns empty envelope with zero network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await loadIndexQuotes({ mode: "disabled" });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("disabled");
    expect(result.data?.quotes).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("mock mode returns [Mock]-prefixed data with zero network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await loadIndexQuotes({ mode: "mock" });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("[Mock] tencent");
    expect(result.data?.quotes).toHaveLength(4);
    for (const q of result.data!.quotes) {
      expect(q.name).toMatch(/^\[Mock\]/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("default mode is disabled", async () => {
    const result = await loadIndexQuotes();
    expect(result.source).toBe("disabled");
  });

  // -- real mode: calls GET /api/overview/index-quotes -------------------

  it("real mode fetches correct REST endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        source: "tencent",
        timestamp: "t",
        data: { quotes: [], partial: false, warnings: [] },
      }),
    } as Response);

    await loadIndexQuotes({ mode: "real" });

    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe("/api/overview/index-quotes");
    expect(fetchMock.mock.calls[0][1]).toBeUndefined(); // GET has no init
  });

  it("real mode parses success response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        source: "tencent",
        timestamp: "t",
        data: {
          quotes: [{ code: "sh000001", name: "SSE", price: 3350, prev_close: null, open: null, high: null, low: null, change_pct: 0.42 }],
          partial: false,
          warnings: [],
        },
      }),
    } as Response);

    const result = await loadIndexQuotes({ mode: "real" });
    expect(result.ok).toBe(true);
    expect(result.data?.quotes).toHaveLength(1);
    expect(result.data?.quotes[0].name).toBe("SSE");
  });

  it("real mode handles HTTP error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    } as Response);

    const result = await loadIndexQuotes({ mode: "real" });
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("provider_request_failed");
    expect(result.error).toContain("502");
  });

  it("real mode handles network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));

    const result = await loadIndexQuotes({ mode: "real" });
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("provider_request_failed");
  });

  it("real mode handles non-JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new Error("not json"); },
    } as unknown as Response);

    const result = await loadIndexQuotes({ mode: "real" });
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("provider_parse_error");
  });

  it("real mode does NOT call /mcp", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { quotes: [], partial: false, warnings: [] } }),
    } as Response);

    await loadIndexQuotes({ mode: "real" });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("/mcp");
  });

  it("allowlist contains exactly 4 indices", () => {
    expect(INDEX_CODE_ALLOWLIST).toHaveLength(4);
  });
});
