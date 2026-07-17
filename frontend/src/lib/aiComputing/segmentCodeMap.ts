// ---------------------------------------------------------------------------
// AI computing segment → A-share stock code list mapping.
//
// **RESEARCH-ONLY CONFIGURATION — NOT INVESTMENT ADVICE**
//
// This file maps each AI computing supply chain segment to the A-share codes
// whose research reports may be relevant.  Every entry must be **manually
// reviewed before addition** by a qualified person.
//
// By default all arrays are **empty** to prevent accidental live data access
// or the appearance of stock recommendations.  No entry is populated unless
// explicitly approved through the project's review process.
// ---------------------------------------------------------------------------

/** Valid AI computing segment keys — must stay in sync with the UI. */
export type AiComputingSegmentKey =
  | "computeChip"
  | "hbm"
  | "opticalModule"
  | "pcb"
  | "switchChip"
  | "liquidCooling"
  | "mlcc"
  | "glassSubstrate";

/** Ordered list of all segment keys. */
export const AI_COMPUTING_SEGMENT_KEYS: readonly AiComputingSegmentKey[] = [
  "computeChip",
  "hbm",
  "opticalModule",
  "pcb",
  "switchChip",
  "liquidCooling",
  "mlcc",
  "glassSubstrate",
] as const;

/** Segment → stock-code list.  All arrays are empty by default. */
export type SegmentCodeMap = Record<AiComputingSegmentKey, readonly string[]>;

export const segmentCodeMap: SegmentCodeMap = {
  computeChip: [],
  hbm: [],
  opticalModule: [],
  pcb: [],
  switchChip: [],
  liquidCooling: [],
  mlcc: [],
  glassSubstrate: [],
};
