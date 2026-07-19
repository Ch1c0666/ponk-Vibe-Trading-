// ---------------------------------------------------------------------------
// ReviewedAStockDataPanel tests.
// Only placeholder codes via mock.  No real stock codes.
// ---------------------------------------------------------------------------

import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { ReviewedAStockDataPanel } from "../ReviewedAStockDataPanel";

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

// Mock reviewedSegmentCodes — only 000000.SH placeholder
vi.mock("@/lib/reviewedCodes/reviewedSegmentCodes", () => ({
  REVIEWED_SEGMENT_CODES: {
    version: 1,
    segments: {
      aiComputing: {
        computeChip: {
          codes: [
            {
              code: "000000.SH",
              status: "approved",
              reason: "test",
              source: "test",
              reviewer: "test",
              reviewedAt: "2026-01-01",
              dataUse: ["quote"],
            },
            {
              code: "000000.SZ",
              status: "approved",
              reason: "test",
              source: "test",
              reviewer: "test",
              reviewedAt: "2026-01-01",
              dataUse: ["news", "fundamental", "report", "announcement"],
            },
          ],
        },
        hbm: { codes: [] },
      },
      humanoidRobot: { harmonicReducer: { codes: [] } },
    },
  },
}));

function renderPanel(scope: "aiComputing" | "humanoidRobot" = "aiComputing", segmentKey = "computeChip") {
  return render(
    <I18nextProvider i18n={i18n}>
      <ReviewedAStockDataPanel scope={scope} segmentKey={segmentKey} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  fetchSpy.mockReset();
});

describe("ReviewedAStockDataPanel", () => {
  it("returns null when no reviewed codes exist", () => {
    const { container } = renderPanel("humanoidRobot", "harmonicReducer");
    expect(container.innerHTML).toBe("");
  });

  it("shows Reviewed Stock Quote section for quote-approved code", () => {
    renderPanel();
    expect(screen.getByText("Reviewed Stock Quote")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Quote" })).toBeInTheDocument();
  });

  it("does NOT auto-fetch on mount", () => {
    renderPanel();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("quote button calls /api/stocks/quote", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, source: "tencent", code: "000000.SH", data: { name: "Test", price: 10, prev_close: null, open: null, high: null, low: null, change_pct: null, pe_ttm: null, pb: null } }),
    });

    renderPanel();
    await act(() => screen.getByRole("button", { name: "Load Quote" }).click());

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/api/stocks/quote?code=000000.SH");
  });

  it("shows Reviewed A-Share Data section for non-quote codes", () => {
    renderPanel();
    expect(screen.getByText("Reviewed A-Share Data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Data" })).toBeInTheDocument();
  });

  it("Load Data button calls /api/a-stocks/data, not /api/stocks/quote", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true, source: "a-stock-data", code: "000000.SZ", partial: false,
        data: {
          news: { ok: true, data: [{ title: "News Title", time: "2026-07-19", source: "Mock" }] },
          fundamentals: { ok: true, data: { stock_info: null, financial_reports: { income_statement: [{ report_period: "2026-03-31", "净利润": "100" }], balance_sheet: [], cash_flow: [] } } },
          reports: { ok: true, data: { reports: [{ title: "Report Title", orgSName: "Broker", publishDate: "2026-07-19" }] } },
          announcements: { ok: true, data: [{ title: "Ann Title", date: "2026-07-19", type: "临时公告" }] },
        },
      }),
    });

    renderPanel();
    await act(() => screen.getByRole("button", { name: "Load Data" }).click());

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/api/a-stocks/data?code=000000.SZ");
    expect(url).toContain("include=news");
    expect(url).not.toContain("/api/stocks/quote");
    expect(url).not.toContain("/api/reports/research");
    expect(url).not.toContain("/mcp");
  });

  it("renders structured data, not raw content", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true, source: "a-stock-data", code: "000000.SZ", partial: false,
        data: {
          news: { ok: true, data: [{ title: "News Title", time: "2026-07-19", source: "Mock", content: "LONG_CONTENT_SHOULD_NOT_RENDER" }] },
          fundamentals: { ok: true, data: { stock_info: null, financial_reports: { income_statement: [{ report_period: "2026-03-31", "净利润": "100" }], balance_sheet: [], cash_flow: [] } } },
          reports: { ok: true, data: { reports: [{ title: "Report Title", orgSName: "Broker", publishDate: "2026-07-19" }] } },
          announcements: { ok: true, data: [{ title: "Ann Title", date: "2026-07-19", type: "临时公告", content: "LONG_ANN_SHOULD_NOT_RENDER" }] },
        },
      }),
    });

    renderPanel();
    await act(() => screen.getByRole("button", { name: "Load Data" }).click());

    // Structured fields visible
    expect(screen.getByText("News Title")).toBeInTheDocument();
    expect(screen.getByText("Report Title")).toBeInTheDocument();
    expect(screen.getByText("Ann Title")).toBeInTheDocument();
    expect(screen.getByText("净利润")).toBeInTheDocument();
    // Stock info unavailable
    expect(screen.getByText("stock info unavailable")).toBeInTheDocument();
    // Long content NOT in DOM
    expect(document.body.textContent).not.toContain("LONG_CONTENT_SHOULD_NOT_RENDER");
    expect(document.body.textContent).not.toContain("LONG_ANN_SHOULD_NOT_RENDER");
    // No raw JSON dump
    expect(document.body.textContent).not.toContain('"data":');
  });

  it("non-quote code does NOT trigger /api/stocks/quote", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: {} }),
    });

    renderPanel();
    await act(() => screen.getByRole("button", { name: "Load Data" }).click());

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("/api/stocks/quote");
    expect(url).not.toContain("000000.SH");
  });
});
