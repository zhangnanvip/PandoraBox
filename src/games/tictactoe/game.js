import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const EMPTY = "";
const HUMAN = "X";
const AI = "O";
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

function initialState() {
  return {
    board: Array(9).fill(EMPTY),
    turn: HUMAN,
    winner: "",
    line: [],
    history: [],
    message: "X 先手"
  };
}

function isValidState(state) {
  return state?.board?.length === 9 && Array.isArray(state.history);
}

function available(board) {
  return board.flatMap((cell, index) => (cell ? [] : [index]));
}

function evaluate(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (!available(board).length) return { winner: "draw", line: [] };
  return { winner: "", line: [] };
}

function winningMove(board, player) {
  return available(board).find((index) => {
    const next = [...board];
    next[index] = player;
    return evaluate(next).winner === player;
  });
}

function minimax(board, player) {
  const result = evaluate(board).winner;
  if (result === AI) return { score: 10 };
  if (result === HUMAN) return { score: -10 };
  if (result === "draw") return { score: 0 };

  const moves = available(board).map((index) => {
    const next = [...board];
    next[index] = player;
    const child = minimax(next, player === AI ? HUMAN : AI);
    return {
      index,
      score: child.score + (player === AI ? -index / 100 : index / 100)
    };
  });

  return moves.reduce((best, move) => {
    if (!best) return move;
    return player === AI
      ? move.score > best.score ? move : best
      : move.score < best.score ? move : best;
  }, null);
}

function chooseAiMove(board, difficulty) {
  const moves = available(board);
  if (!moves.length) return -1;
  if (difficulty === "easy") return choice(moves);

  const win = winningMove(board, AI);
  if (win !== undefined) return win;
  const block = winningMove(board, HUMAN);
  if (block !== undefined && difficulty !== "easy") return block;
  if (difficulty === "medium") return board[4] === EMPTY ? 4 : choice(moves);
  return minimax(board, AI)?.index ?? choice(moves);
}

function labelFor(player) {
  if (player === HUMAN) return "X";
  if (player === AI) return "O";
  return "平局";
}

export function mountTicTacToe(root, context) {
  const storageKey = `tictactoe:${context.mode}`;
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
      line: [...state.line],
      message: state.message
    };
  }

  function restore(previous) {
    Object.assign(state, previous, {
      board: [...previous.board],
      line: [...previous.line]
    });
  }

  function finishTurn() {
    const result = evaluate(state.board);
    state.winner = result.winner;
    state.line = result.line;
    if (state.winner) {
      state.message = state.winner === "draw" ? "平局" : `${labelFor(state.winner)} 获胜`;
      return;
    }
    state.turn = state.turn === HUMAN ? AI : HUMAN;
    state.message = `轮到 ${labelFor(state.turn)}`;
  }

  function play(index) {
    if (state.winner || state.board[index]) return false;
    state.history.push(snapshot());
    state.board[index] = state.turn;
    finishTurn();
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
    if (disposed || context.mode !== "ai" || state.turn !== AI || state.winner) return;
    aiTimer = window.setTimeout(() => {
      const move = chooseAiMove(state.board, context.difficulty);
      if (move >= 0) play(move);
    }, context.difficulty === "hard" ? 280 : 180);
  }

  function render() {
    const thinking = context.mode === "ai" && state.turn === AI && !state.winner;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${thinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>X ${state.board.filter((cell) => cell === HUMAN).length}</span>
          <span>O ${state.board.filter((cell) => cell === AI).length}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="tictactoe-board">
          ${state.board.map((cell, index) => `
            <button class="tictactoe-cell ${state.line.includes(index) ? "is-win" : ""}" data-cell="${index}" aria-label="第 ${index + 1} 格">
              ${cell}
            </button>
          `).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        if (context.mode === "ai" && state.turn === AI) return;
        play(Number(button.dataset.cell));
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
