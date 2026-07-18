import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Cpu,
  FileText,
  GitBranch,
  Globe,
  LayoutTemplate,
  Search,
  Shield,
  Star,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SegmentResearchTemplate,
  type SegmentMeta,
} from "@/components/common/SegmentResearchTemplate";
import { SupplyChainStructure } from "@/components/common/SupplyChainStructure";
import { ReportLibrary, type ReportLibraryView } from "@/components/common/ReportLibrary";
import { loadReportLibrary } from "@/lib/aiComputing/reportLibraryService";
import { toReportLibraryView } from "@/lib/aiComputing/reportLibraryAdapter";
import { segmentCodeMap, type AiComputingSegmentKey } from "@/lib/aiComputing/segmentCodeMap";
import {
  loadStockQuote,
  type StockQuoteEnvelope,
} from "@/lib/reviewedCodes/stockQuoteService";
import { getQuoteCodes, getNonQuoteCodes } from "@/lib/reviewedCodes/reviewedManifestAdapter";
import {
  loadAStockData,
  type AStockDataEnvelope,
} from "@/lib/reviewedCodes/aStockDataService";
import { REVIEWED_SEGMENT_CODES } from "@/lib/reviewedCodes/reviewedSegmentCodes";

// ---------------------------------------------------------------------------
// Sub-tab definitions
// ---------------------------------------------------------------------------
const TABS = [
  { key: "overview", icon: Search, labelKey: "aiComputing.tabs.overview" },
  { key: "templates", icon: LayoutTemplate, labelKey: "aiComputing.tabs.templates" },
  { key: "reports", icon: FileText, labelKey: "aiComputing.tabs.reports" },
  { key: "structure", icon: GitBranch, labelKey: "aiComputing.tabs.structure" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ---------------------------------------------------------------------------
// 8 supply-chain segment cards — placeholder only, no real data
// ---------------------------------------------------------------------------
const SEGMENTS: SegmentMeta[] = [
  { key: "computeChip", labelKey: "aiComputing.segments.computeChip" },
  { key: "hbm", labelKey: "aiComputing.segments.hbm" },
  { key: "opticalModule", labelKey: "aiComputing.segments.opticalModule" },
  { key: "pcb", labelKey: "aiComputing.segments.pcb" },
  { key: "switchChip", labelKey: "aiComputing.segments.switchChip" },
  { key: "liquidCooling", labelKey: "aiComputing.segments.liquidCooling" },
  { key: "mlcc", labelKey: "aiComputing.segments.mlcc" },
  { key: "glassSubstrate", labelKey: "aiComputing.segments.glassSubstrate" },
];

const SEGMENT_MAP = new Map<string, SegmentMeta>(
  SEGMENTS.map((s) => [s.key, s]),
);

/** Field labels shown on each overview card — aligned with TEMPLATE_SECTIONS. */
const OVERVIEW_FIELDS = [
  { icon: Target, labelKey: "aiComputing.template.positioning" },
  { icon: Globe, labelKey: "aiComputing.template.intlLandscape" },
  { icon: Building2, labelKey: "aiComputing.template.domesticLandscape" },
  { icon: Shield, labelKey: "aiComputing.template.barrierType" },
  { icon: Star, labelKey: "aiComputing.template.scoringSystem" },
];

// ---------------------------------------------------------------------------
// Page — dispatches between tab-layout and segment-detail based on route
// ---------------------------------------------------------------------------
export function AIComputingPower() {
  const { segmentKey } = useParams<{ segmentKey?: string }>();

  // Detail mode — segmentKey present in the URL
  if (segmentKey) {
    const segment = SEGMENT_MAP.get(segmentKey);
    if (segment) {
      return <SegmentDetailView segment={segment} />;
    }
    return <InvalidSegmentView segmentKey={segmentKey} />;
  }

  // Tab mode — no segmentKey
  return <TabLayout />;
}

// ---------------------------------------------------------------------------
// Tab layout (exact same as before — extracted to keep detail view clean)
// ---------------------------------------------------------------------------
function TabLayout() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* ---- Header ---- */}
        <section className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              {t("aiComputing.badge")}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("aiComputing.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t("aiComputing.subtitle")}
              </p>
            </div>
          </div>
        </section>

        {/* ---- Sub-tabs ---- */}
        <nav className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
          {TABS.map(({ key, icon: Icon, labelKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </button>
          ))}
        </nav>

        {/* ---- Tab content ---- */}
        <section className="min-h-[50vh]">
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "templates" && <TemplatesTab />}
          {activeTab === "reports" && <ReportsTab />}
          {activeTab === "structure" && <StructureTab />}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper — renders a family section with item list or status
function FamilySection({
  label,
  family,
  pendingLabel,
  renderItem,
  dataKey,
}: {
  label: string;
  family?: { ok: boolean; data?: unknown; error?: string; error_code?: string };
  pendingLabel: string;
  renderItem: (item: Record<string, unknown>) => React.ReactNode;
  dataKey?: string;
}) {
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
  if (Array.isArray(rawData)) {
    items = rawData;
  } else if (dataKey && rawData && typeof rawData === "object") {
    const nested = (rawData as Record<string, unknown>)[dataKey];
    if (Array.isArray(nested)) items = nested;
  }

  return (
    <div className="text-xs">
      <span className="font-medium">{label}</span>
      {items.length === 0 ? (
        <span className="text-muted-foreground/50 ml-1">—</span>
      ) : (
        <div className="mt-1 space-y-1 text-muted-foreground ml-2 border-l-2 border-muted pl-2">
          {items.slice(0, 5).map((item, i) => (
            <div key={i}>{renderItem(item as Record<string, unknown>)}</div>
          ))}
          {items.length > 5 && (
            <div className="text-muted-foreground/40">+{items.length - 5} more</div>
          )}
        </div>
      )}
    </div>
  );
}

// Segment detail view — shown at /ai-computing/:segmentKey
// ---------------------------------------------------------------------------
function SegmentDetailView({ segment }: { segment: SegmentMeta }) {
  const { t } = useTranslation();
  const [quoteEnv, setQuoteEnv] = useState<StockQuoteEnvelope | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const reviewedQuoteCodes = getQuoteCodes(
    REVIEWED_SEGMENT_CODES,
    "aiComputing",
    segment.key,
  );

  const nonQuoteCodes = getNonQuoteCodes(
    REVIEWED_SEGMENT_CODES,
    "aiComputing",
    segment.key,
  );

  // -- A-stock data panel state ------------------------------------------------
  const [dataEnv, setDataEnv] = useState<AStockDataEnvelope | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const handleLoadQuote = async () => {
    if (reviewedQuoteCodes.length === 0) return;
    setQuoteLoading(true);
    const env = await loadStockQuote(reviewedQuoteCodes[0], { mode: "real" });
    setQuoteEnv(env);
    setQuoteLoading(false);
  };

  const handleLoadData = async () => {
    if (nonQuoteCodes.length === 0) return;
    setDataLoading(true);
    const env = await loadAStockData(nonQuoteCodes[0], { mode: "real" });
    setDataEnv(env);
    setDataLoading(false);
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* Back link */}
        <Link
          to="/ai-computing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("aiComputing.detail.backToOverview")}
        </Link>

        {/* Header */}
        <section className="flex flex-col gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              {t("aiComputing.badge")}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t(segment.labelKey as any)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("aiComputing.detail.subtitle")}
            </p>
          </div>
        </section>

        {/* Reviewed quote card — only when reviewed codes exist */}
        {reviewedQuoteCodes.length > 0 && (
          <section className="rounded-lg border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">
              {t("aiComputing.template.reviewedQuoteLabel")}
            </h3>

            {!quoteEnv || quoteLoading ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {reviewedQuoteCodes[0]} — {t("aiComputing.template.reviewedQuoteLoad")}
                </p>
                <button
                  type="button"
                  onClick={handleLoadQuote}
                  disabled={quoteLoading}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
                >
                  {quoteLoading ? "..." : t("aiComputing.template.reviewedQuoteLoad")}
                </button>
              </div>
            ) : quoteEnv.ok && quoteEnv.data ? (
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold">{quoteEnv.data.name ?? reviewedQuoteCodes[0]}</span>
                  <span className="text-xs text-muted-foreground">{quoteEnv.code}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">{quoteEnv.data.price?.toFixed(2)}</span>
                  {quoteEnv.data.change_pct != null && (
                    <span className={quoteEnv.data.change_pct >= 0 ? "text-emerald-600 text-xs" : "text-red-600 text-xs"}>
                      {quoteEnv.data.change_pct >= 0 ? "+" : ""}{quoteEnv.data.change_pct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("aiComputing.template.reviewedQuoteDisclaimer")}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{quoteEnv.error ?? "Failed to load"}</p>
            )}
          </section>
        )}

        {/* Reviewed A-share data panel — non-quote families */}
        {nonQuoteCodes.length > 0 && (
          <section className="rounded-lg border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">
              {t("aiComputing.template.reviewedDataLabel")}
            </h3>

            {!dataEnv || dataLoading ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {nonQuoteCodes[0]}
                </p>
                <button
                  type="button"
                  onClick={handleLoadData}
                  disabled={dataLoading}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
                >
                  {dataLoading ? "..." : t("aiComputing.template.reviewedDataLoad")}
                </button>
              </div>
            ) : dataEnv.ok ? (
              <div className="space-y-4">
                {/* News */}
                <FamilySection
                  label={t("aiComputing.template.reviewedDataNews")}
                  family={dataEnv.data.news}
                  pendingLabel={t("aiComputing.template.reviewedDataPending")}
                  renderItem={(item: Record<string, unknown>) => (
                    <div className="text-xs leading-relaxed">
                      <span className="font-medium">{String(item.title || "—")}</span>
                      <span className="text-muted-foreground/60 ml-2">
                        {[item.time, item.source].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  )}
                />
                {dataEnv.data.news?.ok && Array.isArray(dataEnv.data.news.data) && dataEnv.data.news.data.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/40 -mt-2">
                    {t("aiComputing.template.reviewedDataNewsNote")}
                  </p>
                )}
                {/* Reports */}
                <FamilySection
                  label={t("aiComputing.template.reviewedDataReports")}
                  family={dataEnv.data.reports}
                  pendingLabel={t("aiComputing.template.reviewedDataPending")}
                  renderItem={(item: Record<string, unknown>) => (
                    <div className="text-xs leading-relaxed">
                      <span className="font-medium">{String(item.title || "—")}</span>
                      <span className="text-muted-foreground/60 ml-2">
                        {[item.orgSName, item.researcher, item.publishDate, item.emRatingName].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  )}
                  dataKey="reports"
                />
                {/* Fundamentals */}
                <div className="text-xs">
                  <span className="font-medium">{t("aiComputing.template.reviewedDataFundamentals")}</span>
                  {dataEnv.data.fundamentals?.ok ? (
                    <div className="mt-1 space-y-1 text-muted-foreground">
                      {(() => {
                        const d = dataEnv.data.fundamentals.data as Record<string, unknown> | undefined;
                        if (!d) return <span>—</span>;
                        const si = d.stock_info as Record<string, unknown> | undefined;
                        const fr = d.financial_reports as Record<string, unknown[]> | undefined;
                        return (
                          <>
                            {si ? (
                              <div>{(si.name || si.code || "—") as string}{si.industry ? ` · ${si.industry}` : ""}</div>
                            ) : (
                              <div className="text-amber-600">{t("aiComputing.template.reviewedDataStockInfoUnavailable")}</div>
                            )}
                            {fr ? (
                              <div>
                                {(["income_statement","balance_sheet","cash_flow"] as const).map((k) => {
                                  const items = fr[k] || [];
                                  const latest = items[0] as Record<string, unknown> | undefined;
                                  return (
                                    <div key={k} className="ml-2">
                                      {k === "income_statement" ? "Income" : k === "balance_sheet" ? "Balance" : "Cash Flow"}
                                      : {items.length}期{latest?.report_period ? ` · 最新 ${String(latest.report_period)}` : ""}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className="text-amber-600 ml-1">
                      {dataEnv.data.fundamentals?.error_code === "code_not_reviewed"
                        ? t("aiComputing.template.reviewedDataPending")
                        : dataEnv.data.fundamentals?.error || "—"}
                    </span>
                  )}
                </div>
                {/* Announcements */}
                <FamilySection
                  label={t("aiComputing.template.reviewedDataAnnouncements")}
                  family={dataEnv.data.announcements}
                  pendingLabel={t("aiComputing.template.reviewedDataPending")}
                  renderItem={(item: Record<string, unknown>) => (
                    <div className="text-xs leading-relaxed">
                      <span className="font-medium">{String(item.title || "—")}</span>
                      <span className="text-muted-foreground/60 ml-2">
                        {[item.date, item.type].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("aiComputing.template.reviewedDataDisclaimer")}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{dataEnv.error || "Failed to load"}</p>
            )}
          </section>
        )}

        {/* 6-section research framework */}
        <SegmentResearchTemplate segment={segment} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invalid segment view — safe fallback for unknown segmentKey values
// ---------------------------------------------------------------------------
function InvalidSegmentView({ segmentKey }: { segmentKey: string }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Link
          to="/ai-computing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("aiComputing.detail.backToOverview")}
        </Link>

        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-medium">
            {t("aiComputing.detail.invalidTitle")}
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {t("aiComputing.detail.invalidDesc", { key: segmentKey })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — 8 segment cards with field labels (clickable → detail page)
// ---------------------------------------------------------------------------
function OverviewTab() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("aiComputing.overviewDesc")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SEGMENTS.map((segment) => (
          <Link
            key={segment.key}
            to={`/ai-computing/${segment.key}`}
            className="group rounded-lg border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm block"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Cpu className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">{t(segment.labelKey as any)}</h3>
            </div>
            {/* Field labels aligned with template sections */}
            <ul className="space-y-1.5 mb-3">
              {OVERVIEW_FIELDS.map(({ icon: Icon, labelKey }) => (
                <li
                  key={labelKey}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Icon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  {t(labelKey as any)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground/60 italic">
              {t("aiComputing.placeholder")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates tab — segment selector + full research framework
// ---------------------------------------------------------------------------
function TemplatesTab() {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState(SEGMENTS[0].key);

  const active = SEGMENTS.find((s) => s.key === selectedKey) ?? SEGMENTS[0];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("aiComputing.templatesDesc")}
      </p>

      {/* Segment picker */}
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={() => setSelectedKey(segment.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              selectedKey === segment.key
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {t(segment.labelKey as any)}
          </button>
        ))}
      </div>

      {/* Reusable template for the active segment */}
      <SegmentResearchTemplate segment={active} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports tab — segment selector + real-mode ReportLibrary via segmentCodeMap
// ---------------------------------------------------------------------------
function ReportsTab() {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState(SEGMENTS[0].key);
  const [view, setView] = useState<ReportLibraryView>({ kind: "empty" });

  useEffect(() => {
    let cancelled = false;
    const codes = segmentCodeMap[selectedKey as AiComputingSegmentKey] ?? [];

    // codes is always empty until segmentCodeMap is populated — fail-closed.
    loadReportLibrary(
      { codes: [...codes], segmentKey: selectedKey },
      { mode: "real" },
    ).then((envelope) => {
      if (!cancelled) setView(toReportLibraryView(envelope));
    }).catch(() => {
      if (!cancelled) setView({ kind: "error", errorCode: "client_error", message: "Failed to load reports." });
    });

    return () => { cancelled = true; };
  }, [selectedKey]);

  const codes = segmentCodeMap[selectedKey as AiComputingSegmentKey] ?? [];
  const hasCodes = codes.length > 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("aiComputing.reportsDesc")}
      </p>

      {/* Stock-level aggregation notice — persistent, not dismissible */}
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        {t("aiComputing.reports.aggregationNotice")}
      </div>

      {/* Code list audit status */}
      {!hasCodes && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          {t("aiComputing.reports.codesPendingReview")}
        </div>
      )}

      {/* Segment picker */}
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={() => setSelectedKey(segment.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              selectedKey === segment.key
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {t(segment.labelKey as any)}
          </button>
        ))}
      </div>

      <ReportLibrary view={view} descriptionKey="aiComputing.reportsDesc" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structure tab — static supply chain diagram (upstream → downstream)
// ---------------------------------------------------------------------------
function StructureTab() {
  return (
    <div className="py-4">
      <SupplyChainStructure />
    </div>
  );
}
