import { choice, clamp } from "../../utils/random.js";

const HOLES = 9;
const GAME_SECONDS = 60;
const MOLE_POINTS = 5;
const BOMB_PENALTY = 15;

// 难度 → 出现窗口(ms) [min,max] + 炸弹概率
const PACE = {
  easy: { up: [900, 1500], gap: [600, 1100], bomb: 0.08 },
  medium: { up: [650, 1100], gap: [450, 850], bomb: 0.14 },
  hard: { up: [480, 820], gap: [300, 620], bomb: 0.2 },
  devil: { up: [340, 620], gap: [200, 460], bomb: 0.26 }
};

function paceFor(difficulty) {
  return PACE[difficulty] || PACE.medium;
}

function randIn([min, max]) {
  return Math.round(min + Math.random() * (max - min));
}

function initialState() {
  return {
    holes: Array(HOLES).fill("empty"), // empty | mole | bomb
    score: 0,
    hits: 0,
    remaining: GAME_SECONDS,
    over: false,
    message: "点亮地洞里的地鼠，躲开炸弹"
  };
}

export function mountWhack(root, context) {
  let state = initialState();
  let disposed = false;
  let reported = false;
  let tickTimer = 0;
  const popTimers = new Array(HOLES).fill(0);
  const pace = paceFor(context.difficulty);

  function clearTimers() {
    clearInterval(tickTimer);
    tickTimer = 0;
    for (let i = 0; i < popTimers.length; i += 1) {
      clearTimeout(popTimers[i]);
      popTimers[i] = 0;
    }
  }

  function finish() {
    if (state.over) return;
    state.over = true;
    state.message = `时间到！本局 ${state.score} 分`;
    clearTimers();
    paint();
    if (!reported) {
      reported = true;
      context.reportResult?.({ outcome: "score", score: state.score, detail: state.message });
    }
  }

  function popHole(index) {
    if (disposed) return;
    clearTimeout(popTimers[index]);
    if (state.over) return;
    if (context.isPaused?.()) {
      popTimers[index] = window.setTimeout(() => popHole(index), 400);
      return;
    }
    state.holes[index] = Math.random() < pace.bomb ? "bomb" : "mole";
    paint();
    popTimers[index] = window.setTimeout(() => {
      state.holes[index] = "empty";
      paint();
      popTimers[index] = window.setTimeout(() => popHole(index), randIn(pace.gap));
    }, randIn(pace.up));
  }

  function startPops() {
    for (let i = 0; i < HOLES; i += 1) {
      popTimers[i] = window.setTimeout(() => popHole(i), randIn([200, 1400]));
    }
  }

  function tick() {
    if (disposed || state.over || context.isPaused?.()) return;
    state.remaining = clamp(state.remaining - 1, 0, GAME_SECONDS);
    if (state.remaining <= 0) {
      finish();
      return;
    }
    paintHud();
  }

  function whack(index) {
    if (state.over) return;
    const cell = state.holes[index];
    if (cell === "mole") {
      state.score += MOLE_POINTS;
      state.hits += 1;
      context.playSound?.("hit");
      try { navigator.vibrate?.(12); } catch {}
    } else if (cell === "bomb") {
      state.score = Math.max(0, state.score - BOMB_PENALTY);
      context.playSound?.("error");
      try { navigator.vibrate?.([30, 20, 30]); } catch {}
    } else {
      return;
    }
    state.holes[index] = "empty";
    clearTimeout(popTimers[index]);
    popTimers[index] = window.setTimeout(() => popHole(index), randIn(pace.gap));
    paint();
  }

  function restart() {
    clearTimers();
    state = initialState();
    reported = false;
    render();
    tickTimer = window.setInterval(tick, 1000);
    startPops();
  }

  function paintHud() {
    const t = root.querySelector("[data-time]");
    const s = root.querySelector("[data-score]");
    const h = root.querySelector("[data-hits]");
    if (t) t.textContent = `${state.remaining}s`;
    if (s) s.textContent = state.score;
    if (h) h.textContent = state.hits;
  }

  function paint() {
    paintHud();
    root.querySelectorAll("[data-hole]").forEach((btn) => {
      const kind = state.holes[Number(btn.dataset.hole)];
      btn.style.background = kind === "mole" ? "#7c4a23" : kind === "bomb" ? "#3a3340" : "#2b2230";
      btn.querySelector(".whack-face").textContent =
        kind === "mole" ? "🐹" : kind === "bomb" ? "💣" : "";
      btn.disabled = state.over;
    });
    const status = root.querySelector("[data-msg]");
    if (status) status.textContent = state.over ? choice(["再来一局？", state.message]) : state.message;
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong data-msg>${state.message}</strong>
          <p class="game-note">${context.labels?.mode || "单人挑战"} · ${context.labels?.difficulty || "标准"} · 60 秒</p>
        </div>
        <div class="mini-stats">
          <span>⏱ <b data-time>${state.remaining}s</b></span>
          <span>分 <b data-score>${state.score}</b></span>
          <span>命中 <b data-hits>${state.hits}</b></span>
        </div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:340px;margin:0 auto;width:100%;">
          ${Array.from({ length: HOLES }).map((_, i) => `
            <button type="button" data-hole="${i}" aria-label="地洞 ${i + 1}"
              style="aspect-ratio:1;border:none;border-radius:18px;cursor:pointer;font-size:clamp(28px,9vw,44px);display:flex;align-items:center;justify-content:center;background:#2b2230;box-shadow:inset 0 -8px 16px rgba(0,0,0,.4);touch-action:manipulation;transition:background .08s;">
              <span class="whack-face"></span>
            </button>
          `).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-hole]").forEach((btn) => {
      btn.addEventListener("click", () => whack(Number(btn.dataset.hole)));
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  tickTimer = window.setInterval(tick, 1000);
  startPops();

  return () => {
    disposed = true;
    clearTimers();
  };
}
