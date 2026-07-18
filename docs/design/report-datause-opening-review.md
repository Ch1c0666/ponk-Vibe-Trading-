# Report dataUse Opening Design Review

Date: 2026-07-18
Status: design review only — do NOT open manifest, do NOT implement.

## Why report is higher risk than news

- Reports depend on the `get_research_reports` tool via `build_registry()` — not a direct provider call.
- The tool path couples to the tool registry, which may have initialization side effects.
- q_type boundary: only `q_type=0` (stock-level individual research reports) is allowed.
- q_type=1 (industry-level reports) must remain fail-closed — do NOT use q_type=0 data to disguise q_type=1.
- The tool returns nested JSON with title, orgSName, researcher, publishDate, infoCode, ratings, EPS/PE predictions — more fields to validate than news.
- D-2A hardening covers: tool ok:false propagation, tool exception → provider_request_failed, tool unavailable → provider_request_failed.
- News was opened first because it has no tool dependency and a simpler data shape.

## Minimum opening process

1. User explicitly names one code for report review. Must have a real business reason.
2. Add the code to `reviewed_segment_codes.json` with:
   - `code`: A-share format `\d{6}\.(SH|SZ|BJ)`
   - `status`: "approved"
   - `dataUse`: `["report"]` — only this one family, not quote/news/fundamental/announcement
   - `reason`, `source`, `reviewer`, `reviewedAt`: mandatory audit fields
   - `riskNotes`: must note "report-only"
3. Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
4. Run automated test suite to confirm no regressions.
5. Restart 8899 (requires explicit authorization).
6. API-only smoke (no UI, no watchlist interaction):
   - `GET /api/a-stocks/data?code=<REVIEWED_REPORT_CODE>&include=reports`
   - Verify HTTP 200, `data.reports.ok: true`, source present
   - Report only count and source — do NOT print report titles or content
   - If tool returns `[]`: verify `ok: true` and `partial: false`
   - If tool returns `ok: false`: verify error propagation
   - `GET /api/a-stocks/data?code=000000.SH&include=reports` → `code_not_reviewed`
   - `GET /api/a-stocks/data?code=<CODE>&include=reports&q_type=1` → 400 invalid_argument
   - Do NOT enter the code into watchlist UI, localStorage, or any frontend page
7. Rollback: remove `"report"` from dataUse or remove the code entirely → re-run codegen → verify code_not_reviewed

## Explicit prohibitions

- Do NOT add `"report"` to 688041.SH's dataUse — that code is quote-only/manual-smoke.
- Do NOT add `"report"` to 688981.SH's dataUse — that code is news-only.
- Do NOT auto-expand any existing code's dataUse to include report.
- Do NOT write the new code into tests, pages, watchlist, fixtures, or segmentCodeMap.
- The code goes ONLY into `agent/config/reviewed_segment_codes.json` and the generated frontend mirror.
- q_type=1 must remain fail-closed everywhere — do NOT use q_type=0 as a workaround.

## Safety boundaries (unchanged)

- q_type=1 remains fail-closed.
- US stock remains fail-closed everywhere.
- segmentCodeMap unchanged.
- No broker/trading connectivity.
- .env not read/modified.
- 688041.SH remains quote-only.
- 688981.SH remains news-only.
- quote, news, fundamentals, announcements families unchanged for all existing codes.

## This document does NOT authorize implementation

- No manifest changes are authorized.
- No code changes are authorized.
- No codegen or frontend mirror changes are authorized.
- Opening report dataUse requires a separate, explicit authorization after this review is approved.
- The first code to receive `dataUse: ["report"]` must be explicitly approved by name.
