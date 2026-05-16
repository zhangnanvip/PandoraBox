import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 8;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const DIRS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
];
const WEIGHTS = [
  80, -20, 16, 8, 8, 16, -20, 80,
  -20, -40, -2, -2, -2, -2, -40, -20,
  16, -2, 10, 4, 4, 10, -2, 16,
  8, -2, 4, 2, 2, 4, -2, 8,
  8, -2, 4, 2, 2, 4, -2, 8,
  16, -2, 10, 4, 4, 10, -2, 16,
  -20, -40, -2, -2, -2, -2, -40, -20,
  80, -20, 16, 8, 8, 16, -20, 80
];
const CORNERS = [0, 7, 56, 63];

function initialState() {
  const board = Array(SIZE * SIZE).fill(EMPTY);
  board[27] = WHITE;
  board[28] = BLACK;
  board[35] = BLACK;
  board[36] = WHITE;
  return {
    board,
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

function indexAt(x, y) {
  return y * SIZE + x;
}

function xy(index) {
  return [index % SIZE, Math.floor(index / SIZE)];
}

function inside(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

function playerName(player) {
  return player === BLACK ? "黑方" : "白方";
}

function flipsForMove(board, index, player) {
  if (board[index] !== EMPTY) return [];
  const [x, y] = xy(index);
  const rival = opponent(player);
  const flips = [];

  for (const [dx, dy] of DIRS) {
    const line = [];
    let cx = x + dx;
    let cy = y + dy;
    while (inside(cx, cy) && board[indexAt(cx, cy)] === rival) {
      line.push(indexAt(cx, cy));
      cx += dx;
      cy += dy;
    }
    if (line.length && inside(cx, cy) && board[indexAt(cx, cy)] === player) flips.push(...line);
  }

  return flips;
}

function validMoves(board, player) {
  return board.flatMap((cell, index) => {
    if (cell !== EMPTY) return [];
    const flips = flipsForMove(board, index, player);
    return flips.length ? [{ index, flips }] : [];
  });
}

function count(board, player) {
  return board.filter((cell) => cell === player).length;
}

function applyMoveToBoard(board, move, player) {
  const next = [...board];
  next[move.index] = player;
  move.flips.forEach((index) => {
    next[index] = player;
  });
  return next;
}

function winnerFor(board) {
  const black = count(board, BLACK);
  const white = count(board, WHITE);
  if (black === white) return 3;
  return black > white ? BLACK : WHITE;
}

function frontierCount(board, player) {
  return board.reduce((total, cell, index) => {
    if (cell !== player) return total;
    const [x, y] = xy(index);
    return total + Number(DIRS.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return inside(nx, ny) && board[indexAt(nx, ny)] === EMPTY;
    }));
  }, 0);
}

function evaluateBoard(board, player) {
  const rival = opponent(player);
  const empties = board.filter((cell) => cell === EMPTY).length;
  const positional = board.reduce((score, cell, index) => {
    if (cell === player) return score + WEIGHTS[index];
    if (cell === rival) return score - WEIGHTS[index];
    return score;
  }, 0);
  const mobility = validMoves(board, player).length - validMoves(board, rival).length;
  const cornerDiff = CORNERS.filter((index) => board[index] === player).length - CORNERS.filter((index) => board[index] === rival).length;
  const frontierDiff = frontierCount(board, rival) - frontierCount(board, player);
  const pieceDiff = count(board, player) - count(board, rival);
  const endgameWeight = empties < 16 ? 5 : 1;

  return positional * 1.6 + mobility * 18 + cornerDiff * 95 + frontierDiff * 6 + pieceDiff * endgameWeight;
}

function chooseStrategicMove(board, player, difficulty) {
  const moves = validMoves(board, player);
  if (!moves.length) return null;
  if (difficulty === "easy") return choice(moves);

  return moves.reduce((best, move) => {
    const next = applyMoveToBoard(board, move, player);
    const rival = opponent(player);
    const tacticalScore =
      move.flips.length * 7 +
      WEIGHTS[move.index] +
      (CORNERS.includes(move.index) ? 140 : 0) -
      validMoves(next, rival).length * 8;
    const score = difficulty === "devil"
      ? searchMoveTree(next, rival, player, 3) + tacticalScore * 0.22
      : difficulty === "hard"
      ? (() => {
        const replies = validMoves(next, rival);
        if (!replies.length) return evaluateBoard(next, player) + 120;
        const afterBestReply = Math.min(...replies.map((reply) =>
          evaluateBoard(applyMoveToBoard(next, reply, rival), player)
        ));
        return afterBestReply + tacticalScore * 0.35;
      })()
      : tacticalScore + evaluateBoard(next, player) * 0.22;
    return !best || score > best.score ? { ...move, score } : best;
  }, null);
}

function searchMoveTree(board, currentPlayer, rootPlayer, depth, alpha = -Infinity, beta = Infinity) {
  const moves = validMoves(board, currentPlayer);
  const nextPlayer = opponent(currentPlayer);
  if (depth <= 0) return evaluateBoard(board, rootPlayer);
  if (!moves.length) {
    if (!validMoves(board, nextPlayer).length) return evaluateBoard(board, rootPlayer) * 1.4;
    return searchMoveTree(board, nextPlayer, rootPlayer, depth - 1, alpha, beta);
  }

  if (currentPlayer === rootPlayer) {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(value, searchMoveTree(applyMoveToBoard(board, move, currentPlayer), nextPlayer, rootPlayer, depth - 1, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    value = Math.min(value, searchMoveTree(applyMoveToBoard(board, move, currentPlayer), nextPlayer, rootPlayer, depth - 1, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function chooseAiMove(board, difficulty) {
  return chooseStrategicMove(board, WHITE, difficulty);
}

export function mountReversi(root, context) {
  const storageKey = `reversi:${context.mode}`;
  let state = loadState(storageKey, initialState());
  if (!isValidState(state)) state = initialState();

  let disposed = false;
  let aiTimer = 0;
  let hintTimer = 0;
  let hintedMove = -1;

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
    Object.assign(state, previous, { board: [...previous.board] });
  }

  function resolveNextTurn() {
    const next = opponent(state.turn);
    const nextMoves = validMoves(state.board, next);
    const currentMoves = validMoves(state.board, state.turn);
    if (!nextMoves.length && !currentMoves.length) {
      state.winner = winnerFor(state.board);
      state.message = state.winner === 3 ? "终局平局" : `${playerName(state.winner)}获胜`;
      return;
    }
    if (!nextMoves.length) {
      state.message = `${playerName(next)}无棋可下，${playerName(state.turn)}继续`;
      return;
    }
    state.turn = next;
    state.message = `轮到${playerName(state.turn)}`;
  }

  function play(move) {
    if (!move || state.winner) return false;
    state.history.push(snapshot());
    state.board[move.index] = state.turn;
    move.flips.forEach((index) => {
      state.board[index] = state.turn;
    });
    state.lastMove = move.index;
    hintedMove = -1;
    state.message = `翻转 ${move.flips.length} 子`;
    resolveNextTurn();
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
    hintedMove = -1;
    removeState(storageKey);
    render();
  }

  function hint() {
    if (state.winner || (context.mode === "ai" && state.turn === WHITE)) return;
    const move = chooseStrategicMove(state.board, state.turn, context.difficulty === "easy" ? "medium" : context.difficulty);
    if (!move) {
      state.message = "当前没有可提示的落子";
      render();
      return;
    }
    clearTimeout(hintTimer);
    hintedMove = move.index;
    state.message = `${playerName(state.turn)}可考虑第 ${Math.floor(move.index / SIZE) + 1} 行第 ${move.index % SIZE + 1} 列`;
    render();
    hintTimer = window.setTimeout(() => {
      hintedMove = -1;
      render();
    }, 900);
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || context.mode !== "ai" || state.turn !== WHITE || state.winner) return;
    aiTimer = window.setTimeout(() => {
      play(chooseAiMove(state.board, context.difficulty));
    }, context.difficulty === "devil" ? 560 : context.difficulty === "hard" ? 420 : 240);
  }

  function render() {
    const moves = validMoves(state.board, state.turn);
    const moveMap = new Map(moves.map((move) => [move.index, move]));
    const thinking = context.mode === "ai" && state.turn === WHITE && !state.winner;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${thinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>黑 ${count(state.board, BLACK)}</span>
          <span>白 ${count(state.board, WHITE)}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="grid-board reversi-board" style="grid-template-columns: repeat(${SIZE}, 1fr); grid-template-rows: repeat(${SIZE}, 1fr);">
          ${state.board.map((cell, index) => `
            <button class="${moveMap.has(index) ? "is-legal" : ""}" data-cell="${index}" aria-label="第 ${Math.floor(index / SIZE) + 1} 行第 ${index % SIZE + 1} 列">
              ${cell ? `<span class="stone ${cell === BLACK ? "black" : "white"}"></span>` : ""}
              ${moveMap.has(index) ? "<span class=\"move-dot\"></span>" : ""}
              ${state.lastMove === index ? "<span class=\"last-marker\"></span>" : ""}
              ${hintedMove === index ? "<span class=\"hint-marker\"></span>" : ""}
            </button>
          `).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="secondary-button" data-action="hint" ${thinking || state.winner ? "disabled" : ""}>提示</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        if (context.mode === "ai" && state.turn === WHITE) return;
        const move = moveMap.get(Number(button.dataset.cell));
        if (!move) {
          state.message = "此处不能夹住棋子";
          render();
          return;
        }
        play(move);
      });
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='hint']").addEventListener("click", hint);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    scheduleAi();
  }

  render();

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
    clearTimeout(hintTimer);
  };
}
