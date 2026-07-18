// ---------------------------------------------------------------------------
// Watchlist data model — types only, no side effects.
// ---------------------------------------------------------------------------

import type { StockQuoteData } from "@/lib/reviewedCodes/stockQuoteService";

// ---------------------------------------------------------------------------
// Persisted data
// ---------------------------------------------------------------------------

export interface WatchlistEntry {
  /** Unique ID generated at add time via crypto.randomUUID(). */
  id: string;
  /** Market identifier. */
  market: "a" | "us";
  /** Stock code. A-share: \d{6}\.(SH|SZ|BJ), US: [A-Z]{1,5}. */
  code: string;
  /** ISO-8601 timestamp when the user added this entry. */
  addedAt: string;
  /** Manual sort position (lower = earlier). Use fractional midpoints on insert. */
  sortOrder: number;
  /** Optional user note, max 500 characters. */
  notes?: string;
}

export interface WatchlistData {
  /** Schema version — currently 1. */
  version: 1;
  /** ISO-8601 timestamp of the last modification. */
  updatedAt: string;
  /** All watchlist entries in display order. */
  items: WatchlistEntry[];
}

// ---------------------------------------------------------------------------
// Runtime quote state (not persisted)
// ---------------------------------------------------------------------------

export type WatchlistQuoteState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; data: StockQuoteData }
  | { kind: "not_reviewed" }
  | { kind: "error"; message: string };

export interface WatchlistRow {
  entry: WatchlistEntry;
  quote: WatchlistQuoteState;
}

// ---------------------------------------------------------------------------
// Aggregate view
// ---------------------------------------------------------------------------

export type WatchlistView =
  | { kind: "empty"; items: [] }
  | { kind: "ready"; items: WatchlistRow[] }
  | { kind: "partial"; items: WatchlistRow[]; failed: number };
