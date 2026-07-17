"""Tests for GET /api/overview/index-quotes — fully offline, no real Tencent.

The ``IndexQuoteTool.execute()`` call is mocked at the registry level so no
test reaches a live network endpoint.  No .env reads.
"""

from __future__ import annotations

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from api_server import app

client = TestClient(app)


def _success_envelope() -> str:
    return json.dumps(
        {
            "ok": True,
            "source": "tencent",
            "timestamp": "2026-07-18T10:00:00Z",
            "data": {
                "quotes": [
                    {
                        "code": "sh000001",
                        "name": "上证综指",
                        "price": 3350.0,
                        "prev_close": 3340.0,
                        "open": 3345.0,
                        "high": 3360.0,
                        "low": 3330.0,
                        "change_pct": 0.42,
                    },
                ],
                "partial": False,
                "warnings": [],
            },
        },
        ensure_ascii=False,
    )


def _partial_envelope() -> str:
    return json.dumps(
        {
            "ok": True,
            "source": "tencent",
            "timestamp": "2026-07-18T10:00:00Z",
            "data": {
                "quotes": [
                    {
                        "code": "sh000001",
                        "name": "上证综指",
                        "price": 3350.0,
                        "prev_close": None,
                        "open": None,
                        "high": None,
                        "low": None,
                        "change_pct": 0.42,
                    },
                ],
                "partial": True,
                "warnings": [
                    {
                        "code": "provider_quote_failed",
                        "message": "sz fail",
                        "index_code": "sz399001",
                    }
                ],
            },
        },
        ensure_ascii=False,
    )


def _error_envelope() -> str:
    return json.dumps(
        {
            "ok": False,
            "error": "all failed",
            "error_code": "provider_request_failed",
            "source": "tencent",
            "timestamp": "2026-07-18T10:00:00Z",
        },
        ensure_ascii=False,
    )


# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------


def test_endpoint_returns_success():
    with patch(
        "src.tools.build_registry"
    ) as mock_build:
        mock_registry = mock_build.return_value
        mock_tool = mock_registry.get.return_value
        mock_tool.execute.return_value = _success_envelope()

        resp = client.get("/api/overview/index-quotes")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["source"] == "tencent"
    assert len(payload["data"]["quotes"]) == 1
    assert payload["data"]["partial"] is False


# ---------------------------------------------------------------------------
# Partial
# ---------------------------------------------------------------------------


def test_endpoint_returns_partial():
    with patch(
        "src.tools.build_registry"
    ) as mock_build:
        mock_registry = mock_build.return_value
        mock_tool = mock_registry.get.return_value
        mock_tool.execute.return_value = _partial_envelope()

        resp = client.get("/api/overview/index-quotes")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["data"]["partial"] is True
    assert len(payload["data"]["warnings"]) == 1


# ---------------------------------------------------------------------------
# Provider error
# ---------------------------------------------------------------------------


def test_endpoint_passes_through_provider_error():
    with patch(
        "src.tools.build_registry"
    ) as mock_build:
        mock_registry = mock_build.return_value
        mock_tool = mock_registry.get.return_value
        mock_tool.execute.return_value = _error_envelope()

        resp = client.get("/api/overview/index-quotes")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is False
    assert payload["error_code"] == "provider_request_failed"


# ---------------------------------------------------------------------------
# Tool unavailable
# ---------------------------------------------------------------------------


def test_endpoint_returns_503_when_tool_not_in_registry():
    with patch(
        "src.tools.build_registry"
    ) as mock_build:
        mock_registry = mock_build.return_value
        mock_registry.get.return_value = None

        resp = client.get("/api/overview/index-quotes")

    assert resp.status_code == 503
    payload = resp.json()
    assert payload["ok"] is False
    assert payload["error_code"] == "tool_unavailable"


# ---------------------------------------------------------------------------
# Tool execution crash
# ---------------------------------------------------------------------------


def test_endpoint_returns_502_on_tool_crash():
    with patch(
        "src.tools.build_registry"
    ) as mock_build:
        mock_registry = mock_build.return_value
        mock_tool = mock_registry.get.return_value
        mock_tool.execute.side_effect = RuntimeError("boom")

        resp = client.get("/api/overview/index-quotes")

    assert resp.status_code == 502
    payload = resp.json()
    assert payload["ok"] is False
    assert payload["error_code"] == "tool_execution_failed"


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------


def test_no_env_read_in_route_module():
    """The route module must not read environment variables."""
    import src.api.overview_routes as ovr

    source_path = ovr.__file__
    assert source_path is not None
    with open(source_path) as f:
        body = f.read()
    assert "environ" not in body
    assert "getenv" not in body
    assert ".env" not in body
