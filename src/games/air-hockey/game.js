import { clamp } from "../../utils/random.js";

const W = 300;
const H = 460;
const WALL = 8;
const MALLET_R = 26;
const PUCK_R = 14;
const GOAL_W = 132;
const WIN_SCORE = 7;
const FRICTION = 0.992;
const MAX_PUCK = 560;
const MIN_DEFEND = 130;

const DIFF = {
  easy: { ai: 200, react: 0.5, label: "轻松" },
  medium: { ai: 280, react: 0.68, label: "标准" },
  hard: { ai: 360, react: 0.82, label: "困难" },
  devil: { ai: 460, react: 0.94, label: "地狱" }
};

function tuning(difficulty) {
  return DIFF[difficulty] || DIFF.medium;
}

function serve(toPlayer) {
  return { x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 120, vy: toPlayer ? 180 : -180 };
}

function initialState() {
  return {
    player: { x: W / 2, y: H - 70, px: W / 2, py: H - 70 },
    ai: { x: W / 2, y: 70 },
    puck: serve(Math.random() < 0.5),
    playerScore: 0,
    aiScore: 0,
    over: false,
    won: false,
    serveTimer: 0.7,
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

function reset(state, toPlayer) {
  Object.assign(state.puck, serve(toPlayer));
  state.serveTimer = 0.6;
  state.ai.x = W / 2;
  state.ai.y = 70;
}

function inGoal(x) {
  return x > (W - GOAL_W) / 2 && x < (W + GOAL_W) / 2;
}

function bounceMallet(p, m, mvx, mvy, context) {
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const minD = MALLET_R + PUCK_R;
  const d = Math.hypot(dx, dy) || 0.001;
  if (d >= minD) return false;
  const nx = dx / d;
  const ny = dy / d;
  p.x = m.x + nx * minD;
  p.y = m.y + ny * minD;
  const vn = p.vx * nx + p.vy * ny;
  p.vx += (-vn * 1.6 + mvx * 0.6);
  p.vy += (-vn * 1.6 + mvy * 0.6);
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > MAX_PUCK) { p.vx *= MAX_PUCK / sp; p.vy *= MAX_PUCK / sp; }
  context.playSound?.("move");
  return true;
}

function update(state, dt, control, t, context) {
  if (state.over) return;
  const player = state.player;
  const prevX = player.x;
  const prevY = player.y;
  if (Number.isFinite(control.x)) {
    player.x = clamp(control.x, MALLET_R, W - MALLET_R);
    player.y = clamp(control.y, H / 2 + MALLET_R, H - MALLET_R);
  }
  const pvx = (player.x - prevX) / Math.max(dt, 0.001);
  const pvy = (player.y - prevY) / Math.max(dt, 0.001);

  const ai = state.ai;
  const p = state.puck;
  const targetX = p.y < H / 2 ? p.x : W / 2;
  const targetY = p.y < H / 2 ? Math.min(p.y, H / 2 - MALLET_R) : MIN_DEFEND;
  ai.x += clamp((targetX - ai.x) * t.react, -t.ai * dt, t.ai * dt);
  ai.y += clamp((targetY - ai.y) * t.react, -t.ai * dt, t.ai * dt);
  ai.x = clamp(ai.x, MALLET_R, W - MALLET_R);
  ai.y = clamp(ai.y, MALLET_R, H / 2 - MALLET_R);

  if (state.serveTimer > 0) { state.serveTimer = Math.max(0, state.serveTimer - dt); return; }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= FRICTION;
  p.vy *= FRICTION;

  if (p.x < WALL + PUCK_R) { p.x = WALL + PUCK_R; p.vx = Math.abs(p.vx); }
  if (p.x > W - WALL - PUCK_R) { p.x = W - WALL - PUCK_R; p.vx = -Math.abs(p.vx); }
  if (p.y < WALL + PUCK_R && !inGoal(p.x)) { p.y = WALL + PUCK_R; p.vy = Math.abs(p.vy); }
  if (p.y > H - WALL - PUCK_R && !inGoal(p.x)) { p.y = H - WALL - PUCK_R; p.vy = -Math.abs(p.vy); }

  bounceMallet(p, player, pvx, pvy, context);
  bounceMallet(p, ai, 0, 0, context);

  if (p.y < -PUCK_R) {
    state.playerScore += 1;
    context.playSound?.("score");
    if (state.playerScore >= WIN_SCORE) finish(state, true, context);
    else { reset(state, true); state.message = `领先 ${state.playerScore} : ${state.aiScore}`; }
  } else if (p.y > H + PUCK_R) {
    state.aiScore += 1;
    context.playSound?.("score");
    if (state.aiScore >= WIN_SCORE) finish(state, false, context);
    else { reset(state, false); state.message = `落后 ${state.playerScore} : ${state.aiScore}`; }
  }
}

function drawMallet(ctx, m, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function draw(state, ctx) {
  ctx.fillStyle = "#0b1224";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(125,211,252,.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL, WALL, W - WALL * 2, H - WALL * 2);
  ctx.beginPath();
  ctx.moveTo(WALL, H / 2);
  ctx.lineTo(W - WALL, H / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo((W - GOAL_W) / 2, WALL);
  ctx.lineTo((W + GOAL_W) / 2, WALL);
  ctx.moveTo((W - GOAL_W) / 2, H - WALL);
  ctx.lineTo((W + GOAL_W) / 2, H - WALL);
  ctx.stroke();
  drawMallet(ctx, state.ai, "#f472b6");
  drawMallet(ctx, state.player, "#7dd3fc");
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(state.puck.x, state.puck.y, PUCK_R, 0, Math.PI * 2);
  ctx.fill();
}

export function mountAirHockey(root, context) {
  const t = tuning(context.difficulty);
  let state = initialState();
  const control = { x: NaN, y: NaN };

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
      <canvas width="${W}" height="${H}" style="max-width:100%;border-radius:14px;touch-action:none;background:#0b1224" aria-label="空气球台"></canvas>
      <div style="display:flex;gap:10px"><button class="danger-button" data-action="restart">重开</button></div>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const status = root.querySelector("[data-status]");
  const youEl = root.querySelector("[data-you]");
  const aiEl = root.querySelector("[data-ai]");

  function restart() {
    state = initialState();
    control.x = NaN;
    control.y = NaN;
  }

  function pointerTo(event) {
    const rect = canvas.getBoundingClientRect();
    control.x = ((event.clientX - rect.left) / rect.width) * W;
    control.y = ((event.clientY - rect.top) / rect.height) * H;
  }
  const onDown = (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); pointerTo(e); };
  const onMove = (e) => { if (Number.isFinite(control.x)) { e.preventDefault(); pointerTo(e); } };
  const onUp = (e) => { canvas.releasePointerCapture?.(e.pointerId); control.x = NaN; control.y = NaN; };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
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
  };
}
