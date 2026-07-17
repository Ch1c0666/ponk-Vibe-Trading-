"""a-stock-data loader: A-share data via Tencent + Eastmoney HTTP APIs.

Implements selected public-data patterns inspired by a-stock-data inside
Vibe-Trading's own DataLoader protocol. The repository code and its tested
contracts are authoritative.

OHLCV layer: Tencent ifzq HTTP API (never blocked).
Extended layers: Eastmoney APIs (reportapi / push2 / push2ex / datacenter-web /
search-api-web / np-weblist). The standardized research-report API uses the
repository's shared ``eastmoney_client`` adapter; this module's historical raw
report wrapper and its other legacy endpoints retain ``em_get``.

"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
import requests

from backtest.loaders.base import cached_loader_fetch, validate_date_range
from backtest.loaders.research_reports import (
    ResearchReportErrorEnvelope,
    build_legacy_stock_report_params,
    fetch_raw_stock_report_pages,
    industry_reports_not_implemented,
)
from backtest.loaders.registry import register

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants (from a-stock-data SKILL.md)
# ---------------------------------------------------------------------------
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
ZTB_UT = "7eea3edcaed734bea9cbfc24409ed989"  # push2ex UT token

_TENCENT_KLIN_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
_TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q="
_DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"
# ---------------------------------------------------------------------------
# Eastmoney throttled session — mirrors a-stock-data ``em_get``
# ---------------------------------------------------------------------------
_EM_SESSION: Optional[requests.Session] = None
_EM_LAST_CALL = 0.0
_EM_MIN_INTERVAL = 1.0  # seconds between Eastmoney calls


def _get_em_session() -> requests.Session:
    global _EM_SESSION
    if _EM_SESSION is None:
        _EM_SESSION = requests.Session()
        _EM_SESSION.headers.update({"User-Agent": UA})
    return _EM_SESSION


def em_get(
    url: str,
    params: dict = None,
    headers: dict = None,
    timeout: int = 15,
    **kwargs,
) -> requests.Response:
    """Eastmoney throttled GET — mirrors a-stock-data ``em_get``.

    Enforces serial access with >= 1 s interval + random jitter to avoid
    Eastmoney's per-IP rate limiting (风控).
    """
    global _EM_LAST_CALL
    elapsed = time.monotonic() - _EM_LAST_CALL
    if elapsed < _EM_MIN_INTERVAL:
        jitter = 0.3 + 0.7 * (hash(str(params)) % 1000) / 1000.0
        time.sleep(max(0.0, _EM_MIN_INTERVAL - elapsed + jitter))
    merged_headers = {}
    if headers:
        merged_headers.update(headers)
    resp = _get_em_session().get(
        url, params=params, headers=merged_headers or None,
        timeout=timeout, **kwargs,
    )
    _EM_LAST_CALL = time.monotonic()
    return resp


# ---------------------------------------------------------------------------
# Tencent quote helper — a-stock-data §1.2
# ---------------------------------------------------------------------------
def tencent_quote(codes: List[str]) -> Dict[str, Dict[str, Any]]:
    """Batch-fetch real-time quotes from Tencent Finance (never IP-banned).

    Args:
        codes: List of 6-digit codes (SH/SZ/BJ).

    Returns:
        {code: {name, price, pe_ttm, pb, mcap_yi, float_mcap_yi, turnover_pct,
                change_pct, open, high, low, prev_close, volume}}
    """
    tc_codes = []
    for c in codes:
        c = c.upper().replace(".SH", "").replace(".SZ", "").replace(".BJ", "")
        if c.startswith(("60", "68", "5", "9")):
            tc_codes.append(f"sh{c}")
        elif c.startswith(("8", "4")):
            tc_codes.append(f"bj{c}")
        else:
            tc_codes.append(f"sz{c}")

    url = f"{_TENCENT_QUOTE_URL}{','.join(tc_codes)}"
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=10)
    resp.encoding = 'gbk'
    raw = resp.text

    result: Dict[str, Dict[str, Any]] = {}
    for line in raw.strip().split("\n"):
        if "~" not in line:
            continue
        # v_sz000001="51~平安银行~000001~..."
        if '"' in line:
            inner = line.split('"')[1]
        else:
            inner = line
        parts = inner.split("~")
        if len(parts) < 40:
            continue
        code = parts[2]
        result[code] = {
            "name": parts[1],
            "price": float(parts[3]) if parts[3] else None,
            "prev_close": float(parts[4]) if parts[4] else None,
            "open": float(parts[5]) if parts[5] else None,
            "volume": int(parts[6]) if parts[6] else 0,
            "high": float(parts[33]) if len(parts) > 33 and parts[33] else None,
            "low": float(parts[34]) if len(parts) > 34 and parts[34] else None,
            "pe_ttm": float(parts[39]) if len(parts) > 39 and parts[39] else None,
            "pb": float(parts[46]) if len(parts) > 46 and parts[46] else None,
            "mcap_yi": float(parts[45]) if len(parts) > 45 and parts[45] else None,
            "float_mcap_yi": float(parts[44]) if len(parts) > 44 and parts[44] else None,
            "turnover_pct": float(parts[38]) if len(parts) > 38 and parts[38] else None,
            "change_pct": float(parts[32]) if len(parts) > 32 and parts[32] else None,
        }
    return result


# ---------------------------------------------------------------------------
# Eastmoney datacenter helper — a-stock-data shared helper
# ---------------------------------------------------------------------------
def eastmoney_datacenter(
    report_name: str,
    columns: str = "ALL",
    filter_str: str = "",
    page_size: int = 50,
    sort_columns: str = "",
    sort_types: str = "-1",
) -> List[Dict]:
    """Eastmoney datacenter-web generic query.

    Used by: margin trading, block trades, holder count, dividends,
    dragon tiger board, daily dragon tiger, lockup expiry.
    """
    params = {
        "reportName": report_name,
        "columns": columns,
        "filter": filter_str,
        "pageSize": str(page_size),
        "sortColumns": sort_columns,
        "sortTypes": sort_types,
        "source": "WEB",
        "client": "WEB",
    }
    try:
        r = em_get(_DATACENTER_URL, params=params, timeout=20)
        data = r.json()
        if data.get("success"):
            return data.get("result", {}).get("data") or []
        return []
    except Exception as exc:
        logger.warning("eastmoney_datacenter(%s): %s", report_name, exc)
        return []


# ---------------------------------------------------------------------------
# Research reports — a-stock-data §2.1
# ---------------------------------------------------------------------------
def eastmoney_reports(
    code: str,
    max_pages: int = 5,
) -> List[Dict]:
    """Fetch raw qType=0 rows with the historical Python wrapper contract.

    Raw Eastmoney field names (for example ``publishDate`` and ``orgSName``)
    are preserved. Callers receive the same pagination behavior as the a0d64d4
    checkpoint: ``max_pages`` controls the iteration budget and ``hits`` is
    defaulted to 0 when the provider omits it. The ``int()`` coercion on
    ``max_pages`` is defensive (non-int values default to an empty list) and
    does not change the approved single-source pagination budget; the
    five-page hard clamp present in the Codex snapshot has been removed so
    the runtime matches the a0d64d4 live installation. Standardized callers
    should use :func:`backtest.loaders.research_reports.fetch_stock_reports`.
    """
    try:
        page_count = int(max_pages)
    except (TypeError, ValueError):
        return []
    if page_count < 1:
        return []

    def build_params(
        provider_code: str,
        *,
        page_no: int,
        page_size: int,
    ) -> dict[str, str]:
        return build_legacy_stock_report_params(
            provider_code,
            page_no=page_no,
            page_size=page_size,
            timestamp_ms=int(time.time() * 1000),
        )

    def get_page(url: str, *, params: dict[str, str]) -> Any:
        return em_get(url, params=params, timeout=15)

    try:
        result = fetch_raw_stock_report_pages(
            code,
            max_pages=page_count,
            get_page=get_page,
            build_params=build_params,
        )
    except Exception as exc:  # noqa: BLE001 - legacy loader returns [] on failure
        logger.warning("eastmoney_reports for %s: %s", code, exc)
        return []
    for warning in result["warnings"]:
        logger.warning("eastmoney_reports for %s: %s", code, warning["message"])
    return result["rows"]


def eastmoney_industry_reports(
    industry: str | None = None,
    limit: int = 20,
) -> ResearchReportErrorEnvelope:
    """Reserve the qType=1 interface and fail closed until it is implemented.

    ``industry`` and ``limit`` are accepted for forward compatibility only.
    No network request is made, and qType=0 stock reports are never returned.
    """
    del industry, limit
    return industry_reports_not_implemented()


# ---------------------------------------------------------------------------
# Industry comparison — a-stock-data §3.7
# ---------------------------------------------------------------------------
def industry_comparison(top_n: int = 20) -> Dict[str, Any]:
    """Eastmoney industry sector ranking by daily change %.

    Returns {top: [...], bottom: [...], total: int}.
    """
    url = "https://push2.eastmoney.com/api/qt/clist/get"
    params = {
        "pn": "1", "pz": "100", "po": "1", "np": "1",
        "fltt": "2", "invt": "2", "fid": "f3",
        "fs": "m:90+t:2",  # note colon before t:2
        "fields": "f2,f3,f4,f12,f13,f14,f104,f105,f128,f136,f140,f141,f207",
    }
    try:
        r = em_get(url, params=params, timeout=15)
        d = r.json()
        items = (d.get("data") or {}).get("diff") or []
        if not items:
            return {"top": [], "bottom": [], "total": 0}
        rows = []
        for i, item in enumerate(items):
            rows.append({
                "rank": i + 1,
                "name": item.get("f14", ""),
                "change_pct": item.get("f3", 0),
                "code": item.get("f12", ""),
                "up_count": item.get("f104", 0),
                "down_count": item.get("f105", 0),
                "leader": item.get("f140", ""),
                "leader_change": item.get("f136", 0),
            })
        return {
            "top": rows[:top_n],
            "bottom": rows[-top_n:] if len(rows) >= top_n else [],
            "total": len(rows),
        }
    except Exception as exc:
        logger.warning("industry_comparison: %s", exc)
        return {"top": [], "bottom": [], "total": 0}


# ---------------------------------------------------------------------------
# Stock news — a-stock-data §5.1
# ---------------------------------------------------------------------------
def eastmoney_stock_news(code: str, page_size: int = 20) -> List[Dict]:
    """Fetch stock-specific news from Eastmoney (JSONP API).

    Returns list of {title, content, time, source, url}.
    """
    url = "https://search-api-web.eastmoney.com/search/jsonp"
    inner_params = json.dumps({
        "uid": "",
        "keyword": code,
        "type": ["cmsArticleWebOld"],
        "client": "web",
        "clientType": "web",
        "clientVersion": "curr",
        "param": {
            "cmsArticleWebOld": {
                "searchScope": "default",
                "sort": "default",
                "pageIndex": 1,
                "pageSize": page_size,
                "preTag": "",
                "postTag": "",
            },
        },
    }, separators=(',', ':'))
    params = {"cb": "jQuery_news", "param": inner_params}
    headers = {"Referer": "https://so.eastmoney.com/"}
    try:
        r = em_get(url, params=params, headers=headers, timeout=15)
        text = r.text
        # Parse JSONP: jQuery_news({...})
        if "(" in text and text.rstrip().endswith(")"):
            json_str = text[text.index("(") + 1:text.rindex(")")]
            d = json.loads(json_str)
        else:
            return []
        articles = (d.get("result") or {}).get("cmsArticleWebOld") or []
        return [
            {
                "title": re.sub(r'<[^>]+>', '', a.get("title", "")),
                "content": re.sub(r'<[^>]+>', '', a.get("content", ""))[:200],
                "time": a.get("date", ""),
                "source": a.get("mediaName", ""),
                "url": a.get("url", ""),
            }
            for a in articles[:page_size]
        ]
    except Exception as exc:
        logger.warning("eastmoney_stock_news for %s: %s", code, exc)
        return []


# ---------------------------------------------------------------------------
# Global 7x24 news — a-stock-data §5.3
# ---------------------------------------------------------------------------
def eastmoney_global_news(page_size: int = 50) -> List[Dict]:
    """Fetch Eastmoney global 7x24 financial news."""
    url = "https://np-weblist.eastmoney.com/comm/web/getFastNewsList"
    params = {
        "client": "web",
        "biz": "global_news",
        "fastColumn": "102",
        "sortEnd": "",
        "pageSize": str(page_size),
        "req_trace": "1",  # required parameter (a-stock-data V3.1 fix)
    }
    try:
        r = em_get(url, params=params, timeout=15)
        data = r.json() or {}
        items = (data.get("data") or {}).get("fastNewsList") or []
        return [
            {
                "title": i.get("title", ""),
                "summary": i.get("summary", ""),
                "time": i.get("showTime", ""),
            }
            for i in items[:page_size]
        ]
    except Exception as exc:
        logger.warning("eastmoney_global_news: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Limit-up pools — a-stock-data §8.1
# ---------------------------------------------------------------------------
def _fmt_zt_time(t) -> str:
    """Format limit-up time integer → HH:MM:SS (92500 → 09:25:00)."""
    s = str(t).zfill(6)
    return f"{s[0:2]}:{s[2:4]}:{s[4:6]}"


def _em_zt_api(endpoint: str, sort: str, date: str) -> List[Dict]:
    """Eastmoney limit-up pools generic request (push2ex, throttled).

    endpoint: getTopicZTPool / getTopicZBPool / getTopicDTPool / getYesterdayZTPool
    Returns data.pool raw list; empty list if non-trading-day.
    """
    url = f"https://push2ex.eastmoney.com/{endpoint}"
    params = {
        "ut": ZTB_UT,
        "dpt": "wz.ztzt",
        "Pageindex": "0",
        "pagesize": "10000",
        "sort": sort,
        "date": date,
    }
    headers = {"Referer": "https://quote.eastmoney.com/"}
    try:
        r = em_get(url, params=params, headers=headers, timeout=10)
        return (r.json().get("data") or {}).get("pool") or []
    except Exception as exc:
        logger.warning("_em_zt_api %s: %s", endpoint, exc)
        return []


def em_zt_pool(date: str) -> List[Dict]:
    """涨停池 (limit-up pool). date=YYYYMMDD."""
    out = []
    for p in _em_zt_api("getTopicZTPool", "fbt:asc", date):
        out.append({
            "code": p["c"], "name": p["n"],
            "price": p["p"] / 1000, "pct": round(p["zdp"], 2),
            "amount": p["amount"], "float_cap": p["ltsz"],
            "turnover": round(p["hs"], 2), "limit_days": p["lbc"],
            "first_seal": _fmt_zt_time(p["fbt"]),
            "last_seal": _fmt_zt_time(p["lbt"]),
            "seal_fund": p["fund"], "break_times": p["zbc"],
            "industry": p.get("hybk", ""),
            "zt_stat": f'{(p.get("zttj") or {}).get("days","?")}天{(p.get("zttj") or {}).get("ct","?")}板',
        })
    return out


def em_zb_pool(date: str) -> List[Dict]:
    """炸板池 (limit-up break pool)."""
    out = []
    for p in _em_zt_api("getTopicZBPool", "fbt:asc", date):
        out.append({
            "code": p["c"], "name": p["n"],
            "price": p["p"] / 1000, "limit_price": p["ztp"] / 1000,
            "pct": round(p["zdp"], 2), "turnover": round(p["hs"], 2),
            "first_seal": _fmt_zt_time(p["fbt"]),
            "break_times": p["zbc"],
            "amplitude": round(p["zf"], 2), "speed": round(p["zs"], 2),
            "industry": p.get("hybk", ""),
            "zt_stat": f'{(p.get("zttj") or {}).get("days","?")}天{(p.get("zttj") or {}).get("ct","?")}板',
        })
    return out


def em_dt_pool(date: str) -> List[Dict]:
    """跌停池 (limit-down pool)."""
    out = []
    for p in _em_zt_api("getTopicDTPool", "fund:asc", date):
        out.append({
            "code": p["c"], "name": p["n"],
            "price": p["p"] / 1000, "pct": round(p["zdp"], 2),
            "turnover": round(p["hs"], 2), "pe": p.get("pe"),
            "seal_fund": p["fund"],
            "last_seal": _fmt_zt_time(p["lbt"]),
            "board_amount": p.get("fba"), "dt_days": p.get("days"),
            "open_times": p.get("oc"), "industry": p.get("hybk", ""),
        })
    return out


def em_yzt_pool(date: str) -> List[Dict]:
    """昨日涨停池 (yesterday's limit-up performance)."""
    out = []
    for p in _em_zt_api("getYesterdayZTPool", "zs:desc", date):
        out.append({
            "code": p["c"], "name": p["n"],
            "price": p["p"] / 1000, "pct": round(p["zdp"], 2),
            "turnover": round(p["hs"], 2),
            "amplitude": round(p["zf"], 2), "speed": round(p["zs"], 2),
            "y_first_seal": _fmt_zt_time(p["yfbt"]),
            "y_limit_days": p["ylbc"],
            "industry": p.get("hybk", ""),
            "zt_stat": f'{(p.get("zttj") or {}).get("days","?")}天{(p.get("zttj") or {}).get("ct","?")}板',
        })
    return out


def em_limit_up_pools(date: str = None) -> Dict[str, Any]:
    """Fetch all four limit-up/down pools for a trading day.

    Returns {zt_pool, zb_pool, dt_pool, yzt_pool} each a list of dicts.
    """
    if date is None:
        date = datetime.now().strftime("%Y%m%d")
    return {
        "zt_pool": em_zt_pool(date),
        "zb_pool": em_zb_pool(date),
        "dt_pool": em_dt_pool(date),
        "yzt_pool": em_yzt_pool(date),
    }


# ---------------------------------------------------------------------------
# Capital / margin — a-stock-data §4
# ---------------------------------------------------------------------------
def margin_trading(code: str, page_size: int = 30) -> List[Dict]:
    """融资融券明细 (日级). Returns [{date, rzye, rzmre, rzche, rqye, ...}]."""
    data = eastmoney_datacenter(
        "RPTA_WEB_RZRQ_GGMX",
        filter_str=f'(SCODE="{code}")',
        page_size=page_size,
        sort_columns="DATE",
        sort_types="-1",
    )
    return [
        {
            "date": str(row.get("DATE", ""))[:10],
            "rzye": row.get("RZYE", 0),
            "rzmre": row.get("RZMRE", 0),
            "rzche": row.get("RZCHE", 0),
            "rqye": row.get("RQYE", 0),
            "rqmcl": row.get("RQMCL", 0),
            "rqchl": row.get("RQCHL", 0),
            "rzrqye": row.get("RZRQYE", 0),
        }
        for row in data
    ]


# ---------------------------------------------------------------------------
# Daily dragon tiger board — a-stock-data §3.8
# ---------------------------------------------------------------------------
def daily_dragon_tiger(
    trade_date: str = None,
    min_net_buy: float = None,
) -> Dict[str, Any]:
    """全市场龙虎榜. trade_date=YYYY-MM-DD (default today).

    Returns {date, total_records, stocks: [{code, name, reason, close,
    change_pct, net_buy_wan, buy_wan, sell_wan, turnover_pct}]}.
    """
    if trade_date is None:
        trade_date = datetime.now().strftime("%Y-%m-%d")
    data = eastmoney_datacenter(
        "RPT_DAILYBILLBOARD_DETAILSNEW",
        filter_str=f"(TRADE_DATE>='{trade_date}')(TRADE_DATE<='{trade_date}')",
        page_size=500,
        sort_columns="BILLBOARD_NET_AMT",
        sort_types="-1",
    )
    if not data:
        return {
            "date": trade_date, "total_records": 0, "stocks": [],
            "note": "无数据（非交易日或盘后未更新）",
        }
    actual_date = str(data[0].get("TRADE_DATE", ""))[:10] if data else trade_date
    stocks = []
    for row in data:
        net_buy = (row.get("BILLBOARD_NET_AMT") or 0) / 10000
        if min_net_buy is not None and net_buy < min_net_buy:
            continue
        stocks.append({
            "code": row.get("SECURITY_CODE", ""),
            "name": row.get("SECURITY_NAME_ABBR", ""),
            "reason": row.get("EXPLANATION", ""),
            "close": row.get("CLOSE_PRICE") or 0,
            "change_pct": round(float(row.get("CHANGE_RATE") or 0), 2),
            "net_buy_wan": round(net_buy, 1),
            "buy_wan": round((row.get("BILLBOARD_BUY_AMT") or 0) / 10000, 1),
            "sell_wan": round((row.get("BILLBOARD_SELL_AMT") or 0) / 10000, 1),
            "turnover_pct": round(float(row.get("TURNOVERRATE") or 0), 2),
        })
    return {"date": actual_date, "total_records": len(stocks), "stocks": stocks}


# ---------------------------------------------------------------------------
# Stock fundamental info — a-stock-data §6.3
# ---------------------------------------------------------------------------
def _code_to_secid(code: str) -> Optional[str]:
    """Convert 6-digit code to Eastmoney secid (market.code)."""
    code = code.upper().replace(".SH", "").replace(".SZ", "").replace(".BJ", "")
    if code.startswith(("60", "68")):
        return f"1.{code}"
    return f"0.{code}"


def eastmoney_stock_info(code: str) -> Optional[Dict[str, Any]]:
    """Eastmoney basic stock info: industry, shares, market cap, listing date."""
    secid = _code_to_secid(code)
    if not secid:
        return None
    url = "https://push2.eastmoney.com/api/qt/stock/get"
    params = {
        "secid": secid,
        "fields": "f57,f58,f73,f74,f75,f100,f116,f117,f162,f167,f170,f300",
    }
    try:
        r = em_get(url, params=params, timeout=10)
        data = r.json().get("data") or {}
        return {
            "code": data.get("f57", code),
            "name": data.get("f58", ""),
            "industry": data.get("f100", ""),
            "total_shares": data.get("f73"),
            "float_shares": data.get("f74"),
            "mcap": data.get("f116"),
            "float_mcap": data.get("f117"),
            "list_date": data.get("f300"),
            "price": data.get("f170"),
        }
    except Exception as exc:
        logger.warning("eastmoney_stock_info for %s: %s", code, exc)
        return None


# ===================================================================
#  DataLoader protocol implementation (OHLCV)
# ===================================================================

@register
class DataLoader:
    """a-stock-data unified A-share data loader.

    OHLCV data: Tencent ifzq HTTP API (primary, never IP-banned).
    Extended data: Eastmoney HTTP APIs (throttled, for exclusive datasets).

    Implements the DataLoaderProtocol for Vibe-Trading backtest compatibility
    while exposing rich a-stock-data layers beyond OHLCV.
    """

    name = "astockdata"
    markets = {"a_share"}
    requires_auth = False

    def is_available(self) -> bool:
        """Always available — uses public HTTP APIs."""
        return True

    def __init__(self) -> None:
        pass

    # ---- DataLoaderProtocol: fetch OHLCV -----------------------------------
    def fetch(
        self,
        codes: List[str],
        start_date: str,
        end_date: str,
        *,
        interval: str = "1D",
        fields: Optional[List[str]] = None,
    ) -> Dict[str, pd.DataFrame]:
        """Fetch OHLCV data via Tencent HTTP API.

        Args:
            codes: Symbols in Vibe-Trading format (e.g. ``000001.SZ``).
            start_date / end_date: YYYY-MM-DD.
            interval: Only ``1D`` supported.
            fields: Ignored (OHLCV always returned).

        Returns:
            {symbol: DataFrame with trade_date index and OHLCV columns}.
        """
        validate_date_range(start_date, end_date)
        result: Dict[str, pd.DataFrame] = {}
        for code in codes:
            try:
                df = cached_loader_fetch(
                    source=self.name,
                    symbol=code,
                    timeframe=interval,
                    start_date=start_date,
                    end_date=end_date,
                    fields=None,
                    fetch=lambda code=code: self._fetch_ohlc_one(
                        code, start_date, end_date,
                    ),
                )
                if df is not None and not df.empty:
                    result[code] = df
            except Exception as exc:
                logger.warning("astockdata failed for %s: %s", code, exc)
        return result

    def _fetch_ohlc_one(
        self, code: str, start_date: str, end_date: str,
    ) -> Optional[pd.DataFrame]:
        """Fetch OHLCV for one symbol via Tencent ifzq API."""
        parts = code.upper().split(".")
        symbol = parts[0]
        suffix = parts[1].strip() if len(parts) > 1 else ""

        if suffix == "SH":
            tc = f"sh{symbol}"
        elif suffix in ("SZ", "BJ"):
            tc = f"sz{symbol}"
        else:
            tc = f"sh{symbol}" if symbol.startswith(("60", "68")) else f"sz{symbol}"

        url = (
            f"{_TENCENT_KLIN_URL}?param={tc},day,"
            f"{start_date},{end_date},500,qfq"
        )
        resp = requests.get(url, headers={
            "User-Agent": UA,
            "Referer": "https://web.ifzq.gtimg.cn/",
        }, timeout=15)
        resp.encoding = 'utf-8'
        raw = resp.text

        data = json.loads(raw)
        stock_data = data.get("data", {})
        if not stock_data:
            return None
        stock_key = next(iter(stock_data), None)
        if not stock_key:
            return None

        klines = stock_data[stock_key].get("qfqday") or stock_data[stock_key].get("day")
        if not klines:
            return None

        rows = []
        for k in klines:
            if len(k) >= 6:
                rows.append({
                    "trade_date": k[0],
                    "open": float(k[1]),
                    "close": float(k[2]),
                    "high": float(k[3]),
                    "low": float(k[4]),
                    "volume": float(k[5]),
                })
        if not rows:
            return None

        df = pd.DataFrame(rows)
        df["trade_date"] = pd.to_datetime(df["trade_date"])
        df = df.set_index("trade_date").sort_index()
        df = df[["open", "high", "low", "close", "volume"]].dropna(
            subset=["open", "high", "low", "close"]
        )
        return df
