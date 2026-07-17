import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportLibrary } from "../ReportLibrary";
import { loadReportLibrary } from "@/lib/aiComputing/reportLibraryService";
import { toReportLibraryView } from "@/lib/aiComputing/reportLibraryAdapter";

// ---------------------------------------------------------------------------
// Full-chain integration: service → adapter → component.
// loadReportLibrary() → toReportLibraryView() → <ReportLibrary view={...} />
// Zero real stock codes, company names, or network calls.
// ---------------------------------------------------------------------------

describe("ReportLibrary service → adapter → component (full chain)", () => {
  // -- disabled default → empty UI ------------------------------------------

  it("disabled service produces empty view rendered as No reports yet", async () => {
    const envelope = await loadReportLibrary({});
    expect(envelope.ok).toBe(true);
    expect(envelope.reports).toEqual([]);

    const view = toReportLibraryView(envelope);
    expect(view).toEqual({ kind: "empty" });

    render(<ReportLibrary view={view} />);
    expect(screen.getByText("No reports yet")).toBeDefined();
  });

  // -- mock mode → data cards -----------------------------------------------

  it("mock service produces data view rendered as [Mock] report cards", async () => {
    const envelope = await loadReportLibrary({}, { mode: "mock" });
    expect(envelope.ok).toBe(true);
    expect(envelope.reports!.length).toBeGreaterThan(0);

    const view = toReportLibraryView(envelope);
    expect(view.kind).toBe("data");

    render(<ReportLibrary view={view} />);

    // Verify mock cards are rendered
    expect(screen.getByText("[Mock] AI Compute Chip Outlook")).toBeDefined();
    expect(screen.getByText("[Mock] HBM Market Review")).toBeDefined();
    expect(screen.getByText("[Mock] Broker Service Alpha")).toBeDefined();
    expect(screen.getByText("[Mock] Broker Service Beta")).toBeDefined();
    expect(screen.getByText("[Mock] Outperform")).toBeDefined();
    expect(screen.getByText("[Mock] Buy")).toBeDefined();

    // Segment labels from i18n
    expect(screen.getByText("Compute Chip")).toBeDefined();
    expect(screen.getByText("HBM")).toBeDefined();
  });

  // -- mock mode output safety ----------------------------------------------

  it("mock service output all display fields use [Mock] prefix", async () => {
    const envelope = await loadReportLibrary({}, { mode: "mock" });

    for (const r of envelope.reports ?? []) {
      expect(r.title).toMatch(/^\[Mock\]/);
      expect(r.brokerage).toMatch(/^\[Mock\]/);
      if (r.analyst) expect(r.analyst).toMatch(/^\[Mock\]/);
      if (r.rating) expect(r.rating).toMatch(/^\[Mock\]/);
      // IDs must not look like real stock codes
      expect(r.id).not.toMatch(/^\d{6}\.(SH|SZ|BJ)$/);
    }
  });

  it("mock service output sourceCode fields use placeholder format only", async () => {
    // The service mock envelope has no warnings with sourceCode, so this
    // verifies the absence of real codes in the service output itself.
    const envelope = await loadReportLibrary({}, { mode: "mock" });
    const serialized = JSON.stringify(envelope);

    // No real stock code patterns anywhere in the envelope
    expect(serialized).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/);

    // If sourceCode-like strings exist, they must use placeholder format
    const codeMatches = serialized.match(/"sourceCode"\s*:\s*"([^"]*)"/g);
    if (codeMatches) {
      for (const m of codeMatches) {
        const val = m.replace(/.*"([^"]*)"\s*$/, "$1");
        if (val) expect(val).toMatch(/^</);
      }
    }
  });
});
