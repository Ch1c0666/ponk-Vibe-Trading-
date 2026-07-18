// ---------------------------------------------------------------------------
// Watchlist localStorage adapter.
//
// - localStorage key: vibe-trading:watchlist:v1
// - quarantine key:    vibe-trading:watchlist:v1:quarantine
// - Add-time validation: format only, no manifest check.
// - JSON parse failure: return empty list, quarantine bad data, don't overwrite.
// ---------------------------------------------------------------------------

import type {
  WatchlistData,
  WatchlistEntry,
} from "./watchlistTypes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "vibe-trading:watchlist:v1";
const QUARANTINE_KEY = "vibe-trading:watchlist:v1:quarantine";
const MAX_NOTES_LENGTH = 500;

/** A-share: 6 digits, dot, exchange suffix. */
const A_SHARE_RE = /^\d{6}\.(SH|SZ|BJ)$/;
/** US stock: 1-5 uppercase letters. */
const US_STOCK_RE = /^[A-Z]{1,5}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyData(): WatchlistData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

function nowISO(): string {
  return new Date().toISOString();
}

function validateCode(market: "a" | "us", code: string): true | string {
  if (market === "a") {
    if (!A_SHARE_RE.test(code)) {
      return `Invalid A-share code format: expected \d{6}.(SH|SZ|BJ), got "${code}"`;
    }
  } else {
    if (!US_STOCK_RE.test(code)) {
      return `Invalid US stock code format: expected 1-5 uppercase letters, got "${code}"`;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load watchlist from localStorage.
 *
 * Returns an empty watchlist when no data exists or when the stored JSON is
 * corrupted.  Corrupted data is quarantined — the original key is NOT
 * overwritten so the user can recover it manually.
 */
export function loadWatchlistData(): WatchlistData {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage itself may throw (e.g. private browsing in some envs).
    return emptyData();
  }

  if (raw === null) {
    return emptyData();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted JSON — quarantine, don't overwrite original.
    try {
      localStorage.setItem(QUARANTINE_KEY, raw);
    } catch {
      // quarantine write failed — best effort.
    }
    console.warn(
      `[watchlist] Corrupted data in ${STORAGE_KEY} — original preserved, bad copy saved to ${QUARANTINE_KEY}`,
    );
    return emptyData();
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    !("items" in parsed)
  ) {
    // Wrong shape — quarantine same as corrupted.
    try {
      localStorage.setItem(QUARANTINE_KEY, raw);
    } catch {
      // best effort
    }
    console.warn(
      `[watchlist] Unexpected shape in ${STORAGE_KEY} — original preserved, bad copy saved to ${QUARANTINE_KEY}`,
    );
    return emptyData();
  }

  const data = parsed as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];
  const version = data.version === 1 ? 1 : 1;

  return {
    version: version as 1,
    updatedAt:
      typeof data.updatedAt === "string" ? data.updatedAt : nowISO(),
    items: items as WatchlistEntry[],
  };
}

/** Persist watchlist data to localStorage. */
export function saveWatchlistData(data: WatchlistData): void {
  const payload: WatchlistData = {
    ...data,
    updatedAt: nowISO(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Add a new entry to the watchlist.
 *
 * Only performs format validation — no manifest / code-review check.
 * Throws on invalid format or oversized notes.
 */
export function addWatchlistEntry(data: WatchlistData, market: "a" | "us", code: string, notes?: string): { data: WatchlistData; entry: WatchlistEntry } {
  // Validate code format.
  const validation = validateCode(market, code);
  if (validation !== true) {
    throw new Error(validation);
  }

  // Validate notes length.
  if (notes !== undefined && notes.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notes exceed maximum length of ${MAX_NOTES_LENGTH} characters`);
  }

  // Compute sortOrder: one more than the current max, or 0 for the first item.
  const maxOrder =
    data.items.length > 0
      ? Math.max(...data.items.map((e) => e.sortOrder))
      : -1;

  const entry: WatchlistEntry = {
    id: crypto.randomUUID(),
    market,
    code,
    addedAt: nowISO(),
    sortOrder: maxOrder + 1,
    ...(notes !== undefined && notes.length > 0 ? { notes } : {}),
  };

  const updated: WatchlistData = {
    ...data,
    updatedAt: nowISO(),
    items: [...data.items, entry],
  };

  return { data: updated, entry };
}

/** Remove an entry by ID. No-op if the ID is not found. */
export function removeWatchlistEntry(data: WatchlistData, id: string): WatchlistData {
  const filtered = data.items.filter((e) => e.id !== id);
  if (filtered.length === data.items.length) {
    return data; // no change
  }
  return {
    ...data,
    updatedAt: nowISO(),
    items: filtered,
  };
}

/** Update the notes for a specific entry. Throws on oversized notes. */
export function updateWatchlistNotes(data: WatchlistData, id: string, notes: string): WatchlistData {
  if (notes.length > MAX_NOTES_LENGTH) {
    throw new Error(`Notes exceed maximum length of ${MAX_NOTES_LENGTH} characters`);
  }

  const index = data.items.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`Entry with id "${id}" not found`);
  }

  const updatedItems = [...data.items];
  updatedItems[index] = {
    ...updatedItems[index],
    notes: notes.length > 0 ? notes : undefined,
  };

  return {
    ...data,
    updatedAt: nowISO(),
    items: updatedItems,
  };
}

/**
 * Reorder entries by providing the full ordered list of IDs.
 * Every ID in *data.items* must appear exactly once in *ids*.
 */
export function reorderWatchlistEntries(data: WatchlistData, ids: string[]): WatchlistData {
  const existingIds = new Set(data.items.map((e) => e.id));
  const requestedIds = new Set(ids);

  if (requestedIds.size !== existingIds.size) {
    throw new Error("ID count mismatch — every entry must appear exactly once");
  }
  for (const id of requestedIds) {
    if (!existingIds.has(id)) {
      throw new Error(`Unknown entry ID: "${id}"`);
    }
  }

  const lookup = new Map(data.items.map((e) => [e.id, e]));
  const reordered = ids.map((id, index) => ({
    ...lookup.get(id)!,
    sortOrder: index,
  }));

  return {
    ...data,
    updatedAt: nowISO(),
    items: reordered,
  };
}
