import { clamp } from "../../utils/random.js";

const PADS = [
  { id: 0, name: "绿", color: "#2ecc71", dim: "#1d7a47", freq: 392.0 }, // G4
  { id: 1, name: "红", color: "#e74c3c", dim: "#8c2c22", freq: 329.6 }, // E4
  { id: 2, name: "黄", color: "#f1c40f", dim: "#8c7308", freq: 261.6 }, // C4
  { id: 3, name: "蓝", color: "#3498db", dim: "#1c5a85", freq: 196.0 }  // G3
];

// 难度 -> 每个亮灯时长 / 间隔（毫秒），越难越快
const SPEED = {
  easy: { on: 620, gap: 280 },
  medium: { on: 460, gap: 200 },
  hard: { on: 340, gap: 150 },
  devil: { on: 240, gap: 110 }
};

function pickSpeed(difficulty) {
  return SPEED[difficulty] || SPEED.medium;
}

function initialState() {
  return {
    sequence: [],
    inputIndex: 0,
    phase: "idle", // idle | playing | input | over
    best: 0,
    message: "记住灯的顺序，按相同次序点回去"
  };
}

export function mountSimon(root, context) {
  const speed = pickSpeed(context.difficulty);
  let state = initialState();
  let disposed = false;
  let resultReported = false;
  const timers = new Set();
  let audioCtx = null;

  function later(fn, ms) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function beep(freq, ms) {
    if (context.playSound) {
      context.playSound("tap");
      return;
    }
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const dur = ms / 1000;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function flash(id) {
    const pad = root.querySelector(`[data-pad="${id}"]`);
    if (!pad) return;
    pad.style.background = PADS[id].color;
    pad.style.boxShadow = `0 0 22px ${PADS[id].color}`;
    later(() => {
      pad.style.background = PADS[id].dim;
      pad.style.boxShadow = "none";
    }, speed.on);
  }

  function nextRound() {
    state.sequence.push(Math.floor(Math.random() * PADS.length));
    state.inputIndex = 0;
    state.phase = "playing";
    state.message = `第 ${state.sequence.length} 关 · 看灯`;
    render();
    playSequence();
  }

  function playSequence(step = 0) {
    if (disposed) return;
    if (context.isPaused?.()) {
      later(() => playSequence(step), 200);
      return;
    }
    if (step >= state.sequence.length) {
      state.phase = "input";
      state.message = `轮到你 · 复述 ${state.sequence.length} 步`;
      render();
      return;
    }
    const id = state.sequence[step];
    flash(id);
    beep(PADS[id].freq, speed.on);
    later(() => playSequence(step + 1), speed.on + speed.gap);
  }

  function press(id) {
    if (state.phase !== "input" || disposed) return;
    flash(id);
    beep(PADS[id].freq, speed.on);
    if (state.sequence[state.inputIndex] === id) {
      state.inputIndex += 1;
      if (state.inputIndex >= state.sequence.length) {
        state.best = Math.max(state.best, state.sequence.length);
        state.phase = "playing";
        state.message = "正确！下一关";
        render();
        later(nextRound, 700);
      }
    } else {
      gameOver();
    }
  }

  function gameOver() {
    const rounds = state.sequence.length;
    state.phase = "over";
    state.message = `卡在第 ${rounds} 关 · 最长 ${state.best}`;
    if (!resultReported) {
      resultReported = true;
      context.reportResult?.({ outcome: "score", detail: `第 ${rounds} 关`, score: rounds });
    }
    render();
  }

  function restart() {
    clearTimers();
    const best = state.best;
    state = initialState();
    state.best = best;
    resultReported = false;
    render();
    later(nextRound, 500);
  }

  function render() {
    const live = state.phase === "input";
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}</p>
        </div>
        <div class="mini-stats">
          <span>关 ${state.sequence.length}</span>
          <span>最长 ${state.best}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:320px;margin:0 auto;aspect-ratio:1/1;">
          ${PADS.map((pad) => `
            <button type="button" data-pad="${pad.id}" aria-label="${pad.name}色" ${live ? "" : "disabled"}
              style="border:0;border-radius:16px;background:${pad.dim};cursor:${live ? "pointer" : "default"};min-height:120px;transition:background .12s ease,box-shadow .12s ease;touch-action:manipulation;"></button>
          `).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-pad]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.currentTarget.blur();
        press(clamp(Number(btn.dataset.pad), 0, PADS.length - 1));
      });
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  later(nextRound, 600);

  return () => {
    disposed = true;
    clearTimers();
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  };
}
