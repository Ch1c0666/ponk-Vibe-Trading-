// ---------------------------------------------------------------------------
// Frontend mirror of agent/config/reviewed_segment_codes.json.
//
// Single source of truth for reviewed codes on the frontend side.
// Updated manually after each manifest review cycle.
//
// Quote-only codes here do NOT feed into ReportLibrary (which uses the
// separate segmentCodeMap).  Use getQuoteCodes() / getReportCodes() from
// reviewedManifestAdapter to filter by dataUse.
// ---------------------------------------------------------------------------

import type { ManifestData } from "./reviewedManifestAdapter";

export const REVIEWED_SEGMENT_CODES = {
  version: 1,
  segments: {
    aiComputing: {
      computeChip: {
        codes: [
          {
            code: "688041.SH",
            status: "approved",
            reason: "该标的主营业务与 AI 算力芯片产业链相关，仅用于验证已审核标的 quote 管线。",
            source: "人工审核",
            reviewer: "chicozhu",
            reviewedAt: "2026-07-18",
            dataUse: ["quote"],
            displayName: "",
            riskNotes: "仅用于产业链研究与接口验证，不构成投资建议。",
          },
        ],
      },
      hbm: { codes: [] },
      opticalModule: { codes: [] },
      pcb: { codes: [] },
      switchChip: { codes: [] },
      liquidCooling: { codes: [] },
      mlcc: { codes: [] },
      glassSubstrate: { codes: [] },
    },
    humanoidRobot: {
      harmonicReducer: { codes: [] },
      planetaryRollerScrew: { codes: [] },
      framelessTorqueMotor: { codes: [] },
      sixAxisForceSensor: { codes: [] },
      dexterousHand: { codes: [] },
      ballScrew: { codes: [] },
    },
  },
} as const satisfies ManifestData;
