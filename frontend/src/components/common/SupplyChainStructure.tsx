import { useTranslation } from "react-i18next";
import { ArrowDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Supply chain tier & node definitions — static placeholder, no real data
// ---------------------------------------------------------------------------

interface ChainNode {
  key: string;
  labelKey: string;
}

interface ChainTier {
  key: string;
  labelKey: string;
  nodes: ChainNode[];
}

const SUPPLY_CHAIN: ChainTier[] = [
  {
    key: "upstream",
    labelKey: "aiComputing.structure.tierUpstream",
    nodes: [
      { key: "computeChip", labelKey: "aiComputing.segments.computeChip" },
      { key: "hbm", labelKey: "aiComputing.segments.hbm" },
      { key: "pcb", labelKey: "aiComputing.segments.pcb" },
      { key: "glassSubstrate", labelKey: "aiComputing.segments.glassSubstrate" },
      { key: "mlcc", labelKey: "aiComputing.segments.mlcc" },
    ],
  },
  {
    key: "midstream",
    labelKey: "aiComputing.structure.tierMidstream",
    nodes: [
      { key: "opticalModule", labelKey: "aiComputing.segments.opticalModule" },
      { key: "switchChip", labelKey: "aiComputing.segments.switchChip" },
      { key: "liquidCooling", labelKey: "aiComputing.segments.liquidCooling" },
    ],
  },
  {
    key: "downstream",
    labelKey: "aiComputing.structure.tierDownstream",
    nodes: [
      { key: "aiServer", labelKey: "aiComputing.structure.nodeAiServer" },
      { key: "dataCenter", labelKey: "aiComputing.structure.nodeDataCenter" },
      { key: "cloudVendor", labelKey: "aiComputing.structure.nodeCloudVendor" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SupplyChainStructure() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {t("aiComputing.structureDesc")}
      </p>

      <div className="flex flex-col items-center gap-0">
        {SUPPLY_CHAIN.map((tier, tierIdx) => {
          const isLast = tierIdx === SUPPLY_CHAIN.length - 1;
          return (
            <div key={tier.key} className="flex flex-col items-center w-full">
              {/* Tier label */}
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">
                  {t(tier.labelKey as any)}
                </span>
              </div>

              {/* Node row */}
              <div
                className={cn(
                  "flex flex-wrap justify-center gap-3 w-full",
                  tier.nodes.length <= 3 ? "max-w-2xl" : "max-w-4xl",
                )}
              >
                {tier.nodes.map((node) => (
                  <NodeCard key={node.key} node={node} tier={tier.key} />
                ))}
              </div>

              {/* Connector arrow between tiers */}
              {!isLast && (
                <div className="flex items-center justify-center py-2">
                  <ArrowDown className="h-5 w-5 text-muted-foreground/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual node card
// ---------------------------------------------------------------------------
function NodeCard({ node, tier }: { node: ChainNode; tier: string }) {
  const { t } = useTranslation();

  const tierVariant: Record<string, string> = {
    upstream: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    midstream: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    downstream: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
  };

  const tagVariant: Record<string, string> = {
    upstream: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    midstream: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    downstream: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border px-4 py-3 min-w-[120px]",
        tierVariant[tier] ?? "bg-card",
      )}
    >
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium",
          tagVariant[tier] ?? "bg-muted text-muted-foreground",
        )}
      >
        {t(`aiComputing.structure.tierLabel.${tier}` as any)}
      </span>
      <span className="text-sm font-medium text-center">
        {t(node.labelKey as any)}
      </span>
      <span className="text-[11px] text-muted-foreground/60 italic">
        {t("aiComputing.placeholder")}
      </span>
    </div>
  );
}
