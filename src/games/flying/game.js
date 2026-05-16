import { choice } from "../../utils/random.js";
import { loadState, saveState, removeState } from "../../utils/storage.js";

const PLAYER_NAMES = ["红", "蓝", "黄", "绿"];
const START = [0, 13, 26, 39];
const FINISH = 57;

const PATH = Array.from({ length: 52 }, (_, index) => {
  const angle = -Math.PI / 2 + (index / 52) * Math.PI * 2;
  return {
    index,
    left: 50 + Math.cos(angle) * 42,
    top: 50 + Math.sin(angle) * 42
  };
});

function initialState() {
  return {
    pieces: Array.from({ length: 4 }, () => Array(4).fill(-1)),
    turn: 0,
    dice: 0,
    rolled: false,
    winner: -1,
    history: [],
    message: "红方投骰"
  };
}

function isValidState(state) {
  return state?.pieces?.length === 4 && state.pieces.every((pieces) => pieces.length === 4);
}

function playerLabel(player) {
  return `${PLAYER_NAMES[player]}方`;
}

function rollValue() {
  return Math.floor(Math.random() * 6) + 1;
}

function globalIndex(player, steps) {
  return (START[player] + steps) % 52;
}

function positionForPiece(player, steps) {
  if (steps < 0) return null;
  if (steps < 52) return PATH[globalIndex(player, steps)];

  const entry = PATH[START[player]];
  const t = (steps - 51) / 7;
  return {
    left: entry.left + (50 - entry.left) * t,
    top: entry.top + (50 - entry.top) * t
  };
}

function movablePieces(state, player = state.turn) {
  if (!state.rolled || state.winner >= 0) return [];
  return state.pieces[player].flatMap((steps, piece) => {
    if (steps === -1) return state.dice === 6 ? [piece] : [];
    return steps + state.dice <= FINISH ? [piece] : [];
  });
}

function landingCaptures(state, player, newSteps) {
  if (newSteps < 0 || newSteps >= 52) return 0;
  const landing = globalIndex(player, newSteps);
  let captures = 0;
  state.pieces.forEach((pieces, otherPlayer) => {
    if (otherPlayer === player) return;
    pieces.forEach((steps) => {
      if (steps >= 0 && steps < 52 && globalIndex(otherPlayer, steps) === landing) captures += 1;
    });
  });
  return captures;
}

function chooseAiPiece(state, difficulty) {
  const moves = movablePieces(state);
  if (!moves.length) return -1;
  if (difficulty === "easy") return choice(moves);

  let best = moves[0];
  let bestScore = -Infinity;
  for (const piece of moves) {
    const steps = state.pieces[state.turn][piece];
    const newSteps = steps === -1 ? 0 : steps + state.dice;
    let score = newSteps - Math.max(steps, 0);
    if (steps === -1) score += 22;
    if (newSteps === FINISH) score += 90;
    score += landingCaptures(state, state.turn, newSteps) * 42;

    if (difficulty === "hard" && newSteps >= 0 && newSteps < 52) {
      const landing = globalIndex(state.turn, newSteps);
      let risk = 0;
      state.pieces.forEach((pieces, otherPlayer) => {
        if (otherPlayer === state.turn) return;
        pieces.forEach((otherSteps) => {
          if (otherSteps < 0 || otherSteps >= 52) return;
          const distance = (landing - globalIndex(otherPlayer, otherSteps) + 52) % 52;
          if (distance >= 1 && distance <= 6) risk += 1;
        });
      });
      score -= risk * 14;
    }

    score += Math.random() * 4;
    if (score > bestScore) {
      bestScore = score;
      best = piece;
    }
  }

  return best;
}

export function mountFlyingChess(root, context) {
  const storageKey = `flying:${context.mode}`;
  let state = loadState(storageKey, initialState());
  if (!isValidState(state)) state = initialState();

  let disposed = false;
  let aiTimer = 0;
  let passTimer = 0;
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
  }

  function snapshot() {
    return {
      pieces: state.pieces.map((pieces) => [...pieces]),
      turn: state.turn,
      dice: state.dice,
      rolled: state.rolled,
      winner: state.winner,
      message: state.message
    };
  }

  function restore(previous) {
    state.pieces = previous.pieces.map((pieces) => [...pieces]);
    state.turn = previous.turn;
    state.dice = previous.dice;
    state.rolled = previous.rolled;
    state.winner = previous.winner;
    state.message = previous.message;
  }

  function reportResult() {
    if (resultReported || state.winner < 0) return;
    resultReported = true;
    const outcome = context.mode === "ai"
      ? state.winner === 0 ? "win" : "loss"
      : "complete";
    context.reportResult?.({
      outcome,
      detail: state.message,
      moves: state.history.length
    });
  }

  function isHumanTurn() {
    return context.mode === "local" || state.turn === 0;
  }

  function nextTurn(extra = false) {
    if (!extra) state.turn = (state.turn + 1) % 4;
    state.dice = 0;
    state.rolled = false;
    state.message = `${playerLabel(state.turn)}投骰`;
    save();
    render();
  }

  function rollDice() {
    if (state.rolled || state.winner >= 0) return;
    state.history.push(snapshot());
    state.dice = rollValue();
    state.rolled = true;
    const moves = movablePieces(state);
    state.message = moves.length
      ? `${playerLabel(state.turn)}掷出 ${state.dice}，选择飞机`
      : `${playerLabel(state.turn)}掷出 ${state.dice}，无棋可走`;
    save();
    render();
  }

  function movePiece(piece) {
    if (!movablePieces(state).includes(piece)) return;

    const current = state.pieces[state.turn][piece];
    const next = current === -1 ? 0 : current + state.dice;
    state.pieces[state.turn][piece] = next;

    if (next < 52) {
      const landing = globalIndex(state.turn, next);
      state.pieces.forEach((pieces, otherPlayer) => {
        if (otherPlayer === state.turn) return;
        pieces.forEach((steps, otherPiece) => {
          if (steps >= 0 && steps < 52 && globalIndex(otherPlayer, steps) === landing) {
            pieces[otherPiece] = -1;
          }
        });
      });
    }

    if (state.pieces[state.turn].every((steps) => steps === FINISH)) {
      state.winner = state.turn;
      state.message = `${playerLabel(state.turn)}获胜`;
      reportResult();
    } else {
      nextTurn(state.dice === 6);
      return;
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

  function restart() {
    state = initialState();
    resultReported = false;
    removeState(storageKey);
    render();
  }

  function scheduleAutomation() {
    clearTimeout(aiTimer);
    clearTimeout(passTimer);

    if (disposed || state.winner >= 0) return;

    if (state.rolled && movablePieces(state).length === 0) {
      passTimer = window.setTimeout(() => nextTurn(false), isHumanTurn() ? 900 : 420);
      return;
    }

    if (context.mode === "ai" && state.turn !== 0) {
      aiTimer = window.setTimeout(() => {
        if (!state.rolled) rollDice();
        else {
          const piece = chooseAiPiece(state, context.difficulty);
          if (piece >= 0) movePiece(piece);
          else nextTurn(false);
        }
      }, state.rolled ? 480 : 360);
    }
  }

  function renderPlane(player, piece, steps, inBase = false) {
    const movable = state.turn === player && movablePieces(state).includes(piece) && isHumanTurn();
    const label = `${PLAYER_NAMES[player]}${piece + 1}`;
    if (inBase) {
      return `<button class="plane p${player} ${movable ? "is-movable" : ""}" data-piece="${player}:${piece}" ${movable ? "" : "disabled"}>${piece + 1}</button>`;
    }

    const point = positionForPiece(player, steps);
    const offsets = [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]];
    return `
      <button
        class="plane in-cell p${player} ${movable ? "is-movable" : ""}"
        style="left:${point.left + offsets[piece][0]}%; top:${point.top + offsets[piece][1]}%"
        data-piece="${player}:${piece}"
        ${movable ? "" : "disabled"}
        aria-label="${label}"
      >${piece + 1}</button>
    `;
  }

  function render() {
    const activeMoves = movablePieces(state);
    const aiThinking = context.mode === "ai" && state.turn !== 0 && state.winner < 0;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${aiThinking ? " · AI 行动中" : ""}</p>
        </div>
        <div class="dice" aria-label="骰子">${state.dice || "·"}</div>
      </section>

      <section class="board-wrap">
        <div class="flying-board">
          ${PATH.map((point) => `<span class="flying-cell" style="left:${point.left}%; top:${point.top}%">${point.index + 1}</span>`).join("")}
          ${[0, 1, 2, 3].flatMap((player) => [52, 53, 54, 55, 56, 57].map((step) => {
            const point = positionForPiece(player, step);
            return `<span class="flying-cell flying-home-cell" style="left:${point.left}%; top:${point.top}%"></span>`;
          })).join("")}
          ${[0, 1, 2, 3].map((player) => `
            <div class="flying-base" data-player="${player}">
              ${state.pieces[player].map((steps, piece) => steps === -1 ? renderPlane(player, piece, steps, true) : "").join("")}
            </div>
          `).join("")}
          ${state.pieces.flatMap((pieces, player) =>
            pieces.map((steps, piece) => steps >= 0 ? renderPlane(player, piece, steps, false) : "")
          ).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="primary-button" data-action="roll" ${isHumanTurn() && !state.rolled && state.winner < 0 ? "" : "disabled"}>投骰子</button>
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
        ${state.rolled && isHumanTurn() && activeMoves.length ? `<span class="game-note">可走 ${activeMoves.length} 架</span>` : ""}
      </section>
    `;

    root.querySelector("[data-action='roll']").addEventListener("click", rollDice);
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    root.querySelectorAll("[data-piece]").forEach((button) => {
      button.addEventListener("click", () => {
        const [player, piece] = button.dataset.piece.split(":").map(Number);
        if (player === state.turn && isHumanTurn()) movePiece(piece);
      });
    });

    scheduleAutomation();
  }

  render();

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
    clearTimeout(passTimer);
  };
}
