// ---------------------------------------------------------------------------
// WatchlistSection — per-market watchlist UI with add / remove / notes.
// State is owned by the parent; this component filters by market and calls
// onChange to propagate updates.  Quote state is always idle — no fetching.
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Minus } from "lucide-react";
import { saveWatchlistData, addWatchlistEntry, removeWatchlistEntry } from "@/lib/watchlist/watchlistStorage";
import type { WatchlistData } from "@/lib/watchlist/watchlistTypes";
import { AddCodeDialog } from "./AddCodeDialog";

interface WatchlistSectionProps {
  market: "a" | "us";
  title: string;
  /** Full watchlist data owned by the parent. */
  data: WatchlistData;
  /** Called with the updated data after add / remove. */
  onChange: (data: WatchlistData) => void;
}

export function WatchlistSection({ market, title, data, onChange }: WatchlistSectionProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

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

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
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
              {marketItems.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-foreground/80">
                    {entry.code}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground/60">
                    {entry.notes || "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground/50">
                    {t("overview.watchlistQuoteIdle")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground/50">—</td>
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
              ))}
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
