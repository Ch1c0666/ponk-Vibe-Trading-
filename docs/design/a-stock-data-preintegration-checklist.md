# A-Stock-Data Pre-Integration Checklist

Document status: pre-integration audit — do NOT implement provider yet.

## Completed capabilities (local-only phase)

- Overview page with index quote cards
- Humanoid Robot supply-chain research framework
- AI Computing supply-chain research framework
- Reviewed code manifest (allowlist gate)
- Quote-only reviewed stock card
- Watchlist localStorage persistence (add / remove / validate)
- Watchlist manual quote loading (disabled / mock / real, A-share only, US fail-closed)
- Watchlist local management (inline notes edit, move up/down reorder, delete stability)
- Watchlist backup import/export (pure local JSON, no network)
- q_type=1 fail-closed (returns empty, not q_type=0 data)
- US stock fail-closed everywhere
- No broker connection, no trade execution

## Boundaries that must be preserved during integration

- No broker connection or trade execution
- Do not read, print, or leak .env files, API keys, or process.env values
- q_type=1 (industry reports) must remain fail-closed until explicitly implemented
- segmentCodeMap must not contain real stock codes until manually audited
- Quote data is read-only display data — never used for order routing or trading
- ReportLibrary must not consume quote-only reviewed codes
- US stock integration must go through an independent design review before any implementation
- 688041.SH is a manual-smoke-only reviewed code; never hardcode into fixtures, tests, or config

## A-stock-data provider: design questions (answer before implementing)

1. **Provider location — backend or frontend?**
   - Default recommendation: backend. Avoids exposing API credentials to the browser.
   - If backend, expose a REST endpoint the frontend already uses (e.g. /api/stocks/quote).

2. **Does the provider require an API key?**
   - If yes, the key must be read from a backend environment variable only.
   - The key must never be printed, logged, or returned in API responses.

3. **How does the provider response map to the existing /api/stocks/quote envelope?**
   - Envelope fields: ok, source, code, data.{name, price, prev_close, open, high, low, change_pct, pe_ttm, pb}, error, error_code.
   - Provider response must be normalized to this shape before the frontend sees it.

4. **How does the reviewed manifest continue to act as a hard gate?**
   - The manifest (reviewed_segment_codes.json) is the allowlist.
   - The /api/stocks/quote endpoint must reject codes not in the manifest with 403 code_not_reviewed.
   - This gate must run before any provider call.

5. **Rate limiting, timeout, and provider unavailability**
   - Define a maximum concurrency / request rate to the provider.
   - Define a timeout per request (e.g. 5 seconds).
   - On provider timeout or error, fail-closed: return an error envelope, do not fall through to another data source silently.

6. **Batch quotes — design first, implement later**
   - Consider whether a single GET /api/stocks/quotes?codes=a,b,c endpoint would help.
   - Design the batch format, rate limits, and partial-failure semantics.
   - Do NOT implement batch until single-code real mode is stable.

7. **US stock support?**
   - Default: not supported.
   - Must go through an independent design review.
   - The US stock fail-closed boundary must remain intact until that review is complete.

## Next step

- A-stock-data integration DESIGN REVIEW only.
- Do NOT write any provider implementation code until the design review is approved.
- After design approval, implement behind the existing /api/stocks/quote endpoint with manifest gating unchanged.
