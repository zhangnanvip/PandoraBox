import { loadState, saveState } from "../../utils/storage.js";
import { clamp } from "../../utils/random.js";

const W = 300;
const H = 440;
const BIRD_X = 78;
const BIRD_R = 12;
const GRAVITY = 1500;
const FLAP_V = -380;
const PIPE_W = 52;
const BEST_KEY = "flappy:best";

const DIFFS = {
  easy: { gap: 150, speed: 130, spacing: 220, label: "悠闲" },
  medium: { gap: 128, speed: 158, spacing: 200, label: "标准" },
  hard: { gap: 108, speed: 188, spacing: 182, label: "高速" },
  devil: { gap: 92, speed: 222, spacing: 168, label: "地狱" }
};

function diffConfig(context) {
  return DIFFS[context.difficulty] || DIFFS.medium;
}

function initialState(config) {
  return {
    birdY: H / 2,
    vy: 0,
    pipes: [{ x: W + 40, gapY: H / 2 }],
    distance: 0,
    score: 0,
    started: false,
    over: false,
    reported: false,
    config
  };
}

function flap(state) {
  if (state.over) return;
  state.started = true;
  state.vy = FLAP_V;
}

function spawnGap(config) {
  const margin = config.gap / 2 + 36;
  return margin + Math.random() * (H - margin * 2);
}

function step(state, dt) {
  const { config } = state;
  state.vy += GRAVITY * dt;
  state.birdY += state.vy * dt;
  state.distance += config.speed * dt;

  for (const pipe of state.pipes) pipe.x -= config.speed * dt;

  const last = state.pipes[state.pipes.length - 1];
  if (W - last.x >= config.spacing) {
    state.pipes.push({ x: W, gapY: spawnGap(config) });
  }
  state.pipes = state.pipes.filter((p) => p.x + PIPE_W > -4);

  for (const pipe of state.pipes) {
    if (!pipe.passed && pipe.x + PIPE_W < BIRD_X - BIRD_R) {
      pipe.passed = true;
      state.score += 1;
    }
    const half = config.gap / 2;
    const inX = BIRD_X + BIRD_R > pipe.x && BIRD_X - BIRD_R < pipe.x + PIPE_W;
    const inGap = state.birdY - BIRD_R > pipe.gapY - half && state.birdY + BIRD_R < pipe.gapY + half;
    if (inX && !inGap) return crash(state);
  }

  if (state.birdY + BIRD_R >= H || state.birdY - BIRD_R <= 0) {
    state.birdY = clamp(state.birdY, BIRD_R, H - BIRD_R);
    crash(state);
  }
}

function crash(state) {
  if (state.over) return true;
  state.over = true;
  return true;
}

function draw(ctx, state, best) {
  ctx.fillStyle = "#5ec5e6";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#dff3fb";
  ctx.beginPath();
  ctx.arc(60, 70, 18, 0, Math.PI * 2);
  ctx.arc(86, 70, 24, 0, Math.PI * 2);
  ctx.arc(112, 70, 18, 0, Math.PI * 2);
  ctx.fill();

  const half = state.config.gap / 2;
  for (const pipe of state.pipes) {
    ctx.fillStyle = "#3fae5a";
    ctx.fillRect(pipe.x, 0, PIPE_W, pipe.gapY - half);
    ctx.fillRect(pipe.x, pipe.gapY + half, PIPE_W, H);
    ctx.fillStyle = "#2f8c46";
    ctx.fillRect(pipe.x - 3, pipe.gapY - half - 14, PIPE_W + 6, 14);
    ctx.fillRect(pipe.x - 3, pipe.gapY + half, PIPE_W + 6, 14);
  }

  ctx.fillStyle = "#e6c45a";
  ctx.fillRect(0, H - 16, W, 16);

  ctx.save();
  ctx.translate(BIRD_X, state.birdY);
  ctx.rotate(clamp(state.vy / 600, -0.5, 0.9));
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff8c00";
  ctx.fillRect(BIRD_R - 2, -2, 8, 4);
  ctx.fillStyle = "#1d2b3a";
  ctx.beginPath();
  ctx.arc(4, -4, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(state.score), W / 2, 56);

  if (!state.started) {
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("点按 / 空格起飞", W / 2, H / 2 + 70);
  }
  if (state.over) {
    ctx.fillStyle = "rgba(20,30,42,.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText("坠机", W / 2, H / 2 - 16);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(`过管 ${state.score} · 最佳 ${best}`, W / 2, H / 2 + 14);
    ctx.fillText("点按重开", W / 2, H / 2 + 40);
  }
}

export function mountFlappy(root, context) {
  const config = diffConfig(context);
  let best = loadState(BEST_KEY, 0) || 0;
  let state = initialState(config);

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>像素鸟 · ${config.label}</strong>
        <p class="game-note" data-note>点按 / 单击 / 空格扇翅膀，穿过管道缝隙</p>
      </div>
      <div class="mini-stats">
        <span data-score>过管 0</span>
        <span data-best>最佳 ${best}</span>
      </div>
    </section>
    <section class="arcade-shell">
      <div class="arcade-stage" style="display:flex;justify-content:center;">
        <canvas width="${W}" height="${H}" aria-label="像素鸟"
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
  const scoreEl = root.querySelector("[data-score]");
  const bestEl = root.querySelector("[data-best]");

  function report() {
    if (state.reported) return;
    state.reported = true;
    if (state.score > best) {
      best = state.score;
      saveState(BEST_KEY, best);
      bestEl.textContent = `最佳 ${best}`;
    }
    status.textContent = `坠机 · 过管 ${state.score}`;
    context.reportResult?.({ outcome: "score", score: state.score, detail: `过管 ${state.score}` });
  }

  function restart() {
    state = initialState(config);
    status.textContent = `像素鸟 · ${config.label}`;
  }

  function tap() {
    if (state.over) restart();
    else flap(state);
  }

  const onPointer = (e) => { e.preventDefault(); tap(); };
  const onKey = (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); tap(); }
  };
  canvas.addEventListener("pointerdown", onPointer);
  window.addEventListener("keydown", onKey);
  const onRestart = () => restart();
  root.querySelector("[data-restart]").addEventListener("click", onRestart);

  let raf = 0;
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (!context.isPaused?.() && state.started && !state.over) step(state, dt);
    scoreEl.textContent = `过管 ${state.score}`;
    if (state.over) report();
    draw(ctx, state, best);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointer);
    window.removeEventListener("keydown", onKey);
  };
}
