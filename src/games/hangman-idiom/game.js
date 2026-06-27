import { shuffle, choice } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

// 20+ 四字成语库；按错次给出渐进提示
const IDIOMS = [
  { word: "画蛇添足", hint: "多此一举，反而坏事" },
  { word: "守株待兔", hint: "死守经验，不知变通" },
  { word: "亡羊补牢", hint: "出问题后及时补救" },
  { word: "井底之蛙", hint: "见识短浅的人" },
  { word: "对牛弹琴", hint: "对不懂的人讲道理" },
  { word: "杯弓蛇影", hint: "疑神疑鬼自相惊扰" },
  { word: "狐假虎威", hint: "倚仗别人威势吓唬人" },
  { word: "刻舟求剑", hint: "拘泥成法不知变通" },
  { word: "掩耳盗铃", hint: "自欺欺人骗不了别人" },
  { word: "叶公好龙", hint: "只爱虚名并非真喜欢" },
  { word: "画龙点睛", hint: "关键一笔使整体生动" },
  { word: "鹤立鸡群", hint: "才能仪表远超众人" },
  { word: "雪中送炭", hint: "困境中给予帮助" },
  { word: "锦上添花", hint: "好上加好更显美好" },
  { word: "破釜沉舟", hint: "下定决心不留退路" },
  { word: "卧薪尝胆", hint: "刻苦自励发愤图强" },
  { word: "愚公移山", hint: "坚持不懈终能成功" },
  { word: "胸有成竹", hint: "做事前已有把握" },
  { word: "井然有序", hint: "整齐而不混乱" },
  { word: "一鸣惊人", hint: "平时无名一举成名" },
  { word: "塞翁失马", hint: "坏事或可变成好事" },
  { word: "望梅止渴", hint: "用空想安慰自己" },
  { word: "纸上谈兵", hint: "空谈理论不能解决实际" },
  { word: "滥竽充数", hint: "无本事冒充凑数" },
  { word: "拔苗助长", hint: "急于求成反受其害" }
];

const ROUNDS = 5;
const MAX_WRONG = 5;

function chars(word) {
  return Array.from(word);
}

function buildRound() {
  const entry = choice(IDIOMS);
  const letters = chars(entry.word);
  // 随机抠掉约一半的字
  const idx = shuffle(letters.map((_, i) => i));
  const blanksCount = Math.max(1, Math.floor(letters.length / 2));
  const blanks = idx.slice(0, blanksCount).sort((a, b) => a - b);
  // 候选 = 正确缺字 + 干扰字，去重后凑满
  const pool = new Set(blanks.map((i) => letters[i]));
  const distract = "天地人风云山水火木金石春秋日月光明心安喜乐高强行知";
  for (const c of shuffle(chars(distract))) {
    if (pool.size >= blanksCount + 5) break;
    pool.add(c);
  }
  return {
    word: entry.word,
    hint: entry.hint,
    letters,
    blanks,
    filled: blanks.map(() => ""),
    tiles: shuffle([...pool]),
    wrong: 0,
    revealed: false,
    solved: false
  };
}

function initialState() {
  return { round: 0, solved: 0, lost: 0, current: buildRound(), done: false };
}

function isValid(state) {
  return state && typeof state.round === "number" && state.current && Array.isArray(state.current.letters);
}

export function mountHangman(root, context) {
  const storageKey = `hangman-idiom:${context.mode || "solo"}`;
  let state =
    (context.savedState && isValid(context.savedState) ? context.savedState : null) ||
    (() => {
      const legacy = loadState(storageKey, null);
      return legacy && isValid(legacy) ? legacy : initialState();
    })();
  let disposed = false;
  let reported = false;

  function save() {
    saveState(storageKey, state);
    if (context.saveSession && !state.done) {
      context.saveSession(state, { stage: `第 ${state.round + 1}/${ROUNDS} 关`, level: state.round, score: state.solved });
    } else if (context.clearSession && state.done) {
      context.clearSession();
    }
  }

  function nextBlank() {
    return state.current.filled.findIndex((c) => !c);
  }

  function pick(ch) {
    const c = state.current;
    if (c.solved || state.done) return;
    const slot = nextBlank();
    if (slot < 0) return;
    if (ch === c.letters[c.blanks[slot]]) {
      c.filled[slot] = ch;
      context.playSound?.("place");
      if (c.filled.every(Boolean)) {
        c.solved = true;
        state.solved += 1;
        context.playSound?.("win");
        window.setTimeout(advance, 650);
      }
    } else {
      c.wrong += 1;
      context.playSound?.("error");
      if (c.wrong >= MAX_WRONG) {
        c.revealed = true;
        c.blanks.forEach((b, i) => (c.filled[i] = c.letters[b]));
        c.solved = true;
        state.lost += 1;
        window.setTimeout(advance, 900);
      }
    }
    save();
    render();
  }

  function advance() {
    if (disposed) return;
    if (state.round + 1 >= ROUNDS) {
      state.done = true;
      save();
      finish();
    } else {
      state.round += 1;
      state.current = buildRound();
      save();
    }
    render();
  }

  function reveal() {
    const c = state.current;
    const slot = nextBlank();
    if (c.solved || slot < 0) return;
    c.filled[slot] = c.letters[c.blanks[slot]];
    c.tiles = c.tiles.filter((t) => t !== c.filled[slot] || c.filled.filter((x) => x === c.filled[slot]).length > 1);
    if (c.filled.every(Boolean)) {
      c.solved = true;
      state.solved += 1;
      window.setTimeout(advance, 650);
    }
    save();
    render();
  }

  function finish() {
    if (reported) return;
    reported = true;
    context.reportResult?.({
      outcome: "complete",
      detail: `通关 ${state.solved}/${ROUNDS}`,
      score: state.solved,
      moves: state.round + 1
    });
  }

  function restart() {
    state = initialState();
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function render() {
    const c = state.current;
    const slots = c.letters
      .map((ch, i) => {
        const bi = c.blanks.indexOf(i);
        const isBlank = bi >= 0;
        const val = isBlank ? c.filled[bi] : ch;
        return `<div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;border-radius:14px;${
          isBlank
            ? `border:2px dashed var(--accent,#7c5cff);color:var(--accent,#7c5cff);background:rgba(124,92,255,.08)`
            : "border:2px solid rgba(128,128,128,.25)"
        }">${val || ""}</div>`;
      })
      .join("");

    const tiles = c.tiles
      .map(
        (t) =>
          `<button type="button" class="secondary-button" data-tile="${t}" ${c.solved ? "disabled" : ""} style="min-width:48px;min-height:48px;font-size:24px;padding:6px;">${t}</button>`
      )
      .join("");

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.done ? "全部通关 🎉" : "成语猜字"}</strong>
          <p class="game-note">提示：${c.hint}${c.revealed ? " · 已揭晓答案" : ""}</p>
        </div>
        <div class="mini-stats">
          <span>关 ${Math.min(state.round + 1, ROUNDS)}/${ROUNDS}</span>
          <span>过 ${state.solved}</span>
          <span>错 ${c.wrong}/${MAX_WRONG}</span>
        </div>
      </section>

      <section class="board-wrap" style="display:flex;flex-direction:column;gap:18px;align-items:center;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">${slots}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:360px;">${tiles}</div>
      </section>

      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="hint" ${c.solved ? "disabled" : ""}>提示一字</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-tile]").forEach((b) =>
      b.addEventListener("click", () => {
        b.blur();
        pick(b.dataset.tile);
      })
    );
    root.querySelector("[data-action='hint']").addEventListener("click", reveal);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  if (state.done) finish();
  render();

  return () => {
    disposed = true;
  };
}
