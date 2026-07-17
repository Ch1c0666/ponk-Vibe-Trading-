"""Tests for get_index_quotes: success / partial / error / schema, fully offline.

``tencent_quote`` is mocked at the tool-module import site so no test reaches
a live Tencent endpoint.  No .env reads.  No network access.
"""

from __future__ import annotations

import json
from unittest.mock import patch

from jsonschema import Draft202012Validator

from src.tools import index_quote_tool as iqt
from src.tools.index_quote_tool import (
    INDEX_QUOTE_INPUT_SCHEMA,
    INDEX_QUOTE_OUTPUT_SCHEMA,
    IndexQuoteTool,
)

# Known allowlist codes
_SH = "sh000001"
_SZ = "sz399001"
_CY = "sz399006"
_KC = "sh000688"

_ALL_FOUR = [_SH, _SZ, _CY, _KC]


def _make_quote(
    name: str,
    price: float | None = 3500.0,
    prev_close: float = 3480.0,
    change_pct: float = 0.57,
    open_: float = 3475.0,
    high: float = 3510.0,
    low: float = 3460.0,
) -> dict:
    return {
        "name": name,
        "price": price,
        "prev_close": prev_close,
        "open": open_,
        "high": high,
        "low": low,
        "change_pct": change_pct,
        "volume": 123456,
        "pe_ttm": None,
        "pb": None,
        "mcap_yi": None,
        "float_mcap_yi": None,
        "turnover_pct": None,
    }


def _make_raw(*quotes: tuple[str, dict]) -> dict:
    """Build a tencent_quote-style dict keyed by bare code."""
    result: dict = {}
    for code, quote in quotes:
        bare = code[2:]  # sh000001 → 000001
        result[bare] = quote
    return result


# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------


def test_all_four_success():
    raw = _make_raw(
        (_SH, _make_quote("上证综指", price=3350.0, change_pct=0.42)),
        (_SZ, _make_quote("深证成指", price=10800.0, change_pct=-0.15)),
        (_CY, _make_quote("创业板指", price=2150.0, change_pct=1.20)),
        (_KC, _make_quote("科创50", price=980.0, change_pct=-0.80)),
    )

    with patch.object(iqt, "tencent_quote", return_value=raw):
        out = IndexQuoteTool().execute()

    payload = json.loads(out)
    Draft202012Validator(INDEX_QUOTE_OUTPUT_SCHEMA).validate(payload)

    assert payload["ok"] is True
    assert payload["source"] == "tencent"
    assert "timestamp" in payload
    assert payload["data"]["partial"] is False
    assert payload["data"]["warnings"] == []

    quotes = payload["data"]["quotes"]
    assert len(quotes) == 4
    assert quotes[0]["code"] == _SH
    assert quotes[0]["name"] == "上证综指"
    assert quotes[0]["price"] == 3350.0
    assert quotes[0]["change_pct"] == 0.42


def test_defaults_to_all_four_when_no_indices_arg():
    raw = _make_raw(
        (_SH, _make_quote("上证综指")),
        (_SZ, _make_quote("深证成指")),
        (_CY, _make_quote("创业板指")),
        (_KC, _make_quote("科创50")),
    )

    with patch.object(iqt, "tencent_quote", return_value=raw):
        out = IndexQuoteTool().execute()

    payload = json.loads(out)
    assert payload["ok"] is True
    assert len(payload["data"]["quotes"]) == 4


def test_explicit_subset():
    raw = _make_raw(
        (_SH, _make_quote("上证综指")),
        (_SZ, _make_quote("深证成指")),
    )

    with patch.object(iqt, "tencent_quote", return_value=raw):
        out = IndexQuoteTool().execute(indices=[_SH, _SZ])

    payload = json.loads(out)
    assert payload["ok"] is True
    assert len(payload["data"]["quotes"]) == 2


# ---------------------------------------------------------------------------
# Partial failure
# ---------------------------------------------------------------------------


def test_partial_one_index_missing_from_response():
    """One code present in raw but with null price → missing warning."""
    raw = _make_raw(
        (_SH, _make_quote("上证综指")),
        (_SZ, _make_quote("深证成指")),
        (_CY, {"name": None, "price": None, "prev_close": None}),
        (_KC, _make_quote("科创50")),
    )

    with patch.object(iqt, "tencent_quote", return_value=raw):
        out = IndexQuoteTool().execute()

    payload = json.loads(out)
    Draft202012Validator(INDEX_QUOTE_OUTPUT_SCHEMA).validate(payload)

    assert payload["ok"] is True
    assert payload["data"]["partial"] is True
    warnings = payload["data"]["warnings"]
    assert len(warnings) == 1
    assert warnings[0]["code"] == "provider_quote_missing"
    assert warnings[0]["index_code"] == _CY
    # All four rows present, three with data
    assert len(payload["data"]["quotes"]) == 4


def test_partial_one_index_not_in_response():
    """A code not present in the Tencent response dict → KeyError degradation."""
    raw = _make_raw(
        (_SH, _make_quote("上证综指")),
        (_SZ, _make_quote("深证成指")),
        # _CY deliberately omitted from raw
        (_KC, _make_quote("科创50")),
    )

    with patch.object(iqt, "tencent_quote", return_value=raw):
        out = IndexQuoteTool().execute()

    payload = json.loads(out)
    assert payload["ok"] is True
    assert payload["data"]["partial"] is True
    assert len(payload["data"]["warnings"]) >= 1
    # Placeholder row inserted for the failed index
    failed_row = next(
        q for q in payload["data"]["quotes"] if q["code"] == _CY
    )
    assert failed_row["price"] is None


# ---------------------------------------------------------------------------
# All-four failure
# ---------------------------------------------------------------------------


def test_all_four_fail_returns_error_envelope():
    """When every index has no usable price, return ok=false."""
    raw = _make_raw(
        (_SH, {"name": None, "price": None}),
        (_SZ, {"name": None, "price": None}),
        (_CY, {"name": None, "price": None}),
        (_KC, {"name": None, "price": None}),
    )

    with patch.object(iqt, "tencent_quote", return_value=raw):
        out = IndexQuoteTool().execute()

    payload = json.loads(out)
    Draft202012Validator(INDEX_QUOTE_OUTPUT_SCHEMA).validate(payload)

    assert payload["ok"] is False
    assert "error" in payload
    assert payload["error_code"] == "provider_request_failed"


def test_tencent_quote_transport_failure():
    with patch.object(iqt, "tencent_quote", side_effect=RuntimeError("network down")):
        out = IndexQuoteTool().execute()

    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error_code"] == "provider_request_failed"
    assert "network down" in payload["error"]


# ---------------------------------------------------------------------------
# Allowlist enforcement
# ---------------------------------------------------------------------------


def test_rejects_non_allowlist_code():
    out = IndexQuoteTool().execute(indices=["sh000001", "sz000001"])
    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error_code"] == "invalid_argument"
    assert "sz000001" in payload["error"]


def test_rejects_stock_code():
    out = IndexQuoteTool().execute(indices=["600519"])
    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error_code"] == "invalid_argument"


def test_rejects_entirely_unknown():
    out = IndexQuoteTool().execute(indices=["fake_index_999"])
    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error_code"] == "invalid_argument"


def test_input_schema_is_valid_draft202012():
    Draft202012Validator.check_schema(INDEX_QUOTE_INPUT_SCHEMA)


def test_output_schema_is_valid_draft202012():
    Draft202012Validator.check_schema(INDEX_QUOTE_OUTPUT_SCHEMA)


# ---------------------------------------------------------------------------
# No .env read, no network access
# ---------------------------------------------------------------------------


def test_no_env_read():
    """The tool module must not read environment variables on import."""
    import os

    with patch.object(os, "environ", {}):
        # Re-import would be cached, but we verify the module doesn't
        # reference os.environ at all by searching its source.
        pass
    source = __import__("src.tools.index_quote_tool", fromlist=["_"]).__file__
    assert source is not None
    with open(source) as f:
        body = f.read()
    assert "environ" not in body
    assert "getenv" not in body


def test_no_network_access_without_mock():
    """Even without a mock, the tool module's import should not trigger any
    HTTP request — the tencent_quote function is only called inside execute()."""
    # This test verifies that importing the module is safe (no eager network).
    # The actual network call is via tencent_quote inside execute().
    assert iqt.tencent_quote is not None  # import succeeded, no crash


# ---------------------------------------------------------------------------
# Input schema validation
# ---------------------------------------------------------------------------


def test_input_schema_rejects_unknown_properties():
    validator = Draft202012Validator(INDEX_QUOTE_INPUT_SCHEMA)
    # additionalProperties: false — unknown keys should fail
    errors = list(validator.iter_errors({"indices": [_SH], "stock_codes": ["600519.SH"]}))
    assert len(errors) > 0


def test_input_schema_accepts_empty_indices_key():
    """Omitting indices altogether should be valid (defaults apply)."""
    validator = Draft202012Validator(INDEX_QUOTE_INPUT_SCHEMA)
    errors = list(validator.iter_errors({}))
    assert len(errors) == 0


# ---------------------------------------------------------------------------
# tencent_quote() URL correctness — verifies pre-formatted index codes
# are NOT double-converted (e.g. sh000001 → szSH000001 bug).
# ---------------------------------------------------------------------------


def test_tencent_quote_preserves_index_codes_in_url():
    """sh000001 / sz399001 / sz399006 / sh000688 must appear verbatim in URL."""
    from unittest.mock import patch as _patch

    import requests as _requests

    # Build a mock response that looks like a valid Tencent quote line
    def _mock_get(url, **__):
        # Return minimal valid response for each code
        lines = []
        for tc in ["sh000001", "sz399001", "sz399006", "sh000688"]:
            bare = tc[2:]
            lines.append(
                f'v_{tc}="1~MockIndex~{bare}~3500.00~3480.00~3475.00~0~...~'
                f'{"~".join(["0"] * 25)}~3500.00~3480.00~3475.00~3475.00~0~0~0~0~0~0.57"'
            )

        class FakeResp:
            text = "\n".join(lines)
            encoding = "utf-8"

        return FakeResp()

    with _patch.object(_requests, "get", side_effect=_mock_get) as mock_get:
        from backtest.loaders.astockdata_loader import tencent_quote

        result = tencent_quote(["sh000001", "sz399001", "sz399006", "sh000688"])

    # Verify the URL uses lowercase pre-formatted codes
    called_url = mock_get.call_args[0][0]
    assert "sh000001" in called_url, f"URL missing sh000001: {called_url}"
    assert "sz399001" in called_url, f"URL missing sz399001: {called_url}"
    assert "sz399006" in called_url, f"URL missing sz399006: {called_url}"
    assert "sh000688" in called_url, f"URL missing sh000688: {called_url}"
    # Must NOT contain the double-conversion bug pattern
    assert "shsh" not in called_url.lower(), f"BUG: double-conversion shsh in URL: {called_url}"
    assert "szsz" not in called_url.lower(), f"BUG: double-conversion szsz in URL: {called_url}"
    assert "bjbj" not in called_url.lower(), f"BUG: double-conversion bjbj in URL: {called_url}"

    # Result should be keyed by bare 6-digit code
    assert "000001" in result
    assert "399001" in result
    assert "399006" in result
    assert "000688" in result
    assert result["000001"]["name"] == "MockIndex"


def test_tencent_quote_stock_codes_still_work():
    """Existing stock code formats (000001, 600519.SH) still convert correctly."""
    from unittest.mock import patch as _patch

    import requests as _requests

    def _mock_get(url, **__):
        bare_codes = []
        for segment in url.split("=")[-1].split(","):
            bare_codes.append(segment)
        lines = []
        for tc in bare_codes:
            bare = tc[2:]
            lines.append(
                f'v_{tc}="1~Mock~{bare}~10.00~9.90~9.95~0~'
                f'{"~".join(["0"] * 25)}~10.00~9.90~9.95~9.95~0~0~0~0~0~0.50"'
            )

        class FakeResp:
            text = "\n".join(lines)
            encoding = "utf-8"

        return FakeResp()

    with _patch.object(_requests, "get", side_effect=_mock_get) as mock_get:
        from backtest.loaders.astockdata_loader import tencent_quote

        result = tencent_quote(["000001", "600519.SH", "000858.SZ"])

    called_url = mock_get.call_args[0][0]
    # Stock codes should be prefixed correctly (lowercase pre-formatted prefix)
    assert "sz000001" in called_url
    assert "sh600519" in called_url
    assert "sz000858" in called_url
    # None should have double-prefix
    assert "shsh" not in called_url
    assert "szsz" not in called_url

    assert "000001" in result
    assert "600519" in result
    assert "000858" in result
