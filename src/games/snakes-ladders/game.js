import { loadState, removeState, saveState } from "../../utils/storage.js";
import { clamp } from "../../utils/random.js";

const SIZE = 10;
const GOAL = SIZE * SIZE; // 100
const P1 = 0; // 玩家 / 人类
const P2 = 1; // 对手 / AI

// 蛇梯字典: 起点 -> 终点。终点 > 起点 为梯子, < 起点 为蛇
const JUMPS = {
  1: 38,
  4: 14,
  9: 31,
  16: 6,
  21: 42,
  28: 84,
  36: 44,
  47: 26,
  49: 11,
  51: 67,
  56: 53,
  62: 19,
  64: 60,
  71: 91,
  80: 100,
  87: 24,
  93: 73,
  95: 75,
  98: 78
};

const TOKENS = ["🔴", "🔵"];
const COLORS = ["#ef4444", "#3b82f6"];

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function initialState() {
  return {
    pos: [0, 0],
    turn: P1,
    die: 0,
    winner: -1,
    rolls: 0,
    message: "点骰子，你先走"
  };
}

function isValidState(state) {
  return Array.isArray(state?.pos) && state.pos.length === 2 && typeof state.turn === "number";
}

// 单格坐标 1..100 -> 行列（蛇形布盘，1 在左下角）
function cellToRC(cell) {
  const idx = cell - 1;
  const row = Math.floor(idx / SIZE);
  const colInRow = idx % SIZE;
  const col = row % 2 === 0 ? colInRow : SIZE - 1 - colInRow;
  const visualRow = SIZE - 1 - row;
  return { row: visualRow, col };
}

function playerName(p) {
  return p === P1 ? "你" : "对手";
}

function serialize(state) {
  return { pos: [...state.pos], turn: state.turn, die: state.die, winner: state.winner, rolls: state.rolls, message: state.message };
}

function restoreFromSnapshot(snapshot) {
  if (!isValidState(snapshot)) return null;
  return { ...initialState(), ...snapshot, pos: [...snapshot.pos] };
}

export function mountSnakesLadders(root, context) {
  const mode = context?.mode === "local" ? "local" : "ai";
  const storageKey = `snakes-ladders:${mode}`;
  const labels = context?.labels || {};

  const initial = (context?.savedState && restoreFromSnapshot(context.savedState))
    || (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValidState(legacy) ? restoreFromSnapshot(legacy) : initialState();
    })();

  let state = initial;
  let disposed = false;
  let animating = false;
  let resultReported = false;
  const timers = new Set();

  function delay(fn, ms) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  }

  function save() {
    saveState(storageKey, serialize(state));
    if (state.winner < 0) {
      context?.saveSession?.(serialize(state), { stage: `进行中 · ${state.rolls} 步`, level: state.rolls, score: Math.max(...state.pos) });
    } else {
      context?.clearSession?.();
    }
  }

  function reportResult() {
    if (resultReported || state.winner < 0) return;
    resultReported = true;
    const outcome = mode === "ai" ? (state.winner === P1 ? "win" : "loss") : "complete";
    context?.reportResult?.({ outcome, detail: state.message, moves: state.rolls });
  }

  function applyJump(player) {
    const target = JUMPS[state.pos[player]];
    if (!target) { endTurn(player); return; }
    const climbed = target > state.pos[player];
    state.pos[player] = target;
    state.message = `${playerName(player)} ${climbed ? "踩到梯子，向上爬！" : "被蛇咬，下滑了"}`;
    context?.playSound?.(climbed ? "good" : "bad");
    render();
    delay(() => endTurn(player), 480);
  }

  function endTurn(player) {
    if (state.pos[player] >= GOAL) {
      state.pos[player] = GOAL;
      state.winner = player;
      state.message = `${playerName(player)} 到达 100，获胜！`;
      animating = false;
      save();
      reportResult();
      render();
      return;
    }
    state.turn = player === P1 ? P2 : P1;
    state.message = `轮到${playerName(state.turn)}投骰`;
    animating = false;
    save();
    render();
    maybeAi();
  }

  function stepToward(player, target, value) {
    if (state.pos[player] >= target) {
      delay(() => applyJump(player), 220);
      return;
    }
    state.pos[player] = Math.min(GOAL, state.pos[player] + 1);
    render();
    delay(() => stepToward(player, target, value), 140);
  }

  function roll() {
    if (state.winner >= 0 || animating) return;
    if (mode === "ai" && state.turn !== P1) return;
    const value = rollDie();
    state.die = value;
    state.rolls += 1;
    const target = clamp(state.pos[state.turn] + value, 0, GOAL);
    state.message = `${playerName(state.turn)} 掷出 ${value}`;
    animating = true;
    render();
    delay(() => stepToward(state.turn, target, value), 260);
  }

  function maybeAi() {
    if (disposed || mode !== "ai" || state.turn !== P2 || state.winner >= 0) return;
    delay(roll, 700);
  }

  function restart() {
    clearTimers();
    state = initialState();
    animating = false;
    resultReported = false;
    removeState(storageKey);
    context?.clearSession?.();
    render();
  }

  function tileColor(cell) {
    const t = JUMPS[cell];
    if (t && t > cell) return "rgba(34,197,94,0.16)";
    if (t && t < cell) return "rgba(239,68,68,0.14)";
    return "rgba(148,163,184,0.06)";
  }

  function render() {
    const cells = [];
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        cells.push(0);
      }
    }
    const grid = cells.map((_, gi) => {
      const row = Math.floor(gi / SIZE);
      const col = gi % SIZE;
      const fromBottom = SIZE - 1 - row;
      const colInRow = fromBottom % 2 === 0 ? col : SIZE - 1 - col;
      const cell = fromBottom * SIZE + colInRow + 1;
      const j = JUMPS[cell];
      const here = [];
      if (state.pos[P1] === cell) here.push(TOKENS[P1]);
      if (state.pos[P2] === cell) here.push(TOKENS[P2]);
      const mark = j ? (j > cell ? "🪜" : "🐍") : "";
      return `<div style="position:relative;background:${tileColor(cell)};border:1px solid rgba(148,163,184,0.22);border-radius:6px;display:flex;align-items:flex-start;justify-content:flex-start;font-size:10px;color:#94a3b8;padding:2px;min-height:30px;">
        <span>${cell}</span>
        <span style="position:absolute;right:2px;bottom:1px;font-size:12px;">${mark}</span>
        <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;letter-spacing:-4px;">${here.join("")}</span>
      </div>`;
    }).join("");

    const yourTurn = state.winner < 0 && !animating && (mode === "local" || state.turn === P1);

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${labels.mode || (mode === "ai" ? "对战 AI" : "本地双人")} · ${labels.difficulty || "经典 10×10"}</p>
        </div>
        <div class="mini-stats">
          <span style="color:${COLORS[P1]}">${TOKENS[P1]} ${state.pos[P1]}</span>
          <span style="color:${COLORS[P2]}">${TOKENS[P2]} ${state.pos[P2]}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${SIZE},1fr);gap:3px;width:100%;max-width:420px;margin:0 auto;">${grid}</div>
      </section>

      <section class="game-panel toolbar" style="align-items:center;gap:12px;">
        <button class="primary-button" data-action="roll" ${yourTurn ? "" : "disabled"} style="min-width:120px;">🎲 ${state.die || "投骰"}</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelector("[data-action='roll']").addEventListener("click", roll);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  maybeAi();

  return () => {
    disposed = true;
    clearTimers();
  };
}
