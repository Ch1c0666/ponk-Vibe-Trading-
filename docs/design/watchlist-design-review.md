# 自选列表（Watchlist）设计审查

> 状态：草案 — 仅设计，不实现
> 日期：2026-07-18
> 作者：Claude (design review)

---

## 1. 数据模型草案

### 1.1 自选条目 `WatchlistEntry`

```typescript
interface WatchlistEntry {
  /** 唯一 ID（crypto.randomUUID()，添加时生成） */
  id: string;
  /** 市场标识 */
  market: "a" | "us";
  /** 标的代码，A 股格式 \d{6}\.(SH|SZ|BJ)，美股格式 [A-Z]{1,5} */
  code: string;
  /** 用户添加时间 (ISO-8601) */
  addedAt: string;
  /** 手动排序序号（越小越靠前） */
  sortOrder: number;
  /** 用户备注（可选，最大 500 字符） */
  notes?: string;
}
```

### 1.2 自选列表 `WatchlistData`

```typescript
interface WatchlistData {
  /** Schema 版本（给未来迁移留空间） */
  version: 1;
  /** 最后修改时间 (ISO-8601) */
  updatedAt: string;
  /** 条目列表 */
  items: WatchlistEntry[];
}
```

### 1.3 运行时行情状态（不持久化）

```typescript
/** 每个条目的行情加载状态 */
type WatchlistQuoteState =
  | { kind: "idle" }                                    // 未请求
  | { kind: "loading" }                                 // 请求中
  | { kind: "loaded"; data: StockQuoteData }            // 已加载
  | { kind: "not_reviewed" }                            // 标的未审核
  | { kind: "error"; message: string };                 // 网络/解析错误

/** 合并持久化条目 + 运行时行情 + 运行时加载态 */
interface WatchlistRow {
  entry: WatchlistEntry;
  quote: WatchlistQuoteState;
}

/** 整个自选列表的聚合态 */
type WatchlistView =
  | { kind: "empty"; items: [] }                        // 列表为空
  | { kind: "ready"; items: WatchlistRow[] }            // 正常
  | { kind: "partial"; items: WatchlistRow[]; failed: number }; // 部分失败
```

### 1.4 设计理由

- `id` 用 `crypto.randomUUID()` 而非自增序号，避免删除/排序时的 ID 冲突
- `sortOrder` 用浮点数方案（插入时取相邻两项的中间值）避免每次拖拽都要重排全部条目
- 行情状态不持久化 — 每次页面加载重新从 REST 接口拉取，保证数据新鲜度
- 美股先设计占位，但实现阶段 fail-closed（见第 5 节）

---

## 2. 本地存储 vs 后端持久化

### 2.1 对比矩阵

| 维度 | localStorage | 后端持久化 |
|------|-------------|-----------|
| 实现复杂度 | 低（~100 行 adapter） | 高（API + DB + migration） |
| 用户门槛 | 零（无需登录） | 需要认证体系 |
| 数据丢失风险 | 清除浏览器数据即丢失 | 持久保存 |
| 多设备同步 | 不支持 | 支持 |
| 离线可用 | 是 | 否 |
| 隐私 | 数据完全在本地 | 服务端可见 |
| 与现有架构匹配 | 完全匹配（当前无 auth） | 需要新建 auth 模块 |

### 2.2 决策：localStorage（V0），接口预留后端切换

**理由：**
1. 当前系统无用户认证体系 — 后端持久化需要先建 auth，工作量剧增
2. 项目定位是个人投研看板，非多用户 SaaS
3. localStorage 符合 CLAUDE.md 的 "no real broker connections" 原则 — 自选列表是用户自己的本地数据
4. 前端 adapter 接口设计为可替换（见 4.2），未来切换到后端只需换一个实现

**接口预留：**

```typescript
interface WatchlistStorage {
  load(): WatchlistData;
  save(data: WatchlistData): void;
  addEntry(market: "a" | "us", code: string, notes?: string): WatchlistEntry;
  removeEntry(id: string): void;
  updateNotes(id: string, notes: string): void;
  reorder(ids: string[]): void;  // 拖拽排序
}
```

V0 提供 `LocalWatchlistStorage`（localStorage 实现），未来可新增 `RemoteWatchlistStorage`（REST 实现）。

### 2.3 localStorage Key 设计

```
vibe-trading:watchlist:v1  →  WatchlistData (JSON)
```

使用带版本的 key 名，方便未来迁移（V2 读 V1 数据时做 transform）。

### 2.4 localStorage 损坏处理

`load()` 方法的行为规范：

```
1. localStorage.getItem("vibe-trading:watchlist:v1") → raw
2. raw === null → 返回空列表 { version: 1, updatedAt: ..., items: [] }
3. JSON.parse(raw) 成功 → 返回解析结果
4. JSON.parse(raw) 失败：
   a. 将原始坏数据写入 backup key:
      localStorage.setItem("vibe-trading:watchlist:v1:quarantine", raw)
   b. 不得覆盖原 key "vibe-trading:watchlist:v1"
      （用户可能在后续手动修复后恢复）
   c. 在内存中返回空列表 { version: 1, updatedAt: ..., items: [] }
   d. console.warn 提示坏数据已备份到 quarantine key
```

关键约束：
- **不覆盖原 key** — 保留现场，用户可手动从 DevTools 修复
- **quarantine 备份** — 坏数据不会丢失，可供排查
- **在内存返回 empty** — 不阻塞页面渲染，watchlist 从零开始

---

## 3. A 股 / 美股 Code Review 规则

### 3.1 总体原则

自选列表允许用户添加任何通过本地格式校验的代码；**添加时不做 manifest 审核**。审核发生在**行情拉取阶段**：REST 端点强制校验 reviewed manifest。

### 3.2 A 股规则

| 阶段 | 规则 |
|------|------|
| 输入校验 | `^\d{6}\.(SH\|SZ\|BJ)$`，前端即时校验，不合法拒绝添加 |
| 本地存储 | 通过校验即可存入 localStorage，无需 manifest 审核 |
| 行情拉取 | 调用 `GET /api/stocks/quote?code=`（已有端点） |
| Manifest 门禁 | 端点已有 `get_reviewed_stock_codes()` 白名单 → 未审核返回 403 `code_not_reviewed` |
| UI 展示 | 403 → 显示 "待审核" 状态，不显示任何价格数据 |
| dataUse 要求 | 标的在 manifest 中必须有 `dataUse: ["quote"]` 或 `dataUse` 包含 `"quote"` |

**关键：不需要新增 `dataUse: "watchlist"`。** 自选列表本质是拉取行情，复用已有的 `"quote"` dataUse 即可。这避免了 dataUse 膨胀，且语义正确 — 用户把标的加入自选列表就是为了看行情。

### 3.3 美股规则（未来，当前 fail-closed）

| 阶段 | 规则 |
|------|------|
| 输入校验 | `^[A-Z]{1,5}$`（大写字母，1-5 位），前端即时校验 |
| 本地存储 | 通过校验即可存入 |
| 行情拉取 | `GET /api/us-stocks/quote?symbol=`（待实现） |
| 当前行为 | 端点返回 501 `not_implemented` — fail-closed |
| 未来 Manifest | 美股 review 流程与 A 股相同（status/reason/source/reviewer/reviewedAt/dataUse） |
| 数据源 | 待定（需设计审查单独评估美股数据源合规性） |

### 3.4 测试 & Mock 规则

- 测试中 **禁止** 使用真实股票代码
- A 股测试用 `000000.SH`, `000000.SZ`（占位符）
- 美股测试用 `MOCK`, `TEST`（占位符）
- Mock 行情数据必须带 `[Mock]` 前缀（沿袭现有 indexQuoteService 模式）
- 默认 manifest 不含任何自选相关代码

---

## 4. API 草案 & 前端状态草案

### 4.1 REST 端点

#### 已有（可直接复用）

```
GET /api/stocks/quote?code=688041.SH   ← reviewed, manual smoke only; not in test fixtures
  → 200 { ok: true, source: "tencent", code: "688041.SH", data: {...} }
  → 403 { ok: false, error: "code '...' has not passed manual review", error_code: "code_not_reviewed" }
  → 502 { ok: false, error: "...", error_code: "provider_request_failed" }
```

#### 未来（Phase C 之后，不在本次实现范围）

```
GET /api/us-stocks/quote?symbol=MOCK
  → 501 { ok: false, error: "US stock quotes not yet implemented", error_code: "not_implemented" }
  （fail-closed — 美股数据源未经过设计审查前永远返回 501）

GET /api/stocks/quotes?codes=000000.SH,000000.SZ
  → 200 { ok: true, source: "tencent", data: { quotes: [...], partial: true, warnings: [...] } }
  （批量行情 — 减少 N 次请求，后端已有 concurrency=3 模式可供参考）
```

### 4.2 前端服务层 `watchlistService.ts`

遵循现有的 `disabled / mock / real` 三态 + adapter 六态模式：

```typescript
// watchlistService.ts

export type WatchlistServiceMode = "disabled" | "mock" | "real";

export interface WatchlistLoadOptions {
  mode?: WatchlistServiceMode;
  /** 最多并发 quote 请求数，默认 3 */
  maxConcurrency?: number;
}

/**
 * 从 localStorage 加载自选列表，并为每个条目拉取行情。
 *
 * - disabled: 只加载列表，不拉行情（所有条目 quote = idle）
 * - mock: 加载列表 + [Mock] 行情数据
 * - real: 加载列表 + 逐条调用 GET /api/stocks/quote?code=
 */
export async function loadWatchlist(
  options?: WatchlistLoadOptions,
): Promise<WatchlistView>;
```

### 4.3 前端组件树（在 Overview.tsx 内）

- `Overview`
- `IndexCardGrid`（现有）
- `WatchlistSection`（新增，取代现有 `WatchlistTable`）
- `WatchlistToolbar`（Add 按钮 + 市场切换）
- `WatchlistTable` + `WatchlistRow` 列表
- `WatchlistRow` 展示 code、name、price、change_pct、quote state badge、remove/edit/drag actions
- `WatchlistEmpty`（空状态）
- `USWatchlistSection`（同上，但行情端点 fail-closed）

### 4.4 现有 Overview.tsx 改动范围

当前 Overview.tsx 已有 A-Share Watchlist 和 US Stock Watchlist 两个占位表格（`WatchlistTable` 组件，Add 按钮 disabled）。实现时：
- `WatchlistTable` → 替换为有状态的 `WatchlistSection`
- Add 按钮从 `disabled` → 启用，弹出代码输入框
- 空状态从 `—` → "添加第一个标的"
- 不影响 `IndexCardGrid`、不影响 `handleRefresh`

---

## 5. Fail-Closed 安全边界

| # | 边界 | 机制 | 失败时行为 |
|---|------|------|-----------|
| 1 | **代码格式** | 前端正则校验，不合法拒绝添加 | 用户看到格式错误提示，代码不进入 localStorage |
| 2 | **Manifest 门禁** | `GET /api/stocks/quote` 已有 `get_reviewed_stock_codes()` 白名单 | 403 → UI 显示 "待审核"，不展示任何行情数据 |
| 3 | **美股行情** | `GET /api/us-stocks/quote` 返回 501 | UI 显示 "美股行情暂不支持"，不发起真实网络请求 |
| 4 | **Manifest 损坏** | `_load_manifest()` 返回 None → 白名单为空 | 所有代码被拒（403），系统不崩溃 |
| 5 | **localStorage 损坏** | JSON parse 失败 → 返回空列表；不覆盖原 key；坏数据备份到 `vibe-trading:watchlist:v1:quarantine` | 用户看到空自选列表，原始坏数据保留在 quarantine key 供手动修复 |
| 6 | **默认空列表** | 无预置代码，无 seed data | 新用户看到空自选 + "添加标的"引导 |
| 7 | **Mock 数据** | 所有 mock 数据带 `[Mock]` 前缀 | 不可能误认为真实行情 |
| 8 | **测试隔离** | 所有测试使用占位代码（000000.SH, MOCK） | CI 零真实网络请求 |
| 9 | **无后端存储** | V0 自选列表仅 localStorage | 服务端无自选数据，无泄漏风险 |
| 10 | **不接券商** | 设计阶段就排除 | 无交易、无下单、无持仓同步 |

### 5.1 分层防御图

```
用户输入 "000000.SZ"
  ↓
[L1] 前端格式校验 → 不通过 → 拒绝添加，提示用户
  ↓ 通过
[L2] localStorage 存储 → 成功（不做 manifest 检查）
  ↓ 用户点击刷新行情
[L3] GET /api/stocks/quote?code=000000.SZ
  ↓
[L4] stock_quote_routes 检查 reviewed manifest
  ↓ 不在白名单
[L5] 403 code_not_reviewed → UI 显示 "待审核"
  ↓ 在白名单
[L6] tencent_quote() 拉取 → 200 返回行情数据 → UI 显示价格
```

每一层都可以独立失败且不影响其他层。没有一层失败会导致真实数据泄漏。

---

## 6. 后续 Phase C 实现步骤

### Phase C-1：数据模型 + localStorage adapter（纯前端，不涉及 API）

**文件：**
- `frontend/src/lib/watchlist/watchlistTypes.ts` — 所有类型定义
- `frontend/src/lib/watchlist/watchlistStorage.ts` — localStorage 读写 + 版本迁移
- `frontend/src/lib/watchlist/__tests__/watchlistStorage.test.ts` — 测试

**验证标准：**
- [ ] `watchlistStorage.test.ts` 全部通过
- [ ] 测试只用占位代码 `000000.SH`, `000000.SZ`, `MOCK`
- [ ] 不新增真实股票代码
- [ ] 不修改 segmentCodeMap
- [ ] 不重启 8899

### Phase C-2：WatchlistSection 组件 + Overview 集成

**文件：**
- `frontend/src/pages/Overview.tsx` — 替换 `WatchlistTable` 为 `WatchlistSection`
- `frontend/src/components/watchlist/WatchlistSection.tsx` — 新建
- `frontend/src/components/watchlist/AddCodeDialog.tsx` — 新建（代码输入弹窗）
- i18n keys 新增（所有 5 个 locale 文件）

**验证标准：**
- [ ] 空列表显示引导文案
- [ ] Add 按钮打开输入框
- [ ] 格式校验阻止非法输入
- [ ] 添加后显示在列表中（无行情，idle 状态）
- [ ] 删除功能正常
- [ ] 不触发真实网络请求（disabled 模式）
- [ ] 不影响 IndexCardGrid 现有功能
- [ ] AIComputingPower / HumanoidRobot 测试不受影响
- [ ] 不重启 8899

### Phase C-3：行情拉取集成

**文件：**
- `frontend/src/lib/watchlist/watchlistService.ts` — disabled / mock / real 三态
- `frontend/src/lib/watchlist/__tests__/watchlistService.test.ts`
- `frontend/src/components/watchlist/WatchlistSection.tsx` — 接入 service

**验证标准：**
- [ ] mock 模式返回 `[Mock]` 前缀行情
- [ ] real 模式调用 `GET /api/stocks/quote?code=`
- [ ] 403 → UI 显示 "待审核"
- [ ] 网络错误 → UI 显示错误状态
- [ ] 并发限制 max 3（沿袭 reportLibraryService 模式）
- [ ] 自动化测试只用占位代码 `000000.SH`, `000000.SZ`，不写入真实股票代码
- [ ] `688041.SH` 仅可作为已有 reviewed manifest 的手动 smoke 样例，不新增到 watchlist 测试 fixture
- [ ] 不新增真实股票代码
- [ ] 不修改 segmentCodeMap
- [ ] 不重启 8899

### Phase C-4：美股自选（未来，需单独设计审查）

**前置条件：**
- [ ] 美股数据源合规性评估
- [ ] `GET /api/us-stocks/quote` 端点实现
- [ ] 美股 manifest review 流程建立

**当前状态：** fail-closed — `GET /api/us-stocks/quote?symbol=ANY` 返回 501。

---

## 附录 A：与现有系统的交互边界

- `reviewed_segment_codes.json` 是 reviewed code 的单一事实来源。
- AIComputing segment detail 通过 `getQuoteCodes()` 调用 `/api/stocks/quote`。
- AIComputing ReportLibrary 通过 `segmentCodeMap` 调用 `/api/reports/research`，不消费 reviewed quote-only codes。
- Watchlist 通过用户本地输入（localStorage）取得 code，再调用 `/api/stocks/quote`。
- Watchlist 与 segment detail 共享相同的 reviewed manifest 白名单。
- Watchlist 不使用 `segmentCodeMap`；`segmentCodeMap` 保持全空。

## 附录 B：关键决策记录

| 决策 | 结论 | 理由 |
|------|------|------|
| 存储方案 | localStorage V0，接口预留后端切换 | 无 auth 体系，项目定位个人使用 |
| dataUse 新增？ | 不新增 `"watchlist"`，复用 `"quote"` | 语义正确，避免 dataUse 膨胀 |
| 添加时审核？ | 不审核，行情拉取时审核 | 用户自由管理列表，安全边界在 API 层 |
| 美股 | fail-closed，返回 501 | 数据源未评估，不可开放 |
| 批量行情 | 先逐条调用，未来加 `/api/stocks/quotes` | V0 简单，后续优化 |
| segmentCodeMap | 不修改，保持全空 | 自选列表是独立功能 |
