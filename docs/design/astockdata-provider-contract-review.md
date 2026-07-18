# A-Stock-Data Provider Contract Review

Date: 2026-07-18
Status: design review — do NOT open non-quote dataUse until each contract is separately approved.

Current manifest: only 688041.SH, `dataUse: ["quote"]`. No other dataUse values exist.

## 1. Quote contract

- provider: Tencent `qt.gtimg.cn` (public no-auth HTTP)
- function: `tencent_quote(codes)`
- fields: name, price, prev_close, open, high, low, change_pct, pe_ttm, pb, volume
- gating: `dataUse: "quote"` in reviewed manifest
- fail-closed: timeout (10s) → exception → 502 provider_request_failed
- live smoke: passed on PID 35943 — 688041.SH returns 200 with all fields present
- status: **approved for quote use only**
- currently open: yes (only for 688041.SH)

## 2. Reports contract

- provider: Eastmoney + THS (via `get_research_reports` tool)
- function: `_fetch_reports(code, limit)` → calls tool registry `get_research_reports`
- gating: `dataUse: "report"` in reviewed manifest
- q_type boundary: only `q_type=0` (stock-level reports); `q_type=1` industry reports fail-closed elsewhere
- fields: title, orgSName, researcher, publishDate, infoCode, emRatingName, predict E/P ratios
- fail-closed: tool unavailable → RuntimeError; tool returns `ok: false` → forwarded as-is
- error surface: provider_request_failed, tool execution errors
- concerns:
  - Routes through tool registry, not the REST `/api/reports/research` pipeline — separate call path
  - `build_registry()` may have side effects (tool loading) on every request
  - The tool's own q_type=1 fail-closed must be verified independently
- status: **not approved for report use**
- prerequisites before opening `dataUse: "report"`:
  - verify `get_research_reports` tool q_type=1 fail-closed with a mock test
  - verify `build_registry()` call overhead is acceptable (~ms, not seconds)
  - add contract test: tool returns `ok:false` → route propagates correctly
  - live smoke with a manually-approved report-use code (requires manifest entry with `dataUse: ["report"]`)

## 3. News contract

- provider: Eastmoney `search-api-web.eastmoney.com` (JSONP API)
- function: `eastmoney_stock_news(code, page_size)`
- fields: title, content (truncated to 200 chars), time, source, url
- gating: `dataUse: "news"` in reviewed manifest
- fail-closed: HTTP error, JSONP parse failure, or exception → empty list `[]`, returned as `ok("eastmoney", [])`
- rate limit: shares Eastmoney throttled session (`_EM_MIN_INTERVAL = 1.0s`)
- concerns:
  - JSONP parsing is fragile — depends on response text format; upstream format change could break silently
  - Empty result is ambiguous: "no news" vs. "parse failure" both return `[]`
  - Content HTML tag stripping (`re.sub(r'<[^>]+>', ...)`) is best-effort
- status: **not approved for news use**
- prerequisites before opening `dataUse: "news"`:
  - add contract test: valid JSONP response → parsed fields correct
  - add contract test: malformed JSONP → returns `[]` without exception
  - add contract test: HTTP error → returns `[]`
  - live smoke with a manually-approved news-use code

## 4. Fundamentals contract

- provider: Eastmoney `push2.eastmoney.com` (stock info) + Sina `quotes.sina.cn` (financial reports)
- functions:
  - `eastmoney_stock_info(code)` → industry, shares, market cap, listing date
  - `sina_financial_report(code, report_type, num)` → income statement (lrb), balance sheet (fzb), cash flow (llb)
- gating: `dataUse: "fundamental"` in reviewed manifest
- eastmoney fields: code, name, industry, total_shares, float_shares, mcap, float_mcap, list_date, price
- sina fields: report_period, dynamic item_title/item_value/item_tongbi from `CompanyFinanceService.getFinanceReport2022`
- fail-closed: eastmoney → returns `None`; sina → returns `[]`
- concerns:
  - Sina endpoint (`quotes.sina.cn`) is a relatively new addition — less established than Tencent
  - Sina field names are Chinese-language (`净利润`, `营业收入`) — not i18n-friendly
  - Sina `_bounded_int` cap (1-20) is reasonable for limit control
  - Eastmoney stock info endpoint uses hardcoded field codes (`f57,f58,...`) which may change upstream
- status: **not approved for fundamental use**
- prerequisites before opening `dataUse: "fundamental"`:
  - add contract test: eastmoney stock info parses all fields correctly
  - add contract test: sina income/balance/cash-flow all return report_list shape
  - add contract test: invalid report_type → returns `[]`
  - verify sina endpoint rate-limit tolerance
  - live smoke with a manually-approved fundamental-use code

## 5. Announcements contract

- provider: Cninfo `www.cninfo.com.cn` (SZSE/SSE disclosure platform)
- function: `cninfo_announcements(code, page_size)`
- fields: title, type, date, url
- gating: `dataUse: "announcement"` in reviewed manifest
- fail-closed: HTTP error, JSON parse failure, or exception → `[]`
- orgId resolution:
  - First call loads `szse_stock.json` orgId mapping (cached globally in `_CNINFO_ORGID_MAP`)
  - Fallback: deterministic prefix-based guess (`gssh0{bare}`, `gsbj0{bare}`, `gssz0{bare}`)
  - Mapping load failure → `{}` cached → fallback used for all subsequent calls
- concerns:
  - orgId mapping is a global cache — stale if server runs for days and new listings appear
  - POST request with form-encoded body — less common than GET, more surface for encoding issues
  - `pageSize` capped at 50 but not enforced on the response — upstream may return fewer
- status: **not approved for announcement use**
- prerequisites before opening `dataUse: "announcement"`:
  - add contract test: orgId resolved from mapping → correct POST payload
  - add contract test: orgId fallback → deterministic guess used
  - add contract test: mapping load failure → fallback still works
  - add contract test: empty announcements list → `[]`
  - live smoke with a manually-approved announcement-use code

## 6. Cross-cutting requirements

Before ANY non-quote dataUse is opened:
- the manifest entry must carry: reason, source, reviewer, reviewedAt, status: "approved", dataUse: ["<family>"]
- each family must pass the prerequisites listed above before its first code is added
- no batch opening — add one family at a time, smoke, then proceed
- 688041.SH must remain `dataUse: ["quote"]` only — do not append report/news/fundamental/announcement to its dataUse without a separate review per family

## 7. Current manifest status

- Only code: 688041.SH, `dataUse: ["quote"]`
- All other families (report, news, fundamental, announcement) → code_not_reviewed for every code
- This is correct and must remain until each family's contract is reviewed and approved

## Recommendation

- quote: already open, live-smoke-passed, no changes needed
- reports/news/fundamentals/announcements: all remain **fail-closed**
- no manifest changes authorized by this review
- next step: user decides which family (if any) to review and open first
