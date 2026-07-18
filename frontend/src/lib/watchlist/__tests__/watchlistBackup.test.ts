// ---------------------------------------------------------------------------
// watchlistBackup unit tests.
// Only placeholder codes: 000000.SH, 000000.SZ, MOCK, TEST.
// No real stock codes.  No network.  No env reads.
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeEach } from "vitest";
import {
  exportWatchlistBackup,
  parseWatchlistBackup,
  BACKUP_FORMAT,
  BACKUP_VERSION,
} from "../watchlistBackup";
import type { WatchlistData } from "../watchlistTypes";

function makeData(overrides?: Partial<WatchlistData>): WatchlistData {
  return {
    version: 1,
    updatedAt: "2026-07-18T10:00:00.000Z",
    items: [
      {
        id: "a1",
        market: "a" as const,
        code: "000000.SH",
        addedAt: "2026-07-18T10:00:00.000Z",
        sortOrder: 0,
      },
      {
        id: "u1",
        market: "us" as const,
        code: "MOCK",
        addedAt: "2026-07-18T10:01:00.000Z",
        sortOrder: 1,
        notes: "US note",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

describe("watchlistBackup export", () => {
  it("produces valid JSON string", () => {
    const data = makeData();
    const json = exportWatchlistBackup(data);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(typeof parsed.exportedAt).toBe("string");
  });

  it("contains version, updatedAt, and items", () => {
    const data = makeData();
    const json = exportWatchlistBackup(data);
    const parsed = JSON.parse(json);
    expect(parsed.data.version).toBe(1);
    expect(parsed.data.updatedAt).toBe("2026-07-18T10:00:00.000Z");
    expect(Array.isArray(parsed.data.items)).toBe(true);
    expect(parsed.data.items).toHaveLength(2);
  });

  it("preserves A-share and US entries", () => {
    const data = makeData();
    const json = exportWatchlistBackup(data);
    const parsed = JSON.parse(json);
    const codes = parsed.data.items.map((i: { code: string }) => i.code);
    expect(codes).toContain("000000.SH");
    expect(codes).toContain("MOCK");
  });

  it("preserves notes when present", () => {
    const data = makeData();
    const json = exportWatchlistBackup(data);
    const parsed = JSON.parse(json);
    const usItem = parsed.data.items.find((i: { code: string }) => i.code === "MOCK");
    expect(usItem.notes).toBe("US note");
  });
});

// ---------------------------------------------------------------------------
// Import — success cases
// ---------------------------------------------------------------------------

describe("watchlistBackup parse — success", () => {
  it("parses valid backup JSON and returns ok", () => {
    const data = makeData();
    const json = exportWatchlistBackup(data);
    const result = parseWatchlistBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(2);
    }
  });

  it("round-trips A-share and US entries", () => {
    const data = makeData();
    const json = exportWatchlistBackup(data);
    const result = parseWatchlistBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const codes = result.data.items.map((e) => e.code);
      expect(codes).toContain("000000.SH");
      expect(codes).toContain("MOCK");
    }
  });

  it("round-trips notes field", () => {
    const data = makeData();
    const json = exportWatchlistBackup(data);
    const result = parseWatchlistBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const usItem = result.data.items.find((e) => e.code === "MOCK");
      expect(usItem?.notes).toBe("US note");
    }
  });

  it("can round-trip empty watchlist", () => {
    const data = makeData({ items: [] });
    const json = exportWatchlistBackup(data);
    const result = parseWatchlistBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Import — failure cases
// ---------------------------------------------------------------------------

describe("watchlistBackup parse — errors", () => {
  it("rejects invalid JSON", () => {
    const result = parseWatchlistBackup("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("rejects wrong format", () => {
    const result = parseWatchlistBackup(
      JSON.stringify({ format: "wrong", version: 1, exportedAt: "t", data: { items: [] } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unsupported backup version");
    }
  });

  it("rejects missing items array", () => {
    const result = parseWatchlistBackup(
      JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: "t", data: {} }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects invalid A-share code format", () => {
    const badJson = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "t",
      data: {
        version: 1,
        updatedAt: "t",
        items: [{ id: "x", market: "a", code: "BADCODE", addedAt: "t", sortOrder: 0 }],
      },
    });
    const result = parseWatchlistBackup(badJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid A-share code");
    }
  });

  it("rejects invalid US code format", () => {
    const badJson = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "t",
      data: {
        version: 1,
        updatedAt: "t",
        items: [{ id: "x", market: "us", code: "toolong", addedAt: "t", sortOrder: 0 }],
      },
    });
    const result = parseWatchlistBackup(badJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid US code");
    }
  });

  it("rejects notes that exceed max length", () => {
    const longNotes = "x".repeat(501);
    const badJson = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "t",
      data: {
        version: 1,
        updatedAt: "t",
        items: [{ id: "x", market: "a", code: "000000.SH", addedAt: "t", sortOrder: 0, notes: longNotes }],
      },
    });
    const result = parseWatchlistBackup(badJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Notes exceed");
    }
  });

  it("rejects item missing required fields", () => {
    const badJson = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "t",
      data: {
        version: 1,
        updatedAt: "t",
        items: [{ market: "a", code: "000000.SH", addedAt: "t", sortOrder: 0 }], // missing id
      },
    });
    const result = parseWatchlistBackup(badJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("missing");
    }
  });

  it("rejects invalid market value", () => {
    const badJson = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "t",
      data: {
        version: 1,
        updatedAt: "t",
        items: [{ id: "x", market: "hk", code: "00001.HK", addedAt: "t", sortOrder: 0 }],
      },
    });
    const result = parseWatchlistBackup(badJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid market");
    }
  });

  it("does NOT write to localStorage on parse failure", () => {
    // Set existing data first
    const existing = makeData({ items: [] });
    localStorage.setItem("vibe-trading:watchlist:v1", JSON.stringify(existing));

    const result = parseWatchlistBackup("not json");
    expect(result.ok).toBe(false);

    // localStorage should be untouched
    const stored = localStorage.getItem("vibe-trading:watchlist:v1");
    expect(stored).not.toBeNull();
  });
});
