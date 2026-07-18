"""Tests for GET /api/a-stocks/data — offline, no real provider calls."""

from __future__ import annotations

import json
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from api_server import app

client = TestClient(app)

_PLACEHOLDER = "000000.SH"


def _manifest_for(code: str, data_use: list[str]) -> dict:
    return {
        "version": 1,
        "segments": {
            "aiComputing": {
                "computeChip": {
                    "codes": [{
                        "code": code,
                        "status": "approved",
                        "reason": "Syntactic placeholder for testing",
                        "source": "Test fixture",
                        "reviewer": "test-suite",
                        "reviewedAt": "2026-07-18",
                        "dataUse": data_use,
                    }],
                },
                "hbm": {"codes": []},
            },
            "humanoidRobot": {
                "harmonicReducer": {"codes": []},
            },
        },
    }


def test_unknown_param_rejected_without_provider_call():
    with patch("src.api.astockdata_routes._FETCHERS") as fetchers:
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&q_type=1")

    assert resp.status_code == 400
    assert resp.json()["error_code"] == "invalid_argument"
    assert not fetchers.__getitem__.called


def test_invalid_include_rejected():
    resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=broker")

    assert resp.status_code == 400
    assert resp.json()["error_code"] == "invalid_argument"


def test_unreviewed_category_does_not_call_provider():
    fetch_reports = Mock(return_value={"ok": True})
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["quote"]),
    ), patch(
        "src.api.astockdata_routes._FETCHERS",
        {"reports": fetch_reports},
    ):
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=reports")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["reports"]["error_code"] == "code_not_reviewed"
    fetch_reports.assert_not_called()


def test_quote_uses_quote_datause_only():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["quote"]),
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        return_value={"000000": {"name": "Mock", "price": 1.0}},
    ) as quote:
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=quote")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is False
    assert payload["data"]["quote"]["ok"] is True
    assert payload["data"]["quote"]["data"]["price"] == 1.0
    quote.assert_called_once_with([_PLACEHOLDER])


def test_all_families_require_their_own_datause_and_return_payloads():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(
            _PLACEHOLDER,
            ["quote", "report", "news", "fundamental", "announcement"],
        ),
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        return_value={"000000": {"name": "Mock", "price": 1.0}},
    ), patch(
        "src.tools.build_registry",
    ) as registry, patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_news",
        return_value=[{"title": "Mock news"}],
    ), patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_info",
        return_value={"code": "000000", "name": "Mock"},
    ), patch(
        "backtest.loaders.astockdata_loader.sina_financial_report",
        return_value=[{"report_period": "2026-03-31"}],
    ), patch(
        "backtest.loaders.astockdata_loader.cninfo_announcements",
        return_value=[{"title": "Mock announcement"}],
    ) as announcements:
        tool = registry.return_value.get.return_value
        tool.execute.return_value = json.dumps({
            "ok": True,
            "source": "eastmoney+ths",
            "data": {"reports": [{"title": "Mock report"}]},
        })

        resp = client.get(
            f"/api/a-stocks/data?code={_PLACEHOLDER}"
            "&include=quote,reports,news,fundamentals,announcements&limit=3"
        )

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is False
    assert payload["data"]["quote"]["ok"] is True
    assert payload["data"]["reports"]["data"]["reports"][0]["title"] == "Mock report"
    assert payload["data"]["news"]["data"][0]["title"] == "Mock news"
    assert payload["data"]["fundamentals"]["source"] == "eastmoney+sina"
    assert payload["data"]["fundamentals"]["data"]["stock_info"]["name"] == "Mock"
    assert (
        payload["data"]["fundamentals"]["data"]["financial_reports"]
        ["income_statement"][0]["report_period"]
    ) == "2026-03-31"
    assert payload["data"]["announcements"]["data"][0]["title"] == "Mock announcement"
    tool.execute.assert_called_once_with(q_type=0, code=_PLACEHOLDER, limit=3)
    announcements.assert_called_once_with(_PLACEHOLDER, page_size=3)


def test_report_only_datause_does_not_allow_quote():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["report"]),
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
    ) as quote:
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=quote")

    assert resp.status_code == 200
    assert resp.json()["data"]["quote"]["error_code"] == "code_not_reviewed"
    quote.assert_not_called()


def test_provider_exception_is_enveloped():
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["quote"]),
    ), patch(
        "backtest.loaders.astockdata_loader.tencent_quote",
        side_effect=RuntimeError("network down"),
    ):
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=quote")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["quote"]["error_code"] == "provider_request_failed"


def test_reports_tool_ok_false_propagates_error():
    """When get_research_reports returns ok:false, the reports family
    must propagate the error payload as-is (not wrap it)."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["report"]),
    ), patch(
        "src.tools.build_registry",
    ) as registry:
        tool = registry.return_value.get.return_value
        tool.execute.return_value = json.dumps({
            "ok": False,
            "error": "no reports found",
            "error_code": "no_data",
        })

        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=reports")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["reports"]["ok"] is False
    assert payload["data"]["reports"]["error"] == "no reports found"
    assert payload["data"]["reports"]["error_code"] == "no_data"
    tool.execute.assert_called_once_with(q_type=0, code=_PLACEHOLDER, limit=10)


def test_reports_tool_exception_is_enveloped():
    """When get_research_reports throws, the reports family must return
    provider_request_failed (not crash)."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["report"]),
    ), patch(
        "src.tools.build_registry",
    ) as registry:
        tool = registry.return_value.get.return_value
        tool.execute.side_effect = RuntimeError("tool crash")

        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=reports")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["reports"]["ok"] is False
    assert payload["data"]["reports"]["error_code"] == "provider_request_failed"
    assert "tool crash" in payload["data"]["reports"]["error"]
    tool.execute.assert_called_once()


def test_reports_tool_unavailable_is_enveloped():
    """When get_research_reports tool is not in registry, the reports
    family must return provider_request_failed."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["report"]),
    ), patch(
        "src.tools.build_registry",
    ) as registry:
        registry.return_value.get.return_value = None  # tool not found

        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=reports")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["reports"]["ok"] is False
    assert payload["data"]["reports"]["error_code"] == "provider_request_failed"
    registry.return_value.get.assert_called_once_with("get_research_reports")


def test_news_unreviewed_datause_does_not_call_provider():
    """Without dataUse 'news', the news family must return code_not_reviewed
    and never call the underlying provider."""
    fetch_news = Mock(return_value=[{"title": "Mock"}])
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["quote"]),
    ), patch(
        "src.api.astockdata_routes._FETCHERS",
        {"news": fetch_news},
    ):
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=news")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["news"]["error_code"] == "code_not_reviewed"
    fetch_news.assert_not_called()


def test_news_empty_result_is_ok():
    """When provider returns an empty list, the news family must still
    report ok: true with an empty data array (not an error)."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["news"]),
    ), patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_news",
        return_value=[],
    ) as provider:
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=news")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is False
    assert payload["data"]["news"]["ok"] is True
    assert payload["data"]["news"]["data"] == []
    provider.assert_called_once()


def test_news_provider_exception_is_enveloped():
    """When eastmoney_stock_news throws, the news family must return
    provider_request_failed."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["news"]),
    ), patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_news",
        side_effect=RuntimeError("connection refused"),
    ):
        resp = client.get(f"/api/a-stocks/data?code={_PLACEHOLDER}&include=news")

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["news"]["ok"] is False
    assert payload["data"]["news"]["error_code"] == "provider_request_failed"


def test_fundamentals_unreviewed_datause_does_not_call_provider():
    """Without dataUse 'fundamental', the fundamentals family must return
    code_not_reviewed and never call either provider."""
    fetch_info = Mock(return_value={"code": "000000", "name": "X"})
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["quote"]),
    ), patch(
        "src.api.astockdata_routes._FETCHERS",
        {"fundamentals": fetch_info},
    ):
        resp = client.get(
            f"/api/a-stocks/data?code={_PLACEHOLDER}&include=fundamentals"
        )

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["fundamentals"]["error_code"] == "code_not_reviewed"
    fetch_info.assert_not_called()


def test_fundamentals_ok_with_valid_data():
    """With dataUse 'fundamental', both stock info and financial reports
    must be included in the response."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["fundamental"]),
    ), patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_info",
        return_value={"code": "000000", "name": "Mock Corp", "mcap": 50000},
    ), patch(
        "backtest.loaders.astockdata_loader.sina_financial_report",
        return_value=[{"report_period": "2026-03-31", "净利润": "100"}],
    ):
        resp = client.get(
            f"/api/a-stocks/data?code={_PLACEHOLDER}&include=fundamentals&limit=5"
        )

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is False
    fund = payload["data"]["fundamentals"]
    assert fund["ok"] is True
    assert fund["source"] == "eastmoney+sina"
    assert fund["data"]["stock_info"]["name"] == "Mock Corp"
    reports = fund["data"]["financial_reports"]
    assert reports["income_statement"][0]["净利润"] == "100"


def test_fundamentals_provider_exception_is_enveloped():
    """When eastmoney_stock_info throws, the fundamentals family must
    return provider_request_failed."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["fundamental"]),
    ), patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_info",
        side_effect=RuntimeError("provider down"),
    ):
        resp = client.get(
            f"/api/a-stocks/data?code={_PLACEHOLDER}&include=fundamentals"
        )

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is True
    assert payload["data"]["fundamentals"]["ok"] is False
    assert payload["data"]["fundamentals"]["error_code"] == "provider_request_failed"


def test_fundamentals_sina_empty_is_ok():
    """When eastmoney_stock_info succeeds but sina_financial_report returns []
    for all three report types, the route must still return ok: true with
    safe empty financial_report arrays (not an error)."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["fundamental"]),
    ), patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_info",
        return_value={"code": "000000", "name": "Mock Corp"},
    ), patch(
        "backtest.loaders.astockdata_loader.sina_financial_report",
        return_value=[],
    ):
        resp = client.get(
            f"/api/a-stocks/data?code={_PLACEHOLDER}&include=fundamentals"
        )

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is False
    fund = payload["data"]["fundamentals"]
    assert fund["ok"] is True
    assert fund["source"] == "eastmoney+sina"
    assert fund["data"]["stock_info"]["name"] == "Mock Corp"
    # sina returned [] for all three report types → all empty arrays
    fr = fund["data"]["financial_reports"]
    assert fr["income_statement"] == []
    assert fr["balance_sheet"] == []
    assert fr["cash_flow"] == []


def test_fundamentals_stock_info_none_is_ok():
    """When eastmoney_stock_info returns None, the route must return
    ok: true with stock_info=None and safe empty financial_reports
    (not provider_request_failed)."""
    with patch(
        "src.api.stock_quote_routes._load_manifest",
        return_value=_manifest_for(_PLACEHOLDER, ["fundamental"]),
    ), patch(
        "backtest.loaders.astockdata_loader.eastmoney_stock_info",
        return_value=None,
    ), patch(
        "backtest.loaders.astockdata_loader.sina_financial_report",
        return_value=[],
    ):
        resp = client.get(
            f"/api/a-stocks/data?code={_PLACEHOLDER}&include=fundamentals"
        )

    payload = resp.json()
    assert resp.status_code == 200
    assert payload["partial"] is False
    fund = payload["data"]["fundamentals"]
    assert fund["ok"] is True
    assert fund["source"] == "eastmoney+sina"
    assert fund["data"]["stock_info"] is None
    fr = fund["data"]["financial_reports"]
    assert fr["income_statement"] == []
    assert fr["balance_sheet"] == []
    assert fr["cash_flow"] == []
