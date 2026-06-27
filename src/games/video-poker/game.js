import { shuffle } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SUITS = [
  { glyph: "♠", red: false },
  { glyph: "♥", red: true },
  { glyph: "♦", red: true },
  { glyph: "♣", red: false }
];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUE = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
const START_CHIPS = 1000;
const BETS = [50, 100, 200];

// 派彩表（每 1 注的倍数）；以"对子 J+"起步到皇家同花顺。
const PAY_TABLE = [
  { key: "royal", name: "皇家同花顺", mult: 250 },
  { key: "straightFlush", name: "同花顺", mult: 50 },
  { key: "four", name: "四条", mult: 25 },
  { key: "fullHouse", name: "葫芦", mult: 9 },
  { key: "flush", name: "同花", mult: 6 },
  { key: "straight", name: "顺子", mult: 4 },
  { key: "three", name: "三条", mult: 3 },
  { key: "twoPair", name: "两对", mult: 2 },
  { key: "jacks", name: "对子 (J 以上)", mult: 1 }
];
const PAY_MAP = Object.fromEntries(PAY_TABLE.map((row) => [row.key, row]));

function buildDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ rank, glyph: suit.glyph, red: suit.red });
    }
  }
  return shuffle(cards);
}

function evaluate(cards) {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => a - b);
  const flush = cards.every((c) => c.glyph === cards[0].glyph);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  // 顺子：常规 + A2345（A 当 1）
  const distinct = [...new Set(values)];
  let straight = distinct.length === 5 && distinct[4] - distinct[0] === 4;
  const isWheel = distinct.length === 5 && distinct.join() === "2,3,4,5,14";
  if (isWheel) straight = true;
  const highCard = values[4];

  if (straight && flush && highCard === 14 && !isWheel) return "royal";
  if (straight && flush) return "straightFlush";
  if (groups[0] === 4) return "four";
  if (groups[0] === 3 && groups[1] === 2) return "fullHouse";
  if (flush) return "flush";
  if (straight) return "straight";
  if (groups[0] === 3) return "three";
  if (groups[0] === 2 && groups[1] === 2) return "twoPair";
  if (groups[0] === 2) {
    const pairValue = Number(Object.keys(counts).find((k) => counts[k] === 2));
    if (pairValue >= 11) return "jacks";
  }
  return null;
}

function initialState() {
  return {
    bankroll: START_CHIPS,
    peak: START_CHIPS,
    bet: 100,
    phase: "bet", // bet | draw | done | bankrupt
    deck: [],
    hand: [],
    held: [false, false, false, false, false],
    result: null,
    payout: 0,
    message: "选择注额，发牌起手",
    round: 0
  };
}

function isValid(state) {
  return state && Number.isFinite(state.bankroll) && Array.isArray(state.hand) && Array.isArray(state.held);
}

export function mountVideoPoker(root, context) {
  const storageKey = `video-poker:${context.mode || "solo"}`;
  const restored = (context.savedState && isValid(context.savedState) ? context.savedState : null)
    || (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValid(legacy) ? legacy : null;
    })();
  let state = restored || initialState();
  let resultReported = state.phase === "bankrupt";

  function save() {
    saveState(storageKey, state);
    if (state.phase !== "bankrupt" && context.saveSession) {
      context.saveSession(state, {
        stage: `第 ${state.round + 1} 局 · 筹码 ${state.bankroll}`,
        level: state.round,
        score: state.bankroll
      });
    }
  }

  function reportBankrupt() {
    if (resultReported) return;
    resultReported = true;
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", score: state.peak, detail: `共 ${state.round} 局`, moves: state.round });
  }

  function deal() {
    if (state.bankroll < state.bet) {
      state.message = "筹码不足，请调小注额";
      render();
      return;
    }
    state.bankroll -= state.bet;
    state.deck = buildDeck();
    state.hand = [state.deck.pop(), state.deck.pop(), state.deck.pop(), state.deck.pop(), state.deck.pop()];
    state.held = [false, false, false, false, false];
    state.result = null;
    state.payout = 0;
    state.phase = "draw";
    state.message = "点牌保留，再换牌定胜负";
    context.playSound?.("deal");
    save();
    render();
  }

  function toggleHold(i) {
    if (state.phase !== "draw") return;
    state.held[i] = !state.held[i];
    render();
  }

  function draw() {
    if (state.phase !== "draw") return;
    for (let i = 0; i < 5; i += 1) {
      if (!state.held[i]) state.hand[i] = state.deck.pop();
    }
    const result = evaluate(state.hand);
    const mult = result ? PAY_MAP[result].mult : 0;
    state.payout = mult * state.bet;
    state.bankroll += state.payout;
    state.result = result;
    state.peak = Math.max(state.peak, state.bankroll);
    state.round += 1;
    if (state.payout > 0) {
      state.message = `${PAY_MAP[result].name}！派彩 ${state.payout}`;
      context.playSound?.("win");
    } else {
      state.message = "未成牌，重新开局";
    }
    if (state.bankroll < BETS[0]) {
      state.phase = "bankrupt";
      state.message += " · 筹码耗尽";
      reportBankrupt();
      removeState(storageKey);
    } else {
      state.phase = "done";
      state.bet = Math.min(state.bet, state.bankroll);
      save();
    }
    render();
  }

  function restart() {
    state = initialState();
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function cardHtml(card, i) {
    const drawing = state.phase === "draw";
    const held = state.held[i];
    if (!card) {
      return `<span style="display:inline-flex;width:52px;height:72px;border-radius:8px;background:repeating-linear-gradient(45deg,#5b6b9a,#5b6b9a 5px,#43507a 5px,#43507a 10px);border:1px solid rgba(0,0,0,.25)"></span>`;
    }
    const color = card.red ? "#d62828" : "#1b1b1b";
    const ring = held ? "outline:3px solid var(--accent,#6c8cff);outline-offset:1px" : "";
    const tag = held ? '<span style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:var(--accent,#6c8cff)">保留</span>' : "";
    return `<button data-hold="${i}" ${drawing ? "" : "disabled"} style="position:relative;display:inline-flex;flex-direction:column;justify-content:space-between;width:52px;height:72px;padding:4px 5px;border-radius:8px;background:#fff;border:1px solid rgba(0,0,0,.2);color:${color};font-weight:700;font-size:16px;line-height:1.05;cursor:${drawing ? "pointer" : "default"};${ring}">${tag}<span>${card.rank}</span><span style="text-align:right">${card.glyph}</span></button>`;
  }

  function payTableHtml() {
    return PAY_TABLE.map((row) => {
      const on = state.result === row.key;
      return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 6px;border-radius:5px;${on ? "background:var(--accent,#6c8cff);color:#fff;font-weight:700" : "color:var(--muted,#9aa3c0)"}"><span>${row.name}</span><span>×${row.mult}</span></div>`;
    }).join("");
  }

  function render() {
    const hand = state.hand.length ? state.hand : [null, null, null, null, null];
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels?.mode || "单人"} · 第 ${state.round + 1} 局 · 当前注 ${state.bet}</p>
        </div>
        <div class="mini-stats">
          <span>筹码 ${state.bankroll}</span>
          <span>峰值 ${state.peak}</span>
        </div>
      </section>

      <section class="board-wrap" style="display:flex;flex-direction:column;gap:14px;align-items:center;padding:14px 8px">
        <div style="display:flex;gap:8px;justify-content:center;max-width:340px">${hand.map((c, i) => cardHtml(c, i)).join("")}</div>
        <div style="width:100%;max-width:300px;display:flex;flex-direction:column;gap:1px;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 0">${payTableHtml()}</div>
      </section>

      <section class="game-panel toolbar" style="flex-wrap:wrap;gap:8px">
        ${state.phase === "bet" || state.phase === "done" ? BETS.map((b) => `
          <button class="secondary-button" data-bet="${b}" ${state.bankroll < b ? "disabled" : ""} style="${state.bet === b ? "outline:2px solid var(--accent,#6c8cff)" : ""}">${b}</button>
        `).join("") : ""}
        ${state.phase === "bet" || state.phase === "done" ? `<button class="primary-button" data-action="deal">${state.phase === "done" ? "下一局" : "发牌"}</button>` : ""}
        ${state.phase === "draw" ? `<button class="primary-button" data-action="draw">换牌</button>` : ""}
        <button class="${state.phase === "bankrupt" ? "primary-button" : "danger-button"}" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-bet]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.bet = Number(btn.dataset.bet);
        render();
      });
    });
    root.querySelectorAll("[data-hold]").forEach((btn) => {
      btn.addEventListener("click", () => toggleHold(Number(btn.dataset.hold)));
    });
    const bind = (action, fn) => {
      const el = root.querySelector(`[data-action='${action}']`);
      if (el) el.addEventListener("click", fn);
    };
    bind("deal", deal);
    bind("draw", draw);
    bind("restart", restart);
  }

  render();

  return () => {};
}
