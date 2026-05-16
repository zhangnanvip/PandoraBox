import { choice } from "../../utils/random.js";
import { loadState, saveState, removeState } from "../../utils/storage.js";

const HUMAN = 1;
const AI = 2;
const ROW_LENGTHS = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
const DY = Math.sqrt(3) / 2;

function buildPoints() {
  const raw = [];
  ROW_LENGTHS.forEach((length, row) => {
    for (let col = 0; col < length; col += 1) {
      raw.push({
        row,
        col,
        x: col - (length - 1) / 2,
        y: row * DY
      });
    }
  });

  const minX = Math.min(...raw.map((point) => point.x));
  const maxX = Math.max(...raw.map((point) => point.x));
  const minY = Math.min(...raw.map((point) => point.y));
  const maxY = Math.max(...raw.map((point) => point.y));

  return raw.map((point, index) => ({
    ...point,
    index,
    left: 6 + ((point.x - minX) / (maxX - minX)) * 88,
    top: 6 + ((point.y - minY) / (maxY - minY)) * 88
  }));
}

function keyFor(x, y) {
  return `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
}

const POINTS = buildPoints();
const POINT_BY_KEY = new Map(POINTS.map((point) => [keyFor(point.x, point.y), point.index]));
const TOP_CAMP = new Set(POINTS.filter((point) => point.row <= 3).map((point) => point.index));
const BOTTOM_CAMP = new Set(POINTS.filter((point) => point.row >= 13).map((point) => point.index));

const NEIGHBORS = POINTS.map((point) =>
  POINTS.filter((other) => other.index !== point.index)
    .filter((other) => {
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      return distance > 0.95 && distance < 1.05;
    })
    .map((other) => other.index)
);

const JUMPS = POINTS.map((point, index) =>
  NEIGHBORS[index].flatMap((over) => {
    const middle = POINTS[over];
    const landing = POINT_BY_KEY.get(keyFor(point.x + (middle.x - point.x) * 2, point.y + (middle.y - point.y) * 2));
    return landing == null ? [] : [{ over, landing }];
  })
);

function initialState() {
  const pieces = Array(POINTS.length).fill(0);
  for (const index of TOP_CAMP) pieces[index] = AI;
  for (const index of BOTTOM_CAMP) pieces[index] = HUMAN;
  return {
    pieces,
    turn: HUMAN,
    selected: -1,
    moves: [],
    winner: 0,
    history: [],
    message: "红子先行"
  };
}

function isValidState(state) {
  return state?.pieces?.length === POINTS.length && Array.isArray(state.history);
}

function sideLabel(player) {
  return player === HUMAN ? "红子" : "青子";
}

function legalMovesFrom(pieces, index) {
  if (!pieces[index]) return [];
  const moves = new Set();

  for (const next of NEIGHBORS[index]) {
    if (!pieces[next]) moves.add(next);
  }

  function collectJumps(from, visited) {
    for (const jump of JUMPS[from]) {
      if (!pieces[jump.over] || pieces[jump.landing] || visited.has(jump.landing)) continue;
      visited.add(jump.landing);
      moves.add(jump.landing);
      collectJumps(jump.landing, visited);
    }
  }

  collectJumps(index, new Set([index]));
  return [...moves];
}

function allMoves(pieces, player) {
  const moves = [];
  pieces.forEach((piece, index) => {
    if (piece !== player) return;
    legalMovesFrom(pieces, index).forEach((to) => moves.push({ from: index, to }));
  });
  return moves;
}

function hasWon(pieces, player) {
  const target = player === HUMAN ? TOP_CAMP : BOTTOM_CAMP;
  return pieces.every((piece, index) => piece !== player || target.has(index));
}

function distanceToCamp(index, player) {
  const point = POINTS[index];
  const target = player === HUMAN ? [...TOP_CAMP] : [...BOTTOM_CAMP];
  return Math.min(...target.map((targetIndex) => {
    const other = POINTS[targetIndex];
    return Math.hypot(point.x - other.x, point.y - other.y);
  }));
}

function rivalOf(player) {
  return player === HUMAN ? AI : HUMAN;
}

function applyMoveToPieces(pieces, move) {
  const next = [...pieces];
  next[move.to] = next[move.from];
  next[move.from] = 0;
  return next;
}

function evaluatePosition(pieces, player) {
  const rival = rivalOf(player);
  const target = player === HUMAN ? TOP_CAMP : BOTTOM_CAMP;
  const rivalTarget = rival === HUMAN ? TOP_CAMP : BOTTOM_CAMP;
  const playerDistance = pieces.reduce((sum, piece, index) => piece === player ? sum + distanceToCamp(index, player) : sum, 0);
  const rivalDistance = pieces.reduce((sum, piece, index) => piece === rival ? sum + distanceToCamp(index, rival) : sum, 0);
  const playerInTarget = pieces.filter((piece, index) => piece === player && target.has(index)).length;
  const rivalInTarget = pieces.filter((piece, index) => piece === rival && rivalTarget.has(index)).length;

  return (rivalDistance - playerDistance) * 14 + (playerInTarget - rivalInTarget) * 85;
}

function searchMoveTree(pieces, player, rootPlayer, depth, alpha = -Infinity, beta = Infinity) {
  if (hasWon(pieces, rootPlayer)) return 10000 + depth;
  if (hasWon(pieces, rivalOf(rootPlayer))) return -10000 - depth;
  if (depth <= 0) return evaluatePosition(pieces, rootPlayer);

  const moves = allMoves(pieces, player);
  if (!moves.length) return evaluatePosition(pieces, rootPlayer);

  if (player === rootPlayer) {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(value, searchMoveTree(applyMoveToPieces(pieces, move), rivalOf(player), rootPlayer, depth - 1, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    value = Math.min(value, searchMoveTree(applyMoveToPieces(pieces, move), rivalOf(player), rootPlayer, depth - 1, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function chooseAiMove(pieces, difficulty) {
  const moves = allMoves(pieces, AI);
  if (!moves.length) return null;
  if (difficulty === "easy") return choice(moves);

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const from = POINTS[move.from];
    const to = POINTS[move.to];
    const progress = to.y - from.y;
    const jumpBonus = Math.hypot(to.x - from.x, to.y - from.y) > 1.2 ? 10 : 0;
    const targetGain = distanceToCamp(move.from, AI) - distanceToCamp(move.to, AI);
    const tactical = progress * 12 + jumpBonus + targetGain * (difficulty === "devil" ? 22 : difficulty === "hard" ? 16 : 6);
    const score = difficulty === "devil"
      ? searchMoveTree(applyMoveToPieces(pieces, move), HUMAN, AI, 2) + tactical * 0.4
      : tactical + Math.random() * 3;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

export function mountChineseCheckers(root, context) {
  const storageKey = `checkers:${context.mode}`;
  let state = loadState(storageKey, initialState());
  if (!isValidState(state)) state = initialState();
  state.selected = -1;
  state.moves = [];

  let disposed = false;
  let aiTimer = 0;

  function save() {
    saveState(storageKey, state);
  }

  function snapshot() {
    return {
      pieces: [...state.pieces],
      turn: state.turn,
      winner: state.winner,
      message: state.message
    };
  }

  function restore(previous) {
    state.pieces = [...previous.pieces];
    state.turn = previous.turn;
    state.winner = previous.winner;
    state.message = previous.message;
    state.selected = -1;
    state.moves = [];
  }

  function movePiece(from, to) {
    state.history.push(snapshot());
    state.pieces[to] = state.pieces[from];
    state.pieces[from] = 0;
    state.selected = -1;
    state.moves = [];

    if (hasWon(state.pieces, state.turn)) {
      state.winner = state.turn;
      state.message = `${sideLabel(state.turn)}获胜`;
    } else {
      state.turn = state.turn === HUMAN ? AI : HUMAN;
      state.message = `轮到${sideLabel(state.turn)}`;
    }

    save();
    render();
  }

  function select(index) {
    if (state.winner) return;
    if (context.mode === "ai" && state.turn === AI) return;

    if (state.selected >= 0 && state.moves.includes(index)) {
      movePiece(state.selected, index);
      return;
    }

    if (state.pieces[index] === state.turn) {
      state.selected = index;
      state.moves = legalMovesFrom(state.pieces, index);
    } else {
      state.selected = -1;
      state.moves = [];
    }
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
    if (disposed || context.mode !== "ai" || state.turn !== AI || state.winner) return;
    aiTimer = window.setTimeout(() => {
      const move = chooseAiMove(state.pieces, context.difficulty);
      if (move) movePiece(move.from, move.to);
    }, context.difficulty === "devil" ? 520 : context.difficulty === "hard" ? 380 : 220);
  }

  function render() {
    const aiThinking = context.mode === "ai" && state.turn === AI && !state.winner;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${aiThinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>红 ${state.pieces.filter((piece) => piece === HUMAN).length}</span>
          <span>青 ${state.pieces.filter((piece) => piece === AI).length}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="star-board">
          ${POINTS.map((point) => `
            <button
              class="star-hole player-${state.pieces[point.index] || 0} ${state.selected === point.index ? "is-selected" : ""} ${state.moves.includes(point.index) ? "is-move" : ""} ${(TOP_CAMP.has(point.index) || BOTTOM_CAMP.has(point.index)) ? "is-target" : ""}"
              style="left:${point.left}%; top:${point.top}%"
              data-hole="${point.index}"
              aria-label="第 ${point.row + 1} 行第 ${point.col + 1} 位"
            ></button>
          `).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-hole]").forEach((button) => {
      button.addEventListener("click", () => select(Number(button.dataset.hole)));
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
