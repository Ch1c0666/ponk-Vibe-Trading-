import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Building2,
  FileText,
  GitBranch,
  Globe,
  Search,
  Shield,
  Star,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SegmentResearchTemplate,
  type SegmentMeta,
} from "@/components/common/SegmentResearchTemplate";
import {
  SupplyChainStructure,
  type ChainTier,
} from "@/components/common/SupplyChainStructure";
import { ReportLibrary } from "@/components/common/ReportLibrary";

// ---------------------------------------------------------------------------
// 6 humanoid robot segments — placeholder only, no real data
// ---------------------------------------------------------------------------
const SEGMENTS: SegmentMeta[] = [
  { key: "harmonicReducer", labelKey: "humanoidRobot.segments.harmonicReducer" },
  { key: "planetaryRollerScrew", labelKey: "humanoidRobot.segments.planetaryRollerScrew" },
  { key: "framelessTorqueMotor", labelKey: "humanoidRobot.segments.framelessTorqueMotor" },
  { key: "sixAxisForceSensor", labelKey: "humanoidRobot.segments.sixAxisForceSensor" },
  { key: "dexterousHand", labelKey: "humanoidRobot.segments.dexterousHand" },
  { key: "ballScrew", labelKey: "humanoidRobot.segments.ballScrew" },
];

const SEGMENT_MAP = new Map<string, SegmentMeta>(
  SEGMENTS.map((s) => [s.key, s]),
);

// Top-level tab keys: 总览 + 6 segments + 结构图 + 研报库
type TabKey = "overview" | (typeof SEGMENTS)[number]["key"] | "structure" | "reports";

/** Field labels shown on each overview card. */
const OVERVIEW_FIELDS = [
  { icon: Target, labelKey: "humanoidRobot.template.positioning" },
  { icon: Globe, labelKey: "humanoidRobot.template.intlLandscape" },
  { icon: Building2, labelKey: "humanoidRobot.template.domesticLandscape" },
  { icon: Shield, labelKey: "humanoidRobot.template.barrierType" },
  { icon: Star, labelKey: "humanoidRobot.template.scoringSystem" },
];

// ---------------------------------------------------------------------------
// Humanoid robot supply chain — static 3-tier placeholder, no real data
// ---------------------------------------------------------------------------
const HUMANOID_CHAIN: ChainTier[] = [
  {
    key: "upstream",
    labelKey: "humanoidRobot.structure.tierUpstream",
    tagLabelKey: "humanoidRobot.structure.tierLabel.upstream",
    nodes: [
      { key: "harmonicReducer", labelKey: "humanoidRobot.segments.harmonicReducer" },
      { key: "planetaryRollerScrew", labelKey: "humanoidRobot.segments.planetaryRollerScrew" },
      { key: "framelessTorqueMotor", labelKey: "humanoidRobot.segments.framelessTorqueMotor" },
      { key: "ballScrew", labelKey: "humanoidRobot.segments.ballScrew" },
    ],
  },
  {
    key: "midstream",
    labelKey: "humanoidRobot.structure.tierMidstream",
    tagLabelKey: "humanoidRobot.structure.tierLabel.midstream",
    nodes: [
      { key: "sixAxisForceSensor", labelKey: "humanoidRobot.segments.sixAxisForceSensor" },
      { key: "dexterousHand", labelKey: "humanoidRobot.segments.dexterousHand" },
      { key: "jointAssembly", labelKey: "humanoidRobot.structure.nodeJointAssembly" },
    ],
  },
  {
    key: "downstream",
    labelKey: "humanoidRobot.structure.tierDownstream",
    tagLabelKey: "humanoidRobot.structure.tierLabel.downstream",
    nodes: [
      { key: "robotOEM", labelKey: "humanoidRobot.structure.nodeRobotOEM" },
      { key: "application", labelKey: "humanoidRobot.structure.nodeApplication" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page — dispatches between tab-layout and segment-detail based on route
// ---------------------------------------------------------------------------
export function HumanoidRobot() {
  const { segmentKey } = useParams<{ segmentKey?: string }>();

  if (segmentKey) {
    const segment = SEGMENT_MAP.get(segmentKey);
    if (segment) {
      return <SegmentDetailView segment={segment} />;
    }
    return <InvalidSegmentView segmentKey={segmentKey} />;
  }

  return <TabLayout />;
}

// ---------------------------------------------------------------------------
// Tab layout — 总览 + 6 segments + 结构图 + 研报库
// ---------------------------------------------------------------------------
function TabLayout() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const activeSegment =
    activeTab !== "overview" && activeTab !== "structure" && activeTab !== "reports"
      ? SEGMENTS.find((s) => s.key === activeTab) ?? null
      : null;

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {/* ---- Header ---- */}
        <section className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              {t("humanoidRobot.badge")}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("humanoidRobot.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t("humanoidRobot.subtitle")}
              </p>
            </div>
          </div>
        </section>

        {/* ---- Tab bar: 总览 + 6 segments + 结构图 + 研报库 ---- */}
        <nav className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
          {/* 总览 */}
          <TabButton
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          >
            <Search className="h-4 w-4" />
            {t("humanoidRobot.tabs.overview")}
          </TabButton>
          {/* 6 segments */}
          {SEGMENTS.map((seg) => (
            <TabButton
              key={seg.key}
              active={activeTab === seg.key}
              onClick={() => setActiveTab(seg.key)}
            >
              {t(seg.labelKey as any)}
            </TabButton>
          ))}
          {/* Structure */}
          <TabButton
            active={activeTab === "structure"}
            onClick={() => setActiveTab("structure")}
          >
            <GitBranch className="h-4 w-4" />
            {t("humanoidRobot.tabs.structure")}
          </TabButton>
          {/* Reports */}
          <TabButton
            active={activeTab === "reports"}
            onClick={() => setActiveTab("reports")}
          >
            <FileText className="h-4 w-4" />
            {t("humanoidRobot.tabs.reports")}
          </TabButton>
        </nav>

        {/* ---- Tab content ---- */}
        <section className="min-h-[50vh]">
          {activeTab === "overview" && <OverviewTab />}
          {activeSegment && <SegmentTab segment={activeSegment} />}
          {activeTab === "structure" && <StructureTab />}
          {activeTab === "reports" && (
            <ReportLibrary descriptionKey="humanoidRobot.reportsDesc" />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny tab button
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Segment detail view — shown at /humanoid-robot/:segmentKey
// ---------------------------------------------------------------------------
function SegmentDetailView({ segment }: { segment: SegmentMeta }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Link
          to="/humanoid-robot"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("humanoidRobot.detail.backToOverview")}
        </Link>

        <section className="flex flex-col gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              {t("humanoidRobot.badge")}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t(segment.labelKey as any)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("humanoidRobot.detail.subtitle")}
            </p>
          </div>
        </section>

        <SegmentResearchTemplate segment={segment} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invalid segment view
// ---------------------------------------------------------------------------
function InvalidSegmentView({ segmentKey }: { segmentKey: string }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Link
          to="/humanoid-robot"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("humanoidRobot.detail.backToOverview")}
        </Link>

        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-medium">
            {t("humanoidRobot.detail.invalidTitle")}
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {t("humanoidRobot.detail.invalidDesc", { key: segmentKey })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — 6 segment cards with field labels, clickable to detail
// ---------------------------------------------------------------------------
function OverviewTab() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("humanoidRobot.overviewDesc")}
      </p>

      {/* Structure diagram in overview area */}
      <SupplyChainStructure
        tiers={HUMANOID_CHAIN}
        descriptionKey="humanoidRobot.structureDesc"
        placeholderKey="humanoidRobot.placeholder"
      />

      {/* Segment cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SEGMENTS.map((segment) => (
          <Link
            key={segment.key}
            to={`/humanoid-robot/${segment.key}`}
            className="group rounded-lg border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm block"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">
                {t(segment.labelKey as any)}
              </h3>
            </div>
            <ul className="space-y-1.5 mb-3">
              {OVERVIEW_FIELDS.map(({ icon: Icon, labelKey }) => (
                <li
                  key={labelKey}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Icon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  {t(labelKey as any)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground/60 italic">
              {t("humanoidRobot.placeholder")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segment tab — shows the research framework for a single segment inline
// ---------------------------------------------------------------------------
function SegmentTab({ segment }: { segment: SegmentMeta }) {
  return (
    <div className="space-y-6">
      <SegmentResearchTemplate segment={segment} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structure tab — static supply chain diagram
// ---------------------------------------------------------------------------
function StructureTab() {
  return (
    <div className="py-4">
      <SupplyChainStructure
        tiers={HUMANOID_CHAIN}
        descriptionKey="humanoidRobot.structureDesc"
        placeholderKey="humanoidRobot.placeholder"
      />
    </div>
  );
}
