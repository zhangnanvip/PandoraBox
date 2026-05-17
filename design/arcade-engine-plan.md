# 街机与复杂游戏通用引擎计划

## 目标

把坦克大战、雷霆战机、贪吃蛇、打砖块、机关塔防这类 Canvas 游戏里重复的循环、输入、暂停、重开、存档、关卡推进能力抽成平台级工具。每个游戏仍然独立插件化交付，但玩法代码只关心状态、规则和绘制。

## 已落地的准备

- 顶部统一重开入口已接入二次确认。
- `context.shell.onRestart(handler)` 成为外壳事件，游戏不需要再把重开按钮塞进移动端控制区。
- `src/games/arcade/engine.js` 开始承载共享能力，当前提供 `bindShellRestart` 和基础 `createArcadeLoop`。

## 第一阶段

- 已把坦克大战和机关塔防作为试点接入 `bindShellRestart`。
- 已迁移五个 Canvas 游戏的 RAF 主循环到 `createArcadeLoop`，统一暂停、时间步长、定时存档。
- 保留每个游戏自己的 `initialState`、`update`、`draw`、`serializeState`、`sessionMeta`，避免玩法被过度抽象。

## 第二阶段

- 抽 `StageManager`：关卡、波次、Boss、结算、下一关提示。
- 抽 `InputManager`：虚拟摇杆、拖动、长按开火、键盘映射、方向滑动。
- 抽 `Collision`：矩形、圆形、网格碰撞、拾取物判定。
- 抽 `Effects`：爆炸、屏幕震动、命中特效、道具飘字。

## 边界

引擎只处理通用调度和工具，不强行规定游戏世界的数据结构。坦克、飞机、蛇、砖块、塔防的实体模型仍放在各自游戏里维护。
