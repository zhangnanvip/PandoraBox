import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 4;
const STORAGE_KEY = "threes:solo";
const BEST_KEY = "threes:best";

const TILE_COLORS = {
  1: { bg: "#74c7ff", fg: "#0a2540" },
  2: { bg: "#ff7d9c", fg: "#37031a" },
  default: { bg: "#fdfdf6", fg: "#1a1d24" }
};

function emptyGrid() {
  return Array(SIZE * SIZE).fill(0);
}

function tileScore(value) {
  if (value < 3) return 0;
  let exp = 1;
  while (value >> exp >= 3) exp += 1;
  return Math.pow(3, exp);
}

function boardScore(grid) {
  return grid.reduce((sum, value) => sum + tileScore(value), 0);
}

function nextSpawn() {
  return [1, 2, 3][Math.floor(Math.random() * 3)];
}

function initialState() {
  const state = {
    grid: emptyGrid(),
    score: 0,
    best: loadState(BEST_KEY, 0),
    next: nextSpawn(),
    over: false,
    message: "向四方滑动开局"
  };
  const slots = [...Array(SIZE * SIZE).keys()];
  for (let i = 0; i < 9; i += 1) {
    const pick = slots.splice(Math.floor(Math.random() * slots.length), 1)[0];
    state.grid[pick] = nextSpawn();
  }
  return state;
}

function isValidState(state) {
  return state && Array.isArray(state.grid) && state.grid.length === SIZE * SIZE && typeof state.next === "number";
}

function lineIndexes(direction, line) {
  if (direction === "left") return Array.from({ length: SIZE }, (_, i) => line * SIZE + i);
  if (direction === "right") return Array.from({ length: SIZE }, (_, i) => line * SIZE + (SIZE - 1 - i));
  if (direction === "up") return Array.from({ length: SIZE }, (_, i) => i * SIZE + line);
  return Array.from({ length: SIZE }, (_, i) => (SIZE - 1 - i) * SIZE + line);
}

function canMerge(a, b) {
  if (!a || !b) return false;
  if ((a === 1 && b === 2) || (a === 2 && b === 1)) return true;
  return a === b && a >= 3;
}

// Threes: every tile shifts at most one cell toward the move; first eligible pair merges.
function shiftValues(values) {
  const next = [...values];
  let moved = false;
  let gained = 0;
  for (let i = 0; i < SIZE - 1; i += 1) {
    const front = next[i];
    const back = next[i + 1];
    if (front === 0 && back !== 0) {
      next[i] = back;
      next[i + 1] = 0;
      moved = true;
      break;
    }
    if (canMerge(front, back)) {
      const merged = front + back;
      next[i] = merged;
      next[i + 1] = 0;
      gained += tileScore(merged);
      moved = true;
      break;
    }
  }
  return { next, moved, gained };
}

function applyMove(state, direction) {
  if (state.over) return false;
  const moved = [];
  let gained = 0;
  for (let line = 0; line < SIZE; line += 1) {
    const idx = lineIndexes(direction, line);
    const { next, moved: lineMoved, gained: lineGained } = shiftValues(idx.map((i) => state.grid[i]));
    if (lineMoved) {
      idx.forEach((i, o) => { state.grid[i] = next[o]; });
      moved.push({ idx });
      gained += lineGained;
    }
  }
  if (!moved.length) {
    state.message = "这个方向没空隙";
    return false;
  }
  const lane = moved[Math.floor(Math.random() * moved.length)].idx;
  state.grid[lane[SIZE - 1]] = state.next;
  state.next = nextSpawn();
  state.score = boardScore(state.grid);
  state.best = Math.max(state.best, state.score);
  if (!hasMoves(state.grid)) {
    state.over = true;
    state.message = `棋盘塞满 · 终局 ${state.score} 分`;
  } else {
    state.message = gained ? `合并 +${gained}` : "继续凑数";
  }
  return true;
}

function hasMoves(grid) {
  if (grid.some((v) => v === 0)) return true;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const v = grid[r * SIZE + c];
      if (c < SIZE - 1 && canMerge(v, grid[r * SIZE + c + 1])) return true;
      if (r < SIZE - 1 && canMerge(v, grid[(r + 1) * SIZE + c])) return true;
    }
  }
  return false;
}

function directionFromDelta(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return "";
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

function colorFor(value) {
  return TILE_COLORS[value] || TILE_COLORS.default;
}

export function mountThrees(root, context) {
  let state = context.savedState && isValidState(context.savedState)
    ? context.savedState
    : loadState(STORAGE_KEY, null);
  if (!isValidState(state)) state = initialState();

  let startX = 0;
  let startY = 0;
  let pointerActive = false;
  let reported = false;

  function save() {
    saveState(STORAGE_KEY, state);
    saveState(BEST_KEY, state.best);
    if (!state.over) context.saveSession?.(JSON.parse(JSON.stringify(state)), { score: state.score, stage: "Threes" });
    else context.clearSession?.();
  }

  function reportResult() {
    if (reported) return;
    reported = true;
    context.reportResult?.({ outcome: "score", detail: state.message, score: state.score });
  }

  function move(direction) {
    if (!direction || state.over) return;
    if (applyMove(state, direction)) {
      context.playSound?.("move");
      save();
      if (state.over) reportResult();
    } else {
      context.playSound?.("invalid");
    }
    render();
  }

  function restart() {
    state = initialState();
    reported = false;
    removeState(STORAGE_KEY);
    context.clearSession?.();
    saveState(BEST_KEY, state.best);
    render();
  }

  function handleKeydown(event) {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (!map[event.key]) return;
    event.preventDefault();
    move(map[event.key]);
  }

  function render() {
    const cells = state.grid.map((value) => {
      const c = colorFor(value);
      return `<div style="display:flex;align-items:center;justify-content:center;border-radius:10px;font-weight:700;font-size:clamp(18px,7vw,30px);background:${value ? c.bg : "rgba(255,255,255,.06)"};color:${c.fg};aspect-ratio:1;">${value || ""}</div>`;
    }).join("");
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">1+2=3，相同数(≥3)合并 · 下一颗 ${state.next}</p>
        </div>
        <div class="mini-stats">
          <span>分数 ${state.score}</span>
          <span>最高 ${state.best}</span>
        </div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${SIZE},1fr);gap:8px;max-width:360px;width:100%;margin:0 auto;touch-action:none;" aria-label="Threes 棋盘">
          ${cells}
        </div>
      </section>
      <section class="game-panel number-help">
        <span>滑动或方向键移动</span>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;
    const board = root.querySelector(".board-wrap > div");
    board.addEventListener("pointerdown", (event) => {
      pointerActive = true;
      startX = event.clientX;
      startY = event.clientY;
      board.setPointerCapture?.(event.pointerId);
    });
    board.addEventListener("pointerup", (event) => {
      if (!pointerActive) return;
      pointerActive = false;
      move(directionFromDelta(event.clientX - startX, event.clientY - startY));
    });
    board.addEventListener("pointercancel", () => { pointerActive = false; });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  window.addEventListener("keydown", handleKeydown);
  render();

  return () => {
    save();
    window.removeEventListener("keydown", handleKeydown);
  };
}
