"""Tests for GET /api/reports/research — offline, no real Eastmoney/THS.

All tool calls are mocked at the registry level.  No .env reads.  No network.

Placeholder codes used in tests (000000.SH, 111111.SZ) are syntactic-only and
do not represent real A-share stocks.
"""

from __future__ import annotations

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from api_server import app

client = TestClient(app)

# Syntactic placeholder — not a real stock code.
_PLACEHOLDER_CODE = "000000.SH"


def _ok_envelope() -> str:
    return json.dumps(
        {
            "ok": True,
            "market": "CN",
            "source": "eastmoney+ths",
            "data": {
                "q_type": 0,
                "code": _PLACEHOLDER_CODE,
                "reports": [
                    {
                        "title": "Q1 results",
                        "brokerage": "Broker A",
                        "analyst": "Analyst One",
                        "publish_date": "2024-04-30",
                        "info_code": "ANALYSIS-001",
                        "rating": "Buy",
                        "eps_forecast": {"this_year": 12.0, "next_year": 15.0},
                        "pe_forecast": {"this_year": 20.0, "next_year": 16.0},
                    }
                ],
                "consensus_eps": [],
                "partial": False,
                "warnings": [],
            },
        },
        ensure_ascii=False,
    )


def _error_envelope() -> str:
    return json.dumps(
        {
            "ok": False,
            "error": "no research coverage found",
            "error_code": "no_data",
            "details": {"q_type": 0, "supported_q_types": [0]},
        },
        ensure_ascii=False,
    )


# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------


def test_success_returns_ok_true():
    with patch("src.tools.build_registry") as mock_build:
        mock_tool = mock_build.return_value.get.return_value
        mock_tool.execute.return_value = _ok_envelope()

        resp = client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["data"]["q_type"] == 0
    assert len(payload["data"]["reports"]) == 1


# ---------------------------------------------------------------------------
# Provider error → ok:false, HTTP 200
# ---------------------------------------------------------------------------


def test_provider_error_returns_ok_false_200():
    with patch("src.tools.build_registry") as mock_build:
        mock_tool = mock_build.return_value.get.return_value
        mock_tool.execute.return_value = _error_envelope()

        resp = client.get("/api/reports/research?code=111111.SZ")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is False
    assert payload["error_code"] == "no_data"


# ---------------------------------------------------------------------------
# Missing / invalid code → 422 (FastAPI Query validation)
# ---------------------------------------------------------------------------


def test_missing_code_returns_422():
    resp = client.get("/api/reports/research")
    assert resp.status_code == 422


def test_invalid_code_format_returns_422():
    resp = client.get("/api/reports/research?code=bad")
    assert resp.status_code == 422


def test_non_a_share_code_returns_422():
    resp = client.get("/api/reports/research?code=AAPL.US")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# limit handling
# ---------------------------------------------------------------------------


def test_limit_default():
    with patch("src.tools.build_registry") as mock_build:
        mock_tool = mock_build.return_value.get.return_value
        mock_tool.execute.return_value = _ok_envelope()

        client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}")

    _, kwargs = mock_tool.execute.call_args
    assert kwargs["limit"] == 20


def test_limit_explicit():
    with patch("src.tools.build_registry") as mock_build:
        mock_tool = mock_build.return_value.get.return_value
        mock_tool.execute.return_value = _ok_envelope()

        client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}&limit=5")

    _, kwargs = mock_tool.execute.call_args
    assert kwargs["limit"] == 5


def test_limit_exceeds_max_returns_422():
    resp = client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}&limit=100")
    assert resp.status_code == 422


def test_limit_zero_returns_422():
    resp = client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}&limit=0")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# q_type always 0; unsupported params rejected with 400
# ---------------------------------------------------------------------------


def test_q_type_is_hardcoded_to_zero():
    with patch("src.tools.build_registry") as mock_build:
        mock_tool = mock_build.return_value.get.return_value
        mock_tool.execute.return_value = _ok_envelope()

        client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}&limit=10")

    _, kwargs = mock_tool.execute.call_args
    assert kwargs["q_type"] == 0
    assert kwargs["code"] == _PLACEHOLDER_CODE


def test_q_type_param_rejected_with_400():
    """q_type=1 must be rejected before any registry/tool call."""
    with patch("src.tools.build_registry") as mock_build:
        resp = client.get(
            f"/api/reports/research?code={_PLACEHOLDER_CODE}&q_type=1"
        )

    assert resp.status_code == 400
    payload = resp.json()
    assert payload["ok"] is False
    assert payload["error_code"] == "invalid_argument"
    assert "q_type" in payload["error"]
    # build_registry must NOT have been called
    mock_build.assert_not_called()


def test_unknown_param_rejected_with_400():
    with patch("src.tools.build_registry") as mock_build:
        resp = client.get(
            f"/api/reports/research?code={_PLACEHOLDER_CODE}&foo=bar"
        )

    assert resp.status_code == 400
    assert "foo" in resp.json()["error"]
    mock_build.assert_not_called()


# ---------------------------------------------------------------------------
# Tool unavailable / crash
# ---------------------------------------------------------------------------


def test_tool_unavailable_returns_503():
    with patch("src.tools.build_registry") as mock_build:
        mock_build.return_value.get.return_value = None

        resp = client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}")

    assert resp.status_code == 503
    assert resp.json()["error_code"] == "tool_unavailable"


def test_tool_crash_returns_502():
    with patch("src.tools.build_registry") as mock_build:
        mock_tool = mock_build.return_value.get.return_value
        mock_tool.execute.side_effect = RuntimeError("boom")

        resp = client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}")

    assert resp.status_code == 502
    assert resp.json()["error_code"] == "tool_execution_failed"


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------


def test_no_env_read():
    import src.api.research_report_routes as rrr

    source_path = rrr.__file__
    assert source_path is not None
    with open(source_path) as f:
        body = f.read()
    assert "environ" not in body
    assert "getenv" not in body
    assert ".env" not in body


def test_q_type_1_not_exposed():
    """Verify the endpoint never passes q_type=1 to the tool."""
    with patch("src.tools.build_registry") as mock_build:
        mock_tool = mock_build.return_value.get.return_value
        mock_tool.execute.return_value = _ok_envelope()

        client.get(f"/api/reports/research?code={_PLACEHOLDER_CODE}")

    _, kwargs = mock_tool.execute.call_args
    assert kwargs["q_type"] == 0
