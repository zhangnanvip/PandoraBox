import { shuffle } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RED = new Set(["♥", "♦"]);

function isRed(suit) {
  return RED.has(suit);
}

// 一副牌: id 0..51, rank 1..13, suit ♠♥♦♣
function makeDeck() {
  const cards = [];
  for (let s = 0; s < 4; s += 1) {
    for (let r = 1; r <= 13; r += 1) {
      cards.push({ id: s * 13 + r - 1, suit: SUITS[s], rank: r });
    }
  }
  return cards;
}

// FreeCell 几乎所有局都可解; 全发明牌, 标准 8 列发牌 (前 4 列 7 张, 后 4 列 6 张)
function newState() {
  const deck = shuffle(makeDeck());
  const tableau = [[], [], [], [], [], [], [], []];
  for (let i = 0; i < deck.length; i += 1) {
    tableau[i % 8].push({ ...deck[i] });
  }
  return {
    tableau,
    free: [null, null, null, null],
    foundations: [[], [], [], []],
    moves: 0
  };
}

function isValidState(s) {
  if (!s || !Array.isArray(s.tableau) || s.tableau.length !== 8) return false;
  if (!Array.isArray(s.free) || s.free.length !== 4) return false;
  if (!Array.isArray(s.foundations) || s.foundations.length !== 4) return false;
  const total =
    s.tableau.reduce((n, c) => n + c.length, 0) +
    s.foundations.reduce((n, c) => n + c.length, 0) +
    s.free.filter(Boolean).length;
  return total === 52;
}

function clone(s) {
  return {
    tableau: s.tableau.map((col) => col.map((c) => ({ ...c }))),
    free: s.free.map((c) => (c ? { ...c } : null)),
    foundations: s.foundations.map((col) => col.map((c) => ({ ...c }))),
    moves: s.moves
  };
}

function isWon(s) {
  return s.foundations.reduce((n, c) => n + c.length, 0) === 52;
}

// 续牌: 不同色 + 降序
function canStackTableau(card, target) {
  if (!target) return true; // 空列任意牌
  return isRed(card.suit) !== isRed(target.suit) && target.rank === card.rank + 1;
}

function canStackFoundation(card, top) {
  if (!top) return card.rank === 1;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

// 一手能搬几张: (空闲格+1) * 2^(空列), 目标空列时空列数-1
function maxMove(s, destEmpty) {
  const freeCells = s.free.filter((c) => c === null).length;
  let emptyCols = s.tableau.filter((c) => c.length === 0).length;
  if (destEmpty && emptyCols > 0) emptyCols -= 1;
  return (freeCells + 1) * 2 ** emptyCols;
}

// 从 index 起是否构成合法可搬序列 (交替降序)
function isOrderedRun(col, index) {
  for (let i = index; i < col.length - 1; i += 1) {
    if (!canStackTableau(col[i + 1], col[i])) return false;
  }
  return true;
}

export function mountFreecell(root, context) {
  const storageKey = `freecell:${context?.mode || "solo"}`;

  let state =
    (context?.savedState && isValidState(context.savedState) && context.savedState) ||
    (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValidState(legacy) ? legacy : newState();
    })();

  let history = [];
  let selected = null; // { zone:"tableau"|"free", col, index }
  let reported = false;
  let lastTapId = 0;
  let lastTapTime = 0;

  function save() {
    saveState(storageKey, state);
    const done = state.foundations.reduce((n, c) => n + c.length, 0);
    if (!isWon(state)) {
      context?.saveSession?.(clone(state), { stage: `${done}/52`, level: done, score: state.moves });
    } else {
      context?.clearSession?.();
    }
  }

  function pushHistory() {
    history.push(clone(state));
    if (history.length > 300) history.shift();
  }

  function finishIfWon() {
    if (isWon(state) && !reported) {
      reported = true;
      const score = Math.max(100, 1000 - state.moves * 2);
      context?.playSound?.("win");
      context?.reportResult?.({ outcome: "complete", score, moves: state.moves });
      context?.clearSession?.();
    }
  }

  function foundationIndexFor(card) {
    return state.foundations.findIndex((f) => canStackFoundation(card, f[f.length - 1]));
  }

  // 自动把某来源顶牌送基础堆 (双击)
  function autoToFoundation(zone, col) {
    let card;
    if (zone === "free") card = state.free[col];
    else card = state.tableau[col][state.tableau[col].length - 1];
    if (!card) return false;
    const fi = foundationIndexFor(card);
    if (fi < 0) return false;
    pushHistory();
    if (zone === "free") state.free[col] = null;
    else state.tableau[col].pop();
    state.foundations[fi].push(card);
    state.moves += 1;
    selected = null;
    save();
    render();
    finishIfWon();
    return true;
  }

  function tryMove(target) {
    if (!selected) return false;
    const { zone, col, index } = selected;
    let cards;
    if (zone === "free") cards = state.free[col] ? [state.free[col]] : [];
    else cards = state.tableau[col].slice(index);
    if (!cards.length) return false;
    const head = cards[0];

    if (target.zone === "foundation") {
      if (cards.length !== 1) return false;
      const f = state.foundations[target.col];
      if (!canStackFoundation(head, f[f.length - 1])) return false;
      pushHistory();
      if (zone === "free") state.free[col] = null;
      else state.tableau[col].pop();
      f.push(head);
    } else if (target.zone === "free") {
      if (cards.length !== 1 || state.free[target.col]) return false;
      pushHistory();
      if (zone === "free") state.free[col] = null;
      else state.tableau[col].pop();
      state.free[target.col] = head;
    } else {
      const destCol = state.tableau[target.col];
      const destEmpty = destCol.length === 0;
      if (!canStackTableau(head, destCol[destCol.length - 1])) return false;
      if (cards.length > maxMove(state, destEmpty)) return false;
      pushHistory();
      if (zone === "free") { state.free[col] = null; destCol.push(head); }
      else { state.tableau[col].splice(index); destCol.push(...cards); }
    }
    state.moves += 1;
    save();
    finishIfWon();
    return true;
  }

  function handlePick(zone, col, index) {
    const now = Date.now();
    const card = zone === "free" ? state.free[col] : state.tableau[col][state.tableau[col].length - 1];
    const isTopTap = card && (zone === "free" || index === state.tableau[col].length - 1);
    if (isTopTap && card.id === lastTapId && now - lastTapTime < 350) {
      lastTapId = 0;
      if (autoToFoundation(zone, col)) return;
    }
    lastTapId = card ? card.id : 0;
    lastTapTime = now;

    if (!card) { selected = null; render(); return; }
    if (zone === "tableau" && !isOrderedRun(state.tableau[col], index)) { selected = null; render(); return; }
    if (!selected) {
      selected = { zone, col, index };
    } else {
      const same = selected.zone === zone && selected.col === col && selected.index === index;
      if (!same && tryMove({ zone, col: target(zone, col, index) })) { selected = null; render(); return; }
      selected = null;
    }
    render();
  }

  // tableau 顶牌 / free 格也可作落点
  function target(zone, col) {
    return col;
  }

  function handleTarget(zone, col) {
    if (selected) tryMove({ zone, col });
    selected = null;
    render();
  }

  function undo() {
    const prev = history.pop();
    if (!prev) return;
    state = prev;
    selected = null;
    reported = false;
    save();
    render();
  }

  function restart() {
    history = [];
    selected = null;
    reported = false;
    state = newState();
    removeState(storageKey);
    save();
    render();
  }

  function cardStyle(top, sel) {
    return "width:40px;height:56px;border-radius:5px;border:1px solid #1f2a44;"
      + "display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;"
      + "box-sizing:border-box;" + (top ? "" : "position:absolute;left:0;top:0;")
      + (sel ? "outline:2px solid #4f9cff;outline-offset:1px;" : "");
  }

  function cardHtml(card, top, sel) {
    const color = isRed(card.suit) ? "#d33" : "#111";
    return `<div style="${cardStyle(top, sel)}background:#fbfbf6;color:${color};">${RANKS[card.rank - 1]}${card.suit}</div>`;
  }

  function slotHtml(label) {
    return `<div style="width:40px;height:56px;border-radius:5px;border:1px dashed #2a3a5c;color:#456;`
      + `display:flex;align-items:center;justify-content:center;font-size:14px;">${label}</div>`;
  }

  function render() {
    const done = state.foundations.reduce((n, c) => n + c.length, 0);
    const won = isWon(state);
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${won ? "通关!" : "空当接龙"}</strong>
          <p class="game-note">明牌全开 · 不同色降序续牌 · 双击进基础堆 · 4 空当格暂存</p>
        </div>
        <div class="mini-stats"><span>基 ${done}/52</span><span>步 ${state.moves}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:flex;gap:5px;margin-bottom:10px;">
          ${state.free.map((c, i) =>
            `<div data-free="${i}" style="width:40px;height:56px;position:relative;cursor:pointer;">${c
              ? cardHtml(c, true, selected?.zone === "free" && selected.col === i)
              : slotHtml("○")}</div>`).join("")}
          <div style="flex:1;"></div>
          ${state.foundations.map((f, i) => {
            const c = f[f.length - 1];
            return `<div data-found="${i}" style="width:40px;height:56px;position:relative;cursor:pointer;">${c
              ? cardHtml(c, true, false)
              : slotHtml(SUITS[i])}</div>`;
          }).join("")}
        </div>
        <div style="display:flex;gap:5px;align-items:flex-start;">
          ${state.tableau.map((col, ci) => {
            const h = Math.max(56, (col.length - 1) * 18 + 56);
            const cells = col.length
              ? col.map((card, ri) => {
                  const sel = selected?.zone === "tableau" && selected.col === ci && ri >= selected.index;
                  return `<div data-tab="${ci}" data-row="${ri}" style="position:absolute;top:${ri * 18}px;left:0;cursor:pointer;">${cardHtml(card, true, sel)}</div>`;
                }).join("")
              : `<div data-tab="${ci}" data-row="-1" style="width:40px;height:56px;border-radius:5px;border:1px dashed #2a3a5c;cursor:pointer;"></div>`;
            return `<div data-col="${ci}" style="position:relative;width:40px;height:${h}px;">${cells}</div>`;
          }).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" data-undo ${history.length ? "" : "disabled"}>撤销</button>
        <button class="danger-button" data-restart>重开</button>
      </section>
    `;

    root.querySelectorAll("[data-free]").forEach((el) =>
      el.addEventListener("click", () => {
        const i = Number(el.dataset.free);
        if (state.free[i]) handlePick("free", i, 0);
        else handleTarget("free", i);
      }));
    root.querySelectorAll("[data-found]").forEach((el) =>
      el.addEventListener("click", () => handleTarget("foundation", Number(el.dataset.found))));
    root.querySelectorAll("[data-tab]").forEach((el) =>
      el.addEventListener("click", () => {
        const ci = Number(el.dataset.tab);
        const ri = Number(el.dataset.row);
        if (ri < 0) return handleTarget("tableau", ci);
        const isTop = ri === state.tableau[ci].length - 1;
        if (isTop && selected && !(selected.zone === "tableau" && selected.col === ci) && tryMove({ zone: "tableau", col: ci })) {
          selected = null;
          return render();
        }
        handlePick("tableau", ci, ri);
      }));
    root.querySelector("[data-undo]").addEventListener("click", undo);
    root.querySelector("[data-restart]").addEventListener("click", restart);
  }

  render();
  finishIfWon();
  return () => {};
}
