---
name: astockdata
category: data-source
description: 仓库内置的 A 股只读数据适配器。当前覆盖腾讯 OHLCV/行情及若干东财公开数据；个股研报 qType=0 已定义稳定 schema，行业研报 qType=1 尚未实现并明确报错。无需 API Key。
---

# astockdata（仓库实现）

## 能力边界

本 skill 只描述当前仓库
`backtest.loaders.astockdata_loader` 和
`src.tools.research_reports_tool` 中实际存在的能力。仓库源码是唯一维护源；
不要从其他 runtime 副本或外部 skill 目录复制逻辑。

所有接口均为只读公开数据源，不连接券商，也不执行交易。联网调用必须继续使用
项目已有的限流客户端。

当前实际实现：

| 函数或工具 | 数据 | 状态 |
| --- | --- | --- |
| `DataLoader.fetch(...)` | A 股日线 OHLCV（腾讯） | 已实现 |
| `tencent_quote(codes)` | 实时价、PE/PB、市值等（腾讯） | 已实现 |
| `get_research_reports` | 标准化个股研报 qType=0（东财 + THS） | 已实现 |
| `eastmoney_reports` | 兼容旧 Python 调用的东财原始字段列表 | 已实现 |
| `eastmoney_industry_reports` | 行业研报 qType=1 | 未实现，安全报错 |
| `eastmoney_datacenter(...)` | 东财数据中心通用查询 | 已实现 |
| `industry_comparison(...)` | 行业涨跌排名 | 已实现 |
| `eastmoney_stock_news(...)` | 个股新闻 | 已实现 |
| `eastmoney_global_news(...)` | 全球资讯 | 已实现 |
| `em_limit_up_pools(...)` | 涨停、炸板、跌停、昨涨停池 | 已实现 |
| `margin_trading(...)` | 融资融券 | 已实现 |
| `daily_dragon_tiger(...)` | 龙虎榜 | 已实现 |
| `eastmoney_stock_info(...)` | 个股基础信息 | 已实现 |

不要声称仓库已实现行业研报、研报 PDF、财报三表、公告、互动易、ETF
期权或其他未列出的端点。

## 个股研报 qType=0 契约

公开工具入参字段使用 `q_type`；东财底层参数使用 `qType`。两者不要混用。

```json
{
  "q_type": 0,
  "code": "600519.SH",
  "limit": 20
}
```

- `q_type`：整数，只允许 `0` 或 `1`，默认 `0`。
- `code`：q_type=0 时必填，格式为六位代码加 `.SH`、`.SZ` 或 `.BJ`；
  后缀不区分大小写，输出统一转为大写。
- `limit`：整数 1–50，默认 20。
- 未声明的字段不属于公开 schema。

成功信封：

```json
{
  "ok": true,
  "market": "CN",
  "source": "eastmoney+ths",
  "data": {
    "q_type": 0,
    "code": "600519.SH",
    "reports": [],
    "consensus_eps": [],
    "partial": false,
    "warnings": []
  }
}
```

`reports` 每行固定包含：

- `title`、`brokerage`、`analyst`、`publish_date`、`info_code`、`rating`
  （均可为 null）；
- `eps_forecast.this_year`、`eps_forecast.next_year`；
- `pe_forecast.this_year`、`pe_forecast.next_year`
  （预测值均为 number 或 null）。

`consensus_eps` 每行固定包含 `fiscal_year`（string 或 null）和
`consensus_eps`（number 或 null）。同花顺一致预期是 best-effort：
其请求失败时该数组为空，但不会伪造数据。

东财第一页失败时工具返回整体错误。第二页及之后失败时保留已取得的
`reports`，并返回 `partial: true`；`warnings` 中包含
`provider_page_failed` 及失败页码。完整结果使用 `partial: false` 和空
`warnings`。

`eastmoney_reports(code, max_pages=...)` 是兼容入口，继续返回
`publishDate`、`orgSName`、`infoCode` 等东财原始字段，不返回上述标准化
信封。它接受数字字符串页数，行为与 a0d64d4 恢复点一致（缺失/非法 `hits`
默认 0，在第一页后停止）；需要标准字段、`strict_hits` 完整性检查和
`partial` 状态的新调用应使用 `get_research_reports` 或
`backtest.loaders.research_reports.fetch_stock_reports`。

## 行业研报 qType=1

qType=1 目前没有可信实现。调用必须在解析证券代码或联网之前返回：

```json
{
  "ok": false,
  "error": "industry research reports (qType=1) are not implemented; qType=0 stock reports will not be substituted",
  "error_code": "industry_reports_not_implemented",
  "details": {
    "q_type": 1,
    "supported_q_types": [0]
  }
}
```

禁止用 qType=0 个股研报冒充行业研报，禁止生成占位研报内容。

## 示例

```python
from backtest.loaders.astockdata_loader import (
    DataLoader,
    eastmoney_industry_reports,
    eastmoney_reports,
    tencent_quote,
)
from src.tools.research_reports_tool import ResearchReportsTool

quotes = tencent_quote(["600519", "000001"])
legacy_raw_reports = eastmoney_reports("600519", max_pages="3")
unsupported = eastmoney_industry_reports()
envelope = ResearchReportsTool().execute(
    q_type=0,
    code="600519.SH",
    limit=10,
)
```
