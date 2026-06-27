import { shuffle, choice, clamp } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

// 32 款四字成语库；玩家点字把乱序还原成正确顺序
const IDIOMS = [
  { word: "画蛇添足", hint: "多此一举反坏事" },
  { word: "守株待兔", hint: "死守经验不变通" },
  { word: "亡羊补牢", hint: "出事后及时补救" },
  { word: "井底之蛙", hint: "见识短浅的人" },
  { word: "对牛弹琴", hint: "对外行讲道理" },
  { word: "杯弓蛇影", hint: "疑神疑鬼自惊扰" },
  { word: "狐假虎威", hint: "仗势欺人" },
  { word: "刻舟求剑", hint: "拘泥成法不变通" },
  { word: "掩耳盗铃", hint: "自欺欺人" },
  { word: "叶公好龙", hint: "爱虚名非真好" },
  { word: "画龙点睛", hint: "关键一笔更生动" },
  { word: "鹤立鸡群", hint: "才貌远超众人" },
  { word: "雪中送炭", hint: "困境中给帮助" },
  { word: "锦上添花", hint: "好上加好" },
  { word: "破釜沉舟", hint: "下决心不退路" },
  { word: "卧薪尝胆", hint: "刻苦自励图强" },
  { word: "愚公移山", hint: "坚持终能成功" },
  { word: "胸有成竹", hint: "事前已有把握" },
  { word: "一鸣惊人", hint: "一举成名" },
  { word: "塞翁失马", hint: "坏事或变好事" },
  { word: "望梅止渴", hint: "用空想安慰" },
  { word: "纸上谈兵", hint: "空谈不务实" },
  { word: "滥竽充数", hint: "无本事凑数" },
  { word: "拔苗助长", hint: "急于求成受害" },
  { word: "守口如瓶", hint: "严守秘密" },
  { word: "水落石出", hint: "真相终大白" },
  { word: "百发百中", hint: "射击非常准" },
  { word: "门庭若市", hint: "来客非常多" },
  { word: "津津有味", hint: "兴趣很浓厚" },
  { word: "全力以赴", hint: "竭尽全部力量" },
  { word: "自相矛盾", hint: "言行前后冲突" },
  { word: "齐心协力", hint: "团结一致使力" }
];

const ROUNDS = 8;
const BASE_TIME = 90; // 秒，全局倒计时
const HINT_PENALTY = 8; // 每次提示扣时间
const SCORE_PER_ROUND = 100;

function chars(word) {
  return Array.from(word);
}

// 洗到与原序不同，避免一上来就是答案
function scramble(letters) {
  let order = shuffle(letters);
  let guard = 0;
  while (order.join("") === letters.join("") && guard < 12) {
    order = shuffle(letters);
    guard += 1;
  }
  return order;
}

function buildRound(used) {
  let entry = choice(IDIOMS);
  let guard = 0;
  while (used.includes(entry.word) && used.length < IDIOMS.length && guard < 40) {
    entry = choice(IDIOMS);
    guard += 1;
  }
  const letters = chars(entry.word);
  return {
    word: entry.word,
    hint: entry.hint,
    letters,
    tiles: scramble(letters), // 乱序候选字
    placed: [], // 玩家已选下标序列
    solved: false,
    hinted: 0
  };
}

function initialState() {
  const first = buildRound([]);
  return {
    round: 0,
    score: 0,
    solved: 0,
    used: [first.word],
    timeLeft: BASE_TIME,
    current: first,
    done: false,
    failed: false
  };
}

function isValid(state) {
  return (
    state &&
    typeof state.round === "number" &&
    state.current &&
    Array.isArray(state.current.letters) &&
    Array.isArray(state.current.tiles)
  );
}

export function mountAnagram(root, context) {
  const storageKey = `anagram:${context.mode || "solo"}`;
  let state =
    (context.savedState && isValid(context.savedState) ? context.savedState : null) ||
    (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValid(legacy) ? legacy : initialState();
    })();
  if (state.timeLeft == null) state.timeLeft = BASE_TIME;

  let disposed = false;
  let reported = false;
  let timer = 0;
  let advanceTimer = 0;

  function save() {
    saveState(storageKey, state);
    if (context.saveSession && !state.done) {
      context.saveSession(state, {
        stage: `第 ${state.round + 1}/${ROUNDS} 关`,
        level: state.round,
        score: state.score
      });
    } else if (context.clearSession && state.done) {
      context.clearSession();
    }
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
  }

  function tick() {
    if (disposed || state.done) return;
    if (context.isPaused && context.isPaused()) return;
    state.timeLeft = clamp(state.timeLeft - 1, 0, BASE_TIME);
    if (state.timeLeft <= 0) {
      state.failed = true;
      state.done = true;
      stopTimer();
      save();
      finish();
    }
    render();
  }

  function startTimer() {
    stopTimer();
    if (state.done) return;
    timer = window.setInterval(tick, 1000);
  }

  // 点候选字 -> 落到答案下一格
  function pickTile(i) {
    const c = state.current;
    if (c.solved || state.done) return;
    if (c.placed.includes(i)) return;
    c.placed.push(i);
    context.playSound?.("place");
    if (c.placed.length === c.letters.length) {
      const guess = c.placed.map((idx) => c.tiles[idx]).join("");
      if (guess === c.word) {
        c.solved = true;
        const bonus = Math.round((c.hinted ? 0.6 : 1) * SCORE_PER_ROUND);
        state.score += bonus;
        state.solved += 1;
        context.playSound?.("win");
        advanceTimer = window.setTimeout(advance, 650);
      } else {
        context.playSound?.("error");
        c.placed = []; // 错了清空重排
      }
    }
    save();
    render();
  }

  // 撤销最后一格
  function undo() {
    const c = state.current;
    if (c.solved || !c.placed.length) return;
    c.placed.pop();
    save();
    render();
  }

  // 提示：自动落对下一格，扣时间
  function hint() {
    const c = state.current;
    if (c.solved || state.done) return;
    const slot = c.placed.length;
    if (slot >= c.letters.length) return;
    const want = c.letters[slot];
    const idx = c.tiles.findIndex((t, i) => t === want && !c.placed.includes(i));
    if (idx < 0) return;
    c.placed.push(idx);
    c.hinted += 1;
    state.timeLeft = clamp(state.timeLeft - HINT_PENALTY, 0, BASE_TIME);
    context.playSound?.("place");
    if (c.placed.length === c.letters.length && c.placed.map((k) => c.tiles[k]).join("") === c.word) {
      c.solved = true;
      state.score += Math.round(0.6 * SCORE_PER_ROUND);
      state.solved += 1;
      advanceTimer = window.setTimeout(advance, 650);
    }
    save();
    render();
  }

  // 换题：跳过当前，不计分
  function skip() {
    const c = state.current;
    if (state.done || c.solved) return;
    state.round += 1;
    if (state.round >= ROUNDS) {
      state.done = true;
      stopTimer();
      save();
      finish();
    } else {
      state.current = buildRound(state.used);
      state.used.push(state.current.word);
      save();
    }
    render();
  }

  function advance() {
    if (disposed) return;
    if (state.round + 1 >= ROUNDS) {
      state.done = true;
      stopTimer();
      save();
      finish();
    } else {
      state.round += 1;
      state.current = buildRound(state.used);
      state.used.push(state.current.word);
      save();
    }
    render();
  }

  function finish() {
    if (reported) return;
    reported = true;
    context.reportResult?.({
      outcome: state.failed ? "score" : "complete",
      detail: state.failed ? `超时 · 答对 ${state.solved}/${ROUNDS}` : `通关 ${state.solved}/${ROUNDS} · 余 ${state.timeLeft}s`,
      score: state.score,
      moves: state.round + 1
    });
  }

  function restart() {
    clearTimeout(advanceTimer);
    state = initialState();
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    startTimer();
    render();
  }

  function render() {
    const c = state.current;
    // 答案槽：按已选顺序显示
    const slots = c.letters
      .map((_, i) => {
        const tile = c.placed[i] != null ? c.tiles[c.placed[i]] : "";
        return `<div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;border-radius:14px;${
          tile
            ? "border:2px solid var(--accent,#7c5cff);background:rgba(124,92,255,.12)"
            : "border:2px dashed rgba(128,128,128,.4)"
        }">${tile}</div>`;
      })
      .join("");

    const tiles = c.tiles
      .map((t, i) => {
        const used = c.placed.includes(i);
        return `<button type="button" class="secondary-button" data-tile="${i}" ${
          used || c.solved ? "disabled" : ""
        } style="min-width:56px;min-height:56px;font-size:26px;padding:6px;${used ? "opacity:.25;" : ""}">${t}</button>`;
      })
      .join("");

    const low = state.timeLeft <= 15;
    const title = state.done ? (state.failed ? "时间到 ⏰" : "全部通关 🎉") : "乱序成词";

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${title}</strong>
          <p class="game-note">提示：${c.hint}${c.solved ? " · 正确 ✔" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>关 ${Math.min(state.round + 1, ROUNDS)}/${ROUNDS}</span>
          <span>分 ${state.score}</span>
          <span style="${low ? "color:#e5484d;font-weight:700;" : ""}">⏱ ${state.timeLeft}s</span>
        </div>
      </section>

      <section class="board-wrap" style="display:flex;flex-direction:column;gap:18px;align-items:center;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">${slots}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:360px;">${tiles}</div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${c.solved || !c.placed.length ? "disabled" : ""}>撤回</button>
        <button class="secondary-button" data-action="hint" ${c.solved || state.done ? "disabled" : ""}>提示 -${HINT_PENALTY}s</button>
        <button class="secondary-button" data-action="skip" ${c.solved || state.done ? "disabled" : ""}>换题</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-tile]").forEach((b) =>
      b.addEventListener("click", () => {
        b.blur();
        pickTile(Number(b.dataset.tile));
      })
    );
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='hint']").addEventListener("click", hint);
    root.querySelector("[data-action='skip']").addEventListener("click", skip);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  if (state.done) finish();
  else startTimer();
  render();

  return () => {
    disposed = true;
    stopTimer();
    clearTimeout(advanceTimer);
  };
}
