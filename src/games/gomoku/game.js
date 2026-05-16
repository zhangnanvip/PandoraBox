import { choice } from "../../utils/random.js";
import { loadState, saveState, removeState } from "../../utils/storage.js";

const SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
];

function initialState() {
  return {
    board: Array(SIZE * SIZE).fill(EMPTY),
    turn: BLACK,
    winner: EMPTY,
    lastMove: -1,
    history: [],
    message: "黑方先手"
  };
}

function isValidState(state) {
  return state?.board?.length === SIZE * SIZE && Array.isArray(state.history);
}

function xy(index) {
  return [index % SIZE, Math.floor(index / SIZE)];
}

function inside(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

function indexAt(x, y) {
  return y * SIZE + x;
}

function countDirection(board, x, y, dx, dy, player) {
  let count = 0;
  let cx = x + dx;
  let cy = y + dy;
  while (inside(cx, cy) && board[indexAt(cx, cy)] === player) {
    count += 1;
    cx += dx;
    cy += dy;
  }
  return {
    count,
    open: inside(cx, cy) && board[indexAt(cx, cy)] === EMPTY
  };
}

function hasFive(board, index, player) {
  const [x, y] = xy(index);
  return DIRS.some(([dx, dy]) => {
    const a = countDirection(board, x, y, dx, dy, player);
    const b = countDirection(board, x, y, -dx, -dy, player);
    return a.count + b.count + 1 >= 5;
  });
}

function moveScore(board, index, player) {
  const [x, y] = xy(index);
  let score = 0;
  for (const [dx, dy] of DIRS) {
    const a = countDirection(board, x, y, dx, dy, player);
    const b = countDirection(board, x, y, -dx, -dy, player);
    const length = a.count + b.count + 1;
    const openEnds = Number(a.open) + Number(b.open);

    if (length >= 5) score += 100000;
    else if (length === 4 && openEnds === 2) score += 18000;
    else if (length === 4 && openEnds === 1) score += 8000;
    else if (length === 3 && openEnds === 2) score += 2600;
    else if (length === 3 && openEnds === 1) score += 700;
    else if (length === 2 && openEnds === 2) score += 220;
    else score += length * length * (openEnds + 1);
  }

  const [cx, cy] = [(SIZE - 1) / 2, (SIZE - 1) / 2];
  score += Math.max(0, 16 - Math.abs(x - cx) - Math.abs(y - cy));
  return score;
}

function threatProfile(board, index, player) {
  const [x, y] = xy(index);
  return DIRS.reduce((profile, [dx, dy]) => {
    const a = countDirection(board, x, y, dx, dy, player);
    const b = countDirection(board, x, y, -dx, -dy, player);
    const length = a.count + b.count + 1;
    const openEnds = Number(a.open) + Number(b.open);
    if (length >= 5) profile.five += 1;
    else if (length === 4 && openEnds >= 1) profile.four += 1;
    else if (length === 3 && openEnds === 2) profile.openThree += 1;
    else if (length === 2 && openEnds === 2) profile.openTwo += 1;
    return profile;
  }, { five: 0, four: 0, openThree: 0, openTwo: 0 });
}

function applyMoveToBoard(board, index, player) {
  const next = [...board];
  next[index] = player;
  return next;
}

function winningMoves(board, player, moves) {
  return moves.filter((move) => hasFive(applyMoveToBoard(board, move, player), move, player));
}

function candidateMoves(board, difficulty) {
  if (difficulty === "easy") return nearbyMoves(board);
  const moves = nearbyMoves(board);
  return moves.length ? moves : legalMoves(board);
}

function legalMoves(board) {
  return board.flatMap((cell, index) => cell === EMPTY ? [index] : []);
}

function nearbyMoves(board) {
  const occupied = board.flatMap((cell, index) => cell ? [index] : []);
  if (!occupied.length) return [indexAt(7, 7)];

  const candidates = new Set();
  for (const index of occupied) {
    const [x, y] = xy(index);
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (inside(nx, ny) && board[indexAt(nx, ny)] === EMPTY) {
          candidates.add(indexAt(nx, ny));
        }
      }
    }
  }
  return [...candidates];
}

function chooseAiMove(board, difficulty, player = WHITE) {
  const rival = player === BLACK ? WHITE : BLACK;
  const moves = candidateMoves(board, difficulty);
  if (!moves.length) return -1;

  if (difficulty === "easy") return choice(moves);
  const ownWins = winningMoves(board, player, moves);
  if (ownWins.length) return ownWins.sort((a, b) => moveScore(board, b, player) - moveScore(board, a, player))[0];
  const rivalWins = winningMoves(board, rival, moves);
  if (rivalWins.length) return rivalWins.sort((a, b) => moveScore(board, b, rival) - moveScore(board, a, rival))[0];

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const attack = moveScore(board, move, player);
    const defense = moveScore(board, move, rival);
    const next = applyMoveToBoard(board, move, player);
    const profile = threatProfile(next, move, player);
    const rivalProfile = threatProfile(applyMoveToBoard(board, move, rival), move, rival);
    const doubleThreat = profile.four + profile.openThree >= 2 ? 5200 : 0;
    const blockFork = rivalProfile.four + rivalProfile.openThree >= 2 ? 4600 : 0;
    let score = attack + defense * (difficulty === "hard" || difficulty === "devil" ? 0.96 : 0.72) + doubleThreat + blockFork;

    if (difficulty === "devil") {
      const replies = candidateMoves(next, "hard");
      const strongestReply = replies.reduce((max, reply) => Math.max(max, moveScore(next, reply, rival)), 0);
      score += profile.four * 12000 + profile.openThree * 2600 + profile.openTwo * 180;
      score -= strongestReply * 0.62;
    }

    score += Math.random() * (difficulty === "devil" ? 2 : 12);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function turnLabel(turn) {
  return turn === BLACK ? "黑方" : "白方";
}

function renderCell(cell, index, state) {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const hoshi = [3, 7, 11].includes(row) && [3, 7, 11].includes(col);
  const stone = cell === BLACK ? "black" : cell === WHITE ? "white" : "";
  return `
    <button class="${hoshi ? "hoshi" : ""}" data-cell="${index}" aria-label="第 ${row + 1} 行第 ${col + 1} 列">
      ${stone ? `<span class="stone ${stone}"></span>` : ""}
      ${state.lastMove === index ? "<span class=\"last-marker\"></span>" : ""}
    </button>
  `;
}

export function mountGomoku(root, context) {
  const storageKey = `gomoku:${context.mode}`;
  let state = loadState(storageKey, initialState());
  if (!isValidState(state)) state = initialState();

  let disposed = false;
  let aiTimer = 0;

  function save() {
    saveState(storageKey, state);
  }

  function snapshot() {
    return {
      board: [...state.board],
      turn: state.turn,
      winner: state.winner,
      lastMove: state.lastMove,
      message: state.message
    };
  }

  function restore(previous) {
    state.board = [...previous.board];
    state.turn = previous.turn;
    state.winner = previous.winner;
    state.lastMove = previous.lastMove;
    state.message = previous.message;
  }

  function place(index) {
    if (state.winner || state.board[index] !== EMPTY) return false;
    state.history.push(snapshot());
    state.board[index] = state.turn;
    state.lastMove = index;

    if (hasFive(state.board, index, state.turn)) {
      state.winner = state.turn;
      state.message = `${turnLabel(state.turn)}获胜`;
    } else if (!legalMoves(state.board).length) {
      state.winner = 3;
      state.message = "棋盘已满，平局";
    } else {
      state.turn = state.turn === BLACK ? WHITE : BLACK;
      state.message = `轮到${turnLabel(state.turn)}`;
    }

    save();
    render();
    return true;
  }

  function undo() {
    const steps = context.mode === "ai" && state.history.length > 1 ? 2 : 1;
    for (let i = 0; i < steps; i += 1) {
      const previous = state.history.pop();
      if (!previous) break;
      restore(previous);
    }
    save();
    render();
  }

  function restart() {
    state = initialState();
    removeState(storageKey);
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || context.mode !== "ai" || state.turn !== WHITE || state.winner) return;
    aiTimer = window.setTimeout(() => {
      const move = chooseAiMove(state.board, context.difficulty, WHITE);
      if (move >= 0) place(move);
    }, context.difficulty === "devil" ? 520 : context.difficulty === "hard" ? 360 : 220);
  }

  function render() {
    const aiThinking = context.mode === "ai" && state.turn === WHITE && !state.winner;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty} · 15 路棋盘${aiThinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>黑 ${state.board.filter((x) => x === BLACK).length}</span>
          <span>白 ${state.board.filter((x) => x === WHITE).length}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="grid-board gomoku-board" style="grid-template-columns: repeat(${SIZE}, 1fr); grid-template-rows: repeat(${SIZE}, 1fr);">
          ${state.board.map((cell, index) => renderCell(cell, index, state)).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
        <button class="secondary-button" data-action="hint">提示</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        if (context.mode === "ai" && state.turn === WHITE) return;
        place(Number(button.dataset.cell));
      });
    });

    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    root.querySelector("[data-action='hint']").addEventListener("click", () => {
      const player = context.mode === "ai" ? BLACK : state.turn;
      const move = chooseAiMove(state.board.map((cell) => cell), context.difficulty === "easy" ? "medium" : context.difficulty, player);
      if (move >= 0) {
        root.querySelector(`[data-cell='${move}']`)?.classList.add("cell-highlight");
        state.message = `${turnLabel(player)}可考虑落在第 ${Math.floor(move / SIZE) + 1} 行第 ${move % SIZE + 1} 列`;
        save();
        window.setTimeout(render, 650);
      }
    });

    scheduleAi();
  }

  render();

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
  };
}
