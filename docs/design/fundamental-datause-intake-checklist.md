# Fundamental dataUse Intake Checklist

Date: 2026-07-18
Status: template and checklist only — do NOT open manifest, do NOT add real codes.

## 1. Intake template

```json
{
  "code": "<REVIEWED_A_SHARE_CODE>",
  "segment": "<SEGMENT_KEY>",
  "dataUse": ["fundamental"],
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
- `dataUse`: `["fundamental"]` only. Do NOT add other families.
- All audit fields mandatory as shown.

## 2. Pre-conditions

- D-2C fundamentals contract hardening complete.
- D-5A fundamental opening review complete and approved.
- User must explicitly name the code.
- Do NOT add `"fundamental"` to 688041.SH (quote-only) or 688981.SH (news-only).
- Do NOT auto-expand any existing code.

## 3. Manifest modification rules

- Add exactly 1 code with `dataUse: ["fundamental"]`.
- Code goes ONLY into `agent/config/reviewed_segment_codes.json`.
- Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
- Code must NOT appear in segmentCodeMap, tests, pages, watchlist, or fixtures.

## 4. Test requirements

- All tests use only placeholders: 000000.SH, 000000.SZ, MOCK, TEST.
- Route tests, contract tests, and reviewedCodes tests must pass.
- No real stock codes in test assertions.

## 5. API-only smoke

After manifest update and 8899 restart (requires explicit authorization):

- `GET /api/a-stocks/data?code=<CODE>&include=fundamentals`
  - Report: ok, source, stock_info present (true/false), report counts per type
  - Do NOT print financial field values
- `GET /api/a-stocks/data?code=000000.SH&include=fundamentals` → code_not_reviewed
- `GET /api/a-stocks/data?code=<CODE>&include=fundamentals&q_type=1` → 400 invalid_argument
- Non-fundamental families → all code_not_reviewed

## 6. Rollback

- Remove `"fundamental"` from dataUse or remove the code.
- Run codegen, verify code_not_reviewed for fundamentals.

## 7. This document does NOT authorize implementation

- No manifest changes, no real codes, no codegen changes authorized.
