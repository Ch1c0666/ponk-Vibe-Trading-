import { useTranslation } from "react-i18next";
import { Calendar, FileSearch, Filter, Search, SortAsc } from "lucide-react";

// ---------------------------------------------------------------------------
// Report library shell — search, filter, sort controls wired to empty state.
// No real data, no API calls, no report content.
// ---------------------------------------------------------------------------

export function ReportLibrary() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {t("aiComputing.reportsDesc")}
      </p>

      {/* Toolbar — filter/sort controls, all non-functional */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <label className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            disabled
            placeholder={t("aiComputing.reports.searchPlaceholder")}
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segment filter */}
          <div className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>{t("aiComputing.reports.filterSegment")}</span>
          </div>

          {/* Date filter */}
          <div className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{t("aiComputing.reports.filterDate")}</span>
          </div>

          {/* Sort */}
          <div className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <SortAsc className="h-3.5 w-3.5" />
            <span>{t("aiComputing.reports.sort")}</span>
          </div>
        </div>
      </div>

      {/* Count bar */}
      <div className="text-sm text-muted-foreground/60">
        {t("aiComputing.reports.count", { shown: 0, total: 0 })}
      </div>

      {/* Empty state */}
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
    </div>
  );
}
