import { shuffle } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const SUITS = [
  { glyph: "♠", red: false },
  { glyph: "♥", red: true },
  { glyph: "♦", red: true },
  { glyph: "♣", red: false }
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const START_CHIPS = 1000;
const BETS = [50, 100, 200];

function buildDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ rank, glyph: suit.glyph, red: suit.red });
    }
  }
  return shuffle(cards);
}

function cardValue(rank) {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K" || rank === "10") return 10;
  return Number(rank);
}

function handScore(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isBlackjack(cards) {
  return cards.length === 2 && handScore(cards) === 21;
}

function initialState() {
  return {
    bankroll: START_CHIPS,
    peak: START_CHIPS,
    bet: 100,
    phase: "bet", // bet | player | done | bankrupt
    deck: [],
    player: [],
    dealer: [],
    message: "下注后开始本局",
    doubled: false,
    round: 0
  };
}

function isValid(state) {
  return state && Number.isFinite(state.bankroll) && Array.isArray(state.player);
}

export function mountBlackjack(root, context) {
  const storageKey = `blackjack:${context.mode}`;
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
    context.reportResult?.({ outcome: "score", score: state.peak, detail: `共 ${state.round} 局` });
  }

  function setMessage(text) {
    state.message = text;
  }

  function deal() {
    if (state.bankroll < state.bet) {
      setMessage("筹码不足，请调小注额");
      render();
      return;
    }
    state.deck = buildDeck();
    state.player = [state.deck.pop(), state.deck.pop()];
    state.dealer = [state.deck.pop(), state.deck.pop()];
    state.doubled = false;
    state.phase = "player";
    if (isBlackjack(state.player)) {
      settle();
    } else {
      setMessage("要牌 / 停牌 / 加倍");
      render();
    }
  }

  function hit() {
    if (state.phase !== "player") return;
    state.player.push(state.deck.pop());
    if (handScore(state.player) >= 21) {
      stand();
    } else {
      setMessage("要牌 / 停牌");
      render();
    }
  }

  function double() {
    if (state.phase !== "player" || state.player.length !== 2) return;
    if (state.bankroll < state.bet * 2) {
      setMessage("筹码不足以加倍");
      render();
      return;
    }
    state.doubled = true;
    state.player.push(state.deck.pop());
    stand();
  }

  function stand() {
    if (state.phase !== "player") return;
    if (handScore(state.player) <= 21) {
      while (handScore(state.dealer) < 17) {
        state.dealer.push(state.deck.pop());
      }
    }
    settle();
  }

  function settle() {
    const stake = state.bet * (state.doubled ? 2 : 1);
    const p = handScore(state.player);
    const d = handScore(state.dealer);
    const pbj = isBlackjack(state.player);
    const dbj = isBlackjack(state.dealer);
    let delta = 0;
    let outcome;
    if (pbj && !dbj) {
      delta = Math.round(state.bet * 1.5);
      outcome = "21 点！盈 " + delta;
    } else if (p > 21) {
      delta = -stake;
      outcome = "爆牌，输 " + stake;
    } else if (dbj || d > p && d <= 21) {
      delta = -stake;
      outcome = "庄家胜，输 " + stake;
    } else if (p === d) {
      delta = 0;
      outcome = "平局，退注";
    } else {
      delta = stake;
      outcome = "你赢了，盈 " + stake;
    }
    state.bankroll += delta;
    state.peak = Math.max(state.peak, state.bankroll);
    state.round += 1;
    if (state.bankroll < BETS[0]) {
      state.phase = "bankrupt";
      setMessage(`${outcome} · 筹码耗尽`);
      reportBankrupt();
      removeState(storageKey);
    } else {
      state.phase = "done";
      state.bet = Math.min(state.bet, state.bankroll);
      setMessage(outcome);
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

  function cardHtml(card, hidden) {
    if (hidden) {
      return `<span style="display:inline-flex;width:52px;height:72px;border-radius:8px;background:repeating-linear-gradient(45deg,#5b6b9a,#5b6b9a 5px,#43507a 5px,#43507a 10px);border:1px solid rgba(0,0,0,.25)"></span>`;
    }
    const color = card.red ? "#d62828" : "#1b1b1b";
    return `<span style="display:inline-flex;flex-direction:column;justify-content:space-between;width:52px;height:72px;padding:4px 5px;border-radius:8px;background:#fff;border:1px solid rgba(0,0,0,.2);color:${color};font-weight:700;font-size:16px;line-height:1.05"><span>${card.rank}</span><span style="text-align:right">${card.glyph}</span></span>`;
  }

  function handHtml(cards, hideHole) {
    return cards.map((c, i) => cardHtml(c, hideHole && i === 1)).join("");
  }

  function render() {
    const playing = state.phase === "player";
    const dealerScore = playing ? cardValue(state.dealer[0].rank) : handScore(state.dealer);
    const dealerStr = playing ? `${dealerScore}+` : (state.dealer.length ? dealerScore : "-");
    const playerStr = state.player.length ? handScore(state.player) : "-";

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
        <div style="width:100%;max-width:340px">
          <p class="game-note" style="margin:0 0 6px">庄家 · ${dealerStr}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${state.dealer.length ? handHtml(state.dealer, playing) : "<span style='opacity:.5'>待发牌</span>"}</div>
        </div>
        <div style="width:100%;max-width:340px">
          <p class="game-note" style="margin:0 0 6px">你 · ${playerStr}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${state.player.length ? handHtml(state.player, false) : "<span style='opacity:.5'>待发牌</span>"}</div>
        </div>
      </section>

      <section class="game-panel toolbar" style="flex-wrap:wrap;gap:8px">
        ${state.phase === "bet" || state.phase === "done" ? BETS.map((b) => `
          <button class="secondary-button" data-bet="${b}" ${state.bankroll < b ? "disabled" : ""} style="${state.bet === b ? "outline:2px solid var(--accent,#6c8cff)" : ""}">${b}</button>
        `).join("") : ""}
        ${playing ? `
          <button class="primary-button" data-action="hit">要牌</button>
          <button class="secondary-button" data-action="stand">停牌</button>
          <button class="secondary-button" data-action="double" ${state.player.length !== 2 || state.bankroll < state.bet * 2 ? "disabled" : ""}>加倍</button>
        ` : ""}
        ${state.phase === "bet" || state.phase === "done" ? `<button class="primary-button" data-action="deal">${state.phase === "done" ? "下一局" : "发牌"}</button>` : ""}
        ${state.phase === "bankrupt" ? `<button class="primary-button" data-action="restart">重开</button>` : `<button class="danger-button" data-action="restart">重开</button>`}
      </section>
    `;

    root.querySelectorAll("[data-bet]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.bet = Number(btn.dataset.bet);
        render();
      });
    });
    const bind = (action, fn) => {
      const el = root.querySelector(`[data-action='${action}']`);
      if (el) el.addEventListener("click", fn);
    };
    bind("deal", deal);
    bind("hit", hit);
    bind("stand", stand);
    bind("double", double);
    bind("restart", restart);
  }

  render();

  return () => {};
}
