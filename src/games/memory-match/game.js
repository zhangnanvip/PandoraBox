import { loadState, removeState, saveState } from "../../utils/storage.js";
import { shuffle } from "../../utils/random.js";

const SYMBOLS = [
  "🍎", "🍌", "🍇", "🍑", "🍓", "🍒",
  "🥝", "🍍", "🥥", "🍉", "🥕", "🌽",
  "🐶", "🐱", "🦊", "🐼", "🐸", "🐙",
  "🚀", "⚽", "🎲", "🎁", "⭐", "🌈"
];

const PAIRS_BY_DIFFICULTY = { easy: 6, medium: 8, hard: 12, devil: 18 };

function pairCount(difficulty) {
  return PAIRS_BY_DIFFICULTY[difficulty] ?? PAIRS_BY_DIFFICULTY.medium;
}

function columnsFor(pairs) {
  const cards = pairs * 2;
  if (cards <= 12) return 4;
  if (cards <= 24) return 6;
  return 6;
}

function buildDeck(pairs) {
  const picks = SYMBOLS.slice(0, Math.min(pairs, SYMBOLS.length));
  const cards = picks.flatMap((symbol, index) => [
    { id: index * 2, symbol, matched: false, faceUp: false },
    { id: index * 2 + 1, symbol, matched: false, faceUp: false }
  ]);
  return shuffle(cards);
}

function initialState(difficulty) {
  return {
    cards: buildDeck(pairCount(difficulty)),
    flipped: [],
    moves: 0,
    matched: 0,
    elapsed: 0,
    started: false,
    won: false
  };
}

function isValidState(state, pairs) {
  return state
    && Array.isArray(state.cards)
    && state.cards.length === pairs * 2
    && Array.isArray(state.flipped);
}

function deriveScore(pairs, moves, elapsed) {
  const ideal = pairs;
  const moveBonus = Math.max(0, ideal * 2 - moves) * 100;
  const base = pairs * 200;
  const timePenalty = Math.min(base, Math.floor(elapsed * 5));
  return Math.max(50, base + moveBonus - timePenalty);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function mountMemoryMatch(root, context) {
  const difficulty = context.difficulty || "medium";
  const pairs = pairCount(difficulty);
  const cols = columnsFor(pairs);
  const storageKey = `memory-match:${difficulty}`;

  const restored = context.savedState && isValidState(context.savedState, pairs)
    ? context.savedState
    : (() => {
        const legacy = loadState(storageKey, null);
        return isValidState(legacy, pairs) ? legacy : null;
      })();

  let state = restored || initialState(difficulty);
  let disposed = false;
  let lockTimer = 0;
  let tickTimer = 0;
  let resultReported = state.won;

  function save() {
    saveState(storageKey, state);
    if (state.won) {
      context.clearSession?.();
    } else if (state.started) {
      context.saveSession?.(state, {
        stage: `${state.matched}/${pairs} 对 · ${state.moves} 步`,
        level: state.matched,
        score: state.matched
      });
    }
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = 0;
    }
  }

  function startTick() {
    if (tickTimer || disposed) return;
    tickTimer = window.setInterval(() => {
      if (context.isPaused?.()) return;
      state.elapsed += 1;
      paintStats();
    }, 1000);
  }

  function paintStats() {
    const movesEl = root.querySelector("[data-stat='moves']");
    const timeEl = root.querySelector("[data-stat='time']");
    if (movesEl) movesEl.textContent = `步数 ${state.moves}`;
    if (timeEl) timeEl.textContent = `时间 ${formatTime(state.elapsed)}`;
  }

  function win() {
    state.won = true;
    stopTick();
    if (!resultReported) {
      resultReported = true;
      context.reportResult?.({
        outcome: "complete",
        detail: `${pairs} 对 · ${state.moves} 步 · ${formatTime(state.elapsed)}`,
        score: deriveScore(pairs, state.moves, state.elapsed),
        moves: state.moves
      });
    }
    save();
    render();
  }

  function flip(index) {
    if (state.won || lockTimer) return;
    const card = state.cards[index];
    if (!card || card.faceUp || card.matched) return;

    if (!state.started) {
      state.started = true;
      startTick();
    }

    card.faceUp = true;
    state.flipped.push(index);
    render();

    if (state.flipped.length < 2) {
      save();
      return;
    }

    state.moves += 1;
    const [a, b] = state.flipped;
    if (state.cards[a].symbol === state.cards[b].symbol) {
      state.cards[a].matched = true;
      state.cards[b].matched = true;
      state.matched += 1;
      state.flipped = [];
      context.playSound?.("match");
      if (state.matched === pairs) {
        win();
        return;
      }
      save();
      render();
    } else {
      lockTimer = window.setTimeout(() => {
        lockTimer = 0;
        state.cards[a].faceUp = false;
        state.cards[b].faceUp = false;
        state.flipped = [];
        save();
        render();
      }, 700);
      render();
    }
  }

  function restart() {
    if (lockTimer) {
      clearTimeout(lockTimer);
      lockTimer = 0;
    }
    stopTick();
    state = initialState(difficulty);
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function render() {
    const note = state.won
      ? "全部配对完成"
      : `${context.labels?.mode ?? "单人"} · ${context.labels?.difficulty ?? difficulty}`;
    const title = state.won ? "🎉 通关" : "记忆翻牌";

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${title}</strong>
          <p class="game-note">${note} · ${pairs} 对</p>
        </div>
        <div class="mini-stats">
          <span data-stat="moves">步数 ${state.moves}</span>
          <span data-stat="time">时间 ${formatTime(state.elapsed)}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;max-width:480px;margin:0 auto;width:100%;">
          ${state.cards.map((card, index) => {
            const open = card.faceUp || card.matched;
            const bg = card.matched ? "rgba(80,200,120,.18)" : open ? "rgba(255,255,255,.12)" : "rgba(110,120,160,.28)";
            return `<button type="button" data-card="${index}" aria-label="卡牌 ${index + 1}"
              style="aspect-ratio:1;border:none;border-radius:12px;font-size:clamp(20px,7vw,34px);line-height:1;cursor:pointer;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;transition:background .15s;${open ? "" : "color:transparent;"}${card.matched ? "opacity:.65;" : ""}">${open ? card.symbol : "?"}</button>`;
          }).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-card]").forEach((button) => {
      button.addEventListener("click", () => {
        button.blur();
        flip(Number(button.dataset.card));
      });
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  if (state.started && !state.won) startTick();

  return () => {
    disposed = true;
    if (lockTimer) clearTimeout(lockTimer);
    stopTick();
  };
}
