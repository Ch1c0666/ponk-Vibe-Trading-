"""Read-only tool: batch A-share index quotes via Tencent public HTTP.

Fetches real-time index levels for a fixed allowlist of mainland China equity
benchmarks.  Every outbound call routes through the existing ``tencent_quote``
helper (``agent/backtest/loaders/astockdata_loader.py``) which is a public
no-auth endpoint; callers should treat it as rate-limitable.

Individual stock codes are rejected — this tool only serves the curated index
allowlist.  Partial failures (some indices return, others timeout/error) are
surfaced as ``partial: true`` with structured warnings; all-four failures
return ``ok: false``.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from backtest.loaders.astockdata_loader import tencent_quote
from src.agent.tools import BaseTool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowlist — only these four A-share benchmarks.  Bare stock codes rejected.
# ---------------------------------------------------------------------------

_INDEX_ALLOWLIST: dict[str, str] = {
    "sh000001": "上证综指",
    "sz399001": "深证成指",
    "sz399006": "创业板指",
    "sh000688": "科创50",
}

_INDEX_CODE_LIST: list[str] = sorted(_INDEX_ALLOWLIST.keys())

# Number of fields Tencent returns for an index quote line.
_MIN_INDEX_FIELDS = 40

# ---------------------------------------------------------------------------
# Output JSON Schema (Draft 2020-12)
# ---------------------------------------------------------------------------

_INDEX_QUOTE_ROW_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "code": {"type": "string"},
        "name": {"type": "string"},
        "price": {"type": ["number", "null"]},
        "prev_close": {"type": ["number", "null"]},
        "open": {"type": ["number", "null"]},
        "high": {"type": ["number", "null"]},
        "low": {"type": ["number", "null"]},
        "change_pct": {"type": ["number", "null"]},
    },
    "required": [
        "code",
        "name",
        "price",
        "prev_close",
        "open",
        "high",
        "low",
        "change_pct",
    ],
    "additionalProperties": False,
}

_WARNING_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "code": {
            "type": "string",
            "enum": ["provider_quote_failed", "provider_quote_missing"],
        },
        "message": {"type": "string"},
        "index_code": {"type": "string"},
    },
    "required": ["code", "message", "index_code"],
    "additionalProperties": False,
}

INDEX_QUOTE_INPUT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "indices": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": _INDEX_CODE_LIST,
            },
            "default": _INDEX_CODE_LIST,
            "description": (
                "Tencent-format index codes to quote. Defaults to all four "
                "A-share benchmarks when omitted."
            ),
        },
    },
    "additionalProperties": False,
}

INDEX_QUOTE_OUTPUT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "oneOf": [
        {
            "type": "object",
            "properties": {
                "ok": {"const": True},
                "source": {"const": "tencent"},
                "timestamp": {"type": "string", "format": "date-time"},
                "data": {
                    "type": "object",
                    "properties": {
                        "quotes": {
                            "type": "array",
                            "items": _INDEX_QUOTE_ROW_SCHEMA,
                        },
                        "partial": {"type": "boolean"},
                        "warnings": {
                            "type": "array",
                            "items": _WARNING_SCHEMA,
                        },
                    },
                    "required": ["quotes", "partial", "warnings"],
                    "additionalProperties": False,
                },
            },
            "required": ["ok", "source", "timestamp", "data"],
            "additionalProperties": False,
        },
        {
            "type": "object",
            "properties": {
                "ok": {"const": False},
                "error": {"type": "string"},
                "error_code": {"type": "string"},
                "source": {"const": "tencent"},
                "timestamp": {"type": "string", "format": "date-time"},
            },
            "required": ["ok", "error", "error_code", "source", "timestamp"],
            "additionalProperties": False,
        },
    ],
}

# ---------------------------------------------------------------------------
# Tool
# ---------------------------------------------------------------------------


class IndexQuoteTool(BaseTool):
    """Fetch real-time quotes for the four major A-share benchmark indices."""

    name = "get_index_quotes"
    description = (
        "Fetch real-time quotes for the four major mainland China equity "
        "benchmark indices (上证综指 / 深证成指 / 创业板指 / 科创50) from "
        "Tencent Finance. Public, no-auth, read-only. Returns a JSON envelope "
        "with per-index price / change_pct / prev_close / open / high / low. "
        "Individual stock codes are NOT accepted — only the four curated "
        "indices. Partial failures (some indices unavailable) are marked with "
        "partial:true and per-index warnings."
    )
    parameters = INDEX_QUOTE_INPUT_SCHEMA
    output_schema = INDEX_QUOTE_OUTPUT_SCHEMA

    def execute(self, **kwargs: Any) -> str:
        """Fetch index quotes, normalize, and return a JSON envelope.

        Args:
            **kwargs: Optional ``indices`` list; defaults to all four indices.

        Returns:
            A JSON string envelope.  On full success:
            ``{"ok":true, "source":"tencent", "timestamp":"...",
            "data":{"quotes":[...], "partial":false, "warnings":[]}}``.
            On partial failure the envelope stays ``ok:true`` with
            ``partial:true``.  All-four failure returns ``ok:false``.
        """
        requested = kwargs.get("indices", _INDEX_CODE_LIST)

        if not isinstance(requested, list) or len(requested) == 0:
            requested = _INDEX_CODE_LIST

        invalid = [c for c in requested if c not in _INDEX_ALLOWLIST]
        if invalid:
            return _error(
                f"index code(s) not in allowlist: {', '.join(sorted(invalid))}. "
                f"Allowed: {', '.join(_INDEX_CODE_LIST)}",
                error_code="invalid_argument",
            )

        raw: dict[str, dict[str, Any]]
        try:
            raw = tencent_quote(requested)
        except Exception as exc:  # noqa: BLE001 — surfacing transport failure
            logger.warning("tencent_quote(%s) raised: %s", requested, exc)
            return _error(
                f"tencent index quote request failed: {exc}",
                error_code="provider_request_failed",
            )

        timestamp = datetime.now(timezone.utc).isoformat()

        quotes: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []

        for code in requested:
            try:
                quote = _normalize_index_quote(code, raw)
                quotes.append(quote)

                # A missing quote that didn't raise is surfaced as a warning
                # when the price field is absent (Tencent returned the line but
                # with no usable numeric data).
                if quote["price"] is None:
                    warnings.append(
                        {
                            "code": "provider_quote_missing",
                            "message": (
                                f"Tencent returned no usable quote for "
                                f"{code} ({_INDEX_ALLOWLIST[code]})"
                            ),
                            "index_code": code,
                        }
                    )
            except Exception as exc:  # noqa: BLE001 — per-index degradation
                logger.warning("index %s normalization failed: %s", code, exc)
                warnings.append(
                    {
                        "code": "provider_quote_failed",
                        "message": f"index {code} ({_INDEX_ALLOWLIST[code]}): {exc}",
                        "index_code": code,
                    }
                )
                # Insert a placeholder row so the consumer sees which index failed.
                quotes.append(
                    {
                        "code": code,
                        "name": _INDEX_ALLOWLIST[code],
                        "price": None,
                        "prev_close": None,
                        "open": None,
                        "high": None,
                        "low": None,
                        "change_pct": None,
                    }
                )

        partial = bool(warnings)
        all_failed = len([q for q in quotes if q["price"] is not None]) == 0

        if all_failed:
            return _error(
                "all requested index quotes failed",
                error_code="provider_request_failed",
            )

        return json.dumps(
            {
                "ok": True,
                "source": "tencent",
                "timestamp": timestamp,
                "data": {
                    "quotes": quotes,
                    "partial": partial,
                    "warnings": warnings,
                },
            },
            ensure_ascii=False,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_index_quote(
    code: str,
    raw: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Extract one normalized index quote row from the Tencent response dict.

    Tencent quotes are keyed by bare 6-digit code.  For indices the code
    maps via the same convention (e.g. ``sh000001`` → ``"000001"``).
    """
    bare = code[2:]  # strip sh/sz/bj prefix

    entry = raw.get(bare)
    if not isinstance(entry, dict):
        raise KeyError(f"code {bare} not found in Tencent response")

    name_raw = entry.get("name")
    name = (
        name_raw.strip()
        if isinstance(name_raw, str) and name_raw.strip()
        else _INDEX_ALLOWLIST.get(code, code)
    )

    return {
        "code": code,
        "name": name,
        "price": _to_number(entry.get("price")),
        "prev_close": _to_number(entry.get("prev_close")),
        "open": _to_number(entry.get("open")),
        "high": _to_number(entry.get("high")),
        "low": _to_number(entry.get("low")),
        "change_pct": _to_number(entry.get("change_pct")),
    }


def _to_number(value: Any) -> float | None:
    """Coerce a cell to ``float``, or ``None`` when absent / non-numeric."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _error(message: str, *, error_code: str) -> str:
    """Render a failure envelope as a JSON string."""
    return json.dumps(
        {
            "ok": False,
            "error": message,
            "error_code": error_code,
            "source": "tencent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        ensure_ascii=False,
    )
