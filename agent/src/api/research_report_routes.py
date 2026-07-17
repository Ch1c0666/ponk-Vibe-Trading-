"""Research report REST route.

Mounted by ``agent/api_server.py`` via ``register_research_report_routes(app)``.

Exposes ``GET /api/reports/research?code=<A-share code>&limit=<n>`` so the
frontend can fetch q_type=0 stock-level research reports without speaking MCP.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse

from backtest.loaders.research_reports import (
    DEFAULT_REPORT_LIMIT,
    MAX_TOOL_REPORT_LIMIT,
)

_ALLOWED_PARAMS = frozenset({"code", "limit"})

# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def register_research_report_routes(app: FastAPI) -> None:
    """Mount the research report routes onto *app*."""

    @app.get("/api/reports/research")
    async def research_reports(
        request: Request,
        code: str = Query(
            ...,
            description="A-share symbol, e.g. 000000.SH (syntactic placeholder)",
            pattern=r"^\d{6}\.(SH|SZ|BJ)$",
        ),
        limit: int = Query(
            DEFAULT_REPORT_LIMIT,
            ge=1,
            le=MAX_TOOL_REPORT_LIMIT,
            description=f"Max reports (1–{MAX_TOOL_REPORT_LIMIT})",
        ),
    ) -> JSONResponse:
        """Fetch q_type=0 stock-level research reports for one A-share code.

        Delegates to ``get_research_reports`` via the auto-discovered tool
        registry.  q_type is always 0; industry reports (q_type=1) are not
        exposed through this endpoint.
        """
        # Reject any query params outside the allowed set.
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

        from src.tools import build_registry

        registry = build_registry(include_shell_tools=False)
        tool = registry.get("get_research_reports")
        if tool is None:
            return JSONResponse(
                status_code=503,
                content={
                    "ok": False,
                    "error": "get_research_reports tool not available",
                    "error_code": "tool_unavailable",
                },
            )

        try:
            result_str: str = tool.execute(q_type=0, code=code, limit=limit)
        except Exception as exc:
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": f"research report tool execution failed: {exc}",
                    "error_code": "tool_execution_failed",
                },
            )

        import json as _json

        try:
            payload = _json.loads(result_str)
        except _json.JSONDecodeError:
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": "research report tool returned non-JSON",
                    "error_code": "tool_result_parse_error",
                },
            )

        if not isinstance(payload, dict):
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": "research report tool returned unexpected result",
                    "error_code": "tool_result_invalid",
                },
            )

        return JSONResponse(status_code=200, content=payload)
