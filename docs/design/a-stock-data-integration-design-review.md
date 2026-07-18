# A-Stock-Data Integration Design Review

Document status: design review — do NOT implement provider until approved.

Date: 2026-07-18

## 1. Integration scope

- a-stock-data acts as a **read-only quote / market-data provider** only.
- Phase 1 scope: serve the existing `GET /api/stocks/quote?code=` endpoint.
- Out of scope for Phase 1:
  - ReportLibrary (research report pipeline)
  - q_type=1 industry reports (must remain fail-closed)
  - OHLCV / historical bars for backtest
  - Trading or broker connectivity
  - US stock quotes

## 2. Provider placement

- **Provider lives in the backend.** `agent/backtest/loaders/astockdata_loader.py` already contains `tencent_quote()` which calls the Tencent public HTTP endpoint (no API key).
- **Current-state finding:** `agent/src/api/stock_quote_routes.py` already imports `tencent_quote` from the loader and calls it inside the route handler. This was implemented before the current design review and serves as the baseline.
- **No new provider implementation was done in this review round.** Any change to the provider routing (e.g. switching providers, adding fallback, changing the call path) requires a separate authorization beyond this document.
- The frontend only calls `GET /api/stocks/quote?code=` — it never directly contacts a-stock-data, Tencent, or any provider SDK.
- If a future provider requires an API key, the key must be read from a backend environment variable only. The frontend must never see it.

## 3. Gating chain

The gating chain in `stock_quote_routes.py` must be preserved in any implementation:

1. Code format validation (regex `^\d{6}\.(SH|SZ|BJ)$`) → 400 on mismatch.
2. Reviewed manifest lookup (`get_reviewed_stock_codes()`) — reads `reviewed_segment_codes.json`, filters to `status: "approved"` and `dataUse.includes("quote")`.
3. If the code is NOT in the reviewed set → 403 with `error_code: "code_not_reviewed"`. **Zero provider calls for unreviewed codes.**
4. If reviewed → call provider → normalize to StockQuoteEnvelope → 200.
5. Provider failure (timeout, parse error, empty response) → 502 with `error_code: "provider_request_failed"`.

## 4. Configuration and secrets

- The current Tencent quote endpoint (`qt.gtimg.cn`) is a public no-auth HTTP API — no API key needed.
- If a future provider requires an API key:
  - The key must be read from a backend environment variable only.
  - The key must never be printed, logged, or returned in API responses.
  - The key must never appear in test fixtures, documentation examples, or the frontend bundle.
  - Missing key → provider unavailable, fail-closed (return 502, not crash).
- This document contains no API key, token, secret, or password values.

## 5. Data mapping

The `tencent_quote()` function returns a dict per code. Each field maps to `StockQuoteEnvelope.data` as follows:

- `name` → `data.name` (string, stripped; null if absent)
- `price` → `data.price` (float or null)
- `prev_close` → `data.prev_close` (float or null)
- `open` → `data.open` (float or null)
- `high` → `data.high` (float or null)
- `low` → `data.low` (float or null)
- `change_pct` → `data.change_pct` (float or null)
- `pe_ttm` → `data.pe_ttm` (float or null)
- `pb` → `data.pb` (float or null)

Envelope-level fields:

- `ok: true` for success, `ok: false` for any error.
- `source: "tencent"` — identifies the provider.
- `code` — the original A-share code as received (e.g. `688041.SH`).
- `error` / `error_code` — only present when `ok: false`.

No new frontend response format is needed. The existing `StockQuoteEnvelope` shape covers all Phase 1 needs.

## 6. Error model

All errors use the same `{ ok: false, error: "...", error_code: "..." }` envelope.

**code_not_reviewed** (HTTP 403)
- Cause: code not in reviewed manifest.
- Retry: no. User must wait for manifest update.
- Frontend rendering: "Pending review" / "待审核" in price cell, no numeric price.

**invalid_argument** (HTTP 400)
- Cause: code format mismatch or unknown query parameter.
- Retry: no. Frontend validates format before sending.
- Frontend rendering: not surfaced in normal flow.

**provider_request_failed** (HTTP 502)
- Cause: provider timeout, network error, parse error, empty response.
- Retry: yes. User can click Load Quotes again.
- Frontend rendering: error message text in price cell.

**unsupported_market** (HTTP 400)
- Cause: code does not match SH/SZ/BJ pattern.
- Retry: no. Frontend filters non-A-share codes.
- Frontend rendering: not surfaced (US section has no Load Quotes button).

**rate_limited** (HTTP 429)
- Cause: too many requests in a short period.
- Retry: yes, after backoff.
- Frontend rendering: error message, recommend waiting.

Provider failure must never return fabricated price data. Every error path must produce `ok: false`.

## 7. Market scope

- Phase 1: SH (Shanghai), SZ (Shenzhen), BJ (Beijing) — all three A-share exchanges.
- The regex gate already accepts `^\d{6}\.(SH|SZ|BJ)$`.
- US stock: **fail-closed everywhere.** The frontend's US watchlist section has no Load Quotes button. The backend's code format regex rejects non-A-share codes. This boundary must not be relaxed.
- If a-stock-data adds support for additional markets (HK, US, etc.), those must go through an independent design review before any code change.

## 8. Batch quotes — design only

Future endpoint (do NOT implement yet): `POST /api/stocks/quotes` or `GET /api/stocks/quotes?codes=a,b,c`.

Design decisions to resolve before implementation:

- Batch request format: array of codes in request body or comma-separated query string.
- Batch response format: `{ ok: true, source: "tencent", quotes: { "code1": {...}, "code2": {...} } }`.
- Every code must independently pass the reviewed manifest gate. An unreviewed code returns `{ ok: false, error_code: "code_not_reviewed" }` in its per-code slot — it must NOT block other reviewed codes.
- Rate limit: cap batch size (e.g. 20 codes) and enforce server-side.
- Do NOT implement batch until single-code real mode is stable and smoke-tested.

## 9. Test plan

Provider contract tests (mock — no real network):
- `agent/tests/test_astockdata_contract.py` already exists with mocked external HTTP boundaries.
- Verify `tencent_quote` parses the Tencent text format correctly.
- Verify the field mapping in `stock_quote_routes.py` produces the correct envelope.

Route tests:
- `agent/tests/test_stock_quote_routes.py` already exists.
- Confirm unreviewed code → 403, zero calls to provider.
- Confirm reviewed code → 200 with correct envelope shape.
- Confirm malformed code → 400.
- Confirm provider exception → 502.

Manifest tests:
- `get_reviewed_stock_codes()` must skip entries with missing `dataUse`, missing `status: "approved"`, or missing audit fields.
- Manifest parse failure → empty reviewed set (fail-closed).

Frontend tests:
- All existing watchlist / Overview tests use placeholder codes (000000.SH, 000000.SZ, MOCK, TEST).
- Frontend tests must never contain 688041.SH or any real stock code.
- 688041.SH is manual-smoke-only.

Manual smoke:
- Only after D-2 is explicitly authorized and implemented: manually add 688041.SH via UI, click Load Quotes, verify 200 with live tencent data.
- Manual smoke only — do not write 688041.SH into test fixtures, code, or config.

## 10. Phased implementation plan

All phases below require explicit user authorization before starting. None have been authorized or implemented in this review round.

D-1: Provider interface + mock contract (NO production routing changes)
- Refine the provider abstraction in `astockdata_loader.py` if needed.
- Write or update contract tests with mocked HTTP.
- No change to production routing.

D-2: Backend route verification and hardening
- Review the existing `stock_quote_routes.py` error handling and timeout configuration.
- Add any missing safety checks (request timeout, response size limit).
- Requires separate authorization beyond this design review.

D-3: Frontend zero-change compatibility smoke
- The frontend already calls `GET /api/stocks/quote?code=` via `loadStockQuote`.
- Verify the existing frontend code receives and renders the backend response correctly.
- No frontend code changes expected — the envelope format is unchanged.

D-4: Batch quote design (separate design doc, do not implement)
- Write a separate batch-quote design doc covering format, rate limits, partial failure.
- Do NOT implement until single-code mode is stable and authorized.

D-5: Add more reviewed codes (only after explicit approval)
- Each new reviewed code must carry: reason, source, reviewer, reviewedAt, status: "approved", dataUse: ["quote"].
- Add codes in small batches (1-3 at a time).
- Never add codes without explicit review and authorization.

## Findings

- The existing `stock_quote_routes.py` + `astockdata_loader.py` + `reviewed_segment_codes.json` chain provides a correct gating, provider call, and error handling baseline. This is a current-state observation, not an authorization to modify.
- The frontend's `loadStockQuote` → `WatchlistSection` → `watchlistService` chain already handles the full `ok: true/false` envelope and all error states.
- The only reviewed code in the manifest (688041.SH) is correctly gated with `dataUse: ["quote"]` and `status: "approved"`.
- No new provider code was written or authorized in this review round.

## Recommendation

- ready_for_review: yes
- recommended_next_step: user approves whether to enter D-1
- do_not_implement_provider_until_approved: D-1 through D-5 each require separate explicit authorization after this design review is approved
- No provider implementation was authorized or performed in this round
