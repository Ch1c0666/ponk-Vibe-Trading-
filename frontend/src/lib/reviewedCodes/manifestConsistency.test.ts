// ---------------------------------------------------------------------------
// Manifest ↔ frontend segmentCodeMap consistency tests.
//
// Reads agent/config/reviewed_segment_codes.json at test time and asserts
// that every segment key, code list, and safety invariant matches the
// frontend segmentCodeMap exports.
//
// All arrays must be empty.  No real stock codes or company names may appear.
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

// Path relative to this test file — goes up to project root, then into agent/config.
const MANIFEST_PATH = resolve(
  __dirname,
  "..", "..", "..", "..", "..",
  "agent", "config", "reviewed_segment_codes.json",
);

interface ManifestSegment {
  codes: unknown[];
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

  it("manifest aiComputing all codes are empty", () => {
    for (const [key, seg] of Object.entries(manifest.segments.aiComputing)) {
      expect(seg.codes).toEqual([]);
    }
  });

  it("frontend aiComputing segmentCodeMap all codes are empty", () => {
    for (const key of AI_COMPUTING_SEGMENT_KEYS) {
      expect(segmentCodeMap[key]).toEqual([]);
    }
  });

  it("manifest and frontend aiComputing codes per segment are consistent", () => {
    for (const key of AI_COMPUTING_SEGMENT_KEYS) {
      const manifestCodes = manifest.segments.aiComputing[key]?.codes ?? [];
      const frontendCodes = segmentCodeMap[key] ?? [];
      expect(frontendCodes).toEqual(manifestCodes);
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

  it("manifest and frontend humanoidRobot codes per segment are consistent", () => {
    for (const key of HUMANOID_ROBOT_SEGMENT_KEYS) {
      const manifestCodes = manifest.segments.humanoidRobot[key]?.codes ?? [];
      const frontendCodes = humanoidSegmentCodeMap[key] ?? [];
      expect(frontendCodes).toEqual(manifestCodes);
    }
  });

  // -- Safety ---------------------------------------------------------------

  it("manifest contains no real stock code patterns", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf-8");
    expect(raw).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/);
  });

  it("frontend aiComputing segmentCodeMap contains no real stock codes", () => {
    const serialized = JSON.stringify(segmentCodeMap);
    expect(serialized).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/);
  });

  it("frontend humanoidSegmentCodeMap contains no real stock codes", () => {
    const serialized = JSON.stringify(humanoidSegmentCodeMap);
    expect(serialized).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/);
  });
});
