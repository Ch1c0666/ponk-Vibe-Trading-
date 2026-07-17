// ---------------------------------------------------------------------------
// Index quote data layer — types + pure adapter function.
// No side effects.  No env reads.  No network calls.
// ---------------------------------------------------------------------------

/** A single index quote row from the provider. */
export interface IndexQuoteRow {
  code: string;
  name: string;
  price: number | null;
  prev_close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change_pct: number | null;
}

/** A non-fatal warning from the provider. */
export interface IndexQuoteWarning {
  code: string;
  message: string;
  index_code: string;
}

/** Top-level provider envelope. */
export interface IndexQuoteEnvelope {
  ok: boolean;
  source?: string;
  timestamp?: string;
  data?: {
    quotes: IndexQuoteRow[];
    partial: boolean;
    warnings: IndexQuoteWarning[];
  };
  error?: string;
  error_code?: string;
}

// ---------------------------------------------------------------------------
// View state — discriminated union consumed by the Overview page
// ---------------------------------------------------------------------------

export type IndexQuoteView =
  | { kind: "disabled" }
  | { kind: "loading" }
  | { kind: "empty" }
  | {
      kind: "data";
      quotes: IndexQuoteRow[];
      source: string;
      timestamp: string;
    }
  | {
      kind: "partial";
      quotes: IndexQuoteRow[];
      source: string;
      timestamp: string;
      warnings: IndexQuoteWarning[];
    }
  | {
      kind: "error";
      errorCode: string;
      message: string;
    };

// ---------------------------------------------------------------------------
// toIndexQuoteView — pure function
// ---------------------------------------------------------------------------

/**
 * Transform a provider envelope into an {@link IndexQuoteView} state.
 *
 * Rules:
 * - ``ok: false`` → ``error``
 * - ``ok: true``, no data / empty quotes → ``empty``
 * - ``ok: true`` + ``partial: true`` → ``partial`` (warnings preserved)
 * - ``ok: true`` + non-empty quotes → ``data``
 */
export function toIndexQuoteView(
  envelope: IndexQuoteEnvelope,
): IndexQuoteView {
  if (!envelope.ok) {
    return {
      kind: "error",
      errorCode: envelope.error_code ?? "unknown",
      message: envelope.error ?? "Provider returned an error with no details.",
    };
  }

  const data = envelope.data;
  if (!data || !data.quotes || data.quotes.length === 0) {
    return { kind: "empty" };
  }

  const source = envelope.source ?? "unknown";
  const timestamp = envelope.timestamp ?? "";

  if (data.partial) {
    return {
      kind: "partial",
      quotes: data.quotes,
      source,
      timestamp,
      warnings: data.warnings ?? [],
    };
  }

  return { kind: "data", quotes: data.quotes, source, timestamp };
}
