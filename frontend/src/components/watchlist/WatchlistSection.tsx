// ---------------------------------------------------------------------------
// WatchlistSection — per-market watchlist UI with add / remove / notes and
// manual quote loading.  State is owned by the parent; this component filters
// by market and calls onChange to propagate updates.  Quote state is runtime-
// only (not persisted); it starts idle and only updates on user request.
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Minus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveWatchlistData, addWatchlistEntry, removeWatchlistEntry } from "@/lib/watchlist/watchlistStorage";
import { loadWatchlistQuotes } from "@/lib/watchlist/watchlistService";
import type { WatchlistData, WatchlistQuoteState } from "@/lib/watchlist/watchlistTypes";
import { AddCodeDialog } from "./AddCodeDialog";

interface WatchlistSectionProps {
  market: "a" | "us";
  title: string;
  /** Full watchlist data owned by the parent. */
  data: WatchlistData;
  /** Called with the updated data after add / remove. */
  onChange: (data: WatchlistData) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPriceCell(quote: WatchlistQuoteState, idleLabel: string, loadingLabel: string, notReviewedLabel: string) {
  switch (quote.kind) {
    case "idle":
      return <span className="text-muted-foreground/50">{idleLabel}</span>;
    case "loading":
      return <span className="text-muted-foreground/50 animate-pulse">{loadingLabel}</span>;
    case "loaded":
      return (
        <span className="tabular-nums">
          {quote.data.price !== null ? quote.data.price.toFixed(2) : "—"}
        </span>
      );
    case "not_reviewed":
      return <span className="text-amber-600 dark:text-amber-400 text-[11px]">{notReviewedLabel}</span>;
    case "error":
      return (
        <span className="text-red-600 dark:text-red-400 text-[11px]" title={quote.message}>
          {quote.message}
        </span>
      );
  }
}

function renderChangeCell(quote: WatchlistQuoteState) {
  if (quote.kind !== "loaded" || quote.data.change_pct === null) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  const pct = quote.data.change_pct;
  return (
    <span
      className={cn(
        "tabular-nums",
        pct >= 0
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatchlistSection({ market, title, data, onChange }: WatchlistSectionProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quoteStates, setQuoteStates] = useState<Record<string, WatchlistQuoteState>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);

  const marketItems = data.items.filter((entry) => entry.market === market);
  const isEmpty = marketItems.length === 0;

  const handleAdd = useCallback(
    (code: string, notes?: string) => {
      const { data: updated } = addWatchlistEntry(data, market, code, notes);
      saveWatchlistData(updated);
      onChange(updated);
      setDialogOpen(false);
    },
    [data, market, onChange],
  );

  const handleRemove = useCallback(
    (id: string) => {
      const updated = removeWatchlistEntry(data, id);
      saveWatchlistData(updated);
      onChange(updated);
    },
    [data, onChange],
  );

  const handleLoadQuotes = useCallback(async () => {
    if (quoteLoading || marketItems.length === 0) return;

    setQuoteLoading(true);

    // Set all current items to loading.
    const loading: Record<string, WatchlistQuoteState> = {};
    for (const item of marketItems) {
      loading[item.code] = { kind: "loading" };
    }
    setQuoteStates(loading);

    try {
      const codes = marketItems.map((e) => e.code);
      const result = await loadWatchlistQuotes(codes, { mode: "real" });
      setQuoteStates(Object.fromEntries(result));
    } catch {
      const error: Record<string, WatchlistQuoteState> = {};
      for (const item of marketItems) {
        error[item.code] = {
          kind: "error",
          message: "Unexpected error",
        };
      }
      setQuoteStates(error);
    } finally {
      setQuoteLoading(false);
    }
  }, [marketItems, quoteLoading]);

  // Lookup quote state for a code; defaults to idle.
  const getQuote = (code: string): WatchlistQuoteState =>
    quoteStates[code] ?? { kind: "idle" };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-2">
          {/* Load Quotes — A-share only, shown when there are items */}
          {market === "a" && !isEmpty && (
            <button
              type="button"
              onClick={handleLoadQuotes}
              disabled={quoteLoading}
              aria-label={
                quoteLoading
                  ? t("overview.watchlistQuoteLoading")
                  : t("overview.watchlistLoadQuotes")
              }
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", quoteLoading && "animate-spin")} />
              {quoteLoading
                ? t("overview.watchlistQuoteLoading")
                : t("overview.watchlistLoadQuotes")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            aria-label={t("overview.watchlistAdd")}
            className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("overview.watchlistAdd")}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border py-12 text-center text-muted-foreground/50">
          <Minus className="h-5 w-5" />
          <span className="text-xs">{t("overview.watchlistEmpty")}</span>
        </div>
      ) : (
        /* Table */
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  {t("overview.tableCode")}
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  {t("overview.tableName")}
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  {t("overview.tablePrice")}
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  {t("overview.tableChange")}
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  {t("overview.tableActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {marketItems.map((entry) => {
                const quote = getQuote(entry.code);
                return (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-foreground/80">
                      {entry.code}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground/60">
                      {quote.kind === "loaded" && quote.data.name
                        ? quote.data.name
                        : entry.notes || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {renderPriceCell(
                        quote,
                        t("overview.watchlistQuoteIdle"),
                        t("overview.watchlistQuoteLoading"),
                        t("overview.watchlistQuoteNotReviewed"),
                      )}
                    </td>
                    <td className="px-3 py-2">{renderChangeCell(quote)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleRemove(entry.id)}
                        aria-label={t("overview.watchlistRemove")}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                        {t("overview.watchlistRemove")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* US stock notice */}
      {market === "us" && (
        <p className="text-[11px] text-muted-foreground/50">
          {t("overview.watchlistUSNotSupported")}
        </p>
      )}

      {/* Add dialog */}
      <AddCodeDialog
        open={dialogOpen}
        market={market}
        onAdd={handleAdd}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}
