# Reviewed Code Expansion Process

Date: 2026-07-19
Status: process document — do NOT add codes without explicit user authorization.

## Current manifest state

- 688041.SH: dataUse ["quote"] — computeChip, approved
- 688981.SH: dataUse ["news","fundamental","report","announcement"] — computeChip, approved
- All other segments: empty

## Expansion rules

1. User must explicitly name each code with all required fields.
2. One code per authorization — no batch additions.
3. Each code must have:
   - code: A-share format `\d{6}\.(SH|SZ|BJ)`
   - segment: existing segment key in `reviewed_segment_codes.json`
   - dataUse: one or more of ["quote","news","fundamental","report","announcement"]
   - reason: human-written justification
   - source: where the code came from
   - reviewer: person who reviewed it
   - reviewedAt: ISO date
   - status: "approved"
   - riskNotes: any caveats
4. After manifest update: run `scripts/codegen_reviewed_codes.py`
5. Run test suite to confirm no regressions
6. Restart 8899 (requires explicit authorization)
7. API-only smoke per dataUse family
8. Manual page smoke on relevant segment detail page

## What codes must NOT go into

- segmentCodeMap (aiComputing or humanoidRobot) — these remain empty until ReportLibrary bridge design is approved
- Test fixtures or assertions
- Page hardcoded strings
- Watchlist localStorage defaults
- .env or environment variables

## Family-specific smoke

- quote: `GET /api/stocks/quote?code=<CODE>` → 200 with price data
- news: `GET /api/a-stocks/data?code=<CODE>&include=news` → ok, data array
- reports: `GET /api/a-stocks/data?code=<CODE>&include=reports` → ok
- fundamentals: `GET /api/a-stocks/data?code=<CODE>&include=fundamentals` → ok, financial_reports populated
- announcements: `GET /api/a-stocks/data?code=<CODE>&include=announcements` → ok

## Rollback

- Remove code or change dataUse → run codegen → verify code_not_reviewed
- No cleanup needed in tests or frontend (codes were never there)
