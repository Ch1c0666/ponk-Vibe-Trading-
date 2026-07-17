import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Overview page", () => {
  // -- Rendering ----------------------------------------------------------

  it("renders the page title and badge", () => {
    renderOverview();
    // "Overview" appears in both badge pill and h1 heading — match the heading specifically
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
  });

  it("renders the index cards section heading", () => {
    renderOverview();
    expect(screen.getByText("Index Quotes")).toBeInTheDocument();
  });

  it("renders 4 index cards", () => {
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

  // -- Mock-only index cards ----------------------------------------------

  it("all index cards show pending placeholder value", () => {
    renderOverview();
    // Each card renders "—" for price and "Pending" for status.
    // With 4 cards × "—" price + 4 "Pending" labels.
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
    const pendingLabels = screen.getAllByText("Pending");
    expect(pendingLabels).toHaveLength(4);
  });

  it("index cards contain no numeric price values", () => {
    renderOverview();
    // The price area shows "—", never a real number like 3,000+.
    const cards = screen.getAllByText("—");
    // Sanity: no element renders a large numeric string that looks like a real index level
    const bodyText = document.body.textContent ?? "";
    // Should not contain a number ≥ 1000 with comma or decimal formatting
    expect(bodyText).not.toMatch(/\b[1-9]\d{2,}(?:[.,]\d+)?\b/);
  });

  // -- A-Share watchlist --------------------------------------------------

  it("renders A-share watchlist section", () => {
    renderOverview();
    expect(
      screen.getByText("A-Share Watchlist"),
    ).toBeInTheDocument();
  });

  it("A-share watchlist is empty", () => {
    renderOverview();
    // "No watchlist entries" appears in each watchlist table.
    const emptyRows = screen.getAllByText("No watchlist entries");
    expect(emptyRows.length).toBeGreaterThanOrEqual(1);
  });

  // -- US Stock watchlist -------------------------------------------------

  it("renders US stock watchlist section", () => {
    renderOverview();
    expect(
      screen.getByText("US Stock Watchlist"),
    ).toBeInTheDocument();
  });

  it("US stock watchlist is empty", () => {
    renderOverview();
    const emptyRows = screen.getAllByText("No watchlist entries");
    expect(emptyRows).toHaveLength(2);
  });

  // -- Add button disabled ------------------------------------------------

  it("add buttons are disabled", () => {
    renderOverview();
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    expect(addButtons).toHaveLength(2);
    for (const btn of addButtons) {
      expect(btn).toBeDisabled();
    }
  });

  // -- Refresh button -----------------------------------------------------

  it("refresh button exists and shows mock feedback on click", () => {
    renderOverview();
    const refreshBtn = screen.getByRole("button", { name: "Refresh" });
    expect(refreshBtn).toBeEnabled();

    // Before click: no mock banner
    expect(
      screen.queryByText("(Mock) Refresh complete — no live data requested"),
    ).not.toBeInTheDocument();

    // Click refresh
    fireEvent.click(refreshBtn);

    // After click: mock banner appears
    expect(
      screen.getByText("(Mock) Refresh complete — no live data requested"),
    ).toBeInTheDocument();
  });

  it("refresh does not trigger any network request", () => {
    // Spy on fetch to ensure it is never called
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderOverview();

    const refreshBtn = screen.getByRole("button", { name: "Refresh" });
    fireEvent.click(refreshBtn);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // -- No real stock codes ------------------------------------------------

  it("page contains no real A-share stock code patterns", () => {
    renderOverview();
    const bodyText = document.body.textContent ?? "";
    // No <6-digit>.<SH|SZ|BJ> patterns
    expect(bodyText).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/i);
    // No bare 6-digit codes that look like A-share codes
    expect(bodyText).not.toMatch(/["\s]\d{6}["\s]/);
  });

  it("page contains no real US stock ticker patterns", () => {
    renderOverview();
    const bodyText = document.body.textContent ?? "";
    // No typical uppercase placeholder that looks like a live ticker
    // near quote data (e.g. generic short-code placeholder near a price dash).
    expect(bodyText).not.toMatch(/\b[A-Z]{1,5}\s+—\b/);
  });

  // -- Table headers ------------------------------------------------------

  it("renders watchlist table column headers", () => {
    renderOverview();
    for (const header of ["Code", "Name", "Price", "Change", "Actions"]) {
      // There are 2 tables, so each header appears twice.
      const elements = screen.getAllByText(header);
      expect(elements.length).toBe(2);
    }
  });
});
