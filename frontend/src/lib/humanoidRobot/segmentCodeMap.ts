// ---------------------------------------------------------------------------
// Humanoid robot segment → A-share stock code list mapping.
//
// **RESEARCH-ONLY CONFIGURATION — NOT INVESTMENT ADVICE**
//
// This file maps each humanoid robot supply chain segment to the A-share codes
// whose research reports may be relevant.  Every entry must be **manually
// reviewed before addition** by a qualified person.
//
// By default all arrays are **empty** to prevent accidental live data access
// or the appearance of stock recommendations.  No entry is populated unless
// explicitly approved through the project's review process.
// ---------------------------------------------------------------------------

/** Valid humanoid robot segment keys — must stay in sync with the UI. */
export type HumanoidRobotSegmentKey =
  | "harmonicReducer"
  | "planetaryRollerScrew"
  | "framelessTorqueMotor"
  | "sixAxisForceSensor"
  | "dexterousHand"
  | "ballScrew";

/** Ordered list of all segment keys. */
export const HUMANOID_ROBOT_SEGMENT_KEYS: readonly HumanoidRobotSegmentKey[] = [
  "harmonicReducer",
  "planetaryRollerScrew",
  "framelessTorqueMotor",
  "sixAxisForceSensor",
  "dexterousHand",
  "ballScrew",
] as const;

/** Segment → stock-code list.  All arrays are empty by default. */
export type HumanoidSegmentCodeMap = Record<
  HumanoidRobotSegmentKey,
  readonly string[]
>;

export const humanoidSegmentCodeMap: HumanoidSegmentCodeMap = {
  harmonicReducer: [],
  planetaryRollerScrew: [],
  framelessTorqueMotor: [],
  sixAxisForceSensor: [],
  dexterousHand: [],
  ballScrew: [],
};
