"""Loader registry with market-level fallback chains.

Loaders self-register via the ``@register`` decorator when their module is
first imported.  The ``_ensure_registered()`` helper lazily imports every
known loader module so that callers of ``resolve_loader`` /
``get_loader_cls_with_fallback`` never see an empty registry — regardless
of import order.
"""

from __future__ import annotations

import logging
import sys
from typing import Any, Type

from backtest.loaders.base import NoAvailableSourceError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global registry: source_name -> loader class
# ---------------------------------------------------------------------------

LOADER_REGISTRY: dict[str, Type[Any]] = {}

_registered = False

# ``import_module()`` does not execute a module's decorators a second time when
# the module is already present in ``sys.modules``.  Keeping the class attribute
# next to each module lets ``_ensure_registered()`` repair a cleared or partially
# restored registry without reloading modules (which would have much broader
# process-global side effects).
_LOADER_SPECS: tuple[tuple[str, str, str], ...] = (
    ("tushare", "backtest.loaders.tushare", "DataLoader"),
    ("okx", "backtest.loaders.okx", "DataLoader"),
    ("yfinance", "backtest.loaders.yfinance_loader", "DataLoader"),
    ("akshare", "backtest.loaders.akshare_loader", "DataLoader"),
    ("baostock", "backtest.loaders.baostock_loader", "DataLoader"),
    ("tencent", "backtest.loaders.tencent_loader", "DataLoader"),
    ("mootdx", "backtest.loaders.mootdx_loader", "DataLoader"),
    ("ccxt", "backtest.loaders.ccxt_loader", "DataLoader"),
    ("futu", "backtest.loaders.futu", "FutuLoader"),
    ("eastmoney", "backtest.loaders.eastmoney_loader", "DataLoader"),
    ("sina", "backtest.loaders.sina_loader", "DataLoader"),
    ("stooq", "backtest.loaders.stooq_loader", "DataLoader"),
    ("yahoo", "backtest.loaders.yahoo_loader", "DataLoader"),
    ("finnhub", "backtest.loaders.finnhub_loader", "DataLoader"),
    ("alphavantage", "backtest.loaders.alphavantage_loader", "DataLoader"),
    ("tiingo", "backtest.loaders.tiingo_loader", "DataLoader"),
    ("fmp", "backtest.loaders.fmp_loader", "DataLoader"),
    ("qveris", "backtest.loaders.qveris_loader", "DataLoader"),
    ("india_broker", "backtest.loaders.india_broker_loader", "DataLoader"),
    ("longbridge", "backtest.loaders.longbridge", "LongbridgeLoader"),
    ("local", "backtest.loaders.local_loader", "DataLoader"),
    ("astockdata", "backtest.loaders.astockdata_loader", "DataLoader"),
)
# Canonical set of accepted data-source names: every registered loader plus the
# ``"auto"`` cross-market selector. Single source of truth shared by the backtest
# config schema (``backtest.runner.BacktestConfigSchema``) and the agent-facing
# backtest tool (``src.tools.backtest_tool``) so the two can never drift apart.
# Keep in sync with ``_LOADER_SPECS`` above — the regression test
# ``test_valid_sources_covers_all_registered_loaders`` enforces full coverage.
VALID_SOURCES: set[str] = {
    "tushare",
    "okx",
    "yfinance",
    "akshare",
    "baostock",
    "tencent",
    "mootdx",
    "ccxt",
    "futu",
    "eastmoney",
    "sina",
    "stooq",
    "yahoo",
    "finnhub",
    "alphavantage",
    "tiingo",
    "fmp",
    "qveris",  # QVERIS-INTEGRATION
    "india_broker",
    "longbridge",
    "local",
    "astockdata",
    "auto",
}


def register(cls: Type[Any]) -> Type[Any]:
    """Class decorator: register a loader into the global registry.

    The class must have a ``name`` class attribute.
    """
    LOADER_REGISTRY[cls.name] = cls
    return cls


def _ensure_registered() -> None:
    """Import every known loader module so ``@register`` decorators fire.

    Safe to call multiple times.  After the first import pass, later calls only
    inspect modules already cached in ``sys.modules``.  This repairs registry
    state without repeatedly retrying imports for optional dependencies that
    were unavailable on the first pass.

    Loaders whose dependencies are missing (e.g. ``akshare`` not installed)
    are silently skipped.
    """
    global _registered
    if _registered:
        for source_name, module_name, class_name in _LOADER_SPECS:
            module = sys.modules.get(module_name)
            if module is None:
                continue
            loader_cls = getattr(module, class_name, None)
            if loader_cls is not None:
                # Preserve intentional runtime/test overrides.
                LOADER_REGISTRY.setdefault(source_name, loader_cls)
        return

    import importlib
    for source_name, module_name, class_name in _LOADER_SPECS:
        try:
            module = importlib.import_module(module_name)
        except Exception:
            continue
        loader_cls = getattr(module, class_name, None)
        if loader_cls is not None:
            # Preserve an intentional, already-registered override.  Only
            # repair entries that are absent.
            LOADER_REGISTRY.setdefault(source_name, loader_cls)
    _registered = True


# Sources that must NEVER silently fall through to a network loader when the
# caller asked for them explicitly. ``local`` reads the user's own configured
# files (``~/.vibe-trading/data-bridge/config.yaml``); its ``markets`` set spans
# every market only so the cross-market auto-resolver can *reach* it, not so an
# unavailable ``local`` request can degrade into an unrelated network source.
# An explicit ``local`` request that is unavailable is a config problem the user
# must see, not something to paper over with a Yahoo/Tencent fetch.
_NO_NETWORK_FALLBACK_SOURCES: frozenset[str] = frozenset({"local", "qveris"})  # QVERIS-INTEGRATION


# ---------------------------------------------------------------------------
# Fallback chains: market_type -> ordered list of source names
# ---------------------------------------------------------------------------

# Chains are ordered by IP-ban risk first (lighter, throttle-tolerant public
# endpoints lead; key-gated REST and rate-limit-prone sources trail), then by
# data quality. Eastmoney/Sina/Stooq/Yahoo are unauthenticated public sources
# that must be politely throttled; Finnhub/AlphaVantage/Tiingo/FMP are key-gated
# REST fallbacks placed deeper in the chain.
FALLBACK_CHAINS: dict[str, list[str]] = {
    "a_share":   ["tencent", "astockdata", "mootdx", "eastmoney", "baostock", "akshare", "tushare", "local"],
    "us_equity": ["yahoo", "stooq", "sina", "eastmoney", "yfinance", "tiingo", "fmp", "finnhub", "alphavantage", "longbridge", "akshare", "local"],
    "hk_equity": ["eastmoney", "yahoo", "futu", "yfinance", "akshare", "longbridge", "local"],
    "india_equity": ["yahoo", "yfinance", "india_broker", "local"],
    "crypto":    ["okx", "ccxt", "yfinance", "local"],
    "futures":   ["tushare", "akshare", "local"],
    "fund":      ["tushare", "akshare", "local"],
    "macro":     ["akshare", "tushare", "local"],
    "forex":     ["akshare", "yfinance", "local"],
}


def resolve_loader(market: str) -> Any:
    """Return the first *available* loader instance for *market*.

    Walks the fallback chain and returns the first loader whose
    ``is_available()`` returns ``True``.

    Args:
        market: Market type key (e.g. ``"a_share"``, ``"crypto"``).

    Returns:
        A loader instance.

    Raises:
        NoAvailableSourceError: If every candidate is unavailable.
    """
    _ensure_registered()
    chain = FALLBACK_CHAINS.get(market, [])
    tried: list[str] = []
    for name in chain:
        if name not in LOADER_REGISTRY:
            continue
        tried.append(name)
        # Issue #50 — some loaders (e.g. Tushare) call into the SDK during
        # __init__ and raise on missing credentials. Treat that the same as
        # is_available()=False so the fallback chain keeps walking.
        try:
            loader = LOADER_REGISTRY[name]()
        except Exception as exc:
            logger.debug("loader %s failed to construct: %s", name, exc)
            continue
        if loader.is_available():
            return loader
    raise NoAvailableSourceError(
        f"No available data source for market '{market}'. "
        f"Tried: {tried or chain}. Check network and API token config."
    )


def get_loader_cls_with_fallback(source: str) -> Type[Any]:
    """Return a loader *class* for *source*, falling back if unavailable.

    Args:
        source: Requested data source name.

    Returns:
        A DataLoader class (not instance).

    Raises:
        NoAvailableSourceError: If the source and all fallbacks are unavailable.
    """
    _ensure_registered()
    if source not in LOADER_REGISTRY:
        raise NoAvailableSourceError(f"Unknown data source: {source}")

    loader_cls = LOADER_REGISTRY[source]
    try:
        instance = loader_cls()
    except Exception as exc:
        logger.debug("loader %s failed to construct: %s", source, exc)
        instance = None
    if instance is not None and instance.is_available():
        return loader_cls

    # Some sources must never silently degrade to an unrelated network loader
    # when explicitly requested. ``local`` is the canonical case: its broad
    # ``markets`` set exists only to make it reachable from the cross-market
    # auto-resolver, so falling back through it would fetch network data the
    # user never asked for and mask a Data Bridge config problem. Fail loudly.
    if source in _NO_NETWORK_FALLBACK_SOURCES:
        raise NoAvailableSourceError(
            f"Data source '{source}' is unavailable and does not fall back to a "
            f"network source. Check your local Data Bridge config "
            f"(~/.vibe-trading/data-bridge/config.yaml) — it must exist and list "
            f"at least one source."
        )

    # Source unavailable — try same-market fallback
    for market in loader_cls.markets:
        try:
            fallback = resolve_loader(market)
            logger.warning(
                "%s is unavailable, falling back to %s for market %s",
                source, fallback.name, market,
            )
            return type(fallback)
        except NoAvailableSourceError:
            continue

    raise NoAvailableSourceError(
        f"Data source '{source}' is unavailable and no fallback found."
    )
