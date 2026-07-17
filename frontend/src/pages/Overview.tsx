import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, RefreshCw, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadIndexQuotes,
  type IndexQuoteServiceMode,
} from "@/lib/overview/indexQuoteService";
import {
  toIndexQuoteView,
  type IndexQuoteRow,
  type IndexQuoteView,
} from "@/lib/overview/indexQuoteAdapter";

// ---------------------------------------------------------------------------
// Default mode — "disabled" so no network requests happen automatically.
// The refresh button triggers a one-shot load in the current mode.
// Switch to "mock" or "real" as needed during development.
// ---------------------------------------------------------------------------

const DEFAULT_INDEX_MODE: IndexQuoteServiceMode = "disabled";

// Mapping from Tencent index code to i18n label key (kept local — these are
// well-known benchmark names, not individual stock codes or company names).
const INDEX_LABEL_MAP: Record<string, string> = {
  sh000001: "overview.indices.shanghai",
  sz399001: "overview.indices.shenzhen",
  sz399006: "overview.indices.chinext",
  sh000688: "overview.indices.star50",
};

// ---------------------------------------------------------------------------
// Watchlist table column keys
// ---------------------------------------------------------------------------

const WATCHLIST_COLS = [
  "tableCode",
  "tableName",
  "tablePrice",
  "tableChange",
  "tableActions",
] as const;

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
}: {
  view: IndexQuoteView;
  pendingLabel: string;
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {quotes.map((q) => (
        <IndexCard key={q.code} quote={q} pendingLabel={pendingLabel} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watchlist Table
// ---------------------------------------------------------------------------

function WatchlistTable({
  title,
  emptyLabel,
  addLabel,
}: {
  title: string;
  emptyLabel: string;
  addLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <button
          type="button"
          disabled
          aria-label={addLabel}
          className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground/50 transition-colors cursor-not-allowed select-none"
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              {WATCHLIST_COLS.map((colKey) => (
                <th
                  key={colKey}
                  className="px-3 py-2 font-medium text-muted-foreground"
                >
                  {t(`overview.${colKey}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={WATCHLIST_COLS.length}
                className="px-3 py-12 text-center text-muted-foreground/50"
              >
                <Minus className="mx-auto mb-2 h-5 w-5" />
                {emptyLabel}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Overview() {
  const { t } = useTranslation();
  const [indexView, setIndexView] = useState<IndexQuoteView>({ kind: "disabled" });
  const [loading, setLoading] = useState(false);
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
      const envelope = await loadIndexQuotes({ mode: DEFAULT_INDEX_MODE });
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

            {/* Refresh button — triggers loadIndexQuotes in default mode */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              aria-label={t("overview.refresh")}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
              />
              {t("overview.refresh")}
            </button>
          </div>

          {/* Partial warning banner */}
          {indexView.kind === "partial" && indexView.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              {t("overview.mockRefreshed")}
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
          />
        </section>

        {/* ── A-Share Watchlist ──────────────────────────────────────── */}
        <WatchlistTable
          title={t("overview.aStockWatchlistTitle")}
          emptyLabel={t("overview.watchlistEmpty")}
          addLabel={t("overview.watchlistAdd")}
        />

        {/* ── US Stock Watchlist ─────────────────────────────────────── */}
        <WatchlistTable
          title={t("overview.usStockWatchlistTitle")}
          emptyLabel={t("overview.watchlistEmpty")}
          addLabel={t("overview.watchlistAdd")}
        />
      </div>
    </div>
  );
}
