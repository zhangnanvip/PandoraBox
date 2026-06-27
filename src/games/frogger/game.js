import { loadState, removeState, saveState } from "../../utils/storage.js";
import { clamp } from "../../utils/random.js";

// 自包含「过马路 / Frogger」：青蛙逐行向上跳，穿越车道与漂木河流抵达终点。
const COLS = 11;
const ROWS = 13; // 0 终点, 1-5 河流, 6 中道, 7-11 车道, 12 起点
const CELL = 28;
const W = COLS * CELL; // 308 <= 340
const H = ROWS * CELL;
const STORAGE_KEY = "frogger:solo";
const START_LIVES = 3;
const RIVER = [1, 2, 3, 4, 5];
const ROAD = [7, 8, 9, 10, 11];

const DIFFS = {
  easy: { speed: 32, logLen: 4, density: 0.34 },
  medium: { speed: 46, logLen: 3, density: 0.42 },
  hard: { speed: 60, logLen: 3, density: 0.5 },
  devil: { speed: 78, logLen: 2, density: 0.58 }
};

function diffConfig(context) {
  return DIFFS[context?.difficulty] || DIFFS.medium;
}

function makeLane(row, cfg) {
  const isRiver = RIVER.includes(row);
  const dir = row % 2 === 0 ? 1 : -1;
  const len = isRiver ? cfg.logLen : 1 + (row % 2);
  const speed = (cfg.speed + (isRiver ? 4 : row) * 4) * dir;
  const gap = len + Math.round(2 + (1 - cfg.density) * 4);
  const items = [];
  for (let x = -gap; x < COLS + gap; x += gap) items.push((x + Math.random() * 2) * CELL);
  return { row, river: isRiver, dir, len, speed, gap: gap * CELL, items };
}

function buildLanes(cfg) {
  return [...RIVER, ...ROAD].map((row) => makeLane(row, cfg));
}

function initialState(cfg) {
  return { lanes: buildLanes(cfg), col: Math.floor(COLS / 2), row: 12, ride: 0, lives: START_LIVES, score: 0, crossings: 0, over: false };
}

function serialize(s) {
  return { lives: s.lives, score: s.score, crossings: s.crossings };
}

function restore(snap, cfg) {
  if (!snap || snap.over || !Number.isFinite(snap.lives) || snap.lives <= 0) return null;
  return { ...initialState(cfg), lives: snap.lives, score: snap.score || 0, crossings: snap.crossings || 0 };
}

export function mountFrogger(root, context) {
  const cfg = diffConfig(context);
  let state = (context.savedState && restore(context.savedState, cfg))
    || restore(loadState(STORAGE_KEY, null), cfg)
    || initialState(cfg);
  let raf = 0;
  let last = 0;
  let reported = false;
  let saveTimer = 0;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>过马路</strong>
        <p class="game-note">${context.labels?.difficulty || "中等"} · 滑动/方向键上跳 · 躲车踩木</p>
      </div>
      <div class="mini-stats">
        <span data-lives>命 ${START_LIVES}</span>
        <span data-score>分 0</span>
      </div>
    </section>
    <section class="board-wrap" style="display:flex;justify-content:center;">
      <canvas data-board width="${W}" height="${H}" style="background:#0c1230;border-radius:12px;touch-action:none;max-width:100%;"></canvas>
    </section>
    <section class="game-panel" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;max-width:240px;margin:0 auto;">
      <span></span><button class="secondary-button" data-ctrl="up" aria-label="上">↑</button><span></span>
      <button class="secondary-button" data-ctrl="left" aria-label="左">←</button>
      <button class="secondary-button" data-ctrl="down" aria-label="下">↓</button>
      <button class="secondary-button" data-ctrl="right" aria-label="右">→</button>
    </section>
    <section class="game-panel toolbar">
      <button class="danger-button" data-ctrl="restart">重开</button>
    </section>
  `;

  const board = root.querySelector("[data-board]");
  const ctx = board.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  board.width = W * dpr;
  board.height = H * dpr;
  board.style.width = W + "px";
  board.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const elStatus = root.querySelector("[data-status]");
  const elLives = root.querySelector("[data-lives]");
  const elScore = root.querySelector("[data-score]");

  function laneAt(row) {
    return state.lanes.find((l) => l.row === row);
  }

  function resetFrog() {
    state.col = Math.floor(COLS / 2);
    state.row = 12;
    state.ride = 0;
  }

  function die() {
    state.lives -= 1;
    context.playSound?.("hit");
    if (state.lives <= 0) { state.over = true; return; }
    resetFrog();
  }

  function move(dx, dy) {
    if (state.over) return;
    const nc = clamp(state.col + dx, 0, COLS - 1);
    const nr = clamp(state.row + dy, 0, ROWS - 1);
    state.col = nc;
    state.row = nr;
    context.playSound?.("move");
    if (nr === 0) { // 抵达终点
      state.crossings += 1;
      state.score += 100;
      context.playSound?.("score");
      resetFrog();
    }
  }

  function update(dt) {
    state.lanes.forEach((l) => {
      l.items = l.items.map((x) => {
        let nx = x + l.speed * dt;
        if (l.speed > 0 && nx > W + l.gap) nx -= COLS * CELL + l.gap;
        if (l.speed < 0 && nx < -l.gap) nx += COLS * CELL + l.gap;
        return nx;
      });
    });
    const lane = laneAt(state.row);
    state.ride = 0;
    if (!lane) return;
    const fx = state.col * CELL;
    const wItem = lane.len * CELL;
    const hit = lane.items.some((x) => fx + CELL > x && fx < x + wItem);
    if (lane.river) {
      if (!hit) { die(); return; } // 落水
      state.ride = lane.speed * dt; // 随木漂流
      const px = state.col * CELL + state.ride;
      if (px < 0 || px > W - CELL) { die(); return; } // 被冲出边界
      state.col = clamp(Math.round(px / CELL), 0, COLS - 1);
    } else if (hit) {
      die(); // 撞车
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let r = 0; r < ROWS; r += 1) {
      ctx.fillStyle = r === 0 ? "#234d2a" : RIVER.includes(r) ? "#163a6b" : r === 6 || r === 12 ? "#3a2d4f" : "#222";
      ctx.fillRect(0, r * CELL, W, CELL);
    }
    state.lanes.forEach((l) => {
      ctx.fillStyle = l.river ? "#8a5a32" : "#e05050";
      l.items.forEach((x) => {
        ctx.fillRect(x, l.row * CELL + 4, l.len * CELL - 6, CELL - 8);
        ctx.fillStyle = l.river ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.25)";
        ctx.fillRect(x, l.row * CELL + 4, l.len * CELL - 6, 3);
        ctx.fillStyle = l.river ? "#8a5a32" : "#e05050";
      });
    });
    ctx.fillStyle = "#5ce86a";
    ctx.fillRect(state.col * CELL + 3, state.row * CELL + 3, CELL - 6, CELL - 6);
    ctx.fillStyle = "#0c1230";
    ctx.fillRect(state.col * CELL + 8, state.row * CELL + 8, 4, 4);
    ctx.fillRect(state.col * CELL + 16, state.row * CELL + 8, 4, 4);
    elStatus.textContent = state.over ? "通通被收走了" : `已过 ${state.crossings} 次`;
    elLives.textContent = `命 ${state.lives}`;
    elScore.textContent = `分 ${state.score}`;
  }

  function endGame() {
    if (reported) return;
    reported = true;
    removeState(STORAGE_KEY);
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", score: state.score, detail: `过马路 ${state.crossings} 次` });
  }

  function persist() {
    if (state.over) return;
    saveState(STORAGE_KEY, serialize(state));
    context.saveSession?.(serialize(state), { stage: `过 ${state.crossings} 次`, score: state.score });
  }

  function restart() {
    state = initialState(cfg);
    reported = false;
    removeState(STORAGE_KEY);
    context.clearSession?.();
    last = 0;
    draw();
  }

  root.querySelectorAll("[data-ctrl]").forEach((btn) => {
    const a = btn.dataset.ctrl;
    btn.addEventListener("click", () => {
      if (a === "restart") return restart();
      if (a === "up") move(0, -1);
      else if (a === "down") move(0, 1);
      else if (a === "left") move(-1, 0);
      else if (a === "right") move(1, 0);
    });
  });

  function onKey(e) {
    const map = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
    const d = map[e.code];
    if (!d) return;
    e.preventDefault();
    move(d[0], d[1]);
  }
  window.addEventListener("keydown", onKey);

  let sx = 0;
  let sy = 0;
  function onDown(e) { sx = e.clientX; sy = e.clientY; }
  function onUp(e) {
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) { move(0, -1); return; }
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
    else move(0, dy > 0 ? 1 : -1);
  }
  board.addEventListener("pointerdown", onDown);
  board.addEventListener("pointerup", onUp);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    if (state.over) { endGame(); draw(); return; }
    if (!context.isPaused?.()) {
      update(dt);
      saveTimer += dt;
      if (saveTimer > 3) { saveTimer = 0; persist(); }
      if (state.over) endGame();
    }
    draw();
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    board.removeEventListener("pointerdown", onDown);
    board.removeEventListener("pointerup", onUp);
    if (!state.over) persist();
  };
}
