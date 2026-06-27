import { loadState, removeState, saveState } from "../../utils/storage.js";
import { clamp } from "../../utils/random.js";

const W = 200; // 内核宽，留边后移动端 < 320px
const H = 320; // <= 320 高，max-width 自适应
const STORAGE_KEY = "doodle:solo";

const PLATE_W = 56;
const PLATE_H = 12;
const PLAYER_W = 28;
const PLAYER_H = 28;
const GRAVITY = 1400; // px/s^2
const JUMP = 720; // 起跳速度
const MOVE = 320; // 横向速度
const FALL_LINE = H + 40; // 跌出底部判定

// 难度只调间距：间距越大越难
const DIFFS = {
  easy: { gapMin: 48, gapMax: 70, moveChance: 0.1, breakChance: 0.04 },
  medium: { gapMin: 56, gapMax: 84, moveChance: 0.18, breakChance: 0.1 },
  hard: { gapMin: 66, gapMax: 96, moveChance: 0.28, breakChance: 0.16 },
  devil: { gapMin: 78, gapMax: 110, moveChance: 0.38, breakChance: 0.24 }
};

function diffConfig(context) {
  return DIFFS[context?.difficulty] || DIFFS.medium;
}

function makePlatform(y, cfg) {
  const x = Math.random() * (W - PLATE_W);
  const roll = Math.random();
  const breakable = roll < cfg.breakChance;
  const moving = !breakable && roll < cfg.breakChance + cfg.moveChance;
  return {
    x,
    y,
    type: breakable ? "break" : moving ? "move" : "solid",
    vx: moving ? (Math.random() < 0.5 ? -1 : 1) * (32 + Math.random() * 28) : 0,
    dead: false
  };
}

function buildPlatforms(cfg) {
  const list = [{ x: W / 2 - PLATE_W / 2, y: H - 24, type: "solid", vx: 0, dead: false }];
  let y = H - 24;
  while (y > -40) {
    y -= cfg.gapMin + Math.random() * (cfg.gapMax - cfg.gapMin);
    list.push(makePlatform(y, cfg));
  }
  return list;
}

function initialState(cfg) {
  const platforms = buildPlatforms(cfg);
  const base = platforms[0];
  return {
    platforms,
    px: base.x + PLATE_W / 2,
    py: base.y - PLAYER_H,
    vx: 0,
    vy: -JUMP,
    dir: 0, // -1 / 0 / 1 倾斜方向
    climb: 0, // 累计爬升高度（不回退）
    score: 0,
    over: false
  };
}

function serialize(state) {
  return {
    platforms: state.platforms.map((p) => ({ ...p })),
    px: state.px, py: state.py, vx: state.vx, vy: state.vy,
    dir: state.dir, climb: state.climb, score: state.score
  };
}

function restore(snap, cfg) {
  if (!snap || !Array.isArray(snap.platforms) || !snap.platforms.length || snap.over) return null;
  return { ...initialState(cfg), ...snap, dead: false, over: false, platforms: snap.platforms.map((p) => ({ ...p })) };
}

export function mountDoodle(root, context) {
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
        <strong data-status>弹跳</strong>
        <p class="game-note">${context.labels?.difficulty || "中等"} · 倾斜左右 · 踩台爬升</p>
      </div>
      <div class="mini-stats">
        <span data-score>高度 0</span>
      </div>
    </section>
    <section class="board-wrap" style="display:flex;justify-content:center;">
      <canvas data-board width="${W}" height="${H}" style="background:linear-gradient(180deg,#1b2350,#0c1230);border-radius:12px;touch-action:none;max-width:100%;"></canvas>
    </section>
    <section class="game-panel" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="secondary-button" data-ctrl="left" aria-label="左移">←</button>
      <button class="secondary-button" data-ctrl="right" aria-label="右移">→</button>
    </section>
    <section class="game-panel toolbar">
      <button class="danger-button" data-ctrl="restart">重开</button>
    </section>
  `;

  const board = root.querySelector("[data-board]");
  const ctx = board.getContext("2d");
  const elStatus = root.querySelector("[data-status]");
  const elScore = root.querySelector("[data-score]");

  function spawnAbove() {
    let top = Math.min(...state.platforms.map((p) => p.y));
    while (top > -40) {
      top -= cfg.gapMin + Math.random() * (cfg.gapMax - cfg.gapMin);
      state.platforms.push(makePlatform(top, cfg));
    }
  }

  function bounce() {
    state.vy = -JUMP;
    context.playSound?.("move");
  }

  function update(dt) {
    state.px += state.dir * MOVE * dt;
    if (state.px < 0) state.px = W; // 穿墙
    if (state.px > W) state.px = 0;

    state.vy += GRAVITY * dt;
    state.py += state.vy * dt;

    state.platforms.forEach((p) => {
      if (p.vx) {
        p.x += p.vx * dt;
        if (p.x < 0 || p.x > W - PLATE_W) { p.vx *= -1; p.x = clamp(p.x, 0, W - PLATE_W); }
      }
    });

    // 仅下落时检测踩台
    if (state.vy > 0) {
      const feet = state.py + PLAYER_H;
      for (const p of state.platforms) {
        if (p.dead) continue;
        if (state.px + PLAYER_W / 2 > p.x && state.px - PLAYER_W / 2 < p.x + PLATE_W
            && feet >= p.y && feet <= p.y + PLATE_H + 16) {
          if (p.type === "break") { p.dead = true; break; }
          bounce();
          break;
        }
      }
    }

    // 上升过半屏则滚动世界，得分=爬升高度
    if (state.py < H * 0.42) {
      const shift = H * 0.42 - state.py;
      state.py = H * 0.42;
      state.climb += shift;
      state.platforms.forEach((p) => { p.y += shift; });
      state.platforms = state.platforms.filter((p) => p.y < FALL_LINE);
      spawnAbove();
    }
    state.score = Math.floor(state.climb / 10);
    if (state.py > FALL_LINE) state.over = true;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    state.platforms.forEach((p) => {
      ctx.fillStyle = p.type === "break" ? "#d9785b" : p.type === "move" ? "#5ce8c0" : "#6f8cff";
      ctx.globalAlpha = p.dead ? 0.18 : 1;
      ctx.fillRect(p.x, p.y, PLATE_W, PLATE_H);
      ctx.fillStyle = "rgba(255,255,255,.28)";
      ctx.fillRect(p.x, p.y, PLATE_W, 3);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = "#ffd23a";
    ctx.fillRect(state.px - PLAYER_W / 2, state.py, PLAYER_W, PLAYER_H);
    ctx.fillStyle = "#1b2350";
    ctx.fillRect(state.px - 7, state.py + 8, 5, 5);
    ctx.fillRect(state.px + 2, state.py + 8, 5, 5);
    elStatus.textContent = state.over ? "掉下去了" : "弹跳";
    elScore.textContent = `高度 ${state.score}`;
  }

  function endGame() {
    if (reported) return;
    reported = true;
    removeState(STORAGE_KEY);
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", score: state.score, detail: `爬升高度 ${state.score}` });
  }

  function persist() {
    if (state.over) return;
    saveState(STORAGE_KEY, serialize(state));
    context.saveSession?.(serialize(state), { stage: `高度 ${state.score}`, score: state.score });
  }

  function restart() {
    state = initialState(cfg);
    reported = false;
    removeState(STORAGE_KEY);
    context.clearSession?.();
    last = 0;
    draw();
  }

  function press(d) { state.dir = d; }
  function release() { state.dir = 0; }

  root.querySelectorAll("[data-ctrl]").forEach((btn) => {
    const a = btn.dataset.ctrl;
    if (a === "restart") { btn.addEventListener("click", restart); return; }
    const d = a === "left" ? -1 : 1;
    btn.addEventListener("pointerdown", () => press(d));
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointerleave", release);
    btn.addEventListener("pointercancel", release);
  });

  function onKey(e) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") { state.dir = -1; e.preventDefault(); }
    else if (e.code === "ArrowRight" || e.code === "KeyD") { state.dir = 1; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if ((e.code === "ArrowLeft" || e.code === "KeyA") && state.dir < 0) state.dir = 0;
    if ((e.code === "ArrowRight" || e.code === "KeyD") && state.dir > 0) state.dir = 0;
  }
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);

  function onPointer(e) {
    const rect = board.getBoundingClientRect();
    state.dir = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
  }
  board.addEventListener("pointerdown", onPointer);
  board.addEventListener("pointerup", release);
  board.addEventListener("pointercancel", release);

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
    window.removeEventListener("keyup", onKeyUp);
    board.removeEventListener("pointerdown", onPointer);
    board.removeEventListener("pointerup", release);
    board.removeEventListener("pointercancel", release);
    if (!state.over) persist();
  };
}
