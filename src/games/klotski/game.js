import { loadState, removeState, saveState } from "../../utils/storage.js";

const COLS = 4;
const ROWS = 5;
const DIRS = {
  up: [0, -1, "上"],
  down: [0, 1, "下"],
  left: [-1, 0, "左"],
  right: [1, 0, "右"]
};

const LEVELS = {
  easy: {
    id: "easy",
    title: "开门见山",
    target: 1,
    pieces: [
      { id: "cao", name: "曹操", x: 1, y: 2, w: 2, h: 2, kind: "hero" },
      { id: "zhang", name: "张飞", x: 0, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "zhao", name: "赵云", x: 3, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "ma", name: "马超", x: 0, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "huang", name: "黄忠", x: 3, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "guan", name: "关羽", x: 1, y: 0, w: 2, h: 1, kind: "wide" },
      { id: "zu1", name: "卒", x: 0, y: 4, w: 1, h: 1, kind: "small" },
      { id: "zu2", name: "卒", x: 3, y: 4, w: 1, h: 1, kind: "small" }
    ]
  },
  medium: {
    id: "medium",
    title: "短兵相接",
    target: 24,
    pieces: [
      { id: "cao", name: "曹操", x: 1, y: 1, w: 2, h: 2, kind: "hero" },
      { id: "zhang", name: "张飞", x: 0, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "zhao", name: "赵云", x: 3, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "ma", name: "马超", x: 0, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "huang", name: "黄忠", x: 3, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "guan", name: "关羽", x: 1, y: 0, w: 2, h: 1, kind: "wide" },
      { id: "zu1", name: "卒", x: 1, y: 3, w: 1, h: 1, kind: "small" },
      { id: "zu2", name: "卒", x: 2, y: 3, w: 1, h: 1, kind: "small" },
      { id: "zu3", name: "卒", x: 0, y: 4, w: 1, h: 1, kind: "small" },
      { id: "zu4", name: "卒", x: 3, y: 4, w: 1, h: 1, kind: "small" }
    ]
  },
  hard: {
    id: "hard",
    title: "层层设防",
    target: 52,
    pieces: [
      { id: "cao", name: "曹操", x: 1, y: 0, w: 2, h: 2, kind: "hero" },
      { id: "zhang", name: "张飞", x: 0, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "zhao", name: "赵云", x: 3, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "ma", name: "马超", x: 0, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "huang", name: "黄忠", x: 3, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "guan", name: "关羽", x: 1, y: 2, w: 2, h: 1, kind: "wide" },
      { id: "zu1", name: "卒", x: 0, y: 4, w: 1, h: 1, kind: "small" },
      { id: "zu2", name: "卒", x: 3, y: 4, w: 1, h: 1, kind: "small" }
    ]
  },
  devil: {
    id: "devil",
    title: "横刀立马",
    target: 81,
    pieces: [
      { id: "cao", name: "曹操", x: 1, y: 0, w: 2, h: 2, kind: "hero" },
      { id: "zhang", name: "张飞", x: 0, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "zhao", name: "赵云", x: 3, y: 0, w: 1, h: 2, kind: "tall" },
      { id: "ma", name: "马超", x: 0, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "huang", name: "黄忠", x: 3, y: 2, w: 1, h: 2, kind: "tall" },
      { id: "guan", name: "关羽", x: 1, y: 2, w: 2, h: 1, kind: "wide" },
      { id: "zu1", name: "卒", x: 1, y: 3, w: 1, h: 1, kind: "small" },
      { id: "zu2", name: "卒", x: 2, y: 3, w: 1, h: 1, kind: "small" },
      { id: "zu3", name: "卒", x: 0, y: 4, w: 1, h: 1, kind: "small" },
      { id: "zu4", name: "卒", x: 3, y: 4, w: 1, h: 1, kind: "small" }
    ]
  }
};

function levelFor(levelId) {
  return LEVELS[levelId] || LEVELS.medium;
}

function selectedLevelId(options = {}, difficulty = "medium") {
  return LEVELS[options.levelId] ? options.levelId : LEVELS[difficulty] ? difficulty : "medium";
}

function initialState(levelId) {
  const level = levelFor(levelId);
  return {
    level: level.id,
    pieces: level.pieces.map((piece) => ({ ...piece })),
    selected: "cao",
    steps: 0,
    history: [],
    complete: false,
    message: "移动曹操到下方出口"
  };
}

function hasValidPieces(state) {
  if (!Array.isArray(state?.pieces)) return false;
  const occupied = new Set();
  for (const piece of state.pieces) {
    if (piece.x < 0 || piece.y < 0 || piece.x + piece.w > COLS || piece.y + piece.h > ROWS) return false;
    for (let y = piece.y; y < piece.y + piece.h; y += 1) {
      for (let x = piece.x; x < piece.x + piece.w; x += 1) {
        const key = `${x},${y}`;
        if (occupied.has(key)) return false;
        occupied.add(key);
      }
    }
  }
  return state.pieces.some((piece) => piece.id === "cao");
}

function isValidState(state, levelId) {
  const level = levelFor(levelId);
  return state?.level === level.id && hasValidPieces(state) && Array.isArray(state.history);
}

function snapshot(state) {
  return {
    pieces: state.pieces.map((piece) => ({ ...piece })),
    selected: state.selected,
    steps: state.steps,
    complete: state.complete,
    message: state.message
  };
}

function restore(state, previous) {
  Object.assign(state, previous, {
    pieces: previous.pieces.map((piece) => ({ ...piece }))
  });
}

function occupiedBy(state, ignoreId = "") {
  const occupied = new Map();
  state.pieces.forEach((piece) => {
    if (piece.id === ignoreId) return;
    for (let y = piece.y; y < piece.y + piece.h; y += 1) {
      for (let x = piece.x; x < piece.x + piece.w; x += 1) {
        occupied.set(`${x},${y}`, piece.id);
      }
    }
  });
  return occupied;
}

function canMove(state, piece, dx, dy) {
  const nextX = piece.x + dx;
  const nextY = piece.y + dy;
  if (nextX < 0 || nextY < 0 || nextX + piece.w > COLS || nextY + piece.h > ROWS) return false;
  const occupied = occupiedBy(state, piece.id);
  for (let y = nextY; y < nextY + piece.h; y += 1) {
    for (let x = nextX; x < nextX + piece.w; x += 1) {
      if (occupied.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

function movesFor(state, piece) {
  return Object.entries(DIRS).flatMap(([id, [dx, dy, label]]) =>
    canMove(state, piece, dx, dy) ? [{ id, dx, dy, label }] : []
  );
}

function isSolved(state) {
  const cao = state.pieces.find((piece) => piece.id === "cao");
  return cao.x === 1 && cao.y === 3;
}

function directionFromDelta(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return "";
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

export function mountKlotski(root, context) {
  const levelId = selectedLevelId(context.options, context.difficulty);
  const storageKey = `klotski:${context.difficulty}:${levelId}`;
  let state = loadState(storageKey, initialState(levelId));
  if (!isValidState(state, levelId)) state = initialState(levelId);
  let pointerStart = null;
  let ignoreClick = false;
  let resultReported = false;

  function beginDrag(id, x, y) {
    pointerStart = { id, x, y };
  }

  function endDrag(id, x, y) {
    if (!pointerStart || pointerStart.id !== id) return false;
    const direction = directionFromDelta(x - pointerStart.x, y - pointerStart.y);
    pointerStart = null;
    state.selected = id;
    if (!direction) return false;
    ignoreClick = true;
    move(direction);
    return true;
  }

  function endActiveDrag(x, y) {
    if (!pointerStart) return;
    endDrag(pointerStart.id, x, y);
  }

  function handleMouseUp(event) {
    endActiveDrag(event.clientX, event.clientY);
  }

  function handlePointerUp(event) {
    endActiveDrag(event.clientX, event.clientY);
  }

  function handleTouchEnd(event) {
    const touch = event.changedTouches[0];
    if (touch) endActiveDrag(touch.clientX, touch.clientY);
  }

  function save() {
    saveState(storageKey, state);
  }

  function selectedPiece() {
    return state.pieces.find((piece) => piece.id === state.selected) || state.pieces[0];
  }

  function reportResult() {
    if (resultReported || !state.complete) return;
    resultReported = true;
    context.reportResult?.({
      outcome: "complete",
      detail: state.message,
      moves: state.steps,
      score: Math.max(0, levelFor(state.level).target * 20 - state.steps)
    });
  }

  function select(id) {
    state.selected = id;
    const piece = selectedPiece();
    const count = movesFor(state, piece).length;
    state.message = count ? `${piece.name} 可移动 ${count} 个方向` : `${piece.name} 暂时不能移动`;
    save();
    render();
  }

  function move(directionId) {
    if (state.complete) return;
    const piece = selectedPiece();
    const moveInfo = movesFor(state, piece).find((item) => item.id === directionId);
    if (!moveInfo) {
      state.message = "这个方向被挡住了";
      context.playSound?.("invalid");
      render();
      return;
    }
    state.history.push(snapshot(state));
    piece.x += moveInfo.dx;
    piece.y += moveInfo.dy;
    state.steps += 1;
    if (isSolved(state)) {
      state.complete = true;
      state.message = `曹操出关，用时 ${state.steps} 步`;
      reportResult();
    } else {
      state.message = `${piece.name} 向${moveInfo.label}移动`;
      context.playSound?.("move");
    }
    save();
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
    state = initialState(levelId);
    resultReported = false;
    removeState(storageKey);
    render();
  }

  function render() {
    const level = levelFor(state.level);
    const piece = selectedPiece();
    const moves = movesFor(state, piece);
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.difficulty} · ${level.title} · ${level.target} 步目标</p>
        </div>
        <div class="mini-stats">
          <span>步数 ${state.steps}</span>
          <span>目标 ${level.target}</span>
          <span>${piece.name}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="klotski-board" aria-label="华容道棋盘">
          ${state.pieces.map((item) => `
            <button
              class="klotski-piece ${item.kind} ${item.id === state.selected ? "is-selected" : ""}"
              data-piece="${item.id}"
              style="--x:${item.x}; --y:${item.y}; --w:${item.w}; --h:${item.h};"
            >${item.name}</button>
          `).join("")}
          <span class="klotski-exit">出口</span>
        </div>
      </section>

      <section class="game-panel toolbar">
        ${Object.entries(DIRS).map(([id, [, , label]]) => `
          <button class="secondary-button" data-move="${id}" ${moves.some((moveInfo) => moveInfo.id === id) ? "" : "disabled"}>${label}</button>
        `).join("")}
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-piece]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        beginDrag(button.dataset.piece, event.clientX, event.clientY);
        button.setPointerCapture?.(event.pointerId);
      });
      button.addEventListener("pointerup", (event) => {
        endDrag(button.dataset.piece, event.clientX, event.clientY);
      });
      button.addEventListener("pointercancel", () => {
        pointerStart = null;
      });
      button.addEventListener("mousedown", (event) => {
        beginDrag(button.dataset.piece, event.clientX, event.clientY);
      });
      button.addEventListener("mouseup", (event) => {
        endDrag(button.dataset.piece, event.clientX, event.clientY);
      });
      button.addEventListener("touchstart", (event) => {
        const touch = event.touches[0];
        beginDrag(button.dataset.piece, touch.clientX, touch.clientY);
      }, { passive: true });
      button.addEventListener("touchend", (event) => {
        const touch = event.changedTouches[0];
        endDrag(button.dataset.piece, touch.clientX, touch.clientY);
      });
      button.addEventListener("click", () => {
        if (ignoreClick) {
          ignoreClick = false;
          return;
        }
        select(button.dataset.piece);
      });
    });
    root.querySelectorAll("[data-move]").forEach((button) => {
      button.addEventListener("click", () => move(button.dataset.move));
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("touchend", handleTouchEnd);
  render();
  return () => {
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("touchend", handleTouchEnd);
  };
}
