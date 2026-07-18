"""Unittest-based offline regression tests for astockdata report contracts.

Run with a scrubbed environment so these tests cannot inherit model keys:

    env -i PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=agent \
      /path/to/python3.11 -m unittest discover -s agent/tests \
      -p 'test_astockdata_contract.py' -v

Every external HTTP boundary is mocked. A socket guard fails any accidental
network connection attempt.
"""

from __future__ import annotations

import json
import socket
import unittest
import requests
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from jsonschema import Draft202012Validator

from backtest.loaders import astockdata_loader
from backtest.loaders import registry as loader_registry
from backtest.loaders.research_reports import (
    RESEARCH_REPORT_INPUT_SCHEMA,
    RESEARCH_REPORT_OUTPUT_SCHEMA,
    STOCK_REPORT_INPUT_SCHEMA,
    STOCK_REPORT_OUTPUT_SCHEMA,
    fetch_stock_reports,
    normalize_stock_report,
)
from src.tools import research_reports_tool as rrt
from src.tools.research_reports_tool import ResearchReportsTool


_REPORT_ROW = {
    "title": "Coverage update",
    "orgSName": "Broker A",
    "researcher": "Analyst One",
    "publishDate": "2026-07-16 08:00:00",
    "infoCode": "INFO-001",
    "emRatingName": "Buy",
    "predictThisYearEps": "1.25",
    "predictNextYearEps": "1.50",
    "predictThisYearPe": "18.0",
    "predictNextYearPe": "15.0",
}


def _fake_ths_response() -> SimpleNamespace:
    return SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {"data": [{"year": "2027", "eps": "1.42"}]},
    )


class _UnavailableAstockdata:
    name = "astockdata"
    markets = {"a_share"}
    requires_auth = False

    def is_available(self) -> bool:
        return False


class _AvailableFallback:
    name = "offline_fallback"
    markets = {"a_share"}
    requires_auth = False

    def is_available(self) -> bool:
        return True


class AstockdataOfflineContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self._connect_guard = patch.object(
            socket.socket,
            "connect",
            side_effect=AssertionError("offline test attempted a socket connection"),
        )
        self._connect_ex_guard = patch.object(
            socket.socket,
            "connect_ex",
            side_effect=AssertionError("offline test attempted a socket connection"),
        )
        self._connect_guard.start()
        self._connect_ex_guard.start()
        self.addCleanup(self._connect_guard.stop)
        self.addCleanup(self._connect_ex_guard.stop)

    def test_qtype_0_success_matches_the_declared_contract(self) -> None:
        with patch.object(
            rrt,
            "resolve_secid",
            return_value="1.600519",
        ), patch.object(
            rrt,
            "get_json",
            return_value={"data": [_REPORT_ROW], "hits": 1},
        ) as eastmoney, patch.object(
            rrt,
            "throttled_get",
            return_value=_fake_ths_response(),
        ) as ths:
            raw = ResearchReportsTool().execute(
                q_type=0,
                code="600519.sh",
                limit=10,
            )

        envelope = json.loads(raw)
        Draft202012Validator(
            RESEARCH_REPORT_OUTPUT_SCHEMA
        ).validate(envelope)
        self.assertEqual(
            set(envelope),
            {"ok", "market", "source", "data"},
        )
        self.assertTrue(envelope["ok"])
        self.assertEqual(envelope["market"], "CN")
        self.assertEqual(envelope["source"], "eastmoney+ths")
        self.assertEqual(envelope["data"]["q_type"], 0)
        self.assertEqual(envelope["data"]["code"], "600519.SH")
        self.assertFalse(envelope["data"]["partial"])
        self.assertEqual(envelope["data"]["warnings"], [])
        self.assertEqual(
            envelope["data"]["reports"][0],
            {
                "title": "Coverage update",
                "brokerage": "Broker A",
                "analyst": "Analyst One",
                "publish_date": "2026-07-16",
                "info_code": "INFO-001",
                "rating": "Buy",
                "eps_forecast": {
                    "this_year": 1.25,
                    "next_year": 1.5,
                },
                "pe_forecast": {
                    "this_year": 18.0,
                    "next_year": 15.0,
                },
            },
        )
        self.assertEqual(
            envelope["data"]["consensus_eps"],
            [{"fiscal_year": "2027", "consensus_eps": 1.42}],
        )

        params = eastmoney.call_args.kwargs["params"]
        self.assertEqual(params["qType"], "0")
        self.assertEqual(params["code"], "600519")
        self.assertEqual(params["fields"], "all")
        self.assertEqual(ths.call_args.kwargs["params"]["code"], "600519")

    def test_qtype_1_fails_closed_without_resolution_or_network(self) -> None:
        with patch.object(rrt, "resolve_secid") as resolve, patch.object(
            rrt,
            "get_json",
        ) as eastmoney, patch.object(rrt, "throttled_get") as ths:
            raw = ResearchReportsTool().execute(
                q_type=1,
                code="600519.SH",
                limit=10,
            )

        envelope = json.loads(raw)
        Draft202012Validator(
            RESEARCH_REPORT_OUTPUT_SCHEMA
        ).validate(envelope)
        self.assertEqual(
            envelope,
            {
                "ok": False,
                "error": (
                    "industry research reports (qType=1) are not implemented; "
                    "qType=0 stock reports will not be substituted"
                ),
                "error_code": "industry_reports_not_implemented",
                "details": {"q_type": 1, "supported_q_types": [0]},
            },
        )
        resolve.assert_not_called()
        eastmoney.assert_not_called()
        ths.assert_not_called()

    def test_invalid_qtype_is_rejected_without_network(self) -> None:
        with patch.object(rrt, "resolve_secid") as resolve, patch.object(
            rrt,
            "get_json",
        ) as eastmoney, patch.object(rrt, "throttled_get") as ths:
            for invalid in ("1", True, 2, None):
                with self.subTest(q_type=invalid):
                    raw = ResearchReportsTool().execute(
                        q_type=invalid,
                        code="600519.SH",
                    )
                    envelope = json.loads(raw)
                    self.assertFalse(envelope["ok"])
                    self.assertEqual(
                        envelope["error_code"],
                        "invalid_argument",
                    )
                    self.assertEqual(
                        envelope["details"],
                        {"q_type": invalid, "supported_q_types": [0]},
                    )
        resolve.assert_not_called()
        eastmoney.assert_not_called()
        ths.assert_not_called()

    def test_provider_style_qtype_cannot_silently_become_qtype_0(self) -> None:
        with patch.object(rrt, "resolve_secid") as resolve, patch.object(
            rrt,
            "get_json",
        ) as eastmoney, patch.object(rrt, "throttled_get") as ths:
            raw = ResearchReportsTool().execute(
                qType=1,
                code="600519.SH",
            )

        envelope = json.loads(raw)
        self.assertFalse(envelope["ok"])
        self.assertEqual(envelope["error_code"], "invalid_argument")
        self.assertEqual(
            envelope["details"],
            {"q_type": 1, "supported_q_types": [0]},
        )
        self.assertIn("uses 'q_type'", envelope["error"])
        resolve.assert_not_called()
        eastmoney.assert_not_called()
        ths.assert_not_called()

    def test_qtype_0_missing_code_is_rejected_without_network(self) -> None:
        with patch.object(rrt, "resolve_secid") as resolve, patch.object(
            rrt,
            "get_json",
        ) as eastmoney, patch.object(rrt, "throttled_get") as ths:
            raw = ResearchReportsTool().execute(q_type=0)

        envelope = json.loads(raw)
        self.assertEqual(
            set(envelope),
            {"ok", "error", "error_code", "details"},
        )
        self.assertEqual(envelope["error_code"], "invalid_argument")
        self.assertEqual(
            envelope["details"],
            {"q_type": 0, "supported_q_types": [0]},
        )
        resolve.assert_not_called()
        eastmoney.assert_not_called()
        ths.assert_not_called()

    def test_qtype_0_invalid_limit_is_rejected_without_http(self) -> None:
        with patch.object(
            rrt,
            "resolve_secid",
            return_value="1.600519",
        ), patch.object(rrt, "get_json") as eastmoney, patch.object(
            rrt,
            "throttled_get",
        ) as ths:
            raw = ResearchReportsTool().execute(
                q_type=0,
                code="600519.SH",
                limit=0,
            )

        envelope = json.loads(raw)
        self.assertEqual(envelope["error_code"], "invalid_argument")
        eastmoney.assert_not_called()
        ths.assert_not_called()

    def test_shared_provider_only_requests_qtype_0(self) -> None:
        calls: list[dict[str, str]] = []

        def fake_get_page(_url: str, *, params: dict[str, str]) -> dict:
            calls.append(params)
            return {"data": [_REPORT_ROW], "hits": 1}

        result = fetch_stock_reports(
            "600519.SH",
            limit=20,
            get_page=fake_get_page,
        )

        reports = result["reports"]
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0]["info_code"], "INFO-001")
        self.assertFalse(result["partial"])
        self.assertEqual(result["warnings"], [])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["qType"], "0")

    def test_shared_provider_paginates_and_truncates_to_limit(self) -> None:
        calls: list[dict[str, str]] = []
        rows = [
            {
                "title": f"Report {index:02d}",
                "publishDate": "2026-07-17",
                "infoCode": f"INFO-{index:02d}",
            }
            for index in range(25)
        ]

        def fake_get_page(_url: str, *, params: dict[str, str]) -> dict:
            calls.append(params)
            page_no = int(params["pageNo"])
            start = (page_no - 1) * 20
            return {"data": rows[start : start + 20], "hits": 25}

        result = fetch_stock_reports(
            "600519",
            limit=23,
            get_page=fake_get_page,
        )

        reports = result["reports"]
        self.assertEqual([call["pageNo"] for call in calls], ["1", "2"])
        self.assertTrue(all(call["pageSize"] == "20" for call in calls))
        self.assertEqual(len(reports), 23)
        self.assertEqual(reports[-1]["info_code"], "INFO-22")
        self.assertFalse(result["partial"])

    def test_shared_provider_keeps_prior_pages_when_later_page_fails(self) -> None:
        first_page = [
            {
                "title": f"Report {index:02d}",
                "publishDate": "2026-07-17",
            }
            for index in range(20)
        ]

        def fake_get_page(_url: str, *, params: dict[str, str]) -> dict:
            if params["pageNo"] == "1":
                return {"data": first_page, "hits": 21}
            raise RuntimeError("offline page 2 failure")

        result = fetch_stock_reports(
            "600519",
            limit=21,
            get_page=fake_get_page,
        )

        self.assertEqual(len(result["reports"]), 20)
        self.assertTrue(result["partial"])
        self.assertEqual(
            result["warnings"],
            [
                {
                    "code": "provider_page_failed",
                    "message": (
                        "research report page 2 failed: "
                        "offline page 2 failure"
                    ),
                    "page": 2,
                }
            ],
        )

    def test_shared_provider_propagates_first_page_failure(self) -> None:
        def fake_get_page(_url: str, *, params: dict[str, str]) -> dict:
            raise RuntimeError(
                f"offline page {params['pageNo']} failure"
            )

        with self.assertRaisesRegex(RuntimeError, "page 1 failure"):
            fetch_stock_reports(
                "600519",
                limit=21,
                get_page=fake_get_page,
            )

    def test_shared_provider_rejects_invalid_first_page_payload(self) -> None:
        with self.assertRaisesRegex(
            ValueError,
            "missing a list-valued 'data' field",
        ):
            fetch_stock_reports(
                "600519",
                limit=21,
                get_page=lambda *_args, **_kwargs: {
                    "error": "provider returned an error envelope",
                },
            )

    def test_shared_provider_marks_invalid_later_page_payload_partial(
        self,
    ) -> None:
        first_page = [
            {
                "title": f"Report {index:02d}",
                "publishDate": "2026-07-17",
            }
            for index in range(20)
        ]

        def fake_get_page(_url: str, *, params: dict[str, str]) -> dict:
            if params["pageNo"] == "1":
                return {"data": first_page, "hits": 21}
            return {"error": "provider returned an error envelope"}

        result = fetch_stock_reports(
            "600519",
            limit=21,
            get_page=fake_get_page,
        )

        self.assertEqual(len(result["reports"]), 20)
        self.assertTrue(result["partial"])
        self.assertEqual(
            result["warnings"],
            [
                {
                    "code": "provider_page_failed",
                    "message": (
                        "research report page 2 failed: research report "
                        "provider response is missing a list-valued 'data' field"
                    ),
                    "page": 2,
                }
            ],
        )

    def test_standardized_provider_limit_is_strict(self) -> None:
        for invalid in ("20", True, 0, 51, None):
            with self.subTest(limit=invalid), self.assertRaisesRegex(
                ValueError,
                "limit must be an integer",
            ):
                fetch_stock_reports(
                    "600519",
                    limit=invalid,  # type: ignore[arg-type]
                    get_page=lambda *_args, **_kwargs: {
                        "data": [],
                    },
                )

    def test_normalizer_keeps_output_inside_the_declared_schema(self) -> None:
        report = normalize_stock_report(
            {
                "title": "Malformed provider cells",
                "publishDate": "not-a-date",
                "predictThisYearEps": "NaN",
                "predictNextYearPe": "Infinity",
            }
        )

        self.assertIsNotNone(report)
        assert report is not None
        self.assertIsNone(report["publish_date"])
        self.assertIsNone(report["eps_forecast"]["this_year"])
        self.assertIsNone(report["pe_forecast"]["next_year"])

    def test_astockdata_wrapper_preserves_raw_rows_and_legacy_parameters(
        self,
    ) -> None:
        expected = [_REPORT_ROW.copy()]
        with patch.object(
            astockdata_loader,
            "fetch_raw_stock_report_pages",
            return_value={
                "rows": expected,
                "partial": False,
                "warnings": [],
            },
        ) as shared_fetch:
            actual = astockdata_loader.eastmoney_reports(
                "600519.SH",
                max_pages="99",  # type: ignore[arg-type]
            )

        self.assertIs(actual, expected)
        self.assertIn("publishDate", actual[0])
        self.assertIn("orgSName", actual[0])
        self.assertNotIn("publish_date", actual[0])

        call = shared_fetch.call_args
        self.assertEqual(call.args, ("600519.SH",))
        # max_pages is passed through without clamping (matches a0d64d4 baseline
        # behaviour); the int() coercion converts "99" → 99.
        self.assertEqual(call.kwargs["max_pages"], 99)
        legacy_params = call.kwargs["build_params"](
            "600519.SH",
            page_no=2,
            page_size=20,
        )
        self.assertEqual(
            {
                key: legacy_params[key]
                for key in (
                    "code",
                    "cb",
                    "pageSize",
                    "pageNo",
                    "fields",
                    "qType",
                    "beginTime",
                    "endTime",
                )
            },
            {
                "code": "600519.SH",
                "cb": "jQuery",
                "pageSize": "20",
                "pageNo": "2",
                "fields": "all",
                "qType": "0",
                "beginTime": "2024-01-01",
                "endTime": "",
            },
        )
        self.assertTrue(legacy_params["_"].isdigit())

    def test_astockdata_wrapper_keeps_prior_raw_pages_on_partial_result(
        self,
    ) -> None:
        expected = [_REPORT_ROW.copy()]
        with patch.object(
            astockdata_loader,
            "fetch_raw_stock_report_pages",
            return_value={
                "rows": expected,
                "partial": True,
                "warnings": [
                    {
                        "code": "provider_page_failed",
                        "message": "research report page 2 failed: offline",
                        "page": 2,
                    }
                ],
            },
        ):
            actual = astockdata_loader.eastmoney_reports(
                "600519",
                max_pages="2",  # type: ignore[arg-type]
            )

        self.assertIs(actual, expected)

    def test_astockdata_wrapper_decodes_historical_jsonp_without_normalizing(
        self,
    ) -> None:
        response = SimpleNamespace(
            text=f"jQuery({json.dumps({'data': [_REPORT_ROW], 'hits': 1})})"
        )
        with patch.object(
            astockdata_loader,
            "em_get",
            return_value=response,
        ) as em_get:
            actual = astockdata_loader.eastmoney_reports(
                "600519",
                max_pages="2",  # type: ignore[arg-type]
            )

        self.assertEqual(actual, [_REPORT_ROW])
        params = em_get.call_args.kwargs["params"]
        self.assertEqual(params["code"], "600519")
        self.assertEqual(params["qType"], "0")
        self.assertEqual(params["cb"], "jQuery")
        self.assertEqual(em_get.call_args.kwargs["timeout"], 15)

    def test_astockdata_wrapper_invalid_page_count_stays_empty(self) -> None:
        with patch.object(
            astockdata_loader,
            "fetch_raw_stock_report_pages",
        ) as shared_fetch:
            self.assertEqual(
                astockdata_loader.eastmoney_reports(
                    "600519",
                    max_pages="invalid",  # type: ignore[arg-type]
                ),
                [],
            )
            self.assertEqual(
                astockdata_loader.eastmoney_reports(
                    "600519",
                    max_pages=0,
                ),
                [],
            )
        shared_fetch.assert_not_called()

    def test_astockdata_qtype_1_placeholder_never_delegates(self) -> None:
        with patch.object(
            astockdata_loader,
            "fetch_raw_stock_report_pages",
        ) as shared_fetch:
            envelope = astockdata_loader.eastmoney_industry_reports(
                industry="机器人",
                limit=20,
            )

        self.assertEqual(
            envelope["error_code"],
            "industry_reports_not_implemented",
        )
        self.assertEqual(envelope["details"]["q_type"], 1)
        shared_fetch.assert_not_called()

    def test_sina_financial_report_parses_report_list_shape(self) -> None:
        response = SimpleNamespace(
            json=lambda: {
                "result": {
                    "data": {
                        "report_list": {
                            "20260331": {
                                "data": [
                                    {
                                        "item_title": "净利润",
                                        "item_value": "123.45",
                                        "item_tongbi": "12.3%",
                                    },
                                    {
                                        "item_title": "营业收入",
                                        "item_value": "456.78",
                                        "item_tongbi": "",
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        )

        with patch.object(
            astockdata_loader.requests,
            "get",
            return_value=response,
        ) as get:
            rows = astockdata_loader.sina_financial_report(
                "000000.SH",
                "lrb",
                num=1,
            )

        self.assertEqual(
            rows,
            [{
                "report_period": "2026-03-31",
                "净利润": "123.45",
                "净利润_yoy": "12.3%",
                "营业收入": "456.78",
            }],
        )
        self.assertEqual(
            get.call_args.kwargs["params"]["paperCode"],
            "sz000000",
        )
        self.assertEqual(get.call_args.kwargs["params"]["source"], "lrb")

    def test_cninfo_announcements_parses_rows_with_dynamic_orgid(self) -> None:
        org_response = SimpleNamespace(
            json=lambda: {
                "stockList": [{"code": "000000", "orgId": "gssz000000"}],
            },
        )
        announcement_response = SimpleNamespace(
            json=lambda: {
                "announcements": [{
                    "announcementTitle": "Mock announcement",
                    "announcementTypeName": "临时公告",
                    "announcementTime": 1784505600000,
                    "announcementId": "ANN-001",
                }],
            },
        )

        with patch.object(astockdata_loader, "_CNINFO_ORGID_MAP", None), patch.object(
            astockdata_loader.requests,
            "get",
            return_value=org_response,
        ), patch.object(
            astockdata_loader.requests,
            "post",
            return_value=announcement_response,
        ) as post:
            rows = astockdata_loader.cninfo_announcements(
                "000000.SH",
                page_size=3,
            )

        self.assertEqual(
            rows,
            [{
                "title": "Mock announcement",
                "type": "临时公告",
                "date": "2026-07-20",
                "url": "https://www.cninfo.com.cn/new/disclosure/detail?annoId=ANN-001",
            }],
        )
        self.assertEqual(
            post.call_args.kwargs["data"]["stock"],
            "000000,gssz000000",
        )
        self.assertEqual(post.call_args.kwargs["data"]["pageSize"], "3")

    # -- news contract --------------------------------------------------------

    def test_eastmoney_stock_news_parses_valid_jsonp(self) -> None:
        """Valid JSONP response must parse into list of dicts with expected fields."""
        response = SimpleNamespace(
            text='jQuery_news({"result":{"cmsArticleWebOld":['
                 '{"title":"News <b>Title</b>","content":"<p>Body</p> extra",'
                 '"date":"2026-07-18","mediaName":"Source A","url":"http://x"}]}})',
        )
        with patch.object(
            astockdata_loader, "em_get", return_value=response,
        ) as get:
            rows = astockdata_loader.eastmoney_stock_news("000000.SH", page_size=3)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "News Title")
        self.assertEqual(rows[0]["content"], "Body extra")
        self.assertEqual(rows[0]["time"], "2026-07-18")
        self.assertEqual(rows[0]["source"], "Source A")
        self.assertEqual(rows[0]["url"], "http://x")
        get.assert_called_once()

    def test_eastmoney_stock_news_malformed_jsonp_returns_empty(self) -> None:
        """Malformed JSONP (no parens) must return [] without exception."""
        response = SimpleNamespace(text="not_jsonp_at_all")
        with patch.object(
            astockdata_loader, "em_get", return_value=response,
        ):
            rows = astockdata_loader.eastmoney_stock_news("000000.SH")
        self.assertEqual(rows, [])

    def test_eastmoney_stock_news_http_error_returns_empty(self) -> None:
        """HTTP error from em_get must return [] without exception."""
        with patch.object(
            astockdata_loader, "em_get",
            side_effect=requests.exceptions.ConnectionError("down"),
        ):
            rows = astockdata_loader.eastmoney_stock_news("000000.SH")
        self.assertEqual(rows, [])

    # -- fundamentals contract ------------------------------------------------

    def test_eastmoney_stock_info_parses_all_fields(self) -> None:
        """Valid response must parse code, name, industry, shares, mcap, list_date."""
        response = SimpleNamespace(
            json=lambda: {
                "data": {
                    "f57": "000000", "f58": "Mock Corp", "f100": "Technology",
                    "f73": 1000, "f74": 500, "f116": 50000,
                    "f117": 25000, "f300": "20200101", "f170": 10.5,
                },
            },
        )
        with patch.object(
            astockdata_loader, "em_get", return_value=response,
        ):
            info = astockdata_loader.eastmoney_stock_info("000000.SH")

        self.assertIsNotNone(info)
        self.assertEqual(info["code"], "000000")
        self.assertEqual(info["name"], "Mock Corp")
        self.assertEqual(info["industry"], "Technology")
        self.assertEqual(info["total_shares"], 1000)
        self.assertEqual(info["mcap"], 50000)
        self.assertEqual(info["price"], 10.5)

    def test_eastmoney_stock_info_http_error_returns_none(self) -> None:
        """HTTP error from em_get must return None without exception."""
        with patch.object(
            astockdata_loader, "em_get",
            side_effect=requests.exceptions.Timeout("timeout"),
        ):
            info = astockdata_loader.eastmoney_stock_info("000000.SH")
        self.assertIsNone(info)

    def test_sina_financial_report_invalid_type_returns_empty(self) -> None:
        """An unsupported report_type must return [] without calling the network."""
        with patch.object(
            astockdata_loader.requests, "get",
        ) as get:
            rows = astockdata_loader.sina_financial_report(
                "000000.SH", "invalid", num=4,
            )
        self.assertEqual(rows, [])
        get.assert_not_called()

    def test_sina_financial_report_num_is_bounded(self) -> None:
        """num is clamped to [1, 20]; out-of-range values must be safe."""
        response = SimpleNamespace(
            json=lambda: {
                "result": {"data": {"report_list": {}}},
            },
        )
        with patch.object(
            astockdata_loader.requests, "get", return_value=response,
        ) as get:
            # num=0 → clamped to 1
            astockdata_loader.sina_financial_report("000000.SH", "lrb", num=0)
            self.assertEqual(get.call_args.kwargs["params"]["num"], "1")
            # num=100 → clamped to 20
            astockdata_loader.sina_financial_report("000000.SH", "fzb", num=100)
            self.assertEqual(get.call_args.kwargs["params"]["num"], "20")

    # -- registry -------------------------------------------------------------

    def test_registry_contains_astockdata_in_reviewed_order(self) -> None:
        self.assertIn("astockdata", loader_registry.VALID_SOURCES)
        self.assertEqual(
            loader_registry.FALLBACK_CHAINS["a_share"][:3],
            ["tencent", "astockdata", "mootdx"],
        )
        self.assertIs(
            loader_registry.LOADER_REGISTRY["astockdata"],
            astockdata_loader.DataLoader,
        )

    def test_unavailable_astockdata_falls_through_offline(self) -> None:
        with patch.object(
            loader_registry,
            "_ensure_registered",
        ), patch.dict(
            loader_registry.LOADER_REGISTRY,
            {
                "astockdata": _UnavailableAstockdata,
                "offline_fallback": _AvailableFallback,
            },
            clear=True,
        ), patch.dict(
            loader_registry.FALLBACK_CHAINS,
            {"a_share": ["astockdata", "offline_fallback"]},
        ):
            selected = loader_registry.get_loader_cls_with_fallback(
                "astockdata"
            )

        self.assertIs(selected, _AvailableFallback)

    def test_json_schemas_expose_qtype_0_and_fail_closed_error(self) -> None:
        Draft202012Validator.check_schema(RESEARCH_REPORT_INPUT_SCHEMA)
        Draft202012Validator.check_schema(RESEARCH_REPORT_OUTPUT_SCHEMA)
        self.assertEqual(STOCK_REPORT_INPUT_SCHEMA["required"], ["code"])
        self.assertEqual(
            STOCK_REPORT_INPUT_SCHEMA["properties"]["q_type"]["enum"],
            [0],
        )
        self.assertEqual(
            STOCK_REPORT_INPUT_SCHEMA["properties"]["limit"]["minimum"],
            1,
        )
        self.assertEqual(
            STOCK_REPORT_INPUT_SCHEMA["properties"]["limit"]["maximum"],
            50,
        )

        q_type_schema = RESEARCH_REPORT_INPUT_SCHEMA["properties"]["q_type"]
        self.assertEqual(q_type_schema["enum"], [0, 1])
        self.assertEqual(q_type_schema["default"], 0)
        validator = Draft202012Validator(RESEARCH_REPORT_INPUT_SCHEMA)
        self.assertFalse(list(validator.iter_errors(
            {"code": "600519.SH"}
        )))
        self.assertFalse(list(validator.iter_errors(
            {"q_type": 0, "code": "600519.SH"}
        )))
        self.assertFalse(list(validator.iter_errors({"q_type": 1})))
        self.assertTrue(list(validator.iter_errors({})))
        self.assertTrue(list(validator.iter_errors({"q_type": 0})))
        self.assertIn(
            "q_type=0 requires code",
            RESEARCH_REPORT_INPUT_SCHEMA["description"],
        )

        success = STOCK_REPORT_OUTPUT_SCHEMA
        self.assertIs(RESEARCH_REPORT_OUTPUT_SCHEMA["oneOf"][0], success)
        data_schema = success["properties"]["data"]
        self.assertEqual(
            data_schema["properties"]["q_type"],
            {"const": 0},
        )
        self.assertIn("info_code", data_schema["properties"]["reports"][
            "items"
        ]["required"])
        self.assertIn("partial", data_schema["required"])
        self.assertIn("warnings", data_schema["required"])

        error = RESEARCH_REPORT_OUTPUT_SCHEMA["oneOf"][1]
        self.assertEqual(
            error["required"],
            ["ok", "error", "error_code", "details"],
        )

    def test_skill_describes_repository_capabilities_only(self) -> None:
        skill_path = (
            Path(__file__).parents[1]
            / "src"
            / "skills"
            / "astockdata"
            / "SKILL.md"
        )
        skill = skill_path.read_text(encoding="utf-8")
        self.assertNotIn("43 个端点", skill)
        self.assertNotIn("~/.claude/skills", skill)
        self.assertIn("qType=1", skill)
        self.assertIn("industry_reports_not_implemented", skill)
        self.assertIn("partial", skill)
        self.assertIn("东财原始字段", skill)


if __name__ == "__main__":
    unittest.main()
