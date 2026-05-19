import { bindActionKeys, bindSwipeDirection } from "../arcade/controls.js";
import { gridCellInBounds, gridKey, sameGridCell } from "../arcade/collision.js";
import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { feedbackTimeScale, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { classicArcade, drawFood, drawPixelRect, drawPowerup, drawSnakeArena, drawSnakeSegment } from "../arcade/classic-visuals.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { announceStageStart, drawStageTransition, updateStageTransition } from "../arcade/progression.js";
import { advanceStage, isFinalStage, restoreStageLevel, stageLabel, stageMeta } from "../arcade/stages.js";

const SIZE = 18;
const CELL = 20;
const W = SIZE * CELL;
const CONFIG = { tick: 0.138, target: 18, obstacles: 2 };
const MAX_LEVEL = 30;
const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function randomFood(snake, obstacles = []) {
  const occupied = new Set([...snake.map(gridKey), ...obstacles.map(gridKey)]);
  let food = { x: 9, y: 9 };
  do {
    food = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
  } while (occupied.has(gridKey(food)));
  const roll = Math.random();
  return {
    ...food,
    type: roll > 0.88 ? "shield" : roll > 0.72 ? "slow" : roll > 0.58 ? "bonus" : "normal"
  };
}

function cellCenter(cell) {
  return { x: cell.x * CELL + CELL / 2, y: cell.y * CELL + CELL / 2 };
}

function makeObstacles(count, snake) {
  const obstacles = [];
  const blocked = new Set(snake.map(gridKey));
  while (obstacles.length < count) {
    const cell = { x: 2 + Math.floor(Math.random() * (SIZE - 4)), y: 2 + Math.floor(Math.random() * (SIZE - 4)) };
    if (blocked.has(gridKey(cell)) || Math.abs(cell.x - 8) < 3 && Math.abs(cell.y - 10) < 3) continue;
    blocked.add(gridKey(cell));
    obstacles.push(cell);
  }
  return obstacles;
}

function levelTuning(config, level) {
  const chapter = Math.floor((level - 1) / 6);
  return {
    tick: Math.max(0.062, config.tick - (level - 1) * 0.0034 - chapter * 0.004),
    target: Math.min(42, Math.max(10, Math.round(config.target * 0.5) + level + chapter * 2)),
    obstacles: Math.min(22, config.obstacles + Math.floor((level - 1) * 0.72) + chapter)
  };
}

function initialState(config) {
  const levelConfig = levelTuning(config, 1);
  const snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  const obstacles = makeObstacles(levelConfig.obstacles, snake);
  return {
    level: 1,
    maxLevel: MAX_LEVEL,
    levelConfig,
    snake,
    obstacles,
    food: randomFood(snake, obstacles),
    dir: "right",
    nextDir: "right",
    eaten: 0,
    score: 0,
    slow: 0,
    shield: 0,
    time: 0,
    over: false,
    won: false,
    message: `第 1 关：吃到 ${levelConfig.target} 个能量豆`,
    effects: [],
    shake: 0
  };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeState(state) {
  const snapshot = clonePlain(state);
  delete snapshot.levelConfig;
  snapshot.effects = [];
  snapshot.shake = 0;
  snapshot.transition = null;
  snapshot.feedback = null;
  snapshot.over = false;
  snapshot.won = false;
  snapshot.version = 1;
  return snapshot;
}

function restoreState(config, savedState) {
  if (!savedState || savedState.version !== 1 || savedState.over) return initialState(config);
  const fallback = initialState(config);
  const snapshot = clonePlain(savedState);
  const level = restoreStageLevel(snapshot.level, MAX_LEVEL);
  return {
    ...fallback,
    ...snapshot,
    level,
    maxLevel: MAX_LEVEL,
    levelConfig: levelTuning(config, level),
    effects: [],
    transition: null,
    feedback: null,
    shake: 0,
    over: false,
    won: false
  };
}

function sessionMeta(state) {
  return {
    level: stageMeta(state),
    score: state.score
  };
}

function resetSnakeForLevel(state, config, context) {
  const snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  state.levelConfig = levelTuning(config, state.level);
  state.snake = snake;
  state.obstacles = makeObstacles(state.levelConfig.obstacles, snake);
  state.food = randomFood(state.snake, state.obstacles);
  state.dir = "right";
  state.nextDir = "right";
  state.eaten = 0;
  state.slow = 0;
  state.shield = 0;
  announceStageStart(state, context, {
    message: `第 ${state.level} 关：吃到 ${state.levelConfig.target} 个能量豆`,
    transition: {
      title: `第 ${stageMeta(state)} 关`,
      subtitle: `目标 ${state.levelConfig.target} 个能量豆`
    },
    effects: state.effects,
    position: { x: W / 2, y: W / 2 },
    burst: { count: 28, color: classicArcade.green, secondary: classicArcade.yellow, speed: 86, radius: 22 },
    shake: 2.8
  });
}

function advanceLevel(state, config, context) {
  advanceStage(state);
  resetSnakeForLevel(state, config, context);
}

function canTurn(current, next) {
  return !((current === "up" && next === "down") || (current === "down" && next === "up") || (current === "left" && next === "right") || (current === "right" && next === "left"));
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "完成全部任务" : "撞上了";
  context.clearSession?.();
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    detail: state.message,
    score: state.score,
    moves: Math.round(state.time)
  });
}

function step(state, config, context) {
  if (state.over) return;
  if (canTurn(state.dir, state.nextDir)) state.dir = state.nextDir;
  const dir = DIRS[state.dir];
  const head = { x: state.snake[0].x + dir.x, y: state.snake[0].y + dir.y };
  const hitObstacle = state.obstacles.find((cell) => sameGridCell(cell, head));
  if (hitObstacle && state.shield > 0) {
    const center = cellCenter(hitObstacle);
    state.obstacles = state.obstacles.filter((cell) => cell !== hitObstacle);
    state.shield = 0;
    state.message = "护盾破障";
    triggerHitStop(state, 0.045, 0.55);
    addBurst(state.effects, center.x, center.y, { count: 18, color: classicArcade.blue, secondary: classicArcade.white, speed: 82, radius: 10 });
    addFloatingText(state.effects, center.x, center.y - 12, "破障", { color: classicArcade.blue });
    context.playSound?.("move");
    return;
  }
  if (!gridCellInBounds(head, SIZE) || hitObstacle || state.snake.some((cell) => sameGridCell(cell, head))) {
    const currentHead = cellCenter(state.snake[0]);
    addBurst(state.effects, currentHead.x, currentHead.y, { count: 22, color: classicArcade.red, secondary: classicArcade.yellow, speed: 90, radius: 12 });
    triggerHitStop(state, 0.09, 0.35);
    state.shake = Math.max(state.shake, 5);
    finish(state, false, context);
    return;
  }

  state.snake.unshift(head);
  if (sameGridCell(head, state.food)) {
    state.score += state.food.type === "bonus" ? 35 : 10;
    state.eaten += 1;
    const foodCenter = cellCenter(head);
    addBurst(state.effects, foodCenter.x, foodCenter.y, { count: 14, color: classicArcade.green, secondary: classicArcade.yellow, speed: 72, radius: 9 });
    addFloatingText(state.effects, foodCenter.x, foodCenter.y - 12, state.food.type === "bonus" ? "+35" : "+10", { color: classicArcade.yellow });
    if (state.food.type === "slow") {
      state.slow = 6;
      state.message = "慢速能量：节奏放缓";
    } else if (state.food.type === "shield") {
      state.shield = 1;
      state.message = "护盾能量：可破障一次";
    } else {
      state.message = `第 ${state.level} 关任务 ${state.eaten}/${state.levelConfig.target}`;
    }
    state.food = randomFood(state.snake, state.obstacles);
    context.playSound?.("score");
    if (state.eaten >= state.levelConfig.target) {
      if (isFinalStage(state)) finish(state, true, context);
      else advanceLevel(state, config, context);
    }
  } else {
    state.snake.pop();
  }
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  const offset = shakeOffset(state.shake);
  ctx.translate(offset.x, offset.y);
  drawSnakeArena(ctx, SIZE, CELL);
  state.obstacles.forEach((cell) => {
    drawPixelRect(ctx, cell.x * CELL + 2, cell.y * CELL + 2, CELL - 4, CELL - 4, classicArcade.magenta, "rgba(255,255,255,.2)");
  });
  if (state.food.type === "normal") {
    drawFood(ctx, state.food, CELL);
  } else {
    const center = cellCenter(state.food);
    drawPowerup(ctx, { type: state.food.type, x: center.x, y: center.y });
  }
  state.snake.forEach((cell, index) => {
    drawSnakeSegment(ctx, cell, index, CELL, state.dir);
  });
  drawEffects(ctx, state.effects);
  ctx.restore();
  drawStageTransition(ctx, W, W, state.transition);
}

export function mountSnake(root, context) {
  const config = CONFIG;
  let state = restoreState(config, context.savedState);
  let acc = 0;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>单人闯关 · ${MAX_LEVEL} 关任务 · 滑动转向</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/${MAX_LEVEL}</span>
        <span data-score>分数 0</span>
        <span data-length>任务 0/${state.levelConfig.target}</span>
        <span data-power>道具 无</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${W}" aria-label="贪吃蛇"></canvas></div>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const note = root.querySelector("[data-note]");
  const level = root.querySelector("[data-level]");
  const score = root.querySelector("[data-score]");
  const length = root.querySelector("[data-length]");
  const power = root.querySelector("[data-power]");

  function setDir(dir) {
    state.nextDir = dir;
  }

  function restart() {
    state = initialState(config);
    acc = 0;
    context.clearSession?.();
    loop.resetClock();
  }

  function refreshHud() {
    status.textContent = state.message;
    note.textContent = `第 ${stageMeta(state)} 关 · 障碍 ${state.levelConfig.obstacles}`;
    level.textContent = stageLabel(state);
    score.textContent = `分数 ${state.score}`;
    length.textContent = `任务 ${state.eaten}/${state.levelConfig.target}`;
    power.textContent = [state.slow > 0 ? `慢速 ${Math.ceil(state.slow)}` : "", state.shield > 0 ? "护盾 1" : ""].filter(Boolean).join(" · ") || "道具 无";
  }

  const loop = createArcadeLoop({
    context,
    maxDelta: 0.08,
    timeScale: () => feedbackTimeScale(state),
    update: (dt, rawDt) => {
      state.time += dt;
      updateEffects(state.effects, dt);
      updateFeedback(state, rawDt);
      updateStageTransition(state, dt);
      state.shake = Math.max(0, state.shake - dt * 18);
      state.slow = Math.max(0, state.slow - dt);
      acc += dt;
      const tick = state.levelConfig.tick * (state.slow > 0 ? 1.38 : 1);
      while (acc >= tick) {
        acc -= tick;
        step(state, config, context);
      }
    },
    draw: () => {
      draw(state, ctx);
      refreshHud();
    },
    save: () => {
      if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    }
  });

  const cleanupKeys = bindActionKeys({
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right"
  }, setDir);
  const cleanupSwipe = bindSwipeDirection(canvas, setDir, { preventDefault: true });
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupKeys();
    cleanupSwipe();
    cleanupShellRestart();
  };
}
