import { loadState, removeState, saveState } from "../../utils/storage.js";

// 数谜 (KenKen)
// N×N 拉丁方：每行、每列填 1..N 不重复；棋盘按“笼 (cage)”分组。
// 每笼标注一个目标数与运算（+ − × ÷），笼内格子做该运算须等于目标。
// 减/除为两格、与顺序无关（取差/取商）；单格笼即给定数。
// 下列 3 题（4x4 / 5x5 / 6x6）均为手工生成并校验：无给定提示、笼连通、唯一解。

const PUZZLES = {
  easy: {
    label: "4x4 入门",
    n: 4,
    // 解: 1342 / 3421 / 2134 / 4213
    cells: ["a","b","b","c", "a","d","d","c", "e","e","f","g", "h","h","f","g"],
    cages: { a:["−",2], b:["×",12], c:["×",2], d:["−",2], e:["×",2], f:["×",3], g:["×",12], h:["−",2] }
  },
  medium: {
    label: "5x5 进阶",
    n: 5,
    // 解: 31425 / 42351 / 15243 / 54132 / 23514
    cells: ["a","a","b","c","c", "d","d","b","e","c", "f","f","g","e","h", "i","f","g","j","h", "i","k","k","j","h"],
    cages: { a:["×",3], b:["−",1], c:["×",10], d:["÷",2], e:["−",1], f:["×",20], g:["÷",2], h:["×",24], i:["×",10], j:["×",3], k:["×",15] }
  },
  hard: {
    label: "6x6 挑战",
    n: 6,
    // 解: 245316 / 561234 / 126453 / 312645 / 453162 / 634521
    cells: [
      "a","a","b","b","c","c", "d","d","e","f","c","g", "h","h","e","f","i","g",
      "j","k","l","l","i","m", "j","k","n","o","o","m", "p","p","n","o","q","q"
    ],
    cages: { a:["÷",2], b:["−",2], c:["×",18], d:["×",30], e:["+",7], f:["−",2], g:["−",1], h:["−",1], i:["×",20], j:["−",1], k:["÷",5], l:["÷",3], m:["−",3], n:["−",1], o:["+",12], p:["÷",2], q:["×",2] }
  }
};

const OPSIGN = { "+": "+", "−": "−", "×": "×", "÷": "÷", "=": "" };

function pickDifficulty(value) {
  return PUZZLES[value] ? value : "easy";
}

function buildLayout(difficulty) {
  const def = PUZZLES[difficulty];
  const n = def.n;
  // 每个笼的格子集合 + 标签锚点(最小 index)
  const groups = {};
  def.cells.forEach((lab, idx) => { (groups[lab] ||= []).push(idx); });
  const cageOf = def.cells;
  const labelIdx = {};
  Object.entries(groups).forEach(([lab, cells]) => { labelIdx[lab] = Math.min(...cells); });
  return { n, total: n * n, label: def.label, cages: def.cages, groups, cageOf, labelIdx };
}

function cageEval(op, target, vals) {
  if (vals.some((v) => !v)) return null; // 尚未填满
  if (op === "+") return vals.reduce((a, b) => a + b, 0) === target;
  if (op === "×") return vals.reduce((a, b) => a * b, 1) === target;
  if (op === "−") return Math.abs(vals[0] - vals[1]) === target;
  if (op === "÷") return Math.max(vals[0], vals[1]) / Math.min(vals[0], vals[1]) === target;
  if (op === "=") return vals[0] === target;
  return false;
}

function initialState(difficulty) {
  return { difficulty, values: {}, selected: -1, complete: false, message: "选格子，再点数字填入", moves: 0 };
}

function isValidState(state, difficulty) {
  return state && typeof state.values === "object" && state.difficulty === difficulty;
}

export function mountKenken(root, context) {
  const difficulty = pickDifficulty(context.difficulty);
  const layout = buildLayout(difficulty);
  const { n, total } = layout;
  const storageKey = `kenken:${difficulty}`;

  let state = loadState(storageKey, initialState(difficulty));
  if (!isValidState(state, difficulty)) state = initialState(difficulty);
  state.values = state.values || {};
  let reported = false;

  const save = () => saveState(storageKey, state);
  const valAt = (i) => Number(state.values[i]) || 0;
  const filledCount = () => Object.keys(state.values).filter((k) => state.values[k]).length;

  // 行列重复冲突高亮
  function conflict(idx) {
    if (!state.values[idx]) return false;
    const r = (idx / n) | 0, c = idx % n, v = state.values[idx];
    for (let k = 0; k < n; k += 1) {
      if (k !== c && state.values[r * n + k] === v) return true;
      if (k !== r && state.values[k * n + c] === v) return true;
    }
    return false;
  }

  function checkComplete() {
    for (let i = 0; i < total; i += 1) if (!state.values[i]) return false;
    // 行列拉丁方
    for (let r = 0; r < n; r += 1) {
      const rs = new Set(), cs = new Set();
      for (let c = 0; c < n; c += 1) { rs.add(valAt(r * n + c)); cs.add(valAt(c * n + r)); }
      if (rs.size !== n || cs.size !== n) return false;
    }
    // 每笼算式
    for (const [lab, cells] of Object.entries(layout.groups)) {
      const [op, target] = layout.cages[lab];
      if (cageEval(op, target, cells.map(valAt)) !== true) return false;
    }
    return true;
  }

  function finish() {
    if (reported || !state.complete) return;
    reported = true;
    context.reportResult?.({ outcome: "complete", detail: `数谜 ${layout.label} 完成`, moves: state.moves, score: Math.max(120, 1000 - state.moves * 6) });
  }

  function select(idx) {
    state.selected = idx;
    save();
    render();
  }

  function setValue(v) {
    if (state.complete || state.selected < 0) return;
    if (v === "") delete state.values[state.selected];
    else if (Number(v) <= n) state.values[state.selected] = Number(v);
    else return;
    state.moves += 1;
    if (checkComplete()) {
      state.complete = true;
      state.message = "拉丁方与全部算式正确，完成！";
      context.playSound?.("win");
      finish();
    } else {
      state.message = v ? `已填 ${filledCount()}/${total}` : "已清除";
    }
    save();
    render();
  }

  function restart() {
    state = initialState(difficulty);
    reported = false;
    removeState(storageKey);
    render();
  }

  function handleKeydown(event) {
    if (event.key >= "1" && event.key <= String(n)) { event.preventDefault(); setValue(event.key); }
    else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") { event.preventDefault(); setValue(""); }
  }

  function render() {
    const cell = `clamp(40px, ${Math.floor(86 / n)}vw, 60px)`;
    const cells = Array.from({ length: total }, (_, idx) => {
      const lab = layout.cageOf[idx];
      const r = (idx / n) | 0, c = idx % n;
      const top = r === 0 || layout.cageOf[idx - n] !== lab;
      const left = c === 0 || layout.cageOf[idx - 1] !== lab;
      const right = c === n - 1 || layout.cageOf[idx + 1] !== lab;
      const bottom = r === n - 1 || layout.cageOf[idx + n] !== lab;
      const thick = "2px solid #2b3550", thin = "1px solid #c4cbdb";
      const sel = state.selected === idx;
      const bad = conflict(idx);
      const v = state.values[idx] || "";
      const tag = layout.labelIdx[lab] === idx ? `${layout.cages[lab][1]}${OPSIGN[layout.cages[lab][0]]}` : "";
      const bg = bad ? "#5a2730" : sel ? "#243250" : "#f4f6fb";
      const fg = bad ? "#ffd5d5" : sel ? "#fff" : "#1b1f2a";
      return `<button data-cell="${idx}" style="position:relative;width:${cell};height:${cell};box-sizing:border-box;background:${bg};color:${fg};font-size:20px;font-weight:700;cursor:pointer;border-top:${top?thick:thin};border-left:${left?thick:thin};border-right:${right?thick:thin};border-bottom:${bottom?thick:thin};border-radius:${top&&left?"6px":"0"} ${top&&right?"6px":"0"} ${bottom&&right?"6px":"0"} ${bottom&&left?"6px":"0"};">
        <span style="position:absolute;top:1px;left:3px;font-size:11px;font-weight:600;color:${sel?"#bcd":"#5b6781"};">${tag}</span>${v}</button>`;
    }).join("");

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels?.difficulty || ""} · ${layout.label} · 行列填 1-${n} 不重复, 每笼算式达标</p>
        </div>
        <div class="mini-stats"><span>已填 ${filledCount()}/${total}</span><span>步数 ${state.moves}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${n}, max-content);gap:0;justify-content:center;">${cells}</div>
      </section>
      <section class="game-panel" aria-label="数字面板" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
        ${Array.from({ length: n }, (_, i) => `<button class="secondary-button" data-number="${i + 1}" style="min-width:40px;">${i + 1}</button>`).join("")}
        <button class="secondary-button" data-number="">清除</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>`;

    root.querySelectorAll("[data-cell]").forEach((b) => b.addEventListener("click", () => select(Number(b.dataset.cell))));
    root.querySelectorAll("[data-number]").forEach((b) => b.addEventListener("click", () => setValue(b.dataset.number)));
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  window.addEventListener("keydown", handleKeydown);
  render();
  if (state.complete) finish();
  return () => { window.removeEventListener("keydown", handleKeydown); };
}
