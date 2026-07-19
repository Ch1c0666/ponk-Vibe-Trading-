// ---------------------------------------------------------------------------
// ReviewedAStockDataPanel — reusable panel for reviewed A-share data.
// Reads codes from reviewed manifest via dataUse filters.
// No auto-fetch.  No raw JSON dump.  No quote for non-quote codes.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { REVIEWED_SEGMENT_CODES } from "@/lib/reviewedCodes/reviewedSegmentCodes";
import { getQuoteCodes, getNonQuoteCodes } from "@/lib/reviewedCodes/reviewedManifestAdapter";
import { loadAStockData, type AStockDataEnvelope } from "@/lib/reviewedCodes/aStockDataService";
import {
  loadStockQuote,
  type StockQuoteEnvelope,
} from "@/lib/reviewedCodes/stockQuoteService";

// -- helpers ---------------------------------------------------------------

function FamilySection({
  label,
  family,
  pendingLabel,
  renderItem,
  dataKey,
  defaultExpanded = 5,
}: {
  label: string;
  family?: { ok: boolean; data?: unknown; error?: string; error_code?: string };
  pendingLabel: string;
  renderItem: (item: Record<string, unknown>) => React.ReactNode;
  dataKey?: string;
  defaultExpanded?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!family) return null;
  if (!family.ok) {
    return (
      <div className="text-xs">
        <span className="font-medium">{label}: </span>
        <span className="text-amber-600">
          {family.error_code === "code_not_reviewed" ? pendingLabel : family.error || "—"}
        </span>
      </div>
    );
  }
  const rawData = family.data;
  let items: unknown[] = [];
  if (Array.isArray(rawData)) items = rawData;
  else if (dataKey && rawData && typeof rawData === "object") {
    const nested = (rawData as Record<string, unknown>)[dataKey];
    if (Array.isArray(nested)) items = nested;
  }
  const shown = expanded ? items : items.slice(0, defaultExpanded);
  return (
    <div className="text-xs">
      <span className="font-medium">{label} ({items.length})</span>
      {items.length === 0 ? (
        <span className="text-muted-foreground/50 ml-1">—</span>
      ) : (
        <div className="mt-1 space-y-1.5 text-muted-foreground ml-2 border-l-2 border-muted pl-2">
          {shown.map((item, i) => (
            <div key={i}>{renderItem(item as Record<string, unknown>)}</div>
          ))}
          {items.length > defaultExpanded && (
            <button type="button" onClick={() => setExpanded(!expanded)} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground">
              {expanded ? "▲ collapse" : `▼ +${items.length - defaultExpanded} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FinancialTable({ title, items }: { title: string; items: Record<string, unknown>[] }) {
  if (items.length === 0) return null;
  const keySet = new Set<string>();
  for (const item of items) Object.keys(item).forEach((k) => keySet.add(k));
  const fields = ["report_period", ...Array.from(keySet).filter((k) => k !== "report_period")];
  const [showAll, setShowAll] = useState(false);
  const visibleFields = showAll ? fields : fields.slice(0, 8);
  return (
    <div className="text-xs">
      <div className="font-medium text-muted-foreground mb-1">{title} ({items.length})</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b">
              {visibleFields.map((f) => (
                <th key={f} className="text-left px-1 py-0.5 font-medium text-muted-foreground/70 whitespace-nowrap">{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 5).map((row, i) => (
              <tr key={i} className="border-b border-muted/30">
                {visibleFields.map((f) => (
                  <td key={f} className="px-1 py-0.5 whitespace-nowrap">{String(row[f] ?? "—")}</td>
                ))}
              </tr>
            ))}
            {items.length > 5 && (
              <tr><td colSpan={visibleFields.length} className="text-muted-foreground/40 px-1 py-0.5">+{items.length - 5} more periods</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {fields.length > 8 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground mt-1">
          {showAll ? "▲ fewer fields" : `▼ ${fields.length - 8} more fields`}
        </button>
      )}
    </div>
  );
}

// -- component -------------------------------------------------------------

interface ReviewedAStockDataPanelProps {
  scope: "aiComputing" | "humanoidRobot";
  segmentKey: string;
}

export function ReviewedAStockDataPanel({ scope, segmentKey }: ReviewedAStockDataPanelProps) {
  const { t } = useTranslation();

  const quoteCodes = getQuoteCodes(REVIEWED_SEGMENT_CODES, scope, segmentKey);
  const nonQuoteCodes = getNonQuoteCodes(REVIEWED_SEGMENT_CODES, scope, segmentKey);

  const [quoteEnv, setQuoteEnv] = useState<StockQuoteEnvelope | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [dataEnv, setDataEnv] = useState<AStockDataEnvelope | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const hasQuote = quoteCodes.length > 0;
  const hasData = nonQuoteCodes.length > 0;
  if (!hasQuote && !hasData) return null;

  const handleLoadQuote = async () => {
    if (quoteCodes.length === 0) return;
    setQuoteLoading(true);
    setQuoteEnv(await loadStockQuote(quoteCodes[0], { mode: "real" }));
    setQuoteLoading(false);
  };

  const handleLoadData = async () => {
    if (nonQuoteCodes.length === 0) return;
    setDataLoading(true);
    setDataEnv(await loadAStockData(nonQuoteCodes[0], { mode: "real" }));
    setDataLoading(false);
  };

  return (
    <section className="rounded-lg border bg-card p-5 space-y-4">
      {/* Quote card — only for quote-approved codes */}
      {hasQuote && (
        <div className="border-b pb-3">
          <h3 className="text-sm font-semibold mb-2">{t("aiComputing.template.reviewedQuoteLabel")}</h3>
          <div className="text-xs text-muted-foreground mb-2">{quoteCodes[0]}</div>
          {!quoteEnv || quoteLoading ? (
            <button type="button" onClick={handleLoadQuote} disabled={quoteLoading}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50">
              {quoteLoading ? "..." : t("aiComputing.template.reviewedQuoteLoad")}
            </button>
          ) : quoteEnv.ok && quoteEnv.data ? (
            <div className="space-y-1">
              <div className="text-lg font-semibold">{quoteEnv.data.name ?? quoteCodes[0]}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{quoteEnv.data.price?.toFixed(2)}</span>
                {quoteEnv.data.change_pct != null && (
                  <span className={quoteEnv.data.change_pct >= 0 ? "text-emerald-600 text-xs" : "text-red-600 text-xs"}>
                    {quoteEnv.data.change_pct >= 0 ? "+" : ""}{quoteEnv.data.change_pct.toFixed(2)}%
                  </span>
                )}
              </div>
              {quoteEnv.data.pe_ttm != null && <span className="text-xs text-muted-foreground">PE(TTM) {quoteEnv.data.pe_ttm.toFixed(2)}</span>}
              <p className="text-[11px] text-muted-foreground">{t("aiComputing.template.reviewedQuoteDisclaimer")}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{quoteEnv.error ?? "Failed"}</p>
          )}
        </div>
      )}

      {/* Non-quote data — button + structured display */}
      {hasData && (
        <div>
          <h3 className="text-sm font-semibold mb-2">{t("aiComputing.template.reviewedDataLabel")}</h3>
          <div className="text-xs text-muted-foreground mb-2">{nonQuoteCodes[0]}</div>
          {!dataEnv || dataLoading ? (
            <button type="button" onClick={handleLoadData} disabled={dataLoading}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50">
              {dataLoading ? "..." : t("aiComputing.template.reviewedDataLoad")}
            </button>
          ) : dataEnv.ok ? (
            <div className="space-y-4">
              {/* News */}
              <FamilySection
                label={t("aiComputing.template.reviewedDataNews")}
                family={dataEnv.data.news}
                pendingLabel={t("aiComputing.template.reviewedDataPending")}
                renderItem={(item: Record<string, unknown>) => (
                  <div className="leading-relaxed">
                    <span className="font-medium">{String(item.title || "—")}</span>
                    <span className="text-muted-foreground/60 ml-2">{[item.time, item.source].filter(Boolean).join(" · ")}</span>
                  </div>
                )}
              />
              {dataEnv.data.news?.ok && Array.isArray(dataEnv.data.news.data) && (dataEnv.data.news.data as unknown[]).length > 0 && (
                <p className="text-[10px] text-muted-foreground/40 -mt-2">{t("aiComputing.template.reviewedDataNewsNote")}</p>
              )}
              {/* Reports */}
              <FamilySection
                label={t("aiComputing.template.reviewedDataReports")}
                family={dataEnv.data.reports}
                pendingLabel={t("aiComputing.template.reviewedDataPending")}
                dataKey="reports"
                renderItem={(item: Record<string, unknown>) => (
                  <div className="leading-relaxed">
                    <span className="font-medium">{String(item.title || "—")}</span>
                    <span className="text-muted-foreground/60 ml-2">{[item.orgSName, item.researcher, item.publishDate, item.emRatingName].filter(Boolean).join(" · ")}</span>
                  </div>
                )}
              />
              {/* Announcements */}
              <FamilySection
                label={t("aiComputing.template.reviewedDataAnnouncements")}
                family={dataEnv.data.announcements}
                pendingLabel={t("aiComputing.template.reviewedDataPending")}
                renderItem={(item: Record<string, unknown>) => (
                  <div className="leading-relaxed">
                    <span className="font-medium">{String(item.title || "—")}</span>
                    <span className="text-muted-foreground/60 ml-2">{[item.date, item.type].filter(Boolean).join(" · ")}</span>
                  </div>
                )}
              />
              {/* Fundamentals */}
              {dataEnv.data.fundamentals?.ok && (
                <div className="text-xs">
                  <span className="font-medium">{t("aiComputing.template.reviewedDataFundamentals")}</span>
                  <div className="mt-1 space-y-2 text-muted-foreground">
                    {(() => {
                      const d = dataEnv.data.fundamentals.data as Record<string, unknown> | undefined;
                      if (!d) return <span>—</span>;
                      const si = d.stock_info as Record<string, unknown> | undefined;
                      const fr = d.financial_reports as Record<string, unknown[]> | undefined;
                      return (
                        <>
                          {si ? (
                            <div className="text-[11px]">{(si.name || si.code || "—") as string}{si.industry ? ` · ${si.industry}` : ""}</div>
                          ) : (
                            <div className="text-amber-600 text-[11px]">{t("aiComputing.template.reviewedDataStockInfoUnavailable")}</div>
                          )}
                          {fr ? (
                            <div className="space-y-3">
                              <FinancialTable title="Income Statement" items={(fr.income_statement || []) as Record<string, unknown>[]} />
                              <FinancialTable title="Balance Sheet" items={(fr.balance_sheet || []) as Record<string, unknown>[]} />
                              <FinancialTable title="Cash Flow" items={(fr.cash_flow || []) as Record<string, unknown>[]} />
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">{t("aiComputing.template.reviewedDataDisclaimer")}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{dataEnv.error || "Failed"}</p>
          )}
        </div>
      )}
    </section>
  );
}
