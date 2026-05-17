# 复杂游戏 SDK 说明

PandoraBox 的街机、塔防、动作类游戏仍然是独立游戏模块，但共用 `src/games/arcade/` 下的一组轻量 SDK。SDK 只处理循环、输入、碰撞、反馈、关卡、Boss、奖励和存档辅助，不接管具体玩法规则。

## 模块分工

- `engine.js`：统一 `requestAnimationFrame` 循环、暂停、定时存档、顶部重开事件；支持 `timeScale()` 做短暂停顿/慢动作。
- `controls.js`：方向键、动作键、虚拟摇杆、拖动和滑动方向。
- `collision.js`：矩形、中心矩形、圆形、网格、距离等通用判定。
- `effects.js`：爆炸、飘字、屏幕震动偏移。
- `feedback.js`：受击闪烁、命中高亮、Boss/重击短暂停顿。
- `stages.js`：关卡范围、关卡标签、下一关、塔防波次编号。
- `progression.js`：下一关过场、波次完成提示、奖励结算飘字。
- `bosses.js`：Boss 创建、血量比例、血量文案、统一 Boss 出场演出。
- `rewards.js`：道具掉落判定、拾取物生成、过期、收集。
- `classic-visuals.js`：经典街机默认视觉素材和 Canvas 绘制工具。

## 新游戏推荐结构

每个游戏保留自己的：

- `CONFIG`：按 `easy / medium / hard / devil` 定义难度。
- `initialState(config)`：初始状态。
- `restoreState(config, savedState)` / `serializeState(state)`：续玩存档。
- `sessionMeta(state)`：最近列表展示信息。
- `update(state, config, controls, dt, context, rawDt)`：玩法推进。
- `draw(state, ctx)`：Canvas 绘制。
- `mountGame(root, context)`：DOM、控制绑定、循环和清理。

## 新增复杂游戏清单

1. 在 `src/games/<game-id>/game.js` 里实现 `mountXxx(root, context)`。
2. 如果是内置游戏，在 `src/games/catalog.js` 注册游戏并加入 `precacheAssets`。
3. 如果适合全屏，声明 `capabilities.fullscreen = true`。
4. 如果支持续玩，声明 `capabilities.sessionSave = true`，并确保 `serializeState` 不保存临时特效。
5. 使用 `createArcadeLoop` 时接入 `context.isPaused()`、`saveSession`、`bindShellRestart`。
6. 闯关类接入 `stages.js`、`progression.js`；Boss 类接入 `bosses.js`；拾取物接入 `rewards.js`。
7. 提交前运行：

```bash
node scripts/check-syntax.mjs
node scripts/check-plugins.mjs
```

## 模板

可从 [arcade-game-template.js](./templates/arcade-game-template.js) 复制骨架。复制到 `src/games/<game-id>/game.js` 后，把导入路径、画布尺寸、规则、绘制和注册信息替换成真实游戏。

模板故意只提供状态、循环、反馈、存档和清理骨架，不包含具体玩法，避免后续游戏被同一种规则结构绑死。
