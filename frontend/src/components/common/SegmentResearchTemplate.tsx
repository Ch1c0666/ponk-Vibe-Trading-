import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Building2,
  Globe,
  Shield,
  Star,
  Target,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 6-section research framework — shared across all 8 AI compute segments.
// Every field displays a placeholder; no real company, code, or report data
// is rendered.
// ---------------------------------------------------------------------------

export interface SegmentMeta {
  key: string;
  labelKey: string;
}

/** Ordered list of the six research-template sections. */
export const TEMPLATE_SECTIONS = [
  { key: "positioning", icon: Target, labelKey: "aiComputing.template.positioning" },
  { key: "intlLandscape", icon: Globe, labelKey: "aiComputing.template.intlLandscape" },
  { key: "domesticLandscape", icon: Building2, labelKey: "aiComputing.template.domesticLandscape" },
  { key: "barrierType", icon: Shield, labelKey: "aiComputing.template.barrierType" },
  { key: "scoringSystem", icon: Star, labelKey: "aiComputing.template.scoringSystem" },
  { key: "coreTargets", icon: BarChart3, labelKey: "aiComputing.template.coreTargets" },
] as const;

export type TemplateSectionKey = (typeof TEMPLATE_SECTIONS)[number]["key"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface SegmentResearchTemplateProps {
  segment: SegmentMeta;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SegmentResearchTemplate({ segment }: SegmentResearchTemplateProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Segment header */}
      <div className="flex items-center gap-3 border-b pb-4">
        <h2 className="text-xl font-bold">{t(segment.labelKey as any)}</h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {t("aiComputing.template.researchFramework")}
        </span>
      </div>

      {/* Sections */}
      <div className="grid gap-4 lg:grid-cols-2">
        {TEMPLATE_SECTIONS.map(({ key, icon: Icon, labelKey }) => (
          <SectionCard
            key={key}
            icon={Icon}
            title={t(labelKey)}
            isCoreTargets={key === "coreTargets"}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual section card
// ---------------------------------------------------------------------------
function SectionCard({
  icon: Icon,
  title,
  isCoreTargets,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  isCoreTargets: boolean;
}) {
  const { t } = useTranslation();

  return (
    <article className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      {isCoreTargets ? (
        /* Core targets — empty labelled boxes, no company / code */
        <div className="grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="flex items-center justify-center rounded-md border border-dashed bg-muted/30 px-3 py-4"
            >
              <span className="text-xs text-muted-foreground/60">
                {t("aiComputing.template.targetPlaceholder", { n })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* Placeholder text block */
        <div className="space-y-2">
          <div className="h-2 w-full rounded bg-muted" />
          <div className="h-2 w-5/6 rounded bg-muted" />
          <div className="h-2 w-4/6 rounded bg-muted" />
          <p className="pt-1 text-xs italic text-muted-foreground/60">
            {t("aiComputing.placeholder")}
          </p>
        </div>
      )}
    </article>
  );
}
