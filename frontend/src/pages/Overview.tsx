import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, RefreshCw, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Mock-only index config — labels are well-known market benchmarks, not
// individual stock codes or company names.  All values are "—" / pending.
// ---------------------------------------------------------------------------

type MockIndexKey = "shanghai" | "shenzhen" | "chinext" | "star50";

interface MockIndexMeta {
  key: MockIndexKey;
  /** i18n key for the index label, e.g. "overview.indices.shanghai" */
  labelKey: string;
}

const MOCK_INDICES: readonly MockIndexMeta[] = [
  { key: "shanghai", labelKey: "overview.indices.shanghai" },
  { key: "shenzhen", labelKey: "overview.indices.shenzhen" },
  { key: "chinext", labelKey: "overview.indices.chinext" },
  { key: "star50", labelKey: "overview.indices.star50" },
] as const;

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
// Index Card (inline — extractable to common/ later)
// ---------------------------------------------------------------------------

function IndexCard({
  labelKey,
  pendingLabel,
  muted,
}: {
  labelKey: string;
  pendingLabel: string;
  muted?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-sm",
        muted && "opacity-60",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {t(labelKey as any)}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-muted-foreground/50">
          —
        </span>
        <span className="text-xs text-muted-foreground/50">—</span>
      </div>
      <span className="text-[11px] text-muted-foreground/60">
        {pendingLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watchlist Table (inline — extractable to common/ later)
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
      {/* Section header */}
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

      {/* Table */}
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
  const [mockRefreshed, setMockRefreshed] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the mock-refresh timer on unmount so we never call setState
  // on an unmounted component.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  const handleMockRefresh = useCallback(() => {
    // Mock-only — no fetch, no axios, no useQuery, no real API call.
    setMockRefreshed(true);
    if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      setMockRefreshed(false);
      refreshTimerRef.current = null;
    }, 2500);
  }, []);

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

            {/* Refresh button — mock-only, never hits a real endpoint */}
            <button
              type="button"
              onClick={handleMockRefresh}
              aria-label={t("overview.refresh")}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  mockRefreshed && "animate-spin",
                )}
              />
              {t("overview.refresh")}
            </button>
          </div>

          {/* Mock refresh feedback banner */}
          {mockRefreshed && (
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              {t("overview.mockRefreshed")}
            </div>
          )}
        </section>

        {/* ── Index Cards ────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("overview.indicesTitle")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MOCK_INDICES.map((idx) => (
              <IndexCard
                key={idx.key}
                labelKey={idx.labelKey}
                pendingLabel={t("overview.indicesPending")}
              />
            ))}
          </div>
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
