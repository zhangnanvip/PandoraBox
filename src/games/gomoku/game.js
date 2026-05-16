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
    winLine: [],
    hintMove: -1,
    hintReason: "",
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

function contiguousLine(board, index, player, dx, dy) {
  const line = [index];
  const [x, y] = xy(index);
  let cx = x + dx;
  let cy = y + dy;
  while (inside(cx, cy) && board[indexAt(cx, cy)] === player) {
    line.push(indexAt(cx, cy));
    cx += dx;
    cy += dy;
  }
  cx = x - dx;
  cy = y - dy;
  while (inside(cx, cy) && board[indexAt(cx, cy)] === player) {
    line.unshift(indexAt(cx, cy));
    cx -= dx;
    cy -= dy;
  }
  return line;
}

function winningLine(board, index, player) {
  for (const [dx, dy] of DIRS) {
    const line = contiguousLine(board, index, player, dx, dy);
    if (line.length >= 5) return line;
  }
  return [];
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
  const radius = difficulty === "devil" ? 3 : difficulty === "easy" ? 1 : 2;
  const moves = nearbyMoves(board, radius);
  return moves.length ? moves : legalMoves(board);
}

function legalMoves(board) {
  return board.flatMap((cell, index) => cell === EMPTY ? [index] : []);
}

function nearbyMoves(board, radius = 2) {
  const occupied = board.flatMap((cell, index) => cell ? [index] : []);
  if (!occupied.length) return [indexAt(7, 7)];

  const candidates = new Set();
  for (const index of occupied) {
    const [x, y] = xy(index);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
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

function profileWeight(profile, difficulty) {
  if (difficulty === "devil") {
    return profile.four * 18000 + profile.openThree * 5200 + profile.openTwo * 260;
  }
  if (difficulty === "hard") {
    return profile.four * 12500 + profile.openThree * 3100 + profile.openTwo * 180;
  }
  return profile.four * 7800 + profile.openThree * 1700 + profile.openTwo * 110;
}

function classifyMove(board, index, player) {
  const rival = player === BLACK ? WHITE : BLACK;
  const ownBoard = applyMoveToBoard(board, index, player);
  const rivalBoard = applyMoveToBoard(board, index, rival);
  const profile = threatProfile(ownBoard, index, player);
  const rivalProfile = threatProfile(rivalBoard, index, rival);

  if (hasFive(ownBoard, index, player)) return "直接连五取胜";
  if (hasFive(rivalBoard, index, rival)) return "封住对手成五";
  if (profile.four >= 2) return "形成双四威胁";
  if (profile.four && profile.openThree) return "形成冲四加活三";
  if (rivalProfile.four >= 2) return "拆掉对手双四";
  if (rivalProfile.four) return "封住对手冲四";
  if (profile.openThree >= 2) return "形成双活三";
  if (rivalProfile.openThree >= 2) return "压住对手双活三";
  if (profile.openThree) return "抢出活三";
  if (rivalProfile.openThree) return "限制对手活三";
  return moveScore(board, index, player) >= moveScore(board, index, rival) ? "扩展己方棋形" : "压制对手强点";
}

function evaluateMove(board, index, player, difficulty) {
  const rival = player === BLACK ? WHITE : BLACK;
  const attack = moveScore(board, index, player);
  const defense = moveScore(board, index, rival);
  const next = applyMoveToBoard(board, index, player);
  const profile = threatProfile(next, index, player);
  const rivalProfile = threatProfile(applyMoveToBoard(board, index, rival), index, rival);
  const doubleThreat = profile.four + profile.openThree >= 2;
  const blockFork = rivalProfile.four + rivalProfile.openThree >= 2;
  const ownWeight = profileWeight(profile, difficulty);
  const blockWeight = profileWeight(rivalProfile, difficulty) * (difficulty === "devil" ? 0.88 : difficulty === "hard" ? 0.72 : 0.45);
  let score = attack + defense * (difficulty === "medium" ? 0.72 : difficulty === "hard" ? 0.98 : 1.08) + ownWeight + blockWeight;

  if (difficulty === "hard" || difficulty === "devil") {
    score += doubleThreat ? (difficulty === "devil" ? 22000 : 7800) : 0;
    score += blockFork ? (difficulty === "devil" ? 14000 : 6200) : 0;
  }

  if (difficulty === "devil") {
    const replies = candidateMoves(next, "hard");
    const rivalWins = winningMoves(next, rival, replies).length;
    const strongestReply = replies.reduce((max, reply) =>
      Math.max(max, moveScore(next, reply, rival) + profileWeight(threatProfile(applyMoveToBoard(next, reply, rival), reply, rival), "hard")), 0);
    score -= rivalWins * 90000;
    score -= strongestReply * 0.52;
    score += profile.four * 9000 + profile.openThree * 3400;
  }

  score += Math.random() * (difficulty === "devil" ? 1.2 : difficulty === "hard" ? 4 : 12);
  return score;
}

function recommendMove(board, difficulty, player = WHITE) {
  const rival = player === BLACK ? WHITE : BLACK;
  const moves = candidateMoves(board, difficulty);
  if (!moves.length) return { index: -1, reason: "" };

  if (difficulty === "easy") {
    const index = choice(moves);
    return { index, reason: classifyMove(board, index, player) };
  }
  const ownWins = winningMoves(board, player, moves);
  if (ownWins.length) {
    const index = ownWins.sort((a, b) => moveScore(board, b, player) - moveScore(board, a, player))[0];
    return { index, reason: "直接连五取胜" };
  }
  const rivalWins = winningMoves(board, rival, moves);
  if (rivalWins.length) {
    const index = rivalWins.sort((a, b) => moveScore(board, b, rival) - moveScore(board, a, rival))[0];
    return { index, reason: "封住对手成五" };
  }

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = evaluateMove(board, move, player, difficulty);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return { index: best, reason: classifyMove(board, best, player) };
}

function chooseAiMove(board, difficulty, player = WHITE) {
  return recommendMove(board, difficulty, player).index;
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
    <button class="${hoshi ? "hoshi" : ""} ${state.winLine?.includes(index) ? "is-win" : ""}" data-cell="${index}" aria-label="第 ${row + 1} 行第 ${col + 1} 列">
      ${stone ? `<span class="stone ${stone}"></span>` : ""}
      ${state.lastMove === index ? "<span class=\"last-marker\"></span>" : ""}
      ${state.hintMove === index ? "<span class=\"hint-marker\"></span>" : ""}
    </button>
  `;
}

export function mountGomoku(root, context) {
  const storageKey = `gomoku:${context.mode}:${context.difficulty}`;
  let state = loadState(storageKey, initialState());
  if (!isValidState(state)) state = initialState();
  if (!Array.isArray(state.winLine)) state.winLine = [];
  if (!Number.isFinite(state.hintMove)) state.hintMove = -1;
  if (typeof state.hintReason !== "string") state.hintReason = "";

  let disposed = false;
  let aiTimer = 0;
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
  }

  function snapshot() {
    return {
      board: [...state.board],
      turn: state.turn,
      winner: state.winner,
      lastMove: state.lastMove,
      winLine: [...state.winLine],
      hintMove: state.hintMove,
      hintReason: state.hintReason,
      message: state.message
    };
  }

  function restore(previous) {
    state.board = [...previous.board];
    state.turn = previous.turn;
    state.winner = previous.winner;
    state.lastMove = previous.lastMove;
    state.winLine = [...(previous.winLine || [])];
    state.hintMove = previous.hintMove ?? -1;
    state.hintReason = previous.hintReason || "";
    state.message = previous.message;
  }

  function reportResult() {
    if (resultReported || !state.winner) return;
    resultReported = true;
    const outcome = state.winner === 3
      ? "draw"
      : context.mode === "ai"
      ? state.winner === BLACK ? "win" : "loss"
      : "complete";
    context.reportResult?.({
      outcome,
      detail: state.message,
      moves: state.board.filter(Boolean).length
    });
  }

  function place(index) {
    if (state.winner || state.board[index] !== EMPTY) return false;
    state.history.push(snapshot());
    state.hintMove = -1;
    state.hintReason = "";
    state.board[index] = state.turn;
    state.lastMove = index;

    if (hasFive(state.board, index, state.turn)) {
      state.winner = state.turn;
      state.winLine = winningLine(state.board, index, state.turn);
      state.message = `${turnLabel(state.turn)}获胜`;
      reportResult();
    } else if (!legalMoves(state.board).length) {
      state.winner = 3;
      state.message = "棋盘已满，平局";
      reportResult();
    } else {
      state.turn = state.turn === BLACK ? WHITE : BLACK;
      state.message = `轮到${turnLabel(state.turn)}`;
      context.playSound?.("move");
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
    if (!state.winner) resultReported = false;
    save();
    render();
  }

  function restart() {
    state = initialState();
    resultReported = false;
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
      const recommendation = recommendMove(state.board.map((cell) => cell), context.difficulty === "easy" ? "medium" : context.difficulty, player);
      if (recommendation.index >= 0) {
        state.hintMove = recommendation.index;
        state.hintReason = recommendation.reason;
        state.message = `${turnLabel(player)}可考虑第 ${Math.floor(recommendation.index / SIZE) + 1} 行第 ${recommendation.index % SIZE + 1} 列：${recommendation.reason}`;
        save();
        render();
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
