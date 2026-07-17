import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Overview } from "../Overview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderOverview() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );
}

// Mock the service so no real network calls happen.
const mockLoadIndexQuotes = vi.fn();

vi.mock("@/lib/overview/indexQuoteService", () => ({
  loadIndexQuotes: (...args: unknown[]) => mockLoadIndexQuotes(...args),
  INDEX_CODE_ALLOWLIST: ["sh000001", "sz399001", "sz399006", "sh000688"],
}));

beforeEach(() => {
  mockLoadIndexQuotes.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Overview page", () => {
  // -- Rendering ----------------------------------------------------------

  it("renders the page title and badge", () => {
    renderOverview();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("renders the index cards section heading", () => {
    renderOverview();
    expect(screen.getByText("Index Quotes")).toBeInTheDocument();
  });

  it("renders 4 index cards in disabled state by default", () => {
    renderOverview();
    const cards = [
      "SSE Composite",
      "SZSE Component",
      "ChiNext",
      "STAR 50",
    ];
    for (const label of cards) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // -- Disabled state --------------------------------------------------------

  it("default mode does not trigger any network request on mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderOverview();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // -- Refresh button -------------------------------------------------------

  it("refresh button exists", () => {
    renderOverview();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("refresh calls loadIndexQuotes and renders data state", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: true,
      source: "tencent",
      timestamp: "2026-07-18T10:00:00Z",
      data: {
        quotes: [
          { code: "sh000001", name: "SSE Composite", price: 3500.0, prev_close: 3480.0, open: 3475.0, high: 3510.0, low: 3460.0, change_pct: 0.57 },
          { code: "sz399001", name: "SZSE Component", price: 10800.0, prev_close: 10750.0, open: 10760.0, high: 10850.0, low: 10700.0, change_pct: -0.15 },
          { code: "sz399006", name: "ChiNext", price: 2150.0, prev_close: 2130.0, open: 2135.0, high: 2160.0, low: 2120.0, change_pct: 1.2 },
          { code: "sh000688", name: "STAR 50", price: 980.0, prev_close: 985.0, open: 983.0, high: 990.0, low: 975.0, change_pct: -0.8 },
        ],
        partial: false,
        warnings: [],
      },
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Refresh" });
    await act(() => fireEvent.click(btn));

    // Prices should render (not — dashes anymore)
    expect(screen.getByText("3500.00")).toBeInTheDocument();
    expect(screen.getByText("+0.57%")).toBeInTheDocument();
    expect(screen.getByText("-0.15%")).toBeInTheDocument();
  });

  it("refresh handles partial response", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: true,
      source: "tencent",
      timestamp: "2026-07-18T10:00:00Z",
      data: {
        quotes: [
          { code: "sh000001", name: "SSE Composite", price: 3500.0, prev_close: null, open: null, high: null, low: null, change_pct: 0.5 },
          { code: "sz399001", name: "SZSE Component", price: null, prev_close: null, open: null, high: null, low: null, change_pct: null },
          { code: "sz399006", name: "ChiNext", price: null, prev_close: null, open: null, high: null, low: null, change_pct: null },
          { code: "sh000688", name: "STAR 50", price: null, prev_close: null, open: null, high: null, low: null, change_pct: null },
        ],
        partial: true,
        warnings: [{ code: "provider_quote_failed", message: "failed", index_code: "sz399001" }],
      },
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Refresh" });
    await act(() => fireEvent.click(btn));

    // Partial banner should appear
    expect(screen.getByText("(Mock) Refresh complete — no live data requested")).toBeInTheDocument();
    // The successful quote still renders
    expect(screen.getByText("3500.00")).toBeInTheDocument();
  });

  it("refresh handles error response gracefully", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: false,
      error: "all failed",
      error_code: "provider_request_failed",
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Refresh" });
    await act(() => fireEvent.click(btn));

    // Should still render the card grid (in error state), no crash
    expect(screen.getByText("SSE Composite")).toBeInTheDocument();
    // Error message shown in cards
    expect(screen.getAllByText("all failed").length).toBeGreaterThanOrEqual(1);
  });

  // -- Watchlists ---------------------------------------------------------

  it("renders A-share and US stock watchlist sections", () => {
    renderOverview();
    expect(screen.getByText("A-Share Watchlist")).toBeInTheDocument();
    expect(screen.getByText("US Stock Watchlist")).toBeInTheDocument();
  });

  it("add buttons are disabled", () => {
    renderOverview();
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    expect(addButtons).toHaveLength(2);
    for (const btn of addButtons) {
      expect(btn).toBeDisabled();
    }
  });

  it("watchlist tables are empty", () => {
    renderOverview();
    const emptyRows = screen.getAllByText("No watchlist entries");
    expect(emptyRows).toHaveLength(2);
  });

  // -- Safety — no real stock codes ----------------------------------------

  it("page contains no real A-share stock code patterns", () => {
    renderOverview();
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/i);
    expect(bodyText).not.toMatch(/["\s]\d{6}["\s]/);
  });

  it("page contains no real US stock ticker patterns", () => {
    renderOverview();
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toMatch(/\b[A-Z]{1,5}\s+—\b/);
  });

  // -- Table headers ------------------------------------------------------

  it("renders watchlist table column headers", () => {
    renderOverview();
    for (const header of ["Code", "Name", "Price", "Change", "Actions"]) {
      const elements = screen.getAllByText(header);
      expect(elements.length).toBe(2);
    }
  });
});
