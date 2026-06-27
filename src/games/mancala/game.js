import { choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

// 棋盘 14 个坑：0-5 玩家小坑 / 6 玩家大库 / 7-12 AI 小坑 / 13 AI 大库
// 逆时针撒子，落入自己大库再走一回合，落入自己空坑可吃对面。
const HUMAN = "human";
const AI = "ai";
const HUMAN_STORE = 6;
const AI_STORE = 13;
const PER_PIT = 4;

const DEPTH = { easy: 1, medium: 3, hard: 6, devil: 8 };

function initialBoard() {
  const pits = Array(14).fill(PER_PIT);
  pits[HUMAN_STORE] = 0;
  pits[AI_STORE] = 0;
  return pits;
}

function initialState() {
  return {
    pits: initialBoard(),
    turn: HUMAN,
    winner: "",
    message: "你先手 · 选一个坑撒子",
    moves: 0
  };
}

function isValidState(state) {
  return Array.isArray(state?.pits) && state.pits.length === 14;
}

function isHumanPit(i) {
  return i >= 0 && i <= 5;
}
function isAiPit(i) {
  return i >= 7 && i <= 12;
}
function opposite(i) {
  return 12 - i;
}

function legalMoves(pits, player) {
  const range = player === HUMAN ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
  return range.filter((i) => pits[i] > 0);
}

// 撒子一步，返回新棋盘 + 是否额外回合，传入坑必须非空。
function applyMove(pits, player, pit) {
  const next = [...pits];
  let seeds = next[pit];
  next[pit] = 0;
  let i = pit;
  const ownStore = player === HUMAN ? HUMAN_STORE : AI_STORE;
  const foeStore = player === HUMAN ? AI_STORE : HUMAN_STORE;
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === foeStore) continue; // 跳过对方大库
    next[i] += 1;
    seeds -= 1;
  }
  // 吃子：最后一颗落在己方空坑，且对面有子
  const ownPit = player === HUMAN ? isHumanPit(i) : isAiPit(i);
  if (ownPit && next[i] === 1) {
    const opp = opposite(i);
    if (next[opp] > 0) {
      next[ownStore] += next[opp] + 1;
      next[opp] = 0;
      next[i] = 0;
    }
  }
  return { pits: next, extra: i === ownStore };
}

function sideEmpty(pits, player) {
  return legalMoves(pits, player).length === 0;
}

// 一方走空即结束，对面剩子全归自己。返回 null 表示未结束。
function settleIfOver(pits) {
  const humanDone = sideEmpty(pits, HUMAN);
  const aiDone = sideEmpty(pits, AI);
  if (!humanDone && !aiDone) return null;
  const out = [...pits];
  let h = out[HUMAN_STORE];
  let a = out[AI_STORE];
  for (let i = 0; i <= 5; i += 1) { h += out[i]; out[i] = 0; }
  for (let i = 7; i <= 12; i += 1) { a += out[i]; out[i] = 0; }
  out[HUMAN_STORE] = h;
  out[AI_STORE] = a;
  return out;
}

function minimax(pits, player, depth, alpha, beta) {
  const finished = settleIfOver(pits);
  const board = finished || pits;
  if (finished || depth <= 0) {
    return { score: board[AI_STORE] - board[HUMAN_STORE], pit: -1 };
  }
  const moves = legalMoves(board, player);
  if (!moves.length) return { score: board[AI_STORE] - board[HUMAN_STORE], pit: -1 };
  let best = -1;
  if (player === AI) {
    let value = -Infinity;
    for (const pit of moves) {
      const res = applyMove(board, AI, pit);
      const child = minimax(res.pits, res.extra ? AI : HUMAN, depth - 1, alpha, beta);
      if (child.score > value) { value = child.score; best = pit; }
      alpha = Math.max(alpha, value);
      if (beta <= alpha) break;
    }
    return { score: value, pit: best };
  }
  let value = Infinity;
  for (const pit of moves) {
    const res = applyMove(board, HUMAN, pit);
    const child = minimax(res.pits, res.extra ? HUMAN : AI, depth - 1, alpha, beta);
    if (child.score < value) { value = child.score; best = pit; }
    beta = Math.min(beta, value);
    if (beta <= alpha) break;
  }
  return { score: value, pit: best };
}

function chooseAiMove(pits, difficulty) {
  const moves = legalMoves(pits, AI);
  if (!moves.length) return -1;
  if (difficulty === "easy" && Math.random() < 0.5) return choice(moves);
  const depth = DEPTH[difficulty] ?? 3;
  const pick = minimax(pits, AI, depth, -Infinity, Infinity).pit;
  return pick >= 0 ? pick : choice(moves);
}

export function mountMancala(root, context) {
  const storageKey = `mancala:${context.mode}`;
  const restore = (snap) => (snap && isValidState(snap)
    ? { ...initialState(), ...snap, pits: [...snap.pits] }
    : null);
  let state = restore(context.savedState)
    || restore(loadState(storageKey, null))
    || initialState();

  let disposed = false;
  let aiTimer = 0;
  let busy = false;
  let reported = false;

  function save() {
    saveState(storageKey, state);
    if (state.winner) context.clearSession?.();
    else context.saveSession?.({ pits: [...state.pits], turn: state.turn, moves: state.moves },
      { stage: `进行中 · ${state.moves} 步`, level: state.moves, score: state.pits[HUMAN_STORE] });
  }

  function report() {
    if (reported || !state.winner) return;
    reported = true;
    const outcome = state.winner === "draw"
      ? "draw"
      : context.mode === "ai"
      ? (state.winner === HUMAN ? "win" : "loss")
      : "complete";
    context.reportResult?.({ outcome, detail: state.message, score: state.pits[HUMAN_STORE], moves: state.moves });
  }

  function finalize() {
    const settled = settleIfOver(state.pits);
    if (!settled) return false;
    state.pits = settled;
    const h = settled[HUMAN_STORE];
    const a = settled[AI_STORE];
    state.winner = h === a ? "draw" : h > a ? HUMAN : AI;
    state.message = h === a ? `平局 ${h} : ${a}` : state.winner === HUMAN ? `你赢了 ${h} : ${a}` : `AI 赢了 ${a} : ${h}`;
    report();
    return true;
  }

  function step(player, pit) {
    const res = applyMove(state.pits, player, pit);
    state.pits = res.pits;
    state.moves += 1;
    if (finalize()) return;
    if (res.extra) {
      state.message = player === HUMAN ? "再走一回合！" : "AI 再走一回合";
    } else {
      state.turn = player === HUMAN ? AI : HUMAN;
      state.message = state.turn === HUMAN ? "轮到你" : "AI 思考中";
    }
  }

  function humanPlay(pit) {
    if (busy || state.winner || state.pits[pit] === 0) return;
    const player = state.turn;
    const ownPit = player === HUMAN ? isHumanPit(pit) : isAiPit(pit);
    if (!ownPit) return;
    if (context.mode === "ai" && player !== HUMAN) return; // ai 模式不许点 AI 坑
    busy = true;
    context.playSound?.("move");
    step(player, pit);
    save();
    render();
    if (context.mode === "ai" && state.turn === AI && !state.winner) {
      aiTimer = window.setTimeout(runAi, 460);
    } else {
      busy = false;
    }
  }

  function runAi() {
    if (disposed || state.winner) { busy = false; return; }
    const pit = chooseAiMove(state.pits, context.difficulty);
    if (pit < 0) { busy = false; return; }
    step(AI, pit);
    save();
    render();
    if (state.turn === AI && !state.winner) aiTimer = window.setTimeout(runAi, 460);
    else busy = false;
  }

  function restart() {
    clearTimeout(aiTimer);
    state = initialState();
    busy = false;
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    if (context.mode === "local") state.message = "蓝方先手 · 选一个坑";
    render();
  }

  function pitButton(i) {
    const ownSide = state.turn === HUMAN ? isHumanPit(i) : isAiPit(i);
    // ai 模式只有玩家小坑可点；local 模式当前回合的小坑都可点
    const playable = context.mode === "ai" ? isHumanPit(i) : ownSide;
    const active = !state.winner && ownSide && playable && state.pits[i] > 0;
    return `<button type="button" class="mancala-pit" data-pit="${i}" ${active ? "" : "disabled"}
      style="min-height:40px;min-width:32px;width:100%;aspect-ratio:1;border-radius:50%;border:2px solid rgba(255,255,255,.18);
      background:${active ? "rgba(99,179,237,.28)" : "rgba(255,255,255,.06)"};color:#fff;font-size:18px;font-weight:600;cursor:${active ? "pointer" : "default"}">
      ${state.pits[i]}</button>`;
  }

  function render() {
    const thinking = context.mode === "ai" && state.turn === AI && !state.winner;
    const aiRow = [12, 11, 10, 9, 8, 7];
    const humanRow = [0, 1, 2, 3, 4, 5];
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty}${thinking ? " · AI 思考中" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>你 ${state.pits[HUMAN_STORE]}</span>
          <span>${context.mode === "ai" ? "AI" : "对手"} ${state.pits[AI_STORE]}</span>
        </div>
      </section>
      <section class="board-wrap">
        <div style="display:flex;gap:8px;align-items:stretch;max-width:360px;margin:0 auto">
          <div style="flex:0 0 38px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:rgba(255,255,255,.06);font-weight:700;color:#fff">${state.pits[AI_STORE]}</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${aiRow.map(pitButton).join("")}</div>
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${humanRow.map(pitButton).join("")}</div>
          </div>
          <div style="flex:0 0 38px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:rgba(99,179,237,.18);font-weight:700;color:#fff">${state.pits[HUMAN_STORE]}</div>
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-pit]").forEach((btn) => {
      btn.addEventListener("click", () => humanPlay(Number(btn.dataset.pit)));
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  if (context.mode === "ai" && state.turn === AI && !state.winner) {
    busy = true;
    aiTimer = window.setTimeout(runAi, 460);
  }

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
  };
}
