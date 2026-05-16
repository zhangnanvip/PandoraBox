import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 4;
const CELLS = SIZE * SIZE;

function targetFor(difficulty) {
  return difficulty === "hard" ? 4096 : 2048;
}

function emptyGrid() {
  return Array(CELLS).fill(0);
}

function initialState(difficulty) {
  const state = {
    grid: emptyGrid(),
    score: 0,
    best: loadState("2048:best", 0),
    target: targetFor(difficulty),
    won: false,
    over: false,
    history: [],
    message: "滑动或点击方向开始"
  };
  addRandomTile(state.grid, difficulty);
  addRandomTile(state.grid, difficulty);
  return state;
}

function isValidState(state) {
  return state?.grid?.length === CELLS && Array.isArray(state.history);
}

function addRandomTile(grid, difficulty) {
  const empty = grid.flatMap((value, index) => (value ? [] : [index]));
  if (!empty.length) return;
  const index = empty[Math.floor(Math.random() * empty.length)];
  const fourRate = difficulty === "hard" ? 0.18 : difficulty === "medium" ? 0.12 : 0.08;
  grid[index] = Math.random() < fourRate ? 4 : 2;
}

function cloneState(state) {
  return {
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

function indexesFor(direction, line) {
  if (direction === "left") return Array.from({ length: SIZE }, (_, col) => line * SIZE + col);
  if (direction === "right") return Array.from({ length: SIZE }, (_, col) => line * SIZE + (SIZE - 1 - col));
  if (direction === "up") return Array.from({ length: SIZE }, (_, row) => row * SIZE + line);
  return Array.from({ length: SIZE }, (_, row) => (SIZE - 1 - row) * SIZE + line);
}

function slideValues(values) {
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
  while (result.length < SIZE) result.push(0);
  return { result, gained };
}

function canMove(grid) {
  if (grid.some((value) => value === 0)) return true;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = grid[row * SIZE + col];
      if (col < SIZE - 1 && grid[row * SIZE + col + 1] === value) return true;
      if (row < SIZE - 1 && grid[(row + 1) * SIZE + col] === value) return true;
    }
  }
  return false;
}

function applyMove(state, direction, difficulty) {
  if (state.over) return false;
  const before = state.grid.join(",");
  const snapshot = cloneState(state);
  let gained = 0;

  for (let line = 0; line < SIZE; line += 1) {
    const indexes = indexesFor(direction, line);
    const { result, gained: lineScore } = slideValues(indexes.map((index) => state.grid[index]));
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
  addRandomTile(state.grid, difficulty);
  if (!state.won && state.grid.some((value) => value >= state.target)) {
    state.won = true;
    state.message = `达成 ${state.target}，还可以继续挑战`;
  } else if (!canMove(state.grid)) {
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
  const storageKey = `2048:${context.difficulty}`;
  let state = loadState(storageKey, initialState(context.difficulty));
  if (!isValidState(state) || state.target !== targetFor(context.difficulty)) state = initialState(context.difficulty);

  let startX = 0;
  let startY = 0;
  let pointerActive = false;
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
    saveState("2048:best", state.best);
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
    if (applyMove(state, direction, context.difficulty)) save();
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
    state = initialState(context.difficulty);
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
          <p class="game-note">${context.labels.difficulty} · 目标 ${state.target}</p>
        </div>
        <div class="mini-stats">
          <span>分数 ${state.score}</span>
          <span>最高 ${state.best}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="number-board" aria-label="2048 棋盘">
          ${state.grid.map((value) => `<div class="number-tile ${tileClass(value)}">${value || ""}</div>`).join("")}
        </div>
      </section>

      <section class="game-panel toolbar number-controls">
        <button class="secondary-button" data-move="up">上</button>
        <button class="secondary-button" data-move="left">左</button>
        <button class="secondary-button" data-move="right">右</button>
        <button class="secondary-button" data-move="down">下</button>
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
    root.querySelectorAll("[data-move]").forEach((button) => {
      button.addEventListener("click", () => move(button.dataset.move));
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
