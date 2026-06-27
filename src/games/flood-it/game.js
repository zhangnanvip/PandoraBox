import { clamp } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const PALETTE = ["#ef4444", "#f59e0b", "#22c55e", "#0ea5e9", "#8b5cf6", "#ec4899"];
const COLOR_NAMES = ["红", "橙", "绿", "蓝", "紫", "粉"];

const PRESETS = {
  easy: { size: 8, colors: 4, slack: 9 },
  medium: { size: 10, colors: 5, slack: 9 },
  hard: { size: 12, colors: 6, slack: 9 },
  devil: { size: 14, colors: 6, slack: 7 }
};

function presetFor(context) {
  const base = PRESETS[context.difficulty] || PRESETS.medium;
  const optSize = Number(context.options?.boardSize);
  const size = Number.isFinite(optSize) && optSize >= 6 && optSize <= 16 ? optSize : base.size;
  // A reasonable solving budget: about board size + colors + difficulty slack.
  const limit = size + base.colors + base.slack;
  return { size, colors: base.colors, limit };
}

function makeBoard(size, colors) {
  return Array.from({ length: size * size }, () => Math.floor(Math.random() * colors));
}

function initialState(preset) {
  return { size: preset.size, colors: preset.colors, limit: preset.limit, board: makeBoard(preset.size, preset.colors), moves: 0, done: false };
}

function isValidState(state, preset) {
  return state && Array.isArray(state.board) && state.board.length === preset.size * preset.size && state.colors === preset.colors;
}

// Flood the connected top-left region to `target`; return cells newly captured.
function flood(board, size, target) {
  const start = board[0];
  if (start === target) return 0;
  const visited = new Array(board.length).fill(false);
  const stack = [0];
  let filled = 0;
  while (stack.length) {
    const i = stack.pop();
    if (visited[i] || board[i] !== start) continue;
    visited[i] = true;
    board[i] = target;
    filled += 1;
    const r = Math.floor(i / size);
    const c = i % size;
    if (c > 0) stack.push(i - 1);
    if (c < size - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - size);
    if (r < size - 1) stack.push(i + size);
  }
  return filled;
}

function isWon(board) {
  return board.every((c) => c === board[0]);
}

function metaFor(state) {
  return { stage: state.done ? `已完成 · ${state.moves} 步` : `进行中 · ${state.moves}/${state.limit}`, level: state.moves, score: state.moves };
}

export function mountFloodIt(root, context) {
  const preset = presetFor(context);
  const storageKey = `flood-it:${context.difficulty}:${preset.size}`;
  const saved = context.savedState && isValidState(context.savedState, preset)
    ? context.savedState
    : (() => { const l = loadState(storageKey, null); return isValidState(l, preset) ? l : null; })();
  let state = saved
    ? { ...initialState(preset), ...saved, board: [...saved.board] }
    : initialState(preset);

  let reported = false;

  function save() {
    saveState(storageKey, state);
    if (state.done) context.clearSession?.();
    else context.saveSession?.({ ...state, board: [...state.board] }, metaFor(state));
  }

  function report() {
    if (reported) return;
    reported = true;
    const left = state.limit - state.moves;
    if (state.win) {
      context.reportResult?.({ outcome: "complete", detail: `${state.moves} 步染满`, score: Math.max(1, left * 10 + 10), moves: state.moves });
    } else {
      context.reportResult?.({ outcome: "loss", detail: `${state.moves} 步未染满`, score: 0, moves: state.moves });
    }
  }

  function pick(color) {
    if (state.done || color === state.board[0]) return;
    state.moves += 1;
    flood(state.board, state.size, color);
    context.playSound?.("flood");
    if (isWon(state.board)) { state.done = true; state.win = true; }
    else if (state.moves >= state.limit) { state.done = true; state.win = false; }
    if (state.done) report();
    save();
    render();
  }

  function restart() {
    state = initialState(preset);
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function render() {
    const cell = clamp(Math.floor(320 / state.size), 14, 40);
    const left = state.limit - state.moves;
    const title = state.done ? (state.win ? "全部染满! 胜利" : "步数用尽") : "选颜色, 从左上角扩张";
    const cells = state.board.map((c) => `<i style="background:${PALETTE[c]};aspect-ratio:1;border-radius:3px"></i>`).join("");
    const swatches = Array.from({ length: state.colors }, (_, i) =>
      `<button type="button" data-color="${i}" aria-label="${COLOR_NAMES[i]}" style="background:${PALETTE[i]};width:40px;height:40px;border:none;border-radius:10px;cursor:pointer;box-shadow:inset 0 0 0 ${i === state.board[0] ? "3px var(--text,#fff)" : "1px rgba(0,0,0,.2)"}"></button>`
    ).join("");

    root.innerHTML = `
      <section class="game-panel game-status">
        <div><strong>${title}</strong><p class="game-note">${context.labels.mode} · ${context.labels.difficulty} · 限 ${state.limit} 步</p></div>
        <div class="mini-stats"><span>步 ${state.moves}</span><span>剩 ${Math.max(0, left)}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${state.size},${cell}px);gap:2px;justify-content:center;max-width:100%;margin:0 auto">${cells}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:14px">${swatches}</div>
      </section>
      <section class="game-panel toolbar"><button class="danger-button" data-action="restart">重开</button></section>
    `;
    root.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => pick(Number(b.dataset.color))));
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  return () => {};
}
