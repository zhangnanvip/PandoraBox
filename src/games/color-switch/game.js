import { loadState, saveState } from "../../utils/storage.js";

const W = 300;
const H = 500;
const BALL_X = W / 2;
const BALL_R = 9;
const GRAVITY = 1500;
const HOP_V = -520;
const COLORS = ["#ff4d6d", "#3fa7ff", "#ffd23f", "#4cd96b"];
const BEST_KEY = "colorswitch:best";

const DIFFS = {
  easy: { speed: 64, spin: 1.0, gap: 168, ring: 60, label: "悠闲" },
  medium: { speed: 82, spin: 1.6, gap: 150, ring: 56, label: "标准" },
  hard: { speed: 100, spin: 2.3, gap: 134, ring: 52, label: "高速" },
  devil: { speed: 120, spin: 3.1, gap: 120, ring: 48, label: "地狱" }
};

function diffConfig(context) {
  return DIFFS[context.difficulty] || DIFFS.medium;
}

function makeRing(y, config) {
  return { y, ring: config.ring, dir: Math.random() < 0.5 ? 1 : -1, rot: Math.random() * Math.PI * 2, pad: y - config.gap / 2, passed: false, swapped: false };
}

function initialState(config) {
  const rings = [];
  for (let i = 0; i < 4; i++) rings.push(makeRing(H * 0.6 - i * config.gap, config));
  return { ballY: H - 80, vy: 0, color: 0, rings, score: 0, started: false, over: false, reported: false, config };
}

function hop(state) {
  if (state.over) return;
  state.started = true;
  state.vy = HOP_V;
}

// world scrolls down so ball climbs; ring sector under ball must match ball color
function step(state, dt) {
  const { config } = state;
  state.vy += GRAVITY * dt;
  state.ballY += state.vy * dt;
  for (const r of state.rings) { r.rot += r.dir * config.spin * dt; }

  if (state.ballY < H * 0.42) {
    const shift = H * 0.42 - state.ballY;
    state.ballY = H * 0.42;
    for (const r of state.rings) { r.y += shift; r.pad += shift; }
  }

  let topY = Infinity;
  for (const r of state.rings) topY = Math.min(topY, r.y);
  state.rings = state.rings.filter((r) => r.y < H + 90);
  while (state.rings.length < 4) { topY -= config.gap; state.rings.push(makeRing(topY, config)); }

  for (const r of state.rings) {
    if (!r.swapped && Math.abs(state.ballY - r.pad) < BALL_R + 7) { r.swapped = true; let n = state.color; while (n === state.color) n = Math.floor(Math.random() * 4); state.color = n; }
    if (!r.passed && Math.abs(state.ballY - r.y) < BALL_R + 4) {
      const seg = ringColorAt(r) === state.color;
      if (seg) { r.passed = true; state.score += 1; } else return crash(state);
    }
  }
  if (state.ballY > H + 40) crash(state);
}

function ringColorAt(r) {
  let a = (-Math.PI / 2 - r.rot) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return Math.floor(a / (Math.PI / 2)) % 4;
}

function crash(state) { if (state.over) return true; state.over = true; return true; }

function draw(ctx, state, best) {
  ctx.fillStyle = "#10131c"; ctx.fillRect(0, 0, W, H);
  for (const r of state.rings) {
    if (r.swapped) { ctx.fillStyle = COLORS[(ringColorAt(r) + 2) % 4]; ctx.beginPath(); ctx.arc(BALL_X, r.pad, 6, 0, Math.PI * 2); ctx.fill(); }
    const cx = BALL_X, rad = r.ring;
    ctx.lineWidth = 9;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = COLORS[i]; ctx.beginPath(); ctx.arc(cx, r.y, rad, r.rot + i * Math.PI / 2, r.rot + (i + 1) * Math.PI / 2); ctx.stroke(); }
  }
  ctx.fillStyle = COLORS[state.color]; ctx.beginPath(); ctx.arc(BALL_X, state.ballY, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 30px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(state.score), W / 2, 46);
  if (!state.started) { ctx.font = "15px system-ui,sans-serif"; ctx.fillText("点按 / 空格弹跳", W / 2, H - 40); }
  if (state.over) {
    ctx.fillStyle = "rgba(16,19,28,.6)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.font = "bold 22px system-ui,sans-serif"; ctx.fillText("撞色！", W / 2, H / 2 - 14);
    ctx.font = "14px system-ui,sans-serif"; ctx.fillText(`过环 ${state.score} · 最佳 ${best}`, W / 2, H / 2 + 14); ctx.fillText("点按重开", W / 2, H / 2 + 38);
  }
}

export function mountColorSwitch(root, context) {
  const config = diffConfig(context);
  let best = loadState(BEST_KEY, 0) || 0;
  let state = initialState(config);

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>换色 · ${config.label}</strong>
        <p class="game-note">点按 / 空格弹小球上跳，撞环瞬间球色须与色环对应扇区一致，色块换色</p>
      </div>
      <div class="mini-stats"><span data-score>过环 0</span><span data-best>最佳 ${best}</span></div>
    </section>
    <section class="arcade-shell">
      <div class="arcade-stage" style="display:flex;justify-content:center;">
        <canvas width="${W}" height="${H}" aria-label="换色"
          style="max-width:100%;border-radius:14px;touch-action:none;cursor:pointer;"></canvas>
      </div>
      <div style="display:flex;justify-content:center;margin-top:12px;">
        <button type="button" class="primary-button" data-restart>重开</button>
      </div>
    </section>`;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const status = root.querySelector("[data-status]");
  const scoreEl = root.querySelector("[data-score]");
  const bestEl = root.querySelector("[data-best]");

  function report() {
    if (state.reported) return; state.reported = true;
    if (state.score > best) { best = state.score; saveState(BEST_KEY, best); bestEl.textContent = `最佳 ${best}`; }
    status.textContent = `撞色 · 过环 ${state.score}`;
    context.reportResult?.({ outcome: "score", score: state.score, detail: `过环 ${state.score}` });
  }
  function restart() { state = initialState(config); status.textContent = `换色 · ${config.label}`; }
  function tap() { if (state.over) restart(); else hop(state); }

  const onPointer = (e) => { e.preventDefault(); tap(); };
  const onKey = (e) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); tap(); } };
  const onRestart = () => restart();
  canvas.addEventListener("pointerdown", onPointer);
  window.addEventListener("keydown", onKey);
  root.querySelector("[data-restart]").addEventListener("click", onRestart);

  let raf = 0, prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (!context.isPaused?.() && state.started && !state.over) step(state, dt);
    scoreEl.textContent = `过环 ${state.score}`;
    if (state.over) report();
    draw(ctx, state, best);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKey); root.querySelector("[data-restart]")?.removeEventListener("click", onRestart); };
}
