import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportLibrary } from "../ReportLibrary";
import { toReportLibraryView } from "@/lib/aiComputing/reportLibraryAdapter";
import type { ProviderReportEnvelope } from "@/lib/aiComputing/reportLibraryAdapter";

// ---------------------------------------------------------------------------
// Integration test: ProviderReportEnvelope → toReportLibraryView() →
// <ReportLibrary view={...} />.  All fixtures use [Mock]-prefixed values.
// Zero real company names, stock codes, or report titles.
// ---------------------------------------------------------------------------

describe("ReportLibrary adapter → component integration", () => {
  // -- data envelope → renders report cards ---------------------------------

  it("renders report cards from a data envelope through the adapter", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      reports: [
        {
          id: "MOCK-I01",
          title: "[Mock] Integrated Data Report",
          brokerage: "[Mock] Broker Integration",
          analyst: "[Mock] Test Analyst",
          publishDate: "2026-07-15",
          rating: "[Mock] Strong Buy",
          segmentKey: "computeChip",
        },
        {
          id: "MOCK-I02",
          title: "[Mock] Second Integrated Report",
          brokerage: "[Mock] Broker Two",
          analyst: null,
          publishDate: "2026-07-10",
          rating: null,
          segmentKey: "hbm",
        },
      ],
      total: 7,
    };

    const view = toReportLibraryView(envelope);
    render(<ReportLibrary view={view} />);

    expect(screen.getByText("[Mock] Integrated Data Report")).toBeDefined();
    expect(screen.getByText("[Mock] Second Integrated Report")).toBeDefined();
    expect(screen.getByText("[Mock] Broker Integration")).toBeDefined();
    expect(screen.getByText("[Mock] Test Analyst")).toBeDefined();
    expect(screen.getByText("2026-07-15")).toBeDefined();
    expect(screen.getByText("[Mock] Strong Buy")).toBeDefined();
    expect(screen.getByText("Compute Chip")).toBeDefined();
    expect(screen.getByText("HBM")).toBeDefined();
  });

  // -- partial envelope → renders warning banner ----------------------------

  it("renders warning banner from a partial envelope through the adapter", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      partial: true,
      reports: [
        {
          id: "MOCK-PI01",
          title: "[Mock] Partial Integration Report",
          brokerage: "[Mock] Broker Partial",
          analyst: null,
          publishDate: "2026-07-12",
          rating: "[Mock] Hold",
          segmentKey: "liquidCooling",
        },
      ],
      total: 20,
      warnings: [
        {
          code: "provider_page_failed",
          message: "[Mock] Page 3 request timed out",
          page: 3,
          sourceCode: "<CODE_A.SH>",
        },
        {
          code: "provider_hits_absent",
          message: "[Mock] Missing hits field on page 1",
          page: 1,
          sourceCode: "<CODE_B.SZ>",
        },
      ],
    };

    const view = toReportLibraryView(envelope);
    render(<ReportLibrary view={view} />);

    // Warning banner visible
    expect(
      screen.getByText("Some pages failed to load. Results may be incomplete."),
    ).toBeDefined();
    // Warning codes visible
    expect(screen.getByText(/provider_page_failed/)).toBeDefined();
    expect(screen.getByText(/provider_hits_absent/)).toBeDefined();
    // Report card still renders
    expect(
      screen.getByText("[Mock] Partial Integration Report"),
    ).toBeDefined();
    // Segment label
    expect(screen.getByText("Liquid Cooling")).toBeDefined();
  });

  // -- error envelope → renders error state ---------------------------------

  it("renders error state from an error envelope through the adapter", () => {
    const envelope: ProviderReportEnvelope = {
      ok: false,
      error: { code: "PROVIDER_TIMEOUT", message: "[Mock] upstream timeout" },
    };

    const view = toReportLibraryView(envelope);
    render(<ReportLibrary view={view} />);

    expect(screen.getByText("Report loading failed")).toBeDefined();
    // The error description contains both code and message
    expect(screen.getByText(/PROVIDER_TIMEOUT/)).toBeDefined();
    expect(screen.getByText(/upstream timeout/)).toBeDefined();
    // Retry button present
    expect(screen.getByText("Retry")).toBeDefined();
  });

  // -- empty envelope → renders empty state ---------------------------------

  it("renders empty state from an empty envelope through the adapter", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      reports: [],
      total: 0,
    };

    const view = toReportLibraryView(envelope);
    render(<ReportLibrary view={view} />);

    expect(screen.getByText("No reports yet")).toBeDefined();
  });

  // -- safety assertions ----------------------------------------------------

  it("all mock envelope data uses [Mock] prefix and placeholder IDs", () => {
    const envelope: ProviderReportEnvelope = {
      ok: true,
      partial: true,
      reports: [
        {
          id: "MOCK-S01",
          title: "[Mock] Safety Check Report",
          brokerage: "[Mock] Broker Safety",
          analyst: "[Mock] Safety Analyst",
          publishDate: "2026-07-01",
          rating: "[Mock] Buy",
          segmentKey: "computeChip",
        },
      ],
      total: 1,
      warnings: [
        {
          code: "provider_page_failed",
          message: "[Mock] safety warning",
          page: 1,
          sourceCode: "<CODE_A.SH>",
        },
      ],
    };

    const view = toReportLibraryView(envelope);

    // Every string field with content must start with [Mock]
    if (view.kind === "partial") {
      for (const r of view.reports) {
        expect(r.title).toMatch(/^\[Mock\]/);
        expect(r.brokerage).toMatch(/^\[Mock\]/);
        if (r.analyst) expect(r.analyst).toMatch(/^\[Mock\]/);
        if (r.rating) expect(r.rating).toMatch(/^\[Mock\]/);
      }
      for (const w of view.warnings) {
        expect(w.message).toMatch(/^\[Mock\]/);
        if (w.sourceCode) expect(w.sourceCode).toMatch(/^</);
      }
    }

    // No stock code pattern in mock IDs
    for (const r of view.kind === "partial" ? view.reports : []) {
      expect(r.id).not.toMatch(/^\d{6}\.(SH|SZ|BJ)$/);
    }
  });
});
