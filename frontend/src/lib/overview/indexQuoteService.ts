// ---------------------------------------------------------------------------
// Index quote service — disabled / mock / real modes.
// No env reads.  No real network in disabled or mock modes.
// ---------------------------------------------------------------------------

import type { IndexQuoteEnvelope } from "./indexQuoteAdapter";

// ---------------------------------------------------------------------------
// Allowed index codes — must match the backend allowlist exactly.
// ---------------------------------------------------------------------------

export const INDEX_CODE_ALLOWLIST = [
  "sh000001",
  "sz399001",
  "sz399006",
  "sh000688",
] as const;

export type IndexCode = (typeof INDEX_CODE_ALLOWLIST)[number];

// ---------------------------------------------------------------------------
// Service mode
// ---------------------------------------------------------------------------

export type IndexQuoteServiceMode = "disabled" | "mock" | "real";

export interface IndexQuoteServiceOptions {
  mode?: IndexQuoteServiceMode;
}

// ---------------------------------------------------------------------------
// Mock envelope — every field prefixed so it cannot be mistaken for live data.
// ---------------------------------------------------------------------------

const MOCK_ENVELOPE: IndexQuoteEnvelope = {
  ok: true,
  source: "[Mock] tencent",
  timestamp: new Date().toISOString(),
  data: {
    quotes: [
      {
        code: "sh000001",
        name: "[Mock] 上证综指",
        price: 3350.0,
        prev_close: 3340.0,
        open: 3345.0,
        high: 3360.0,
        low: 3330.0,
        change_pct: 0.42,
      },
      {
        code: "sz399001",
        name: "[Mock] 深证成指",
        price: 10800.0,
        prev_close: 10750.0,
        open: 10760.0,
        high: 10850.0,
        low: 10700.0,
        change_pct: -0.15,
      },
      {
        code: "sz399006",
        name: "[Mock] 创业板指",
        price: 2150.0,
        prev_close: 2130.0,
        open: 2135.0,
        high: 2160.0,
        low: 2120.0,
        change_pct: 1.2,
      },
      {
        code: "sh000688",
        name: "[Mock] 科创50",
        price: 980.0,
        prev_close: 985.0,
        open: 983.0,
        high: 990.0,
        low: 975.0,
        change_pct: -0.8,
      },
    ],
    partial: false,
    warnings: [],
  },
};

// ---------------------------------------------------------------------------

/**
 * Load index quotes for the Overview page.
 *
 * - **disabled** (default): returns ``{ kind: "disabled" }`` — no network.
 * - **mock**: returns a static ``[Mock]``-prefixed envelope — no network.
 * - **real**: fail-closed — returns ``ok:false`` with
 *   ``error_code: "real_mode_not_wired"``.  No network access.
 *   Reserved for a validated backend API/MCP client path.
 */
export async function loadIndexQuotes(
  options?: IndexQuoteServiceOptions,
): Promise<IndexQuoteEnvelope> {
  const mode = options?.mode ?? "disabled";

  if (mode === "disabled") {
    return {
      ok: true,
      source: "disabled",
      timestamp: new Date().toISOString(),
      data: { quotes: [], partial: false, warnings: [] },
    };
  }

  if (mode === "mock") {
    return { ...MOCK_ENVELOPE };
  }

  // -- real mode — fail-closed until a validated client path exists ---------
  return {
    ok: false,
    source: "tencent",
    error:
      "Real index quote mode requires a validated backend API/MCP client path.",
    error_code: "real_mode_not_wired",
  };
}
