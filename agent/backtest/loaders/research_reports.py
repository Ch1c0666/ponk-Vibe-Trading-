"""Typed contract and shared provider adapter for A-share research reports.

Only stock-level Eastmoney reports (provider ``qType=0``) are implemented.
Industry reports (``qType=1``) deliberately fail closed: callers receive a
structured ``not implemented`` error and stock reports are never substituted.

The module is safe to import in offline tests. Network access only occurs when
a fetch function is called without an injected ``get_page`` transport.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable
from typing import Any, Literal, TypedDict, cast

from backtest.loaders import eastmoney_client

QTYPE_STOCK: Literal[0] = 0
QTYPE_INDUSTRY: Literal[1] = 1
SUPPORTED_Q_TYPES: tuple[Literal[0], ...] = (QTYPE_STOCK,)

DEFAULT_REPORT_LIMIT = 20
MAX_TOOL_REPORT_LIMIT = 50
_PROVIDER_PAGE_SIZE = 20
_REPORT_LIST_URL = "https://reportapi.eastmoney.com/report/list"

_BARE_CODE_RE = re.compile(r"^[0-9]{6}$")
_A_SHARE_SYMBOL_RE = re.compile(r"^([0-9]{6})\.(SH|SZ|BJ)$")
_DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")


class ForecastPair(TypedDict):
    """Per-report forecast values for the current and following fiscal year."""

    this_year: float | None
    next_year: float | None


class StockResearchReport(TypedDict):
    """Normalized qType=0 report row."""

    title: str | None
    brokerage: str | None
    analyst: str | None
    publish_date: str | None
    info_code: str | None
    rating: str | None
    eps_forecast: ForecastPair
    pe_forecast: ForecastPair


class ConsensusEps(TypedDict):
    """Normalized THS consensus EPS row used by the public tool envelope."""

    fiscal_year: str | None
    consensus_eps: float | None


class ResearchReportWarning(TypedDict):
    """A non-fatal provider warning returned with partial report results."""

    code: str
    message: str
    page: int


class RawStockReportFetchResult(TypedDict):
    """Raw Eastmoney rows plus pagination completeness metadata."""

    rows: list[Any]
    partial: bool
    warnings: list[ResearchReportWarning]


class StockReportFetchResult(TypedDict):
    """Normalized report rows plus pagination completeness metadata."""

    reports: list[StockResearchReport]
    partial: bool
    warnings: list[ResearchReportWarning]


class StockReportData(TypedDict):
    """Data block returned for a successful qType=0 tool request."""

    q_type: Literal[0]
    code: str
    reports: list[StockResearchReport]
    consensus_eps: list[ConsensusEps]
    partial: bool
    warnings: list[ResearchReportWarning]


class StockReportSuccessEnvelope(TypedDict):
    """Successful qType=0 tool response."""

    ok: Literal[True]
    market: Literal["CN"]
    source: Literal["eastmoney+ths"]
    data: StockReportData


class ResearchReportErrorDetails(TypedDict):
    """Machine-readable details for rejected report queries."""

    q_type: object
    supported_q_types: list[int]


class ResearchReportErrorEnvelope(TypedDict):
    """Stable error envelope for invalid or unsupported report queries."""

    ok: Literal[False]
    error: str
    error_code: str
    details: ResearchReportErrorDetails


_Q_TYPE_INPUT_PROPERTY: dict[str, Any] = {
    "type": "integer",
    "enum": [QTYPE_STOCK, QTYPE_INDUSTRY],
    "default": QTYPE_STOCK,
    "description": (
        "Provider query type: 0 = implemented stock reports; "
        "1 = industry reports (currently not implemented)."
    ),
}

_CODE_INPUT_PROPERTY: dict[str, Any] = {
    "type": "string",
    "pattern": r"^[0-9]{6}\.([Ss][Hh]|[Ss][Zz]|[Bb][Jj])$",
    "description": (
        "A-share symbol in <6-digit-code>.<exchange> form. "
        "Required when q_type=0; the exchange suffix is case-insensitive "
        "and is normalized to uppercase."
    ),
}

_LIMIT_INPUT_PROPERTY: dict[str, Any] = {
    "type": "integer",
    "minimum": 1,
    "maximum": MAX_TOOL_REPORT_LIMIT,
    "default": DEFAULT_REPORT_LIMIT,
    "description": "Maximum number of most-recent reports to return.",
}

# Exact schema for the implemented qType=0 operation.
STOCK_REPORT_INPUT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "q_type": {
            **_Q_TYPE_INPUT_PROPERTY,
            "enum": [QTYPE_STOCK],
        },
        "code": _CODE_INPUT_PROPERTY,
        "limit": _LIMIT_INPUT_PROPERTY,
    },
    "required": ["code"],
    "additionalProperties": False,
}

# Dispatcher schema exposed to the tool-calling layer. Draft 2020-12
# conditional validation makes ``code`` mandatory when q_type is omitted
# (therefore defaults to 0) or explicitly equals 0, while q_type=1 may omit it
# and is rejected by the runtime before any provider call.
RESEARCH_REPORT_INPUT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "description": (
        "q_type=0 requires code. q_type=1 may omit code and returns the "
        "documented not-implemented error before any network access."
    ),
    "properties": {
        "q_type": _Q_TYPE_INPUT_PROPERTY,
        "code": _CODE_INPUT_PROPERTY,
        "limit": _LIMIT_INPUT_PROPERTY,
    },
    "allOf": [
        {
            "if": {
                "properties": {"q_type": {"const": QTYPE_INDUSTRY}},
                "required": ["q_type"],
            },
            "then": {},
            "else": {"required": ["code"]},
        }
    ],
    "additionalProperties": False,
}

_FORECAST_PAIR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "this_year": {"type": ["number", "null"]},
        "next_year": {"type": ["number", "null"]},
    },
    "required": ["this_year", "next_year"],
    "additionalProperties": False,
}

_STOCK_REPORT_ROW_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": ["string", "null"]},
        "brokerage": {"type": ["string", "null"]},
        "analyst": {"type": ["string", "null"]},
        "publish_date": {
            "type": ["string", "null"],
            "pattern": r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
        },
        "info_code": {"type": ["string", "null"]},
        "rating": {"type": ["string", "null"]},
        "eps_forecast": _FORECAST_PAIR_SCHEMA,
        "pe_forecast": _FORECAST_PAIR_SCHEMA,
    },
    "required": [
        "title",
        "brokerage",
        "analyst",
        "publish_date",
        "info_code",
        "rating",
        "eps_forecast",
        "pe_forecast",
    ],
    "additionalProperties": False,
}

_CONSENSUS_EPS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "fiscal_year": {"type": ["string", "null"]},
        "consensus_eps": {"type": ["number", "null"]},
    },
    "required": ["fiscal_year", "consensus_eps"],
    "additionalProperties": False,
}

_RESEARCH_REPORT_WARNING_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "code": {
            "type": "string",
            "enum": ["provider_page_failed", "provider_hits_absent"],
        },
        "message": {"type": "string"},
        "page": {"type": "integer", "minimum": 1},
    },
    "required": ["code", "message", "page"],
    "additionalProperties": False,
}

STOCK_REPORT_OUTPUT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "ok": {"const": True},
        "market": {"const": "CN"},
        "source": {"const": "eastmoney+ths"},
        "data": {
            "type": "object",
            "properties": {
                "q_type": {"const": QTYPE_STOCK},
                "code": {
                    "type": "string",
                    "pattern": r"^[0-9]{6}\.(SH|SZ|BJ)$",
                },
                "reports": {
                    "type": "array",
                    "items": _STOCK_REPORT_ROW_SCHEMA,
                },
                "consensus_eps": {
                    "type": "array",
                    "items": _CONSENSUS_EPS_SCHEMA,
                },
                "partial": {"type": "boolean"},
                "warnings": {
                    "type": "array",
                    "items": _RESEARCH_REPORT_WARNING_SCHEMA,
                },
            },
            "required": [
                "q_type",
                "code",
                "reports",
                "consensus_eps",
                "partial",
                "warnings",
            ],
            "additionalProperties": False,
        },
    },
    "required": ["ok", "market", "source", "data"],
    "additionalProperties": False,
}

RESEARCH_REPORT_ERROR_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "ok": {"const": False},
        "error": {"type": "string"},
        "error_code": {"type": "string"},
        "details": {
            "type": "object",
            "properties": {
                "q_type": {},
                "supported_q_types": {
                    "type": "array",
                    "items": {"type": "integer"},
                },
            },
            "required": ["q_type", "supported_q_types"],
            "additionalProperties": False,
        },
    },
    "required": ["ok", "error", "error_code", "details"],
    "additionalProperties": False,
}

# Public output JSON Schema. Existing ``ok``/``error`` fields stay compatible;
# additive ``error_code``/``details`` make qType=1 fail closed and testable.
RESEARCH_REPORT_OUTPUT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "oneOf": [
        STOCK_REPORT_OUTPUT_SCHEMA,
        RESEARCH_REPORT_ERROR_SCHEMA,
    ],
}


def parse_q_type(value: Any) -> Literal[0, 1]:
    """Validate the public q_type without accepting bools or numeric strings."""
    if type(value) is not int or value not in (QTYPE_STOCK, QTYPE_INDUSTRY):
        raise ValueError("q_type must be the integer 0 or 1")
    return cast(Literal[0, 1], value)


def normalize_a_share_symbol(value: Any) -> tuple[str, str] | None:
    """Return ``(canonical_symbol, bare_code)`` for a strict A-share symbol."""
    if not isinstance(value, str):
        return None
    symbol = value.strip().upper()
    match = _A_SHARE_SYMBOL_RE.fullmatch(symbol)
    if match is None:
        return None
    return symbol, match.group(1)


def normalize_bare_stock_code(value: Any) -> str | None:
    """Return a six-digit code from a bare or exchange-suffixed A-share symbol."""
    if not isinstance(value, str):
        return None
    candidate = value.strip().upper()
    symbol = normalize_a_share_symbol(candidate)
    if symbol is not None:
        return symbol[1]
    return candidate if _BARE_CODE_RE.fullmatch(candidate) else None


def invalid_q_type_error(value: Any) -> ResearchReportErrorEnvelope:
    """Return a structured zero-network error for an invalid q_type."""
    return {
        "ok": False,
        "error": "q_type must be the integer 0 or 1",
        "error_code": "invalid_argument",
        "details": {
            "q_type": value,
            "supported_q_types": list(SUPPORTED_Q_TYPES),
        },
    }


def industry_reports_not_implemented() -> ResearchReportErrorEnvelope:
    """Return the safe qType=1 placeholder without substituting stock reports."""
    return {
        "ok": False,
        "error": (
            "industry research reports (qType=1) are not implemented; "
            "qType=0 stock reports will not be substituted"
        ),
        "error_code": "industry_reports_not_implemented",
        "details": {
            "q_type": QTYPE_INDUSTRY,
            "supported_q_types": list(SUPPORTED_Q_TYPES),
        },
    }


def normalize_stock_report(row: Any) -> StockResearchReport | None:
    """Normalize one Eastmoney qType=0 row, dropping unusable rows."""
    if not isinstance(row, dict):
        return None
    title = _clean_text(row.get("title"))
    publish_date = _clean_date(row.get("publishDate"))
    if title is None and publish_date is None:
        return None
    return {
        "title": title,
        "brokerage": _clean_text(row.get("orgSName"))
        or _clean_text(row.get("orgName")),
        "analyst": _clean_text(row.get("researcher")),
        "publish_date": publish_date,
        "info_code": _clean_text(row.get("infoCode")),
        "rating": _clean_text(row.get("emRatingName"))
        or _clean_text(row.get("sRatingName")),
        "eps_forecast": {
            "this_year": _to_number(row.get("predictThisYearEps")),
            "next_year": _to_number(row.get("predictNextYearEps")),
        },
        "pe_forecast": {
            "this_year": _to_number(row.get("predictThisYearPe")),
            "next_year": _to_number(row.get("predictNextYearPe")),
        },
    }


def parse_stock_report_payload(payload: Any) -> list[StockResearchReport]:
    """Extract normalized qType=0 rows from one decoded provider payload."""
    if not isinstance(payload, dict):
        return []
    rows = payload.get("data")
    if not isinstance(rows, list):
        return []
    reports: list[StockResearchReport] = []
    for row in rows:
        normalized = normalize_stock_report(row)
        if normalized is not None:
            reports.append(normalized)
    return reports


def build_stock_report_params(
    code: str,
    *,
    page_no: int,
    page_size: int,
) -> dict[str, str]:
    """Build provider parameters for the implemented qType=0 contract."""
    bare_code = normalize_bare_stock_code(code)
    if bare_code is None:
        raise ValueError("code must be a six-digit A-share code")
    if page_no < 1:
        raise ValueError("page_no must be >= 1")
    if not 1 <= page_size <= _PROVIDER_PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {_PROVIDER_PAGE_SIZE}")
    return {
        "code": bare_code,
        "qType": str(QTYPE_STOCK),
        "pageSize": str(page_size),
        "pageNo": str(page_no),
        "fields": "all",
    }


def build_legacy_stock_report_params(
    code: str,
    *,
    page_no: int,
    page_size: int,
    timestamp_ms: int,
) -> dict[str, str]:
    """Build the historical ``eastmoney_reports`` JSONP request parameters.

    The legacy wrapper deliberately preserves the caller-supplied ``code`` and
    the full parameter set used at checkpoint ``a0d64d4``. The standardized
    provider API uses :func:`build_stock_report_params` instead.
    """
    if page_no < 1:
        raise ValueError("page_no must be >= 1")
    if not 1 <= page_size <= _PROVIDER_PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {_PROVIDER_PAGE_SIZE}")
    return {
        "code": code,
        "cb": "jQuery",
        "pageSize": str(page_size),
        "pageNo": str(page_no),
        "fields": "all",
        "qType": str(QTYPE_STOCK),
        "beginTime": "2024-01-01",
        "endTime": "",
        "_": str(timestamp_ms),
    }


def decode_stock_report_payload(value: Any) -> dict[str, Any]:
    """Decode an Eastmoney report response from JSON, JSONP, or a response.

    Both the standardized JSON client and the historical JSONP transport feed
    this one decoder so pagination and response parsing are not duplicated.
    """
    if isinstance(value, dict):
        return value

    if hasattr(value, "text"):
        value = value.text
    elif hasattr(value, "json"):
        value = value.json()
        if isinstance(value, dict):
            return value

    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if not isinstance(value, str):
        raise ValueError("research report provider returned a non-object payload")

    text = value.strip()
    if text.endswith(";"):
        text = text[:-1].rstrip()
    open_paren = text.find("(")
    if open_paren > 0 and text.endswith(")"):
        text = text[open_paren + 1 : -1]

    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("research report provider returned a non-object payload")
    return payload


def fetch_raw_stock_report_pages(
    code: str,
    *,
    max_pages: int,
    page_size: int = _PROVIDER_PAGE_SIZE,
    get_page: Callable[..., Any] | None = None,
    build_params: Callable[..., dict[str, str]] = build_stock_report_params,
    strict_hits: bool = False,
) -> RawStockReportFetchResult:
    """Fetch raw qType=0 pages with explicit partial-result semantics.

    The first page is authoritative: an exception there is propagated. If a
    later page fails, rows from prior pages are retained and one structured
    warning marks the result partial.

    When *strict_hits* is True and the provider omits the ``hits`` field while
    returning a full page, a ``provider_hits_absent`` warning is emitted and
    the result is marked partial (the standard provider can then surface
    ``partial: true`` to callers).  The legacy wrapper sets *strict_hits* to
    False and preserves the a0d64d4 ``data.get("hits", 0)`` behaviour.
    """
    if type(max_pages) is not int or max_pages < 1:
        raise ValueError("max_pages must be a positive integer")
    if type(page_size) is not int or not 1 <= page_size <= _PROVIDER_PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {_PROVIDER_PAGE_SIZE}")

    fetch_page = get_page or eastmoney_client.get_json
    rows: list[Any] = []
    warnings: list[ResearchReportWarning] = []

    for page_no in range(1, max_pages + 1):
        params = build_params(
            code,
            page_no=page_no,
            page_size=page_size,
        )
        try:
            payload = decode_stock_report_payload(
                fetch_page(_REPORT_LIST_URL, params=params)
            )
            raw_rows = payload.get("data")
            if not isinstance(raw_rows, list):
                raise ValueError(
                    "research report provider response is missing a list-valued "
                    "'data' field"
                )
        except Exception as exc:
            if page_no == 1:
                raise
            warnings.append(
                {
                    "code": "provider_page_failed",
                    "message": f"research report page {page_no} failed: {exc}",
                    "page": page_no,
                }
            )
            break

        rows.extend(raw_rows)

        if len(raw_rows) < page_size:
            break
        # Legacy: missing hits defaults to 0 (stop after page 1).
        # Strict: when hits is absent and the page was full we cannot
        # confirm completeness — emit a warning and mark partial.
        if "hits" not in payload:
            if strict_hits:
                warnings.append(
                    {
                        "code": "provider_hits_absent",
                        "message": (
                            "research report response is missing the 'hits' "
                            "field; result may be incomplete"
                        ),
                        "page": page_no,
                    }
                )
            break
        hits = _to_int(payload["hits"]) or 0
        if page_no * page_size >= hits:
            break

    return {
        "rows": rows,
        "partial": bool(warnings),
        "warnings": warnings,
    }


def fetch_stock_reports(
    code: str,
    *,
    limit: int = DEFAULT_REPORT_LIMIT,
    get_page: Callable[..., Any] | None = None,
) -> StockReportFetchResult:
    """Fetch and normalize stock reports through the shared Eastmoney client.

    Args:
        code: Bare or exchange-suffixed six-digit A-share code.
        limit: Strict maximum normalized row count in the public 1..50 range.
        get_page: Injectable ``(url, *, params) -> payload`` function for tests.
            When omitted, the project's throttled Eastmoney client is used.

    Returns:
        Normalized qType=0 rows plus ``partial`` and ``warnings`` metadata.

    Raises:
        ValueError: Invalid stock code or non-conforming limit.
        Exception: A first-page provider error is propagated to the caller.
    """
    bare_code = normalize_bare_stock_code(code)
    if bare_code is None:
        raise ValueError("code must be a six-digit A-share code")
    if (
        type(limit) is not int
        or limit < 1
        or limit > MAX_TOOL_REPORT_LIMIT
    ):
        raise ValueError(
            f"limit must be an integer from 1 to {MAX_TOOL_REPORT_LIMIT}"
        )

    page_size = min(_PROVIDER_PAGE_SIZE, limit)
    max_pages = (limit + page_size - 1) // page_size
    raw_result = fetch_raw_stock_report_pages(
        bare_code,
        max_pages=max_pages,
        page_size=page_size,
        get_page=get_page,
        strict_hits=True,
    )

    reports: list[StockResearchReport] = []
    for row in raw_result["rows"]:
        normalized = normalize_stock_report(row)
        if normalized is not None:
            reports.append(normalized)

    return {
        "reports": reports[:limit],
        "partial": raw_result["partial"],
        "warnings": raw_result["warnings"],
    }


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _clean_date(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    candidate = value.strip()[:10]
    return candidate if _DATE_RE.fullmatch(candidate) else None


def _to_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


__all__ = [
    "DEFAULT_REPORT_LIMIT",
    "MAX_TOOL_REPORT_LIMIT",
    "QTYPE_INDUSTRY",
    "QTYPE_STOCK",
    "RESEARCH_REPORT_INPUT_SCHEMA",
    "RESEARCH_REPORT_ERROR_SCHEMA",
    "RESEARCH_REPORT_OUTPUT_SCHEMA",
    "RawStockReportFetchResult",
    "ResearchReportErrorEnvelope",
    "ResearchReportWarning",
    "StockResearchReport",
    "StockReportFetchResult",
    "STOCK_REPORT_INPUT_SCHEMA",
    "STOCK_REPORT_OUTPUT_SCHEMA",
    "StockReportSuccessEnvelope",
    "build_legacy_stock_report_params",
    "build_stock_report_params",
    "decode_stock_report_payload",
    "fetch_raw_stock_report_pages",
    "fetch_stock_reports",
    "industry_reports_not_implemented",
    "invalid_q_type_error",
    "normalize_a_share_symbol",
    "normalize_bare_stock_code",
    "normalize_stock_report",
    "parse_q_type",
    "parse_stock_report_payload",
]
