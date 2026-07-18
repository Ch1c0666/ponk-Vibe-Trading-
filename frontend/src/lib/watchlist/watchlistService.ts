// ---------------------------------------------------------------------------
// Watchlist quote service — disabled / mock / real modes.
//
// - disabled: all quotes remain idle, no network.
// - mock: returns [Mock]-prefixed data for every code, no network.
// - real: fetches via GET /api/stocks/quote?code= for A-share codes only.
//   US stock codes are left idle (fail-closed).  Concurrency is capped.
//
// No environment reads.  Does not use report or MCP transports.
// ---------------------------------------------------------------------------

import { loadStockQuote } from "@/lib/reviewedCodes/stockQuoteService";
import type { StockQuoteData } from "@/lib/reviewedCodes/stockQuoteService";
import type { WatchlistQuoteState } from "./watchlistTypes";

// ---------------------------------------------------------------------------
// Service mode
// ---------------------------------------------------------------------------

export type WatchlistQuoteServiceMode = "disabled" | "mock" | "real";

export interface WatchlistQuoteServiceOptions {
  mode?: WatchlistQuoteServiceMode;
  /** Max concurrent quote requests. Default 3. */
  maxConcurrency?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const A_SHARE_RE = /^\d{6}\.(SH|SZ|BJ)$/;

function isAShare(code: string): boolean {
  return A_SHARE_RE.test(code);
}

// ---------------------------------------------------------------------------
// Mock data — every field prefixed so it cannot be mistaken for live data.
// ---------------------------------------------------------------------------

const MOCK_QUOTE_DATA: StockQuoteData = {
  name: "[Mock] Test Stock",
  price: 50.0,
  prev_close: 49.5,
  open: 49.8,
  high: 50.5,
  low: 49.0,
  change_pct: 1.01,
  pe_ttm: 20.0,
  pb: 3.0,
};

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function limitedConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  limit: number,
): Promise<void> {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await fn(items[index], index);
    }
  }

  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load watchlist quotes for a list of codes.
 *
 * - **disabled** (default): all quotes return ``{ kind: "idle" }`` — no network.
 * - **mock**: all quotes return ``{ kind: "loaded" }`` with [Mock]-prefixed data.
 * - **real**: A-share codes (``\d{6}\.(SH|SZ|BJ)``) are fetched via
 *   ``GET /api/stocks/quote?code=``.  US stock codes remain idle.
 *
 * Returns a ``Map`` from code string to ``WatchlistQuoteState``.
 */
export async function loadWatchlistQuotes(
  codes: string[],
  options?: WatchlistQuoteServiceOptions,
): Promise<Map<string, WatchlistQuoteState>> {
  const mode = options?.mode ?? "disabled";
  const maxConcurrency = Math.max(1, options?.maxConcurrency ?? 3);
  const result = new Map<string, WatchlistQuoteState>();

  // Initialize all codes as idle so callers always have an entry.
  for (const code of codes) {
    result.set(code, { kind: "idle" });
  }

  // -- disabled --------------------------------------------------------------
  if (mode === "disabled") {
    return result;
  }

  // -- mock ------------------------------------------------------------------
  if (mode === "mock") {
    for (const code of codes) {
      result.set(code, {
        kind: "loaded",
        data: { ...MOCK_QUOTE_DATA, name: `[Mock] ${code}` },
      });
    }
    return result;
  }

  // -- real — only fetch A-share codes; US codes stay idle (fail-closed) -----
  const aShareCodes = codes.filter(isAShare);
  if (aShareCodes.length === 0) {
    return result;
  }

  await limitedConcurrency(
    aShareCodes,
    async (code) => {
      try {
        const envelope = await loadStockQuote(code, { mode: "real" });

        if (!envelope.ok) {
          // 403 code_not_reviewed → not_reviewed (no price displayed)
          if (envelope.error_code === "code_not_reviewed") {
            result.set(code, { kind: "not_reviewed" });
          } else {
            result.set(code, {
              kind: "error",
              message: envelope.error ?? `HTTP error`,
            });
          }
          return;
        }

        if (envelope.data) {
          result.set(code, { kind: "loaded", data: envelope.data });
        } else {
          result.set(code, {
            kind: "error",
            message: "No data returned",
          });
        }
      } catch (err) {
        // Network / fetch / parse errors
        result.set(code, {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    maxConcurrency,
  );

  return result;
}
