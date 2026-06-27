import { clamp } from "../../utils/random.js";

const W = 300;
const H = 460;
const GRAVITY = 760;
const MAX_BALLS = 3;
const FLIP_REST = -0.5;
const FLIP_ACTIVE = -1.35;
const FLIP_SPEED = 14;
const WALL = 10;

const COL = {
  bg: "#0c1024",
  bg2: "#161d3a",
  wall: "#3b4574",
  flip: "#ffd24a",
  flipHit: "#fff0a8",
  ball: "#f4f7ff",
  bumper: "#ff5c8a",
  bumperHot: "#ffd24a",
  slot: "#37c9c0",
  text: "#cfd6ff"
};

function bumperLayout() {
  return [
    { x: W * 0.5, y: 120, r: 24, base: 100, hot: 0 },
    { x: W * 0.27, y: 188, r: 19, base: 80, hot: 0 },
    { x: W * 0.73, y: 188, r: 19, base: 80, hot: 0 },
    { x: W * 0.5, y: 250, r: 16, base: 60, hot: 0 }
  ];
}

function spawnBall() {
  return { x: W - WALL - 14, y: H - 80, r: 8, vx: -8, vy: -540 };
}

function initialState() {
  return {
    ball: spawnBall(),
    bumpers: bumperLayout(),
    leftA: FLIP_REST,
    rightA: FLIP_REST,
    leftDown: false,
    rightDown: false,
    balls: MAX_BALLS,
    score: 0,
    over: false,
    message: "点左右半屏拍击挡板",
    msgT: 0
  };
}

// reflect ball off a flipper modeled as a rotating segment near each bottom corner
function flipper(state, side) {
  const len = 92;
  const pivX = side === "left" ? WALL + 18 : W - WALL - 18;
  const pivY = H - 46;
  const ang = side === "left" ? state.leftA : -Math.PI - state.rightA;
  const ex = pivX + Math.cos(ang) * len;
  const ey = pivY + Math.sin(ang) * len;
  return { pivX, pivY, ex, ey };
}

function collideFlipper(state, f, active) {
  const ball = state.ball;
  const dx = f.ex - f.pivX;
  const dy = f.ey - f.pivY;
  const segLen2 = dx * dx + dy * dy || 1;
  let t = ((ball.x - f.pivX) * dx + (ball.y - f.pivY) * dy) / segLen2;
  t = clamp(t, 0, 1);
  const cx = f.pivX + dx * t;
  const cy = f.pivY + dy * t;
  const ddx = ball.x - cx;
  const ddy = ball.y - cy;
  const dist = Math.hypot(ddx, ddy);
  if (dist > ball.r + 5) return;
  const nx = dist ? ddx / dist : 0;
  const ny = dist ? ddy / dist : -1;
  ball.x = cx + nx * (ball.r + 5);
  ball.y = cy + ny * (ball.r + 5);
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx -= 2 * dot * nx;
  ball.vy -= 2 * dot * ny;
  ball.vy -= active ? 360 : 90;
  ball.vx *= 0.96;
}

function update(state, dt, context) {
  if (state.over) return;
  state.msgT = Math.max(0, state.msgT - dt);
  state.bumpers.forEach((b) => { b.hot = Math.max(0, b.hot - dt * 4); });
  const target = (down) => (down ? FLIP_ACTIVE : FLIP_REST);
  state.leftA += (target(state.leftDown) - state.leftA) * Math.min(1, FLIP_SPEED * dt);
  state.rightA += (target(state.rightDown) - state.rightA) * Math.min(1, FLIP_SPEED * dt);

  const ball = state.ball;
  ball.vy += GRAVITY * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x < WALL + ball.r) { ball.x = WALL + ball.r; ball.vx = Math.abs(ball.vx) * 0.9; }
  if (ball.x > W - WALL - ball.r) { ball.x = W - WALL - ball.r; ball.vx = -Math.abs(ball.vx) * 0.9; }
  if (ball.y < WALL + ball.r) { ball.y = WALL + ball.r; ball.vy = Math.abs(ball.vy) * 0.9; }

  for (const b of state.bumpers) {
    const dx = ball.x - b.x;
    const dy = ball.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < b.r + ball.r) {
      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      ball.x = b.x + nx * (b.r + ball.r);
      ball.y = b.y + ny * (b.r + ball.r);
      const sp = Math.max(280, Math.hypot(ball.vx, ball.vy));
      ball.vx = nx * sp;
      ball.vy = ny * sp;
      b.hot = 1;
      state.score += b.base;
      state.message = `+${b.base}`;
      state.msgT = 0.6;
      context.playSound?.("score");
    }
  }

  collideFlipper(state, flipper(state, "left"), state.leftDown);
  collideFlipper(state, flipper(state, "right"), state.rightDown);
  ball.vx = clamp(ball.vx, -700, 700);
  ball.vy = clamp(ball.vy, -900, 900);

  if (ball.y > H + 30) {
    state.balls -= 1;
    if (state.balls <= 0) {
      state.over = true;
      state.message = "球用尽，挑战结束";
      context.clearSession?.();
      context.reportResult?.({ outcome: "score", detail: `本局 ${state.score} 分`, score: state.score });
    } else {
      state.ball = spawnBall();
      state.message = `漏球，剩 ${state.balls} 球`;
      state.msgT = 1;
    }
  }
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(state, ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COL.bg2);
  g.addColorStop(1, COL.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COL.wall;
  ctx.fillRect(0, 0, W, WALL);
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W - WALL, 0, WALL, H);
  // drain slot guides
  ctx.strokeStyle = COL.slot;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(WALL, H - 120); ctx.lineTo(W * 0.36, H - 30);
  ctx.moveTo(W - WALL, H - 120); ctx.lineTo(W * 0.64, H - 30);
  ctx.stroke();

  for (const b of state.bumpers) {
    ctx.beginPath();
    ctx.fillStyle = b.hot > 0 ? COL.bumperHot : COL.bumper;
    ctx.arc(b.x, b.y, b.r + (b.hot > 0 ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ["left", "right"].forEach((side) => {
    const f = flipper(state, side);
    ctx.strokeStyle = (side === "left" ? state.leftDown : state.rightDown) ? COL.flipHit : COL.flip;
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(f.pivX, f.pivY);
    ctx.lineTo(f.ex, f.ey);
    ctx.stroke();
  });

  ctx.fillStyle = COL.ball;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, state.ball.r, 0, Math.PI * 2);
  ctx.fill();

  if (state.msgT > 0 || state.over) {
    ctx.fillStyle = "rgba(0,0,0,.45)";
    rounded(ctx, W / 2 - 80, 22, 160, 30, 8);
    ctx.fill();
    ctx.fillStyle = COL.text;
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(state.message, W / 2, 42);
  }
}

export function mountPinball(root, context) {
  let state = initialState();
  let raf = 0;
  let last = 0;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div><strong data-status>${state.message}</strong>
      <p class="game-note">单人挑战 · 撞击保险杠得分 · 漏球损 1 球</p></div>
      <div class="mini-stats"><span data-balls>球 ${state.balls}</span><span data-score>分 0</span></div>
    </section>
    <section class="board-wrap" style="display:flex;flex-direction:column;align-items:center;gap:10px;">
      <canvas data-cv style="width:300px;max-width:100%;touch-action:none;border-radius:12px;background:${COL.bg};"></canvas>
      <button class="secondary-button" data-restart>重开</button>
    </section>`;

  const cv = root.querySelector("[data-cv]");
  const ctx = cv.getContext("2d");
  const sEl = root.querySelector("[data-status]");
  const bEl = root.querySelector("[data-balls]");
  const scEl = root.querySelector("[data-score]");
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.height = (H / W * 300) + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pressHalf = (clientX, val) => {
    const r = cv.getBoundingClientRect();
    if (clientX - r.left < r.width / 2) state.leftDown = val; else state.rightDown = val;
  };
  const onDown = (e) => { e.preventDefault(); for (const t of e.changedTouches || [e]) pressHalf(t.clientX, true); };
  const onUp = (e) => { e.preventDefault(); state.leftDown = false; state.rightDown = false; };
  const onKey = (down) => (e) => {
    if (e.key === "ArrowLeft") { state.leftDown = down; e.preventDefault(); }
    else if (e.key === "ArrowRight") { state.rightDown = down; e.preventDefault(); }
  };
  const kd = onKey(true);
  const ku = onKey(false);
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointerup", onUp);
  cv.addEventListener("pointercancel", onUp);
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  root.querySelector("[data-restart]").addEventListener("click", () => { state = initialState(); context.clearSession?.(); });

  const tick = (ts) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.033, (ts - last) / 1000 || 0);
    last = ts;
    if (!context.isPaused?.()) update(state, dt, context);
    draw(state, ctx);
    sEl.textContent = state.message;
    bEl.textContent = `球 ${state.balls}`;
    scEl.textContent = `分 ${state.score}`;
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    cv.removeEventListener("pointerdown", onDown);
    cv.removeEventListener("pointerup", onUp);
    cv.removeEventListener("pointercancel", onUp);
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
  };
}
