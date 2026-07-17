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

  // -- real mode: fail-closed until a validated client path exists ---------

  it("real mode returns fail-closed error, does not call fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await loadIndexQuotes({ mode: "real" });
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("real_mode_not_wired");
    expect(result.error).toContain("validated backend");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("allowlist contains exactly 4 indices", () => {
    expect(INDEX_CODE_ALLOWLIST).toHaveLength(4);
  });
});
