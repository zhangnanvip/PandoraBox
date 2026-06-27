import { clamp } from "../../utils/random.js";

const W = 300;
const H = 480;
const BASE_W = 180;
const LAYER_H = 24;
const CENTER = (W - BASE_W) / 2;
const MIN_W = 8; // 小于该宽度即出局
const SPEED_BASE = 130; // px/s 起始横移速度兜底

const DIFFICULTY = {
  easy: { speed0: 100, step: 3, perfect: 6 },
  medium: { speed0: 130, step: 5, perfect: 5 },
  hard: { speed0: 160, step: 7, perfect: 4 },
  devil: { speed0: 190, step: 9, perfect: 3 }
};

function tuning(difficulty) {
  return DIFFICULTY[difficulty] || DIFFICULTY.medium;
}

function initialState() {
  return {
    stack: [{ x: CENTER, w: BASE_W }], // 已落定层（最底为基座）
    moving: { x: 0, w: BASE_W, dir: 1 },
    score: 0,
    combo: 0,
    height: 0,
    cam: 0,
    over: false,
    message: "点击 / 空格 落块对齐"
  };
}

export function mountStack(root, context) {
  const conf = tuning(context.difficulty);
  let state = initialState();
  let raf = 0;
  let last = 0;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels?.difficulty || "中等"} · 越准越窄越高分 · 太小即结束</p>
      </div>
      <div class="mini-stats"><span data-score>层 0</span><span data-combo>连击 0</span></div>
    </section>
    <section class="board-wrap">
      <canvas data-cv width="${W}" height="${H}" style="max-width:300px;width:100%;height:auto;display:block;margin:0 auto;border-radius:14px;background:#0e1626;touch-action:none;cursor:pointer;"></canvas>
    </section>
    <div class="mini-stats" style="justify-content:center;gap:12px;margin-top:10px;">
      <button class="primary-button" data-restart>重开</button>
    </div>`;

  const canvas = root.querySelector("[data-cv]");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const statusEl = root.querySelector("[data-status]");
  const scoreEl = root.querySelector("[data-score]");
  const comboEl = root.querySelector("[data-combo]");

  function curSpeed() {
    return (conf.speed0 + state.height * conf.step) || SPEED_BASE;
  }

  function spawnMoving() {
    const top = state.stack[state.stack.length - 1];
    state.moving = { x: 0, w: top.w, dir: 1 };
  }

  function drop() {
    if (state.over || !state.moving) return;
    const top = state.stack[state.stack.length - 1];
    const m = state.moving;
    const left = Math.max(m.x, top.x);
    const right = Math.min(m.x + m.w, top.x + top.w);
    const overlap = right - left;
    if (overlap < MIN_W) {
      finish();
      return;
    }
    const diff = Math.abs(m.x - top.x);
    if (diff <= conf.perfect) {
      // 完美对齐：不削边，宽度保留，连击加成
      state.stack.push({ x: top.x, w: top.w });
      state.combo += 1;
      state.score += 1 + state.combo;
      state.message = `完美 +${1 + state.combo}`;
      context.playSound?.("score");
    } else {
      state.stack.push({ x: left, w: overlap });
      state.combo = 0;
      state.score += 1;
      state.message = "+1";
      context.playSound?.("move");
    }
    state.height += 1;
    spawnMoving();
  }

  function finish() {
    if (state.over) return;
    state.over = true;
    state.moving = null;
    state.message = `倒塌 · 高度 ${state.height} 层`;
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", detail: state.message, score: state.score });
  }

  function restart() {
    state = initialState();
    context.clearSession?.();
    last = performance.now();
  }

  function update(dt) {
    if (state.over || !state.moving) return;
    const m = state.moving;
    m.x += m.dir * curSpeed() * dt;
    if (m.x <= 0) { m.x = 0; m.dir = 1; }
    if (m.x + m.w >= W) { m.x = W - m.w; m.dir = -1; }
    const targetCam = clamp(state.height * LAYER_H - 40, 0, 1e6);
    state.cam += (targetCam - state.cam) * Math.min(1, dt * 6);
  }

  function blockY(level) {
    return H - LAYER_H - level * LAYER_H + state.cam;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    state.stack.forEach((b, i) => {
      const y = blockY(i);
      if (y > H || y + LAYER_H < 0) return;
      const hue = (i * 18) % 360;
      ctx.fillStyle = `hsl(${hue} 60% 58%)`;
      ctx.fillRect(b.x, y, b.w, LAYER_H - 2);
    });
    if (state.moving) {
      const y = blockY(state.stack.length);
      ctx.fillStyle = state.combo > 0 ? "#ffd25a" : "#7fe3d4";
      ctx.fillRect(state.moving.x, y, state.moving.w, LAYER_H - 2);
    }
    scoreEl.textContent = `层 ${state.height}`;
    comboEl.textContent = `连击 ${state.combo}`;
    statusEl.textContent = state.message;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) || 0;
    last = now;
    if (!context.isPaused?.()) update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  const onDown = (e) => { e.preventDefault(); drop(); };
  const onKey = (e) => {
    if (e.code !== "Space") return;
    e.preventDefault();
    if (e.type === "keydown" && !e.repeat) drop();
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("keydown", onKey);
  root.querySelector("[data-restart]").addEventListener("click", restart);

  last = performance.now();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("keydown", onKey);
  };
}
