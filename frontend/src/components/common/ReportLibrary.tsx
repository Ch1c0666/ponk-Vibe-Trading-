import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Calendar,
  FileSearch,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  SortAsc,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// State types — each state is a discriminated union variant.
// All data fields accept only mock / placeholder values; real company names,
// stock codes, or report content are forbidden.
// ---------------------------------------------------------------------------

/** A single mock-only report card. All fields are placeholder strings. */
export interface MockReportCard {
  id: string;
  title: string;
  brokerage: string;
  analyst: string | null;
  publishDate: string;
  rating: string | null;
  segmentKey: string;
}

export interface ReportWarning {
  code: string;
  message: string;
  page: number;
}

export type ReportLibraryView =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error"; errorCode: string; message: string }
  | {
      kind: "data";
      reports: MockReportCard[];
      total: number;
      shown: number;
    }
  | {
      kind: "partial";
      reports: MockReportCard[];
      total: number;
      shown: number;
      warnings: ReportWarning[];
    };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportLibraryProps {
  /** Which state to render. Defaults to empty when omitted. */
  view?: ReportLibraryView;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ReportLibrary({ view }: ReportLibraryProps) {
  const { t } = useTranslation();
  const state: ReportLibraryView = view ?? { kind: "empty" };

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {t("aiComputing.reportsDesc")}
      </p>

      {/* Toolbar — enabled only when data may be available */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            disabled={state.kind === "empty" || state.kind === "loading"}
            placeholder={t("aiComputing.reports.searchPlaceholder")}
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm",
              state.kind === "empty" || state.kind === "loading"
                ? "text-muted-foreground"
                : "text-muted-foreground",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>{t("aiComputing.reports.filterSegment")}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{t("aiComputing.reports.filterDate")}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <SortAsc className="h-3.5 w-3.5" />
            <span>{t("aiComputing.reports.sort")}</span>
          </div>
        </div>
      </div>

      {/* State body */}
      {state.kind === "empty" && <EmptyState />}
      {state.kind === "loading" && <LoadingState />}
      {state.kind === "error" && (
        <ErrorState errorCode={state.errorCode} message={state.message} />
      )}
      {state.kind === "data" && (
        <DataState
          reports={state.reports}
          total={state.total}
          shown={state.shown}
        />
      )}
      {state.kind === "partial" && (
        <PartialState
          reports={state.reports}
          total={state.total}
          shown={state.shown}
          warnings={state.warnings}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <FileSearch className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-medium">
        {t("aiComputing.reports.emptyTitle")}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t("aiComputing.reports.emptyDesc")}
      </p>
    </div>
  );
}

function LoadingState() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground/60">
        {t("aiComputing.reports.count", { shown: 0, total: 0 })}
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("aiComputing.reports.loadingText")}
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  errorCode,
  message,
}: {
  errorCode: string;
  message: string;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="text-sm text-muted-foreground/60">
        {t("aiComputing.reports.count", { shown: 0, total: 0 })}
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <h2 className="mt-3 text-lg font-medium">
          {t("aiComputing.reports.errorTitle")}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {t("aiComputing.reports.errorDesc", { code: errorCode, message })}
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-muted"
          disabled
        >
          <RefreshCw className="h-4 w-4" />
          {t("aiComputing.reports.retry")}
        </button>
      </div>
    </>
  );
}

function DataState({
  reports,
  total,
  shown,
}: {
  reports: MockReportCard[];
  total: number;
  shown: number;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="text-sm text-muted-foreground/60">
        {t("aiComputing.reports.count", { shown, total })}
      </div>
      <ReportCardList reports={reports} />
    </>
  );
}

function PartialState({
  reports,
  total,
  shown,
  warnings,
}: {
  reports: MockReportCard[];
  total: number;
  shown: number;
  warnings: ReportWarning[];
}) {
  const { t } = useTranslation();

  return (
    <>
      {/* Warning banner */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          {t("aiComputing.reports.partialBanner")}
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {warnings.map((w, i) => (
            <li key={i}>
              [{w.code}] {w.message}
            </li>
          ))}
        </ul>
      </div>

      <div className="text-sm text-muted-foreground/60">
        {t("aiComputing.reports.count", { shown, total })}
      </div>
      <ReportCardList reports={reports} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Report card list
// ---------------------------------------------------------------------------
function ReportCardList({ reports }: { reports: MockReportCard[] }) {
  const { t } = useTranslation();

  const segmentLabels: Record<string, string> = {
    computeChip: "aiComputing.segments.computeChip",
    hbm: "aiComputing.segments.hbm",
    opticalModule: "aiComputing.segments.opticalModule",
    pcb: "aiComputing.segments.pcb",
    switchChip: "aiComputing.segments.switchChip",
    liquidCooling: "aiComputing.segments.liquidCooling",
    mlcc: "aiComputing.segments.mlcc",
    glassSubstrate: "aiComputing.segments.glassSubstrate",
  };

  return (
    <div className="grid gap-3">
      {reports.map((report) => (
        <article
          key={report.id}
          className="rounded-md border p-4 transition hover:border-primary/40 hover:bg-muted/30"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                  {t(segmentLabels[report.segmentKey] as any) ?? report.segmentKey}
                </span>
                {report.rating && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {report.rating}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-medium leading-snug">
                {report.title}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{report.brokerage}</span>
                {report.analyst && <span>{report.analyst}</span>}
                <span>{report.publishDate}</span>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
