import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

// 六贯棋 (Hex)：菱形蜂窝棋盘，连通自己两条对边者胜。
// HUMAN(红) 连通上下两边，AI(蓝) 连通左右两边。Hex 不可能平局。
const EMPTY = "";
const HUMAN = "R"; // 红：上下
const AI = "B"; // 蓝：左右
const DESKTOP_SIZE = 11;
const MOBILE_SIZE = 9;
// 六个邻接方向（带偏移的菱形坐标系）
const NEIGHBORS = [
  [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]
];

function boardSize() {
  const wide = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(min-width: 560px)").matches;
  return wide ? DESKTOP_SIZE : MOBILE_SIZE;
}

function idx(size, r, c) {
  return r * size + c;
}

function inBounds(size, r, c) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function initialState(size) {
  return {
    size,
    board: Array(size * size).fill(EMPTY),
    turn: HUMAN,
    winner: "",
    path: [],
    history: [],
    message: "红方先手 · 连通上下两边获胜"
  };
}

function isValidState(state) {
  return state
    && Number.isInteger(state.size)
    && Array.isArray(state.board)
    && state.board.length === state.size * state.size
    && Array.isArray(state.history);
}

function available(board) {
  return board.flatMap((cell, i) => (cell ? [] : [i]));
}

// 红连通行 0↔size-1，蓝连通列 0↔size-1。BFS 找通路，返回胜方路径。
function winnerPath(size, board, player) {
  const target = player === HUMAN ? "row" : "col";
  const seen = new Set();
  const prev = new Map();
  const queue = [];
  for (let i = 0; i < size; i += 1) {
    const r = target === "row" ? 0 : i;
    const c = target === "row" ? i : 0;
    if (board[idx(size, r, c)] === player) {
      const k = idx(size, r, c);
      seen.add(k);
      queue.push(k);
    }
  }
  while (queue.length) {
    const cur = queue.shift();
    const r = Math.floor(cur / size);
    const c = cur % size;
    const reached = target === "row" ? r === size - 1 : c === size - 1;
    if (reached) {
      const path = [];
      let n = cur;
      while (n !== undefined) {
        path.push(n);
        n = prev.get(n);
      }
      return path;
    }
    for (const [dr, dc] of NEIGHBORS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(size, nr, nc)) continue;
      const k = idx(size, nr, nc);
      if (seen.has(k) || board[k] !== player) continue;
      seen.add(k);
      prev.set(k, cur);
      queue.push(k);
    }
  }
  return null;
}

// 启发式：以 0/1/2 权重做 Dijkstra 估算连边代价，空格 1、己子 0、敌子 ∞。
function pathCost(size, board, player) {
  const target = player === HUMAN ? "row" : "col";
  const dist = Array(size * size).fill(Infinity);
  const order = [];
  for (let i = 0; i < size; i += 1) {
    const r = target === "row" ? 0 : i;
    const c = target === "row" ? i : 0;
    const k = idx(size, r, c);
    if (board[k] === player) dist[k] = 0;
    else if (board[k] === EMPTY) dist[k] = 1;
    if (dist[k] < Infinity) order.push(k);
  }
  const pq = order.map((k) => [dist[k], k]);
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, cur] = pq.shift();
    if (d > dist[cur]) continue;
    const r = Math.floor(cur / size);
    const c = cur % size;
    if ((target === "row" ? r === size - 1 : c === size - 1)) return d;
    for (const [dr, dc] of NEIGHBORS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(size, nr, nc)) continue;
      const k = idx(size, nr, nc);
      const cell = board[k];
      if (cell !== EMPTY && cell !== player) continue;
      const w = cell === player ? 0 : 1;
      if (d + w < dist[k]) {
        dist[k] = d + w;
        pq.push([dist[k], k]);
      }
    }
  }
  return Infinity;
}

function chooseAiMove(size, board, difficulty) {
  const moves = available(board);
  if (!moves.length) return -1;
  if (difficulty === "easy") return choice(moves);
  // 速胜检测
  for (const m of moves) {
    board[m] = AI;
    const win = winnerPath(size, board, AI);
    board[m] = EMPTY;
    if (win) return m;
  }
  // 拦截对手速胜
  for (const m of moves) {
    board[m] = HUMAN;
    const lose = winnerPath(size, board, HUMAN);
    board[m] = EMPTY;
    if (lose) return m;
  }
  // 评估：最大化 (对手代价 - 己方代价)，中庸难度仅采样，魔王全扫
  const pool = difficulty === "medium" && moves.length > 24
    ? moves.slice().sort(() => Math.random() - 0.5).slice(0, 24)
    : moves;
  let best = -1;
  let bestScore = -Infinity;
  for (const m of pool) {
    board[m] = AI;
    const self = pathCost(size, board, AI);
    const opp = pathCost(size, board, HUMAN);
    board[m] = EMPTY;
    const score = opp - self + (Math.random() - 0.5) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best >= 0 ? best : choice(moves);
}

function serialize(state) {
  return {
    size: state.size,
    board: [...state.board],
    turn: state.turn,
    winner: state.winner,
    path: [...state.path],
    history: state.history.map((h) => [...h]),
    message: state.message
  };
}

function restoreFrom(snap) {
  if (!snap || !isValidState(snap)) return null;
  const fresh = initialState(snap.size);
  return {
    ...fresh,
    ...snap,
    board: [...snap.board],
    path: [...(snap.path || [])],
    history: Array.isArray(snap.history) ? snap.history.map((h) => [...h]) : []
  };
}

function metaFor(state) {
  const placed = state.board.filter(Boolean).length;
  return {
    stage: state.winner ? `已结束 · ${placed} 手` : `进行中 · ${placed} 手`,
    level: placed,
    score: placed
  };
}

export function mountHex(root, context) {
  const ctx = context || {};
  const mode = ctx.mode === "ai" ? "ai" : "local";
  const labels = ctx.labels || { mode: mode === "ai" ? "人机" : "本地双人", difficulty: "标准" };
  const storageKey = `hex:${mode}`;

  const restored = (ctx.savedState && restoreFrom(ctx.savedState))
    || (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValidState(legacy) ? restoreFrom(legacy) : null;
    })();
  let state = restored || initialState(boardSize());

  let disposed = false;
  let aiTimer = 0;
  let resultReported = false;

  function save() {
    saveState(storageKey, serialize(state));
    if (state.winner) ctx.clearSession?.();
    else ctx.saveSession?.(serialize(state), metaFor(state));
  }

  function reportResult() {
    if (resultReported || !state.winner) return;
    resultReported = true;
    const outcome = mode === "ai"
      ? state.winner === HUMAN ? "win" : "loss"
      : "complete";
    ctx.reportResult?.({
      outcome,
      detail: state.message,
      moves: state.board.filter(Boolean).length
    });
  }

  function finish() {
    const win = winnerPath(state.size, state.board, state.turn === HUMAN ? AI : HUMAN);
    if (win) {
      state.winner = win[0] !== undefined ? state.board[win[0]] : state.turn;
      state.path = win;
      state.message = `${state.winner === HUMAN ? "红方" : "蓝方"}连通获胜`;
      ctx.playSound?.("win");
      reportResult();
    }
  }

  function play(i) {
    if (state.winner || state.board[i]) return false;
    state.history.push([...state.board]);
    state.board[i] = state.turn;
    finish();
    if (!state.winner) {
      state.turn = state.turn === HUMAN ? AI : HUMAN;
      state.message = `轮到${state.turn === HUMAN ? "红方（上下）" : "蓝方（左右）"}`;
    }
    save();
    render();
    return true;
  }

  function restart() {
    state = initialState(state.size);
    resultReported = false;
    removeState(storageKey);
    ctx.clearSession?.();
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || mode !== "ai" || state.turn !== AI || state.winner) return;
    aiTimer = window.setTimeout(() => {
      if (disposed) return;
      const move = chooseAiMove(state.size, state.board, ctx.difficulty);
      if (move >= 0) play(move);
    }, 220);
  }

  function render() {
    const size = state.size;
    const thinking = mode === "ai" && state.turn === AI && !state.winner;
    const reds = state.board.filter((c) => c === HUMAN).length;
    const blues = state.board.filter((c) => c === AI).length;

    // 几何：尖顶六边形菱形排列；总宽限制在 360 内
    const dx = 1.0; // 列水平步进（单位 r）
    const skew = 0.5; // 每行右移
    const dy = 0.85; // 行垂直步进
    const cols = size + (size - 1) * skew;
    const r = 360 / (cols * 2 + 2);
    const cw = r * 2;
    const W = (cols * cw) + cw;
    const H = (size - 1) * dy * cw + cw * 2;
    const cx = (rr, cc) => cw + cc * dx * cw + rr * skew * cw + r;
    const cy = (rr) => cw + rr * dy * cw + r;
    const hexPts = (gx, gy) => {
      let s = "";
      for (let a = 0; a < 6; a += 1) {
        const ang = Math.PI / 180 * (60 * a - 30);
        s += `${(gx + r * Math.cos(ang)).toFixed(1)},${(gy + r * Math.sin(ang)).toFixed(1)} `;
      }
      return s.trim();
    };

    const cells = [];
    for (let rr = 0; rr < size; rr += 1) {
      for (let cc = 0; cc < size; cc += 1) {
        const i = idx(size, rr, cc);
        const v = state.board[i];
        const won = state.path.includes(i);
        const fill = v === HUMAN ? "#e2574c" : v === AI ? "#3f78d8" : "rgba(255,255,255,.05)";
        cells.push(`<polygon points="${hexPts(cx(rr, cc), cy(rr))}" fill="${fill}" stroke="${won ? "#ffd54a" : "rgba(255,255,255,.18)"}" stroke-width="${won ? 2.2 : 1}" data-cell="${i}" style="cursor:${v || state.winner ? "default" : "pointer"}"/>`);
      }
    }
    // 边缘色条
    const edge = (pts, col) => `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="3" opacity=".7"/>`;
    const topL = `${cx(0, 0)},${cy(0) - r} ${cx(0, size - 1)},${cy(0) - r}`;
    const botL = `${cx(size - 1, 0)},${cy(size - 1) + r} ${cx(size - 1, size - 1)},${cy(size - 1) + r}`;
    const leftL = `${cx(0, 0) - r},${cy(0)} ${cx(size - 1, 0) - r},${cy(size - 1)}`;
    const rightL = `${cx(0, size - 1) + r},${cy(0)} ${cx(size - 1, size - 1) + r},${cy(size - 1)}`;

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${labels.mode} · ${labels.difficulty}${thinking ? " · AI 思考中" : ""} · ${size}×${size}</p>
        </div>
        <div class="mini-stats">
          <span style="color:#e2574c">红 ${reds}</span>
          <span style="color:#3f78d8">蓝 ${blues}</span>
        </div>
      </section>
      <section class="board-wrap" style="display:flex;justify-content:center">
        <svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" style="width:100%;max-width:360px;touch-action:manipulation" aria-label="六贯棋棋盘">
          ${edge(topL, "#e2574c")}${edge(botL, "#e2574c")}${edge(leftL, "#3f78d8")}${edge(rightL, "#3f78d8")}
          ${cells.join("")}
        </svg>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((el) => {
      el.addEventListener("click", () => {
        if (mode === "ai" && state.turn === AI) return;
        play(Number(el.dataset.cell));
      });
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    scheduleAi();
  }

  render();

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
  };
}
