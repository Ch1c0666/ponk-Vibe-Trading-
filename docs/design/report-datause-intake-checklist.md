# Report dataUse Intake Checklist

Date: 2026-07-18
Status: template and checklist only — do NOT open manifest, do NOT add real codes.

## 1. Intake template

All fields use placeholders. Replace `<...>` only with explicit user authorization.

```json
{
  "code": "<REVIEWED_A_SHARE_CODE>",
  "segment": "<SEGMENT_KEY>",
  "dataUse": ["report"],
  "reason": "<HUMAN_REVIEW_REASON>",
  "source": "<SOURCE>",
  "reviewer": "<REVIEWER>",
  "reviewedAt": "<YYYY-MM-DD>",
  "status": "approved",
  "riskNotes": "<RISK_NOTES>"
}
```

- `code`: A-share format `\d{6}\.(SH|SZ|BJ)`. Must be explicitly named by the user.
- `segment`: must match an existing segment key in `reviewed_segment_codes.json`.
- `dataUse`: `["report"]` only. Do NOT add `"quote"`, `"news"`, `"fundamental"`, or `"announcement"`.
- `reason`: human-written justification. Must explain why this code is being reviewed for research reports.
- `source`: where the code came from.
- `reviewer`: name of the person who performed the review.
- `reviewedAt`: ISO date string.
- `status`: must be `"approved"`.
- `riskNotes`: any caveats. Must note "report-only".

## 2. Pre-conditions

- D-2A reports contract hardening complete — tool ok:false, exception, and unavailable tests all pass.
- D-4A report dataUse opening review complete and approved.
- The code must be explicitly named and authorized by the user.
- Do NOT add `"report"` to 688041.SH — it is quote-only/manual-smoke.
- Do NOT add `"report"` to 688981.SH — it is news-only.
- Do NOT auto-expand any existing code's dataUse.

## 3. Manifest modification rules

- Add exactly 1 code with `dataUse: ["report"]`.
- No batch additions.
- The code goes ONLY into `agent/config/reviewed_segment_codes.json`.
- Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
- The code must NOT be added to segmentCodeMap.
- The code must NOT be written into any test file, test fixture, page component, or watchlist.

## 4. q_type boundary

- Only `q_type=0` (stock-level individual research reports) is allowed.
- `q_type=1` (industry-level reports) must remain fail-closed everywhere.
- Do NOT use q_type=0 data to impersonate q_type=1 industry reports.
- The `_fetch_reports` function hardcodes `q_type=0` — do not change this.

## 5. Test requirements

- All tests use only placeholders: 000000.SH, 000000.SZ, MOCK, TEST.
- Route tests (`test_astockdata_routes.py`) must pass.
- Research report route tests (`test_research_report_routes.py`) must pass — especially q_type=1 fail-closed.
- Frontend reviewedCodes tests must pass.
- Manifest consistency tests must pass.

## 6. API-only smoke

After manifest is updated and 8899 is restarted (requires explicit authorization):

- `GET /api/a-stocks/data?code=<REVIEWED_REPORT_CODE>&include=reports`
  - Verify HTTP 200, `data.reports.ok: true`, source present.
  - Report only count and source — do NOT print report titles or content.
- If tool returns `[]`: verify `ok: true`, `partial: false` — empty is valid.
- If tool returns `ok: false`: verify error propagation.
- `GET /api/a-stocks/data?code=000000.SH&include=reports` → `code_not_reviewed`.
- `GET /api/a-stocks/data?code=<CODE>&include=reports&q_type=1` → 400 invalid_argument.
- Non-report families for the same code → all `code_not_reviewed`.
- Do NOT enter the code into watchlist UI, localStorage, or any frontend page.

## 7. Rollback

- Edit the manifest: remove `"report"` from dataUse or remove the code entirely.
- Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
- Verify the code returns `code_not_reviewed` for reports.
- No cleanup needed in tests or frontend (the code was never there).

## 8. This document does NOT authorize implementation

- No manifest changes are authorized.
- No real stock codes are authorized.
- No codegen or frontend mirror changes are authorized.
- This is a template and checklist for future use only.
