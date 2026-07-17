"""Tests for the MCP ``get_research_reports`` boundary — Python wrapper + real MCP call_tool.

The Python-wrapper tests stop at the registry seam and verify argument forwarding.
The real-MCP tests exercise ``mcp.call_tool()`` through the full FastMCP stack
(coercion, middleware, tool execution) without requiring a server socket or
credentials.  No test reaches a live provider endpoint.

Real-MCP tests need ``asyncio.run()`` which internally creates a
``socket.socketpair()`` for the event-loop wakeup fd.  When ``pytest
--disable-socket`` is active those tests call ``self.skipTest()`` at runtime
(the check must be runtime, not ``@skipUnless``-at-import, because
pytest-socket's fixture activates after module import).
"""

from __future__ import annotations

import asyncio
import json
import socket as _socket
from typing import Any
from unittest import TestCase
from unittest.mock import patch

import mcp_server


def _socket_available() -> bool:
    """Detect whether local sockets are available at test time.

    When ``pytest --disable-socket`` is active, even ``asyncio.run()``
    fails because the event loop creates an internal ``socket.socketpair()``.
    Real-MCP ``call_tool()`` tests must be skipped in that mode — they exercise
    the full FastMCP stack (coercion → middleware → tool) but the async
    machinery needs a working event-loop wakeup fd.
    """
    try:
        a, b = _socket.socketpair()
        a.close()
        b.close()
        return True
    except Exception:
        return False


class _RecordingRegistry:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def execute(self, name: str, params: dict[str, Any]) -> str:
        self.calls.append((name, params))
        return '{"ok": true}'


def _parse_envelope(result: Any) -> dict[str, Any]:
    """Extract the JSON envelope from a FastMCP ToolResult."""
    if hasattr(result, "content") and result.content:
        return json.loads(result.content[0].text)
    if hasattr(result, "structured_content") and result.structured_content:
        sc = result.structured_content
        if isinstance(sc, dict) and "result" in sc:
            return json.loads(sc["result"])
        if isinstance(sc, dict):
            return sc
    raise AssertionError(f"Cannot parse envelope from {type(result).__name__}")


class ResearchReportsMCPForwardingTests(TestCase):
    # -- helpers -----------------------------------------------------------

    def _require_socket(self) -> None:
        """Skip the calling test when local sockets are unavailable.

        Must be called at *runtime* (inside the test body), not via a class-level
        decorator, because ``pytest-socket`` activates its disable fixture after
        module import.
        """
        if not _socket_available():
            self.skipTest("requires local socket (--disable-socket blocks asyncio.run())")

    # -- Python-wrapper tests (registry seam) ------------------------------

    def test_forwards_q_type_zero_code_and_limit(self) -> None:
        registry = _RecordingRegistry()
        with patch.object(mcp_server, "_get_registry", return_value=registry):
            result = mcp_server.get_research_reports(
                code="600519.SH",
                limit=7,
                q_type=0,
            )

        self.assertEqual(result, '{"ok": true}')
        self.assertEqual(
            registry.calls,
            [
                (
                    "get_research_reports",
                    {"q_type": 0, "limit": 7, "code": "600519.SH"},
                )
            ],
        )

    def test_q_type_one_omits_absent_code(self) -> None:
        registry = _RecordingRegistry()
        with patch.object(mcp_server, "_get_registry", return_value=registry):
            result = mcp_server.get_research_reports(q_type=1, limit=13)

        self.assertEqual(result, '{"ok": true}')
        self.assertEqual(
            registry.calls,
            [
                (
                    "get_research_reports",
                    {"q_type": 1, "limit": 13},
                ),
            ],
        )

    # -- Real MCP call_tool tests (full FastMCP stack, no server socket) --

    def test_q_type_one_fails_closed_via_real_call_tool(self) -> None:
        """q_type=1 must return industry_reports_not_implemented via call_tool()."""
        self._require_socket()
        result = asyncio.run(
            mcp_server.mcp.call_tool("get_research_reports", arguments={"q_type": 1})
        )
        envelope = _parse_envelope(result)
        self.assertFalse(envelope["ok"])
        self.assertEqual(
            envelope["error_code"], "industry_reports_not_implemented"
        )
        # Verify no downgrade to q_type=0 stock data — the error explicitly
        # states stock reports will NOT be substituted.
        self.assertIn("not implemented", envelope["error"].lower())
        self.assertIn("will not be substituted", envelope["error"].lower())

    def test_q_type_one_with_code_still_fails_closed(self) -> None:
        """q_type=1 must never resolve a stock symbol or make an HTTP call."""
        self._require_socket()
        result = asyncio.run(
            mcp_server.mcp.call_tool(
                "get_research_reports",
                arguments={"q_type": 1, "code": "600519.SH"},
            )
        )
        envelope = _parse_envelope(result)
        self.assertFalse(envelope["ok"])
        self.assertEqual(
            envelope["error_code"], "industry_reports_not_implemented"
        )

    def test_q_type_zero_missing_code_rejected(self) -> None:
        """q_type=0 without code must be rejected before any HTTP call."""
        self._require_socket()
        result = asyncio.run(
            mcp_server.mcp.call_tool(
                "get_research_reports", arguments={"q_type": 0}
            )
        )
        envelope = _parse_envelope(result)
        self.assertFalse(envelope["ok"])
        self.assertEqual(envelope["error_code"], "invalid_argument")
        self.assertIn("code", envelope["error"].lower())

    def test_q_type_invalid_rejected(self) -> None:
        """q_type=99 must be rejected with invalid_argument."""
        self._require_socket()
        result = asyncio.run(
            mcp_server.mcp.call_tool(
                "get_research_reports", arguments={"q_type": 99}
            )
        )
        envelope = _parse_envelope(result)
        self.assertFalse(envelope["ok"])
        self.assertEqual(envelope["error_code"], "invalid_argument")
        self.assertIn("q_type must be the integer 0 or 1", envelope["error"])

    def test_limit_invalid_rejected(self) -> None:
        """limit=0 must be rejected."""
        self._require_socket()
        result = asyncio.run(
            mcp_server.mcp.call_tool(
                "get_research_reports",
                arguments={"q_type": 0, "code": "600519.SH", "limit": 0},
            )
        )
        envelope = _parse_envelope(result)
        self.assertFalse(envelope["ok"])
        self.assertEqual(envelope["error_code"], "invalid_argument")

    def test_coerced_q_type_one_still_fails_closed(self) -> None:
        """FastMCP coerces string \"1\" to int 1; q_type=1 must still fail
        closed without network."""
        self._require_socket()
        result = asyncio.run(
            mcp_server.mcp.call_tool(
                "get_research_reports", arguments={"q_type": "1"}
            )
        )
        envelope = _parse_envelope(result)
        self.assertFalse(envelope["ok"])
        self.assertEqual(
            envelope["error_code"], "industry_reports_not_implemented"
        )

    def test_success_envelope_structure_via_call_tool(self) -> None:
        """A valid q_type=0 request that reaches the registry returns an ok
        envelope (registry is mocked upstream — no real provider call)."""
        self._require_socket()
        registry = _RecordingRegistry()
        with patch.object(mcp_server, "_get_registry", return_value=registry):
            result = asyncio.run(
                mcp_server.mcp.call_tool(
                    "get_research_reports",
                    arguments={"q_type": 0, "code": "600519.SH", "limit": 10},
                )
            )
        # With a recording registry the tool returns '{"ok": true}' — verify
        # FastMCP wraps it correctly (no ToolError from output_schema mismatch).
        self.assertTrue(hasattr(result, "content"))
        self.assertTrue(len(result.content) > 0)
        envelope = _parse_envelope(result)
        self.assertTrue(envelope["ok"])

    # -- Structural tests: entry point and schema patch --------------------

    def test_module_exports_main_function(self) -> None:
        """``mcp_server:main`` must exist so the console entry point resolves."""
        self.assertTrue(hasattr(mcp_server, "main"))
        self.assertTrue(callable(mcp_server.main))

    def test_console_entry_point_resolves(self) -> None:
        """``vibe-trading-mcp = mcp_server:main`` must be importable."""
        from importlib.metadata import entry_points

        eps = entry_points(group="console_scripts")
        mcp_ep = None
        for ep in eps:
            if ep.name == "vibe-trading-mcp":
                mcp_ep = ep
                break
        self.assertIsNotNone(mcp_ep, "vibe-trading-mcp entry point not found")
        self.assertEqual(mcp_ep.value, "mcp_server:main")
        # Must actually resolve without ImportError / AttributeError.
        resolved = mcp_ep.load()
        self.assertIs(resolved, mcp_server.main)

    def test_patch_research_reports_schema_exists(self) -> None:
        """``_patch_research_reports_schema`` must be importable and callable."""
        self.assertTrue(hasattr(mcp_server, "_patch_research_reports_schema"))
        self.assertTrue(callable(mcp_server._patch_research_reports_schema))


# ---------------------------------------------------------------------------
# get_index_quotes — discovery in build_registry + MCP list_tools
# ---------------------------------------------------------------------------


class IndexQuoteDiscoveryTests(TestCase):
    """Verify that the new ``get_index_quotes`` tool is wired end-to-end."""

    def _require_socket(self) -> None:
        if not _socket_available():
            self.skipTest("requires local socket (--disable-socket blocks asyncio.run())")

    # -- registry seam --------------------------------------------------------

    def test_build_registry_discovers_get_index_quotes(self) -> None:
        from src.tools import build_registry

        registry = build_registry(include_shell_tools=False)
        tool = registry.get("get_index_quotes")
        self.assertIsNotNone(
            tool,
            "get_index_quotes must be discoverable by build_registry()",
        )
        self.assertEqual(tool.name, "get_index_quotes")

    def test_registry_forwarding_accepts_all_four_default(self) -> None:
        """When indices is omitted, the registry call defaults to all 4."""
        registry = _RecordingRegistry()
        with patch.object(mcp_server, "_get_registry", return_value=registry):
            result = mcp_server.get_index_quotes()

        self.assertEqual(len(registry.calls), 1)
        name, params = registry.calls[0]
        self.assertEqual(name, "get_index_quotes")
        self.assertEqual(params, {})

    def test_registry_forwarding_accepts_explicit_subset(self) -> None:
        registry = _RecordingRegistry()
        with patch.object(mcp_server, "_get_registry", return_value=registry):
            mcp_server.get_index_quotes(indices=["sh000001", "sz399006"])

        _, params = registry.calls[0]
        self.assertEqual(params, {"indices": ["sh000001", "sz399006"]})

    # -- MCP tool listing (real FastMCP stack, no socket) --------------------

    def test_mcp_tool_list_contains_get_index_quotes(self) -> None:
        self._require_socket()

        async def _list() -> list:
            tools = await mcp_server.mcp.list_tools()
            return [t.name for t in tools]

        tool_names = asyncio.run(_list())
        self.assertIn("get_index_quotes", tool_names)

    def test_mcp_call_tool_all_four_indices_returns_json_envelope(self) -> None:
        """Smoke test through the real FastMCP stack (mocked provider)."""
        self._require_socket()

        raw = {
            "000001": {
                "name": "上证综指",
                "price": 3500.0,
                "prev_close": 3480.0,
                "open": 3475.0,
                "high": 3510.0,
                "low": 3460.0,
                "change_pct": 0.57,
            },
            "399001": {
                "name": "深证成指",
                "price": 10800.0,
                "prev_close": 10750.0,
                "open": 10760.0,
                "high": 10850.0,
                "low": 10700.0,
                "change_pct": -0.15,
            },
            "399006": {
                "name": "创业板指",
                "price": 2150.0,
                "prev_close": 2130.0,
                "open": 2135.0,
                "high": 2160.0,
                "low": 2120.0,
                "change_pct": 1.20,
            },
            "000688": {
                "name": "科创50",
                "price": 980.0,
                "prev_close": 985.0,
                "open": 983.0,
                "high": 990.0,
                "low": 975.0,
                "change_pct": -0.80,
            },
        }

        with patch(
            "src.tools.index_quote_tool.tencent_quote",
            return_value=raw,
        ):
            result = asyncio.run(
                mcp_server.mcp.call_tool(
                    "get_index_quotes",
                    arguments={"indices": ["sh000001", "sz399001", "sz399006", "sh000688"]},
                )
            )

        payload = _parse_envelope(result)
        self.assertTrue(payload["ok"], f"Expected ok=true, got {payload}")
        self.assertEqual(payload["source"], "tencent")
        self.assertEqual(len(payload["data"]["quotes"]), 4)
        self.assertFalse(payload["data"]["partial"])

    def test_get_index_quotes_function_is_importable(self) -> None:
        """The MCP wrapper function must exist on the module."""
        self.assertTrue(
            hasattr(mcp_server, "get_index_quotes"),
            "mcp_server.get_index_quotes must be defined",
        )
        self.assertTrue(callable(mcp_server.get_index_quotes))
