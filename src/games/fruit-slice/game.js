import { choice, clamp } from "../../utils/random.js";

const W = 340;
const H = 460;
const GRAVITY = 920;
const MAX_MISS = 3;

const FRUITS = [
  { name: "西瓜", body: "#3fae5a", core: "#ff5e6c", points: 8 },
  { name: "橙子", body: "#ff9d3c", core: "#ffd089", points: 6 },
  { name: "苹果", body: "#e7434c", core: "#fff0c2", points: 5 },
  { name: "柠檬", body: "#f4d23c", core: "#fff7c4", points: 7 },
  { name: "葡萄", body: "#7b5bd6", core: "#cdb4ff", points: 9 }
];

function makeObject(isBomb) {
  const fruit = isBomb ? null : choice(FRUITS);
  const radius = isBomb ? 24 : 26 + Math.random() * 8;
  const startX = 40 + Math.random() * (W - 80);
  const dir = startX < W / 2 ? 1 : -1;
  return {
    bomb: isBomb,
    fruit,
    radius,
    x: startX,
    y: H + radius,
    vx: dir * (60 + Math.random() * 90),
    vy: -(560 + Math.random() * 150),
    spin: (Math.random() - 0.5) * 6,
    angle: 0,
    sliced: false,
    dead: false,
    scored: false
  };
}

function initialState() {
  return {
    objects: [],
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    misses: 0,
    spawnTimer: 0.6,
    flash: 0,
    over: false,
    message: "下滑屏幕切水果，别碰炸弹"
  };
}

function spawnWave(state) {
  const count = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i += 1) {
    const bomb = Math.random() < 0.18 && state.objects.length > 0;
    state.objects.push(makeObject(bomb));
  }
  state.spawnTimer = 0.85 + Math.random() * 0.8;
}

function spread(start, end, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: (start.x + end.x) / 2 + (Math.random() - 0.5) * 28,
      y: (start.y + end.y) / 2 + (Math.random() - 0.5) * 28,
      vx: (Math.random() - 0.5) * 200,
      vy: -120 - Math.random() * 160,
      life: 0.5,
      r: 3 + Math.random() * 3
    });
  }
  return out;
}

function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = ax + dx * t;
  const py = ay + dy * t;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

export function mountFruitSlice(root, context) {
  let state = initialState();
  let raf = null;
  let last = 0;
  let trail = [];
  let bits = [];
  let dragging = false;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>单人挑战 · 连切得连击 · ${MAX_MISS} 次漏切结束</p>
      </div>
      <div class="mini-stats">
        <span data-score>分数 0</span>
        <span data-combo>连击 0</span>
        <span data-miss>漏切 0/${MAX_MISS}</span>
      </div>
    </section>
    <section class="board-wrap" style="display:flex;flex-direction:column;align-items:center;gap:12px;">
      <canvas data-canvas style="width:${W}px;height:${H}px;max-width:100%;touch-action:none;border-radius:16px;background:linear-gradient(180deg,#1a1538,#2d1b4e);box-shadow:0 8px 28px rgba(0,0,0,.35);"></canvas>
      <div style="display:flex;gap:10px;">
        <button type="button" class="primary-button" data-restart>重开</button>
      </div>
    </section>
  `;

  const canvas = root.querySelector("[data-canvas]");
  const ctx = canvas.getContext("2d");
  const statusEl = root.querySelector("[data-status]");
  const scoreEl = root.querySelector("[data-score]");
  const comboEl = root.querySelector("[data-combo]");
  const missEl = root.querySelector("[data-miss]");
  const restartBtn = root.querySelector("[data-restart]");

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function refreshHud() {
    statusEl.textContent = state.message;
    scoreEl.textContent = `分数 ${state.score}`;
    comboEl.textContent = `连击 ${state.combo}`;
    missEl.textContent = `漏切 ${state.misses}/${MAX_MISS}`;
  }

  function pos(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * W,
      y: ((ev.clientY - rect.top) / rect.height) * H
    };
  }

  function endGame() {
    if (state.over) return;
    state.over = true;
    state.best = Math.max(state.best, state.score);
    state.message = `结束！得分 ${state.score}`;
    context.reportResult?.({ outcome: "score", detail: state.message, score: state.score });
    context.playSound?.("lose");
  }

  function slice(obj) {
    if (obj.sliced) return;
    obj.sliced = true;
    if (obj.bomb) {
      state.flash = 0.4;
      state.combo = 0;
      bits.push(...spread(obj, obj, 14).map((b) => ({ ...b, color: "#ff5252" })));
      endGame();
      return;
    }
    state.combo += 1;
    state.comboTimer = 0.9;
    const bonus = state.combo >= 2 ? state.combo : 0;
    state.score += obj.fruit.points + bonus;
    if (state.combo >= 2) state.message = `连击 ${state.combo}！+${obj.fruit.points + bonus}`;
    bits.push(...spread(obj, obj, 10).map((b) => ({ ...b, color: obj.fruit.core })));
    context.playSound?.("score");
  }

  function checkTrail() {
    if (trail.length < 2 || state.over) return;
    const a = trail[trail.length - 2];
    const b = trail[trail.length - 1];
    state.objects.forEach((obj) => {
      if (!obj.sliced && segHitsCircle(a.x, a.y, b.x, b.y, obj.x, obj.y, obj.radius)) slice(obj);
    });
  }

  function onDown(ev) {
    dragging = true;
    trail = [pos(ev)];
    canvas.setPointerCapture?.(ev.pointerId);
  }
  function onMove(ev) {
    if (!dragging) return;
    trail.push(pos(ev));
    if (trail.length > 14) trail.shift();
    checkTrail();
    ev.preventDefault();
  }
  function onUp() {
    dragging = false;
    trail = [];
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  restartBtn.addEventListener("click", restart);

  function restart() {
    state = initialState();
    bits = [];
    trail = [];
    refreshHud();
  }

  function update(dt) {
    if (state.over) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) spawnWave(state);
    state.flash = Math.max(0, state.flash - dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    state.objects.forEach((obj) => {
      obj.vy += GRAVITY * dt;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.angle += obj.spin * dt;
      if (obj.y > H + obj.radius + 10 && !obj.dead) {
        obj.dead = true;
        if (!obj.sliced && !obj.bomb) {
          state.misses += 1;
          state.combo = 0;
          if (state.misses >= MAX_MISS) endGame();
        }
      }
    });
    state.objects = state.objects.filter((o) => !o.dead);
    bits.forEach((b) => {
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    });
    bits = bits.filter((b) => b.life > 0);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    state.objects.forEach((obj) => {
      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate(obj.angle);
      if (obj.bomb) {
        ctx.fillStyle = "#222";
        ctx.beginPath(); ctx.arc(0, 0, obj.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff5252";
        ctx.fillRect(-3, -obj.radius - 6, 6, 8);
      } else {
        ctx.fillStyle = obj.fruit.body;
        ctx.beginPath(); ctx.arc(0, 0, obj.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = obj.fruit.core;
        ctx.beginPath(); ctx.arc(0, 0, obj.radius * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
    bits.forEach((b) => {
      ctx.globalAlpha = clamp(b.life / 0.5, 0, 1);
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    if (trail.length > 1) {
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i += 1) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,80,80,${state.flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state.over) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(`得分 ${state.score}`, W / 2, H / 2 - 6);
      ctx.font = "14px sans-serif";
      ctx.fillText("点「重开」再来一局", W / 2, H / 2 + 22);
    }
    refreshHud();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!context.isPaused?.()) update(dt);
    draw();
  }
  raf = requestAnimationFrame(frame);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    restartBtn.removeEventListener("click", restart);
  };
}
