import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadIndexQuotes,
} from "@/lib/overview/indexQuoteService";
import {
  toIndexQuoteView,
  type IndexQuoteRow,
  type IndexQuoteView,
} from "@/lib/overview/indexQuoteAdapter";
import { WatchlistSection } from "@/components/watchlist/WatchlistSection";
import { loadWatchlistData } from "@/lib/watchlist/watchlistStorage";
import type { WatchlistData } from "@/lib/watchlist/watchlistTypes";

// ---------------------------------------------------------------------------
// Default: no auto-load.  The "Load live indices" button explicitly uses
// real mode via loadIndexQuotes({ mode: "real" }).
// ---------------------------------------------------------------------------

// Mapping from Tencent index code to i18n label key (kept local — these are
// well-known benchmark names, not individual stock codes or company names).
const INDEX_LABEL_MAP: Record<string, string> = {
  sh000001: "overview.indices.shanghai",
  sz399001: "overview.indices.shenzhen",
  sz399006: "overview.indices.chinext",
  sh000688: "overview.indices.star50",
};

// ---------------------------------------------------------------------------
// Index Card
// ---------------------------------------------------------------------------

function IndexCard({
  quote,
  pendingLabel,
}: {
  quote: IndexQuoteRow;
  pendingLabel: string;
}) {
  const { t } = useTranslation();
  const labelKey = INDEX_LABEL_MAP[quote.code] ?? quote.code;
  const hasData = quote.price !== null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <span className="text-xs font-medium text-muted-foreground">
        {t(labelKey as any)}
      </span>

      {hasData ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {quote.price!.toFixed(2)}
            </span>
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                (quote.change_pct ?? 0) >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {quote.change_pct !== null
                ? `${quote.change_pct >= 0 ? "+" : ""}${quote.change_pct.toFixed(2)}%`
                : "—"}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-muted-foreground/50">
              —
            </span>
            <span className="text-xs text-muted-foreground/50">—</span>
          </div>
        </>
      )}

      <span className="text-[11px] text-muted-foreground/60">
        {pendingLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Index card grid — consumes IndexQuoteView
// ---------------------------------------------------------------------------

function IndexCardGrid({
  view,
  pendingLabel,
  sourceLabel,
}: {
  view: IndexQuoteView;
  pendingLabel: string;
  sourceLabel: string;
}) {
  if (view.kind === "disabled") {
    // Show placeholder cards — no data loaded yet
    const codes = Object.keys(INDEX_LABEL_MAP);
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {codes.map((code) => (
          <IndexCard
            key={code}
            quote={{
              code,
              name: "",
              price: null,
              prev_close: null,
              open: null,
              high: null,
              low: null,
              change_pct: null,
            }}
            pendingLabel={pendingLabel}
          />
        ))}
      </div>
    );
  }

  if (view.kind === "loading") {
    // Skeleton placeholders
    const codes = Object.keys(INDEX_LABEL_MAP);
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {codes.map((code) => (
          <div
            key={code}
            className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm animate-pulse"
          >
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-7 w-20 rounded bg-muted" />
            <div className="h-3 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (view.kind === "error" || view.kind === "empty") {
    const codes = Object.keys(INDEX_LABEL_MAP);
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {codes.map((code) => (
          <IndexCard
            key={code}
            quote={{
              code,
              name: "",
              price: null,
              prev_close: null,
              open: null,
              high: null,
              low: null,
              change_pct: null,
            }}
            pendingLabel={view.kind === "error" ? view.message : pendingLabel}
          />
        ))}
      </div>
    );
  }

  // data / partial — render real or partial quote rows
  const quotes = view.quotes;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quotes.map((q) => (
          <IndexCard key={q.code} quote={q} pendingLabel={pendingLabel} />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground/60">
        {sourceLabel}: {view.source}
        {view.timestamp && ` · ${view.timestamp.slice(0, 19).replace("T", " ")}`}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Overview() {
  const { t } = useTranslation();
  const [indexView, setIndexView] = useState<IndexQuoteView>({ kind: "disabled" });
  const [loading, setLoading] = useState(false);
  const [watchlistData, setWatchlistData] = useState<WatchlistData>(() => loadWatchlistData());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the mock-refresh timer on unmount.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setIndexView({ kind: "loading" });
    try {
      const envelope = await loadIndexQuotes({ mode: "real" });
      setIndexView(toIndexQuoteView(envelope));
    } catch {
      setIndexView({
        kind: "error",
        errorCode: "client_error",
        message: t("overview.mockRefreshed"),
      });
    } finally {
      setLoading(false);
    }
  }, [loading, t]);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 border-b pb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <LayoutDashboard className="h-3.5 w-3.5" />
                {t("overview.badge")}
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {t("overview.title")}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {t("overview.subtitle")}
                </p>
              </div>
            </div>

            {/* Refresh button — triggers loadIndexQuotes in real mode */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              aria-label={t("overview.loadLive")}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
              {loading ? t("overview.indicesPending") : t("overview.loadLive")}
            </button>
          </div>

          {/* Partial warning banner */}
          {indexView.kind === "partial" && indexView.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              {t("overview.partialWarning")}
            </div>
          )}
        </section>

        {/* ── Index Cards ────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("overview.indicesTitle")}
          </h2>
          <IndexCardGrid
            view={indexView}
            pendingLabel={t("overview.indicesPending")}
            sourceLabel={t("overview.sourceLabel")}
          />
          <p className="text-[11px] text-muted-foreground/50">
            {t("overview.disclaimer")}
          </p>
        </section>

        {/* ── A-Share Watchlist ──────────────────────────────────────── */}
        <WatchlistSection
          market="a"
          title={t("overview.aStockWatchlistTitle")}
          data={watchlistData}
          onChange={setWatchlistData}
        />

        {/* ── US Stock Watchlist ─────────────────────────────────────── */}
        <WatchlistSection
          market="us"
          title={t("overview.usStockWatchlistTitle")}
          data={watchlistData}
          onChange={setWatchlistData}
        />
      </div>
    </div>
  );
}
