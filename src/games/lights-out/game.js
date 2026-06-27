import { clamp } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE_BY_DIFFICULTY = { easy: 4, medium: 5, hard: 6, devil: 6 };

function sizeFor(context) {
  const opt = Number(context.options?.boardSize);
  if (Number.isFinite(opt)) return clamp(Math.round(opt), 4, 6);
  return SIZE_BY_DIFFICULTY[context.difficulty] || 5;
}

function emptyBoard(size) {
  return Array(size * size).fill(false);
}

function neighbors(index, size) {
  const row = Math.floor(index / size);
  const col = index % size;
  const cells = [index];
  if (row > 0) cells.push(index - size);
  if (row < size - 1) cells.push(index + size);
  if (col > 0) cells.push(index - 1);
  if (col < size - 1) cells.push(index + 1);
  return cells;
}

function toggle(board, index, size) {
  for (const cell of neighbors(index, size)) board[cell] = !board[cell];
}

// 从全灭盘随机敲若干下 → 必然可解, 且至少一盏亮
function scramble(size) {
  const board = emptyBoard(size);
  const taps = size * size;
  for (let i = 0; i < taps; i += 1) {
    if (Math.random() < 0.5) toggle(board, Math.floor(Math.random() * board.length), size);
  }
  if (board.every((on) => !on)) toggle(board, 0, size);
  return board;
}

function isValidState(state, size) {
  return Array.isArray(state?.board) && state.board.length === size * size;
}

export function mountLightsOut(root, context) {
  const size = sizeFor(context);
  const storageKey = `lights-out:${context.mode}:${size}`;

  const saved = context.savedState && isValidState(context.savedState, size) ? context.savedState : null;
  const legacy = !saved ? loadState(storageKey, null) : null;
  const source = saved || (isValidState(legacy, size) ? legacy : null);

  let state = source
    ? { board: source.board.map(Boolean), moves: Number(source.moves) || 0, done: false }
    : { board: scramble(size), moves: 0, done: false };

  let reported = false;

  function lit() {
    return state.board.filter(Boolean).length;
  }

  function save() {
    saveState(storageKey, state);
    if (!state.done) {
      context.saveSession?.({ board: [...state.board], moves: state.moves }, {
        stage: `${lit()} 盏亮 · ${state.moves} 步`, level: state.moves, score: state.moves
      });
    } else {
      context.clearSession?.();
    }
  }

  function finish() {
    if (reported) return;
    reported = true;
    const score = Math.max(0, 1000 - state.moves * 10);
    context.reportResult?.({ outcome: "complete", detail: `${state.moves} 步通关`, score, moves: state.moves });
  }

  function tap(index) {
    if (state.done) return;
    toggle(state.board, index, size);
    state.moves += 1;
    context.playSound?.("tap");
    if (state.board.every((on) => !on)) {
      state.done = true;
      removeState(storageKey);
      finish();
    }
    save();
    render();
  }

  function restart() {
    state = { board: scramble(size), moves: 0, done: false };
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function render() {
    const title = state.done ? `通关! ${state.moves} 步` : `点灭全部 · ${lit()} 盏亮`;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${title}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty} · ${size}×${size}</p>
        </div>
        <div class="mini-stats"><span>步 ${state.moves}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;gap:6px;width:100%;max-width:360px;margin:0 auto;grid-template-columns:repeat(${size},1fr);" aria-label="关灯棋盘">
          ${state.board.map((on, i) => `
            <button type="button" data-cell="${i}" aria-label="第 ${i + 1} 盏" style="aspect-ratio:1;border:none;border-radius:10px;cursor:pointer;transition:background .12s;background:${on ? "#ffd84d" : "rgba(255,255,255,.08)"};box-shadow:${on ? "0 0 12px rgba(255,216,77,.55)" : "inset 0 0 0 1px rgba(255,255,255,.1)"};"></button>
          `).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-cell]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.currentTarget.blur();
        tap(Number(btn.dataset.cell));
      });
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  return () => {};
}
