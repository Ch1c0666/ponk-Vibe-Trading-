import type {
  ProviderReportEnvelope,
  ReportLibraryQuery,
} from "./reportLibraryAdapter";

// ---------------------------------------------------------------------------
// Report library service — fail-closed stub.  No network requests, no env
// reads, no MCP/HTTP calls.  Designed to be replaced with a real provider
// when the backend is ready.
// ---------------------------------------------------------------------------

/** Controls which backend the service talks to. */
export type ReportLibraryServiceMode = "disabled" | "mock";

export interface ReportLibraryServiceOptions {
  mode?: ReportLibraryServiceMode;
}

// ---------------------------------------------------------------------------
// Mock-only placeholder envelope — every display field uses [Mock] prefix.
// ---------------------------------------------------------------------------

const MOCK_ENVELOPE: ProviderReportEnvelope = {
  ok: true,
  reports: [
    {
      id: "MOCK-SVC-001",
      title: "[Mock] AI Compute Chip Outlook",
      brokerage: "[Mock] Broker Service Alpha",
      analyst: "[Mock] Service Analyst",
      publishDate: "2026-07-15",
      rating: "[Mock] Outperform",
      segmentKey: "computeChip",
    },
    {
      id: "MOCK-SVC-002",
      title: "[Mock] HBM Market Review",
      brokerage: "[Mock] Broker Service Beta",
      analyst: null,
      publishDate: "2026-07-10",
      rating: "[Mock] Buy",
      segmentKey: "hbm",
    },
  ],
  total: 2,
  partial: false,
};

// ---------------------------------------------------------------------------

/**
 * Load research reports for the given query.
 *
 * - **disabled** (default): returns an empty ok envelope — fail-closed, no
 *   network access, no substitution of stock report data.
 * - **mock**: returns a static placeholder envelope for development / testing.
 *   All display fields are ``[Mock]``-prefixed; no real companies or codes.
 *
 * The *query* parameter is accepted for forward-compatibility but is not
 * currently used to drive a real request.
 */
export async function loadReportLibrary(
  _query: ReportLibraryQuery,
  options?: ReportLibraryServiceOptions,
): Promise<ProviderReportEnvelope> {
  const mode = options?.mode ?? "disabled";

  if (mode === "mock") {
    // Return a structured mock so tests can verify the full chain:
    //   loadReportLibrary() → toReportLibraryView() → <ReportLibrary />
    return { ...MOCK_ENVELOPE };
  }

  // disabled — fail-closed, zero network access
  return {
    ok: true,
    reports: [],
    total: 0,
    partial: false,
  };
}
