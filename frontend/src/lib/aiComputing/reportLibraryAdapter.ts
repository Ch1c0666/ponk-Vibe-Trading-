import type { ReportLibraryView } from "@/components/common/ReportLibrary";

// ---------------------------------------------------------------------------
// Frontend adapter types — pure data contracts for the AI compute report
// library. No API calls, no real data, no default company/code values.
// ---------------------------------------------------------------------------

/** Query parameters the UI may eventually send to a provider. */
export interface ReportLibraryQuery {
  segmentKey?: string;
  keyword?: string;
  fromDate?: string;
  toDate?: string;
  sort?: "date_desc" | "date_asc";
}

/** A non-fatal warning from the provider layer. */
export interface ProviderWarning {
  code: string;
  message: string;
  page?: number;
  sourceCode?: string;
}

/** A single report row from the provider — all fields are display-only. */
export interface ProviderReportRow {
  id: string;
  title: string;
  brokerage: string;
  analyst: string | null;
  publishDate: string;
  rating: string | null;
  segmentKey: string;
}

/** Top-level envelope returned by a provider (or mock). */
export interface ProviderReportEnvelope {
  ok: boolean;
  reports?: ProviderReportRow[];
  total?: number;
  partial?: boolean;
  warnings?: ProviderWarning[];
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// toReportLibraryView — pure function, no side effects.
// ---------------------------------------------------------------------------

/**
 * Transform a provider envelope into a {@link ReportLibraryView} state.
 *
 * Rules:
 * - ``ok: false`` → ``error``
 * - ``ok: true`` with empty / missing ``reports`` → ``empty``
 * - ``ok: true`` + ``partial: true`` → ``partial`` (warnings preserved)
 * - ``ok: true`` + non-empty ``reports`` → ``data``
 * - ``total`` defaults to ``reports.length`` when absent
 * - ``shown`` is always ``reports.length``
 */
export function toReportLibraryView(
  envelope: ProviderReportEnvelope,
): ReportLibraryView {
  if (!envelope.ok) {
    const err = envelope.error ?? {
      code: "unknown",
      message: "Provider returned an error with no details.",
    };
    return {
      kind: "error",
      errorCode: err.code,
      message: err.message,
    };
  }

  const reports = envelope.reports ?? [];
  const shown = reports.length;
  const total = envelope.total ?? shown;

  if (reports.length === 0) {
    return { kind: "empty" };
  }

  if (envelope.partial) {
    const warnings = (envelope.warnings ?? []).map((w) => ({
      code: w.code,
      message: w.message,
      page: w.page ?? 0,
      sourceCode: w.sourceCode,
    }));
    return { kind: "partial", reports, total, shown, warnings };
  }

  return { kind: "data", reports, total, shown };
}
