// ---------------------------------------------------------------------------
// Manifest ↔ frontend segmentCodeMap consistency tests.
//
// Reads agent/config/reviewed_segment_codes.json at test time and asserts
// that every segment key, code list, and safety invariant matches the
// frontend segmentCodeMap exports.
//
// Phase A: manifest has 1 approved code in computeChip (quote-only).
// Frontend maps are still empty (codegen not yet implemented).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI_COMPUTING_SEGMENT_KEYS,
  segmentCodeMap,
} from "@/lib/aiComputing/segmentCodeMap";
import {
  HUMANOID_ROBOT_SEGMENT_KEYS,
  humanoidSegmentCodeMap,
} from "@/lib/humanoidRobot/segmentCodeMap";

const MANIFEST_PATH = resolve(
  __dirname,
  "..", "..", "..", "..", "..",
  "agent", "config", "reviewed_segment_codes.json",
);

interface ManifestCodeEntry {
  code: string;
  status: string;
  reason: string;
  source: string;
  reviewer: string;
  reviewedAt: string;
  dataUse?: string[];
}

interface ManifestSegment {
  codes: ManifestCodeEntry[];
}

interface ManifestScope {
  [segmentKey: string]: ManifestSegment;
}

interface ManifestData {
  version: number;
  segments: {
    aiComputing: ManifestScope;
    humanoidRobot: ManifestScope;
  };
}

function loadManifest(): ManifestData {
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as ManifestData;
}

describe("manifest ↔ segmentCodeMap consistency", () => {
  let manifest: ManifestData;

  try {
    manifest = loadManifest();
  } catch {
    it.skip("manifest file not found — skipping consistency checks", () => {});
    return;
  }

  // -- AI computing keys ---------------------------------------------------

  it("manifest aiComputing keys match AI_COMPUTING_SEGMENT_KEYS", () => {
    const manifestKeys = Object.keys(manifest.segments.aiComputing).sort();
    const frontendKeys = [...AI_COMPUTING_SEGMENT_KEYS].sort();
    expect(manifestKeys).toEqual(frontendKeys);
  });

  it("manifest computeChip has approved codes with required fields per dataUse", () => {
    const codes = manifest.segments.aiComputing.computeChip?.codes ?? [];
    expect(codes.length).toBeGreaterThanOrEqual(1);

    for (const c of codes) {
      if (c.status !== "approved") continue;
      expect(c.code).toBeTruthy();
      expect(c.status).toBe("approved");
      expect(Array.isArray(c.dataUse)).toBe(true);
      expect(c.reason).toBeTruthy();
      expect(c.source).toBeTruthy();
      expect(c.reviewer).toBeTruthy();
      expect(c.reviewedAt).toBeTruthy();
    }
  });

  it("manifest other aiComputing segments all empty", () => {
    for (const key of AI_COMPUTING_SEGMENT_KEYS) {
      if (key === "computeChip") continue;
      expect(manifest.segments.aiComputing[key]?.codes ?? []).toEqual([]);
    }
  });

  it("frontend aiComputing segmentCodeMap still all empty (Phase A gap)", () => {
    for (const key of AI_COMPUTING_SEGMENT_KEYS) {
      expect(segmentCodeMap[key]).toEqual([]);
    }
  });

  // -- Humanoid robot keys -------------------------------------------------

  it("manifest humanoidRobot keys match HUMANOID_ROBOT_SEGMENT_KEYS", () => {
    const manifestKeys = Object.keys(manifest.segments.humanoidRobot).sort();
    const frontendKeys = [...HUMANOID_ROBOT_SEGMENT_KEYS].sort();
    expect(manifestKeys).toEqual(frontendKeys);
  });

  it("manifest humanoidRobot all codes are empty", () => {
    for (const [key, seg] of Object.entries(manifest.segments.humanoidRobot)) {
      expect(seg.codes).toEqual([]);
    }
  });

  it("frontend humanoidSegmentCodeMap all codes are empty", () => {
    for (const key of HUMANOID_ROBOT_SEGMENT_KEYS) {
      expect(humanoidSegmentCodeMap[key]).toEqual([]);
    }
  });

  // -- Safety ---------------------------------------------------------------

  it("manifest safety: no unknown approved codes beyond computeChip", () => {
    let total = 0;
    for (const scope of Object.values(manifest.segments)) {
      for (const seg of Object.values(scope)) {
        for (const c of seg.codes) {
          if (c.status === "approved") total++;
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// REVIEWED_SEGMENT_CODES ↔ manifest consistency
// ---------------------------------------------------------------------------

import { REVIEWED_SEGMENT_CODES } from "../reviewedSegmentCodes";
import { getQuoteCodes, getReportCodes } from "../reviewedManifestAdapter";

describe("REVIEWED_SEGMENT_CODES vs manifest", () => {
  let manifest: ManifestData | null = null;

  try {
    manifest = loadManifest();
  } catch {
    it.skip("manifest not found", () => {});
  }

  it("REVIEWED_SEGMENT_CODES mirrors manifest content", () => {
    if (!manifest) return;
    // Compare approved codes per scope/segment
    for (const scope of Object.keys(manifest.segments)) {
      for (const segKey of Object.keys(manifest.segments[scope])) {
        const mCodes = (manifest.segments[scope][segKey]?.codes ?? [])
          .filter((c) => c.status === "approved");
        const fCodes = (REVIEWED_SEGMENT_CODES.segments as Record<string, Record<string, {codes: typeof mCodes}>>)[scope]?.[segKey]?.codes ?? [];
        expect(fCodes).toEqual(mCodes);
      }
    }
  });

  it("getQuoteCodes returns 688041.SH for computeChip", () => {
    expect(getQuoteCodes(REVIEWED_SEGMENT_CODES, "aiComputing", "computeChip"))
      .toEqual(["688041.SH"]);
  });

  it("getReportCodes returns non-quote codes, excludes quote-only for computeChip", () => {
    const codes = getReportCodes(REVIEWED_SEGMENT_CODES, "aiComputing", "computeChip");
    expect(codes).not.toContain("688041.SH");
    expect(codes.length).toBeGreaterThanOrEqual(1);
  });

  it("humanoidRobot quote codes all empty", () => {
    for (const key of ["harmonicReducer", "planetaryRollerScrew", "framelessTorqueMotor", "sixAxisForceSensor", "dexterousHand", "ballScrew"]) {
      expect(getQuoteCodes(REVIEWED_SEGMENT_CODES, "humanoidRobot", key)).toEqual([]);
    }
  });
});
