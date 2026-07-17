import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportLibrary } from "../ReportLibrary";
import {
  MOCK_LOADING_VIEW,
  MOCK_ERROR_VIEW,
  MOCK_DATA_VIEW,
  MOCK_PARTIAL_VIEW,
} from "./fixtures/reportLibraryFixtures";

// ---------------------------------------------------------------------------
// ReportLibrary state machine tests — mock-only data, no real API calls.
//
// The test setup initialises i18n and falls back to English, so all
// assertions use the English translation values.
// ---------------------------------------------------------------------------

describe("ReportLibrary", () => {
  // -- empty state (default) ------------------------------------------------

  it("renders empty state by default when no view prop is given", () => {
    render(<ReportLibrary />);
    expect(screen.getByText("No reports yet")).toBeDefined();
  });

  it("renders empty state explicitly", () => {
    render(<ReportLibrary view={{ kind: "empty" }} />);
    expect(screen.getByText("No reports yet")).toBeDefined();
  });

  // -- loading state --------------------------------------------------------

  it("renders loading state with spinner", () => {
    render(<ReportLibrary view={MOCK_LOADING_VIEW} />);
    expect(screen.getByText("Loading reports…")).toBeDefined();
    // The search input should be disabled during loading
    const input = document.querySelector("input");
    expect(input?.hasAttribute("disabled")).toBe(true);
  });

  // -- error state ----------------------------------------------------------

  it("renders error state with title", () => {
    render(<ReportLibrary view={MOCK_ERROR_VIEW} />);
    expect(screen.getByText("Report loading failed")).toBeDefined();
  });

  it("renders retry button in error state (disabled — not wired yet)", () => {
    render(<ReportLibrary view={MOCK_ERROR_VIEW} />);
    const retry = screen.getByText("Retry");
    expect(retry).toBeDefined();
    expect(retry.hasAttribute("disabled")).toBe(true);
  });

  // -- data state -----------------------------------------------------------

  it("renders report cards when data view is provided", () => {
    render(<ReportLibrary view={MOCK_DATA_VIEW} />);
    expect(
      screen.getByText("[Mock] AI Compute Chip Industry Outlook"),
    ).toBeDefined();
    expect(
      screen.getByText("[Mock] HBM Supply Chain Analysis"),
    ).toBeDefined();
    expect(
      screen.getByText("[Mock] Optical Module Technology Review"),
    ).toBeDefined();
  });

  it("renders brokerage and date for each mock card", () => {
    render(<ReportLibrary view={MOCK_DATA_VIEW} />);
    expect(screen.getByText("[Mock] Broker Alpha")).toBeDefined();
    expect(screen.getByText("[Mock] Broker Beta")).toBeDefined();
    expect(screen.getByText("2026-07-01")).toBeDefined();
    expect(screen.getByText("[Mock] Zhang San")).toBeDefined();
  });

  it("renders rating badge when present", () => {
    render(<ReportLibrary view={MOCK_DATA_VIEW} />);
    // Card 2 has rating "[Mock] Buy"
    expect(screen.getByText("[Mock] Buy")).toBeDefined();
    // Card 1 has rating "[Mock] Outperform"
    expect(screen.getByText("[Mock] Outperform")).toBeDefined();
  });

  it("renders segment label for each card", () => {
    render(<ReportLibrary view={MOCK_DATA_VIEW} />);
    expect(screen.getByText("Compute Chip")).toBeDefined();
    expect(screen.getByText("HBM")).toBeDefined();
    expect(screen.getByText("Optical Module")).toBeDefined();
  });

  // -- partial state --------------------------------------------------------

  it("renders warning banner in partial state", () => {
    render(<ReportLibrary view={MOCK_PARTIAL_VIEW} />);
    expect(
      screen.getByText("Some pages failed to load. Results may be incomplete."),
    ).toBeDefined();
  });

  it("renders warning details in partial state", () => {
    render(<ReportLibrary view={MOCK_PARTIAL_VIEW} />);
    expect(screen.getByText(/provider_page_failed/)).toBeDefined();
    expect(screen.getByText(/provider_hits_absent/)).toBeDefined();
  });

  it("renders partial report cards alongside warnings", () => {
    render(<ReportLibrary view={MOCK_PARTIAL_VIEW} />);
    expect(
      screen.getByText("[Mock] Liquid Cooling Solutions Report"),
    ).toBeDefined();
  });

  // -- safety: no real stock codes in mock data -----------------------------

  it("mock data contains no real stock code patterns", () => {
    const mocks = [MOCK_DATA_VIEW, MOCK_PARTIAL_VIEW] as const;
    for (const mock of mocks) {
      if (mock.kind === "data" || mock.kind === "partial") {
        for (const report of mock.reports) {
          expect(report.id).not.toMatch(/^\d{6}\.(SH|SZ|BJ)$/);
          expect(report.title).not.toMatch(/\d{6}\.(SH|SZ|BJ)/);
          expect(report.brokerage).not.toMatch(/\d{6}\.(SH|SZ|BJ)/);
        }
      }
    }
  });

  it("all mock titles are explicitly marked with [Mock] prefix", () => {
    const mocks = [MOCK_DATA_VIEW, MOCK_PARTIAL_VIEW] as const;
    for (const mock of mocks) {
      if (mock.kind === "data" || mock.kind === "partial") {
        for (const report of mock.reports) {
          expect(report.title).toMatch(/^\[Mock\]/);
        }
      }
    }
  });

  it("all mock brokerages are explicitly marked with [Mock] prefix", () => {
    const mocks = [MOCK_DATA_VIEW, MOCK_PARTIAL_VIEW] as const;
    for (const mock of mocks) {
      if (mock.kind === "data" || mock.kind === "partial") {
        for (const report of mock.reports) {
          expect(report.brokerage).toMatch(/^\[Mock\]/);
        }
      }
    }
  });
});
