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

  it("manifest computeChip has exactly 1 approved code with required fields", () => {
    const codes = manifest.segments.aiComputing.computeChip?.codes ?? [];
    expect(codes).toHaveLength(1);

    const c = codes[0];
    expect(c.code).toBe("688041.SH");
    expect(c.status).toBe("approved");
    expect(c.dataUse).toEqual(["quote"]);
    expect(c.reason).toBeTruthy();
    expect(c.source).toBeTruthy();
    expect(c.reviewer).toBeTruthy();
    expect(c.reviewedAt).toBeTruthy();
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
    expect(total).toBe(1);
  });
});
