# PandoraBox 项目约定

## 开发节奏

**每轮开发完都要：**
1. **验证**：用 Claude Preview（`.claude/launch.json` 已配 python3 静态 server，端口 5173）启动应用，确认页面能渲染、控制台无 error/warn、关键交互正常。本地无 node 环境跑不了 `npm run check`，靠浏览器跑通替代。
2. **提交**：`git commit` 带中文 commit message，遵循近期风格（首行不带 type 前缀，正文分段说明改动 + 校验结论）。
3. **推送**：`git push origin main`。GitHub Pages workflow 监听 push 触发，先跑 `npm run check` 再 deploy 到 https://zhangnanvip.github.io/PandoraBox/。

这三步是默认行为，不需要每轮再问。

## 关键路径

- `design/v2-evolution-plan.md` — v2 演进总计划（B/C 档子项进度）
- `src/games/catalog.js` — 80 款本地游戏注册 + `MARKET_HEAT` 字典（新增 56 款图标在 `public/games/extra/icons/`）
- `src/main.js` — 装配 + 路由 + 状态 + 事件分发
- `src/styles.css` — 全站样式，末尾按 B 档段落追加新规则
- `src/styles/tokens.css` + `src/styles/themes/*.css` — 设计 token 与主题
- `src/views/` — 纯渲染模板（icons / labels / previews / plugin-sources-view）
- `src/utils/focus-trap.js` — modal 焦点陷阱

## 卡片 meta 行约定

每张游戏卡 meta 行四项语义独立，不要重复：
- `game.tag` — 玩法风格短语（"策略入门" / "方块爆款" 等品类化标签，原文 catalog 定义）
- `category.shortTitle` — 大类（"棋局" / "解谜" 等）
- `🔥 marketHeat.score` — 当前热度数字（每张卡常驻，**只显示分数不显示 label**，避免与 tag 撞文案）
- 可续玩 — 仅 `capabilities.sessionSave === true` 时显示

Hero 卡 eyebrow 用 `"热门推荐 · 热度 ${score}"`，**不要**用 `marketHeat.label`（会跟下方 tag 重复）。
