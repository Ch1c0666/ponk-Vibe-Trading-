# Stock Info Fallback Design

Date: 2026-07-19
Status: design — do NOT implement until approved.

## Problem

`eastmoney_stock_info` uses `push2.eastmoney.com` which is blocked by macOS system proxy.
4 fallback methods tried (em_get, requests proxy bypass, trust_env session, urllib ProxyHandler) — all blocked.

## Reachable domains (curl-verified)

- `quotes.sina.cn` — used by `sina_financial_report`, works
- `hq.sinajs.cn` — Sina HQ public endpoint, works
- `datacenter-web.eastmoney.com` — Eastmoney datacenter API, works
- `www.cninfo.com.cn` — used by `cninfo_announcements`, works

## Blocked domain

- `push2.eastmoney.com` — only this domain is blocked

## Proposed fallback: Eastmoney datacenter API

The datacenter API (`datacenter-web.eastmoney.com`) is NOT blocked and can provide company profile data (code, name, industry, board, listing date).

Approach:
1. Add `eastmoney_stock_profile(code)` function that calls datacenter API
2. In `eastmoney_stock_info`, if push2 fails, try datacenter as fallback
3. Map datacenter response fields to existing StockInfo format

Fields available from datacenter:
- SECURITY_CODE → code
- SECURITY_NAME_ABBR → name
- BOARD_NAME → board (科创板/主板/创业板)
- INDUSTRY → industry (if available)

## What NOT to use

- Sina HQ (`hq.sinajs.cn`): returns full quote data (price, change, volume) — this IS a quote endpoint and must not be used for non-quote stock_info
- Tencent quote: requires quote dataUse, not available for 688981

## Safety

- No new API keys or tokens
- Public no-auth endpoints only
- Fail-closed on any error
- Does not expand dataUse permissions
- Does not modify reviewed manifest

## Implementation plan

1. Add `eastmoney_stock_profile(code)` to `astockdata_loader.py`
2. Add contract test with mock
3. Wire into `eastmoney_stock_info` as fallback (after push2, before returning None)
4. Smoke with 688981.SH
5. Update handoff
