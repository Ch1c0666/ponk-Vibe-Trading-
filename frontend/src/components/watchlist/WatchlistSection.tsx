// ---------------------------------------------------------------------------
// WatchlistSection — per-market watchlist UI with add / remove / notes editing /
// reorder and manual quote loading.  State is owned by the parent; this
// component filters by market and calls onChange to propagate updates.
// Quote state is runtime-only (not persisted); it starts idle and only
// updates on user request.
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Minus, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveWatchlistData,
  addWatchlistEntry,
  removeWatchlistEntry,
  updateWatchlistNotes,
  reorderWatchlistEntries,
} from "@/lib/watchlist/watchlistStorage";
import { loadWatchlistQuotes } from "@/lib/watchlist/watchlistService";
import type { WatchlistData, WatchlistQuoteState, WatchlistEntry } from "@/lib/watchlist/watchlistTypes";
import { AddCodeDialog } from "./AddCodeDialog";

interface WatchlistSectionProps {
  market: "a" | "us";
  title: string;
  /** Full watchlist data owned by the parent. */
  data: WatchlistData;
  /** Called with the updated data after add / remove / reorder / notes edit. */
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
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");

  const marketItems = data.items.filter((entry) => entry.market === market);
  const isEmpty = marketItems.length === 0;

  const persist = useCallback(
    (updated: WatchlistData) => {
      saveWatchlistData(updated);
      onChange(updated);
    },
    [onChange],
  );

  const handleAdd = useCallback(
    (code: string, notes?: string) => {
      const { data: updated } = addWatchlistEntry(data, market, code, notes);
      persist(updated);
      setDialogOpen(false);
    },
    [data, market, persist],
  );

  const handleRemove = useCallback(
    (id: string) => {
      const updated = removeWatchlistEntry(data, id);
      persist(updated);
    },
    [data, persist],
  );

  // -- Notes editing ---------------------------------------------------------

  const handleStartEditNotes = useCallback((entry: WatchlistEntry) => {
    setEditingNotesId(entry.id);
    setDraftNotes(entry.notes ?? "");
  }, []);

  const handleSaveNotes = useCallback(() => {
    if (editingNotesId === null) return;
    try {
      const updated = updateWatchlistNotes(data, editingNotesId, draftNotes);
      persist(updated);
    } catch {
      // Notes validation failed — discard edit silently.
    }
    setEditingNotesId(null);
  }, [editingNotesId, draftNotes, data, persist]);

  const handleCancelNotes = useCallback(() => {
    setEditingNotesId(null);
  }, []);

  // -- Reorder ---------------------------------------------------------------
  //
  // Reorder operates on same-market display order.  We swap two items in the
  // market-filtered list, then reconstruct the global order by stitching the
  // reordered same-market items back into their original positions relative to
  // other-market items.  This guarantees that reorder never touches items from
  // a different market.

  const handleMove = useCallback(
    (id: string, direction: "up" | "down") => {
      // Same-market items in display order.
      const marketOrder = [...marketItems];
      const idx = marketOrder.findIndex((e) => e.id === id);
      if (idx < 0) return;

      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= marketOrder.length) return;

      // Swap within same-market list.
      [marketOrder[idx], marketOrder[targetIdx]] = [marketOrder[targetIdx], marketOrder[idx]];

      // Reconstruct global order: preserve positions of other-market items,
      // replace same-market items with the reordered list in sequence.
      const sorted = [...data.items].sort((a, b) => a.sortOrder - b.sortOrder);
      const marketIds = new Set(marketOrder.map((e) => e.id));

      let nextMarketIdx = 0;
      const newGlobalOrder: typeof sorted = [];
      for (const item of sorted) {
        if (marketIds.has(item.id)) {
          newGlobalOrder.push(marketOrder[nextMarketIdx++]);
        } else {
          newGlobalOrder.push(item);
        }
      }

      const updated = reorderWatchlistEntries(data, newGlobalOrder.map((e) => e.id));
      persist(updated);
    },
    [data, marketItems, persist],
  );

  const handleMoveUp = useCallback(
    (id: string) => handleMove(id, "up"),
    [handleMove],
  );

  const handleMoveDown = useCallback(
    (id: string) => handleMove(id, "down"),
    [handleMove],
  );

  // -- Quote loading ---------------------------------------------------------

  const handleLoadQuotes = useCallback(async () => {
    if (quoteLoading || marketItems.length === 0) return;

    setQuoteLoading(true);

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

  const getQuote = (code: string): WatchlistQuoteState =>
    quoteStates[code] ?? { kind: "idle" };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-2">
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
                const isEditing = editingNotesId === entry.id;
                return (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-foreground/80">
                      {entry.code}
                    </td>
                    {/* Name / Notes cell — click to edit */}
                    <td className="px-3 py-2 text-muted-foreground/60">
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          onBlur={handleSaveNotes}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveNotes();
                            if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancelNotes();
                            }
                          }}
                          className="w-full rounded border bg-background px-1.5 py-0.5 text-xs outline-none ring-1 ring-ring"
                          autoFocus
                          maxLength={500}
                          aria-label={t("overview.watchlistNotesLabel")}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartEditNotes(entry)}
                          aria-label={t("overview.watchlistEditNotes")}
                          className="text-left hover:underline decoration-dotted underline-offset-2 cursor-pointer"
                        >
                          {quote.kind === "loaded" && quote.data.name
                            ? quote.data.name
                            : entry.notes || "—"}
                        </button>
                      )}
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
                      <div className="flex items-center gap-0.5">
                        {/* Move up */}
                        <button
                          type="button"
                          onClick={() => handleMoveUp(entry.id)}
                          aria-label={t("overview.watchlistMoveUp")}
                          disabled={
                            marketItems.indexOf(entry) === 0
                          }
                          className="inline-flex items-center rounded px-0.5 py-0.5 text-muted-foreground/40 transition-colors hover:text-foreground disabled:opacity-20"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        {/* Move down */}
                        <button
                          type="button"
                          onClick={() => handleMoveDown(entry.id)}
                          aria-label={t("overview.watchlistMoveDown")}
                          disabled={
                            marketItems.indexOf(entry) === marketItems.length - 1
                          }
                          className="inline-flex items-center rounded px-0.5 py-0.5 text-muted-foreground/40 transition-colors hover:text-foreground disabled:opacity-20"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => handleRemove(entry.id)}
                          aria-label={t("overview.watchlistRemove")}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                          {t("overview.watchlistRemove")}
                        </button>
                      </div>
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
