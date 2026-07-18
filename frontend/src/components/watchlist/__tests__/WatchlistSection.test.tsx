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
