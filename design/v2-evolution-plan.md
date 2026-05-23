# 潘多拉魔盒 v2 演进设计

> 本文档定位：在已有架构与皮肤设计文档之上，给出 **B 档（UI 美学升级）** 与 **C 档（功能深化）** 的总体蓝图、单元规范与落地顺序。
>
> 阅读前请配合：
> - [game-plugin-architecture.md](./game-plugin-architecture.md) — 插件协议
> - [design-system-and-skins.md](./design-system-and-skins.md) — 三层皮肤体系
> - [game-library-structure.md](./game-library-structure.md) — 首页信息架构
> - [arcade-engine-plan.md](./arcade-engine-plan.md) — 街机引擎演进
> - [../docs/complex-game-sdk.md](../docs/complex-game-sdk.md) — 复杂游戏 SDK

---

## 0. 现状盘点（截至 v1 + A 档整治）

### 0.1 代码骨架（A 档后）

```
src/
├── main.js                  装配 + 状态 + 事件 (1896 行)
├── styles.css               全站样式 (5680 行，含 9 个 @media 断点)
├── games/
│   ├── catalog.js           24 款本地游戏注册
│   ├── arcade/              街机 SDK (engine/controls/collision/...)
│   └── <game>/              每款游戏一个文件夹
├── platform/
│   ├── game-plugin.js       插件协议、manifest 规范化
│   ├── plugin-sources.js    远程源发现、加载策略
│   └── sound.js             音效中枢
├── theme/
│   ├── skins.js             interfaceThemes 注册
│   └── game-visuals.js      visualStyles 注册
├── utils/
│   ├── common.js            asArray / unique / escape* / stableStringify
│   ├── random.js
│   └── storage.js           localStorage 包装
└── views/                   ← A 档新增
    ├── icons.js             SVG 图标库
    ├── labels.js            mode/difficulty/capability/outcome 文案
    ├── previews.js          大厅卡片棋盘缩略图
    └── plugin-sources-view.js  插件源审核 / 列表渲染
```

### 0.2 已有问题（v2 要解决的）

| 维度 | 现状 | 影响 |
|---|---|---|
| 状态管理 | `state` 全局对象 + `render()` 全量重绘 | 状态变更难追溯，无法做最小化更新 |
| 主题 | 只有 `guofeng` 一套 | 用户无法切换；夜间/极简场景缺失 |
| 卡片 | 单一布局，热度/收藏/可续玩混在 meta 行 | 信息层级不清；缺少视觉重点 |
| 模态 | 7 种弹窗共用一个 `modal-panel`，文案差异大 | 视觉节奏不一致；交互模式不统一 |
| AI | 五子棋 / 象棋 / 黑白棋 / 跳棋分别实现 minimax | 维护成本高；难度刻度不可比 |
| 续玩 | ~~24 款游戏中 12 款实现 `restoreState`~~ → **24/24 已接入**（C4 完成） | 历史问题，已闭环 |
| 成就 | 6 条 + 简单计数 | 长线动力不足 |
| 可访问性 | 仅 `aria-label`，无焦点管理 / 无键盘陷阱 | 键盘用户无法关闭弹窗 |

---

## 1. 架构演进路线

### 1.1 模块边界（目标态）

```
              ┌─────────────────┐
              │     main.js     │  装配 + 服务工人 + 事件分发
              │  (~600 行目标)  │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
   ┌──────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐
   │  store/  │   │ views/  │   │  pages/  │   │ modals/  │
   │ 状态收口 │   │ 纯模板  │   │ 路由 + 装配 │   │ 弹窗收口 │
   └────┬─────┘   └─────────┘   └──────────┘   └──────────┘
        │
        └─→ persistence/  localStorage / IndexedDB 适配
```

**关键演进**：
- `store/index.js` — 用一个轻量 `createStore({state, actions, persist})` 替代 `setState({...}) + persistPreferences()` 的散乱写法；订阅者只重渲染相关分片
- `pages/lobby.js`、`pages/play.js`、`pages/history.js` 等 — 每页一个文件，负责装配 views + 绑事件
- `modals/*.js` — 每种弹窗（start / rules / pause / result / restart / offline / feedback / settings / plugin-source）拆一个文件，对外暴露 `render(ctx)` + `bind(ctx)` 两个纯函数

### 1.2 不引入框架的理由

- 全局总代码 < 8000 行，引入 React/Vue 要拖入构建链
- 已用 ES module + template string，结构清晰即可
- 后续若要做 PWA + 复杂状态（联机/排行榜），再引入 [Lit](https://lit.dev) 或 [Preact](https://preactjs.com) 这种 ≤10KB 的方案

### 1.3 状态收口约定

```js
// store/index.js
export function createStore({ initialState, persist }) {
  let state = initialState;
  const listeners = new Set();
  return {
    get() { return state; },
    update(patch) {
      state = { ...state, ...patch };
      persist?.(state);
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
```

切片建议（按持久化策略分）：
- `preferencesStore` — 主题、音效、音量、游戏选项默认值
- `progressStore` — 每款游戏的胜负统计
- `sessionStore` — 续玩快照
- `favoritesStore` — 收藏数组
- `runtimeStore` — modal、view、currentGame 等不持久化的临时状态

---

## 2. 设计系统 v2

### 2.1 Token 收口

把当前散落在 `:root[data-theme="guofeng"]` 里的 28 个变量分成 5 组：

```css
/* ─── 颜色：底色 ─── */
--bg-page         /* 页面背景 */
--bg-surface      /* 卡片/弹窗背景 */
--bg-surface-2    /* 次级表面 */
--bg-elevated     /* 浮层（modal 背板） */

/* ─── 颜色：墨色 ─── */
--ink             /* 主文字 */
--ink-soft        /* 次文字 */
--ink-muted       /* 辅助文字 */
--line            /* 分割线 */
--line-strong     /* 强分割线 */

/* ─── 颜色：品牌 ─── */
--accent-jade     /* 主色（按钮、强调） */
--accent-cinnabar /* 警示色 */
--accent-gold     /* 奖励/成就 */
--accent-lotus    /* 收藏 */
--accent-sky      /* 信息 */

/* ─── 排版 ─── */
--font-display    /* 标题字号阶梯 */
--font-body
--font-mono       /* 分数、计时器 */
--text-xs / sm / base / lg / xl / 2xl

/* ─── 几何 ─── */
--radius-sm: 6px
--radius:   8px
--radius-lg: 14px
--radius-pill: 999px
--shadow-1: 0 4px 12px rgba(...)
--shadow-2: 0 18px 44px rgba(...)
--shadow-3: 0 32px 72px rgba(...)
--space-1..8  /* 4px 阶梯 */
```

### 2.2 主题矩阵

| 主题 ID | 名称 | 适用 | 关键变量映射 |
|---|---|---|---|
| `guofeng` | 国风（现有） | 默认 | 米黄底 + 翡翠绿主色 + 朱砂点缀 |
| `ink-dark` | 水墨夜 | 暗色 | 深靛底 + 玉色主色 + 米色字 |
| `mono` | 极简白 | 商务/无干扰 | 纯白底 + 墨黑主色 + 单色徽章 |
| `tea` | 茶歇（备） | 暖色 | 米褐底 + 茶绿 + 琥珀 |

> **切换机制**：`<html data-theme="...">`，每套主题写在独立文件 `src/styles/themes/<id>.css`，按需注入到 `<head>`。当前 `styles.css` 里的 `:root[data-theme="guofeng"]` 抽出迁移。

### 2.3 第二套主题：暗色（ink-dark）样板

```css
:root[data-theme="ink-dark"] {
  --bg-page: #0e1218;
  --bg-surface: #161c25;
  --bg-surface-2: rgba(22, 28, 37, 0.72);
  --bg-elevated: #1d2531;
  --ink: #e8eaef;
  --ink-soft: #b8bdc7;
  --ink-muted: #7d8492;
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(86, 192, 158, 0.32);
  --accent-jade: #56c09e;
  --accent-cinnabar: #ef6b5e;
  --accent-gold: #e0b864;
  --accent-lotus: #d076a0;
  --accent-sky: #5fb3d4;
  --shadow-1: 0 4px 12px rgba(0, 0, 0, 0.32);
  --shadow-2: 0 18px 44px rgba(0, 0, 0, 0.48);
  --shadow-3: 0 32px 72px rgba(0, 0, 0, 0.62);
}

:root[data-theme="ink-dark"] body {
  /* 替换 xuan-paper.svg + ink-wash.svg 为暗色水墨 SVG */
  background: var(--bg-page);
  background-image:
    radial-gradient(circle at 20% 10%, rgba(86, 192, 158, 0.06), transparent 60%),
    radial-gradient(circle at 80% 90%, rgba(96, 120, 180, 0.05), transparent 65%);
}
```

> 完整 token 表与 SVG 资源在实施时单独建文件 `design/theme-ink-dark.md`。

### 2.4 字体阶梯

```
display    1.875rem  (30px)  仅大厅 H1 / 成就英雄数
title      1.375rem  (22px)  弹窗标题
heading    1.125rem  (18px)  卡片标题、面板标题
body       0.9375rem (15px)  正文
caption    0.8125rem (13px)  meta、徽章
overline   0.6875rem (11px)  超小提示
```

### 2.5 间距阶梯

`4px` 倍数：4 / 8 / 12 / 16 / 20 / 24 / 32 / 48。当前 CSS 里出现的 7px、9px、10px 等碎值在 v2 统一收到 8 / 12 / 16。

---

## 3. 大厅与卡片重构

### 3.1 卡片三态

| 变体 | 用途 | 内容 | 尺寸 |
|---|---|---|---|
| `card--compact` | 收藏、最近活动 | icon 56 + title + 1 行 meta | h: 76 |
| `card--standard` | 大厅主列表 | icon 76/96 + title + subtitle + meta + 主按钮 | h: 110~140 |
| `card--hero` | 热门推荐头条 | icon 160 + title + tag 组 + 大按钮 | h: 220 |

### 3.2 卡片元素规范

```
┌─ card --standard ─────────────────────────────┐
│  ┌──────┐  TITLE              ⭐ Fav          │
│  │ICON  │  subtitle (≤14 字)                 │
│  └──────┘  [tag] [cat] [热度85] [可续玩]      │
│                                          ▶ 开始│
└────────────────────────────────────────────────┘
```

- **热度徽章**：仅在 `state.activeCategory === "hot"` 或 marketHeat ≥ 80 时显示，金底/卡其字
- **可续玩徽章**：胶囊形，主色描边
- **收藏星**：右上角浮动，未收藏时 30% 透明
- **hover 光泽**：`.card::after { background: linear-gradient(120deg, transparent 40%, rgba(white,0.16) 50%, transparent 60%); transform: translateX(-100%); }`，hover 时 `translateX(100%)`
- **press 反馈**：`transform: scale(0.985); transition: transform 80ms`

### 3.3 分类栏

- 当前横向滚动，无滚动指示。v2：
  - 左右淡出遮罩（`mask-image: linear-gradient(90deg, transparent, black 24px, black calc(100%-24px), transparent)`）
  - 选中态加底部 2px 主色横杠 + 微微缩放
  - 选中后自动 `scrollIntoView({inline: 'center'})`

### 3.4 空/加载/错误态

每页统一三种状态组件：

```html
<div class="state-empty">
  <svg class="state-illust">...</svg>
  <h3>暂无收藏</h3>
  <p>点亮卡片上的星标，就会出现在这里。</p>
  <button class="primary-button">去逛大厅</button>
</div>
```

---

## 4. 模态与游戏内顶栏

### 4.1 模态分级

| 等级 | 用途 | 特征 |
|---|---|---|
| `modal--sheet` | 开始 / 规则 / 设置 | 底部上推（移动端）/ 居中（桌面），高度 ≤ 80vh |
| `modal--dialog` | 重开确认 / 离线提示 | 居中，宽度 360-480 |
| `modal--toast` | 缓存成功 / 错误 | 顶部下降，3 秒自动消失，**新增** |
| `modal--full` | 结算 | 全屏覆盖，分享 + 重试 + 回大厅 |

### 4.2 结算页升级

当前结算只显示文字 + 数据胶囊。v2：

```
┌─ result --win ────────────────────────────┐
│         ✨ 胜利 ✨                         │
│      <英雄数字 / 分数 / 用时>              │
│                                            │
│  [对比上次最佳]   [本局亮点：3 连击]       │
│                                            │
│  [📤 分享]  [🔁 再来]  [⚙ 改设置]  [🏠 大厅]│
└────────────────────────────────────────────┘
```

亮点条目从 `result.extra` 中提炼（已有字段，未充分利用）。

### 4.3 游戏内顶栏一致化

当前 4 个图标按钮（重开/暂停/规则/设置）一字排开，不区分主次。v2：

- 重开归并到 **暂停层**（避免误触）
- 顶栏只保留：返回 + 标题 + 规则 + 暂停
- 设置改成**长按暂停**或**暂停层内入口**
- 街机类游戏顶栏极简化：仅返回 + 暂停

---

## 5. AI 通用化（C 档）

### 5.1 当前重复点

| 游戏 | 算法 | 评估函数行数 |
|---|---|---|
| gomoku | minimax + alpha-beta | ~80 |
| xiangqi | minimax + iter deepening | ~120 |
| reversi | minimax + corner heuristic | ~60 |
| checkers | minimax + piece value | ~45 |
| go | MCTS-lite (独立) | — |

### 5.2 通用接口

```js
// src/games/ai/minimax.js
export function minimax({
  state,              // 不可变状态对象
  depth,              // 搜索深度
  maxPlayer,          // 极大方标识
  generateMoves,      // (state) => Move[]
  applyMove,          // (state, move) => newState
  evaluate,           // (state, player) => number  正大负小
  isTerminal,         // (state) => boolean
  orderMoves,         // 可选：(state, moves) => orderedMoves
  alpha = -Infinity,
  beta = Infinity
}) { /* alpha-beta */ }
```

### 5.3 难度刻度

各游戏统一用三段映射，由游戏自己选择 depth 与 evaluator：

| 难度 | depth | 评估权重 | 随机扰动 | 说明 |
|---|---|---|---|---|
| easy | 1-2 | 仅子力 | ±10% | 故意失误率 10% |
| medium | 3-4 | 子力 + 位置 | ±3% | 默认 |
| hard | 5-6 | 子力 + 位置 + 模式 | 0 | 移动排序优化 |
| expert | 6-8 + 迭代加深 | 全开 + 历史启发 | 0 | 仅五子/象棋 |
| devil | 8+ + 置换表 | 全开 + 残局库 | 0 | 仅五子 |

### 5.4 落地顺序

1. 先把 `minimax` 抽出，让五子棋接入（最直观）
2. 黑白棋接入（评估简单）
3. 国际跳棋接入
4. 象棋接入（迭代加深需要 timeBudget 参数）
5. 围棋仍走 MCTS（不强行统一）

---

## 6. 会话与续玩统一约定

### 6.1 现状

> **2026-05 更新：C4 已完成。** 全部 24 款已接入 `context.savedState / saveSession / clearSession`，catalog 中相应 `sessionSave: true` 已开。下文保留为历史背景。

```
全部 24 款已接入会话快照（acdd53d 完成棋类与轻量休闲 5 款，
puzzle 类与街机已在更早提交补齐）：
  gomoku, xiangqi, sudoku, klotski, 2048, reversi, checkers,
  draughts, snake, tower-defense, tank-battle, breakout,
  go, tictactoe, flying, mahjong-connect, match3, merge-workshop,
  minesweeper, block-blast, sort-master, tile-match, space-shooter,
  survivor
```

### 6.2 统一接口

```js
// 每个 game.js 必须导出
export function mount(root, ctx) { /* ... */ }

// 可选但推荐
export function sessionMeta(state) { return { stage, level, score }; }
export function serializeState(state) { return { /* 可 JSON 化 */ }; }
export function restoreState(snapshot, ctx) { return state; }
```

### 6.3 自动存档时机

由 `arcade/engine.js` 的 `createArcadeLoop` 提供 `autosaveInterval: 6000`。棋类游戏在每步走完时手动 `ctx.saveSession(snapshot, meta)`。

### 6.4 续玩失败兜底

snapshot 反序列化失败时（manifest 版本升级或字段变更）：
- 清掉无效 snapshot
- 提示「上次进度无法恢复，已重新开始」
- 记录到错误日志（写 localStorage `pandora.errors`，给反馈页用）

---

## 7. 成就系统 v2

### 7.1 分级（共 24 条）

| 分级 | 数量 | 示例 |
|---|---|---|
| 基础（入门） | 8 | 首胜 / 首次完成 / 收藏 1 款 / 玩过 3 种类型 / 解锁全部分类 |
| 进阶（探索） | 10 | 五子棋 hard 胜出 / 2048 通关到 2048 / 数独 medium 5 次 / 街机连击 10 / 在 5 款不同游戏续玩 |
| 精通（挑战） | 6 | 五子棋 devil 胜出 / 数独 hard 不用提示 / 塔防通关 / 街机生还 10 分钟 / 五子棋 100 局 / 收藏满 10 款 |

### 7.2 数据结构

```js
{
  id: "gomoku_hard_win",
  title: "执黑破局",
  desc: "在五子棋困难难度下取胜一次",
  tier: "advanced",
  icon: "trophy-jade",
  progress(stats) { return Math.min(1, (stats.gomokuHardWins||0)); },
  unlocked(stats) { return this.progress(stats) >= 1; }
}
```

`progress` 返回 0–1 用于进度环。

### 7.3 触发钩子

`normalizeResult` 已经统计了胜负。v2 增加：
- `step hook`：每步走完触发（用于「单局 100 步未失误」之类）
- `cross-game hook`：触发后写入 `state.achievements.unlocked[]`，弹 toast

---

## 8. 可访问性与文案

### 8.1 ARIA 基线

- 模态：`role="dialog"` + `aria-modal="true"` ✅（已有）
- 模态打开时焦点移到首个可聚焦元素，关闭时回到触发按钮 ❌
- ESC 关闭 modal ❌
- 模态内焦点循环（Tab/Shift+Tab） ❌
- 卡片网格：`role="grid"` + 方向键导航 ❌

### 8.2 焦点管理（最小实现）

```js
// modals/focus-trap.js
export function trapFocus(panel, { initialFocus, onEscape }) {
  const focusable = () => panel.querySelectorAll(
    'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const trigger = document.activeElement;
  initialFocus?.focus?.() ?? focusable()[0]?.focus();
  const handler = (e) => {
    if (e.key === "Escape") { onEscape?.(); return; }
    if (e.key !== "Tab") return;
    const items = [...focusable()];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  };
  panel.addEventListener("keydown", handler);
  return () => { panel.removeEventListener("keydown", handler); trigger?.focus?.(); };
}
```

### 8.3 文案集中化

所有中文文案抽到 `src/i18n/zh-CN.js`（即便不做多语言，也方便统一改字）：

```js
export const t = {
  lobby: {
    title: "潘多拉魔盒",
    intro: "棋局、解谜、街机与策略，离线也能马上开局。",
    countSuffix: "款游戏"
  },
  modal: {
    settingsTitle: "设置",
    cacheCleared: (n) => `已清除 ${n} 个离线缓存，对局记录已保留。`
  }
  // ...
};
```

---

## 9. PWA 与离线

### 9.1 当前 sw.js 策略

- network-first for HTML
- cache-first for assets

### 9.2 改进点

| 问题 | 方案 |
|---|---|
| 插件资源与核心资源混在同一缓存 | 拆三个 cache：`core-v{n}` / `plugin-assets-v{n}` / `game-icons-v{n}` |
| 版本更新无提示 | sw 检测到新版本时 `postMessage` 给页面，页面顶部 toast「有新版本，点此刷新」 |
| 缓存满 | LRU 删除：保留最近 30 天访问的资源 |
| 反馈页只能跳 GitHub | 增加 mailto: 兜底 + 复制到剪贴板（已有部分） |

### 9.3 更新流程图

```
sw 启动 ─→ 比对 index.html etag
              │
       ┌──────┴──────┐
       ▼             ▼
   有新版本      无变化
       │             │
   通知页面      继续走旧版
       │
   用户点刷新
       │
   skipWaiting + clients.claim
```

---

## 10. 实施路线图

### 10.1 B 档（UI 美学）— 估 3-5 个工作日

```
B1. 抽 token 文件 → src/styles/tokens.css
    依赖：无
    风险：低（纯重命名）

B2. 实装 ink-dark 主题
    依赖：B1
    风险：低（新文件，可独立验收）

B3. 卡片骨架收口（card--compact / standard / hero）
    依赖：B1
    风险：中（影响大厅、历史、收藏三个页面）

B4. 模态视觉刷新 + toast
    依赖：B1
    风险：中（要兼容当前 7 种弹窗）

B5. 游戏内顶栏一致化
    依赖：B4（暂停层承接重开/设置）
    风险：中（要测每款游戏的顶栏行为）
```

### 10.2 C 档（功能）— 估 5-8 个工作日

```
C1. store/ 拆分（preferences / progress / sessions / favorites / runtime）
    依赖：无（但建议先做，否则后续改 AI 也乱）
    风险：中（涉及全局状态改造）

C2. minimax 通用引擎
    依赖：C1
    风险：低（pure module，单测友好）

C3. 五子棋 + 黑白棋 + 跳棋 + 象棋接入
    依赖：C2
    风险：中（每款棋类各自调难度）

C4. 缺失 restoreState 补齐（12 款）  ✅ 已完成
    依赖：无
    风险：低（独立 PR，逐款验收）

C5. 成就系统 v2（24 条 + 进度环）
    依赖：C1
    风险：低

C6. ARIA + 焦点管理
    依赖：B4（模态收口后再加焦点陷阱）
    风险：低
```

### 10.3 依赖图

```
A 档（已完成）
    │
    ▼
B1 tokens ──┬──→ B2 ink-dark
            │
            ├──→ B3 cards ──┐
            │               │
            └──→ B4 modal ──┴──→ B5 顶栏 ──→ C6 ARIA
                                │
C1 store ──→ C2 minimax ──→ C3 接入棋类
   │
   └──→ C5 成就 v2

C4 restoreState 补齐（独立，可任何时候做）  ✅
```

### 10.4 验收清单（每步必查）

- [ ] `npm run check` 通过（syntax + plugin manifest）
- [ ] 大厅可访问、卡片可点击、能正常进入游戏
- [ ] 任意一款棋类（gomoku）和一款街机（tower-defense）在 360 / 720 / 1200 三档视口表现正常
- [ ] 模态可正常打开/关闭，ESC 生效（B5 后）
- [ ] 切主题不闪屏（B2 后）
- [ ] 反复开关游戏不内存泄漏（手动验：开 5 次 tower-defense 看 DevTools Memory）

---

## 11. 不在本期范围

明确**不做**的事，避免范围蔓延：

- 联机对战 / 排行榜（需后端，与「离线 PWA」定位冲突）
- 多语言（架构上文案集中化已留口，落地 i18n 等真有海外用户再做）
- 游戏内充值/广告
- 把游戏改造成 Canvas WebGL（性能够用）
- 把项目迁到 React/Vue（规模未到）
- AI 用 WASM（minimax 在 JS 里 depth 6 内可接受）

---

## 附录 A：关键文件路径速查

| 关注点 | 路径 |
|---|---|
| 改主题色 | `src/styles.css` 的 `:root[data-theme="..."]` 块 |
| 加游戏 | `src/games/<id>/game.js` + `src/games/catalog.js` 注册 + `public/games/<id>/icon.svg` |
| 改大厅布局 | `src/main.js: renderLobby / renderGameCard / renderLobbyDashboard` |
| 改弹窗 | `src/main.js: modalContent / renderModal` |
| 改插件源审核 | `src/views/plugin-sources-view.js` |
| 改音效 | `src/platform/sound.js` |
| 改默认皮肤 | `src/theme/skins.js` + `src/theme/game-visuals.js` |

## 附录 B：v2 文件新增清单（规划）

```
src/
├── store/
│   ├── index.js           createStore
│   ├── preferences.js
│   ├── progress.js
│   ├── sessions.js
│   ├── favorites.js
│   └── runtime.js
├── games/ai/
│   ├── minimax.js
│   ├── eval-helpers.js
│   └── difficulty.js
├── i18n/
│   └── zh-CN.js
├── styles/
│   ├── tokens.css
│   └── themes/
│       ├── guofeng.css
│       ├── ink-dark.css
│       └── mono.css
├── pages/                 (可选，第二阶段)
│   ├── lobby.js
│   ├── play.js
│   ├── history.js
│   ├── favorites.js
│   └── achievements.js
└── modals/                (可选，第二阶段)
    ├── base.js            modal 容器 + focus-trap
    ├── start.js
    ├── rules.js
    ├── pause.js
    ├── result.js
    ├── restart.js
    ├── feedback.js
    ├── settings.js
    └── plugin-source.js

design/
├── theme-ink-dark.md      详细 token 表
├── card-system.md         三种卡片变体的完整规范
└── ai-engine-spec.md      minimax 接口契约 + 各游戏接入示例
```
