import { loadState, removeState, saveState } from "../../utils/storage.js";

const CATEGORIES = [
  { id: "ones", name: "一点", short: "1" },
  { id: "twos", name: "二点", short: "2" },
  { id: "threes", name: "三点", short: "3" },
  { id: "fours", name: "四点", short: "4" },
  { id: "fives", name: "五点", short: "5" },
  { id: "sixes", name: "六点", short: "6" },
  { id: "kind3", name: "三条", short: "3K" },
  { id: "kind4", name: "四条", short: "4K" },
  { id: "fullHouse", name: "葫芦", short: "FH" },
  { id: "smallStraight", name: "小顺", short: "S" },
  { id: "largeStraight", name: "大顺", short: "L" },
  { id: "yahtzee", name: "快艇", short: "Y" },
  { id: "chance", name: "全选", short: "?" }
];
const UPPER = ["ones", "twos", "threes", "fours", "fives", "sixes"];
const PIP_MAP = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d] += 1;
  return c;
}

function sumDice(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

function categoryScore(id, dice) {
  const c = counts(dice);
  switch (id) {
    case "ones": return c[1] * 1;
    case "twos": return c[2] * 2;
    case "threes": return c[3] * 3;
    case "fours": return c[4] * 4;
    case "fives": return c[5] * 5;
    case "sixes": return c[6] * 6;
    case "kind3": return c.some((n) => n >= 3) ? sumDice(dice) : 0;
    case "kind4": return c.some((n) => n >= 4) ? sumDice(dice) : 0;
    case "fullHouse": return c.includes(3) && c.includes(2) ? 25 : 0;
    case "smallStraight": return hasStraight(c, 4) ? 30 : 0;
    case "largeStraight": return hasStraight(c, 5) ? 40 : 0;
    case "yahtzee": return c.some((n) => n >= 5) ? 50 : 0;
    case "chance": return sumDice(dice);
    default: return 0;
  }
}

function hasStraight(c, len) {
  let run = 0;
  for (let v = 1; v <= 6; v += 1) {
    run = c[v] ? run + 1 : 0;
    if (run >= len) return true;
  }
  return false;
}

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function initialState() {
  return {
    round: 1,
    dice: [1, 2, 3, 4, 5],
    held: [false, false, false, false, false],
    rolls: 0,
    scores: {},
    rolling: false,
    phase: "play"
  };
}

function isValid(state) {
  return state && Array.isArray(state.dice) && state.dice.length === 5 && state.scores;
}

function upperSum(scores) {
  return UPPER.reduce((sum, id) => sum + (scores[id] || 0), 0);
}

function totalScore(scores) {
  let total = CATEGORIES.reduce((sum, c) => sum + (scores[c.id] || 0), 0);
  if (upperSum(scores) >= 63) total += 35;
  return total;
}

export function mountYahtzee(root, context) {
  const storageKey = `yahtzee:${context.mode}`;
  const restored = (context.savedState && isValid(context.savedState) ? context.savedState : null)
    || (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValid(legacy) ? legacy : null;
    })();
  let state = restored || initialState();
  let resultReported = state.phase === "done";
  const timers = [];

  function save() {
    saveState(storageKey, state);
    if (state.phase !== "done" && context.saveSession) {
      context.saveSession(state, {
        stage: `第 ${state.round}/13 回合 · ${totalScore(state.scores)} 分`,
        level: state.round,
        score: totalScore(state.scores)
      });
    }
  }

  function finish() {
    if (resultReported) return;
    resultReported = true;
    context.clearSession?.();
    removeState(storageKey);
    context.reportResult?.({ outcome: "complete", score: totalScore(state.scores), detail: `${totalScore(state.scores)} 分` });
  }

  function roll() {
    if (state.rolling || state.rolls >= 3 || state.phase !== "play") return;
    state.rolling = true;
    context.playSound?.("roll");
    let ticks = 0;
    render();
    const id = setInterval(() => {
      ticks += 1;
      for (let i = 0; i < 5; i += 1) if (!state.held[i]) state.dice[i] = rollDie();
      if (ticks >= 6) {
        clearInterval(id);
        state.rolling = false;
        state.rolls += 1;
        if (state.rolls === 1) state.held = [false, false, false, false, false];
        save();
      }
      render();
    }, 60);
    timers.push(id);
  }

  function toggleHold(i) {
    if (state.rolling || state.rolls === 0 || state.phase !== "play") return;
    state.held[i] = !state.held[i];
    render();
  }

  function pick(id) {
    if (state.rolling || state.rolls === 0 || state.phase !== "play") return;
    if (state.scores[id] != null) return;
    state.scores[id] = categoryScore(id, state.dice);
    context.playSound?.("pick");
    if (state.round >= 13) {
      state.phase = "done";
      finish();
      render();
      return;
    }
    state.round += 1;
    state.rolls = 0;
    state.held = [false, false, false, false, false];
    save();
    render();
  }

  function restart() {
    timers.forEach(clearInterval);
    timers.length = 0;
    state = initialState();
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function dieHtml(value, i) {
    const held = state.held[i];
    const pips = (PIP_MAP[value] || []).map((slot) =>
      `<i style="grid-area:p${slot};width:13px;height:13px;border-radius:50%;background:#1b2540;justify-self:center;align-self:center"></i>`
    ).join("");
    const cells = Array.from({ length: 9 }, (_, k) => `<i style="grid-area:p${k}"></i>`).join("");
    return `<button data-die="${i}" aria-pressed="${held}" style="width:60px;height:60px;border-radius:14px;border:3px solid ${held ? "var(--accent,#6c8cff)" : "rgba(255,255,255,.25)"};background:${held ? "#fff7d6" : "#fdfdfd"};display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;grid-template-areas:'p0 p1 p2''p3 p4 p5''p6 p7 p8';padding:6px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.2)">${cells}${pips}</button>`;
  }

  function render() {
    const total = totalScore(state.scores);
    const upper = upperSum(state.scores);
    const rollsLeft = 3 - state.rolls;

    const rows = CATEGORIES.map((cat) => {
      const taken = state.scores[cat.id] != null;
      const preview = !taken && state.rolls > 0 ? categoryScore(cat.id, state.dice) : null;
      const val = taken ? state.scores[cat.id] : (preview != null ? preview : "–");
      const open = !taken && state.rolls > 0 && state.phase === "play";
      return `<button data-cat="${cat.id}" ${open ? "" : "disabled"} style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:${taken ? "rgba(255,255,255,.05)" : open ? "rgba(108,140,255,.18)" : "transparent"};color:inherit;cursor:${open ? "pointer" : "default"};opacity:${taken ? .55 : 1}"><span>${cat.name}</span><strong style="color:${taken ? "inherit" : "var(--accent,#6c8cff)"}">${val}</strong></button>`;
    }).join("");

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.phase === "done" ? "对局结束" : `第 ${state.round}/13 回合`}</strong>
          <p class="game-note">${context.labels?.mode || "单人"} · 剩余 ${rollsLeft} 次掷骰</p>
        </div>
        <div class="mini-stats">
          <span>总分 ${total}</span>
          <span>上区 ${upper}/63</span>
        </div>
      </section>

      <section class="board-wrap" style="display:flex;flex-direction:column;gap:14px;align-items:center;padding:14px 8px;max-width:360px;margin:0 auto">
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${state.dice.map(dieHtml).join("")}</div>
        <p class="game-note" style="margin:0;text-align:center">${state.phase === "done" ? `最终 ${total} 分` : state.rolls === 0 ? "点击「掷骰」开始本回合" : "轻触骰子锁定，点分类计分"}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%">${rows}</div>
      </section>

      <section class="game-panel toolbar" style="flex-wrap:wrap;gap:8px">
        ${state.phase === "play" ? `<button class="primary-button" data-action="roll" ${state.rolls >= 3 || state.rolling ? "disabled" : ""}>掷骰 (${rollsLeft})</button>` : ""}
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-die]").forEach((b) =>
      b.addEventListener("click", () => toggleHold(Number(b.dataset.die)))
    );
    root.querySelectorAll("[data-cat]").forEach((b) =>
      b.addEventListener("click", () => pick(b.dataset.cat))
    );
    const bind = (a, fn) => {
      const el = root.querySelector(`[data-action='${a}']`);
      if (el) el.addEventListener("click", fn);
    };
    bind("roll", roll);
    bind("restart", restart);
  }

  render();

  return () => {
    timers.forEach(clearInterval);
    timers.length = 0;
  };
}
