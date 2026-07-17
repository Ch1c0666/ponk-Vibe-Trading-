import type { ReportLibraryView } from "../../ReportLibrary";

// ---------------------------------------------------------------------------
// Mock-only fixtures for ReportLibrary state machine tests.
// Every field is a placeholder. No real companies, stock codes, or report
// titles are permitted in these fixtures.
// ---------------------------------------------------------------------------

export const MOCK_LOADING_VIEW: ReportLibraryView = { kind: "loading" };

export const MOCK_ERROR_VIEW: ReportLibraryView = {
  kind: "error",
  errorCode: "mock_error",
  message: "[Mock] The report provider returned an error. This is a test fixture.",
};

export const MOCK_DATA_VIEW: ReportLibraryView = {
  kind: "data",
  reports: [
    {
      id: "MOCK-001",
      title: "[Mock] AI Compute Chip Industry Outlook",
      brokerage: "[Mock] Broker Alpha",
      analyst: "[Mock] Zhang San",
      publishDate: "2026-07-01",
      rating: "[Mock] Outperform",
      segmentKey: "computeChip",
    },
    {
      id: "MOCK-002",
      title: "[Mock] HBM Supply Chain Analysis",
      brokerage: "[Mock] Broker Beta",
      analyst: null,
      publishDate: "2026-06-28",
      rating: "[Mock] Buy",
      segmentKey: "hbm",
    },
    {
      id: "MOCK-003",
      title: "[Mock] Optical Module Technology Review",
      brokerage: "[Mock] Broker Gamma",
      analyst: "[Mock] Li Si",
      publishDate: "2026-06-15",
      rating: null,
      segmentKey: "opticalModule",
    },
  ],
  total: 3,
  shown: 3,
};

export const MOCK_PARTIAL_VIEW: ReportLibraryView = {
  kind: "partial",
  reports: [
    {
      id: "MOCK-P01",
      title: "[Mock] Liquid Cooling Solutions Report",
      brokerage: "[Mock] Broker Delta",
      analyst: "[Mock] Wang Wu",
      publishDate: "2026-07-10",
      rating: "[Mock] Neutral",
      segmentKey: "liquidCooling",
    },
  ],
  total: 15,
  shown: 1,
  warnings: [
    {
      code: "provider_page_failed",
      message: "[Mock] Page 2 request failed: connection timeout",
      page: 2,
    },
    {
      code: "provider_hits_absent",
      message: "[Mock] Response missing 'hits' field; result may be incomplete",
      page: 1,
    },
  ],
};
