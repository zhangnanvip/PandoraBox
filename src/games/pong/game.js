import { clamp } from "../../utils/random.js";

const W = 320;
const H = 440;
const PADDLE_W = 76;
const PADDLE_H = 12;
const PADDLE_INSET = 16;
const BALL_R = 7;
const WIN_SCORE = 7;
const PLAYER_KEY_SPEED = 360;

const DIFF = {
  easy: { ai: 0.55, ball: 168, accel: 1.04, label: "轻松" },
  medium: { ai: 0.72, ball: 200, accel: 1.06, label: "标准" },
  hard: { ai: 0.86, ball: 240, accel: 1.08, label: "困难" },
  devil: { ai: 0.96, ball: 288, accel: 1.1, label: "地狱" }
};

function tuning(difficulty) {
  return DIFF[difficulty] || DIFF.medium;
}

function serveBall(toPlayer, speed) {
  // vy points toward the player who must defend; toPlayer => downward (positive y)
  const dir = toPlayer ? 1 : -1;
  return {
    x: W / 2,
    y: H / 2,
    vx: speed * 0.5 * (Math.random() < 0.5 ? -1 : 1),
    vy: dir * speed,
    spawn: 0.7
  };
}

function initialState(t) {
  return {
    player: { x: W / 2 },
    ai: { x: W / 2 },
    ball: serveBall(Math.random() < 0.5, t.ball),
    speed: t.ball,
    playerScore: 0,
    aiScore: 0,
    over: false,
    won: false,
    message: `先到 ${WIN_SCORE} 分获胜`
  };
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "你赢下了对局" : "AI 拿下了对局";
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    score: state.playerScore,
    detail: `${state.playerScore} : ${state.aiScore}`
  });
}

function update(state, dt, control, t, context) {
  if (state.over) return;
  // player paddle
  const move = (control.right ? 1 : 0) - (control.left ? 1 : 0);
  if (Number.isFinite(control.pointerX)) {
    state.player.x = control.pointerX;
  } else if (move) {
    state.player.x += move * PLAYER_KEY_SPEED * dt;
  }
  state.player.x = clamp(state.player.x, PADDLE_W / 2, W - PADDLE_W / 2);

  // ai paddle tracks ball with capped speed
  const aiSpeed = state.speed * t.ai;
  const aiTarget = state.ball.vy < 0 ? state.ball.x : W / 2;
  const diff = aiTarget - state.ai.x;
  state.ai.x += clamp(diff, -aiSpeed * dt, aiSpeed * dt);
  state.ai.x = clamp(state.ai.x, PADDLE_W / 2, W - PADDLE_W / 2);

  const b = state.ball;
  if (b.spawn > 0) {
    b.spawn = Math.max(0, b.spawn - dt);
    return;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
  if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }

  const playerY = H - PADDLE_INSET - PADDLE_H;
  const aiY = PADDLE_INSET;
  if (b.vy > 0 && b.y + BALL_R >= playerY && b.y + BALL_R <= playerY + PADDLE_H + 6 && Math.abs(b.x - state.player.x) <= PADDLE_W / 2 + BALL_R) {
    b.y = playerY - BALL_R;
    b.vy = -Math.abs(b.vy);
    b.vx += ((b.x - state.player.x) / (PADDLE_W / 2)) * state.speed * 0.6;
    state.speed = Math.min(state.speed * t.accel, t.ball * 1.7);
    context.playSound?.("move");
  }
  if (b.vy < 0 && b.y - BALL_R <= aiY + PADDLE_H && b.y - BALL_R >= aiY - 6 && Math.abs(b.x - state.ai.x) <= PADDLE_W / 2 + BALL_R) {
    b.y = aiY + PADDLE_H + BALL_R;
    b.vy = Math.abs(b.vy);
    b.vx += ((b.x - state.ai.x) / (PADDLE_W / 2)) * state.speed * 0.6;
    state.speed = Math.min(state.speed * t.accel, t.ball * 1.7);
    context.playSound?.("move");
  }

  if (b.y > H + 20) {
    state.aiScore += 1;
    state.speed = t.ball;
    context.playSound?.("score");
    if (state.aiScore >= WIN_SCORE) finish(state, false, context);
    else { Object.assign(state.ball, serveBall(false, t.ball)); state.message = `落后 ${state.playerScore} : ${state.aiScore}`; }
  } else if (b.y < -20) {
    state.playerScore += 1;
    state.speed = t.ball;
    context.playSound?.("score");
    if (state.playerScore >= WIN_SCORE) finish(state, true, context);
    else { Object.assign(state.ball, serveBall(true, t.ball)); state.message = `领先 ${state.playerScore} : ${state.aiScore}`; }
  }
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0b1224";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(125,211,252,.35)";
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#7dd3fc";
  ctx.fillRect(state.player.x - PADDLE_W / 2, H - PADDLE_INSET - PADDLE_H, PADDLE_W, PADDLE_H);
  ctx.fillStyle = "#f472b6";
  ctx.fillRect(state.ai.x - PADDLE_W / 2, PADDLE_INSET, PADDLE_W, PADDLE_H);
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
}

export function mountPong(root, context) {
  const t = tuning(context.difficulty);
  let state = initialState(t);
  const control = { left: false, right: false, pointerX: NaN };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels?.mode || "对战 AI"} · ${context.labels?.difficulty || t.label} · 先到 ${WIN_SCORE} 分</p>
      </div>
      <div class="mini-stats">
        <span data-you>你 0</span>
        <span data-ai>AI 0</span>
      </div>
    </section>
    <section class="board-wrap" style="display:flex;flex-direction:column;gap:12px;align-items:center;padding:8px">
      <canvas width="${W}" height="${H}" style="width:100%;max-width:320px;border-radius:14px;touch-action:none;background:#0b1224" aria-label="弹球对战"></canvas>
      <div style="display:flex;gap:10px"><button class="danger-button" data-action="restart">重开</button></div>
    </section>
  `;
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const youEl = root.querySelector("[data-you]");
  const aiEl = root.querySelector("[data-ai]");

  function restart() {
    state = initialState(t);
    control.pointerX = NaN;
  }

  function pointerTo(event) {
    const rect = canvas.getBoundingClientRect();
    control.pointerX = ((event.clientX - rect.left) / rect.width) * W;
  }
  const onDown = (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); pointerTo(e); };
  const onMove = (e) => { if (Number.isFinite(control.pointerX)) { e.preventDefault(); pointerTo(e); } };
  const onUp = (e) => { canvas.releasePointerCapture?.(e.pointerId); control.pointerX = NaN; };
  const onKey = (e) => {
    const down = e.type === "keydown";
    if (e.key === "ArrowLeft" || e.key === "a") { control.left = down; control.pointerX = NaN; }
    else if (e.key === "ArrowRight" || e.key === "d") { control.right = down; control.pointerX = NaN; }
    else return;
    e.preventDefault();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  root.querySelector('[data-action="restart"]').addEventListener("click", restart);

  let raf = 0;
  let last = 0;
  const frame = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!context.isPaused?.()) update(state, dt, control, t, context);
    draw(state, ctx);
    status.textContent = state.message;
    youEl.textContent = `你 ${state.playerScore}`;
    aiEl.textContent = `AI ${state.aiScore}`;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
  };
}
