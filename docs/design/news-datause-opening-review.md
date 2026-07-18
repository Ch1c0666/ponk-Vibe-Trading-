# News dataUse Opening Design Review

Date: 2026-07-18
Status: design review only — do NOT open manifest, do NOT implement.

## Why news first

- News is the lowest-risk non-quote family to open.
- It has no dependency on report/q_type pipelines.
- It returns a simple list of {title, content, time, source, url} — no complex nested structure.
- Provider failure is safe: `eastmoney_stock_news` returns `[]` on any error (no partial data, no ambiguous states).
- Contract hardening (D-2B) is complete: valid JSONP, malformed JSONP, HTTP error, unreviewed gating, empty result, provider exception — all covered.

Comparison with other families:
- reports: depends on tool registry (`get_research_reports`), q_type=0 only, q_type=1 fail-closed — more coupling.
- fundamentals: depends on two providers (eastmoney + sina), nested financial reports — more surface area.
- announcements: depends on cninfo orgId resolution cache — more state.

## Minimum opening process

1. Choose one code. Must have a real business reason to be reviewed.
2. Add the code to `reviewed_segment_codes.json` in the appropriate segment, with:
   - `code`: A-share format `\d{6}\.(SH|SZ|BJ)`
   - `status`: "approved"
   - `reason`: human-written justification for review
   - `source`: who provided the code (e.g. "manual review")
   - `reviewer`: name of the person who reviewed it
   - `reviewedAt`: ISO date
   - `dataUse`: `["news"]` — only this one family, not quote/report/etc.
   - `displayName`: optional, empty string is OK
   - `riskNotes`: optional, empty string is OK
3. Run the automated test suite to confirm no regressions.
4. Restart 8899 (requires explicit authorization).
5. Manual smoke: add the code via watchlist UI (do NOT write to any test file/fixture), click a Load Quotes equivalent for the aggregate route, verify `GET /api/a-stocks/data?code=...&include=news` returns `ok: true` with news data.
6. If the provider returns `[]`, verify the UI shows empty state, not an error.
7. Rollback path: edit the manifest entry and change `dataUse` from `["news"]` to `[]` or `["quote"]` — the code immediately returns to code_not_reviewed for news.

## Manifest rules

- One code, one family at a time. No batch additions.
- Do not add `"news"` to 688041.SH's dataUse — that code is quote-only/manual-smoke.
- Do not write the new code into any test file, fixture, component, or config outside the manifest.
- The code must not appear in segmentCodeMap.

## UI behavior when dataUse "news" is open

- Provider returns non-empty list: render titles, times, sources.
- Provider returns `[]`: render "No news" empty state, not an error.
- Provider throws / HTTP error: render "News unavailable" with retry option.
- Code not in manifest for news: render "Pending review" (code_not_reviewed).
- Do NOT auto-fetch news on page load. Only fetch on explicit user action.

## Safety boundaries (unchanged)

- q_type=1 remains fail-closed.
- US stock remains fail-closed everywhere.
- segmentCodeMap unchanged.
- No broker/trading connectivity.
- .env not read/modified.
- 688041.SH remains quote-only.

## This document does NOT authorize implementation

- No manifest changes are authorized by this document.
- No code changes are authorized by this document.
- Opening news dataUse requires a separate, explicit authorization after this review is approved.
- The first code to receive `dataUse: ["news"]` must be explicitly approved by name.
