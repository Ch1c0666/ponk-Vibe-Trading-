// ---------------------------------------------------------------------------
// Watchlist backup — pure local JSON export / import.
// No network, no backend, no provider.
// ---------------------------------------------------------------------------

import type { WatchlistData, WatchlistEntry } from "./watchlistTypes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = "vibe-trading-watchlist-backup";
export const BACKUP_VERSION = 1;
const MAX_NOTES_LENGTH = 500;
const A_SHARE_RE = /^\d{6}\.(SH|SZ|BJ)$/;
const US_STOCK_RE = /^[A-Z]{1,5}$/;

export interface BackupContainer {
  format: string;
  version: number;
  exportedAt: string;
  data: WatchlistData;
}

export type BackupParseResult =
  | { ok: true; data: WatchlistData }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Serialise watchlist data to a JSON string suitable for file download.
 * The output is a BackupContainer with format / version / exportedAt / data.
 */
export function exportWatchlistBackup(data: WatchlistData): string {
  const container: BackupContainer = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      version: data.version,
      updatedAt: data.updatedAt,
      items: data.items.map((entry) => ({
        id: entry.id,
        market: entry.market,
        code: entry.code,
        addedAt: entry.addedAt,
        sortOrder: entry.sortOrder,
        ...(entry.notes ? { notes: entry.notes } : {}),
      })),
    },
  };
  return JSON.stringify(container, null, 2);
}

// ---------------------------------------------------------------------------
// Import / parse
// ---------------------------------------------------------------------------

/**
 * Parse a watchlist backup JSON string.
 *
 * Validates container format, version, item structure, code format, and
 * notes length.  Returns `{ ok: true, data }` on success or
 * `{ ok: false, error }` with a human-readable message on failure.
 *
 * This function does NOT write to localStorage — the caller is responsible
 * for persisting the returned data.
 */
export function parseWatchlistBackup(json: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Invalid backup format" };
  }

  const container = parsed as Record<string, unknown>;

  if (container.format !== BACKUP_FORMAT || container.version !== BACKUP_VERSION) {
    return { ok: false, error: "Unsupported backup version" };
  }

  const data = container.data as Record<string, unknown> | undefined;
  if (!data || !Array.isArray(data.items)) {
    return { ok: false, error: "Missing or invalid items array" };
  }

  const items: WatchlistEntry[] = [];
  for (const raw of data.items) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Invalid item in backup" };
    }
    const entry = raw as Record<string, unknown>;

    // Required fields
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      return { ok: false, error: "Item missing id" };
    }
    if (entry.market !== "a" && entry.market !== "us") {
      return { ok: false, error: `Invalid market: ${entry.market}` };
    }
    if (typeof entry.code !== "string" || entry.code.length === 0) {
      return { ok: false, error: "Item missing code" };
    }
    if (typeof entry.addedAt !== "string") {
      return { ok: false, error: "Item missing addedAt" };
    }
    if (typeof entry.sortOrder !== "number") {
      return { ok: false, error: "Item missing sortOrder" };
    }

    // Code format validation
    const market = entry.market as "a" | "us";
    if (market === "a") {
      if (!A_SHARE_RE.test(entry.code)) {
        return { ok: false, error: `Invalid A-share code: ${entry.code}` };
      }
    } else {
      if (!US_STOCK_RE.test(entry.code)) {
        return { ok: false, error: `Invalid US code: ${entry.code}` };
      }
    }

    // Notes length
    if (
      typeof entry.notes === "string" &&
      entry.notes.length > MAX_NOTES_LENGTH
    ) {
      return { ok: false, error: "Notes exceed maximum length" };
    }

    items.push({
      id: entry.id,
      market,
      code: entry.code,
      addedAt: entry.addedAt,
      sortOrder: entry.sortOrder,
      ...(typeof entry.notes === "string" && entry.notes.length > 0
        ? { notes: entry.notes }
        : {}),
    });
  }

  return {
    ok: true,
    data: {
      version: 1,
      updatedAt: new Date().toISOString(),
      items,
    },
  };
}

/**
 * Generate a download file name for the watchlist backup.
 */
export function backupFileName(): string {
  return `vibe-trading-watchlist-v1.json`;
}

/**
 * Trigger a browser file download for the given JSON string.
 * Creates an invisible anchor, clicks it, and cleans up.
 */
export function triggerBackupDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
