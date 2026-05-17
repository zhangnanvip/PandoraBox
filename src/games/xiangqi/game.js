import { choice } from "../../utils/random.js";
import { loadState, saveState, removeState } from "../../utils/storage.js";

const WIDTH = 9;
const HEIGHT = 10;
const RED = "r";
const BLACK = "b";

const PIECE_VALUE = {
  G: 10000,
  R: 520,
  C: 360,
  H: 300,
  E: 140,
  A: 140,
  S: 80
};

const LABELS = {
  rG: "帥",
  rA: "仕",
  rE: "相",
  rH: "馬",
  rR: "車",
  rC: "炮",
  rS: "兵",
  bG: "將",
  bA: "士",
  bE: "象",
  bH: "馬",
  bR: "車",
  bC: "炮",
  bS: "卒"
};

function initialBoard() {
  const board = Array(WIDTH * HEIGHT).fill("");
  const put = (x, y, piece) => {
    board[y * WIDTH + x] = piece;
  };

  ["R", "H", "E", "A", "G", "A", "E", "H", "R"].forEach((type, x) => put(x, 0, BLACK + type));
  put(1, 2, BLACK + "C");
  put(7, 2, BLACK + "C");
  [0, 2, 4, 6, 8].forEach((x) => put(x, 3, BLACK + "S"));

  ["R", "H", "E", "A", "G", "A", "E", "H", "R"].forEach((type, x) => put(x, 9, RED + type));
  put(1, 7, RED + "C");
  put(7, 7, RED + "C");
  [0, 2, 4, 6, 8].forEach((x) => put(x, 6, RED + "S"));

  return board;
}

function initialState() {
  return {
    board: initialBoard(),
    turn: RED,
    winner: "",
    selected: -1,
    moves: [],
    history: [],
    message: "红方先行"
  };
}

function isValidState(state) {
  return state?.board?.length === WIDTH * HEIGHT && Array.isArray(state.history);
}

function indexAt(x, y) {
  return y * WIDTH + x;
}

function xy(index) {
  return [index % WIDTH, Math.floor(index / WIDTH)];
}

function inside(x, y) {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
}

function colorOf(piece) {
  return piece ? piece[0] : "";
}

function typeOf(piece) {
  return piece ? piece[1] : "";
}

function sideLabel(color) {
  return color === RED ? "红方" : "黑方";
}

function palace(color, x, y) {
  if (x < 3 || x > 5) return false;
  return color === RED ? y >= 7 && y <= 9 : y >= 0 && y <= 2;
}

function pushIfValid(board, moves, color, x, y) {
  if (!inside(x, y)) return;
  const target = board[indexAt(x, y)];
  if (!target || colorOf(target) !== color) moves.push(indexAt(x, y));
}

function rayMoves(board, color, x, y, cannon = false) {
  const moves = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (const [dx, dy] of dirs) {
    let cx = x + dx;
    let cy = y + dy;
    let screen = false;

    while (inside(cx, cy)) {
      const target = board[indexAt(cx, cy)];
      if (!cannon) {
        if (!target) moves.push(indexAt(cx, cy));
        else {
          if (colorOf(target) !== color) moves.push(indexAt(cx, cy));
          break;
        }
      } else if (!screen) {
        if (!target) moves.push(indexAt(cx, cy));
        else screen = true;
      } else if (target) {
        if (colorOf(target) !== color) moves.push(indexAt(cx, cy));
        break;
      }
      cx += dx;
      cy += dy;
    }
  }

  return moves;
}

function findGeneral(board, color) {
  return board.findIndex((piece) => piece === color + "G");
}

function generalsFacing(board) {
  const redGeneral = findGeneral(board, RED);
  const blackGeneral = findGeneral(board, BLACK);
  if (redGeneral < 0 || blackGeneral < 0) return false;
  const [rx, ry] = xy(redGeneral);
  const [bx, by] = xy(blackGeneral);
  if (rx !== bx) return false;
  const min = Math.min(ry, by) + 1;
  const max = Math.max(ry, by);
  for (let y = min; y < max; y += 1) {
    if (board[indexAt(rx, y)]) return false;
  }
  return true;
}

function pseudoMoves(board, index) {
  const piece = board[index];
  if (!piece) return [];
  const color = colorOf(piece);
  const type = typeOf(piece);
  const [x, y] = xy(index);
  const moves = [];

  if (type === "G") {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (palace(color, nx, ny)) pushIfValid(board, moves, color, nx, ny);
    });

    const enemyGeneral = findGeneral(board, color === RED ? BLACK : RED);
    const [ex, ey] = enemyGeneral >= 0 ? xy(enemyGeneral) : [-1, -1];
    if (ex === x) {
      const start = Math.min(y, ey) + 1;
      const end = Math.max(y, ey);
      let blocked = false;
      for (let row = start; row < end; row += 1) {
        if (board[indexAt(x, row)]) blocked = true;
      }
      if (!blocked) moves.push(enemyGeneral);
    }
  }

  if (type === "A") {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (palace(color, nx, ny)) pushIfValid(board, moves, color, nx, ny);
    });
  }

  if (type === "E") {
    [[2, 2], [2, -2], [-2, 2], [-2, -2]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      const eye = indexAt(x + dx / 2, y + dy / 2);
      const ownSide = color === RED ? ny >= 5 : ny <= 4;
      if (inside(nx, ny) && ownSide && !board[eye]) pushIfValid(board, moves, color, nx, ny);
    });
  }

  if (type === "H") {
    [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]].forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      const legX = x + (Math.abs(dx) === 2 ? dx / 2 : 0);
      const legY = y + (Math.abs(dy) === 2 ? dy / 2 : 0);
      if (inside(nx, ny) && !board[indexAt(legX, legY)]) pushIfValid(board, moves, color, nx, ny);
    });
  }

  if (type === "R") moves.push(...rayMoves(board, color, x, y, false));
  if (type === "C") moves.push(...rayMoves(board, color, x, y, true));

  if (type === "S") {
    const forward = color === RED ? -1 : 1;
    pushIfValid(board, moves, color, x, y + forward);
    const crossed = color === RED ? y <= 4 : y >= 5;
    if (crossed) {
      pushIfValid(board, moves, color, x - 1, y);
      pushIfValid(board, moves, color, x + 1, y);
    }
  }

  return moves;
}

function legalMovesForPiece(board, index) {
  return pseudoMoves(board, index).filter((target) => {
    const nextBoard = [...board];
    nextBoard[target] = nextBoard[index];
    nextBoard[index] = "";
    return !generalsFacing(nextBoard);
  });
}

function allMoves(board, color) {
  const moves = [];
  board.forEach((piece, index) => {
    if (colorOf(piece) !== color) return;
    for (const target of legalMovesForPiece(board, index)) {
      moves.push({ from: index, to: target, capture: board[target] });
    }
  });
  return moves;
}

function materialScore(board) {
  return board.reduce((score, piece) => {
    if (!piece) return score;
    const value = PIECE_VALUE[typeOf(piece)];
    return score + (colorOf(piece) === BLACK ? value : -value);
  }, 0);
}

function applyMoveToBoard(board, move) {
  const nextBoard = [...board];
  nextBoard[move.to] = nextBoard[move.from];
  nextBoard[move.from] = "";
  return nextBoard;
}

function positionalScore(piece, index) {
  const color = colorOf(piece);
  const type = typeOf(piece);
  const [x, y] = xy(index);
  const center = 4 - Math.abs(x - 4);
  const advance = color === BLACK ? y : HEIGHT - 1 - y;

  if (type === "S") return advance * 12 + (advance >= 5 ? 22 : 0) + center * 2;
  if (type === "H") return center * 8 + (advance >= 3 ? 12 : 0);
  if (type === "C") return center * 6 + (advance >= 3 ? 10 : 0);
  if (type === "R") return center * 5 + (advance >= 2 ? 10 : 0);
  if (type === "G") return -Math.abs(x - 4) * 10;
  return center * 3;
}

function evaluateBoard(board, perspective = BLACK) {
  const rival = perspective === RED ? BLACK : RED;
  if (findGeneral(board, perspective) < 0) return -20000;
  if (findGeneral(board, rival) < 0) return 20000;

  const material = board.reduce((score, piece, index) => {
    if (!piece) return score;
    const value = PIECE_VALUE[typeOf(piece)] + positionalScore(piece, index);
    return score + (colorOf(piece) === perspective ? value : -value);
  }, 0);
  const mobility = allMoves(board, perspective).length - allMoves(board, rival).length;
  return material + mobility * 3;
}

function moveOrderingScore(move) {
  const capture = move.capture ? PIECE_VALUE[typeOf(move.capture)] : 0;
  return capture * 10 + (move.capture && typeOf(move.capture) === "G" ? 100000 : 0);
}

function orderedMoves(board, color, limit = 36) {
  return allMoves(board, color)
    .sort((a, b) => moveOrderingScore(b) - moveOrderingScore(a))
    .slice(0, limit);
}

function searchMoveTree(board, color, rootColor, depth, alpha = -Infinity, beta = Infinity) {
  const rival = color === RED ? BLACK : RED;
  if (findGeneral(board, rootColor) < 0) return -20000 - depth;
  if (findGeneral(board, rootColor === RED ? BLACK : RED) < 0) return 20000 + depth;
  if (depth <= 0) return evaluateBoard(board, rootColor);

  const moves = orderedMoves(board, color, depth >= 2 ? 24 : 40);
  if (!moves.length) return color === rootColor ? -12000 - depth : 12000 + depth;

  if (color === rootColor) {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(value, searchMoveTree(applyMoveToBoard(board, move), rival, rootColor, depth - 1, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    value = Math.min(value, searchMoveTree(applyMoveToBoard(board, move), rival, rootColor, depth - 1, alpha, beta));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function chooseAiMove(board, difficulty) {
  const moves = allMoves(board, BLACK);
  if (!moves.length) return null;
  if (difficulty === "easy") return choice(moves);

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    if (move.capture && typeOf(move.capture) === "G") return move;
    const nextBoard = applyMoveToBoard(board, move);
    let score = (move.capture ? PIECE_VALUE[typeOf(move.capture)] * 2.4 : 0) + Math.random() * (difficulty === "devil" ? 2 : 10);
    if (difficulty === "devil") score += searchMoveTree(nextBoard, RED, BLACK, 3) + evaluateBoard(nextBoard, BLACK) * 0.18;
    else if (difficulty === "hard") score += searchMoveTree(nextBoard, RED, BLACK, 2) + evaluateBoard(nextBoard, BLACK) * 0.24;
    else score += materialScore(nextBoard) * 0.12;
    const [, toY] = xy(move.to);
    score += toY * 2;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function renderPiece(piece) {
  if (!piece) return "";
  const side = colorOf(piece) === BLACK ? "black-side" : "red-side";
  return `<span class="piece ${side}">${LABELS[piece]}</span>`;
}

function renderBoardLines() {
  const horizontal = Array.from({ length: 10 }, (_, y) => `<line x1="0" y1="${y}" x2="8" y2="${y}" />`).join("");
  const verticalEdges = [0, 8].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="9" />`).join("");
  const verticals = Array.from({ length: 7 }, (_, index) => index + 1)
    .map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="4" /><line x1="${x}" y1="5" x2="${x}" y2="9" />`)
    .join("");
  return `
    <svg class="xiangqi-lines" viewBox="0 0 8 9" preserveAspectRatio="none" aria-hidden="true">
      <g>
        ${horizontal}
        ${verticalEdges}
        ${verticals}
        <line class="palace-line" x1="3" y1="0" x2="5" y2="2" />
        <line class="palace-line" x1="5" y1="0" x2="3" y2="2" />
        <line class="palace-line" x1="3" y1="7" x2="5" y2="9" />
        <line class="palace-line" x1="5" y1="7" x2="3" y2="9" />
      </g>
    </svg>
  `;
}

function renderCellStyle(index) {
  const [x, y] = xy(index);
  const left = 5.5556 + x * 11.1111;
  const top = 5 + y * 10;
  return `left:${left.toFixed(4)}%;top:${top.toFixed(4)}%;`;
}

export function mountXiangqi(root, context) {
  const storageKey = `xiangqi:${context.mode}`;
  let state = loadState(storageKey, initialState());
  if (!isValidState(state)) state = initialState();
  state.selected = -1;
  state.moves = [];

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
      message: state.message
    };
  }

  function restore(previous) {
    state.board = [...previous.board];
    state.turn = previous.turn;
    state.winner = previous.winner;
    state.message = previous.message;
    state.selected = -1;
    state.moves = [];
  }

  function reportResult() {
    if (resultReported || !state.winner) return;
    resultReported = true;
    const outcome = context.mode === "ai"
      ? state.winner === RED ? "win" : "loss"
      : "complete";
    context.reportResult?.({
      outcome,
      detail: state.message,
      moves: state.history.length
    });
  }

  function movePiece(from, to) {
    const moving = state.board[from];
    const captured = state.board[to];
    state.history.push(snapshot());
    state.board[to] = moving;
    state.board[from] = "";
    state.selected = -1;
    state.moves = [];

    if (captured && typeOf(captured) === "G") {
      state.winner = colorOf(moving);
      state.message = `${sideLabel(state.winner)}获胜`;
      reportResult();
    } else {
      state.turn = state.turn === RED ? BLACK : RED;
      state.message = captured ? `${sideLabel(colorOf(moving))}吃子，轮到${sideLabel(state.turn)}` : `轮到${sideLabel(state.turn)}`;
    }

    save();
    render();
  }

  function selectCell(index) {
    if (state.winner) return;
    if (context.mode === "ai" && state.turn === BLACK) return;

    const piece = state.board[index];
    if (state.selected >= 0 && state.moves.includes(index)) {
      movePiece(state.selected, index);
      return;
    }

    if (piece && colorOf(piece) === state.turn) {
      state.selected = index;
      state.moves = legalMovesForPiece(state.board, index);
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
    resultReported = false;
    removeState(storageKey);
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || context.mode !== "ai" || state.turn !== BLACK || state.winner) return;
    aiTimer = window.setTimeout(() => {
      const move = chooseAiMove(state.board, context.difficulty);
      if (move) movePiece(move.from, move.to);
    }, context.difficulty === "devil" ? 650 : context.difficulty === "hard" ? 430 : 240);
  }

  function render() {
    const redPieces = state.board.filter((piece) => colorOf(piece) === RED).length;
    const blackPieces = state.board.filter((piece) => colorOf(piece) === BLACK).length;
    const aiThinking = context.mode === "ai" && state.turn === BLACK && !state.winner;

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${aiThinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>红 ${redPieces}</span>
          <span>黑 ${blackPieces}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="xiangqi-board">
          ${renderBoardLines()}
          <div class="xiangqi-river">楚河　汉界</div>
          ${state.board.map((piece, index) => `
            <button class="xiangqi-cell ${state.selected === index ? "selected" : ""}" data-cell="${index}" style="${renderCellStyle(index)}" aria-label="${piece ? LABELS[piece] : "空位"}">
              ${renderPiece(piece)}
              ${state.moves.includes(index) ? "<span class=\"move-dot\"></span>" : ""}
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
      button.addEventListener("click", () => selectCell(Number(button.dataset.cell)));
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
