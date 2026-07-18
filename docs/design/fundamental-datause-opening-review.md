# Fundamental dataUse Opening Design Review

Date: 2026-07-18
Status: design review only — do NOT open manifest, do NOT implement.

## Why fundamental is more complex than news/report

- Two providers: `eastmoney_stock_info` (Eastmoney) + `sina_financial_report` (Sina) — more failure surface.
- `eastmoney_stock_info` may return `None` on HTTP error or parse failure — now handled as soft empty (stock_info=None, financial_reports still populated).
- `sina_financial_report` returns three report types: `lrb` (income statement), `fzb` (balance sheet), `llb` (cash flow) — each a list of period records.
- Field names are Chinese-language from Sina (`净利润`, `总资产`, `经营活动现金流`) — not i18n-friendly for direct UI display.
- Empty arrays from sina are a safe empty state — not an error.
- D-2C hardening covers: stock_info all fields, HTTP error → None, invalid report_type → [], num bounded [1,20], fzb/llb shape, unreviewed gating, empty payload, provider exception.

## Minimum opening process

1. User explicitly names one code for fundamental review.
2. Add the code to `reviewed_segment_codes.json` with `dataUse: ["fundamental"]` and mandatory audit fields.
3. Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
4. Run automated test suite to confirm no regressions.
5. Restart 8899 (requires explicit authorization).
6. API-only smoke (no UI, no watchlist interaction):
   - `GET /api/a-stocks/data?code=<CODE>&include=fundamentals`
   - Report only: ok, source, stock_info present (true/false), report counts per type
   - Do NOT print financial field values
   - If stock_info is None: verify ok true, stock_info=None, reports still populated
   - If sina returns [] for all types: verify ok true, all three arrays empty
   - `GET /api/a-stocks/data?code=000000.SH&include=fundamentals` → code_not_reviewed
   - `GET /api/a-stocks/data?code=<CODE>&include=fundamentals&q_type=1` → 400 invalid_argument
   - Non-fundamental families → all code_not_reviewed
7. Rollback: remove `"fundamental"` from dataUse or remove code → re-run codegen → verify code_not_reviewed

## Explicit prohibitions

- Do NOT add `"fundamental"` to 688041.SH — it is quote-only/manual-smoke.
- Do NOT add `"fundamental"` to 688981.SH — it is news-only.
- Do NOT auto-expand any existing code's dataUse.
- Do NOT write the new code into tests, pages, watchlist, fixtures, or segmentCodeMap.
- q_type=1 remains fail-closed.

## Safety boundaries (unchanged)

- q_type=1 remains fail-closed everywhere.
- US stock remains fail-closed.
- segmentCodeMap unchanged.
- No broker/trading connectivity.
- .env not read/modified.
- 688041.SH remains quote-only.
- 688981.SH remains news-only.

## This document does NOT authorize implementation

- No manifest changes are authorized.
- No code changes are authorized.
- Opening fundamental dataUse requires explicit user authorization after this review is approved.
