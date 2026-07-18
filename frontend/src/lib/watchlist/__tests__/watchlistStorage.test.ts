// ---------------------------------------------------------------------------
// Watchlist localStorage adapter tests.
// Uses only placeholder codes: 000000.SH, 000000.SZ, MOCK, TEST.
// No real stock codes.  No network.
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  loadWatchlistData,
  saveWatchlistData,
  addWatchlistEntry,
  removeWatchlistEntry,
  updateWatchlistNotes,
  reorderWatchlistEntries,
} from "../watchlistStorage";
import type { WatchlistData } from "../watchlistTypes";

const STORAGE_KEY = "vibe-trading:watchlist:v1";
const QUARANTINE_KEY = "vibe-trading:watchlist:v1:quarantine";

function fakeEntry(overrides?: Partial<{ id: string; market: "a" | "us"; code: string; sortOrder: number; notes: string }>) {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    market: overrides?.market ?? "a",
    code: overrides?.code ?? "000000.SH",
    addedAt: "2026-07-18T00:00:00.000Z",
    sortOrder: overrides?.sortOrder ?? 0,
    ...(overrides?.notes !== undefined ? { notes: overrides.notes } : {}),
  };
}

function fakeData(items: ReturnType<typeof fakeEntry>[]): WatchlistData {
  return {
    version: 1,
    updatedAt: "2026-07-18T00:00:00.000Z",
    items,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// loadWatchlistData
// ---------------------------------------------------------------------------

describe("loadWatchlistData", () => {
  it("returns empty watchlist when localStorage is empty", () => {
    const data = loadWatchlistData();
    expect(data.version).toBe(1);
    expect(data.items).toEqual([]);
  });

  it("returns parsed data when localStorage has valid JSON", () => {
    const saved: WatchlistData = {
      version: 1,
      updatedAt: "2026-07-18T00:00:00.000Z",
      items: [
        { id: "id-1", market: "a", code: "000000.SH", addedAt: "2026-07-18T00:00:00.000Z", sortOrder: 0 },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    const data = loadWatchlistData();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].code).toBe("000000.SH");
  });

  it("returns empty list on corrupted JSON — original key preserved", () => {
    const badRaw = "{not valid json!!!!";
    localStorage.setItem(STORAGE_KEY, badRaw);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const data = loadWatchlistData();
    expect(data.items).toEqual([]);

    // Original key NOT overwritten.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(badRaw);

    // Quarantine key has bad data.
    expect(localStorage.getItem(QUARANTINE_KEY)).toBe(badRaw);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Corrupted data"),
    );

    warnSpy.mockRestore();
  });

  it("returns empty list on wrong shape — quarantines", () => {
    const badRaw = "null";
    localStorage.setItem(STORAGE_KEY, badRaw);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const data = loadWatchlistData();
    expect(data.items).toEqual([]);

    // Quarantine key has bad data.
    expect(localStorage.getItem(QUARANTINE_KEY)).toBe(badRaw);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// saveWatchlistData
// ---------------------------------------------------------------------------

describe("saveWatchlistData", () => {
  it("persists watchlist to localStorage", () => {
    const data = fakeData([fakeEntry({ code: "000000.SZ" })]);
    saveWatchlistData(data);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.items[0].code).toBe("000000.SZ");
  });

  it("updates the updatedAt timestamp", () => {
    const data = fakeData([]);
    saveWatchlistData(data);

    const raw = localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw);
    expect(parsed.updatedAt).not.toBe(data.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// addWatchlistEntry
// ---------------------------------------------------------------------------

describe("addWatchlistEntry", () => {
  it("adds a valid A-share entry", () => {
    const data = fakeData([]);
    const result = addWatchlistEntry(data, "a", "000000.SH");

    expect(result.data.items).toHaveLength(1);
    expect(result.entry.code).toBe("000000.SH");
    expect(result.entry.market).toBe("a");
    expect(result.entry.id).toBeTruthy();
    expect(result.entry.sortOrder).toBe(0);
  });

  it("adds a valid US stock entry", () => {
    const data = fakeData([]);
    const result = addWatchlistEntry(data, "us", "MOCK");

    expect(result.data.items).toHaveLength(1);
    expect(result.entry.code).toBe("MOCK");
    expect(result.entry.market).toBe("us");
  });

  it("adds entry with notes", () => {
    const data = fakeData([]);
    const result = addWatchlistEntry(data, "a", "000000.SH", "test note");

    expect(result.entry.notes).toBe("test note");
  });

  it("rejects invalid A-share format", () => {
    const data = fakeData([]);
    expect(() => addWatchlistEntry(data, "a", "BADCODE")).toThrow("Invalid A-share code format");
    expect(() => addWatchlistEntry(data, "a", "000000")).toThrow("Invalid A-share code format");
    expect(() => addWatchlistEntry(data, "a", "000000.XH")).toThrow("Invalid A-share code format");
  });

  it("rejects invalid US stock format", () => {
    const data = fakeData([]);
    expect(() => addWatchlistEntry(data, "us", "toolong")).toThrow("Invalid US stock code format");
    expect(() => addWatchlistEntry(data, "us", "abc")).toThrow("Invalid US stock code format");
    expect(() => addWatchlistEntry(data, "us", "A1")).toThrow("Invalid US stock code format");
  });

  it("rejects notes over 500 characters", () => {
    const data = fakeData([]);
    const longNotes = "x".repeat(501);
    expect(() => addWatchlistEntry(data, "a", "000000.SH", longNotes)).toThrow("Notes exceed maximum length");
  });

  it("accepts notes exactly at 500 characters", () => {
    const data = fakeData([]);
    const notes = "x".repeat(500);
    const result = addWatchlistEntry(data, "a", "000000.SH", notes);
    expect(result.entry.notes).toHaveLength(500);
  });

  it("increments sortOrder for subsequent entries", () => {
    let data = fakeData([]);
    const r1 = addWatchlistEntry(data, "a", "000000.SH");
    data = r1.data;
    const r2 = addWatchlistEntry(data, "a", "000000.SZ");

    expect(r1.entry.sortOrder).toBe(0);
    expect(r2.entry.sortOrder).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeWatchlistEntry
// ---------------------------------------------------------------------------

describe("removeWatchlistEntry", () => {
  it("removes an entry by ID", () => {
    const entry = fakeEntry({ id: "id-1", code: "000000.SH" });
    const data = fakeData([entry]);

    const updated = removeWatchlistEntry(data, "id-1");
    expect(updated.items).toHaveLength(0);
  });

  it("no-ops when ID is not found", () => {
    const entry = fakeEntry({ id: "id-1", code: "000000.SH" });
    const data = fakeData([entry]);

    const updated = removeWatchlistEntry(data, "nonexistent");
    expect(updated.items).toHaveLength(1);
    // Returns the same object reference when nothing changes.
    expect(updated).toBe(data);
  });
});

// ---------------------------------------------------------------------------
// updateWatchlistNotes
// ---------------------------------------------------------------------------

describe("updateWatchlistNotes", () => {
  it("updates notes for an existing entry", () => {
    const entry = fakeEntry({ id: "id-1", code: "000000.SH" });
    const data = fakeData([entry]);

    const updated = updateWatchlistNotes(data, "id-1", "new note");
    expect(updated.items[0].notes).toBe("new note");
  });

  it("clears notes when empty string is provided", () => {
    const entry = fakeEntry({ id: "id-1", code: "000000.SH", notes: "old" });
    const data = fakeData([entry]);

    const updated = updateWatchlistNotes(data, "id-1", "");
    expect(updated.items[0].notes).toBeUndefined();
  });

  it("throws when entry ID is not found", () => {
    const data = fakeData([]);
    expect(() => updateWatchlistNotes(data, "nonexistent", "note")).toThrow("not found");
  });

  it("throws when notes exceed 500 characters", () => {
    const entry = fakeEntry({ id: "id-1", code: "000000.SH" });
    const data = fakeData([entry]);

    const longNotes = "x".repeat(501);
    expect(() => updateWatchlistNotes(data, "id-1", longNotes)).toThrow("Notes exceed maximum length");
  });
});

// ---------------------------------------------------------------------------
// reorderWatchlistEntries
// ---------------------------------------------------------------------------

describe("reorderWatchlistEntries", () => {
  it("reorders entries by provided ID list", () => {
    const e1 = fakeEntry({ id: "id-1", code: "000000.SH", sortOrder: 0 });
    const e2 = fakeEntry({ id: "id-2", code: "000000.SZ", sortOrder: 1 });
    const data = fakeData([e1, e2]);

    const updated = reorderWatchlistEntries(data, ["id-2", "id-1"]);
    expect(updated.items[0].id).toBe("id-2");
    expect(updated.items[0].sortOrder).toBe(0);
    expect(updated.items[1].id).toBe("id-1");
    expect(updated.items[1].sortOrder).toBe(1);
  });

  it("throws when ID count mismatches", () => {
    const e1 = fakeEntry({ id: "id-1", code: "000000.SH" });
    const data = fakeData([e1]);

    expect(() => reorderWatchlistEntries(data, [])).toThrow("ID count mismatch");
    expect(() => reorderWatchlistEntries(data, ["id-1", "id-2"])).toThrow("ID count mismatch");
  });

  it("throws when an unknown ID is provided", () => {
    const e1 = fakeEntry({ id: "id-1", code: "000000.SH" });
    const data = fakeData([e1]);

    expect(() => reorderWatchlistEntries(data, ["unknown"])).toThrow("Unknown entry ID");
  });
});
