// ---------------------------------------------------------------------------
// WatchlistSection component tests.
// Uses only placeholder codes: 000000.SH, 000000.SZ, MOCK, TEST.
// No real stock codes.  No network.
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { WatchlistSection } from "../WatchlistSection";
import { loadWatchlistData } from "@/lib/watchlist/watchlistStorage";
import type { WatchlistData } from "@/lib/watchlist/watchlistTypes";

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

const mockLoadWatchlistQuotes = vi.fn();

vi.mock("@/lib/watchlist/watchlistService", () => ({
  loadWatchlistQuotes: (...args: unknown[]) => mockLoadWatchlistQuotes(...args),
}));

function emptyData(): WatchlistData {
  return { version: 1, updatedAt: new Date().toISOString(), items: [] };
}

/** Render a single section.  Returns a user instance and helpers. */
function renderSection(market: "a" | "us", initial?: WatchlistData) {
  const user = userEvent.setup();
  let current = initial ?? emptyData();
  const title = market === "a" ? "A-Share Watchlist" : "US Stock Watchlist";

  const onChange = vi.fn((d: WatchlistData) => {
    current = d;
    // Re-render with updated data so the component sees the change.
    rr(
      <I18nextProvider i18n={i18n}>
        <WatchlistSection market={market} title={title} data={current} onChange={onChange} />
      </I18nextProvider>,
    );
  });

  const { rerender: rr } = render(
    <I18nextProvider i18n={i18n}>
      <WatchlistSection market={market} title={title} data={current} onChange={onChange} />
    </I18nextProvider>,
  );

  return { user, onChange, getData: () => current };
}

/** Render both A-share and US sections sharing one data object. */
function renderBoth(initial?: WatchlistData) {
  const user = userEvent.setup();
  let current = initial ?? emptyData();

  const onChange = vi.fn((d: WatchlistData) => {
    current = d;
    rr(
      <I18nextProvider i18n={i18n}>
        <WatchlistSection market="a" title="A-Share Watchlist" data={current} onChange={onChange} />
        <WatchlistSection market="us" title="US Stock Watchlist" data={current} onChange={onChange} />
      </I18nextProvider>,
    );
  });

  const { rerender: rr } = render(
    <I18nextProvider i18n={i18n}>
      <WatchlistSection market="a" title="A-Share Watchlist" data={current} onChange={onChange} />
      <WatchlistSection market="us" title="US Stock Watchlist" data={current} onChange={onChange} />
    </I18nextProvider>,
  );

  return { user, onChange, getData: () => current };
}

/** Click the first Add button, type code, submit dialog. */
async function addCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getAllByRole("button", { name: "Add" })[0]);
  const placeholder = /^[A-Z]{1,5}$/.test(code) ? "e.g. MOCK" : "e.g. 000000.SH";
  await user.type(screen.getByPlaceholderText(placeholder), code);
  await user.click(screen.getByRole("button", { name: "Add to Watchlist" }));
}

/** Click the nth Add button (0-indexed among all "Add" buttons on screen). */
async function addCodeAt(user: ReturnType<typeof userEvent.setup>, code: string, buttonIndex: number) {
  await user.click(screen.getAllByRole("button", { name: "Add" })[buttonIndex]);
  const placeholder = /^[A-Z]{1,5}$/.test(code) ? "e.g. MOCK" : "e.g. 000000.SH";
  await user.type(screen.getByPlaceholderText(placeholder), code);
  await user.click(screen.getByRole("button", { name: "Add to Watchlist" }));
}

beforeEach(() => {
  localStorage.clear();
  fetchSpy.mockReset();
  mockLoadWatchlistQuotes.mockReset();
  // Default: return idle for all codes so existing tests don't break
  mockLoadWatchlistQuotes.mockImplementation(async (codes: string[]) => {
    const map = new Map();
    for (const c of codes) map.set(c, { kind: "idle" });
    return map;
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("WatchlistSection empty state", () => {
  it("renders title and empty state", () => {
    renderSection("a");
    expect(screen.getByText("A-Share Watchlist")).toBeInTheDocument();
    expect(screen.getByText("No watchlist entries")).toBeInTheDocument();
  });

  it("renders Add button enabled", () => {
    renderSection("a");
    const btn = screen.getByRole("button", { name: "Add" });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("does NOT trigger global fetch on initial render", () => {
    renderSection("a");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Add flow
// ---------------------------------------------------------------------------

describe("WatchlistSection add flow", () => {
  it("adds a valid A-share code and shows it in the list", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    expect(screen.getByText("000000.SH")).toBeInTheDocument();
    expect(h.onChange).toHaveBeenCalledTimes(1);
  });

  it("adding does NOT trigger global fetch", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SZ");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows quote idle state for added entry", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    expect(screen.getByText("Not loaded")).toBeInTheDocument();
  });

  it("persists to localStorage after add", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    const saved = loadWatchlistData();
    expect(saved.items.some((e) => e.code === "000000.SH")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("WatchlistSection validation", () => {
  it("rejects empty code", async () => {
    const h = renderSection("a");
    await h.user.click(screen.getByRole("button", { name: "Add" }));
    await h.user.click(screen.getByRole("button", { name: "Add to Watchlist" }));
    expect(screen.getByText("Code is required")).toBeInTheDocument();
  });

  it("rejects invalid A-share format", async () => {
    const h = renderSection("a");
    await h.user.click(screen.getByRole("button", { name: "Add" }));
    await h.user.type(screen.getByPlaceholderText("e.g. 000000.SH"), "BADCODE");
    await h.user.click(screen.getByRole("button", { name: "Add to Watchlist" }));
    expect(screen.getByText("Invalid code format")).toBeInTheDocument();
  });

  it("rejects invalid US stock format", async () => {
    const h = renderSection("us");
    await h.user.click(screen.getByRole("button", { name: "Add" }));
    await h.user.type(screen.getByPlaceholderText("e.g. MOCK"), "toolong");
    await h.user.click(screen.getByRole("button", { name: "Add to Watchlist" }));
    expect(screen.getByText("Invalid code format")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

describe("WatchlistSection remove", () => {
  it("removes an entry", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    expect(screen.getByText("000000.SH")).toBeInTheDocument();

    await h.user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("000000.SH")).not.toBeInTheDocument();
    expect(screen.getByText("No watchlist entries")).toBeInTheDocument();
  });

  it("remove does NOT trigger global fetch", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    fetchSpy.mockClear();

    await h.user.click(screen.getByRole("button", { name: "Remove" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("removes from localStorage", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await h.user.click(screen.getByRole("button", { name: "Remove" }));
    const saved = loadWatchlistData();
    expect(saved.items.some((e) => e.code === "000000.SH")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Market isolation (cross-section)
// ---------------------------------------------------------------------------

describe("WatchlistSection market isolation", () => {
  it("000000.SH appears only in A-share section, not US", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    const occurrences = screen.getAllByText("000000.SH");
    expect(occurrences).toHaveLength(1);
  });

  it("MOCK appears only in US section, not A-share", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "MOCK", 1);
    const occurrences = screen.getAllByText("MOCK");
    expect(occurrences).toHaveLength(1);
  });

  it("both A-share and US entries coexist in localStorage", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    await addCodeAt(h.user, "MOCK", 1);

    const saved = loadWatchlistData();
    expect(saved.items.some((e) => e.code === "000000.SH")).toBe(true);
    expect(saved.items.some((e) => e.code === "MOCK")).toBe(true);
    expect(saved.items).toHaveLength(2);
  });

  it("deleting A-share entry does not delete US entry", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    await addCodeAt(h.user, "MOCK", 1);

    // Two Remove buttons, one per section. A-share comes first.
    const removeBtns = screen.getAllByRole("button", { name: "Remove" });
    expect(removeBtns).toHaveLength(2);
    await h.user.click(removeBtns[0]);

    // US entry still present.
    expect(screen.getByText("MOCK")).toBeInTheDocument();
    expect(screen.queryByText("000000.SH")).not.toBeInTheDocument();

    const saved = loadWatchlistData();
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].code).toBe("MOCK");
  });

  it("adding via A-share section updates shared state", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    expect(h.onChange).toHaveBeenCalled();
    const updated = h.onChange.mock.calls[0][0] as WatchlistData;
    expect(updated.items.some((e) => e.code === "000000.SH")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// US stock notice
// ---------------------------------------------------------------------------

describe("WatchlistSection US stock", () => {
  it("shows US not supported notice", () => {
    renderSection("us");
    expect(screen.getByText("US stock quotes not yet available")).toBeInTheDocument();
  });

  it("does NOT show US notice for A-share section", () => {
    renderSection("a");
    expect(screen.queryByText("US stock quotes not yet available")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

describe("WatchlistSection safety", () => {
  it("does NOT contain real A-share stock code patterns", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    // Only placeholder 000000.SH/000000.SZ allowed; no real 6-digit codes.
    expect(document.body.textContent).not.toMatch(/[1-9]\d{5}\.(SH|SZ|BJ)/);
  });

  it("does NOT reference /api/stocks/quote", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    expect(document.body.textContent).not.toMatch(/\/api\/stocks\/quote/);
  });

  it("does NOT reference /api/reports/research", () => {
    renderBoth();
    expect(document.body.textContent).not.toMatch(/\/api\/reports\/research/);
  });

  it("does NOT reference /mcp", () => {
    renderBoth();
    expect(document.body.textContent).not.toMatch(/\/mcp/);
  });

  it("never calls fetch during add or remove lifecycle", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    const removeBtns = screen.getAllByRole("button", { name: "Remove" });
    await h.user.click(removeBtns[0]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Quote fetching — Load Quotes button
// ---------------------------------------------------------------------------

describe("WatchlistSection Load Quotes button", () => {
  it("shows Load Quotes button for A-share section with items", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    expect(screen.getByRole("button", { name: "Load Quotes" })).toBeInTheDocument();
  });

  it("does NOT show Load Quotes button when empty", () => {
    renderSection("a");
    expect(screen.queryByRole("button", { name: "Load Quotes" })).not.toBeInTheDocument();
  });

  it("does NOT show Load Quotes button for US section even with items", async () => {
    const h = renderSection("us");
    await addCode(h.user, "MOCK");
    expect(screen.queryByRole("button", { name: "Load Quotes" })).not.toBeInTheDocument();
  });

  it("disables Load Quotes button while loading", async () => {
    mockLoadWatchlistQuotes.mockImplementation(
      () => new Promise(() => {}),
    );
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Load Quotes" }));

    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });

  it("clicking Load Quotes calls service with correct codes", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");

    await h.user.click(screen.getByRole("button", { name: "Load Quotes" }));

    expect(mockLoadWatchlistQuotes).toHaveBeenCalledTimes(1);
    const codes = mockLoadWatchlistQuotes.mock.calls[0][0] as string[];
    expect(codes).toContain("000000.SH");
    expect(codes).toContain("000000.SZ");
    expect(mockLoadWatchlistQuotes.mock.calls[0][1]).toEqual({ mode: "real" });
  });
});

// ---------------------------------------------------------------------------
// Quote state rendering
// ---------------------------------------------------------------------------

describe("WatchlistSection quote state rendering", () => {
  it("renders idle quote state by default", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    expect(screen.getByText("Not loaded")).toBeInTheDocument();
  });

  it("renders loaded quote with price and change", async () => {
    mockLoadWatchlistQuotes.mockResolvedValueOnce(
      new Map([
        [
          "000000.SH",
          {
            kind: "loaded",
            data: {
              name: "Test Corp",
              price: 100.5,
              prev_close: null,
              open: null,
              high: null,
              low: null,
              change_pct: 2.35,
              pe_ttm: null,
              pb: null,
            },
          },
        ],
      ]),
    );
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Load Quotes" }));

    expect(screen.getByText("100.50")).toBeInTheDocument();
    expect(screen.getByText("+2.35%")).toBeInTheDocument();
    expect(screen.getByText("Test Corp")).toBeInTheDocument();
  });

  it("renders not_reviewed state as 'Pending review'", async () => {
    mockLoadWatchlistQuotes.mockResolvedValueOnce(
      new Map([["000000.SH", { kind: "not_reviewed" }]]),
    );
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Load Quotes" }));

    expect(screen.getByText("Pending review")).toBeInTheDocument();
  });

  it("renders error state with message", async () => {
    mockLoadWatchlistQuotes.mockResolvedValueOnce(
      new Map([["000000.SH", { kind: "error", message: "Network failure" }]]),
    );
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Load Quotes" }));

    expect(screen.getByText("Network failure")).toBeInTheDocument();
  });

  it("renders negative change in red", async () => {
    mockLoadWatchlistQuotes.mockResolvedValueOnce(
      new Map([
        [
          "000000.SH",
          {
            kind: "loaded",
            data: {
              name: "Test Corp",
              price: 95.0,
              prev_close: null,
              open: null,
              high: null,
              low: null,
              change_pct: -3.5,
              pe_ttm: null,
              pb: null,
            },
          },
        ],
      ]),
    );
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Load Quotes" }));

    expect(screen.getByText("-3.50%")).toBeInTheDocument();
  });

  it("does NOT change quote state on add or remove", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    expect(screen.getByText("Not loaded")).toBeInTheDocument();
    await addCode(h.user, "000000.SZ");
    const idleElements = screen.getAllByText("Not loaded");
    expect(idleElements).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Safety (quote fetching)
// ---------------------------------------------------------------------------

describe("WatchlistSection quote safety", () => {
  it("does NOT trigger /api/reports/research", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await h.user.click(screen.getByRole("button", { name: "Load Quotes" }));
    expect(document.body.textContent).not.toMatch(/\/api\/reports\/research/);
  });

  it("does NOT reference /mcp in rendered content", () => {
    renderSection("a");
    expect(document.body.textContent).not.toMatch(/\/mcp/);
  });

  it("does NOT contain real A-share stock codes in rendered content", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    // Only placeholder 000000.SH/000000.SZ allowed; no real 6-digit codes.
    expect(document.body.textContent).not.toMatch(/[1-9]\d{5}\.(SH|SZ|BJ)/);
  });

  it("US section has no Load Quotes button and never calls service", async () => {
    const h = renderSection("us");
    await addCode(h.user, "MOCK");
    expect(screen.queryByRole("button", { name: "Load Quotes" })).not.toBeInTheDocument();
    expect(mockLoadWatchlistQuotes).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Notes editing
// ---------------------------------------------------------------------------

describe("WatchlistSection notes editing", () => {
  it("shows '—' when entry has no notes", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    const editBtn = screen.getByRole("button", { name: "Edit notes" });
    expect(editBtn.textContent).toBe("—");
  });

  it("clicking notes cell opens inline input", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Edit notes" }));

    expect(screen.getByRole("textbox", { name: "Notes (optional)" })).toBeInTheDocument();
  });

  it("saves notes on Enter and displays saved text", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Edit notes" }));
    const input = screen.getByRole("textbox", { name: "Notes (optional)" });
    await h.user.clear(input);
    await h.user.type(input, "My note");
    await h.user.keyboard("{Enter}");

    expect(screen.getByText("My note")).toBeInTheDocument();
  });

  it("saves notes on blur", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Edit notes" }));
    const input = screen.getByRole("textbox", { name: "Notes (optional)" });
    await h.user.clear(input);
    await h.user.type(input, "Blur save");
    await h.user.tab();

    expect(screen.getByText("Blur save")).toBeInTheDocument();
  });

  it("cancels notes edit on Escape", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Edit notes" }));
    const input = screen.getByRole("textbox", { name: "Notes (optional)" });
    await h.user.clear(input);
    await h.user.type(input, "Discard");
    await h.user.keyboard("{Escape}");

    // Input should be gone, original "—" restored in the Edit notes button
    expect(screen.queryByRole("textbox", { name: "Notes (optional)" })).not.toBeInTheDocument();
    const editBtn = screen.getByRole("button", { name: "Edit notes" });
    expect(editBtn.textContent).toBe("—");
  });

  it("persists notes to localStorage after edit", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");

    await h.user.click(screen.getByRole("button", { name: "Edit notes" }));
    const input = screen.getByRole("textbox", { name: "Notes (optional)" });
    await h.user.clear(input);
    await h.user.type(input, "Persisted");
    await h.user.keyboard("{Enter}");

    const saved = loadWatchlistData();
    const entry = saved.items.find((e) => e.code === "000000.SH");
    expect(entry?.notes).toBe("Persisted");
  });
});

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

describe("WatchlistSection reorder", () => {
  it("shows Move up and Move down buttons when items exist", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");

    expect(screen.getAllByRole("button", { name: "Move up" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: "Move down" }).length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT show reorder buttons when empty", () => {
    renderSection("a");
    expect(screen.queryByRole("button", { name: "Move up" })).not.toBeInTheDocument();
  });

  it("first item has Move up disabled", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");

    const upButtons = screen.getAllByRole("button", { name: "Move up" });
    expect(upButtons[0]).toBeDisabled();
    expect(upButtons[1]).not.toBeDisabled();
  });

  it("last item has Move down disabled", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");

    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    expect(downButtons[0]).not.toBeDisabled();
    expect(downButtons[1]).toBeDisabled();
  });

  it("moving item down changes localStorage order", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");

    // Click Move down on the first item
    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    await h.user.click(downButtons[0]);

    const saved = loadWatchlistData();
    const aShareItems = saved.items.filter((e) => e.market === "a").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(aShareItems[0].code).toBe("000000.SZ");
    expect(aShareItems[1].code).toBe("000000.SH");
  });

  it("moving item up changes localStorage order", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");

    // Click Move up on the second item
    const upButtons = screen.getAllByRole("button", { name: "Move up" });
    await h.user.click(upButtons[1]);

    const saved = loadWatchlistData();
    const aShareItems = saved.items.filter((e) => e.market === "a").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(aShareItems[0].code).toBe("000000.SZ");
    expect(aShareItems[1].code).toBe("000000.SH");
  });

  it("reorder does NOT trigger global fetch", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");
    fetchSpy.mockClear();

    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    await h.user.click(downButtons[0]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reorder only affects same-market items (US items unchanged)", async () => {
    const h = renderBoth();
    await addCodeAt(h.user, "000000.SH", 0);
    await addCodeAt(h.user, "000000.SZ", 0);
    await addCodeAt(h.user, "MOCK", 1);

    // Move down the first A-share item
    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    await h.user.click(downButtons[0]);

    const saved = loadWatchlistData();
    const usItem = saved.items.find((e) => e.code === "MOCK");
    expect(usItem).toBeDefined();
    // A-share order should be swapped
    const aShareItems = saved.items.filter((e) => e.market === "a").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(aShareItems[0].code).toBe("000000.SZ");
    expect(aShareItems[1].code).toBe("000000.SH");
  });
});

// ---------------------------------------------------------------------------
// Delete stability
// ---------------------------------------------------------------------------

describe("WatchlistSection delete stability", () => {
  it("remaining items keep order after delete", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");
    await addCode(h.user, "000000.SH"); // same code, different entry

    // Remove the middle item
    const removeBtns = screen.getAllByRole("button", { name: "Remove" });
    await h.user.click(removeBtns[1]);

    const saved = loadWatchlistData();
    const aShareItems = saved.items.filter((e) => e.market === "a").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(aShareItems).toHaveLength(2);
    // First and last remain in order
    const codes = aShareItems.map((e) => e.code);
    expect(codes).toEqual(["000000.SH", "000000.SH"]);
  });

  it("reorder state survives add after delete", async () => {
    const h = renderSection("a");
    await addCode(h.user, "000000.SH");
    await addCode(h.user, "000000.SZ");

    // Move 000000.SZ to top
    const upButtons = screen.getAllByRole("button", { name: "Move up" });
    await h.user.click(upButtons[1]);

    // Delete the top item
    const removeBtns = screen.getAllByRole("button", { name: "Remove" });
    await h.user.click(removeBtns[0]);

    // Add new item — should work without error
    await addCode(h.user, "000000.SH");

    const saved = loadWatchlistData();
    expect(saved.items.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// US section — local management
// ---------------------------------------------------------------------------

describe("WatchlistSection US local management", () => {
  it("US section has Edit notes button", async () => {
    const h = renderSection("us");
    await addCode(h.user, "MOCK");
    expect(screen.getByRole("button", { name: "Edit notes" })).toBeInTheDocument();
  });

  it("US section can edit notes", async () => {
    const h = renderSection("us");
    await addCode(h.user, "MOCK");

    await h.user.click(screen.getByRole("button", { name: "Edit notes" }));
    const input = screen.getByRole("textbox", { name: "Notes (optional)" });
    await h.user.clear(input);
    await h.user.type(input, "US note");
    await h.user.keyboard("{Enter}");

    expect(screen.getByText("US note")).toBeInTheDocument();
  });

  it("US section has Move up and Move down buttons", async () => {
    const h = renderSection("us");
    await addCode(h.user, "MOCK");
    await addCode(h.user, "TEST");

    expect(screen.getAllByRole("button", { name: "Move up" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: "Move down" }).length).toBeGreaterThanOrEqual(1);
  });

  it("US section can reorder", async () => {
    const h = renderSection("us");
    await addCode(h.user, "MOCK");
    await addCode(h.user, "TEST");

    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    await h.user.click(downButtons[0]);

    const saved = loadWatchlistData();
    const usItems = saved.items.filter((e) => e.market === "us").sort((a, b) => a.sortOrder - b.sortOrder);
    expect(usItems[0].code).toBe("TEST");
    expect(usItems[1].code).toBe("MOCK");
  });

  it("US section still has no Load Quotes button", async () => {
    const h = renderSection("us");
    await addCode(h.user, "MOCK");
    expect(screen.queryByRole("button", { name: "Load Quotes" })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interleaved reorder (A / US / A / US global order)
// ---------------------------------------------------------------------------

describe("WatchlistSection interleaved reorder", () => {
  /** Build interleaved data by adding via both sections in alternating order. */
  async function buildInterleaved(user: ReturnType<typeof userEvent.setup>) {
    // A-share first
    await addCodeAt(user, "000000.SH", 0);
    // US
    await addCodeAt(user, "MOCK", 1);
    // A-share second
    await addCodeAt(user, "000000.SZ", 0);
    // US second
    await addCodeAt(user, "TEST", 1);
  }

  it("A-share move down works even with US entries interleaved", async () => {
    const h = renderBoth();
    await buildInterleaved(h.user);

    // Verify initial data has 4 entries
    const initial = loadWatchlistData();
    expect(initial.items).toHaveLength(4);

    // Click Move down on the first A-share row (000000.SH)
    // In the A-share section, 000000.SH is first, 000000.SZ is second
    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    // There are 4 Move down buttons total: 2 in A-share section, 2 in US section
    // First Move down belongs to the first A-share item (000000.SH)
    await h.user.click(downButtons[0]);

    // After move down: A-share order should be [000000.SZ, 000000.SH]
    const saved = loadWatchlistData();
    const aItems = saved.items
      .filter((e) => e.market === "a")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(aItems[0].code).toBe("000000.SZ");
    expect(aItems[1].code).toBe("000000.SH");

    // US items should still exist and keep relative order
    const usItems = saved.items
      .filter((e) => e.market === "us")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(usItems[0].code).toBe("MOCK");
    expect(usItems[1].code).toBe("TEST");
  });

  it("US move works even with A-share entries interleaved", async () => {
    const h = renderBoth();
    await buildInterleaved(h.user);

    // Click Move down on the first US row (MOCK)
    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    // A-share section has 2 Move down buttons, US section has 2
    // Index 2 = first US Move down
    await h.user.click(downButtons[2]);

    const saved = loadWatchlistData();
    // US order should be [TEST, MOCK]
    const usItems = saved.items
      .filter((e) => e.market === "us")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(usItems[0].code).toBe("TEST");
    expect(usItems[1].code).toBe("MOCK");

    // A-share items should keep relative order
    const aItems = saved.items
      .filter((e) => e.market === "a")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(aItems[0].code).toBe("000000.SH");
    expect(aItems[1].code).toBe("000000.SZ");
  });

  it("interleaved reorder does NOT trigger fetch", async () => {
    const h = renderBoth();
    await buildInterleaved(h.user);
    fetchSpy.mockClear();

    const downButtons = screen.getAllByRole("button", { name: "Move down" });
    await h.user.click(downButtons[0]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
