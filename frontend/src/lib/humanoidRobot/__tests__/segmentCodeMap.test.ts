import { describe, expect, it } from "vitest";
import {
  HUMANOID_ROBOT_SEGMENT_KEYS,
  humanoidSegmentCodeMap,
} from "../segmentCodeMap";

describe("humanoidSegmentCodeMap", () => {
  it("has exactly 6 segment keys", () => {
    expect(HUMANOID_ROBOT_SEGMENT_KEYS).toHaveLength(6);
    expect(Object.keys(humanoidSegmentCodeMap)).toHaveLength(6);
  });

  it("keys are the expected segment labels", () => {
    const expected = [
      "harmonicReducer",
      "planetaryRollerScrew",
      "framelessTorqueMotor",
      "sixAxisForceSensor",
      "dexterousHand",
      "ballScrew",
    ];
    expect([...HUMANOID_ROBOT_SEGMENT_KEYS]).toEqual(expected);
  });

  it("all arrays are empty by default", () => {
    for (const key of HUMANOID_ROBOT_SEGMENT_KEYS) {
      expect(humanoidSegmentCodeMap[key]).toEqual([]);
    }
  });

  it("contains no real stock code patterns", () => {
    const serialized = JSON.stringify(humanoidSegmentCodeMap);
    expect(serialized).not.toMatch(/\b\d{6}\.(SH|SZ|BJ)\b/);
    expect(serialized).not.toMatch(/"\d{6}"/);
  });
});
