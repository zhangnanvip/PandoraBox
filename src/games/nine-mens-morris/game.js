import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const EMPTY = "";
const HUMAN = "X"; // 黑 · 先手
const AI = "O"; // 白
const TOTAL = 9; // 每方棋子总数

// 24 个落点坐标 (0..23)，三层正方形：外层 0-7 / 中层 8-15 / 内层 16-23
// 编号从左上角起顺时针：角、上中、角、右中、角、下中、角、左中
const COORDS = [
  [0, 0], [3, 0], [6, 0], [6, 3], [6, 6], [3, 6], [0, 6], [0, 3], // 外
  [1, 1], [3, 1], [5, 1], [5, 3], [5, 5], [3, 5], [1, 5], [1, 3], // 中
  [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [2, 3]  // 内
];

// 16 条三连线（成"磨坊"）
const MILLS = [
  [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
  [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
  [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
  [1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23]
];

// 邻接表
const ADJ = (() => {
  const a = Array.from({ length: 24 }, () => []);
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 8],
    [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 16],
    [1, 9], [9, 17], [3, 11], [11, 19], [5, 13], [13, 21], [7, 15], [15, 23]
  ];
  for (const [u, v] of edges) { a[u].push(v); a[v].push(u); }
  return a;
})();

function initialState() {
  return {
    board: Array(24).fill(EMPTY),
    turn: HUMAN,
    placedH: 0,
    placedA: 0,
    selected: -1,
    phase: "place", // place | move | remove
    removeBy: HUMAN, // 该谁吃子
    winner: "",
    line: [],
    message: "黑方落子 · 还需放 9 子",
    history: []
  };
}

function isValidState(s) {
  return s?.board?.length === 24 && Array.isArray(s.history) && typeof s.turn === "string";
}

function countOn(board, player) {
  return board.reduce((n, c) => (c === player ? n + 1 : n), 0);
}

function remainingToPlace(state, player) {
  return TOTAL - (player === HUMAN ? state.placedH : state.placedA);
}

// idx 所在是否构成磨坊（player 三连）
function millAt(board, idx, player) {
  return MILLS.some((m) => m.includes(idx) && m.every((i) => board[i] === player));
}

// 可吃目标：对方棋子，优先非磨坊；若全在磨坊则可吃任意
function removable(board, foe) {
  const foes = [];
  for (let i = 0; i < 24; i += 1) if (board[i] === foe) foes.push(i);
  const free = foes.filter((i) => !millAt(board, i, foe));
  return free.length ? free : foes;
}

function canFly(board, player) {
  return countOn(board, player) === 3;
}

// 移动阶段某玩家的合法走子 [from,to]
function moves(board, player, fly) {
  const out = [];
  for (let i = 0; i < 24; i += 1) {
    if (board[i] !== player) continue;
    const dests = fly ? board.map((c, k) => (c ? -1 : k)).filter((k) => k >= 0) : ADJ[i];
    for (const d of dests) if (board[d] === EMPTY) out.push([i, d]);
  }
  return out;
}

function emptyPoints(board) {
  return board.flatMap((c, i) => (c ? [] : [i]));
}

function labelFor(p) {
  if (p === HUMAN) return "黑方";
  if (p === AI) return "白方";
  return "平局";
}

// ---- AI（minimax） ----
function evalBoard(board, placeDone) {
  if (placeDone) {
    const ah = countOn(board, HUMAN);
    const aa = countOn(board, AI);
    if (aa < 3) return -100;
    if (ah < 3) return 100;
    if (canFly(board, AI) === false && !moves(board, AI, false).length) return -100;
    if (canFly(board, HUMAN) === false && !moves(board, HUMAN, false).length) return 100;
  }
  let s = (countOn(board, AI) - countOn(board, HUMAN)) * 6;
  for (const m of MILLS) {
    const a = m.filter((i) => board[i] === AI).length;
    const h = m.filter((i) => board[i] === HUMAN).length;
    if (a === 3) s += 5; else if (h === 3) s -= 5;
  }
  for (let i = 0; i < 24; i += 1) {
    if (board[i] === AI) s += ADJ[i].length * 0.3;
    else if (board[i] === HUMAN) s -= ADJ[i].length * 0.3;
  }
  return s;
}

function aiPlace(board, placedA, placedH, depth) {
  const foe = HUMAN;
  const spots = emptyPoints(board);
  let best = null;
  let bestScore = -Infinity;
  for (const i of spots) {
    const b = [...board];
    b[i] = AI;
    let score;
    if (millAt(b, i, AI)) {
      const rm = removable(b, foe);
      const target = rm[0] ?? -1;
      if (target >= 0) b[target] = EMPTY;
      score = evalBoard(b, false) + 4;
    } else {
      score = evalBoard(b, false);
    }
    if (depth > 0) {
      const block = [...board]; block[i] = HUMAN;
      if (millAt(block, i, HUMAN)) score += 3;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best ?? choice(spots);
}

function negamax(board, player, depth, alpha, beta) {
  const score = evalBoard(board, true);
  if (Math.abs(score) >= 100 || depth === 0) {
    return { score: player === AI ? score : -score };
  }
  const fly = canFly(board, player);
  const list = moves(board, player, fly);
  if (!list.length) return { score: player === AI ? -100 : 100 };
  let bestScore = -Infinity;
  let bestMove = null;
  const foe = player === AI ? HUMAN : AI;
  for (const [from, to] of list) {
    const b = [...board];
    b[from] = EMPTY; b[to] = player;
    if (millAt(b, to, player)) {
      const rm = removable(b, foe);
      if (rm.length) b[rm[0]] = EMPTY;
    }
    const child = negamax(b, foe, depth - 1, -beta, -alpha).score * -1;
    if (child > bestScore) { bestScore = child; bestMove = [from, to]; }
    alpha = Math.max(alpha, child);
    if (alpha >= beta) break;
  }
  return { score: bestScore, move: bestMove };
}

function aiMove(board, difficulty) {
  const fly = canFly(board, AI);
  const list = moves(board, AI, fly);
  if (!list.length) return null;
  if (difficulty === "easy") return choice(list);
  const depth = difficulty === "devil" ? 4 : difficulty === "hard" ? 3 : 2;
  return negamax(board, AI, depth, -Infinity, Infinity).move ?? choice(list);
}

function serialize(state) {
  return {
    board: [...state.board], turn: state.turn,
    placedH: state.placedH, placedA: state.placedA,
    selected: state.selected, phase: state.phase, removeBy: state.removeBy,
    winner: state.winner, line: [...state.line], message: state.message,
    history: state.history.map((h) => ({ ...h, board: [...h.board], line: [...(h.line || [])] }))
  };
}

function restoreSnap(snap) {
  if (!snap || !isValidState(snap)) return null;
  const fresh = initialState();
  return {
    ...fresh, ...snap, board: [...snap.board], line: [...(snap.line || [])],
    history: Array.isArray(snap.history)
      ? snap.history.map((h) => ({ ...h, board: [...h.board], line: [...(h.line || [])] })) : []
  };
}

function metaFor(state) {
  const placed = state.placedH + state.placedA;
  return { stage: state.winner ? `已结束` : `第 ${placed} 手`, level: placed, score: placed };
}

export function mountNineMens(root, context) {
  const isAi = context.mode === "ai";
  const storageKey = `nine-mens-morris:${context.mode || "local"}`;
  const initial = (context.savedState && restoreSnap(context.savedState))
    || (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValidState(legacy) ? restoreSnap(legacy) : initialState();
    })();
  let state = initial;
  let disposed = false;
  let aiTimer = 0;
  let reported = false;

  function save() {
    saveState(storageKey, state);
    if (context.saveSession && !state.winner) context.saveSession(serialize(state), metaFor(state));
    else if (context.clearSession && state.winner) context.clearSession();
  }

  function snapshot() {
    return {
      board: [...state.board], turn: state.turn, placedH: state.placedH, placedA: state.placedA,
      phase: state.phase, removeBy: state.removeBy, message: state.message, line: [...state.line], selected: state.selected
    };
  }

  function report() {
    if (reported || !state.winner) return;
    reported = true;
    const outcome = state.winner === "draw" ? "draw" : isAi ? (state.winner === HUMAN ? "win" : "loss") : "complete";
    context.reportResult?.({ outcome, detail: state.message, moves: state.placedH + state.placedA });
  }

  function updateMessage() {
    if (state.winner) {
      state.message = state.winner === "draw" ? "平局" : `${labelFor(state.winner)} 获胜`;
      return;
    }
    if (state.phase === "remove") {
      state.message = `${labelFor(state.removeBy)} 成磨坊 · 吃掉对方一子`;
      return;
    }
    const placing = remainingToPlace(state, state.turn) > 0;
    if (placing) state.message = `${labelFor(state.turn)}落子 · 还需放 ${remainingToPlace(state, state.turn)} 子`;
    else if (canFly(state.board, state.turn)) state.message = `${labelFor(state.turn)}飞子 · 任意空点`;
    else state.message = `${labelFor(state.turn)}走子 · 移到相邻空点`;
  }

  function checkLoss(player) {
    const placeDone = state.placedH === TOTAL && state.placedA === TOTAL;
    if (!placeDone) return false;
    if (countOn(state.board, player) < 3) return true;
    if (!canFly(state.board, player) && !moves(state.board, player, false).length) return true;
    return false;
  }

  function nextTurn() {
    state.turn = state.turn === HUMAN ? AI : HUMAN;
    state.selected = -1;
    if (checkLoss(state.turn)) {
      state.winner = state.turn === HUMAN ? AI : HUMAN;
      state.line = [];
    }
    state.phase = remainingToPlace(state, state.turn) > 0 ? "place" : "move";
    updateMessage();
  }

  function afterMill(idx, player) {
    state.phase = "remove";
    state.removeBy = player;
    state.line = MILLS.find((m) => m.includes(idx) && m.every((i) => state.board[i] === player)) || [];
    updateMessage();
  }

  function doRemove(idx) {
    const foe = state.removeBy === HUMAN ? AI : HUMAN;
    if (state.board[idx] !== foe) return false;
    const valid = removable(state.board, foe).includes(idx);
    if (!valid) return false;
    state.history.push(snapshot());
    state.board[idx] = EMPTY;
    state.line = [];
    context.playSound?.("capture");
    if (checkLoss(foe)) { state.winner = state.removeBy; updateMessage(); report(); save(); render(); return true; }
    state.turn = state.removeBy;
    nextTurn();
    save(); render();
    return true;
  }

  function place(idx) {
    if (state.board[idx]) return false;
    state.history.push(snapshot());
    state.board[idx] = state.turn;
    if (state.turn === HUMAN) state.placedH += 1; else state.placedA += 1;
    context.playSound?.("place");
    if (millAt(state.board, idx, state.turn)) afterMill(idx, state.turn);
    else nextTurn();
    save(); render();
    return true;
  }

  function move(from, to) {
    state.history.push(snapshot());
    state.board[from] = EMPTY; state.board[to] = state.turn;
    context.playSound?.("place");
    if (millAt(state.board, to, state.turn)) afterMill(to, state.turn);
    else nextTurn();
    save(); render();
    return true;
  }

  function pick(idx) {
    if (state.winner) return;
    if (isAi && state.turn === AI) return;
    if (state.phase === "remove") { doRemove(idx); return; }
    if (state.phase === "place") { place(idx); return; }
    // move phase
    const fly = canFly(state.board, state.turn);
    if (state.board[idx] === state.turn) { state.selected = idx; render(); return; }
    if (state.selected >= 0 && state.board[idx] === EMPTY) {
      if (fly || ADJ[state.selected].includes(idx)) move(state.selected, idx);
    }
  }

  function undo() {
    const steps = isAi && state.history.length > 1 ? 2 : 1;
    for (let i = 0; i < steps; i += 1) {
      const prev = state.history.pop();
      if (!prev) break;
      Object.assign(state, prev, { board: [...prev.board], line: [...prev.line] });
    }
    state.winner = ""; reported = false;
    save(); render();
  }

  function restart() {
    state = initialState();
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || !isAi || state.turn !== AI || state.winner) return;
    aiTimer = window.setTimeout(() => {
      if (state.phase === "place") place(aiPlace(state.board, state.placedA, state.placedH, 1));
      else if (state.phase === "move") { const m = aiMove(state.board, context.difficulty); if (m) move(m[0], m[1]); }
    }, 320);
  }

  function render() {
    const fly = !state.winner && state.phase === "move" && canFly(state.board, state.turn);
    const targets = state.selected >= 0 ? (fly ? emptyPoints(state.board) : ADJ[state.selected].filter((i) => state.board[i] === EMPTY)) : [];
    const removeFoe = state.removeBy === HUMAN ? AI : HUMAN;
    const rmSet = state.phase === "remove" ? removable(state.board, removeFoe) : [];
    const thinking = isAi && state.turn === AI && !state.winner;
    const lines = [
      "M0 0 H360 V360 H0 Z", "M60 60 H300 V300 H60 Z", "M120 120 H240 V240 H120 Z",
      "M180 0 V60", "M180 300 V360", "M0 180 H60", "M300 180 H360"
    ].map((d) => `<path d="${d}" />`).join("");
    const dots = COORDS.map(([cx, cy], i) => {
      const x = cx * 60, y = cy * 60;
      const owner = state.board[i];
      const fillSel = state.selected === i ? " is-sel" : "";
      const isT = targets.includes(i) ? " is-target" : "";
      const isW = state.line.includes(i) ? " is-mill" : "";
      const isR = rmSet.includes(i) ? " is-remove" : "";
      const cls = `nm-node${fillSel}${isT}${isW}${isR}`;
      const piece = owner ? `<circle cx="${x}" cy="${y}" r="15" fill="${owner === HUMAN ? "#1b1b1f" : "#f4f4f6"}" stroke="${owner === HUMAN ? "#000" : "#c9c9d2"}" stroke-width="2"/>` : "";
      return `<g class="${cls}" data-pt="${i}" role="button" tabindex="0" aria-label="点 ${i + 1}"><circle class="nm-hit" cx="${x}" cy="${y}" r="17"/>${piece}</g>`;
    }).join("");
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels?.mode || ""} · ${context.labels?.difficulty || ""}${thinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>黑 ${countOn(state.board, HUMAN)} (放${state.placedH})</span>
          <span>白 ${countOn(state.board, AI)} (放${state.placedA})</span>
        </div>
      </section>
      <section class="board-wrap">
        <svg viewBox="0 0 360 360" width="100%" style="max-width:360px;display:block;margin:0 auto;background:#caa45a;border-radius:12px;touch-action:manipulation" aria-label="九子棋棋盘">
          <g stroke="#5b4423" stroke-width="3" fill="none">${lines}</g>
          ${dots}
        </svg>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
      <style>
        .nm-node{cursor:pointer}
        .nm-hit{fill:transparent}
        .nm-node.is-target .nm-hit{fill:rgba(46,160,67,.45)}
        .nm-node.is-sel .nm-hit{fill:rgba(255,255,255,.35);stroke:#2ea043;stroke-width:2}
        .nm-node.is-remove .nm-hit{fill:rgba(220,60,60,.4)}
        .nm-node.is-mill circle:last-child{stroke:#f5c518;stroke-width:3}
      </style>`;
    root.querySelectorAll("[data-pt]").forEach((g) => {
      const idx = Number(g.dataset.pt);
      const act = () => pick(idx);
      g.addEventListener("click", act);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    scheduleAi();
  }

  updateMessage();
  render();

  return () => { disposed = true; clearTimeout(aiTimer); };
}
