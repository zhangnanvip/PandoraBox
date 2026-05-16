import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 8;
const EMPTY = 0;
const RED = 1;
const RED_KING = 2;
const BLACK = -1;
const BLACK_KING = -2;

function initialState() {
  const board = Array(SIZE * SIZE).fill(EMPTY);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if ((row + col) % 2 === 1) board[row * SIZE + col] = BLACK;
    }
  }
  for (let row = 5; row < 8; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if ((row + col) % 2 === 1) board[row * SIZE + col] = RED;
    }
  }
  return {
    board,
    turn: RED,
    selected: -1,
    forceFrom: -1,
    winner: EMPTY,
    history: [],
    message: "红方先手"
  };
}

function isValidState(state) {
  return state?.board?.length === SIZE * SIZE && Array.isArray(state.history);
}

function rowOf(index) {
  return Math.floor(index / SIZE);
}

function colOf(index) {
  return index % SIZE;
}

function indexAt(row, col) {
  return row * SIZE + col;
}

function inside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function sideOf(piece) {
  return piece > 0 ? RED : BLACK;
}

function isKing(piece) {
  return Math.abs(piece) === 2;
}

function sideName(side) {
  return side === RED ? "红方" : "黑方";
}

function dirsFor(piece) {
  if (isKing(piece)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return sideOf(piece) === RED ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function pieceMoves(board, index, capturesOnly = false) {
  const piece = board[index];
  if (!piece) return [];
  const row = rowOf(index);
  const col = colOf(index);
  const captures = [];
  const steps = [];

  for (const [dr, dc] of dirsFor(piece)) {
    const midRow = row + dr;
    const midCol = col + dc;
    const nextRow = row + dr * 2;
    const nextCol = col + dc * 2;
    const stepRow = row + dr;
    const stepCol = col + dc;

    if (inside(nextRow, nextCol) && board[indexAt(midRow, midCol)] && sideOf(board[indexAt(midRow, midCol)]) !== sideOf(piece) && board[indexAt(nextRow, nextCol)] === EMPTY) {
      captures.push({ from: index, to: indexAt(nextRow, nextCol), capture: indexAt(midRow, midCol) });
    }
    if (!capturesOnly && inside(stepRow, stepCol) && board[indexAt(stepRow, stepCol)] === EMPTY) {
      steps.push({ from: index, to: indexAt(stepRow, stepCol), capture: -1 });
    }
  }

  return captures.length ? captures : steps;
}

function allMoves(board, side) {
  const moves = board.flatMap((piece, index) => piece && sideOf(piece) === side ? pieceMoves(board, index) : []);
  const captures = moves.filter((move) => move.capture >= 0);
  return captures.length ? captures : moves;
}

function countPieces(board, side) {
  return board.filter((piece) => piece && sideOf(piece) === side).length;
}

function pieceValue(piece, index) {
  if (!piece) return 0;
  const row = rowOf(index);
  const advance = sideOf(piece) === BLACK ? row : SIZE - 1 - row;
  return (isKing(piece) ? 175 : 100) + advance * 6;
}

function crown(piece, row) {
  if (piece === RED && row === 0) return RED_KING;
  if (piece === BLACK && row === SIZE - 1) return BLACK_KING;
  return piece;
}

function applyMoveToBoard(board, move) {
  const next = [...board];
  const piece = next[move.from];
  next[move.from] = EMPTY;
  next[move.to] = crown(piece, rowOf(move.to));
  if (move.capture >= 0) next[move.capture] = EMPTY;
  return next;
}

function movesForTurn(board, side, forceFrom = -1) {
  return forceFrom >= 0
    ? pieceMoves(board, forceFrom, true).filter((move) => move.capture >= 0)
    : allMoves(board, side);
}

function nextTurnAfterMove(board, move, side) {
  const next = applyMoveToBoard(board, move);
  const forcedCaptures = move.capture >= 0
    ? pieceMoves(next, move.to, true).filter((item) => item.capture >= 0)
    : [];
  if (forcedCaptures.length) return { board: next, side, forceFrom: move.to };
  return { board: next, side: side === RED ? BLACK : RED, forceFrom: -1 };
}

function evaluateBoard(board, side) {
  const rival = side === RED ? BLACK : RED;
  const material = board.reduce((score, piece, index) => {
    if (!piece) return score;
    const value = pieceValue(piece, index);
    return sideOf(piece) === side ? score + value : score - value;
  }, 0);
  const mobility = allMoves(board, side).length - allMoves(board, rival).length;
  const center = board.reduce((score, piece, index) => {
    if (!piece) return score;
    const col = colOf(index);
    const centerBonus = col >= 2 && col <= 5 ? 5 : 0;
    return sideOf(piece) === side ? score + centerBonus : score - centerBonus;
  }, 0);

  return material + mobility * 12 + center;
}

function moveTacticalScore(board, move, side, difficulty) {
  const piece = board[move.from];
  const next = applyMoveToBoard(board, move);
  const moreCaptures = move.capture >= 0 ? pieceMoves(next, move.to, true).filter((item) => item.capture >= 0).length : 0;
  const captureScore = move.capture >= 0 ? pieceValue(board[move.capture], move.capture) + 70 : 0;
  const crownScore = !isKing(piece) && isKing(next[move.to]) ? 120 : 0;
  const edgeSafety = colOf(move.to) === 0 || colOf(move.to) === SIZE - 1 ? 18 : 0;
  const exposure = allMoves(next, side === RED ? BLACK : RED)
    .filter((reply) => reply.capture === move.to)
    .reduce((max, reply) => Math.max(max, pieceValue(next[reply.capture], reply.capture)), 0);
  const riskWeight = difficulty === "devil" ? 1.15 : difficulty === "hard" ? 0.9 : 0.4;

  return captureScore + crownScore + moreCaptures * 90 + edgeSafety - exposure * riskWeight;
}

function searchMoveTree(board, side, rootSide, depth, forceFrom = -1, alpha = -Infinity, beta = Infinity) {
  const moves = movesForTurn(board, side, forceFrom);
  if (!moves.length) return side === rootSide ? -10000 - depth : 10000 + depth;
  if (depth <= 0) return evaluateBoard(board, rootSide);

  if (side === rootSide) {
    let value = -Infinity;
    for (const move of moves) {
      const next = nextTurnAfterMove(board, move, side);
      value = Math.max(value, searchMoveTree(next.board, next.side, rootSide, depth - 1, next.forceFrom, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    const next = nextTurnAfterMove(board, move, side);
    value = Math.min(value, searchMoveTree(next.board, next.side, rootSide, depth - 1, next.forceFrom, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function chooseAiMove(board, difficulty, forceFrom = -1) {
  const moves = movesForTurn(board, BLACK, forceFrom);
  if (!moves.length) return null;
  if (difficulty === "easy") return choice(moves);

  return moves.reduce((best, move) => {
    const next = applyMoveToBoard(board, move);
    const tactical = moveTacticalScore(board, move, BLACK, difficulty);
    const score = difficulty === "devil"
      ? (() => {
        const nextTurn = nextTurnAfterMove(board, move, BLACK);
        return searchMoveTree(nextTurn.board, nextTurn.side, BLACK, 4, nextTurn.forceFrom) + tactical * 0.35;
      })()
      : difficulty === "hard"
      ? (() => {
        const forcedCaptures = move.capture >= 0 ? pieceMoves(next, move.to, true).filter((item) => item.capture >= 0) : [];
        if (forcedCaptures.length) return evaluateBoard(next, BLACK) + tactical + forcedCaptures.length * 70;
        const replies = allMoves(next, RED);
        if (!replies.length) return evaluateBoard(next, BLACK) + tactical + 300;
        const afterReply = Math.min(...replies.map((reply) =>
          evaluateBoard(applyMoveToBoard(next, reply), BLACK)
        ));
        return afterReply + tactical * 0.45;
      })()
      : evaluateBoard(next, BLACK) + tactical + Math.random();
    return !best || score > best.score ? { ...move, score } : best;
  }, null);
}

export function mountDraughts(root, context) {
  const storageKey = `draughts:${context.mode}`;
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
      selected: state.selected,
      forceFrom: state.forceFrom,
      winner: state.winner,
      message: state.message
    };
  }

  function restore(previous) {
    Object.assign(state, previous, { board: [...previous.board] });
  }

  function finishTurn(lastMove) {
    if (lastMove?.capture >= 0) {
      const moreCaptures = pieceMoves(state.board, lastMove.to, true).filter((move) => move.capture >= 0);
      if (moreCaptures.length) {
        state.forceFrom = lastMove.to;
        state.selected = lastMove.to;
        state.message = `${sideName(state.turn)}可继续吃子`;
        return;
      }
    }

    state.forceFrom = -1;
    const next = state.turn === RED ? BLACK : RED;
    if (!countPieces(state.board, next) || !allMoves(state.board, next).length) {
      state.winner = state.turn;
      state.message = `${sideName(state.turn)}获胜`;
      return;
    }
    state.turn = next;
    state.selected = -1;
    state.message = `轮到${sideName(state.turn)}`;
  }

  function applyMove(move) {
    if (!move || state.winner) return false;
    if (state.forceFrom >= 0 && move.from !== state.forceFrom) return false;
    state.history.push(snapshot());
    const piece = state.board[move.from];
    state.board[move.from] = EMPTY;
    state.board[move.to] = crown(piece, rowOf(move.to));
    if (move.capture >= 0) state.board[move.capture] = EMPTY;
    finishTurn(move);
    save();
    render();
    return true;
  }

  function select(index) {
    if (state.winner) return;
    if (context.mode === "ai" && state.turn === BLACK) return;
    if (state.forceFrom >= 0 && index !== state.forceFrom) {
      state.message = "需要用刚才的棋子继续吃子";
      render();
      return;
    }
    if (!state.board[index] || sideOf(state.board[index]) !== state.turn) return;
    state.selected = index;
    state.message = `${sideName(state.turn)}选中棋子`;
    save();
    render();
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
    if (disposed || context.mode !== "ai" || state.turn !== BLACK || state.winner) return;
    aiTimer = window.setTimeout(() => {
      applyMove(chooseAiMove(state.board, context.difficulty, state.forceFrom));
    }, context.difficulty === "devil" ? 560 : context.difficulty === "hard" ? 420 : 240);
  }

  function render() {
    const moves = state.forceFrom >= 0
      ? pieceMoves(state.board, state.forceFrom, true).filter((move) => move.capture >= 0)
      : allMoves(state.board, state.turn);
    const selectedMoves = state.selected >= 0 ? moves.filter((move) => move.from === state.selected) : [];
    const moveMap = new Map(selectedMoves.map((move) => [move.to, move]));
    const moveOrigins = new Set(moves.map((move) => move.from));
    const mustCapture = moves.some((move) => move.capture >= 0);
    const thinking = context.mode === "ai" && state.turn === BLACK && !state.winner;

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${mustCapture && !state.winner ? " · 必须吃子" : ""}${thinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>红 ${countPieces(state.board, RED)}</span>
          <span>黑 ${countPieces(state.board, BLACK)}</span>
          <span>可走 ${moves.length}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="draughts-board" aria-label="国际跳棋棋盘">
          ${state.board.map((piece, index) => {
            const playable = (rowOf(index) + colOf(index)) % 2 === 1;
            return `
              <button
                class="draughts-cell ${playable ? "is-dark" : "is-light"} ${state.selected === index ? "is-selected" : ""} ${moveOrigins.has(index) ? "has-move" : ""} ${mustCapture && moveOrigins.has(index) ? "must-capture" : ""} ${moveMap.has(index) ? "is-move" : ""}"
                data-cell="${index}"
                ${playable ? "" : "disabled"}
              >
                ${piece ? `<span class="checker-piece ${sideOf(piece) === RED ? "red" : "black"} ${isKing(piece) ? "king" : ""}">${isKing(piece) ? "王" : ""}</span>` : ""}
              </button>
            `;
          }).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.cell);
        if (moveMap.has(index)) {
          applyMove(moveMap.get(index));
        } else if (state.selected >= 0 && !state.board[index]) {
          state.message = "请选择高亮落点";
          render();
        } else {
          select(index);
        }
      });
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    scheduleAi();
  }

  render();

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
  };
}
