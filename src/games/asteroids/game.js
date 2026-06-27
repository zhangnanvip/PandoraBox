const W = 320;
const H = 480;
const SHIP_R = 9; // 飞船碰撞半径
const TURN = 3.4; // rad/s 转向
const THRUST = 220; // px/s^2 推进
const DRAG = 0.6; // 速度衰减/s
const MAX_SPD = 280; // px/s 上限
const BULLET_SPD = 360;
const BULLET_LIFE = 0.95;
const FIRE_GAP = 0.22; // 射击冷却
const INVULN = 1.6; // 复活无敌秒
const SIZES = { 3: 26, 2: 16, 1: 9 }; // 各级小行星半径
const SCORES = { 3: 20, 2: 50, 1: 100 };

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function wrap(v, max) {
  if (v < 0) return v + max;
  if (v >= max) return v - max;
  return v;
}

function spawnAsteroid(level) {
  // 从边缘生成，远离中心
  const edge = Math.random() < 0.5;
  const x = edge ? (Math.random() < 0.5 ? 0 : W) : rand(0, W);
  const y = edge ? rand(0, H) : (Math.random() < 0.5 ? 0 : H);
  const ang = rand(0, Math.PI * 2);
  const spd = rand(28, 52) + level * 4;
  const pts = [];
  for (let i = 0; i < 9; i += 1) pts.push(0.7 + Math.random() * 0.45);
  return { x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, size: 3, r: SIZES[3], pts, spin: rand(-1.2, 1.2), rot: 0 };
}

function initialState() {
  return {
    ship: { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, invuln: INVULN },
    rocks: [],
    bullets: [],
    score: 0,
    lives: 3,
    wave: 1,
    cool: 0,
    over: false,
    message: "方向转向 · 推进 · 开火"
  };
}

function newWave(state) {
  state.wave += 1;
  for (let i = 0; i < 3 + state.wave; i += 1) state.rocks.push(spawnAsteroid(state.wave));
}

export function mountAsteroids(root, context) {
  let state = initialState();
  for (let i = 0; i < 4; i += 1) state.rocks.push(spawnAsteroid(1));
  let raf = 0;
  let last = 0;
  const keys = { left: false, right: false, thrust: false, fire: false };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels?.difficulty || "中等"} · 击碎陨石得分 · 命数耗尽结束</p>
      </div>
      <div class="mini-stats"><span data-score>分 0</span><span data-lives>命 3</span><span data-wave>波 1</span></div>
    </section>
    <section class="board-wrap">
      <canvas data-cv width="${W}" height="${H}" style="max-width:320px;width:100%;height:auto;display:block;margin:0 auto;border-radius:14px;background:#070b16;touch-action:none;"></canvas>
    </section>
    <div class="mini-stats" data-pad style="justify-content:center;gap:10px;margin-top:10px;user-select:none;">
      <button class="secondary-button" data-k="left" style="touch-action:none;">◀ 左</button>
      <button class="secondary-button" data-k="right" style="touch-action:none;">右 ▶</button>
      <button class="secondary-button" data-k="thrust" style="touch-action:none;">▲ 推进</button>
      <button class="primary-button" data-k="fire" style="touch-action:none;">开火</button>
    </div>
    <div class="mini-stats" style="justify-content:center;gap:12px;margin-top:8px;">
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
  const livesEl = root.querySelector("[data-lives]");
  const waveEl = root.querySelector("[data-wave]");

  function fire() {
    if (state.over || state.cool > 0) return;
    const s = state.ship;
    state.bullets.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: Math.cos(s.a) * BULLET_SPD, vy: Math.sin(s.a) * BULLET_SPD, life: BULLET_LIFE });
    state.cool = FIRE_GAP;
    context.playSound?.("move");
  }

  function splitRock(rock) {
    if (rock.size <= 1) return;
    for (let i = 0; i < 2; i += 1) {
      const a = spawnAsteroid(state.wave);
      a.x = rock.x;
      a.y = rock.y;
      a.size = rock.size - 1;
      a.r = SIZES[a.size];
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + state.wave * 5;
      a.vx = Math.cos(ang) * spd;
      a.vy = Math.sin(ang) * spd;
      state.rocks.push(a);
    }
  }

  function hitShip() {
    state.lives -= 1;
    context.playSound?.("lose");
    if (state.lives <= 0) {
      finish();
      return;
    }
    state.ship = { x: W / 2, y: H / 2, a: -Math.PI / 2, vx: 0, vy: 0, invuln: INVULN };
    state.message = `中弹 · 剩 ${state.lives} 命`;
  }

  function finish() {
    if (state.over) return;
    state.over = true;
    state.message = `飞船坠毁 · 得分 ${state.score}`;
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", detail: state.message, score: state.score });
  }

  function restart() {
    state = initialState();
    for (let i = 0; i < 4; i += 1) state.rocks.push(spawnAsteroid(1));
    context.clearSession?.();
    last = performance.now();
  }

  function update(dt) {
    if (state.over) return;
    const s = state.ship;
    if (keys.left) s.a -= TURN * dt;
    if (keys.right) s.a += TURN * dt;
    if (keys.thrust) {
      s.vx += Math.cos(s.a) * THRUST * dt;
      s.vy += Math.sin(s.a) * THRUST * dt;
    }
    const spd = Math.hypot(s.vx, s.vy);
    if (spd > MAX_SPD) { s.vx = (s.vx / spd) * MAX_SPD; s.vy = (s.vy / spd) * MAX_SPD; }
    s.vx *= 1 - DRAG * dt;
    s.vy *= 1 - DRAG * dt;
    s.x = wrap(s.x + s.vx * dt, W);
    s.y = wrap(s.y + s.vy * dt, H);
    s.invuln = Math.max(0, s.invuln - dt);
    state.cool = Math.max(0, state.cool - dt);
    if (keys.fire) fire();

    for (const r of state.rocks) {
      r.x = wrap(r.x + r.vx * dt, W);
      r.y = wrap(r.y + r.vy * dt, H);
      r.rot += r.spin * dt;
    }
    for (const b of state.bullets) {
      b.x = wrap(b.x + b.vx * dt, W);
      b.y = wrap(b.y + b.vy * dt, H);
      b.life -= dt;
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);

    for (const b of state.bullets) {
      const hit = state.rocks.find((r) => Math.hypot(r.x - b.x, r.y - b.y) < r.r);
      if (hit) {
        b.life = 0;
        state.score += SCORES[hit.size];
        splitRock(hit);
        state.rocks = state.rocks.filter((r) => r !== hit);
        state.message = `+${SCORES[hit.size]}`;
        context.playSound?.("score");
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);

    if (s.invuln <= 0 && state.rocks.some((r) => Math.hypot(r.x - s.x, r.y - s.y) < r.r + SHIP_R)) hitShip();
    if (!state.rocks.length) { newWave(state); state.message = `第 ${state.wave} 波`; }
  }

  function drawShip(s) {
    if (s.invuln > 0 && Math.floor(s.invuln * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    ctx.strokeStyle = "#7fe3d4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-9, -7);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.stroke();
    if (keys.thrust) {
      ctx.strokeStyle = "#ffb347";
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-13, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#9bb0d0";
    ctx.lineWidth = 1.5;
    for (const r of state.rocks) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rot);
      ctx.beginPath();
      r.pts.forEach((p, i) => {
        const ang = (i / r.pts.length) * Math.PI * 2;
        const x = Math.cos(ang) * r.r * p;
        const y = Math.sin(ang) * r.r * p;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#ffd25a";
    for (const b of state.bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
    drawShip(state.ship);
    scoreEl.textContent = `分 ${state.score}`;
    livesEl.textContent = `命 ${state.lives}`;
    waveEl.textContent = `波 ${state.wave}`;
    statusEl.textContent = state.message;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) || 0;
    last = now;
    if (!context.isPaused?.()) update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  const onKey = (e) => {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "thrust", KeyA: "left", KeyD: "right", KeyW: "thrust" };
    const k = map[e.code];
    if (k) { keys[k] = e.type === "keydown"; e.preventDefault(); }
    if (e.code === "Space") { e.preventDefault(); if (e.type === "keydown" && !e.repeat) fire(); keys.fire = e.type === "keydown"; }
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);

  const padBinds = [];
  root.querySelectorAll("[data-k]").forEach((btn) => {
    const k = btn.dataset.k;
    const on = (e) => { e.preventDefault(); if (k === "fire") fire(); keys[k] = true; };
    const off = (e) => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointerleave", off);
    btn.addEventListener("pointercancel", off);
    padBinds.push([btn, on, off]);
  });
  const restartBtn = root.querySelector("[data-restart]");
  restartBtn.addEventListener("click", restart);

  last = performance.now();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    restartBtn.removeEventListener("click", restart);
    padBinds.forEach(([btn, on, off]) => {
      btn.removeEventListener("pointerdown", on);
      btn.removeEventListener("pointerup", off);
      btn.removeEventListener("pointerleave", off);
      btn.removeEventListener("pointercancel", off);
    });
  };
}
