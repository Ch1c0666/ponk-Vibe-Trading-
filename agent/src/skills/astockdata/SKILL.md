---
name: astockdata
category: data-source
description: A股全栈数据工具包（集成 simonlin1212/a-stock-data V3.4）— 10层架构43端点，覆盖行情(K线/盘口/PE/PB/市值)、研报(个股+行业+PDF)、信号(热点/北向/龙虎榜/解禁/行业)、资金面(融资融券/大宗/股东户数/分红)、新闻(财联社电报+全球资讯)、基础数据(财报三表/F10/季报)、公告(巨潮)、打板(涨停池+炸板率+连板梯队)、ETF期权(T型报价+希腊字母+IV)、舆情互动(互动易+热榜+概念命中)。优先走不封IP的通达信(mootdx)/腾讯，东财接口已内置限流防封。零key可用（除iwencai）。
---

# a-stock-data — A股全栈数据工具包

## 概述

基于 [simonlin1212/a-stock-data](https://github.com/simonlin1212/a-stock-data) V3.4.0，集成到 Vibe-Trading 的 A 股数据获取层。覆盖 10 层数据架构，43 个端点，15 个数据源。优先使用不封 IP 的通达信(mootdx)/腾讯财经，东财仅用于其独有数据且内置限流。

所有函数均可从 `backtest.loaders.astockdata_loader` 直接导入使用。

## 数据源优先级

| 优先级 | 数据源 | 封IP风险 | 用途 |
|--------|--------|---------|------|
| 1（首选） | mootdx（通达信） | 不封 | K线/五档/逐笔/财务快照/F10 |
| 2 | 腾讯财经 | 不封 | 实时价/PE/PB/市值/指数/ETF |
| 3 | 新浪/巨潮/同花顺 | 低 | 财报三表/公告/EPS |
| 4（仅独有） | 东财 eastmoney | 有风控 | 龙虎榜/研报/资金流等（内置限流） |

## 快速上手

```python
from backtest.loaders.astockdata_loader import (
    DataLoader,           # OHLCV data loader (DataLoaderProtocol)
    tencent_quote,        # 实时行情 PE/PB/市值
    eastmoney_reports,    # 研报列表
    eastmoney_stock_news, # 个股新闻
    eastmoney_global_news,# 全球7x24资讯
    em_limit_up_pools,    # 涨停/炸板/跌停/昨涨停四池
    eastmoney_datacenter, # 东财数据中心通用查询
    industry_comparison,  # 行业涨跌排名
    eastmoney_stock_info, # 个股基本面信息
)

# 获取实时行情
quotes = tencent_quote(["600519", "000001"])
# -> {"600519": {"name": "贵州茅台", "price": 1258.99, "pe_ttm": 19.03, ...}, ...}

# 获取研报
reports = eastmoney_reports("600519", max_pages=3)

# 获取全球资讯
news = eastmoney_global_news()

# 获取打板数据
pools = em_limit_up_pools("20260716")
```

## 端点路由速查

### 行情层 (§1) — 不封IP
| 函数 | 用途 | 源 |
|------|------|-----|
| `DataLoader.fetch(codes, start, end)` | OHLCV K线数据 | 腾讯 ifzq |
| `tencent_quote(codes)` | 实时价/PE/PB/市值/换手率 | 腾讯 |
| `tdx_client()` → `.bars()` / `.quotes()` | K线/五档盘口/逐笔 | 通达信 |

### 研报层 (§2)
| 函数 | 用途 | 源 |
|------|------|-----|
| `eastmoney_reports(code)` | 个股研报+评级+EPS预测 | 东财 reportapi |
| `eastmoney_industry_reports(code)` | 行业研报 | 东财 reportapi |

### 信号层 (§3)
| 函数 | 用途 | 源 |
|------|------|-----|
| `industry_comparison(top_n)` | 行业板块涨跌排名 | 东财 |
| `daily_dragon_tiger(date)` | 全市场龙虎榜 | 东财 |

### 资金面 (§4)
| 函数 | 用途 | 源 |
|------|------|-----|
| `eastmoney_datacenter(report_name, ...)` | 融资融券/大宗/股东户数/分红 | 东财 datacenter |

### 新闻层 (§5)
| 函数 | 用途 | 源 |
|------|------|-----|
| `eastmoney_stock_news(code)` | 个股新闻 | 东财 |
| `eastmoney_global_news()` | 全球7x24资讯 | 东财 |
| `cls_telegraph()` | 财联社电报 | 财联社 |

### 基础数据层 (§6)
| 函数 | 用途 | 源 |
|------|------|-----|
| `eastmoney_stock_info(code)` | 行业/股本/市值/上市日期 | 东财 |
| `sina_financial_report(code)` | 财报三表 | 新浪 |

### 打板层 (§8)
| 函数 | 用途 | 源 |
|------|------|-----|
| `em_limit_up_pools(date)` | 涨停/炸板/跌停/昨涨停四池 | 东财 push2ex |
| `limit_up_sentiment(date)` | 炸板率/连板高度/梯队 | 组合计算 |

### 舆情互动层 (§10)
| 函数 | 用途 | 源 |
|------|------|-----|
| `cninfo_irm(code)` | 互动易问答 | 巨潮 |
| `em_hot_rank()` | 东财人气榜 | 东财 |

## 调用说明

- **OHLCV数据**: 使用 `DataLoader` 类，符合 Vibe-Trading 的 `DataLoaderProtocol`，可用于回测
- **扩展数据**: 直接导入对应函数，返回 Python dict/list
- **东财限流**: 所有东财接口通过 `_em_get()` 统一限流（≥1s间隔+随机抖动）
- **完整a-stock-data**: 其余未直接封装的端点，通过已安装的 `~/.claude/skills/a-stock-data/SKILL.md` 由 AI 直接执行
