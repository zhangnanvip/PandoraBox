import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const COLS = 7;
const ROWS = 6;
const CELLS = COLS * ROWS;
const EMPTY = "";
const HUMAN = "R"; // 红 · 先手
const AI = "Y"; // 黄

const DEPTH = { easy: 1, medium: 3, hard: 5, devil: 6 };

function index(col, row) {
  return row * COLS + col;
}

function initialState() {
  return {
    board: Array(CELLS).fill(EMPTY),
    turn: HUMAN,
    winner: "",
    line: [],
    history: [],
    message: "红方先手"
  };
}

function isValidState(state) {
  return state?.board?.length === CELLS && Array.isArray(state.history);
}

// 各列最低空行（落子点），满列返回 -1
function dropRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (!board[index(col, row)]) return row;
  }
  return -1;
}

function validCols(board) {
  const cols = [];
  for (let col = 0; col < COLS; col += 1) {
    if (dropRow(board, col) >= 0) cols.push(col);
  }
  return cols;
}

// 返回四连胜方与连珠格，否则 winner ""，满盘平局
function evaluate(board) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const player = board[index(col, row)];
      if (!player) continue;
      for (const [dc, dr] of dirs) {
        const cells = [index(col, row)];
        let ok = true;
        for (let step = 1; step < 4; step += 1) {
          const c = col + dc * step;
          const r = row + dr * step;
          if (c < 0 || c >= COLS || r < 0 || r >= ROWS || board[index(c, r)] !== player) {
            ok = false;
            break;
          }
          cells.push(index(c, r));
        }
        if (ok) return { winner: player, line: cells };
      }
    }
  }
  if (!validCols(board).length) return { winner: "draw", line: [] };
  return { winner: "", line: [] };
}

// 启发式打分：四连无限，三连/二连加权
function scoreWindow(window, me, foe) {
  const mine = window.filter((c) => c === me).length;
  const theirs = window.filter((c) => c === foe).length;
  const open = window.filter((c) => !c).length;
  if (mine && theirs) return 0;
  if (mine === 4) return 1000;
  if (mine === 3 && open === 1) return 50;
  if (mine === 2 && open === 2) return 10;
  if (theirs === 3 && open === 1) return -80;
  if (theirs === 2 && open === 2) return -8;
  return 0;
}

function heuristic(board, me) {
  const foe = me === AI ? HUMAN : AI;
  let total = 0;
  for (let row = 0; row < ROWS; row += 1) {
    total += board[index(3, row)] === me ? 6 : 0; // 中列偏好
  }
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      for (const [dc, dr] of dirs) {
        const window = [];
        for (let step = 0; step < 4; step += 1) {
          const c = col + dc * step;
          const r = row + dr * step;
          if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
          window.push(board[index(c, r)]);
        }
        if (window.length === 4) total += scoreWindow(window, me, foe);
      }
    }
  }
  return total;
}

function minimax(board, depth, alpha, beta, maximizing) {
  const result = evaluate(board);
  if (result.winner === AI) return depth + 1;
  if (result.winner === HUMAN) return -(depth + 1);
  if (result.winner === "draw") return 0;
  if (depth === 0) return heuristic(board, AI) / 100;

  const cols = validCols(board).sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b));
  if (maximizing) {
    let best = -Infinity;
    for (const col of cols) {
      const next = [...board];
      next[index(col, dropRow(board, col))] = AI;
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const col of cols) {
    const next = [...board];
    next[index(col, dropRow(board, col))] = HUMAN;
    best = Math.min(best, minimax(next, depth - 1, alpha, beta, true));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function chooseAiMove(board, difficulty) {
  const cols = validCols(board);
  if (!cols.length) return -1;
  if (difficulty === "easy") {
    // 先抓眼前胜/堵，否则随机
    for (const col of cols) {
      const next = [...board];
      next[index(col, dropRow(board, col))] = AI;
      if (evaluate(next).winner === AI) return col;
    }
    return choice(cols);
  }
  const depth = DEPTH[difficulty] ?? 4;
  let bestCol = cols[0];
  let bestScore = -Infinity;
  for (const col of cols.sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b))) {
    const next = [...board];
    next[index(col, dropRow(board, col))] = AI;
    const score = minimax(next, depth - 1, -Infinity, Infinity, false);
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestCol;
}

function labelFor(player) {
  if (player === HUMAN) return "红方";
  if (player === AI) return "黄方";
  return "平局";
}

function serializeState(state) {
  return {
    board: [...state.board],
    turn: state.turn,
    winner: state.winner,
    line: [...state.line],
    history: state.history.map((entry) => ({
      board: [...entry.board],
      turn: entry.turn,
      winner: entry.winner,
      line: [...entry.line],
      message: entry.message
    })),
    message: state.message
  };
}

function restoreFromSnapshot(snapshot) {
  if (!snapshot || !isValidState(snapshot)) return null;
  const fresh = initialState();
  return {
    ...fresh,
    ...snapshot,
    board: [...snapshot.board],
    line: [...(snapshot.line || [])],
    history: Array.isArray(snapshot.history) ? snapshot.history.map((entry) => ({
      board: [...entry.board],
      turn: entry.turn,
      winner: entry.winner || "",
      line: [...(entry.line || [])],
      message: entry.message || ""
    })) : []
  };
}

function sessionMetaFor(state) {
  const placed = state.board.filter(Boolean).length;
  return {
    stage: state.winner ? `已结束 · ${placed} 手` : `进行中 · ${placed} 手`,
    level: placed,
    score: placed
  };
}

export function mountConnect4(root, context) {
  const storageKey = `connect4:${context.mode}`;
  const initial = (context.savedState && restoreFromSnapshot(context.savedState))
    || (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValidState(legacy) ? restoreFromSnapshot(legacy) : initialState();
    })();
  let state = initial;

  let disposed = false;
  let aiTimer = 0;
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
    if (context.saveSession && !state.winner) {
      context.saveSession(serializeState(state), sessionMetaFor(state));
    } else if (context.clearSession && state.winner) {
      context.clearSession();
    }
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

  function reportResult() {
    if (resultReported || !state.winner) return;
    resultReported = true;
    const outcome = state.winner === "draw"
      ? "draw"
      : context.mode === "ai"
      ? state.winner === HUMAN ? "win" : "loss"
      : "complete";
    context.reportResult?.({
      outcome,
      detail: state.message,
      moves: state.board.filter(Boolean).length
    });
  }

  function finishTurn() {
    const result = evaluate(state.board);
    state.winner = result.winner;
    state.line = result.line;
    if (state.winner) {
      state.message = state.winner === "draw" ? "平局" : `${labelFor(state.winner)} 四连获胜`;
      reportResult();
      return;
    }
    state.turn = state.turn === HUMAN ? AI : HUMAN;
    state.message = `轮到 ${labelFor(state.turn)}`;
  }

  function play(col) {
    if (state.winner) return false;
    const row = dropRow(state.board, col);
    if (row < 0) return false;
    state.history.push(snapshot());
    state.board[index(col, row)] = state.turn;
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
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || context.mode !== "ai" || state.turn !== AI || state.winner) return;
    aiTimer = window.setTimeout(() => {
      const move = chooseAiMove(state.board, context.difficulty);
      if (move >= 0) play(move);
    }, context.difficulty === "devil" || context.difficulty === "hard" ? 320 : 200);
  }

  function render() {
    const thinking = context.mode === "ai" && state.turn === AI && !state.winner;
    const cells = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const i = index(col, row);
        const owner = state.board[i];
        const fill = owner === HUMAN ? "#e74c3c" : owner === AI ? "#f1c40f" : "rgba(255,255,255,.08)";
        const win = state.line.includes(i);
        cells.push(`
          <span style="aspect-ratio:1;border-radius:50%;background:${fill};box-shadow:${win ? "0 0 0 3px #2ecc71, inset 0 2px 4px rgba(0,0,0,.3)" : "inset 0 2px 4px rgba(0,0,0,.35)"};transition:background .15s;"></span>
        `);
      }
    }
    const cols = [];
    for (let col = 0; col < COLS; col += 1) {
      const full = dropRow(state.board, col) < 0;
      cols.push(`<button type="button" class="connect4-col" data-col="${col}" ${full || state.winner ? "disabled" : ""} aria-label="第 ${col + 1} 列落子" style="background:transparent;border:0;padding:0;cursor:${full || state.winner ? "default" : "pointer"};"></button>`);
    }
    root.innerHTML = `
      <section class="game-panel game-status connect4-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${thinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>红 ${state.board.filter((c) => c === HUMAN).length}</span>
          <span>黄 ${state.board.filter((c) => c === AI).length}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="position:relative;max-width:420px;margin:0 auto;">
          <div style="display:grid;grid-template-columns:repeat(${COLS},1fr);gap:6px;padding:8px;border-radius:14px;background:#1d4ed8;">
            ${cells.join("")}
          </div>
          <div style="position:absolute;inset:0;display:grid;grid-template-columns:repeat(${COLS},1fr);">
            ${cols.join("")}
          </div>
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-col]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.currentTarget.blur();
        if (context.mode === "ai" && state.turn === AI) return;
        play(Number(button.dataset.col));
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
