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
    message: "吃到朱果，越长越快"
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
    finish(state, false, context);
    return;
  }

  state.snake.unshift(head);
  if (head.x === state.food.x && head.y === state.food.y) {
    state.score += 10;
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
  ctx.fillStyle = "#162820";
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = "rgba(255,250,240,.08)";
  for (let i = 0; i <= SIZE; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, W);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(W, i * CELL);
    ctx.stroke();
  }
  ctx.fillStyle = "#b63b2b";
  ctx.beginPath();
  ctx.arc(state.food.x * CELL + CELL / 2, state.food.y * CELL + CELL / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  state.snake.forEach((cell, index) => {
    ctx.fillStyle = index === 0 ? "#d79d38" : "#1f8d67";
    ctx.fillRect(cell.x * CELL + 2, cell.y * CELL + 2, CELL - 4, CELL - 4);
  });
}

export function mountSnake(root, context) {
  const config = CONFIG[context.difficulty] || CONFIG.medium;
  let state = initialState();
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let disposed = false;

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
    <section class="arcade-shell">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${W}" aria-label="贪吃蛇"></canvas></div>
      <div class="arcade-controls">
        <div class="arcade-dpad" aria-label="移动方向">
          <button data-control="up">上</button>
          <button data-control="left">左</button>
          <button data-control="right">右</button>
          <button data-control="down">下</button>
        </div>
        <button class="arcade-fire" data-action="restart">重开</button>
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
  root.querySelectorAll("[data-control]").forEach((button) => {
    button.addEventListener("click", () => setDir(button.dataset.control));
  });
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  window.addEventListener("keydown", onKey);
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
  };
}
