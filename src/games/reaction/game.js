import { clamp } from "../../utils/random.js";

const BOARD = 360;
const TOTAL = 30;
const MISS_PENALTY = 250; // ms 罚分

const TUNE = {
  easy: { size: 84, min: 48, deadline: 2400 },
  medium: { size: 70, min: 38, deadline: 1700 },
  hard: { size: 58, min: 30, deadline: 1200 },
  devil: { size: 46, min: 22, deadline: 900 }
};

function tuning(difficulty) {
  return TUNE[difficulty] || TUNE.medium;
}

function initialState() {
  return {
    phase: "ready", // ready | playing | done
    round: 0, // 已完成靶数
    hits: 0,
    misses: 0,
    total: 0, // 命中累计反应 ms
    size: 0,
    x: 0,
    y: 0,
    spawnAt: 0
  };
}

function avg(state) {
  return state.hits ? Math.round(state.total / state.hits) : 0;
}

export function mountReaction(root, context) {
  const tune = tuning(context.difficulty);
  let state = initialState();
  let disposed = false;
  let deadlineTimer = 0;
  let reported = false;

  function clearTimer() {
    clearTimeout(deadlineTimer);
    deadlineTimer = 0;
  }

  function spawn() {
    if (disposed) return;
    const progress = state.round / TOTAL;
    state.size = Math.round(tune.size - (tune.size - tune.min) * progress);
    const pad = 6;
    const span = BOARD - state.size - pad * 2;
    state.x = pad + Math.random() * span;
    state.y = pad + Math.random() * span;
    state.spawnAt = performance.now();
    clearTimer();
    deadlineTimer = window.setTimeout(onTimeout, tune.deadline);
    renderTarget();
  }

  function onTimeout() {
    if (disposed || state.phase !== "playing") return;
    state.misses += 1;
    state.total += MISS_PENALTY; // 超时也吃罚分
    nextRound();
  }

  function nextRound() {
    state.round += 1;
    if (state.round >= TOTAL) return finish();
    spawn();
  }

  function score() {
    const speed = avg(state);
    return speed ? clamp(Math.round(45000 / speed) - state.misses * 5, 0, 9999) : 0;
  }

  function finish() {
    clearTimer();
    state.phase = "done";
    if (!reported) {
      reported = true;
      context.reportResult?.({
        outcome: "score",
        detail: `命中 ${state.hits}/${TOTAL} · 均速 ${avg(state)}ms`,
        score: score(),
        moves: state.hits
      });
    }
    render();
  }

  function hit() {
    if (state.phase !== "playing") return;
    state.total += performance.now() - state.spawnAt;
    state.hits += 1;
    context.playSound?.("hit");
    clearTimer();
    nextRound();
  }

  function miss() {
    if (state.phase !== "playing") return;
    state.misses += 1;
    state.total += MISS_PENALTY;
    renderStats();
  }

  function start() {
    state = initialState();
    state.phase = "playing";
    reported = false;
    spawn();
    render();
  }

  function restart() {
    clearTimer();
    state = initialState();
    reported = false;
    render();
  }

  function renderStats() {
    const el = root.querySelector("[data-stats]");
    if (!el) return;
    el.innerHTML = `<span>命中 ${state.hits}</span><span>错失 ${state.misses}</span><span>均速 ${avg(state)}ms</span>`;
  }

  function renderTarget() {
    const board = root.querySelector("[data-board]");
    if (!board) return;
    const left = Math.round(state.x);
    const top = Math.round(state.y);
    board.innerHTML = `
      <button type="button" data-target style="position:absolute;left:${left}px;top:${top}px;width:${state.size}px;height:${state.size}px;border-radius:50%;border:none;cursor:pointer;background:radial-gradient(circle at 35% 30%,#ff8a5c,#e23744);box-shadow:0 6px 16px rgba(226,55,68,.45);transition:width .12s,height .12s;" aria-label="点击靶子"></button>`;
    board.querySelector("[data-target]").addEventListener("pointerdown", onTargetHit);
    renderStats();
  }

  function onTargetHit(event) {
    event.stopPropagation();
    hit();
  }

  function render() {
    const note = `${context.labels?.mode || "单人"} · ${context.labels?.difficulty || "中等"}`;
    const head = state.phase === "done"
      ? `结束 · 均速 ${avg(state)}ms`
      : state.phase === "playing"
      ? `第 ${state.round + 1}/${TOTAL} 靶`
      : "准备好就开始";
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${head}</strong>
          <p class="game-note">${note}${state.phase === "playing" ? " · 越快分越高" : ""}</p>
        </div>
        <div class="mini-stats" data-stats>
          <span>命中 ${state.hits}</span><span>错失 ${state.misses}</span><span>均速 ${avg(state)}ms</span>
        </div>
      </section>
      <section class="board-wrap">
        <div data-board style="position:relative;width:100%;max-width:${BOARD}px;aspect-ratio:1;margin:0 auto;border-radius:16px;background:#101826;overflow:hidden;touch-action:manipulation;">
          ${state.phase !== "playing" ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfd8e6;font-size:14px;text-align:center;padding:16px;">${state.phase === "done" ? `命中 ${state.hits}/${TOTAL}，错失 ${state.misses}` : "出现靶子立刻点，点空白扣分"}</div>` : ""}
        </div>
      </section>
      <section class="game-panel toolbar">
        ${state.phase === "playing"
          ? `<button class="danger-button" data-action="restart">重开</button>`
          : `<button class="primary-button" data-action="start">${state.phase === "done" ? "再来一局" : "开始"}</button>`}
      </section>
    `;
    const board = root.querySelector("[data-board]");
    board?.addEventListener("pointerdown", miss);
    const startBtn = root.querySelector("[data-action='start']");
    startBtn?.addEventListener("click", start);
    const restartBtn = root.querySelector("[data-action='restart']");
    restartBtn?.addEventListener("click", restart);
    if (state.phase === "playing") renderTarget();
  }

  render();

  return () => {
    disposed = true;
    clearTimer();
  };
}
