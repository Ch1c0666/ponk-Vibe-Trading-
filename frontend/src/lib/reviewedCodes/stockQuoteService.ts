// ---------------------------------------------------------------------------
// Stock quote service — disabled / mock / real modes.
// No env reads.  No real network in disabled or mock modes.
// Only calls the reviewed stock quote REST endpoint.
// Does not use report or MCP transports.
// ---------------------------------------------------------------------------

export interface StockQuoteData {
  name: string | null;
  price: number | null;
  prev_close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change_pct: number | null;
  pe_ttm: number | null;
  pb: number | null;
}

export interface StockQuoteEnvelope {
  ok: boolean;
  source?: string;
  code?: string;
  data?: StockQuoteData;
  error?: string;
  error_code?: string;
}

export type StockQuoteServiceMode = "disabled" | "mock" | "real";

const REAL_ENDPOINT = "/api/stocks/quote";

// -- mock -----------------------------------------------------------------

const MOCK_DATA: StockQuoteData = {
  name: "[Mock] Test Corp",
  price: 100.0,
  prev_close: 99.0,
  open: 99.5,
  high: 101.0,
  low: 98.5,
  change_pct: 1.01,
  pe_ttm: 20.0,
  pb: 3.0,
};

// ---------------------------------------------------------------------------

export async function loadStockQuote(
  code: string,
  options?: { mode?: StockQuoteServiceMode },
): Promise<StockQuoteEnvelope> {
  const mode = options?.mode ?? "disabled";

  if (mode === "disabled") {
    return { ok: true, source: "disabled", code, data: undefined };
  }

  if (mode === "mock") {
    return { ok: true, source: "[Mock] tencent", code, data: { ...MOCK_DATA } };
  }

  // real
  const url = `${REAL_ENDPOINT}?code=${encodeURIComponent(code)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    return {
      ok: false,
      error: `Quote request failed: ${err instanceof Error ? err.message : String(err)}`,
      error_code: "provider_request_failed",
    };
  }

  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; } catch { /* ignore */ }
    return {
      ok: false,
      error: (body.error as string) ?? `HTTP ${response.status}`,
      error_code: (body.error_code as string) ?? "provider_request_failed",
    };
  }

  try {
    const payload = (await response.json()) as StockQuoteEnvelope;
    return payload;
  } catch {
    return { ok: false, error: "Non-JSON response", error_code: "provider_parse_error" };
  }
}
