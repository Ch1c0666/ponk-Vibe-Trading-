import { describe, expect, it } from "vitest";
import {
  AI_COMPUTING_SEGMENT_KEYS,
  segmentCodeMap,
  type AiComputingSegmentKey,
  type SegmentCodeMap,
} from "../segmentCodeMap";

describe("segmentCodeMap", () => {
  // -- key count ------------------------------------------------------------

  it("has exactly 8 segment keys", () => {
    expect(AI_COMPUTING_SEGMENT_KEYS).toHaveLength(8);
    expect(Object.keys(segmentCodeMap)).toHaveLength(8);
  });

  it("segmentCodeMap has no extra or missing keys", () => {
    const expected = new Set<string>(AI_COMPUTING_SEGMENT_KEYS);
    const actual = new Set(Object.keys(segmentCodeMap));
    expect(actual).toEqual(expected);
  });

  // -- empty arrays ---------------------------------------------------------

  it("all segment code arrays are empty by default", () => {
    for (const key of AI_COMPUTING_SEGMENT_KEYS) {
      expect(segmentCodeMap[key]).toEqual([]);
    }
  });

  // -- no real stock codes --------------------------------------------------

  it("segmentCodeMap contains no real stock code patterns", () => {
    const serialized = JSON.stringify(segmentCodeMap);
    // No 6-digit.SH/SZ/BJ patterns
    expect(serialized).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/);
    // No bare 6-digit codes
    expect(serialized).not.toMatch(/"\d{6}"/);
  });

  // -- key type compatibility -----------------------------------------------

  it("AiComputingSegmentKey values match expected segment labels", () => {
    const expected = [
      "computeChip",
      "hbm",
      "opticalModule",
      "pcb",
      "switchChip",
      "liquidCooling",
      "mlcc",
      "glassSubstrate",
    ];
    expect([...AI_COMPUTING_SEGMENT_KEYS]).toEqual(expected);
  });

  it("segment keys are usable as SegmentMeta keys in the UI", () => {
    // The keys must match the segmentKey field in MockReportCard / ProviderReportRow.
    // This test ensures the map keys are compatible with the existing UI segment keys.
    const validKeys: Set<string> = new Set(AI_COMPUTING_SEGMENT_KEYS);
    expect(validKeys.has("computeChip")).toBe(true);
    expect(validKeys.has("hbm")).toBe(true);
    expect(validKeys.has("opticalModule")).toBe(true);
    expect(validKeys.has("pcb")).toBe(true);
    expect(validKeys.has("switchChip")).toBe(true);
    expect(validKeys.has("liquidCooling")).toBe(true);
    expect(validKeys.has("mlcc")).toBe(true);
    expect(validKeys.has("glassSubstrate")).toBe(true);
  });

  // -- type exports ---------------------------------------------------------

  it("exports SegmentCodeMap type compiles to empty record", () => {
    const map: SegmentCodeMap = segmentCodeMap;
    expect(map.computeChip).toEqual([]);
  });
});
