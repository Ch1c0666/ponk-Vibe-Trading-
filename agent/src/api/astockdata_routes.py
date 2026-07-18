"""A-stock-data aggregate REST route.

Mounted by ``agent/api_server.py`` via ``register_astockdata_routes(app)``.

The route exposes a conservative read-only adapter over the repository's
``astockdata_loader`` functions.  Each requested data family is gated
independently by ``reviewed_segment_codes.json`` and its ``dataUse`` list before
any provider call is made.
"""

from __future__ import annotations

import json
from typing import Any, Callable

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse

from src.api.stock_quote_routes import get_reviewed_stock_codes_for

_ALLOWED_PARAMS = frozenset({"code", "include", "limit"})
_INCLUDE_TO_DATA_USE = {
    "quote": "quote",
    "reports": "report",
    "news": "news",
    "fundamentals": "fundamental",
    "announcements": "announcement",
}
_DEFAULT_INCLUDE = "quote,reports,news,fundamentals,announcements"


def _clamp_limit(value: int) -> int:
    return max(1, min(int(value), 50))


def _parse_include(raw: str) -> list[str] | str:
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return "include must contain at least one data family"
    unknown = sorted(set(parts) - set(_INCLUDE_TO_DATA_USE))
    if unknown:
        return f"unsupported include value(s): {', '.join(unknown)}"
    return parts


def _code_not_reviewed(code: str, data_use: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": f"code '{code}' has not passed manual review for {data_use}",
        "error_code": "code_not_reviewed",
    }


def _provider_failed(exc: Exception) -> dict[str, Any]:
    return {
        "ok": False,
        "error": f"a-stock-data provider failed: {exc}",
        "error_code": "provider_request_failed",
    }


def _ok(source: str, data: Any) -> dict[str, Any]:
    return {"ok": True, "source": source, "data": data}


def _json_tool_payload(raw: str) -> dict[str, Any]:
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("tool returned unexpected result")
    return payload


def _fetch_quote(code: str, limit: int) -> dict[str, Any]:
    del limit
    from backtest.loaders.astockdata_loader import tencent_quote

    raw = tencent_quote([code])
    bare = code.replace(".SH", "").replace(".SZ", "").replace(".BJ", "")
    entry = raw.get(bare)
    if not isinstance(entry, dict):
        raise ValueError(f"no quote data returned for {code}")
    return _ok("tencent", entry)


def _fetch_reports(code: str, limit: int) -> dict[str, Any]:
    from src.tools import build_registry

    registry = build_registry(include_shell_tools=False)
    tool = registry.get("get_research_reports")
    if tool is None:
        raise RuntimeError("get_research_reports tool not available")
    payload = _json_tool_payload(tool.execute(q_type=0, code=code, limit=limit))
    if payload.get("ok") is False:
        return payload
    return _ok(str(payload.get("source") or "eastmoney+ths"), payload.get("data"))


def _fetch_news(code: str, limit: int) -> dict[str, Any]:
    from backtest.loaders.astockdata_loader import eastmoney_stock_news

    return _ok("eastmoney", eastmoney_stock_news(code, page_size=limit))


def _fetch_fundamentals(code: str, limit: int) -> dict[str, Any]:
    from backtest.loaders.astockdata_loader import (
        eastmoney_stock_info,
        sina_financial_report,
    )

    info = eastmoney_stock_info(code)
    if not isinstance(info, dict):
        raise ValueError(f"no fundamentals returned for {code}")
    return _ok(
        "eastmoney+sina",
        {
            "stock_info": info,
            "financial_reports": {
                "income_statement": sina_financial_report(code, "lrb", num=limit),
                "balance_sheet": sina_financial_report(code, "fzb", num=limit),
                "cash_flow": sina_financial_report(code, "llb", num=limit),
            },
        },
    )


def _fetch_announcements(code: str, limit: int) -> dict[str, Any]:
    from backtest.loaders.astockdata_loader import cninfo_announcements

    return _ok("cninfo", cninfo_announcements(code, page_size=limit))


_FETCHERS: dict[str, Callable[[str, int], dict[str, Any]]] = {
    "quote": _fetch_quote,
    "reports": _fetch_reports,
    "news": _fetch_news,
    "fundamentals": _fetch_fundamentals,
    "announcements": _fetch_announcements,
}


def _fetch_family(code: str, family: str, limit: int) -> dict[str, Any]:
    data_use = _INCLUDE_TO_DATA_USE[family]
    if code not in get_reviewed_stock_codes_for(data_use):
        return _code_not_reviewed(code, data_use)
    try:
        return _FETCHERS[family](code, limit)
    except Exception as exc:  # noqa: BLE001 - route must envelope failures
        return _provider_failed(exc)


def register_astockdata_routes(app: FastAPI) -> None:
    """Mount the a-stock-data aggregate endpoint."""

    @app.get("/api/a-stocks/data")
    async def astockdata(
        request: Request,
        code: str = Query(
            ...,
            description="A-share symbol, e.g. 000000.SH (syntactic placeholder)",
            pattern=r"^\d{6}\.(SH|SZ|BJ)$",
        ),
        include: str = Query(
            _DEFAULT_INCLUDE,
            description="Comma-separated data families: quote,reports,news,fundamentals,announcements",
        ),
        limit: int = Query(10, ge=1, le=50),
    ) -> JSONResponse:
        """Return reviewed, read-only A-share data from a-stock-data sources."""
        unknown = set(request.query_params.keys()) - _ALLOWED_PARAMS
        if unknown:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": f"unsupported query param(s): {', '.join(sorted(unknown))}",
                    "error_code": "invalid_argument",
                },
            )

        parsed = _parse_include(include)
        if isinstance(parsed, str):
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": parsed,
                    "error_code": "invalid_argument",
                },
            )

        capped_limit = _clamp_limit(limit)
        results = {
            family: _fetch_family(code, family, capped_limit)
            for family in parsed
        }
        partial = any(not item.get("ok") for item in results.values())

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "source": "a-stock-data",
                "code": code,
                "partial": partial,
                "data": results,
            },
        )
