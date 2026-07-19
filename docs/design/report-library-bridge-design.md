# ReportLibrary Bridge Design

Date: 2026-07-19
Status: design only — do NOT implement until approved.

## Current state

- ReportLibrary uses `segmentCodeMap` to get codes for each segment
- `segmentCodeMap` is intentionally all empty (aiComputing 10 segments, humanoidRobot 8 segments)
- `REVIEWED_SEGMENT_CODES` has 688981.SH with dataUse ["report"] — but this code does NOT reach ReportLibrary because segmentCodeMap is empty
- This is correct fail-closed behavior

## Problem

To show real research reports in ReportLibrary, a reviewed code with `dataUse: ["report"]` needs to reach the `get_research_reports` tool. Currently there is no safe bridge between reviewed manifest and segmentCodeMap.

## Design

Option A: Populate segmentCodeMap from reviewed manifest (preferred)
- `codegen_reviewed_codes.py` generates `segmentCodeMap` entries from manifest codes with `dataUse: ["report"]`
- segmentCodeMap becomes a generated mirror for report-use codes
- ReportLibrary reads segmentCodeMap as before — now with real codes
- Safety: only codes with explicit dataUse "report" appear

Option B: ReportLibrary reads reviewed manifest directly
- ReportLibrary imports `getReportCodes` from reviewedManifestAdapter
- Bypasses segmentCodeMap entirely
- segmentCodeMap remains empty
- Safety: dataUse gating at query time

## Recommendation: Option A

- segmentCodeMap generation is auditable (visible diff in codegen output)
- No runtime coupling between ReportLibrary and reviewed manifest
- segmentCodeMap stays as the single source for ReportLibrary codes
- Other dataUse families (quote/news/fundamental/announcement) do NOT leak into segmentCodeMap

## Safety rules

1. Only `dataUse: ["report"]` codes populate segmentCodeMap
2. Quote-only codes NEVER enter segmentCodeMap
3. q_type=1 remains fail-closed
4. No /api/reports/research bypass
5. No /mcp transport

## Implementation steps (after approval)

1. Update `codegen_reviewed_codes.py` to also generate segmentCodeMap entries for report dataUse codes
2. Run codegen — verify segmentCodeMap gets 688981.SH in computeChip
3. Run test suite — verify no regressions
4. Manual smoke: ReportLibrary tab on computeChip shows real report titles
5. Rollback: revert codegen change or remove report dataUse from code

## What this does NOT do

- Does NOT add quote/news/fundamental/announcement codes to segmentCodeMap
- Does NOT change how ReportLibrary fetches reports
- Does NOT affect q_type=1 boundary
- Does NOT require manifest changes
