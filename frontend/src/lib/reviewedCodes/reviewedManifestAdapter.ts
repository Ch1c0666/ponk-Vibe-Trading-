// ---------------------------------------------------------------------------
// Reviewed-manifest adapter — reads agent/config/reviewed_segment_codes.json
// and filters codes by dataUse.  Kept separate from segmentCodeMap so
// quote-only codes never leak into the ReportLibrary report pipeline.
// ---------------------------------------------------------------------------

export interface ReviewedCodeEntry {
  code: string;
  status: string;
  reason: string;
  source: string;
  reviewer: string;
  reviewedAt: string;
  dataUse?: string[];
  displayName?: string;
  sourceUrl?: string;
  riskNotes?: string;
}

export interface ManifestSegment {
  codes: ReviewedCodeEntry[];
}

export interface ManifestData {
  version: number;
  segments: Record<string, Record<string, ManifestSegment>>;
}

export type DataUseFilter = "quote" | "report" | "news" | "fundamental" | "announcement";

/**
 * Extract codes from a manifest that are approved and whose dataUse includes
 * *filter*.  Returns an empty list when the manifest is absent or unreadable.
 */
export function getReviewedCodes(
  manifest: ManifestData | null,
  scope: string,
  segmentKey: string,
  filter: DataUseFilter,
): string[] {
  if (!manifest?.segments) return [];
  const scopeData = manifest.segments[scope];
  if (!scopeData) return [];
  const segment = scopeData[segmentKey];
  if (!segment?.codes) return [];

  return segment.codes
    .filter(
      (c) =>
        c.status === "approved" &&
        Array.isArray(c.dataUse) &&
        c.dataUse.includes(filter),
    )
    .map((c) => c.code);
}

/**
 * Shorthand: get quote-only approved codes for a segment.
 */
export function getQuoteCodes(
  manifest: ManifestData | null,
  scope: string,
  segmentKey: string,
): string[] {
  return getReviewedCodes(manifest, scope, segmentKey, "quote");
}

/**
 * Shorthand: get report-approved codes for a segment.
 */
export function getReportCodes(
  manifest: ManifestData | null,
  scope: string,
  segmentKey: string,
): string[] {
  return getReviewedCodes(manifest, scope, segmentKey, "report");
}

/** Get codes approved for any non-quote dataUse (news, fundamental, report, announcement). */
export function getNonQuoteCodes(
  manifest: ManifestData | null,
  scope: string,
  segmentKey: string,
): string[] {
  if (!manifest?.segments) return [];
  const scopeData = manifest.segments[scope];
  if (!scopeData) return [];
  const segment = scopeData[segmentKey];
  if (!segment?.codes) return [];

  const nonQuote: DataUseFilter[] = ["news", "fundamental", "report", "announcement"];
  return segment.codes
    .filter(
      (c) =>
        c.status === "approved" &&
        Array.isArray(c.dataUse) &&
        c.dataUse.some((u) => nonQuote.includes(u as DataUseFilter)),
    )
    .map((c) => c.code);
}
