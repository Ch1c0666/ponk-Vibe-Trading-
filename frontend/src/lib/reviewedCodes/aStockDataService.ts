// ---------------------------------------------------------------------------
// A-stock aggregate data service — disabled / mock / real modes.
// Calls GET /api/a-stocks/data for non-quote families.
// No env reads.  No quote transport.
// ---------------------------------------------------------------------------

export type AStockDataMode = "disabled" | "mock" | "real";

export interface AStockDataOptions {
  mode?: AStockDataMode;
}

export interface AStockFamilyResult {
  ok: boolean;
  source?: string;
  data?: unknown;
  error?: string;
  error_code?: string;
}

export interface AStockDataEnvelope {
  ok: boolean;
  source?: string;
  code?: string;
  partial?: boolean;
  error?: string;
  error_code?: string;
  data: Record<string, AStockFamilyResult>;
}

const ENDPOINT = "/api/a-stocks/data";
const NON_QUOTE_INCLUDE = "news,fundamentals,reports,announcements";

// -- mock -----------------------------------------------------------------

const MOCK_ENVELOPE: AStockDataEnvelope = {
  ok: true,
  source: "[Mock] a-stock-data",
  code: "000000.SH",
  partial: false,
  data: {
    news: {
      ok: true,
      source: "[Mock] eastmoney",
      data: [{ title: "[Mock] News Item" }],
    },
    fundamentals: {
      ok: true,
      source: "[Mock] eastmoney+sina",
      data: {
        stock_info: { name: "[Mock] Test Corp" },
        financial_reports: {
          income_statement: [],
          balance_sheet: [],
          cash_flow: [],
        },
      },
    },
    reports: {
      ok: true,
      source: "[Mock] eastmoney+ths",
      data: { reports: [] },
    },
    announcements: {
      ok: true,
      source: "[Mock] cninfo",
      data: [{ title: "[Mock] Announcement" }],
    },
  },
};

// ---------------------------------------------------------------------------

export async function loadAStockData(
  code: string,
  options?: AStockDataOptions,
): Promise<AStockDataEnvelope> {
  const mode = options?.mode ?? "disabled";

  if (mode === "disabled") {
    return {
      ok: true,
      source: "disabled",
      code,
      partial: true,
      data: {},
    };
  }

  if (mode === "mock") {
    return { ...MOCK_ENVELOPE, code };
  }

  // real
  const url = `${ENDPOINT}?code=${encodeURIComponent(code)}&include=${NON_QUOTE_INCLUDE}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    return {
      ok: false,
      error: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      error_code: "provider_request_failed",
      data: {},
    };
  }

  try {
    return (await response.json()) as AStockDataEnvelope;
  } catch {
    return {
      ok: false,
      error: "Non-JSON response",
      error_code: "provider_parse_error",
      data: {},
    };
  }
}
