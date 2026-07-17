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
