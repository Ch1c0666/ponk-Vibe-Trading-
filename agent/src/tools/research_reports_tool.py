"""Read-only tool: sell-side research reports + consensus EPS for A-shares.

Two free, no-auth disclosure feeds are stitched into one envelope:

* **Eastmoney reportapi** publishes the rolling list of broker research reports
  for a mainland A-share: report title, issuing brokerage, analyst, publish
  date, the broker's rating label, and that broker's per-year EPS / PE
  forecasts. This is the primary feed and drives the ``reports`` block.
* **THS** (同花顺, ``basic.10jqka.com.cn``) publishes a market *consensus* EPS
  forecast (the mean of analyst estimates) per forward fiscal year. THS rejects
  the bare requests User-Agent, so the call carries a desktop UA and a Referer
  and routes through the frozen IP-throttled HTTP layer under its own ``ths``
  host bucket. The consensus feed is best-effort: a THS failure degrades the
  ``consensus_eps`` block to an empty list and never aborts the report fetch.

Both feeds cover mainland A-shares only (``.SH`` / ``.SZ`` / ``.BJ``); any other
market returns an error envelope. Every outbound GET goes through the project's
throttled clients so the tool never hits a host un-throttled and never
re-implements provider plumbing.
"""

from __future__ import annotations

import json
import logging
import math
from typing import Any

from backtest.loaders._http import (
    DEFAULT_USER_AGENT,
    resolve_min_interval,
    throttled_get,
)
from backtest.loaders.eastmoney_client import get_json, resolve_secid
from backtest.loaders.research_reports import (
    DEFAULT_REPORT_LIMIT,
    MAX_TOOL_REPORT_LIMIT,
    QTYPE_INDUSTRY,
    QTYPE_STOCK,
    RESEARCH_REPORT_INPUT_SCHEMA,
    RESEARCH_REPORT_OUTPUT_SCHEMA,
    fetch_stock_reports,
    industry_reports_not_implemented,
    invalid_q_type_error,
    normalize_a_share_symbol,
    parse_q_type,
)
from src.agent.tools import BaseTool

logger = logging.getLogger(__name__)

# THS consensus-forecast endpoint. Returns per-forward-year mean analyst EPS.
_THS_CONSENSUS_URL = "https://basic.10jqka.com.cn/api/stock/profit_forecast/"
_THS_HOST_KEY = "ths"
_THS_MIN_INTERVAL_ENV = "VIBE_TRADING_THS_MIN_INTERVAL"
_THS_DEFAULT_MIN_INTERVAL = 1.0
_THS_TIMEOUT_S = 15.0
_PUBLIC_ARGUMENTS = frozenset({"q_type", "code", "limit"})


class ResearchReportsTool(BaseTool):
    """Fetch A-share sell-side research reports plus market consensus EPS."""

    name = "get_research_reports"
    description = (
        "Fetch mainland A-share sell-side research coverage: recent broker "
        "research reports (title, brokerage, analyst, publish date, rating) with "
        "each broker's per-year EPS and PE forecasts from Eastmoney, plus the "
        "market consensus (mean) EPS forecast per forward fiscal year from THS "
        "(同花顺). Markets: China A-shares only (.SH / .SZ / .BJ). "
        "q_type=0 is supported; q_type=1 (industry reports) currently returns "
        "an explicit not-implemented error and never substitutes stock data. "
        'Example: {"q_type": 0, "code": "600519.SH", "limit": 10}.'
    )
    parameters = RESEARCH_REPORT_INPUT_SCHEMA
    output_schema = RESEARCH_REPORT_OUTPUT_SCHEMA

    def execute(self, **kwargs: Any) -> str:
        """Resolve the symbol, fetch reports + consensus, return a JSON envelope.

        Args:
            **kwargs: ``q_type`` (0 by default), ``code`` (required for
                q_type=0), and optional ``limit`` (report count cap).

        Returns:
            A JSON string envelope. On success:
            ``{"ok": true, "market": "CN", "source": "eastmoney+ths",
            "data": {"q_type": 0, "code", "reports": [...],
            "consensus_eps": [...], "partial", "warnings"}}``. Failures use the stable
            ``ok/error/error_code/details`` envelope.
        """
        unexpected = sorted(set(kwargs) - _PUBLIC_ARGUMENTS)
        if unexpected:
            supplied_q_type = kwargs.get(
                "q_type",
                kwargs.get("qType", QTYPE_STOCK),
            )
            return _error(
                "unexpected argument(s): "
                f"{', '.join(unexpected)}; public input uses 'q_type' "
                "(snake_case), while provider 'qType' is internal",
                error_code="invalid_argument",
                q_type=supplied_q_type,
            )

        raw_q_type = kwargs.get("q_type", QTYPE_STOCK)
        try:
            q_type = parse_q_type(raw_q_type)
        except ValueError:
            return json.dumps(
                invalid_q_type_error(raw_q_type),
                ensure_ascii=False,
            )

        # Fail closed before symbol resolution or any HTTP boundary. Industry
        # reports must never be synthesized from qType=0 stock rows.
        if q_type == QTYPE_INDUSTRY:
            return json.dumps(
                industry_reports_not_implemented(),
                ensure_ascii=False,
            )

        normalized = normalize_a_share_symbol(kwargs.get("code"))
        if normalized is None:
            return _error(
                "A-share 'code' is required and must match "
                "'<6-digit-code>.<SH|SZ|BJ>' for q_type=0",
                error_code="invalid_argument",
            )
        code, bare_code = normalized

        if resolve_secid(code) is None:
            return _error(
                f"could not resolve A-share symbol '{code}'",
                error_code="invalid_argument",
            )

        raw_limit = kwargs.get("limit", DEFAULT_REPORT_LIMIT)
        if (
            type(raw_limit) is not int
            or raw_limit < 1
            or raw_limit > MAX_TOOL_REPORT_LIMIT
        ):
            return _error(
                f"'limit' must be an integer from 1 to {MAX_TOOL_REPORT_LIMIT}",
                error_code="invalid_argument",
            )
        limit = raw_limit

        try:
            report_result = fetch_stock_reports(
                bare_code,
                limit=limit,
                get_page=get_json,
            )
        except Exception as exc:  # noqa: BLE001 - surface any fetch failure as envelope
            return _error(
                f"eastmoney report list request failed: {exc}",
                error_code="provider_request_failed",
            )

        # Consensus EPS is best-effort: a THS outage must not sink the reports.
        consensus_eps = _fetch_consensus_eps(code)

        reports = report_result["reports"]
        if (
            not reports
            and not consensus_eps
            and not report_result["partial"]
        ):
            return _error(
                f"no research coverage found for '{code}'",
                error_code="no_data",
            )

        return json.dumps(
            {
                "ok": True,
                "market": "CN",
                "source": "eastmoney+ths",
                "data": {
                    "q_type": QTYPE_STOCK,
                    "code": code,
                    "reports": reports,
                    "consensus_eps": consensus_eps,
                    "partial": report_result["partial"],
                    "warnings": report_result["warnings"],
                },
            },
            ensure_ascii=False,
        )


def _bare_code(code: str) -> str:
    """Return the numeric stock code without its exchange suffix."""
    return code.rpartition(".")[0]


def _fetch_consensus_eps(code: str) -> list[dict]:
    """Fetch THS consensus (mean) EPS forecast per forward fiscal year.

    Best-effort: any network/parse failure is logged and degraded to an empty
    list so the primary report fetch is never aborted by a THS outage. THS
    rejects the bare requests UA, so the call presents a desktop browser UA and
    a Referer and is spaced under its own ``ths`` host bucket.

    Args:
        code: A-share symbol such as ``"600519.SH"``.

    Returns:
        A list of ``{fiscal_year, consensus_eps}`` dicts ordered as served,
        empty when THS returns nothing usable or the request fails.
    """
    try:
        response = throttled_get(
            _THS_CONSENSUS_URL,
            host_key=_THS_HOST_KEY,
            min_interval=resolve_min_interval(
                _THS_MIN_INTERVAL_ENV, _THS_DEFAULT_MIN_INTERVAL
            ),
            params={"code": _bare_code(code)},
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Referer": "https://basic.10jqka.com.cn/",
            },
            timeout=_THS_TIMEOUT_S,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:  # noqa: BLE001 - consensus is best-effort
        logger.warning("ths consensus eps fetch failed for %s: %s", code, exc)
        return []
    return _parse_consensus_eps(payload)


def _parse_consensus_eps(payload: Any) -> list[dict]:
    """Extract per-year consensus EPS rows from a THS forecast payload.

    THS wraps its rows under ``data`` (a list of per-forward-year records, each
    carrying a fiscal year and a mean EPS estimate). Field naming varies, so we
    probe a small set of known key aliases for each value.

    Args:
        payload: Decoded THS JSON.

    Returns:
        A list of ``{fiscal_year, consensus_eps}`` dicts, empty when no usable
        row is present.
    """
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []

    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        year = _clean_text(_first(row, ("year", "fiscal_year", "report_year")))
        eps = _to_number(_first(row, ("eps", "avg_eps", "predict_eps", "forecast_eps")))
        if year is None and eps is None:
            continue
        out.append({"fiscal_year": year, "consensus_eps": eps})
    return out


def _first(row: dict, keys: tuple[str, ...]) -> Any:
    """Return the first present, non-empty value among ``keys`` in ``row``."""
    for key in keys:
        value = row.get(key)
        if value is not None and value != "":
            return value
    return None


def _clean_text(value: Any) -> str | None:
    """Trim a string cell, or ``None`` when absent/blank/non-string."""
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _to_number(value: Any) -> float | None:
    """Coerce a cell to ``float``, or ``None`` when absent/non-numeric."""
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _error(
    message: str,
    *,
    error_code: str,
    q_type: Any = QTYPE_STOCK,
) -> str:
    """Render a failure envelope as a JSON string."""
    return json.dumps(
        {
            "ok": False,
            "error": message,
            "error_code": error_code,
            "details": {
                "q_type": q_type,
                "supported_q_types": [QTYPE_STOCK],
            },
        },
        ensure_ascii=False,
    )
