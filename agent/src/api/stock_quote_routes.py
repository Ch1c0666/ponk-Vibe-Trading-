"""Stock quote REST route.

Mounted by ``agent/api_server.py`` via ``register_stock_quote_routes(app)``.

Exposes ``GET /api/stocks/quote?code=<A-share code>``.  Only codes that have
passed manual review (segmentCodeMap / humanoidSegmentCodeMap) are served.
The reviewed-code set is empty by default — every code is rejected with 403
until the code maps are populated in a future phase.
"""

from __future__ import annotations

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse

_ALLOWED_PARAMS = frozenset({"code"})

# ---------------------------------------------------------------------------
# Reviewed-code gate — empty until populated from segmentCodeMap manifests.
# Phase 2 will load this from a generated JSON or cross-language manifest.
# ---------------------------------------------------------------------------


def get_reviewed_stock_codes() -> set[str]:
    """Return the set of manually reviewed A-share codes allowed for quote.

    **Currently always empty.**  No stock code is served until the
    segmentCodeMap / humanoidSegmentCodeMap manifests are audited and the
    reviewed set is populated.
    """
    return set()


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
        codes become available only after segmentCodeMap manual audit.
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
