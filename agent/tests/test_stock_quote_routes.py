"""Tests for GET /api/stocks/quote — offline, no real Tencent.

Placeholder codes (000000.SH, 111111.SZ) are syntactic-only.
All provider calls are mocked.  No .env reads.  No network.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from api_server import app

client = TestClient(app)

_PLACEHOLDER = "000000.SH"
_MANIFEST_DIR = Path(__file__).resolve().parent / "fixtures"


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


def _approved_manifest(*approved_codes: str) -> dict:
    """Build a minimal manifest with approved placeholder codes."""
    segments: dict = {
        "aiComputing": {
            "computeChip": {"codes": []},
            "hbm": {"codes": []},
            "opticalModule": {"codes": []},
            "pcb": {"codes": []},
            "switchChip": {"codes": []},
            "liquidCooling": {"codes": []},
            "mlcc": {"codes": []},
            "glassSubstrate": {"codes": []},
        },
        "humanoidRobot": {
            "harmonicReducer": {"codes": []},
            "planetaryRollerScrew": {"codes": []},
            "framelessTorqueMotor": {"codes": []},
            "sixAxisForceSensor": {"codes": []},
            "dexterousHand": {"codes": []},
            "ballScrew": {"codes": []},
        },
    }
    for code in approved_codes:
        entry = {
            "code": code,
            "status": "approved",
            "reason": "Syntactic placeholder for testing",
            "source": "Test fixture",
            "reviewer": "test-suite",
            "reviewedAt": "2026-07-18",
        }
        segments["aiComputing"]["computeChip"]["codes"].append(entry)
    return {"version": 1, "segments": segments}


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
    resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}")
    assert resp.status_code == 403
    assert resp.json()["error_code"] == "code_not_reviewed"


def test_not_reviewed_does_not_call_tencent_quote():
    with patch(
        "backtest.loaders.astockdata_loader.tencent_quote"
    ) as mock_tq:
        client.get("/api/stocks/quote?code=111111.SZ")
        mock_tq.assert_not_called()


# ---------------------------------------------------------------------------
# Unknown query params → 400
# ---------------------------------------------------------------------------


def test_unknown_param_rejected_400():
    resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}&limit=5")
    assert resp.status_code == 400
    assert "limit" in resp.json()["error"]


# ---------------------------------------------------------------------------
# Success path — monkeypatch manifest with approved code
# ---------------------------------------------------------------------------


def test_success_when_code_reviewed():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_approved_manifest(_PLACEHOLDER),
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        return_value=_mock_quote(),
    ):
        resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert payload["source"] == "tencent"
    assert payload["data"]["price"] == 10.0


# ---------------------------------------------------------------------------
# Provider failure
# ---------------------------------------------------------------------------


def test_provider_exception_returns_502():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_approved_manifest(_PLACEHOLDER),
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        side_effect=RuntimeError("network down"),
    ):
        resp = client.get(f"/api/stocks/quote?code={_PLACEHOLDER}")

    assert resp.status_code == 502
    assert resp.json()["error_code"] == "provider_request_failed"


# ---------------------------------------------------------------------------
# Manifest edge cases
# ---------------------------------------------------------------------------


def test_default_manifest_is_empty():
    from src.api.stock_quote_routes import get_reviewed_stock_codes

    # Default manifest (json on disk) is all empty → set()
    assert get_reviewed_stock_codes() == set()


def test_manifest_approved_code_included():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_approved_manifest(_PLACEHOLDER, "111111.SZ"),
    ):
        codes = __import__(
            "src.api.stock_quote_routes", fromlist=["get_reviewed_stock_codes"]
        ).get_reviewed_stock_codes()

    assert _PLACEHOLDER in codes
    assert "111111.SZ" in codes


def test_manifest_disabled_code_excluded():
    manifest = _approved_manifest(_PLACEHOLDER)
    # Override status to disabled
    manifest["segments"]["aiComputing"]["computeChip"]["codes"][0]["status"] = "disabled"

    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=manifest,
    ):
        codes = __import__(
            "src.api.stock_quote_routes", fromlist=["get_reviewed_stock_codes"]
        ).get_reviewed_stock_codes()

    assert codes == set()


def test_manifest_missing_required_fields_skipped():
    """An approved code without reason is skipped."""
    manifest = _approved_manifest(_PLACEHOLDER)
    del manifest["segments"]["aiComputing"]["computeChip"]["codes"][0]["reason"]

    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=manifest,
    ):
        codes = __import__(
            "src.api.stock_quote_routes", fromlist=["get_reviewed_stock_codes"]
        ).get_reviewed_stock_codes()

    assert codes == set()


def test_manifest_none_fail_closed():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=None,
    ):
        codes = __import__(
            "src.api.stock_quote_routes", fromlist=["get_reviewed_stock_codes"]
        ).get_reviewed_stock_codes()

    assert codes == set()


def test_manifest_invalid_code_format_skipped():
    manifest = _approved_manifest(_PLACEHOLDER)
    manifest["segments"]["aiComputing"]["computeChip"]["codes"][0]["code"] = "not-a-code"

    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=manifest,
    ):
        codes = __import__(
            "src.api.stock_quote_routes", fromlist=["get_reviewed_stock_codes"]
        ).get_reviewed_stock_codes()

    assert codes == set()


def test_endpoint_403_when_manifest_is_empty():
    """Even with the real default manifest, endpoint rejects codes."""
    resp = client.get("/api/stocks/quote?code=111111.SZ")
    assert resp.status_code == 403
    assert resp.json()["error_code"] == "code_not_reviewed"


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


def test_no_real_stock_codes_in_source():
    import src.api.stock_quote_routes as sqr

    source_path = sqr.__file__
    assert source_path is not None
    with open(source_path) as f:
        body = f.read()
    assert "600519" not in body
    assert "000001" not in body
    assert "688981" not in body


def test_manifest_file_is_all_empty():
    """The on-disk manifest must not contain any real codes."""
    manifest_path = (
        Path(__file__).resolve().parent.parent
        / "config" / "reviewed_segment_codes.json"
    )
    raw = manifest_path.read_text()
    data = json.loads(raw)
    for scope in data.get("segments", {}).values():
        for segment in scope.values():
            assert segment.get("codes") == [], (
                f"Manifest segment has non-empty codes: {segment}"
            )
    assert "600519" not in raw
    assert "000001" not in raw
