import { shuffle } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RED = new Set(["♥", "♦"]);

function isRed(suit) {
  return RED.has(suit);
}

// 蜘蛛纸牌 = 2 副牌 = 104 张。suits 决定花色种类: 1/2/4。
function suitCount(difficulty) {
  if (difficulty === "easy") return 1;
  if (difficulty === "hard" || difficulty === "devil") return 4;
  return 2; // medium 默认
}

function makeDeck(suits) {
  const cards = [];
  let id = 0;
  // 总是 104 张: 8 套 13 张, 花色从前 suits 种循环取
  for (let pack = 0; pack < 8; pack += 1) {
    const suit = SUITS[pack % suits];
    for (let r = 1; r <= 13; r += 1) {
      cards.push({ id: id++, suit, rank: r, faceUp: false });
    }
  }
  return cards;
}

function newState(difficulty) {
  const suits = suitCount(difficulty);
  const deck = shuffle(makeDeck(suits));
  const tableau = Array.from({ length: 10 }, () => []);
  let i = 0;
  // 前 4 列 6 张, 后 6 列 5 张 = 54 张, 仅顶牌翻面
  for (let col = 0; col < 10; col += 1) {
    const n = col < 4 ? 6 : 5;
    for (let row = 0; row < n; row += 1) {
      const card = { ...deck[i] };
      tableau[col].push(card);
      i += 1;
    }
    tableau[col][tableau[col].length - 1].faceUp = true;
  }
  const stock = deck.slice(i).map((c) => ({ ...c, faceUp: false })); // 余 50 张, 5 次发牌
  return {
    suits,
    tableau,
    stock,
    runs: 0,
    moves: 0
  };
}

function isValidState(s) {
  if (!s || !Array.isArray(s.tableau) || s.tableau.length !== 10) return false;
  if (!Array.isArray(s.stock)) return false;
  const total = s.tableau.reduce((n, c) => n + c.length, 0) + s.stock.length;
  return total === 104;
}

function clone(s) {
  return {
    suits: s.suits,
    tableau: s.tableau.map((col) => col.map((c) => ({ ...c }))),
    stock: s.stock.map((c) => ({ ...c })),
    runs: s.runs,
    moves: s.moves
  };
}

function isWon(s) {
  return s.runs >= 8;
}

// 从 index 起是否同花色顺序 (递减 1) 且全翻面 => 可整体抓
function canPickup(col, index) {
  for (let i = index; i < col.length; i += 1) {
    const c = col[i];
    if (!c.faceUp) return false;
    if (i > index) {
      const prev = col[i - 1];
      if (prev.suit !== c.suit || prev.rank !== c.rank + 1) return false;
    }
  }
  return true;
}

// 头牌可否落到目标列顶: 空列随便放, 否则只看 rank-1 (花色不限, 经典规则)
function canDrop(head, target) {
  if (!target) return true;
  return target.rank === head.rank + 1;
}

export function mountSpider(root, context) {
  const difficulty = context?.difficulty || "medium";
  const storageKey = `spider:${difficulty}`;

  let state =
    (context?.savedState && isValidState(context.savedState) && context.savedState) ||
    (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValidState(legacy) ? legacy : newState(difficulty);
    })();

  let history = [];
  let selected = null; // { col, index }
  let reported = false;

  function save() {
    saveState(storageKey, state);
    if (!isWon(state)) {
      context?.saveSession?.(clone(state), {
        stage: `${state.runs}/8`,
        level: state.runs,
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
      const score = Math.max(120, 800 + state.runs * 100 - state.moves * 2);
      context?.reportResult?.({ outcome: "complete", score, moves: state.moves });
      context?.clearSession?.();
    }
  }

  // 检查某列尾部是否凑成 K→A 同花色完整一套, 移除并计分
  function harvest(col) {
    const arr = state.tableau[col];
    if (arr.length < 13) return false;
    const start = arr.length - 13;
    if (arr[start].rank !== 13 || !canPickup(col, start)) return false;
    arr.splice(start, 13);
    state.runs += 1;
    const last = arr[arr.length - 1];
    if (last) last.faceUp = true;
    context?.playSound?.("clear");
    return true;
  }

  function deal() {
    if (state.stock.length < 10) return;
    if (state.tableau.some((c) => c.length === 0)) return; // 空列不可发牌
    pushHistory();
    for (let col = 0; col < 10; col += 1) {
      const c = state.stock.pop();
      c.faceUp = true;
      state.tableau[col].push(c);
    }
    for (let col = 0; col < 10; col += 1) harvest(col);
    state.moves += 1;
    selected = null;
    save();
    render();
    finishIfWon();
  }

  function tryMove(targetCol) {
    if (!selected) return false;
    const { col, index } = selected;
    if (col === targetCol) return false;
    const cards = state.tableau[col].slice(index);
    if (!cards.length) return false;
    const dest = state.tableau[targetCol];
    if (!canDrop(cards[0], dest[dest.length - 1])) return false;
    pushHistory();
    state.tableau[col].splice(index);
    dest.push(...cards);
    const last = state.tableau[col][state.tableau[col].length - 1];
    if (last) last.faceUp = true;
    harvest(targetCol);
    state.moves += 1;
    save();
    finishIfWon();
    return true;
  }

  function handleCard(col, index, faceUp) {
    if (selected) {
      if (tryMove(col)) { selected = null; return render(); }
      const same = selected.col === col && selected.index === index;
      selected = null;
      if (!same && faceUp && canPickup(state.tableau[col], index)) selected = { col, index };
      return render();
    }
    if (!faceUp) return;
    if (!canPickup(state.tableau[col], index)) return;
    selected = { col, index };
    render();
  }

  function handleEmpty(col) {
    if (selected) { if (tryMove(col)) selected = null; else selected = null; render(); }
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
    state = newState(difficulty);
    removeState(storageKey);
    save();
    render();
  }

  function cardStyle(sel) {
    return "width:34px;height:48px;border-radius:5px;border:1px solid #1f2a44;"
      + "display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;"
      + "box-sizing:border-box;position:absolute;left:0;top:0;"
      + (sel ? "outline:2px solid #4f9cff;outline-offset:1px;" : "");
  }

  function cardHtml(card, sel) {
    if (!card.faceUp) {
      return `<div style="${cardStyle(false)}background:#26365c;">🂠</div>`;
    }
    const color = isRed(card.suit) ? "#d33" : "#111";
    return `<div style="${cardStyle(sel)}background:#fbfbf6;color:${color};">${RANKS[card.rank - 1]}${card.suit}</div>`;
  }

  function render() {
    const won = isWon(state);
    const deals = Math.floor(state.stock.length / 10);
    const label = state.suits === 1 ? "单花色" : state.suits === 2 ? "双花色" : "四花色";
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${won ? "通关!" : "蜘蛛纸牌"}</strong>
          <p class="game-note">选牌后点目标列移动 · K→A 同花色成套消除 · 剩 ${deals} 次发牌 · ${label}</p>
        </div>
        <div class="mini-stats"><span>套 ${state.runs}/8</span><span>步 ${state.moves}</span></div>
      </section>
      <section class="board-wrap" style="max-width:360px;">
        <div style="display:flex;gap:2px;align-items:flex-start;">
          ${state.tableau.map((col, ci) => {
            const h = Math.max(48, (col.length ? (col.length - 1) * 15 : 0) + 48);
            const cells = col.length
              ? col.map((card, ri) => {
                  const sel = selected?.col === ci && ri >= selected.index;
                  return `<div data-col="${ci}" data-row="${ri}" data-face="${card.faceUp ? 1 : 0}" style="position:absolute;top:${ri * 15}px;cursor:pointer;width:34px;height:48px;">`
                    + cardHtml(card, sel)
                    + "</div>";
                }).join("")
              : `<div data-col="${ci}" data-row="-1" style="width:34px;height:48px;border-radius:5px;border:1px dashed #2a3a5c;cursor:pointer;"></div>`;
            return `<div style="position:relative;width:34px;height:${h}px;">${cells}</div>`;
          }).join("")}
        </div>
        <div data-stock style="margin-top:10px;display:flex;gap:4px;cursor:${state.stock.length ? "pointer" : "default"};">
          ${Array.from({ length: deals }, () => `<div style="width:22px;height:30px;border-radius:4px;background:#26365c;border:1px solid #1f2a44;"></div>`).join("")
            || `<div style="font-size:12px;color:#789;">牌堆已空</div>`}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" data-undo ${history.length ? "" : "disabled"}>撤销</button>
        <button class="danger-button" data-restart>重开</button>
      </section>
    `;

    root.querySelectorAll("[data-row]").forEach((el) => {
      const ci = Number(el.dataset.col);
      const ri = Number(el.dataset.row);
      if (ri < 0) { el.addEventListener("click", () => handleEmpty(ci)); return; }
      el.addEventListener("click", () => handleCard(ci, ri, el.dataset.face === "1"));
    });
    const stock = root.querySelector("[data-stock]");
    if (stock && state.stock.length) stock.addEventListener("click", deal);
    root.querySelector("[data-undo]").addEventListener("click", undo);
    root.querySelector("[data-restart]").addEventListener("click", restart);
  }

  render();
  finishIfWon();
  return () => {};
}
