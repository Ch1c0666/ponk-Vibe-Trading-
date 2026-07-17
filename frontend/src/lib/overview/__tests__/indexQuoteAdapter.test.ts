import { describe, expect, it } from "vitest";
import {
  toIndexQuoteView,
  type IndexQuoteEnvelope,
} from "../indexQuoteAdapter";

function envelope(overrides: Partial<IndexQuoteEnvelope> = {}): IndexQuoteEnvelope {
  return {
    ok: true,
    source: "tencent",
    timestamp: "2026-07-18T10:00:00Z",
    data: {
      quotes: [
        { code: "sh000001", name: "上证综指", price: 3350, prev_close: 3340, open: 3345, high: 3360, low: 3330, change_pct: 0.42 },
        { code: "sz399001", name: "深证成指", price: 10800, prev_close: 10750, open: 10760, high: 10850, low: 10700, change_pct: -0.15 },
      ],
      partial: false,
      warnings: [],
    },
    ...overrides,
  };
}

describe("toIndexQuoteView", () => {
  it("returns data for a successful full envelope", () => {
    const view = toIndexQuoteView(envelope());
    expect(view.kind).toBe("data");
    if (view.kind === "data") {
      expect(view.quotes).toHaveLength(2);
      expect(view.source).toBe("tencent");
      expect(view.quotes[0].price).toBe(3350);
    }
  });

  it("returns partial when partial is true", () => {
    const view = toIndexQuoteView(
      envelope({
        data: {
          quotes: [{ code: "sh000001", name: "", price: 3500, prev_close: null, open: null, high: null, low: null, change_pct: null }],
          partial: true,
          warnings: [{ code: "provider_quote_failed", message: "sz fail", index_code: "sz399001" }],
        },
      }),
    );
    expect(view.kind).toBe("partial");
    if (view.kind === "partial") {
      expect(view.warnings).toHaveLength(1);
      expect(view.quotes).toHaveLength(1);
    }
  });

  it("returns error when ok is false", () => {
    const view = toIndexQuoteView({
      ok: false,
      error: "all failed",
      error_code: "provider_request_failed",
    });
    expect(view.kind).toBe("error");
    if (view.kind === "error") {
      expect(view.errorCode).toBe("provider_request_failed");
    }
  });

  it("returns error with defaults when error details missing", () => {
    const view = toIndexQuoteView({ ok: false });
    expect(view.kind).toBe("error");
    if (view.kind === "error") {
      expect(view.errorCode).toBe("unknown");
    }
  });

  it("returns empty when data is missing", () => {
    const view = toIndexQuoteView({ ok: true });
    expect(view.kind).toBe("empty");
  });

  it("returns empty when quotes array is empty", () => {
    const view = toIndexQuoteView(
      envelope({ data: { quotes: [], partial: false, warnings: [] } }),
    );
    expect(view.kind).toBe("empty");
  });

  it("falls back to unknown source when missing", () => {
    const view = toIndexQuoteView({
      ok: true,
      timestamp: "t",
      data: { quotes: [{ code: "sh000001", name: "X", price: 1, prev_close: null, open: null, high: null, low: null, change_pct: null }], partial: false, warnings: [] },
    });
    if (view.kind === "data") expect(view.source).toBe("unknown");
  });
});
