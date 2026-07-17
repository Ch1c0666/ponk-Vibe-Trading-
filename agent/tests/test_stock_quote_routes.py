"""Tests for GET /api/stocks/quote — offline, no real Tencent.

Placeholder codes (000000.SH, 111111.SZ) are syntactic-only.
All provider calls are mocked.  No .env reads.  No network.
"""

from __future__ import annotations

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from api_server import app

client = TestClient(app)

_PLACEHOLDER = "000000.SH"


def _mock_quote(name: str = "MockCorp", price: float = 10.0) -> dict:
    return {
        "000000": {
            "name": name,
            "price": price,
            "prev_close": 9.9,
            "open": 9.95,
            "high": 10.1,
            "low": 9.8,
            "change_pct": 1.01,
            "pe_ttm": 15.0,
            "pb": 2.5,
        },
    }


# ---------------------------------------------------------------------------
# Missing / invalid code
# ---------------------------------------------------------------------------


def test_missing_code_returns_422():
    resp = client.get("/api/stocks/quote")
    assert resp.status_code == 422


def test_invalid_code_format_returns_422():
    resp = client.get("/api/stocks/quote?code=bad")
    assert resp.status_code == 422


def test_non_a_share_code_returns_422():
    resp = client.get("/api/stocks/quote?code=AAPL.US")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Code not reviewed → 403, zero provider call
# ---------------------------------------------------------------------------


def test_valid_placeholder_not_reviewed_returns_403():
    """Default white list is empty — all codes rejected."""
    resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}")
    assert resp.status_code == 403
    payload = resp.json()
    assert payload["ok"] is False
    assert payload["error_code"] == "code_not_reviewed"


def test_not_reviewed_does_not_call_tencent_quote():
    with patch(
        "backtest.loaders.astockdata_loader.tencent_quote"
    ) as mock_tq:
        client.get(f"/api/stocks/quote?code=111111.SZ")
        mock_tq.assert_not_called()


# ---------------------------------------------------------------------------
# Unknown query params → 400
# ---------------------------------------------------------------------------


def test_unknown_param_rejected_400():
    resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}&limit=5")
    assert resp.status_code == 400
    assert "limit" in resp.json()["error"]


# ---------------------------------------------------------------------------
# Success path — monkeypatch white list, mock tencent_quote
# ---------------------------------------------------------------------------


def test_success_when_code_reviewed():
    with patch(
        "src.api.stock_quote_routes.get_reviewed_stock_codes",
        return_value={_PLACEHOLDER},
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        return_value=_mock_quote(),
    ):

        resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["source"] == "tencent"
    assert payload["code"] == _PLACEHOLDER
    assert payload["data"]["name"] == "MockCorp"
    assert payload["data"]["price"] == 10.0
    assert payload["data"]["change_pct"] == 1.01


# ---------------------------------------------------------------------------
# Provider failure
# ---------------------------------------------------------------------------


def test_provider_exception_returns_502():
    with patch(
        "src.api.stock_quote_routes.get_reviewed_stock_codes",
        return_value={_PLACEHOLDER},
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        side_effect=RuntimeError("network down"),
    ):

        resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}")

    assert resp.status_code == 502
    assert resp.json()["error_code"] == "provider_request_failed"


def test_provider_empty_returns_502():
    with patch(
        "src.api.stock_quote_routes.get_reviewed_stock_codes",
        return_value={_PLACEHOLDER},
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        return_value={},
    ):

        resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}")

    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------


def test_no_env_read():
    import src.api.stock_quote_routes as sqr

    source_path = sqr.__file__
    assert source_path is not None
    with open(source_path) as f:
        body = f.read()
    assert "environ" not in body
    assert "getenv" not in body
    assert ".env" not in body


def test_no_real_stock_codes():
    import src.api.stock_quote_routes as sqr

    source_path = sqr.__file__
    assert source_path is not None
    with open(source_path) as f:
        body = f.read()
    assert "600519" not in body
    assert "000001" not in body
    assert "688981" not in body


def test_get_reviewed_stock_codes_is_empty():
    from src.api.stock_quote_routes import get_reviewed_stock_codes

    assert get_reviewed_stock_codes() == set()


def test_white_list_empty_rejects_all():
    """Every syntactically valid code must be 403 when white list is empty."""
    for code in ["000000.SH", "111111.SZ", "999999.BJ"]:
        resp = client.get(f"/api/stocks/quote?code={code}")
        assert resp.status_code == 403, f"{code} should be 403, got {resp.status_code}"
        assert resp.json()["error_code"] == "code_not_reviewed"
