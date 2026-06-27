import { choice, clamp } from "../../utils/random.js";

// 接福：自包含落物接物街机。仅依赖 utils，不引用 arcade/*。
const W = 320;
const H = 340;
const BASKET_W = 64;
const BASKET_H = 18;
const MAX_LIVES = 3;
const GOOD = [
  { glyph: "福", color: "#f6c453", score: 10 },
  { glyph: "财", color: "#5cd6a6", score: 12 },
  { glyph: "禄", color: "#6db4ff", score: 14 }
];
const BOMB = { glyph: "炸", color: "#ff6b6b" };

const TUNING = {
  easy: { fall: 96, accel: 4, spawn: 1.05, bombRate: 0.12 },
  medium: { fall: 124, accel: 7, spawn: 0.86, bombRate: 0.2 },
  hard: { fall: 156, accel: 10, spawn: 0.7, bombRate: 0.3 },
  devil: { fall: 188, accel: 14, spawn: 0.56, bombRate: 0.42 }
};

function tuning(difficulty) {
  return TUNING[difficulty] || TUNING.medium;
}

function initialState() {
  return {
    basketX: W / 2 - BASKET_W / 2,
    items: [],
    score: 0,
    lives: MAX_LIVES,
    time: 0,
    spawn: 0,
    over: false,
    message: "用手指或方向键接住落下的福，躲开炸"
  };
}

function spawnItem(state, conf) {
  const isBomb = Math.random() < conf.bombRate;
  const kind = isBomb ? BOMB : choice(GOOD);
  state.items.push({
    x: 16 + Math.random() * (W - 64),
    y: -28,
    bomb: isBomb,
    glyph: kind.glyph,
    color: kind.color,
    score: kind.score || 0,
    vy: conf.fall + state.time * conf.accel
  });
}

function update(state, dt, conf, context) {
  if (state.over) return;
  state.time += dt;
  state.spawn += dt;
  if (state.spawn >= conf.spawn) {
    state.spawn = 0;
    spawnItem(state, conf);
  }
  const basketTop = H - BASKET_H - 8;
  for (let i = state.items.length - 1; i >= 0; i -= 1) {
    const item = state.items[i];
    item.y += item.vy * dt;
    const caught = item.y + 24 >= basketTop && item.x + 12 > state.basketX && item.x + 12 < state.basketX + BASKET_W;
    if (caught) {
      state.items.splice(i, 1);
      if (item.bomb) {
        state.lives -= 1;
        state.message = state.lives > 0 ? "接到炸弹！还剩 " + state.lives + " 条命" : "命没了";
        context.playSound?.("hit");
        if (state.lives <= 0) finish(state, context);
      } else {
        state.score += item.score;
        state.message = "+" + item.score;
        context.playSound?.("score");
      }
    } else if (item.y > H + 24) {
      state.items.splice(i, 1);
    }
  }
}

function finish(state, context) {
  if (state.over) return;
  state.over = true;
  state.lives = 0;
  state.message = "接住 " + state.score + " 分，再来一局！";
  context.clearSession?.();
  context.reportResult?.({ outcome: "score", detail: state.message, score: state.score });
}

function drawItem(ctx, item) {
  ctx.beginPath();
  ctx.fillStyle = item.color;
  ctx.arc(item.x + 12, item.y + 12, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#10131c";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.glyph, item.x + 12, item.y + 13);
}

function draw(state, ctx) {
  ctx.fillStyle = "#11131d";
  ctx.fillRect(0, 0, W, H);
  state.items.forEach((item) => drawItem(ctx, item));
  ctx.fillStyle = "#f6c453";
  ctx.fillRect(state.basketX, H - BASKET_H - 8, BASKET_W, BASKET_H);
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.fillRect(state.basketX, H - BASKET_H - 8, BASKET_W, 5);
}

export function mountCatcher(root, context) {
  const conf = tuning(context.difficulty);
  let state = initialState();
  let raf = 0;
  let disposed = false;
  let last = performance.now();

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">接福得分，碰炸丢命，共 ${MAX_LIVES} 条命，速度渐快</p>
      </div>
      <div class="mini-stats">
        <span data-score>分 0</span>
        <span data-lives>命 ${MAX_LIVES}</span>
      </div>
    </section>
    <section class="board-wrap" style="display:flex;flex-direction:column;align-items:center;gap:12px;">
      <canvas width="${W}" height="${H}" style="max-width:340px;width:100%;height:auto;border-radius:14px;touch-action:none;background:#11131d;" aria-label="接福"></canvas>
      <button class="secondary-button" data-restart type="button">重开</button>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = root.querySelector("[data-score]");
  const livesEl = root.querySelector("[data-lives]");
  const statusEl = root.querySelector("[data-status]");
  const restartBtn = root.querySelector("[data-restart]");

  function moveTo(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W - BASKET_W / 2;
    state.basketX = clamp(x, 0, W - BASKET_W);
  }
  function onPointer(event) {
    moveTo(event.clientX);
    event.preventDefault();
  }
  function onKey(event) {
    const step = 26;
    if (event.code === "ArrowLeft") state.basketX = clamp(state.basketX - step, 0, W - BASKET_W);
    else if (event.code === "ArrowRight") state.basketX = clamp(state.basketX + step, 0, W - BASKET_W);
    else return;
    event.preventDefault();
  }
  function restart() {
    state = initialState();
    context.clearSession?.();
  }

  function frame(now) {
    if (disposed) return;
    if (!context.isPaused?.()) {
      const dt = Math.min(0.05, (now - last) / 1000);
      update(state, dt, conf, context);
    }
    last = now;
    draw(state, ctx);
    scoreEl.textContent = "分 " + state.score;
    livesEl.textContent = "命 " + state.lives;
    statusEl.textContent = state.message;
    raf = requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointerdown", onPointer);
  canvas.addEventListener("pointermove", onPointer);
  window.addEventListener("keydown", onKey);
  restartBtn.addEventListener("click", restart);
  const onShellRestart = context.shell?.onRestart?.(restart);
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointer);
    canvas.removeEventListener("pointermove", onPointer);
    window.removeEventListener("keydown", onKey);
    restartBtn.removeEventListener("click", restart);
    onShellRestart?.();
  };
}
