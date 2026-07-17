import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, FileText, GitBranch, LayoutTemplate, Search } from "lucide-react";
import { cn } from "@/lib/utils";

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
const SEGMENTS = [
  { key: "computeChip", labelKey: "aiComputing.segments.computeChip" },
  { key: "hbm", labelKey: "aiComputing.segments.hbm" },
  { key: "opticalModule", labelKey: "aiComputing.segments.opticalModule" },
  { key: "pcb", labelKey: "aiComputing.segments.pcb" },
  { key: "switchChip", labelKey: "aiComputing.segments.switchChip" },
  { key: "liquidCooling", labelKey: "aiComputing.segments.liquidCooling" },
  { key: "mlcc", labelKey: "aiComputing.segments.mlcc" },
  { key: "glassSubstrate", labelKey: "aiComputing.segments.glassSubstrate" },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function AIComputingPower() {
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
          {activeTab === "templates" && <PlaceholderTab tab="templates" />}
          {activeTab === "reports" && <PlaceholderTab tab="reports" />}
          {activeTab === "structure" && <PlaceholderTab tab="structure" />}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — 8 segment cards in a responsive grid
// ---------------------------------------------------------------------------
function OverviewTab() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("aiComputing.overviewDesc")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SEGMENTS.map(({ key, labelKey }) => (
          <article
            key={key}
            className="group rounded-lg border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Cpu className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">{t(labelKey)}</h3>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-2 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-2 w-2/3 rounded bg-muted animate-pulse" />
            </div>
            <p className="mt-4 text-xs text-muted-foreground italic">
              {t("aiComputing.placeholder")}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder tab for templates / reports / structure
// ---------------------------------------------------------------------------
function PlaceholderTab({ tab }: { tab: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-medium">
        {t(`aiComputing.${tab}PlaceholderTitle` as any)}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t(`aiComputing.${tab}PlaceholderDesc` as any)}
      </p>
    </div>
  );
}
