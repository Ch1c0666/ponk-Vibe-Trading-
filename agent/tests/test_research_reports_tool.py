"""Tests for get_research_reports: success + error envelopes, HTTP mocked.

Eastmoney is mocked at ``get_json`` (imported into the tool module) and THS at
``throttled_get`` (imported as ``research_reports_tool.throttled_get``), so no
test reaches a live endpoint.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import patch

from jsonschema import Draft202012Validator

from backtest.loaders.research_reports import (
    RESEARCH_REPORT_INPUT_SCHEMA,
    RESEARCH_REPORT_OUTPUT_SCHEMA,
)
from src.tools import research_reports_tool as rrt
from src.tools.research_reports_tool import ResearchReportsTool

_REPORT_PAYLOAD = {
    "data": [
        {
            "title": "Q1 beat, raise target",
            "orgSName": "Broker A",
            "researcher": "Analyst One",
            "publishDate": "2024-04-30 08:00:00",
            "infoCode": "ANALYSIS-001",
            "emRatingName": "Buy",
            "predictThisYearEps": "12.34",
            "predictNextYearEps": "15.00",
            "predictThisYearPe": "20.1",
            "predictNextYearPe": "16.5",
        },
        {
            "title": "Margins stable",
            "orgSName": "Broker B",
            "researcher": "Analyst Two",
            "publishDate": "2024-03-15 09:30:00",
            "emRatingName": "Hold",
            "predictThisYearEps": "11.80",
            "predictNextYearEps": "13.20",
            "predictThisYearPe": "21.0",
            "predictNextYearPe": "18.8",
        },
    ]
}

_THS_PAYLOAD = {
    "data": [
        {"year": "2024", "eps": "12.10"},
        {"year": "2025", "eps": "14.50"},
    ]
}


def _fake_response(payload: dict, status_ok: bool = True):
    def raise_for_status() -> None:
        if not status_ok:
            raise RuntimeError("HTTP error")

    return SimpleNamespace(json=lambda: payload, raise_for_status=raise_for_status)


def test_success_envelope_merges_reports_and_consensus():
    with patch.object(rrt, "get_json", return_value=_REPORT_PAYLOAD) as mock_em, patch.object(
        rrt, "throttled_get", return_value=_fake_response(_THS_PAYLOAD)
    ) as mock_ths:
        out = ResearchReportsTool().execute(code="600519.SH", limit=10)

    payload = json.loads(out)
    Draft202012Validator(RESEARCH_REPORT_OUTPUT_SCHEMA).validate(payload)
    assert payload["ok"] is True
    assert payload["market"] == "CN"
    assert payload["source"] == "eastmoney+ths"
    assert payload["data"]["q_type"] == 0
    assert payload["data"]["code"] == "600519.SH"
    assert payload["data"]["partial"] is False
    assert payload["data"]["warnings"] == []

    reports = payload["data"]["reports"]
    assert len(reports) == 2
    assert reports[0] == {
        "title": "Q1 beat, raise target",
        "brokerage": "Broker A",
        "analyst": "Analyst One",
        "publish_date": "2024-04-30",
        "info_code": "ANALYSIS-001",
        "rating": "Buy",
        "eps_forecast": {"this_year": 12.34, "next_year": 15.0},
        "pe_forecast": {"this_year": 20.1, "next_year": 16.5},
    }

    consensus = payload["data"]["consensus_eps"]
    assert consensus == [
        {"fiscal_year": "2024", "consensus_eps": 12.1},
        {"fiscal_year": "2025", "consensus_eps": 14.5},
    ]

    # Eastmoney called with the bare numeric code; THS routed to the ths bucket.
    assert mock_em.call_args.kwargs["params"]["code"] == "600519"
    assert mock_em.call_args.kwargs["params"]["qType"] == "0"
    assert mock_ths.call_args.kwargs["host_key"] == "ths"
    assert mock_ths.call_args.kwargs["params"]["code"] == "600519"


def test_limit_caps_returned_reports():
    with patch.object(rrt, "get_json", return_value=_REPORT_PAYLOAD), patch.object(
        rrt, "throttled_get", return_value=_fake_response(_THS_PAYLOAD)
    ):
        out = ResearchReportsTool().execute(code="600519.SH", limit=1)
    payload = json.loads(out)
    assert len(payload["data"]["reports"]) == 1


def test_ths_failure_degrades_consensus_but_keeps_reports():
    with patch.object(rrt, "get_json", return_value=_REPORT_PAYLOAD), patch.object(
        rrt, "throttled_get", side_effect=RuntimeError("ths 503")
    ):
        out = ResearchReportsTool().execute(code="600519.SH")
    payload = json.loads(out)
    assert payload["ok"] is True
    assert len(payload["data"]["reports"]) == 2
    assert payload["data"]["consensus_eps"] == []


def test_ths_non_2xx_degrades_consensus():
    with patch.object(rrt, "get_json", return_value=_REPORT_PAYLOAD), patch.object(
        rrt, "throttled_get", return_value=_fake_response(_THS_PAYLOAD, status_ok=False)
    ):
        out = ResearchReportsTool().execute(code="600519.SH")
    payload = json.loads(out)
    assert payload["ok"] is True
    assert payload["data"]["consensus_eps"] == []


def test_non_a_share_returns_error_without_http():
    with patch.object(rrt, "get_json") as mock_em, patch.object(rrt, "throttled_get") as mock_ths:
        out = ResearchReportsTool().execute(code="AAPL.US")
    payload = json.loads(out)
    assert payload["ok"] is False
    assert "A-share" in payload["error"]
    mock_em.assert_not_called()
    mock_ths.assert_not_called()


def test_missing_code_returns_error_envelope():
    out = ResearchReportsTool().execute()
    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error_code"] == "invalid_argument"
    assert payload["details"] == {"q_type": 0, "supported_q_types": [0]}
    assert "required" in payload["error"]


def test_qtype_1_fails_closed_before_symbol_resolution_or_http():
    with patch.object(rrt, "resolve_secid") as mock_resolve, patch.object(
        rrt, "get_json"
    ) as mock_em, patch.object(rrt, "throttled_get") as mock_ths:
        out = ResearchReportsTool().execute(q_type=1)

    payload = json.loads(out)
    assert payload == {
        "ok": False,
        "error": (
            "industry research reports (qType=1) are not implemented; "
            "qType=0 stock reports will not be substituted"
        ),
        "error_code": "industry_reports_not_implemented",
        "details": {"q_type": 1, "supported_q_types": [0]},
    }
    mock_resolve.assert_not_called()
    mock_em.assert_not_called()
    mock_ths.assert_not_called()


def test_qtype_1_never_uses_supplied_stock_code_as_fallback():
    with patch.object(rrt, "resolve_secid") as mock_resolve, patch.object(
        rrt, "get_json"
    ) as mock_em, patch.object(rrt, "throttled_get") as mock_ths:
        out = ResearchReportsTool().execute(
            q_type=1,
            code="600519.SH",
            limit=10,
        )

    payload = json.loads(out)
    assert payload["error_code"] == "industry_reports_not_implemented"
    mock_resolve.assert_not_called()
    mock_em.assert_not_called()
    mock_ths.assert_not_called()


def test_invalid_qtype_is_rejected_without_http():
    with patch.object(rrt, "resolve_secid") as mock_resolve, patch.object(
        rrt, "get_json"
    ) as mock_em, patch.object(rrt, "throttled_get") as mock_ths:
        out = ResearchReportsTool().execute(q_type="1", code="600519.SH")

    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error_code"] == "invalid_argument"
    assert payload["details"] == {"q_type": "1", "supported_q_types": [0]}
    mock_resolve.assert_not_called()
    mock_em.assert_not_called()
    mock_ths.assert_not_called()


def test_provider_style_qtype_argument_cannot_fall_back_to_stock_reports():
    with patch.object(rrt, "resolve_secid") as mock_resolve, patch.object(
        rrt, "get_json"
    ) as mock_em, patch.object(rrt, "throttled_get") as mock_ths:
        out = ResearchReportsTool().execute(
            qType=1,
            code="600519.SH",
        )

    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error_code"] == "invalid_argument"
    assert payload["details"] == {"q_type": 1, "supported_q_types": [0]}
    assert "uses 'q_type'" in payload["error"]
    mock_resolve.assert_not_called()
    mock_em.assert_not_called()
    mock_ths.assert_not_called()


def test_invalid_limit_is_rejected_without_http():
    with patch.object(rrt, "get_json") as mock_em, patch.object(
        rrt, "throttled_get"
    ) as mock_ths:
        out = ResearchReportsTool().execute(
            q_type=0,
            code="600519.SH",
            limit=0,
        )

    payload = json.loads(out)
    assert payload["error_code"] == "invalid_argument"
    mock_em.assert_not_called()
    mock_ths.assert_not_called()


def test_tool_exposes_explicit_input_and_output_schemas():
    tool = ResearchReportsTool()
    assert tool.parameters is RESEARCH_REPORT_INPUT_SCHEMA
    assert tool.output_schema is RESEARCH_REPORT_OUTPUT_SCHEMA
    assert tool.parameters["properties"]["q_type"]["enum"] == [0, 1]
    assert tool.parameters["$schema"].endswith("/draft/2020-12/schema")
    assert tool.parameters["allOf"][0]["else"] == {"required": ["code"]}
    assert "q_type=0 requires code" in tool.parameters["description"]
    assert tool.output_schema["oneOf"][0]["properties"]["data"]["properties"][
        "q_type"
    ] == {"const": 0}


def test_later_report_page_failure_returns_partial_success_and_warning():
    first_page = [
        {
            "title": f"Report {index:02d}",
            "publishDate": "2026-07-17",
        }
        for index in range(20)
    ]

    def get_page(_url: str, *, params: dict[str, str]) -> dict:
        if params["pageNo"] == "1":
            return {"data": first_page, "hits": 21}
        raise RuntimeError("offline page 2 failure")

    with patch.object(rrt, "get_json", side_effect=get_page), patch.object(
        rrt,
        "throttled_get",
        side_effect=RuntimeError("offline THS failure"),
    ):
        out = ResearchReportsTool().execute(
            code="600519.SH",
            limit=21,
        )

    payload = json.loads(out)
    Draft202012Validator(RESEARCH_REPORT_OUTPUT_SCHEMA).validate(payload)
    assert payload["ok"] is True
    assert len(payload["data"]["reports"]) == 20
    assert payload["data"]["partial"] is True
    assert payload["data"]["warnings"] == [
        {
            "code": "provider_page_failed",
            "message": (
                "research report page 2 failed: offline page 2 failure"
            ),
            "page": 2,
        }
    ]


def test_report_request_failure_is_caught_as_error_envelope():
    with patch.object(rrt, "get_json", side_effect=RuntimeError("HTTP 429")), patch.object(
        rrt, "throttled_get", return_value=_fake_response(_THS_PAYLOAD)
    ):
        out = ResearchReportsTool().execute(code="600519.SH")
    payload = json.loads(out)
    assert payload["ok"] is False
    assert "429" in payload["error"]


def test_empty_coverage_returns_error_envelope():
    with patch.object(rrt, "get_json", return_value={"data": []}), patch.object(
        rrt, "throttled_get", return_value=_fake_response({"data": []})
    ):
        out = ResearchReportsTool().execute(code="600519.SH")
    payload = json.loads(out)
    assert payload["ok"] is False
    assert "no research coverage" in payload["error"]
