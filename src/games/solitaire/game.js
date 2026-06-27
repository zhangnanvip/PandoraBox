import { shuffle } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RED = new Set(["♥", "♦"]);

function isRed(suit) {
  return RED.has(suit);
}

// 一副牌: id 0..51, rank 1..13, suit index 0..3
function makeDeck() {
  const cards = [];
  for (let s = 0; s < 4; s += 1) {
    for (let r = 1; r <= 13; r += 1) {
      cards.push({ id: s * 13 + r - 1, suit: SUITS[s], rank: r, faceUp: false });
    }
  }
  return cards;
}

function newState(drawCount) {
  const deck = shuffle(makeDeck());
  const tableau = [[], [], [], [], [], [], []];
  let i = 0;
  for (let col = 0; col < 7; col += 1) {
    for (let row = 0; row <= col; row += 1) {
      const card = { ...deck[i] };
      card.faceUp = row === col;
      tableau[col].push(card);
      i += 1;
    }
  }
  const stock = deck.slice(i).map((c) => ({ ...c, faceUp: false }));
  return {
    tableau,
    foundations: [[], [], [], []],
    stock,
    waste: [],
    moves: 0,
    drawCount: drawCount === 3 ? 3 : 1
  };
}

function isValidState(s) {
  if (!s || !Array.isArray(s.tableau) || s.tableau.length !== 7) return false;
  if (!Array.isArray(s.foundations) || s.foundations.length !== 4) return false;
  if (!Array.isArray(s.stock) || !Array.isArray(s.waste)) return false;
  const total =
    s.tableau.reduce((n, c) => n + c.length, 0) +
    s.foundations.reduce((n, c) => n + c.length, 0) +
    s.stock.length + s.waste.length;
  return total === 52;
}

function clone(s) {
  return {
    tableau: s.tableau.map((col) => col.map((c) => ({ ...c }))),
    foundations: s.foundations.map((col) => col.map((c) => ({ ...c }))),
    stock: s.stock.map((c) => ({ ...c })),
    waste: s.waste.map((c) => ({ ...c })),
    moves: s.moves,
    drawCount: s.drawCount
  };
}

function isWon(s) {
  return s.foundations.reduce((n, c) => n + c.length, 0) === 52;
}

function canStackTableau(card, target) {
  if (!target) return card.rank === 13; // 空列只放 K
  return isRed(card.suit) !== isRed(target.suit) && target.rank === card.rank + 1;
}

function canStackFoundation(card, top) {
  if (!top) return card.rank === 1; // 空基只放 A
  return top.suit === card.suit && card.rank === top.rank + 1;
}

export function mountSolitaire(root, context) {
  const drawCount = context?.options?.draw === "3" ? 3 : 1;
  const storageKey = `solitaire:${context?.mode || "solo"}`;

  let state =
    (context?.savedState && isValidState(context.savedState) && context.savedState) ||
    (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValidState(legacy) ? legacy : newState(drawCount);
    })();

  let history = [];
  let selected = null; // { zone, col, index }
  let reported = false;
  let lastTapId = 0;
  let lastTapTime = 0;

  function save() {
    saveState(storageKey, state);
    if (!isWon(state)) {
      context?.saveSession?.(clone(state), {
        stage: `${state.foundations.reduce((n, c) => n + c.length, 0)}/52`,
        level: state.foundations.reduce((n, c) => n + c.length, 0),
        score: state.moves
      });
    } else {
      context?.clearSession?.();
    }
  }

  function pushHistory() {
    history.push(clone(state));
    if (history.length > 200) history.shift();
  }

  function finishIfWon() {
    if (isWon(state) && !reported) {
      reported = true;
      const score = Math.max(100, 1000 - state.moves * 2);
      context?.reportResult?.({ outcome: "complete", score, moves: state.moves });
      context?.clearSession?.();
    }
  }

  function drawStock() {
    pushHistory();
    if (!state.stock.length) {
      state.stock = state.waste.reverse().map((c) => ({ ...c, faceUp: false }));
      state.waste = [];
    } else {
      const n = Math.min(state.drawCount, state.stock.length);
      for (let i = 0; i < n; i += 1) {
        const c = state.stock.pop();
        c.faceUp = true;
        state.waste.push(c);
      }
    }
    state.moves += 1;
    selected = null;
    save();
    render();
  }

  function toFoundation(card) {
    return state.foundations.findIndex((f) => canStackFoundation(card, f[f.length - 1]));
  }

  function removeFrom(zone, col) {
    if (zone === "waste") return state.waste.pop();
    return state.tableau[col].pop();
  }

  function autoToFoundation(zone, col) {
    const src = zone === "waste" ? state.waste : state.tableau[col];
    const card = src[src.length - 1];
    if (!card || !card.faceUp) return false;
    const fi = toFoundation(card);
    if (fi < 0) return false;
    pushHistory();
    src.pop();
    state.foundations[fi].push(card);
    if (zone === "tableau") {
      const last = state.tableau[col][state.tableau[col].length - 1];
      if (last) last.faceUp = true;
    }
    state.moves += 1;
    selected = null;
    save();
    render();
    finishIfWon();
    return true;
  }

  function pickStack(col, index) {
    return state.tableau[col].slice(index);
  }

  function tryMove(target) {
    if (!selected) return false;
    const { zone, col, index } = selected;
    let cards;
    if (zone === "waste") cards = [state.waste[state.waste.length - 1]];
    else cards = pickStack(col, index);
    if (!cards.length) return false;
    const head = cards[0];

    if (target.zone === "foundation") {
      if (cards.length !== 1 || !canStackFoundation(head, state.foundations[target.col][state.foundations[target.col].length - 1])) return false;
      pushHistory();
      removeFrom(zone, col);
      state.foundations[target.col].push(head);
    } else {
      const destCol = state.tableau[target.col];
      if (!canStackTableau(head, destCol[destCol.length - 1])) return false;
      pushHistory();
      if (zone === "waste") destCol.push(state.waste.pop());
      else { state.tableau[col].splice(index); destCol.push(...cards); }
    }
    if (zone === "tableau") {
      const last = state.tableau[col][state.tableau[col].length - 1];
      if (last) last.faceUp = true;
    }
    state.moves += 1;
    save();
    finishIfWon();
    return true;
  }

  function handlePile(zone, col, index, faceUp) {
    const now = Date.now();
    const top = zone === "waste"
      ? state.waste[state.waste.length - 1]
      : state.tableau[col][state.tableau[col].length - 1];
    const isTopTap = top && (zone === "waste" || index === state.tableau[col].length - 1);
    if (isTopTap && top.id === lastTapId && now - lastTapTime < 350) {
      lastTapId = 0;
      if (autoToFoundation(zone, col)) return;
    }
    lastTapId = top ? top.id : 0;
    lastTapTime = now;

    if (!faceUp) return; // 背面牌不可选
    if (!selected) {
      selected = { zone, col, index };
    } else {
      const same = selected.zone === zone && selected.col === col && selected.index === index;
      selected = null;
      if (!same) render();
      return;
    }
    render();
  }

  function handleTarget(zone, col) {
    if (selected && tryMove({ zone, col })) selected = null;
    else selected = null;
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
    state = newState(state.drawCount);
    removeState(storageKey);
    save();
    render();
  }

  function cardStyle(top, sel) {
    return `width:40px;height:56px;border-radius:5px;border:1px solid #1f2a44;`
      + `display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;`
      + `box-sizing:border-box;${top ? "" : "position:absolute;left:0;"}`
      + (sel ? "outline:2px solid #4f9cff;outline-offset:1px;" : "");
  }

  function cardHtml(card, x, top, sel, attrs) {
    if (!card.faceUp) {
      return `<div ${attrs} style="${cardStyle(top, false)}background:#26365c;left:${x}px;top:0;">🂠</div>`;
    }
    const color = isRed(card.suit) ? "#d33" : "#111";
    return `<div ${attrs} style="${cardStyle(top, sel)}background:#fbfbf6;color:${color};left:${x}px;top:0;">${RANKS[card.rank - 1]}${card.suit}</div>`;
  }

  function render() {
    const done = state.foundations.reduce((n, c) => n + c.length, 0);
    const won = isWon(state);
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${won ? "通关!" : "接龙纸牌"}</strong>
          <p class="game-note">点牌堆翻牌 · 选牌后点目标移动 · 双击进基础堆 · 发 ${state.drawCount} 张</p>
        </div>
        <div class="mini-stats"><span>基 ${done}/52</span><span>步 ${state.moves}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <div data-stock style="width:40px;height:56px;border-radius:5px;border:1px solid #1f2a44;background:${state.stock.length ? "#26365c" : "rgba(38,54,92,.25)"};color:#cdd;display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;">${state.stock.length ? "🂠" : "↻"}</div>
          <div data-waste style="width:40px;height:56px;position:relative;">${state.waste.length ? cardHtml(state.waste[state.waste.length - 1], 0, true, selected?.zone === "waste", "data-waste-card") : `<div style="width:40px;height:56px;border-radius:5px;border:1px dashed #2a3a5c;"></div>`}</div>
          <div style="flex:1;"></div>
          ${state.foundations.map((f, i) => {
            const c = f[f.length - 1];
            return `<div data-found="${i}" style="width:40px;height:56px;position:relative;cursor:pointer;">${c ? cardHtml(c, 0, true, false, `data-found="${i}"`) : `<div data-found="${i}" style="width:40px;height:56px;border-radius:5px;border:1px dashed #2a3a5c;color:#456;display:flex;align-items:center;justify-content:center;font-size:14px;">${SUITS[i]}</div>`}</div>`;
          }).join("")}
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start;">
          ${state.tableau.map((col, ci) => {
            const h = Math.max(56, 16 + (col.length - 1) * 18 + 56);
            const cells = col.length
              ? col.map((card, ri) => {
                  const sel = selected?.zone === "tableau" && selected.col === ci && ri >= selected.index;
                  return `<div data-tab="${ci}" data-row="${ri}" data-face="${card.faceUp ? 1 : 0}" style="position:absolute;top:${ri * 18}px;cursor:pointer;">${cardHtml(card, 0, true, sel, `data-tab="${ci}" data-row="${ri}" data-face="${card.faceUp ? 1 : 0}"`)}</div>`;
                }).join("")
              : `<div data-tab="${ci}" data-row="-1" data-face="0" style="width:40px;height:56px;border-radius:5px;border:1px dashed #2a3a5c;cursor:pointer;"></div>`;
            return `<div data-col="${ci}" style="position:relative;width:40px;height:${h}px;">${cells}</div>`;
          }).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" data-undo ${history.length ? "" : "disabled"}>撤销</button>
        <button class="danger-button" data-restart>重开</button>
      </section>
    `;

    root.querySelector("[data-stock]").addEventListener("click", drawStock);
    const wc = root.querySelector("[data-waste-card]");
    if (wc) wc.addEventListener("click", () => handlePile("waste", -1, -1, true));
    root.querySelectorAll("[data-found]").forEach((el) =>
      el.addEventListener("click", () => handleTarget("foundation", Number(el.dataset.found))));
    root.querySelectorAll("[data-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        const ci = Number(el.dataset.tab);
        const ri = Number(el.dataset.row);
        if (ri < 0) return handleTarget("tableau", ci);
        const isTopCard = ri === state.tableau[ci].length - 1;
        const fromOther = selected && !(selected.zone === "tableau" && selected.col === ci);
        if (fromOther && isTopCard && tryMove({ zone: "tableau", col: ci })) {
          selected = null;
          return render();
        }
        handlePile("tableau", ci, ri, el.dataset.face === "1");
      });
    });
    root.querySelector("[data-undo]").addEventListener("click", undo);
    root.querySelector("[data-restart]").addEventListener("click", restart);
  }

  render();
  finishIfWon();
  return () => {};
}
