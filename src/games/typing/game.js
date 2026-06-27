import { choice } from "../../utils/random.js";

const BOARD = 360; // 移动端基准宽
const BASE_LIVES = 3;

const WORDS = [
  "ma", "mi", "mu", "me", "mo", "fa", "fei", "tu", "tian", "kong",
  "yun", "feng", "yu", "xing", "yue", "guang", "su", "kuai", "chong", "ci",
  "lei", "huo", "bing", "shan", "hai", "lu", "niao", "fan", "ying", "ji",
  "qi", "ying", "zha", "po", "lang", "tao", "dou", "shi", "ke", "ji"
];

const TUNE = {
  easy: { fall: 9000, spawn: 1700, ramp: 0.94 },
  medium: { fall: 7000, spawn: 1300, ramp: 0.93 },
  hard: { fall: 5200, spawn: 1000, ramp: 0.91 },
  devil: { fall: 4000, spawn: 800, ramp: 0.9 }
};

function tuning(difficulty) {
  return TUNE[difficulty] || TUNE.medium;
}

function initialState() {
  return {
    phase: "ready", // ready | playing | done
    lives: BASE_LIVES,
    score: 0,
    cleared: 0,
    missed: 0,
    spawnEvery: 0,
    fallMs: 0
  };
}

export function mountTyping(root, context) {
  const tune = tuning(context.difficulty);
  let state = initialState();
  let disposed = false;
  let reported = false;
  let words = [];
  let nextId = 1;
  let lastTs = 0;
  let spawnAcc = 0;
  let rafId = 0;
  let spawnEvery = tune.spawn;
  let fallMs = tune.fall;

  function clearLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function reset() {
    state = initialState();
    words = [];
    nextId = 1;
    lastTs = 0;
    spawnAcc = 0;
    spawnEvery = tune.spawn;
    fallMs = tune.fall;
    reported = false;
  }

  function spawnWord() {
    const text = choice(WORDS);
    words.push({ id: nextId++, text, x: 6 + Math.random() * 70, y: 0 });
  }

  function loop(ts) {
    if (disposed || state.phase !== "playing") return;
    if (context.isPaused?.()) {
      lastTs = ts;
      rafId = requestAnimationFrame(loop);
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(120, ts - lastTs);
    lastTs = ts;
    spawnAcc += dt;
    if (spawnAcc >= spawnEvery) {
      spawnAcc = 0;
      spawnWord();
    }
    const speed = 100 / fallMs; // %/ms
    for (const w of words) w.y += speed * dt;
    const survivors = [];
    for (const w of words) {
      if (w.y >= 100) {
        state.lives -= 1;
        state.missed += 1;
        context.playSound?.("miss");
      } else {
        survivors.push(w);
      }
    }
    words = survivors;
    if (state.lives <= 0) {
      finish();
      return;
    }
    renderField();
    renderStats();
    rafId = requestAnimationFrame(loop);
  }

  function tryMatch(text) {
    if (state.phase !== "playing") return;
    const idx = words.findIndex((w) => w.text === text);
    if (idx < 0) return;
    const w = words[idx];
    words.splice(idx, 1);
    state.cleared += 1;
    state.score += 10 + Math.round((100 - w.y) / 8);
    spawnEvery = Math.max(420, Math.round(spawnEvery * tune.ramp));
    fallMs = Math.max(2200, Math.round(fallMs * 0.98));
    context.playSound?.("hit");
    renderField();
    renderStats();
  }

  function finish() {
    clearLoop();
    state.phase = "done";
    if (!reported) {
      reported = true;
      context.reportResult?.({
        outcome: "score",
        detail: `清除 ${state.cleared} · 漏 ${state.missed}`,
        score: state.score,
        moves: state.cleared
      });
    }
    render();
  }

  function start() {
    reset();
    state.phase = "playing";
    clearLoop();
    rafId = requestAnimationFrame(loop);
    render();
  }

  function restart() {
    clearLoop();
    reset();
    render();
  }

  function onKey(e) {
    if (state.phase !== "playing") return;
    const k = e.key;
    if (!/^[a-zA-Z]$/.test(k)) return;
    buffer += k.toLowerCase();
    if (bufferTimer) clearTimeout(bufferTimer);
    const before = words.length;
    tryMatch(buffer);
    if (words.length < before) buffer = "";
    bufferTimer = window.setTimeout(() => { buffer = ""; }, 900);
  }

  let buffer = "";
  let bufferTimer = 0;

  function renderStats() {
    const el = root.querySelector("[data-stats]");
    if (!el) return;
    el.innerHTML = `<span>分 ${state.score}</span><span>清 ${state.cleared}</span><span>命 ${state.lives}</span>`;
  }

  function renderField() {
    const field = root.querySelector("[data-field]");
    if (!field) return;
    field.innerHTML = words.map((w) =>
      `<button type="button" data-tile="${w.text}" style="position:absolute;left:${w.x}%;top:${w.y}%;transform:translateY(-50%);min-width:56px;min-height:44px;padding:6px 14px;border:none;border-radius:12px;cursor:pointer;font-size:18px;font-weight:700;letter-spacing:1px;color:#fff;background:linear-gradient(180deg,#5b8def,#3a5fd6);box-shadow:0 4px 12px rgba(58,95,214,.4);touch-action:manipulation;">${w.text}</button>`
    ).join("");
  }

  function render() {
    const note = `${context.labels?.mode || "单人"} · ${context.labels?.difficulty || "中等"}`;
    const head = state.phase === "done"
      ? `结束 · 得分 ${state.score}`
      : state.phase === "playing"
      ? `清除 ${state.cleared} 个`
      : "打字拦截来袭目标";
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${head}</strong>
          <p class="game-note">${note}${state.phase === "playing" ? " · 点字块或敲键盘" : ""}</p>
        </div>
        <div class="mini-stats" data-stats>
          <span>分 ${state.score}</span><span>清 ${state.cleared}</span><span>命 ${state.lives}</span>
        </div>
      </section>
      <section class="board-wrap">
        <div data-field style="position:relative;width:100%;max-width:${BOARD}px;aspect-ratio:3/4;margin:0 auto;border-radius:16px;background:#0d1422;overflow:hidden;touch-action:manipulation;">
          ${state.phase !== "playing" ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cfd8e6;font-size:14px;text-align:center;padding:16px;">${state.phase === "done" ? `清除 ${state.cleared}，漏 ${state.missed}` : "拼音从顶部下落，点中或打对即清除，漏到底掉命"}</div>` : ""}
        </div>
      </section>
      <section class="game-panel toolbar">
        ${state.phase === "playing"
          ? `<button class="danger-button" data-action="restart">重开</button>`
          : `<button class="primary-button" data-action="start">${state.phase === "done" ? "再来一局" : "开始"}</button>`}
      </section>
    `;
    const field = root.querySelector("[data-field]");
    field?.addEventListener("pointerdown", onFieldTap);
    root.querySelector("[data-action='start']")?.addEventListener("click", start);
    root.querySelector("[data-action='restart']")?.addEventListener("click", restart);
    if (state.phase === "playing") { renderField(); renderStats(); }
  }

  function onFieldTap(e) {
    const tile = e.target.closest("[data-tile]");
    if (!tile) return;
    e.stopPropagation();
    tryMatch(tile.dataset.tile);
  }

  window.addEventListener("keydown", onKey);
  render();

  return () => {
    disposed = true;
    clearLoop();
    if (bufferTimer) clearTimeout(bufferTimer);
    window.removeEventListener("keydown", onKey);
  };
}
