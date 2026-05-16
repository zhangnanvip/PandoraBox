import { bindVirtualJoystick, directionFromSwipe, joystickMarkup } from "../arcade/controls.js";
import { addBurst, classicArcade, drawEffects, drawFood, drawSnakeArena, drawSnakeSegment, shakeOffset, updateEffects } from "../arcade/classic-visuals.js";

const SIZE = 18;
const CELL = 20;
const W = SIZE * CELL;
const CONFIG = {
  easy: { tick: 0.17, target: 12 },
  medium: { tick: 0.135, target: 18 },
  hard: { tick: 0.105, target: 24 },
  devil: { tick: 0.078, target: 30 }
};
const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function randomFood(snake) {
  const occupied = new Set(snake.map(keyOf));
  let food = { x: 9, y: 9 };
  do {
    food = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
  } while (occupied.has(keyOf(food)));
  return food;
}

function cellCenter(cell) {
  return { x: cell.x * CELL + CELL / 2, y: cell.y * CELL + CELL / 2 };
}

function initialState() {
  const snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  return {
    snake,
    food: randomFood(snake),
    dir: "right",
    nextDir: "right",
    score: 0,
    time: 0,
    over: false,
    won: false,
    message: "吃到能量豆，越长越快",
    effects: [],
    shake: 0
  };
}

function canTurn(current, next) {
  return !((current === "up" && next === "down") || (current === "down" && next === "up") || (current === "left" && next === "right") || (current === "right" && next === "left"));
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "完成目标长度" : "撞上了";
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
  if (head.x < 0 || head.y < 0 || head.x >= SIZE || head.y >= SIZE || state.snake.some((cell) => cell.x === head.x && cell.y === head.y)) {
    const currentHead = cellCenter(state.snake[0]);
    addBurst(state.effects, currentHead.x, currentHead.y, { count: 22, color: classicArcade.red, secondary: classicArcade.yellow, speed: 90, radius: 12 });
    state.shake = Math.max(state.shake, 5);
    finish(state, false, context);
    return;
  }

  state.snake.unshift(head);
  if (head.x === state.food.x && head.y === state.food.y) {
    state.score += 10;
    const foodCenter = cellCenter(head);
    addBurst(state.effects, foodCenter.x, foodCenter.y, { count: 14, color: classicArcade.green, secondary: classicArcade.yellow, speed: 72, radius: 9 });
    state.food = randomFood(state.snake);
    state.message = `长度 ${state.snake.length}/${config.target}`;
    context.playSound?.("score");
    if (state.snake.length >= config.target) finish(state, true, context);
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
  drawFood(ctx, state.food, CELL);
  state.snake.forEach((cell, index) => {
    drawSnakeSegment(ctx, cell, index, CELL, state.dir);
  });
  drawEffects(ctx, state.effects);
  ctx.restore();
}

export function mountSnake(root, context) {
  const config = CONFIG[context.difficulty] || CONFIG.medium;
  let state = initialState();
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let disposed = false;
  const controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 };
  let pointerStart = null;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels.difficulty} · 目标长度 ${config.target}</p>
      </div>
      <div class="mini-stats">
        <span data-score>分数 0</span>
        <span data-length>长度 3</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${W}" aria-label="贪吃蛇"></canvas></div>
      <div class="arcade-controls">
        ${joystickMarkup("贪吃蛇方向")}
        <div class="arcade-control-stack">
          <button class="arcade-fire compact" data-action="restart">重开</button>
        </div>
      </div>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const score = root.querySelector("[data-score]");
  const length = root.querySelector("[data-length]");

  function setDir(dir) {
    state.nextDir = dir;
  }

  function restart() {
    state = initialState();
    acc = 0;
    last = performance.now();
  }

  function loop(now) {
    if (disposed) return;
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    state.time += dt;
    updateEffects(state.effects, dt);
    state.shake = Math.max(0, state.shake - dt * 18);
    acc += dt;
    while (acc >= config.tick) {
      acc -= config.tick;
      step(state, config, context);
    }
    draw(state, ctx);
    status.textContent = state.message;
    score.textContent = `分数 ${state.score}`;
    length.textContent = `长度 ${state.snake.length}`;
    raf = requestAnimationFrame(loop);
  }

  const onKey = (event) => {
    const map = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    const dir = map[event.code];
    if (!dir) return;
    event.preventDefault();
    setDir(dir);
  };
  const cleanupJoystick = bindVirtualJoystick(root, controls, { onDirection: setDir });
  const onPointerDown = (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    if (!pointerStart) return;
    const dir = directionFromSwipe(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (dir) setDir(dir);
    pointerStart = null;
  };
  const onPointerCancel = () => {
    pointerStart = null;
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  window.addEventListener("keydown", onKey);
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cleanupJoystick();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKey);
  };
}
