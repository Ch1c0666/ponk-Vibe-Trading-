# News dataUse Intake Checklist

Date: 2026-07-18
Status: template and checklist only — do NOT open manifest, do NOT add real codes.

## 1. Intake template

All fields use placeholders. Replace `<...>` only with explicit user authorization.

```json
{
  "code": "<REVIEWED_A_SHARE_CODE>",
  "segment": "<SEGMENT_KEY>",
  "dataUse": ["news"],
  "reason": "<HUMAN_REVIEW_REASON>",
  "source": "<SOURCE>",
  "reviewer": "<REVIEWER>",
  "reviewedAt": "<YYYY-MM-DD>",
  "status": "approved",
  "riskNotes": "<RISK_NOTES>"
}
```

- `code`: A-share format `\d{6}\.(SH|SZ|BJ)`. Must be explicitly named by the user. No auto-generation.
- `segment`: must match an existing segment key in `reviewed_segment_codes.json` (e.g. `aiComputing.computeChip`).
- `dataUse`: `["news"]` only. Do NOT add `"quote"`, `"report"`, `"fundamental"`, or `"announcement"` unless separately reviewed.
- `reason`: human-written justification. Must explain why this code is being reviewed for news.
- `source`: where the code came from (e.g. "manual review", "user request").
- `reviewer`: name of the person who performed the review.
- `reviewedAt`: ISO date string.
- `status`: must be `"approved"`.
- `riskNotes`: any caveats. Can be empty string.

## 2. Pre-conditions

- D-2B news contract hardening complete — all 6 tests pass.
- D-3A news dataUse opening review complete and approved.
- The code must be explicitly named and authorized by the user.
- 688041.SH must NOT be used as the first news code — it is quote-only/manual-smoke.
- Do NOT add `"news"` to 688041.SH's dataUse.

## 3. Manifest modification rules

- Add exactly 1 code with exactly 1 family (`"news"`).
- No batch additions.
- The code goes ONLY into `agent/config/reviewed_segment_codes.json`.
- Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror (`frontend/src/lib/reviewedCodes/reviewedSegmentCodes.ts`).
- The code must NOT be added to segmentCodeMap (`frontend/src/lib/aiComputing/segmentCodeMap.ts` or `frontend/src/lib/humanoidRobot/segmentCodeMap.ts`).
- The code must NOT be written into any test file, test fixture, page component, or watchlist.

## 4. Test requirements

- All tests use only placeholders: 000000.SH, 000000.SZ, MOCK, TEST.
- Manifest consistency tests must pass: `npm run test:run -- reviewedCodes`.
- Frontend reviewedCodes tests must pass.
- Backend route tests must pass.
- No real stock code may appear in test assertions or fixtures.

## 5. API-only smoke

After manifest is updated and 8899 is restarted (requires explicit authorization):

- `GET /api/a-stocks/data?code=<REVIEWED_A_SHARE_CODE>&include=news`
  - Expect HTTP 200, `data.news.ok: true`, `source: "eastmoney"`.
- If provider returns `[]`: verify `ok: true`, `partial: false` — empty is valid, not an error.
- If provider throws or network fails: verify `ok: false`, `error_code: "provider_request_failed"`.
- Unreviewed code (e.g. `000000.SH`) with `include=news`: verify `error_code: "code_not_reviewed"`.
- Do NOT enter the code into the watchlist UI, localStorage, or any frontend page.

## 6. Rollback

- Edit the manifest: remove the code from `codes` array, or change its `dataUse` to `[]` or `["quote"]`.
- Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
- Verify the code returns `code_not_reviewed` for news: `GET /api/a-stocks/data?code=<CODE>&include=news`.
- No cleanup needed in tests or frontend (the code was never there).

## 7. This document does NOT authorize implementation

- No manifest changes are authorized.
- No real stock codes are authorized.
- No codegen or frontend mirror changes are authorized.
- This is a template and checklist for future use only.
