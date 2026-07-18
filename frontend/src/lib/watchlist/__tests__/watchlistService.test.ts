// ---------------------------------------------------------------------------
// watchlistService unit tests.
// Only placeholder codes: 000000.SH, 000000.SZ, MOCK, TEST.
// No real stock codes.  No network.  No env reads.
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeEach, vi } from "vitest";
import { loadWatchlistQuotes } from "../watchlistService";

const mockLoadStockQuote = vi.fn();

vi.mock("@/lib/reviewedCodes/stockQuoteService", () => ({
  loadStockQuote: (...args: unknown[]) => mockLoadStockQuote(...args),
}));

function mockQuoteOk(code: string) {
  return {
    ok: true,
    source: "test",
    code,
    data: {
      name: `[Test] ${code}`,
      price: 10.0,
      prev_close: null,
      open: null,
      high: null,
      low: null,
      change_pct: 0.5,
      pe_ttm: null,
      pb: null,
    },
  };
}

beforeEach(() => {
  mockLoadStockQuote.mockReset();
});

// ---------------------------------------------------------------------------
// disabled mode
// ---------------------------------------------------------------------------

describe("watchlistService disabled mode", () => {
  it("returns idle for all codes", async () => {
    const result = await loadWatchlistQuotes(["000000.SH", "000000.SZ", "MOCK"]);

    expect(result.size).toBe(3);
    for (const [, state] of result) {
      expect(state.kind).toBe("idle");
    }
  });

  it("does NOT call loadStockQuote", async () => {
    await loadWatchlistQuotes(["000000.SH"], { mode: "disabled" });
    expect(mockLoadStockQuote).not.toHaveBeenCalled();
  });

  it("returns empty map for empty input", async () => {
    const result = await loadWatchlistQuotes([]);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mock mode
// ---------------------------------------------------------------------------

describe("watchlistService mock mode", () => {
  it("returns loaded for all codes", async () => {
    const result = await loadWatchlistQuotes(
      ["000000.SH", "000000.SZ", "MOCK", "TEST"],
      { mode: "mock" },
    );

    expect(result.size).toBe(4);
    for (const [, state] of result) {
      expect(state.kind).toBe("loaded");
    }
  });

  it("name is prefixed with [Mock]", async () => {
    const result = await loadWatchlistQuotes(["000000.SH"], { mode: "mock" });

    const state = result.get("000000.SH");
    expect(state?.kind).toBe("loaded");
    if (state?.kind === "loaded") {
      expect(state.data.name).toMatch(/^\[Mock\]/);
    }
  });

  it("price is the mock value", async () => {
    const result = await loadWatchlistQuotes(["000000.SZ"], { mode: "mock" });

    const state = result.get("000000.SZ");
    expect(state?.kind).toBe("loaded");
    if (state?.kind === "loaded") {
      expect(state.data.price).toBe(50.0);
      expect(state.data.change_pct).toBe(1.01);
    }
  });

  it("does NOT call loadStockQuote", async () => {
    await loadWatchlistQuotes(["000000.SH"], { mode: "mock" });
    expect(mockLoadStockQuote).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// real mode — A-share fetching
// ---------------------------------------------------------------------------

describe("watchlistService real mode — A-share", () => {
  it("calls loadStockQuote for each A-share code with real mode", async () => {
    mockLoadStockQuote.mockResolvedValue(mockQuoteOk("000000.SH"));

    await loadWatchlistQuotes(["000000.SH", "000000.SZ"], { mode: "real" });

    expect(mockLoadStockQuote).toHaveBeenCalledTimes(2);
    expect(mockLoadStockQuote).toHaveBeenCalledWith("000000.SH", { mode: "real" });
    expect(mockLoadStockQuote).toHaveBeenCalledWith("000000.SZ", { mode: "real" });
  });

  it("maps ok envelope to loaded state", async () => {
    mockLoadStockQuote.mockResolvedValue(mockQuoteOk("000000.SH"));

    const result = await loadWatchlistQuotes(["000000.SH"], { mode: "real" });

    const state = result.get("000000.SH");
    expect(state?.kind).toBe("loaded");
  });
});

// ---------------------------------------------------------------------------
// real mode — US stock fail-closed
// ---------------------------------------------------------------------------

describe("watchlistService real mode — US stock", () => {
  it("does NOT call loadStockQuote for US code MOCK", async () => {
    const result = await loadWatchlistQuotes(["MOCK", "TEST"], { mode: "real" });

    expect(mockLoadStockQuote).not.toHaveBeenCalled();
    expect(result.get("MOCK")?.kind).toBe("idle");
    expect(result.get("TEST")?.kind).toBe("idle");
  });

  it("mixed A-share + US: only fetches A-share", async () => {
    mockLoadStockQuote.mockResolvedValue(mockQuoteOk("000000.SH"));

    const result = await loadWatchlistQuotes(
      ["000000.SH", "MOCK"],
      { mode: "real" },
    );

    expect(mockLoadStockQuote).toHaveBeenCalledTimes(1);
    expect(mockLoadStockQuote).toHaveBeenCalledWith("000000.SH", { mode: "real" });
    expect(result.get("MOCK")?.kind).toBe("idle");
    expect(result.get("000000.SH")?.kind).toBe("loaded");
  });
});

// ---------------------------------------------------------------------------
// real mode — error handling
// ---------------------------------------------------------------------------

describe("watchlistService real mode — errors", () => {
  it("code_not_reviewed → not_reviewed state", async () => {
    mockLoadStockQuote.mockResolvedValueOnce({
      ok: false,
      error: "Code not reviewed",
      error_code: "code_not_reviewed",
    });

    const result = await loadWatchlistQuotes(["000000.SH"], { mode: "real" });

    expect(result.get("000000.SH")?.kind).toBe("not_reviewed");
  });

  it("non-code_not_reviewed error → error state", async () => {
    mockLoadStockQuote.mockResolvedValueOnce({
      ok: false,
      error: "Service unavailable",
      error_code: "provider_request_failed",
    });

    const result = await loadWatchlistQuotes(["000000.SH"], { mode: "real" });

    const state = result.get("000000.SH");
    expect(state?.kind).toBe("error");
    if (state?.kind === "error") {
      expect(state.message).toBe("Service unavailable");
    }
  });

  it("ok=true but no data → error state", async () => {
    mockLoadStockQuote.mockResolvedValueOnce({
      ok: true,
      source: "test",
      code: "000000.SH",
      data: undefined,
    });

    const result = await loadWatchlistQuotes(["000000.SH"], { mode: "real" });

    const state = result.get("000000.SH");
    expect(state?.kind).toBe("error");
    if (state?.kind === "error") {
      expect(state.message).toBe("No data returned");
    }
  });

  it("loadStockQuote throws → error state", async () => {
    mockLoadStockQuote.mockRejectedValueOnce(new Error("Network failure"));

    const result = await loadWatchlistQuotes(["000000.SH"], { mode: "real" });

    const state = result.get("000000.SH");
    expect(state?.kind).toBe("error");
    if (state?.kind === "error") {
      expect(state.message).toBe("Network failure");
    }
  });
});

// ---------------------------------------------------------------------------
// maxConcurrency clamp
// ---------------------------------------------------------------------------

describe("watchlistService maxConcurrency", () => {
  it("clamps maxConcurrency to at least 1", async () => {
    mockLoadStockQuote.mockResolvedValue(mockQuoteOk("000000.SH"));

    const result = await loadWatchlistQuotes(
      ["000000.SH", "000000.SZ"],
      { mode: "real", maxConcurrency: 0 },
    );

    // Both codes should be fetched — if clamp didn't work, 0 workers
    // would never start and no fetch would happen.
    expect(mockLoadStockQuote).toHaveBeenCalledTimes(2);
    expect(mockLoadStockQuote).toHaveBeenCalledWith("000000.SH", { mode: "real" });
    expect(mockLoadStockQuote).toHaveBeenCalledWith("000000.SZ", { mode: "real" });

    expect(result.get("000000.SH")?.kind).toBe("loaded");
    expect(result.get("000000.SZ")?.kind).toBe("loaded");
  });
});
