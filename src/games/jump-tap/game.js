import { clamp } from "../../utils/random.js";

const W = 340;
const H = 420;
const GROUND_Y = 320;
const HOPPER_R = 14;
const MIN_W = 36;
const MAX_W = 70;
const CHARGE_RATE = 200; // px per second of leap reach while charging
const MAX_REACH = 280;

const DIFFICULTY = {
  easy: { gapBase: 70, gapVar: 28 },
  medium: { gapBase: 90, gapVar: 50 },
  hard: { gapBase: 105, gapVar: 78 },
  devil: { gapBase: 120, gapVar: 110 }
};

function tuning(difficulty) {
  return DIFFICULTY[difficulty] || DIFFICULTY.medium;
}

function makePlatform(prevRight, conf) {
  const gap = conf.gapBase + Math.round((Math.random() - 0.5) * conf.gapVar * 2);
  const width = MIN_W + Math.round(Math.random() * (MAX_W - MIN_W));
  const left = prevRight + clamp(gap, 24, MAX_REACH - width);
  return { left, width, top: GROUND_Y };
}

function initialState(conf) {
  const first = { left: 40, width: 60, top: GROUND_Y };
  const platforms = [first];
  let right = first.left + first.width;
  for (let i = 0; i < 4; i++) {
    const p = makePlatform(right, conf);
    platforms.push(p);
    right = p.left + p.width;
  }
  return {
    platforms,
    cur: 0,
    hopper: { x: first.left + first.width / 2, y: GROUND_Y },
    score: 0,
    phase: "idle", // idle | charge | leap | over
    charge: 0,
    leap: null,
    scroll: 0,
    over: false,
    message: "按住蓄力，松手起跳"
  };
}

export function mountJumpTap(root, context) {
  const conf = tuning(context.difficulty);
  let state = initialState(conf);
  let raf = 0;
  let last = 0;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels?.difficulty || "中等"} · 按住蓄力越远 · 中心着陆有加成</p>
      </div>
      <div class="mini-stats"><span data-score>分 0</span><span data-best>越中心越高分</span></div>
    </section>
    <section class="board-wrap">
      <canvas data-cv width="${W}" height="${H}" style="max-width:340px;width:100%;height:auto;display:block;margin:0 auto;border-radius:14px;background:#101b2e;touch-action:none;cursor:pointer;"></canvas>
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

  function startCharge() {
    if (state.over || state.phase !== "idle") return;
    state.phase = "charge";
    state.charge = 0;
  }

  function release() {
    if (state.over || state.phase !== "charge") return;
    state.phase = "leap";
    state.leap = { from: state.hopper.x, dist: state.charge, t: 0, dur: 0.5 };
    state.charge = 0;
  }

  function settleLanding() {
    const next = state.cur + 1;
    const p = state.platforms[next];
    state.phase = "idle";
    if (!p) return finish();
    const center = p.left + p.width / 2;
    if (state.hopper.x >= p.left && state.hopper.x <= p.left + p.width) {
      state.cur = next;
      const bonus = Math.abs(state.hopper.x - center) < p.width * 0.18 ? 2 : 0;
      state.score += 1 + bonus;
      state.message = bonus ? "完美落地 +3" : "+1";
      context.playSound?.("score");
      let r = state.platforms[state.platforms.length - 1];
      r = r.left + r.width;
      const np = makePlatform(r, conf);
      state.platforms.push(np);
    } else {
      finish();
    }
  }

  function finish() {
    if (state.over) return;
    state.over = true;
    state.phase = "over";
    state.message = `掉落 · 得分 ${state.score}`;
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", detail: state.message, score: state.score });
  }

  function restart() {
    state = initialState(conf);
    context.clearSession?.();
    last = performance.now();
  }

  function update(dt) {
    if (state.over) return;
    if (state.phase === "charge") {
      state.charge = clamp(state.charge + CHARGE_RATE * dt, 0, MAX_REACH);
    } else if (state.phase === "leap") {
      const l = state.leap;
      l.t += dt;
      const k = clamp(l.t / l.dur, 0, 1);
      state.hopper.x = l.from + l.dist * k;
      state.hopper.y = GROUND_Y - Math.sin(k * Math.PI) * (60 + l.dist * 0.3);
      if (k >= 1) {
        state.hopper.y = GROUND_Y;
        settleLanding();
      }
    }
    const focus = state.platforms[state.cur];
    const target = clamp(focus.left + focus.width / 2 - 80, 0, 4000);
    state.scroll += (target - state.scroll) * Math.min(1, dt * 6);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-state.scroll, 0);
    state.platforms.forEach((p, i) => {
      ctx.fillStyle = i === state.cur ? "#4ad6c8" : "#2a3c5a";
      ctx.fillRect(p.left, p.top, p.width, H - p.top);
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillRect(p.left + p.width / 2 - 1, p.top, 2, 6);
    });
    if (state.phase === "charge") {
      const reach = state.charge;
      ctx.strokeStyle = "rgba(255,210,90,.7)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(state.hopper.x, GROUND_Y - 2);
      ctx.lineTo(state.hopper.x + reach, GROUND_Y - 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffd25a";
    ctx.beginPath();
    ctx.arc(state.hopper.x, state.hopper.y - HOPPER_R, HOPPER_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    scoreEl.textContent = `分 ${state.score}`;
    statusEl.textContent = state.message;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) || 0;
    last = now;
    if (!context.isPaused?.()) update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  const onDown = (e) => { e.preventDefault(); startCharge(); };
  const onUp = (e) => { e.preventDefault(); release(); };
  const onKey = (e) => {
    if (e.code !== "Space") return;
    e.preventDefault();
    if (e.type === "keydown" && !e.repeat) startCharge();
    if (e.type === "keyup") release();
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  root.querySelector("[data-restart]").addEventListener("click", restart);

  last = performance.now();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
  };
}
