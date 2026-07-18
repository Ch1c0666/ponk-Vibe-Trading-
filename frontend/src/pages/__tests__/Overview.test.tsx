import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Overview } from "../Overview";

function renderOverview() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );
}

const mockLoadIndexQuotes = vi.fn();

vi.mock("@/lib/overview/indexQuoteService", () => ({
  loadIndexQuotes: (...args: unknown[]) => mockLoadIndexQuotes(...args),
  INDEX_CODE_ALLOWLIST: ["sh000001", "sz399001", "sz399006", "sh000688"],
}));

beforeEach(() => {
  mockLoadIndexQuotes.mockReset();
});

describe("Overview page", () => {
  // -- Default state: disabled, no auto requests --------------------------

  it("does not auto-request index quotes on mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderOverview();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLoadIndexQuotes).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("renders 4 index cards with placeholder dashes in disabled state", () => {
    renderOverview();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4); // one per card
  });

  it("renders watchlist sections with enabled add buttons", () => {
    renderOverview();
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    expect(addButtons).toHaveLength(2);
    for (const btn of addButtons) expect(btn).not.toBeDisabled();
  });

  // -- Load button --------------------------------------------------------

  it("load button calls service in real mode", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: true,
      source: "tencent",
      timestamp: "2026-07-18T10:00:00Z",
      data: {
        quotes: [
          { code: "sh000001", name: "SSE Composite", price: 3500, prev_close: null, open: null, high: null, low: null, change_pct: 0.57 },
          { code: "sz399001", name: "SZSE Component", price: 10800, prev_close: null, open: null, high: null, low: null, change_pct: -0.15 },
          { code: "sz399006", name: "ChiNext", price: 2150, prev_close: null, open: null, high: null, low: null, change_pct: 1.2 },
          { code: "sh000688", name: "STAR 50", price: 980, prev_close: null, open: null, high: null, low: null, change_pct: -0.8 },
        ],
        partial: false,
        warnings: [],
      },
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Load live indices" });
    await act(() => fireEvent.click(btn));

    expect(mockLoadIndexQuotes).toHaveBeenCalledWith({ mode: "real" });
  });

  // -- Data state ---------------------------------------------------------

  it("shows price and change after loading", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: true,
      source: "tencent",
      timestamp: "2026-07-18T10:00:00Z",
      data: {
        quotes: [
          { code: "sh000001", name: "SSE Composite", price: 3500.5, prev_close: null, open: null, high: null, low: null, change_pct: 0.57 },
          { code: "sz399001", name: "SZSE Component", price: 10800, prev_close: null, open: null, high: null, low: null, change_pct: -0.15 },
          { code: "sz399006", name: "ChiNext", price: 2150, prev_close: null, open: null, high: null, low: null, change_pct: 1.2 },
          { code: "sh000688", name: "STAR 50", price: 980, prev_close: null, open: null, high: null, low: null, change_pct: -0.8 },
        ],
        partial: false,
        warnings: [],
      },
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Load live indices" });
    await act(() => fireEvent.click(btn));

    expect(screen.getByText("3500.50")).toBeInTheDocument();
    expect(screen.getByText("+0.57%")).toBeInTheDocument();
    expect(screen.getByText("-0.15%")).toBeInTheDocument();
  });

  it("shows source and timestamp after loading", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: true,
      source: "tencent",
      timestamp: "2026-07-18T10:00:00Z",
      data: {
        quotes: [
          { code: "sh000001", name: "X", price: 1, prev_close: null, open: null, high: null, low: null, change_pct: 0 },
          { code: "sz399001", name: "Y", price: 1, prev_close: null, open: null, high: null, low: null, change_pct: 0 },
          { code: "sz399006", name: "Z", price: 1, prev_close: null, open: null, high: null, low: null, change_pct: 0 },
          { code: "sh000688", name: "W", price: 1, prev_close: null, open: null, high: null, low: null, change_pct: 0 },
        ],
        partial: false,
        warnings: [],
      },
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Load live indices" });
    await act(() => fireEvent.click(btn));

    expect(screen.getByText(/Source/)).toBeInTheDocument();
    expect(screen.getByText(/tencent/)).toBeInTheDocument();
    expect(screen.getByText(/Read-only public quotes/)).toBeInTheDocument();
  });

  // -- Partial state ------------------------------------------------------

  it("shows partial warning banner", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: true,
      source: "tencent",
      timestamp: "t",
      data: {
        quotes: [
          { code: "sh000001", name: "X", price: 1, prev_close: null, open: null, high: null, low: null, change_pct: 0 },
          { code: "sz399001", name: "Y", price: null, prev_close: null, open: null, high: null, low: null, change_pct: null },
          { code: "sz399006", name: "Z", price: null, prev_close: null, open: null, high: null, low: null, change_pct: null },
          { code: "sh000688", name: "W", price: null, prev_close: null, open: null, high: null, low: null, change_pct: null },
        ],
        partial: true,
        warnings: [{ code: "x", message: "fail", index_code: "sz399001" }],
      },
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Load live indices" });
    await act(() => fireEvent.click(btn));

    expect(screen.getByText("Some indices are unavailable; showing available quotes.")).toBeInTheDocument();
  });

  // -- Error state --------------------------------------------------------

  it("shows error state without crashing", async () => {
    mockLoadIndexQuotes.mockResolvedValueOnce({
      ok: false,
      error: "all failed",
      error_code: "provider_request_failed",
    });

    renderOverview();
    const btn = screen.getByRole("button", { name: "Load live indices" });
    await act(() => fireEvent.click(btn));

    // Cards still render with error message
    expect(screen.getByText("SSE Composite")).toBeInTheDocument();
    expect(screen.getAllByText("all failed").length).toBeGreaterThanOrEqual(1);
  });

  // -- Watchlists unchanged -----------------------------------------------

  it("watchlist tables remain empty", () => {
    renderOverview();
    expect(screen.getAllByText("No watchlist entries")).toHaveLength(2);
  });

  // -- Safety -------------------------------------------------------------

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

  // -- Backup UI ------------------------------------------------------------

  it("renders Export JSON button", () => {
    renderOverview();
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeInTheDocument();
  });

  it("renders Import JSON button", () => {
    renderOverview();
    expect(screen.getByRole("button", { name: "Import JSON" })).toBeInTheDocument();
  });

  it("has hidden file input for import", () => {
    renderOverview();
    const input = document.querySelector('input[type="file"][accept=".json"]');
    expect(input).not.toBeNull();
    expect((input as HTMLInputElement).className).toContain("hidden");
  });

  it("export does NOT trigger fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderOverview();
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
