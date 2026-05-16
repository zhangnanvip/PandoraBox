import { loadState, removeState, saveState } from "../../utils/storage.js";

const BOARD_PRESETS = {
  4: { size: 4, label: "4x4 经典", target: { easy: 1024, medium: 2048, hard: 4096, devil: 8192 }, fourRate: 0 },
  5: { size: 5, label: "5x5 舒展", target: { easy: 2048, medium: 4096, hard: 8192, devil: 16384 }, fourRate: 0.02 },
  6: { size: 6, label: "6x6 策略", target: { easy: 4096, medium: 8192, hard: 16384, devil: 32768 }, fourRate: 0.04 },
  8: { size: 8, label: "8x8 沙盒", target: { easy: 8192, medium: 16384, hard: 32768, devil: 65536 }, fourRate: 0.06 }
};

function presetFor(value) {
  return BOARD_PRESETS[Number(value)] || BOARD_PRESETS[4];
}

function targetFor(difficulty, preset) {
  return preset.target[difficulty] || preset.target.medium;
}

function emptyGrid(size) {
  return Array(size * size).fill(0);
}

function initialState(difficulty, preset) {
  const state = {
    size: preset.size,
    presetLabel: preset.label,
    grid: emptyGrid(preset.size),
    score: 0,
    best: loadState(`2048:best:${preset.size}`, 0),
    target: targetFor(difficulty, preset),
    won: false,
    over: false,
    history: [],
    message: "滑动棋盘开始"
  };
  addRandomTile(state.grid, difficulty, preset);
  addRandomTile(state.grid, difficulty, preset);
  return state;
}

function isValidState(state, preset) {
  return state?.size === preset.size && state?.grid?.length === preset.size * preset.size && Array.isArray(state.history);
}

function addRandomTile(grid, difficulty, preset) {
  const empty = grid.flatMap((value, index) => (value ? [] : [index]));
  if (!empty.length) return;
  const index = empty[Math.floor(Math.random() * empty.length)];
  const fourRate = (difficulty === "devil" ? 0.22 : difficulty === "hard" ? 0.18 : difficulty === "medium" ? 0.12 : 0.08) + preset.fourRate;
  grid[index] = Math.random() < fourRate ? 4 : 2;
}

function cloneState(state) {
  return {
    size: state.size,
    presetLabel: state.presetLabel,
    grid: [...state.grid],
    score: state.score,
    best: state.best,
    target: state.target,
    won: state.won,
    over: state.over,
    message: state.message
  };
}

function restore(state, snapshot) {
  Object.assign(state, snapshot, { grid: [...snapshot.grid] });
}

function indexesFor(direction, line, size) {
  if (direction === "left") return Array.from({ length: size }, (_, col) => line * size + col);
  if (direction === "right") return Array.from({ length: size }, (_, col) => line * size + (size - 1 - col));
  if (direction === "up") return Array.from({ length: size }, (_, row) => row * size + line);
  return Array.from({ length: size }, (_, row) => (size - 1 - row) * size + line);
}

function slideValues(values, size) {
  const compact = values.filter(Boolean);
  let gained = 0;
  const result = [];
  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] === compact[i + 1]) {
      const merged = compact[i] * 2;
      result.push(merged);
      gained += merged;
      i += 1;
    } else {
      result.push(compact[i]);
    }
  }
  while (result.length < size) result.push(0);
  return { result, gained };
}

function canMove(grid, size) {
  if (grid.some((value) => value === 0)) return true;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = grid[row * size + col];
      if (col < size - 1 && grid[row * size + col + 1] === value) return true;
      if (row < size - 1 && grid[(row + 1) * size + col] === value) return true;
    }
  }
  return false;
}

function applyMove(state, direction, difficulty, preset) {
  if (state.over) return false;
  const before = state.grid.join(",");
  const snapshot = cloneState(state);
  let gained = 0;

  for (let line = 0; line < state.size; line += 1) {
    const indexes = indexesFor(direction, line, state.size);
    const { result, gained: lineScore } = slideValues(indexes.map((index) => state.grid[index]), state.size);
    gained += lineScore;
    indexes.forEach((index, offset) => {
      state.grid[index] = result[offset];
    });
  }

  if (state.grid.join(",") === before) {
    state.message = "这个方向暂时走不通";
    return false;
  }

  state.history.push(snapshot);
  state.score += gained;
  state.best = Math.max(state.best, state.score);
  addRandomTile(state.grid, difficulty, preset);
  if (!state.won && state.grid.some((value) => value >= state.target)) {
    state.won = true;
    state.message = `达成 ${state.target}，还可以继续挑战`;
  } else if (!canMove(state.grid, state.size)) {
    state.over = true;
    state.message = "没有可移动空间了";
  } else {
    state.message = gained ? `合并 +${gained}` : "继续寻找合并机会";
  }
  return true;
}

function directionFromDelta(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return "";
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

function tileClass(value) {
  if (!value) return "";
  return `tile-${Math.min(value, 4096)}`;
}

export function mount2048(root, context) {
  const preset = presetFor(context.options?.boardSize);
  const storageKey = `2048:${context.difficulty}:${preset.size}`;
  let state = loadState(storageKey, initialState(context.difficulty, preset));
  if (!isValidState(state, preset) || state.target !== targetFor(context.difficulty, preset)) state = initialState(context.difficulty, preset);

  let startX = 0;
  let startY = 0;
  let pointerActive = false;
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
    saveState(`2048:best:${preset.size}`, state.best);
  }

  function reportResult(outcome) {
    if (resultReported) return;
    resultReported = true;
    context.reportResult?.({
      outcome,
      detail: state.message,
      score: state.score,
      extra: `目标 ${state.target}`
    });
  }

  function move(direction) {
    if (!direction) return;
    if (applyMove(state, direction, context.difficulty, preset)) {
      context.playSound?.("move");
      save();
    } else {
      context.playSound?.("invalid");
    }
    if (state.won) reportResult("complete");
    else if (state.over) reportResult("score");
    render();
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) return;
    restore(state, previous);
    save();
    render();
  }

  function restart() {
    state = initialState(context.difficulty, preset);
    resultReported = false;
    removeState(storageKey);
    save();
    render();
  }

  function handleKeydown(event) {
    const keyMap = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down"
    };
    if (!keyMap[event.key]) return;
    event.preventDefault();
    move(keyMap[event.key]);
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${state.presetLabel} · ${context.labels.difficulty} · 目标 ${state.target}</p>
        </div>
        <div class="mini-stats">
          <span>分数 ${state.score}</span>
          <span>最高 ${state.best}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="number-board number-board-${state.size}" style="--number-size:${state.size};" aria-label="2048 棋盘">
          ${state.grid.map((value) => `<div class="number-tile ${tileClass(value)}">${value || ""}</div>`).join("")}
        </div>
      </section>

      <section class="game-panel number-help">
        <span>在棋盘上滑动操作</span>
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    const board = root.querySelector(".number-board");
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
    board.addEventListener("pointercancel", () => {
      pointerActive = false;
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  window.addEventListener("keydown", handleKeydown);
  render();

  return () => {
    window.removeEventListener("keydown", handleKeydown);
  };
}
