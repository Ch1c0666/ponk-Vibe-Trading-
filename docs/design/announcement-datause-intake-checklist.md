# Announcement dataUse Intake Checklist

Date: 2026-07-18
Status: template and checklist only — do NOT open manifest, do NOT add real codes.

## 1. Intake template

```json
{
  "code": "<REVIEWED_A_SHARE_CODE>",
  "segment": "<SEGMENT_KEY>",
  "dataUse": ["announcement"],
  "reason": "<HUMAN_REVIEW_REASON>",
  "source": "<SOURCE>",
  "reviewer": "<REVIEWER>",
  "reviewedAt": "<YYYY-MM-DD>",
  "status": "approved",
  "riskNotes": "<RISK_NOTES>"
}
```

- `code`: A-share format `\d{6}\.(SH|SZ|BJ)`. Must be explicitly named by the user.
- `segment`: must match an existing segment key.
- `dataUse`: `["announcement"]` only. Do NOT add other families.

## 2. Pre-conditions

- D-2D announcements contract hardening complete.
- D-6A announcement opening review complete and approved.
- User must explicitly name the code.
- Do NOT add `"announcement"` to 688041.SH (quote-only) or 688981.SH (news-only).
- Do NOT auto-expand any existing code.

## 3. Manifest modification rules

- Add exactly 1 code with `dataUse: ["announcement"]`.
- Code goes ONLY into `agent/config/reviewed_segment_codes.json`.
- Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
- Code must NOT appear in segmentCodeMap, tests, pages, watchlist, or fixtures.

## 4. Test requirements

- All tests use only placeholders: 000000.SH, 000000.SZ, MOCK, TEST.
- Route tests, contract tests, and reviewedCodes tests must pass.

## 5. API-only smoke

After manifest update and 8899 restart (requires explicit authorization):

- `GET /api/a-stocks/data?code=<CODE>&include=announcements`
  - Report: ok, source, count — do NOT print announcement titles or content
- `GET /api/a-stocks/data?code=000000.SH&include=announcements` → code_not_reviewed
- `GET /api/a-stocks/data?code=<CODE>&include=announcements&q_type=1` → 400 invalid_argument
- q_type=1 must remain fail-closed everywhere
- Non-announcement families → all code_not_reviewed

## 6. Rollback

- Remove `"announcement"` from dataUse or remove the code.
- Run codegen, verify code_not_reviewed for announcements.

## 7. This document does NOT authorize implementation

- No manifest changes, no real codes, no codegen changes authorized.
