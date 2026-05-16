import { choice, shuffle } from "../../utils/random.js";
import { loadState, saveState, removeState } from "../../utils/storage.js";

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function initialState(size = 19) {
  return {
    size,
    board: Array(size * size).fill(EMPTY),
    turn: BLACK,
    captures: { 1: 0, 2: 0 },
    passes: 0,
    winner: EMPTY,
    lastMove: -1,
    history: [],
    message: "黑方先手"
  };
}

function isValidState(state) {
  return [9, 13, 19].includes(state?.size) && state.board?.length === state.size * state.size;
}

function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

function turnLabel(player) {
  return player === BLACK ? "黑方" : "白方";
}

function xy(index, size) {
  return [index % size, Math.floor(index / size)];
}

function indexAt(x, y, size) {
  return y * size + x;
}

function neighbors(index, size) {
  const [x, y] = xy(index, size);
  const result = [];
  if (x > 0) result.push(index - 1);
  if (x < size - 1) result.push(index + 1);
  if (y > 0) result.push(index - size);
  if (y < size - 1) result.push(index + size);
  return result;
}

function groupAndLiberties(board, start, size) {
  const player = board[start];
  const group = new Set([start]);
  const liberties = new Set();
  const queue = [start];

  while (queue.length) {
    const current = queue.pop();
    for (const next of neighbors(current, size)) {
      if (board[next] === EMPTY) liberties.add(next);
      else if (board[next] === player && !group.has(next)) {
        group.add(next);
        queue.push(next);
      }
    }
  }

  return { group, liberties };
}

function simulateMove(board, index, player, size) {
  if (board[index] !== EMPTY) return null;
  const nextBoard = [...board];
  nextBoard[index] = player;
  let captured = 0;

  for (const next of neighbors(index, size)) {
    if (nextBoard[next] !== opponent(player)) continue;
    const group = groupAndLiberties(nextBoard, next, size);
    if (group.liberties.size === 0) {
      for (const stone of group.group) {
        nextBoard[stone] = EMPTY;
        captured += 1;
      }
    }
  }

  const own = groupAndLiberties(nextBoard, index, size);
  if (own.liberties.size === 0) return null;

  return { board: nextBoard, captured, liberties: own.liberties.size };
}

function scoreBoard(board, captures, size) {
  const visited = new Set();
  const score = {
    [BLACK]: captures[BLACK],
    [WHITE]: captures[WHITE]
  };

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === BLACK) score[BLACK] += 1;
    if (board[index] === WHITE) score[WHITE] += 1;
    if (board[index] !== EMPTY || visited.has(index)) continue;

    const region = new Set([index]);
    const borders = new Set();
    const queue = [index];
    visited.add(index);

    while (queue.length) {
      const current = queue.pop();
      for (const next of neighbors(current, size)) {
        if (board[next] === EMPTY && !visited.has(next)) {
          visited.add(next);
          region.add(next);
          queue.push(next);
        } else if (board[next] !== EMPTY) {
          borders.add(board[next]);
        }
      }
    }

    if (borders.size === 1) {
      score[[...borders][0]] += region.size;
    }
  }

  return score;
}

function legalMoves(board, player, size) {
  const moves = [];
  for (let index = 0; index < board.length; index += 1) {
    if (simulateMove(board, index, player, size)) moves.push(index);
  }
  return moves;
}

function openingMoves(size) {
  const points = hoshiPoints(size);
  const center = Math.floor(size / 2);
  return [...new Set([
    indexAt(center, center, size),
    indexAt(points[0], points[0], size),
    indexAt(points[points.length - 1], points[0], size),
    indexAt(points[0], points[points.length - 1], size),
    indexAt(points[points.length - 1], points[points.length - 1], size)
  ])];
}

function candidateMoves(board, player, size, difficulty) {
  const occupied = board.flatMap((cell, index) => cell ? [index] : []);
  if (!occupied.length) return openingMoves(size);
  if (difficulty === "easy") return legalMoves(board, player, size);

  const radius = difficulty === "devil" ? 2 : 1;
  const candidates = new Set();
  for (const index of occupied) {
    const [x, y] = xy(index, size);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const target = indexAt(nx, ny, size);
        if (board[target] === EMPTY && simulateMove(board, target, player, size)) candidates.add(target);
      }
    }
  }

  return candidates.size ? [...candidates] : legalMoves(board, player, size);
}

function localTacticalScore(board, index, player, size) {
  let score = 0;
  const rival = opponent(player);
  for (const next of neighbors(index, size)) {
    if (board[next] === rival) {
      const group = groupAndLiberties(board, next, size);
      if (group.liberties.has(index)) {
        if (group.liberties.size === 1) score += group.group.size * 145;
        else if (group.liberties.size === 2) score += group.group.size * 44;
      }
    }
    if (board[next] === player) {
      const group = groupAndLiberties(board, next, size);
      if (group.liberties.has(index)) {
        if (group.liberties.size === 1) score += group.group.size * 72;
        else if (group.liberties.size === 2) score += group.group.size * 24;
      }
    }
  }
  return score;
}

function moveScore(board, index, player, size, difficulty) {
  const result = simulateMove(board, index, player, size);
  if (!result) return -Infinity;

  const [x, y] = xy(index, size);
  const center = (size - 1) / 2;
  let score = result.captured * 90 + result.liberties * 8 + localTacticalScore(board, index, player, size) - (Math.abs(x - center) + Math.abs(y - center)) * 0.6;

  for (const next of neighbors(index, size)) {
    if (board[next] === player) score += 10;
    if (board[next] === opponent(player)) score += difficulty === "hard" || difficulty === "devil" ? 9 : 4;
  }

  if (difficulty === "hard" || difficulty === "devil") {
    const nextScore = scoreBoard(result.board, { 1: 0, 2: 0 }, size);
    score += (nextScore[player] - nextScore[opponent(player)]) * 0.24;
    if (result.liberties === 1) score -= 42;
  }

  if (difficulty === "devil") {
    const replies = candidateMoves(result.board, opponent(player), size, "hard");
    const strongestReply = replies.reduce((max, reply) =>
      Math.max(max, moveScore(result.board, reply, opponent(player), size, "hard")), 0);
    score += result.captured * 45;
    score -= strongestReply * 0.28;
    if (result.liberties <= 2) score -= 36;
  }

  return score + Math.random() * 4;
}

function chooseAiMove(board, player, size, difficulty) {
  const moves = candidateMoves(board, player, size, difficulty);
  if (!moves.length) return -1;
  if (difficulty === "easy") return choice(shuffle(moves).slice(0, Math.min(80, moves.length)));

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = moveScore(board, move, player, size, difficulty);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function hoshiPoints(size) {
  if (size === 9) return [2, 4, 6];
  if (size === 13) return [3, 6, 9];
  return [3, 9, 15];
}

function renderCell(cell, index, state) {
  const row = Math.floor(index / state.size);
  const col = index % state.size;
  const points = hoshiPoints(state.size);
  const hoshi = points.includes(row) && points.includes(col);
  const stone = cell === BLACK ? "black" : cell === WHITE ? "white" : "";
  return `
    <button class="${hoshi ? "hoshi" : ""}" data-cell="${index}" aria-label="第 ${row + 1} 行第 ${col + 1} 列">
      ${stone ? `<span class="stone ${stone}"></span>` : ""}
      ${state.lastMove === index ? "<span class=\"last-marker\"></span>" : ""}
    </button>
  `;
}

export function mountGo(root, context) {
  const storageKey = `go:${context.mode}`;
  let state = loadState(storageKey, initialState(19));
  if (!isValidState(state)) state = initialState(19);

  let disposed = false;
  let aiTimer = 0;
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
  }

  function snapshot() {
    return {
      size: state.size,
      board: [...state.board],
      turn: state.turn,
      captures: { ...state.captures },
      passes: state.passes,
      winner: state.winner,
      lastMove: state.lastMove,
      message: state.message
    };
  }

  function restore(previous) {
    Object.assign(state, {
      ...previous,
      board: [...previous.board],
      captures: { ...previous.captures }
    });
  }

  function reportResult(score) {
    if (resultReported || !state.winner) return;
    resultReported = true;
    const outcome = context.mode === "ai"
      ? state.winner === BLACK ? "win" : "loss"
      : "complete";
    context.reportResult?.({
      outcome,
      detail: state.message,
      extra: `黑 ${score[BLACK]} · 白 ${score[WHITE]}`
    });
  }

  function finishByScore() {
    const score = scoreBoard(state.board, state.captures, state.size);
    state.winner = score[BLACK] >= score[WHITE] ? BLACK : WHITE;
    state.message = `双方停一手，${turnLabel(state.winner)}胜 ${score[BLACK]}:${score[WHITE]}`;
    reportResult(score);
  }

  function play(index) {
    if (state.winner) return false;
    const result = simulateMove(state.board, index, state.turn, state.size);
    if (!result) {
      state.message = "此处不可落子";
      render();
      return false;
    }

    state.history.push(snapshot());
    state.board = result.board;
    state.captures[state.turn] += result.captured;
    state.lastMove = index;
    state.passes = 0;
    state.turn = opponent(state.turn);
    state.message = result.captured ? `提子 ${result.captured} 枚，轮到${turnLabel(state.turn)}` : `轮到${turnLabel(state.turn)}`;
    save();
    render();
    return true;
  }

  function pass() {
    if (state.winner) return;
    state.history.push(snapshot());
    state.passes += 1;
    state.lastMove = -1;
    if (state.passes >= 2) finishByScore();
    else {
      state.turn = opponent(state.turn);
      state.message = `${turnLabel(opponent(state.turn))}停一手，轮到${turnLabel(state.turn)}`;
    }
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

  function restart(size = state.size) {
    state = initialState(size);
    resultReported = false;
    removeState(storageKey);
    save();
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || context.mode !== "ai" || state.turn !== WHITE || state.winner) return;
    aiTimer = window.setTimeout(() => {
      const move = chooseAiMove(state.board, WHITE, state.size, context.difficulty);
      if (move >= 0) play(move);
      else pass();
    }, context.difficulty === "devil" ? 650 : context.difficulty === "hard" ? 480 : 260);
  }

  function render() {
    const score = scoreBoard(state.board, state.captures, state.size);
    const aiThinking = context.mode === "ai" && state.turn === WHITE && !state.winner;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${aiThinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="size-tabs" aria-label="棋盘大小">
          ${[9, 13, 19].map((size) => `<button data-size="${size}" class="${size === state.size ? "is-active" : ""}">${size}路</button>`).join("")}
        </div>
      </section>

      <section class="board-wrap">
        <div class="grid-board go-board" style="grid-template-columns: repeat(${state.size}, 1fr); grid-template-rows: repeat(${state.size}, 1fr);">
          ${state.board.map((cell, index) => renderCell(cell, index, state)).join("")}
        </div>
      </section>

      <section class="game-panel">
        <div class="score-row">
          <span>黑提 ${state.captures[BLACK]}</span>
          <span>白提 ${state.captures[WHITE]}</span>
          <span>估分 黑 ${score[BLACK]}</span>
          <span>白 ${score[WHITE]}</span>
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="pass">停一手</button>
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        if (context.mode === "ai" && state.turn === WHITE) return;
        play(Number(button.dataset.cell));
      });
    });
    root.querySelectorAll("[data-size]").forEach((button) => {
      button.addEventListener("click", () => restart(Number(button.dataset.size)));
    });
    root.querySelector("[data-action='pass']").addEventListener("click", () => {
      if (context.mode === "ai" && state.turn === WHITE) return;
      pass();
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", () => restart());

    scheduleAi();
  }

  render();

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
  };
}
