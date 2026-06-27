import { clamp } from "../../utils/random.js";

const W = 320;
const H = 520;

const COLS = 6;
const ROWS = 4;
const ALIEN_W = 26;
const ALIEN_H = 18;
const GAP_X = 14;
const GAP_Y = 14;
const MARGIN_X = 24;
const TOP_Y = 64;

const SHIP_W = 30;
const SHIP_H = 16;
const SHIP_Y = H - 34;
const PLAYER_SPEED = 230;
const BULLET_SPEED = 380;
const ALIEN_BULLET_SPEED = 190;
const RELOAD = 0.32;
const LIVES_START = 3;
const COLORS = ["#ff5d7a", "#ffd166", "#5ad1ff", "#7cf29c"];

function makeAliens(wave) {
  const aliens = [];
  const rows = Math.min(ROWS + Math.floor(wave / 3), 6);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      aliens.push({
        col: c,
        row: r,
        x: MARGIN_X + c * (ALIEN_W + GAP_X),
        y: TOP_Y + r * (ALIEN_H + GAP_Y),
        alive: true,
        color: COLORS[r % COLORS.length]
      });
    }
  }
  return aliens;
}

function initialState() {
  return {
    wave: 1,
    score: 0,
    lives: LIVES_START,
    ship: W / 2,
    bullets: [],
    bombs: [],
    aliens: makeAliens(1),
    dir: 1,
    stepCool: 0,
    reload: 0,
    fireCool: 0,
    over: false,
    won: false,
    reported: false,
    invuln: 1,
    message: "第 1 波 · 拖动移动 · 点按射击"
  };
}

function aliveCount(state) {
  return state.aliens.reduce((n, a) => n + (a.alive ? 1 : 0), 0);
}

function stepInterval(state) {
  const alive = Math.max(1, aliveCount(state));
  const base = 0.62 - (state.wave - 1) * 0.05;
  return Math.max(0.12, base * (alive / (COLS * ROWS)) + 0.14);
}

function nextWave(state) {
  state.wave += 1;
  state.aliens = makeAliens(state.wave);
  state.bullets = [];
  state.bombs = [];
  state.dir = 1;
  state.stepCool = 0;
  state.invuln = 0.8;
  state.message = `第 ${state.wave} 波 · 加速来袭`;
}

function endGame(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "防线守住" : "战机损毁";
  if (!state.reported) {
    state.reported = true;
    context.reportResult?.({
      outcome: "score",
      detail: `第 ${state.wave} 波 · 得分 ${state.score}`,
      score: state.score,
      moves: state.wave
    });
  }
}

function step(state, controls, dt, context) {
  if (state.over) return;
  state.invuln = Math.max(0, state.invuln - dt);

  const move = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  if (move) state.ship = clamp(state.ship + move * PLAYER_SPEED * dt, SHIP_W / 2, W - SHIP_W / 2);
  if (Number.isFinite(controls.pointerX)) {
    state.ship = clamp(controls.pointerX, SHIP_W / 2, W - SHIP_W / 2);
  }

  state.reload = Math.max(0, state.reload - dt);
  if (controls.fire && state.reload <= 0) {
    state.bullets.push({ x: state.ship, y: SHIP_Y - 16 });
    state.reload = RELOAD;
    context.playSound?.("move");
  }

  for (const b of state.bullets) b.y -= BULLET_SPEED * dt;
  state.bullets = state.bullets.filter((b) => b.y > -20);
  for (const bomb of state.bombs) bomb.y += ALIEN_BULLET_SPEED * dt;
  state.bombs = state.bombs.filter((bomb) => bomb.y < H + 20);

  state.stepCool -= dt;
  if (state.stepCool <= 0) {
    state.stepCool = stepInterval(state);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const a of state.aliens) {
      if (!a.alive) continue;
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x + ALIEN_W);
    }
    if (state.dir > 0 ? maxX + 12 >= W : minX - 12 <= 0) {
      state.dir *= -1;
      for (const a of state.aliens) a.y += 16;
    } else {
      for (const a of state.aliens) a.x += state.dir * 12;
    }
  }

  state.fireCool -= dt;
  if (state.fireCool <= 0) {
    const shooters = state.aliens.filter((a) => a.alive);
    if (shooters.length) {
      const a = shooters[Math.floor(Math.random() * shooters.length)];
      state.bombs.push({ x: a.x + ALIEN_W / 2, y: a.y + ALIEN_H });
      state.fireCool = Math.max(0.4, 1.4 - state.wave * 0.08);
    }
  }

  for (const b of state.bullets) {
    for (const a of state.aliens) {
      if (!a.alive) continue;
      if (b.x > a.x && b.x < a.x + ALIEN_W && b.y > a.y && b.y < a.y + ALIEN_H) {
        a.alive = false;
        b.y = -99;
        state.score += 10 + state.wave * 2;
        context.playSound?.("score");
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.y > -20);

  const shipL = state.ship - SHIP_W / 2;
  const shipR = state.ship + SHIP_W / 2;
  if (state.invuln <= 0) {
    const hit = state.bombs.find((b) => b.x > shipL && b.x < shipR && b.y > SHIP_Y - SHIP_H && b.y < SHIP_Y + SHIP_H);
    if (hit) {
      state.bombs = state.bombs.filter((b) => b !== hit);
      state.lives -= 1;
      state.invuln = 1.2;
      state.message = state.lives > 0 ? "中弹 · 重新部署" : "战机损毁";
      context.playSound?.("move");
      if (state.lives <= 0) endGame(state, false, context);
    }
  }

  if (state.aliens.some((a) => a.alive && a.y + ALIEN_H >= SHIP_Y - 6)) {
    endGame(state, false, context);
  }
  if (!state.over && aliveCount(state) === 0) nextWave(state);
}

function draw(ctx, state) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#070b18";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.55)";
  for (let i = 0; i < 26; i += 1) {
    const sx = (i * 73) % W;
    const sy = (i * 131 + 40) % H;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  for (const a of state.aliens) {
    if (!a.alive) continue;
    ctx.fillStyle = a.color;
    ctx.fillRect(a.x + 2, a.y, ALIEN_W - 4, ALIEN_H - 4);
    ctx.fillRect(a.x, a.y + 4, ALIEN_W, ALIEN_H - 10);
    ctx.fillStyle = "#070b18";
    ctx.fillRect(a.x + 6, a.y + 5, 4, 4);
    ctx.fillRect(a.x + ALIEN_W - 10, a.y + 5, 4, 4);
  }

  ctx.fillStyle = "#fff";
  for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y, 3, 12);
  ctx.fillStyle = "#ff8a5d";
  for (const b of state.bombs) ctx.fillRect(b.x - 2, b.y, 4, 10);

  const blink = state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0;
  if (!blink) {
    ctx.fillStyle = "#5ad1ff";
    ctx.fillRect(state.ship - SHIP_W / 2, SHIP_Y, SHIP_W, SHIP_H - 6);
    ctx.fillRect(state.ship - 4, SHIP_Y - 6, 8, 8);
  }

  if (state.over) {
    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.fillRect(0, H / 2 - 44, W, 88);
    ctx.fillStyle = "#fff";
    ctx.font = "20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.message, W / 2, H / 2 - 6);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`得分 ${state.score} · 点重开再来`, W / 2, H / 2 + 18);
    ctx.textAlign = "left";
  }
}

export function mountInvaders(root, context) {
  let state = initialState();
  const controls = { left: false, right: false, fire: false, pointerX: NaN, dragOffset: NaN };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">拖动飞船 / 方向键移动，点按 / 空格射击，守住防线</p>
      </div>
      <div class="mini-stats">
        <span data-wave>波次 1</span>
        <span data-lives>生命 ${state.lives}</span>
        <span data-score>分数 0</span>
      </div>
    </section>
    <section class="arcade-shell">
      <div class="arcade-stage" style="display:flex;justify-content:center;">
        <canvas width="${W}" height="${H}" aria-label="太空入侵"
          style="max-width:100%;border-radius:14px;touch-action:none;cursor:pointer;"></canvas>
      </div>
      <div style="display:flex;justify-content:center;margin-top:12px;">
        <button type="button" class="primary-button" data-restart>重开</button>
      </div>
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
  const waveEl = root.querySelector("[data-wave]");
  const livesEl = root.querySelector("[data-lives]");
  const scoreEl = root.querySelector("[data-score]");

  function restart() {
    state = initialState();
    controls.pointerX = NaN;
    controls.dragOffset = NaN;
    controls.fire = false;
  }

  function pointX(e) {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }
  const onPointerDown = (e) => {
    e.preventDefault();
    if (state.over) { restart(); return; }
    canvas.setPointerCapture?.(e.pointerId);
    controls.dragOffset = state.ship - pointX(e);
    controls.pointerX = state.ship;
    controls.fire = true;
  };
  const onPointerMove = (e) => {
    if (!Number.isFinite(controls.dragOffset)) return;
    e.preventDefault();
    controls.pointerX = clamp(pointX(e) + controls.dragOffset, SHIP_W / 2, W - SHIP_W / 2);
  };
  const onPointerUp = (e) => {
    canvas.releasePointerCapture?.(e.pointerId);
    controls.dragOffset = NaN;
    controls.pointerX = NaN;
    controls.fire = false;
  };
  const onKeyDown = (e) => {
    if (e.code === "ArrowLeft") { controls.left = true; controls.pointerX = NaN; }
    else if (e.code === "ArrowRight") { controls.right = true; controls.pointerX = NaN; }
    else if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (state.over) restart(); else controls.fire = true;
    }
  };
  const onKeyUp = (e) => {
    if (e.code === "ArrowLeft") controls.left = false;
    else if (e.code === "ArrowRight") controls.right = false;
    else if (e.code === "Space" || e.code === "ArrowUp") controls.fire = false;
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  const onRestart = () => restart();
  root.querySelector("[data-restart]").addEventListener("click", onRestart);

  let raf = 0;
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (!context.isPaused?.()) step(state, controls, dt, context);
    waveEl.textContent = `波次 ${state.wave}`;
    livesEl.textContent = `生命 ${state.lives}`;
    scoreEl.textContent = `分数 ${state.score}`;
    status.textContent = state.message;
    draw(ctx, state);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
