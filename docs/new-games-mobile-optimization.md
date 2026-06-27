# 26 款新游戏移动适配 / 可玩性优化（反思 + 调研）

> 范围：24→50 扩充的 26 款。审计基准 390×844，目标 360px 无横向滚动、触控≥40px、视网膜清晰。

## 已完成（轮1-4）
| 轮 | 主题 | 改动 |
|---|---|---|
| 1 | 视口溢出 | 全量 390px 审计；数织 devil 15×15 网格 400→362，格子改 `clamp((min(w,400)-56)/n,…)` 自适应 |
| 2 | 画布高清 | tetris/flappy/pong/bubble/doodle/catcher/jump-tap 后备分辨率×dpr + `setTransform`，视网膜不糊；whack/simon 已带 touch-action |
| 3 | 触控/可读 | 数织最小格 18、迷宫 12；接龙 34×48→40×56；21点牌 44×64→52×72 字号16 |
| 4 | 误触 | 点格棋未连边命中区 14→20px |

## 反思
- 移动**适配**本就达标：26 款仅数织溢出，其余 max-width 已生效。最大收益其实是**高清**（全画布缺 dpr，是糊的根因）与**密集网格可读**。
- 棋牌/对弈类已具 AI「思考中」与重开/胜负，结构健康。
- 子代理审计有夸大（whack/simon 实际有 touch-action；连四列宽已≥48），需亲测复核。

## 调研：下一步可玩性优化 backlog（按性价比）
1. **反射类难度曲线**：flappy/doodle/jump-tap 起步偏陡，建议 easy/medium 间隙更宽、初速更慢、加 1-2s 起跳缓冲。
2. **结算亮点**：solitaire/24point 等通关缺即时弹窗确认，复用 result modal 的 extra 高亮。
3. **震动反馈**：whack 命中、tetris 消行、catcher 接中 `navigator.vibrate(15)`。
4. **音效统一**：simon 之外的解谜/消除接 `playSound`（消除/胜负/失败）。
5. **首玩引导**：泡泡/水管/数织首屏 1 行操作提示，3s 淡出。
6. **横屏**：街机类 `orientation` 提示竖屏更佳。
</content>
