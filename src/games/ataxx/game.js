import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 7;
const TOTAL = SIZE * SIZE;
const EMPTY = "";
const HUMAN = "R"; // 红方（玩家）
const AI = "B"; // 蓝方（对手）

function initialBoard() {
  const board = Array(TOTAL).fill(EMPTY);
  board[idx(0, 0)] = HUMAN;
  board[idx(SIZE - 1, SIZE - 1)] = HUMAN;
  board[idx(0, SIZE - 1)] = AI;
  board[idx(SIZE - 1, 0)] = AI;
  return board;
}

function idx(r, c) {
  return r * SIZE + c;
}

function rc(index) {
  return [Math.floor(index / SIZE), index % SIZE];
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function opponent(player) {
  return player === HUMAN ? AI : HUMAN;
}

function initialState() {
  return {
    board: initialBoard(),
    turn: HUMAN,
    selected: -1,
    winner: "",
    message: "选中你的棋子，再点目标格"
  };
}

function isValidState(state) {
  return state?.board?.length === TOTAL && typeof state.turn === "string";
}

function count(board, player) {
  let n = 0;
  for (let i = 0; i < board.length; i += 1) if (board[i] === player) n += 1;
  return n;
}

// 距离 1 = 克隆，距离 2 = 跳跃。返回起点到合法落点的偏移列表
function legalDestinations(board, from) {
  const [fr, fc] = rc(from);
  const dests = [];
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = fr + dr;
      const c = fc + dc;
      if (!inBounds(r, c)) continue;
      const to = idx(r, c);
      if (board[to] !== EMPTY) continue;
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      dests.push({ to, dist });
    }
  }
  return dests;
}

function hasAnyMove(board, player) {
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === player && legalDestinations(board, i).length) return true;
  }
  return false;
}

function applyMove(board, from, to, player) {
  const next = [...board];
  const dist = Math.max(Math.abs(rc(from)[0] - rc(to)[0]), Math.abs(rc(from)[1] - rc(to)[1]));
  if (dist === 2) next[from] = EMPTY; // 跳跃：源格清空
  next[to] = player; // 克隆/跳跃后落子
  const [tr, tc] = rc(to);
  const foe = opponent(player);
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = tr + dr;
      const c = tc + dc;
      if (!inBounds(r, c)) continue;
      if (next[idx(r, c)] === foe) next[idx(r, c)] = player; // 同化相邻敌子
    }
  }
  return next;
}

function allMoves(board, player) {
  const moves = [];
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] !== player) continue;
    for (const dest of legalDestinations(board, i)) {
      moves.push({ from: i, to: dest.to, dist: dest.dist });
    }
  }
  return moves;
}

function isFull(board) {
  return !board.includes(EMPTY);
}

function gameOver(board) {
  return isFull(board) || (!hasAnyMove(board, HUMAN) && !hasAnyMove(board, AI));
}

// 评估：AI 子数 - 玩家子数（正值对 AI 有利）
function evaluate(board) {
  return count(board, AI) - count(board, HUMAN);
}

function scoreMove(board, move, player) {
  const next = applyMove(board, move.from, move.to, player);
  return count(next, player) - count(next, opponent(player));
}

function greedyMove(board, player) {
  const moves = allMoves(board, player);
  if (!moves.length) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const s = scoreMove(board, move, player) - move.dist * 0.5; // 偏好克隆
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  return best;
}

function minimax(board, player, depth, alpha, beta) {
  if (depth === 0 || gameOver(board)) return { score: evaluate(board), move: null };
  const moves = allMoves(board, player);
  if (!moves.length) return minimax(board, opponent(player), depth - 1, alpha, beta);
  const maximizing = player === AI;
  let best = null;
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const next = applyMove(board, move.from, move.to, player);
    const child = minimax(next, opponent(player), depth - 1, alpha, beta).score;
    if (maximizing ? child > bestScore : child < bestScore) {
      bestScore = child;
      best = move;
    }
    if (maximizing) alpha = Math.max(alpha, bestScore);
    else beta = Math.min(beta, bestScore);
    if (beta <= alpha) break;
  }
  return { score: bestScore, move: best };
}

function chooseAiMove(board, difficulty) {
  const moves = allMoves(board, AI);
  if (!moves.length) return null;
  if (difficulty === "easy") return choice(moves);
  if (difficulty === "medium") return greedyMove(board, AI);
  const depth = difficulty === "devil" ? 4 : 3;
  return minimax(board, AI, depth, -Infinity, Infinity).move || greedyMove(board, AI);
}

export function mountAtaxx(root, context) {
  const storageKey = `ataxx:${context.mode}`;
  const restored = context.savedState && isValidState(context.savedState) ? context.savedState : loadState(storageKey, null);
  let state = restored && isValidState(restored)
    ? { ...initialState(), ...restored, board: [...restored.board], selected: -1 }
    : initialState();

  let disposed = false;
  let aiTimer = 0;
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
    if (state.winner) context.clearSession?.();
    else context.saveSession?.(serialize(), { stage: `${count(state.board, HUMAN)}:${count(state.board, AI)}`, level: 1, score: count(state.board, HUMAN) });
  }

  function serialize() {
    return { board: [...state.board], turn: state.turn, winner: state.winner, message: state.message };
  }

  function reportResult() {
    if (resultReported || !state.winner) return;
    resultReported = true;
    const me = count(state.board, HUMAN);
    const foe = count(state.board, AI);
    const outcome = state.winner === "draw" ? "draw" : context.mode === "ai" ? (state.winner === HUMAN ? "win" : "loss") : "complete";
    context.reportResult?.({ outcome, detail: `红 ${me} : 蓝 ${foe}`, score: me, moves: TOTAL - count(state.board, EMPTY) });
  }

  function finishIfOver() {
    if (!gameOver(state.board)) return false;
    const me = count(state.board, HUMAN);
    const foe = count(state.board, AI);
    state.winner = me === foe ? "draw" : me > foe ? HUMAN : AI;
    state.message = state.winner === "draw" ? `平局 红 ${me} : 蓝 ${foe}` : `${state.winner === HUMAN ? "红方" : "蓝方"}胜 红 ${me} : 蓝 ${foe}`;
    context.playSound?.(state.winner === HUMAN ? "win" : "lose");
    reportResult();
    return true;
  }

  function passIfStuck() {
    if (!hasAnyMove(state.board, state.turn)) {
      state.turn = opponent(state.turn);
      state.message = `${state.turn === HUMAN ? "红方" : "蓝方"}无步可走，跳过`;
    }
  }

  function commitMove(from, to, player) {
    state.board = applyMove(state.board, from, to, player);
    state.selected = -1;
    state.turn = opponent(player);
    if (finishIfOver()) return;
    passIfStuck();
    if (!finishIfOver()) {
      state.message = state.turn === HUMAN ? "轮到红方" : "蓝方思考中";
    }
  }

  function onCell(index) {
    if (state.winner) return;
    if (context.mode === "ai" && state.turn === AI) return;
    const player = state.turn;
    if (state.board[index] === player) {
      state.selected = index;
      state.message = "再点高亮目标格";
      render();
      return;
    }
    if (state.selected >= 0 && state.board[index] === EMPTY) {
      const ok = legalDestinations(state.board, state.selected).some((d) => d.to === index);
      if (!ok) return;
      commitMove(state.selected, index, player);
      save();
      render();
    }
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || context.mode !== "ai" || state.turn !== AI || state.winner) return;
    aiTimer = window.setTimeout(() => {
      if (context.isPaused?.()) { scheduleAi(); return; }
      const move = chooseAiMove(state.board, context.difficulty);
      if (move) commitMove(move.from, move.to, AI);
      else { state.turn = HUMAN; passIfStuck(); finishIfOver(); }
      save();
      render();
    }, context.difficulty === "easy" ? 200 : 360);
  }

  function restart() {
    state = initialState();
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function targets() {
    return state.selected >= 0 && !state.winner ? new Set(legalDestinations(state.board, state.selected).map((d) => d.to)) : new Set();
  }

  function render() {
    const me = count(state.board, HUMAN);
    const foe = count(state.board, AI);
    const dests = targets();
    root.innerHTML = `
      <section class="game-panel game-status">
        <div><strong>${state.message}</strong><p class="game-note">${context.labels?.mode ?? ""} · ${context.labels?.difficulty ?? ""}</p></div>
        <div class="mini-stats"><span>红 ${me}</span><span>蓝 ${foe}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${SIZE},1fr);gap:4px;width:100%;max-width:360px;margin:0 auto;aspect-ratio:1;">
          ${state.board.map((cell, i) => {
            const sel = i === state.selected;
            const dest = dests.has(i);
            const bg = cell === HUMAN ? "#e4572e" : cell === AI ? "#2a72d4" : dest ? "rgba(80,200,120,.35)" : "rgba(255,255,255,.06)";
            return `<button type="button" data-cell="${i}" aria-label="格${i}" style="aspect-ratio:1;border-radius:8px;border:2px solid ${sel ? "#ffd166" : "transparent"};background:${bg};cursor:pointer;font-size:0;padding:0;">·</button>`;
          }).join("")}
        </div>
      </section>
      <section class="game-panel toolbar"><button class="danger-button" data-action="restart">重开</button></section>
    `;
    root.querySelectorAll("[data-cell]").forEach((b) => b.addEventListener("click", () => onCell(Number(b.dataset.cell))));
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    scheduleAi();
  }

  render();
  return () => { disposed = true; clearTimeout(aiTimer); };
}
