"""Stock quote REST route.

Mounted by ``agent/api_server.py`` via ``register_stock_quote_routes(app)``.

Exposes ``GET /api/stocks/quote?code=<A-share code>``.  Only codes that have
passed manual review (recorded in ``agent/config/reviewed_segment_codes.json``)
are served.  The reviewed-code set is empty by default — every code is rejected
with 403 until the manifest is populated.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse

_ALLOWED_PARAMS = frozenset({"code"})
_CODE_RE = re.compile(r"^\d{6}\.(SH|SZ|BJ)$")

_MANIFEST_PATH = (
    Path(__file__).resolve().parent.parent.parent / "config" / "reviewed_segment_codes.json"
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Manifest loader — fail-closed on any error.
# ---------------------------------------------------------------------------


def _load_manifest() -> dict[str, Any] | None:
    """Load and validate the reviewed-code manifest.  Returns None on failure."""
    try:
        raw = _MANIFEST_PATH.read_text(encoding="utf-8")
    except Exception as exc:
        logger.warning("reviewed_segment_codes.json read failed: %s", exc)
        return None

    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("reviewed_segment_codes.json invalid JSON: %s", exc)
        return None

    if not isinstance(manifest, dict):
        logger.warning("reviewed_segment_codes.json is not a JSON object")
        return None

    if manifest.get("version") != 1:
        logger.warning(
            "reviewed_segment_codes.json unsupported version: %s",
            manifest.get("version"),
        )
        return None

    return manifest


def get_reviewed_stock_codes_for(data_use_filter: str) -> set[str]:
    """Return manually reviewed & approved A-share codes for one data use.

    Reads from ``agent/config/reviewed_segment_codes.json``.  Only codes with
    ``"status": "approved"``, valid format, required audit fields, and
    ``dataUse`` containing *data_use_filter* are included.  Disabled codes,
    missing required fields, wrong data uses, and invalid entries are silently
    skipped (logged as warnings).

    On any manifest load failure the returned set is empty — fail-closed.
    """
    manifest = _load_manifest()
    if manifest is None:
        return set()

    codes: set[str] = set()
    segments = manifest.get("segments")
    if not isinstance(segments, dict):
        return set()

    for scope_name, scope in segments.items():
        if not isinstance(scope, dict):
            continue
        for segment_key, segment_data in scope.items():
            if not isinstance(segment_data, dict):
                continue
            for entry in segment_data.get("codes", []):
                if not isinstance(entry, dict):
                    continue
                if entry.get("status") != "approved":
                    continue
                raw_code = entry.get("code")
                if not isinstance(raw_code, str) or not _CODE_RE.match(raw_code):
                    logger.warning(
                        "reviewed_codes: skipping invalid code %r in %s/%s",
                        raw_code, scope_name, segment_key,
                    )
                    continue
                # Non-empty code item must carry mandatory audit fields.
                if not _has_required_fields(entry, scope_name, segment_key, raw_code):
                    continue
                # Must be explicitly approved for the requested data use.
                data_use = entry.get("dataUse")
                if not isinstance(data_use, list) or data_use_filter not in data_use:
                    logger.warning(
                        "reviewed_codes: skipping %s in %s/%s — dataUse missing or excludes %r",
                        raw_code, scope_name, segment_key,
                        data_use_filter,
                    )
                    continue
                codes.add(raw_code)

    return codes


def get_reviewed_stock_codes() -> set[str]:
    """Return the set of manually reviewed & quote-approved A-share codes."""
    return get_reviewed_stock_codes_for("quote")


def _has_required_fields(
    entry: dict[str, Any],
    scope_name: str,
    segment_key: str,
    code: str,
) -> bool:
    """Return True if *entry* carries all mandatory audit fields."""
    missing = []
    for field in ("reason", "source", "reviewer", "reviewedAt"):
        val = entry.get(field)
        if not isinstance(val, str) or not val.strip():
            missing.append(field)
    if missing:
        logger.warning(
            "reviewed_codes: skipping %s in %s/%s — missing %s",
            code, scope_name, segment_key, ", ".join(missing),
        )
        return False
    return True


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def register_stock_quote_routes(app: FastAPI) -> None:
    """Mount the stock quote route onto *app*."""

    @app.get("/api/stocks/quote")
    async def stock_quote(
        request: Request,
        code: str = Query(
            ...,
            description="A-share symbol, e.g. 000000.SH (syntactic placeholder)",
            pattern=r"^\d{6}\.(SH|SZ|BJ)$",
        ),
    ) -> JSONResponse:
        """Fetch real-time quote for one reviewed A-share code via Tencent.

        Returns 403 with error_code ``code_not_reviewed`` when the code is
        not in the reviewed set.  The reviewed set is empty by default;
        codes become available only after the manifest is audited.
        """
        # Reject unknown query params.
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

        # Gate: only reviewed codes.
        reviewed = get_reviewed_stock_codes()
        if code not in reviewed:
            return JSONResponse(
                status_code=403,
                content={
                    "ok": False,
                    "error": f"code '{code}' has not passed manual review",
                    "error_code": "code_not_reviewed",
                },
            )

        # Provider call — only reached for reviewed codes.
        try:
            from backtest.loaders.astockdata_loader import tencent_quote

            raw = tencent_quote([code])
        except Exception as exc:
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": f"quote provider failed: {exc}",
                    "error_code": "provider_request_failed",
                },
            )

        bare = code.replace(".SH", "").replace(".SZ", "").replace(".BJ", "")
        entry = raw.get(bare)
        if not isinstance(entry, dict):
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": f"no quote data returned for '{code}'",
                    "error_code": "provider_request_failed",
                },
            )

        name = entry.get("name")
        price = _to_number(entry.get("price"))
        if price is None and not isinstance(name, str):
            return JSONResponse(
                status_code=200,
                content={
                    "ok": False,
                    "error": f"no usable quote for '{code}'",
                    "error_code": "provider_request_failed",
                },
            )

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "source": "tencent",
                "code": code,
                "data": {
                    "name": name.strip() if isinstance(name, str) else None,
                    "price": price,
                    "prev_close": _to_number(entry.get("prev_close")),
                    "open": _to_number(entry.get("open")),
                    "high": _to_number(entry.get("high")),
                    "low": _to_number(entry.get("low")),
                    "change_pct": _to_number(entry.get("change_pct")),
                    "pe_ttm": _to_number(entry.get("pe_ttm")),
                    "pb": _to_number(entry.get("pb")),
                },
            },
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_number(value: object) -> float | None:
    """Coerce a cell to float, or None when absent/non-numeric."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
