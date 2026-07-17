"""Overview index quote HTTP route.

Mounted by ``agent/api_server.py`` via ``register_overview_routes(app)``.

Exposes a plain REST endpoint that wraps ``get_index_quotes`` so the frontend
can fetch A-share benchmark index levels without speaking MCP JSON-RPC.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def register_overview_routes(app: FastAPI) -> None:
    """Mount the overview routes onto *app*."""

    @app.get("/api/overview/index-quotes")
    async def index_quotes() -> JSONResponse:
        """Return real-time quotes for the four A-share benchmark indices.

        Delegates to the auto-discovered ``get_index_quotes`` tool.  The
        tool enforces a four-index allowlist and returns a typed envelope
        with partial / warning semantics.
        """
        # Late import so the registry sees all tools discovered at startup.
        from src.tools import build_registry

        registry = build_registry(include_shell_tools=False)
        tool = registry.get("get_index_quotes")
        if tool is None:
            return JSONResponse(
                status_code=503,
                content={
                    "ok": False,
                    "error": "get_index_quotes tool not available",
                    "error_code": "tool_unavailable",
                },
            )

        try:
            result_str: str = tool.execute()
        except Exception as exc:
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": f"index quote tool execution failed: {exc}",
                    "error_code": "tool_execution_failed",
                },
            )

        # The tool returns a JSON string envelope — parse and return as JSON.
        import json as _json

        try:
            payload = _json.loads(result_str)
        except _json.JSONDecodeError:
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": "index quote tool returned non-JSON",
                    "error_code": "tool_result_parse_error",
                },
            )

        if not isinstance(payload, dict):
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "error": "index quote tool returned unexpected result",
                    "error_code": "tool_result_invalid",
                },
            )

        # Use 200 for both ok:true and ok:false — the envelope carries the
        # success/failure semantics so the frontend adapter can handle all
        # states without inspecting HTTP status codes.
        return JSONResponse(status_code=200, content=payload)
