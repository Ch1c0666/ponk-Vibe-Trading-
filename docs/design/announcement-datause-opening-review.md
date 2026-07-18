# Announcement dataUse Opening Design Review

Date: 2026-07-18
Status: design review only — do NOT open manifest, do NOT implement.

## Why announcement is the highest-risk non-quote family

- Provider: Cninfo (`www.cninfo.com.cn`) — SZSE/SSE disclosure platform, POST-based API.
- orgId resolution: first call loads `szse_stock.json` orgId mapping, cached globally; stale after long uptime.
- Fallback: deterministic prefix guess (`gssh0{bare}`, `gsbj0{bare}`, `gssz0{bare}`) — works but not authoritative.
- POST form-encoded requests — less common pattern, more surface for encoding issues.
- D-2D hardening covers: orgId fallback, mapping load failure recovery, empty list, HTTP error, unreviewed gating, provider exception.

## Minimum opening process

1. User explicitly names one code for announcement review.
2. Add the code to `reviewed_segment_codes.json` with `dataUse: ["announcement"]` and mandatory audit fields.
3. Run `scripts/codegen_reviewed_codes.py` to sync the frontend mirror.
4. Run automated test suite to confirm no regressions.
5. Restart 8899 (requires explicit authorization).
6. API-only smoke (no UI, no watchlist interaction):
   - `GET /api/a-stocks/data?code=<CODE>&include=announcements`
   - Report only: ok, source, count — do NOT print announcement titles or content
   - If empty: verify ok true, data [] — empty is valid, not an error
   - If provider error: verify ok false, error_code provider_request_failed
   - `GET /api/a-stocks/data?code=000000.SH&include=announcements` → code_not_reviewed
   - Non-announcement families → all code_not_reviewed
7. Rollback: remove `"announcement"` from dataUse or remove code → re-run codegen → verify code_not_reviewed

## Explicit prohibitions

- Do NOT add `"announcement"` to 688041.SH (quote-only) or 688981.SH (news-only).
- Do NOT auto-expand any existing code's dataUse.
- Do NOT write the new code into tests, pages, watchlist, fixtures, or segmentCodeMap.

## Safety boundaries (unchanged)

- q_type=1 remains fail-closed everywhere.
- US stock remains fail-closed.
- segmentCodeMap unchanged.
- No broker/trading connectivity.
- .env not read/modified.
- 688041.SH remains quote-only; 688981.SH remains news-only.

## This document does NOT authorize implementation

- No manifest changes, no code changes, no codegen authorized.
