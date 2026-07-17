import type {
  ProviderReportEnvelope,
  ProviderReportRow,
  ProviderWarning,
  ReportLibraryQuery,
} from "./reportLibraryAdapter";

// ---------------------------------------------------------------------------
// Report library service — disabled / mock / real modes.
// No env reads.  No real network in disabled or mock modes.
// real mode aggregates q_type=0 stock-level reports (NOT industry reports).
// ---------------------------------------------------------------------------

export type ReportLibraryServiceMode = "disabled" | "mock" | "real";

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
// Real-mode constants
// ---------------------------------------------------------------------------

const REAL_ENDPOINT = "/api/reports/research";
const DEFAULT_REAL_LIMIT = 20;
const MAX_CONCURRENCY = 3;

// ---------------------------------------------------------------------------

/**
 * Load research reports.
 *
 * - **disabled** (default): empty envelope, zero network.
 * - **mock**: static ``[Mock]``-prefixed envelope, zero network.
 * - **real**: fetches stock-level reports (q_type=0) for each code in
 *   ``query.codes`` via ``GET /api/reports/research``, then aggregates.
 *   **This is a stock-level report aggregation — NOT an industry report.**
 *
 * The *query* is accepted for forward-compatibility.  In real mode only
 * ``query.codes`` and ``query.limit`` are used; other fields are ignored.
 */
export async function loadReportLibrary(
  query: ReportLibraryQuery,
  options?: ReportLibraryServiceOptions,
): Promise<ProviderReportEnvelope> {
  const mode = options?.mode ?? "disabled";

  if (mode === "disabled") {
    return { ok: true, reports: [], total: 0, partial: false };
  }

  if (mode === "mock") {
    return { ...MOCK_ENVELOPE };
  }

  // -- real mode: aggregate stock-level reports per code -----------------
  return _fetchReal(query);
}

// ---------------------------------------------------------------------------
// Real-mode implementation
// ---------------------------------------------------------------------------

async function _fetchReal(
  query: ReportLibraryQuery,
): Promise<ProviderReportEnvelope> {
  const codes = query.codes ?? [];

  // Empty code list — fail-safe, no network.
  if (codes.length === 0) {
    return { ok: true, reports: [], total: 0, partial: false };
  }

  const limit = _clampLimit(query.limit, DEFAULT_REAL_LIMIT, 50);

  // Fetch with concurrency limit.
  const results = await _fetchAll(codes, limit, MAX_CONCURRENCY);

  // Aggregate
  const allReports: ProviderReportRow[] = [];
  const allWarnings: ProviderWarning[] = [];
  let anyOk = false;
  let anyFail = false;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.ok && r.envelope?.ok) {
      const envData = r.envelope.data as Record<string, unknown> | undefined;
      const rawReports = envData?.reports as Array<Record<string, unknown>> | undefined;
      if (!rawReports || rawReports.length === 0) {
        anyFail = true;
        allWarnings.push({
          code: "provider_error",
          message: r.error ?? `No reports returned for ${codes[i]}`,
          sourceCode: codes[i],
        });
        continue;
      }
      anyOk = true;
      const reports: ProviderReportRow[] = rawReports.map((rep) => ({
        id: (rep.info_code as string) ?? `unknown-${i}`,
        title: (rep.title as string) ?? "",
        brokerage: (rep.brokerage as string) ?? "",
        analyst: (rep.analyst as string | null) ?? null,
        publishDate: (rep.publish_date as string) ?? "",
        rating: (rep.rating as string | null) ?? null,
        segmentKey: query.segmentKey ?? "",
      }));
      allReports.push(...reports);
      if (envData && envData.partial && envData.warnings) {
        for (const w of envData.warnings as Array<Record<string, unknown>>) {
          allWarnings.push({
            code: (w.code as string) ?? "unknown",
            message: (w.message as string) ?? "",
            page: (w.page as number) ?? undefined,
            sourceCode: codes[i],
          });
        }
      }
    } else {
      anyFail = true;
      allWarnings.push({
        code: r.ok ? "provider_error" : "provider_request_failed",
        message: r.error ?? `Failed to fetch reports for ${codes[i]}`,
        sourceCode: codes[i],
      });
    }
  }

  if (!anyOk && anyFail) {
    return {
      ok: false,
      error: {
        code: "provider_request_failed",
        message: "All research report requests failed.",
      },
    };
  }

  // Dedup by id
  const seen = new Set<string>();
  const deduped = allReports.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Sort by publishDate descending
  deduped.sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  return {
    ok: true,
    reports: deduped,
    total: deduped.length,
    partial: allWarnings.length > 0,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FetchResult {
  ok: boolean;
  envelope?: Record<string, unknown>;
  error?: string;
}

async function _fetchAll(
  codes: string[],
  limit: number,
  concurrency: number,
): Promise<FetchResult[]> {
  const results: FetchResult[] = new Array(codes.length);
  let idx = 0;

  async function worker() {
    while (idx < codes.length) {
      const i = idx++;
      results[i] = await _fetchOne(codes[i], limit);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, codes.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

async function _fetchOne(code: string, limit: number): Promise<FetchResult> {
  const url = `${REAL_ENDPOINT}?code=${encodeURIComponent(code)}&limit=${limit}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `HTTP ${response.status}`,
    };
  }

  try {
    const envelope = (await response.json()) as Record<string, unknown>;
    return { ok: true, envelope };
  } catch {
    return { ok: false, error: "Non-JSON response" };
  }
}

function _clampLimit(
  value: number | undefined,
  defaultVal: number,
  max: number,
): number {
  if (value === undefined) return defaultVal;
  if (!Number.isFinite(value) || value < 1) return defaultVal;
  return Math.min(value, max);
}
