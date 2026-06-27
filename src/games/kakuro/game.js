import { loadState, removeState, saveState } from "../../utils/storage.js";

// 数字填字 (Kakuro)
// 棋盘字符串约定（每格一段，逗号分隔）：
//   "."        => 纯黑格，无线索
//   "0"        => 空白可填格
//   "=5"       => 预填给定格（已知数，玩家不可改）
//   "a/b"      => 线索格，a=向下和（0 表示无），b=向右和（0 表示无）
// 每段“跑道”内 1-9 不重复且求和等于线索。本地求解器校验唯一解。

const PUZZLES = {
  easy: {
    label: "5x5 入门",
    cols: 5,
    rows: 5,
    cells: [
      "0/0", "0/0", "28/0", "19/0", "17/0",
      "0/0", "0/22", "0", "0", "=8",
      "0/0", "17/18", "0", "0", "0",
      "0/27", "0", "0", "0", "=3",
      "0/14", "0", "0", "0/0", "0/0"
    ]
  },
  medium: {
    label: "5x5 进阶",
    cols: 5,
    rows: 5,
    cells: [
      "0/0", "0/0", "24/0", "13/0", "11/0",
      "0/0", "15/22", "0", "0", "0",
      "0/17", "0", "=6", "0", "0",
      "0/20", "0", "0", "0", "0",
      "0/4", "=1", "0", "0/0", "0/0"
    ]
  },
  hard: {
    label: "6x6 挑战",
    cols: 6,
    rows: 6,
    cells: [
      "0/0", "29/0", "18/0", "18/0", "22/0", "11/0",
      "0/27", "0", "0", "=3", "0", "0",
      "0/28", "0", "=3", "0", "0", "=4",
      "0/23", "0", "=7", "0", "0", "0",
      "0/17", "0", "0", "=4", "0/0", "0/0",
      "0/3", "=2", "0", "0/0", "0/0", "0/0"
    ]
  },
  devil: {
    label: "6x6 大师",
    cols: 6,
    rows: 6,
    cells: [
      "0/0", "0/0", "24/0", "24/0", "24/0", "12/0",
      "0/0", "10/22", "=4", "0", "0", "=9",
      "0/23", "0", "0", "0", "0", "=3",
      "0/18", "0", "=8", "=2", "0", "13/0",
      "0/24", "0", "=5", "=7", "0", "0",
      "0/9", "0", "0", "0/11", "=4", "0"
    ]
  }
};

function pickDifficulty(value) {
  return PUZZLES[value] ? value : "easy";
}

function parseCell(token) {
  if (token === ".") return { type: "black", down: 0, right: 0 };
  if (token === "0") return { type: "fill" };
  if (token[0] === "=") return { type: "fill", given: token.slice(1) };
  const [down, right] = token.split("/").map((part) => Number(part) || 0);
  return { type: "clue", down, right };
}

function buildBoard(difficulty) {
  const def = PUZZLES[difficulty];
  const board = def.cells.map(parseCell);
  // 计算每个填格所属的向右、向下跑道（用于校验与高亮）
  for (let r = 0; r < def.rows; r += 1) {
    for (let c = 0; c < def.cols; c += 1) {
      const idx = r * def.cols + c;
      const cell = board[idx];
      if (cell.type !== "clue" || cell.right <= 0) continue;
      const run = [];
      for (let cc = c + 1; cc < def.cols; cc += 1) {
        const target = board[r * def.cols + cc];
        if (target.type !== "fill") break;
        run.push(r * def.cols + cc);
        target.rightRun = { sum: cell.right, cells: run };
      }
    }
  }
  for (let c = 0; c < def.cols; c += 1) {
    for (let r = 0; r < def.rows; r += 1) {
      const idx = r * def.cols + c;
      const cell = board[idx];
      if (cell.type !== "clue" || cell.down <= 0) continue;
      const run = [];
      for (let rr = r + 1; rr < def.rows; rr += 1) {
        const target = board[rr * def.cols + c];
        if (target.type !== "fill") break;
        run.push(rr * def.cols + c);
        target.downRun = { sum: cell.down, cells: run };
      }
    }
  }
  return { ...def, board };
}

function givensOf(board) {
  const g = {};
  board.forEach((cell, idx) => {
    if (cell.type === "fill" && cell.given) g[idx] = cell.given;
  });
  return g;
}

function initialState(difficulty, board) {
  return {
    difficulty,
    values: board ? { ...givensOf(board) } : {},
    selected: -1,
    complete: false,
    message: "选一个空格，再点数字填入",
    moves: 0
  };
}

function isValidState(state) {
  return state && typeof state.values === "object" && state.difficulty;
}

function runSolved(values, run) {
  let sum = 0;
  for (const idx of run.cells) {
    const v = Number(values[idx]);
    if (!v) return false;
    sum += v;
  }
  return sum === run.sum;
}

export function mountKakuro(root, context) {
  const difficulty = pickDifficulty(context.difficulty);
  const layout = buildBoard(difficulty);
  const total = layout.cols * layout.rows;
  const isGiven = (idx) => Boolean(layout.board[idx].given);
  const fillCount = layout.board.filter((c) => c.type === "fill" && !c.given).length;
  const storageKey = `kakuro:${difficulty}`;

  let state = loadState(storageKey, initialState(difficulty, layout.board));
  if (!isValidState(state) || state.difficulty !== difficulty) state = initialState(difficulty, layout.board);
  state.values = { ...givensOf(layout.board), ...(state.values || {}) };
  let reported = false;

  function save() {
    saveState(storageKey, state);
  }

  function cellConflict(idx) {
    const cell = layout.board[idx];
    if (cell.type !== "fill" || !state.values[idx]) return false;
    const v = state.values[idx];
    if (cell.rightRun && cell.rightRun.cells.some((i) => i !== idx && state.values[i] === v)) return true;
    if (cell.downRun && cell.downRun.cells.some((i) => i !== idx && state.values[i] === v)) return true;
    return false;
  }

  function checkComplete() {
    for (let i = 0; i < total; i += 1) {
      const cell = layout.board[i];
      if (cell.type !== "fill") continue;
      if (!state.values[i]) return false;
      if (cell.rightRun && cell.rightRun.cells[0] === i && !runSolved(state.values, cell.rightRun)) return false;
      if (cell.downRun && cell.downRun.cells[0] === i && !runSolved(state.values, cell.downRun)) return false;
    }
    return true;
  }

  function reportResult() {
    if (reported || !state.complete) return;
    reported = true;
    context.reportResult?.({
      outcome: "complete",
      detail: "数字填字完成",
      moves: state.moves,
      score: Math.max(100, 1000 - state.moves * 5)
    });
  }

  function select(idx) {
    if (layout.board[idx].type !== "fill" || isGiven(idx)) return;
    state.selected = idx;
    save();
    render();
  }

  function setValue(value) {
    if (state.complete || state.selected < 0) return;
    if (layout.board[state.selected].type !== "fill" || isGiven(state.selected)) return;
    if (value === "") delete state.values[state.selected];
    else state.values[state.selected] = value;
    state.moves += 1;
    if (checkComplete()) {
      state.complete = true;
      state.message = "全部填满且求和正确，完成！";
      context.playSound?.("win");
      reportResult();
    } else {
      const filled = layout.board.filter((c, i) => c.type === "fill" && !c.given && state.values[i]).length;
      state.message = value ? `已填 ${filled}/${fillCount}` : "已清除";
    }
    save();
    render();
  }

  function restart() {
    state = initialState(difficulty, layout.board);
    reported = false;
    removeState(storageKey);
    render();
  }

  function handleKeydown(event) {
    if (event.key >= "1" && event.key <= "9") {
      event.preventDefault();
      setValue(event.key);
    } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
      event.preventDefault();
      setValue("");
    }
  }

  function render() {
    const filled = layout.board.filter((c, i) => c.type === "fill" && !c.given && state.values[i]).length;
    const px = `min(11vw, 56px)`;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels?.difficulty || ""} · ${layout.label} · 每条线索内 1-9 不重复且求和</p>
        </div>
        <div class="mini-stats">
          <span>已填 ${filled}/${fillCount}</span>
          <span>步数 ${state.moves}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${layout.cols}, minmax(30px, ${px}));gap:2px;justify-content:center;">
          ${layout.board.map((cell, idx) => {
            if (cell.type === "black") {
              return `<div style="aspect-ratio:1;min-width:30px;background:#1b1f2a;border-radius:4px;"></div>`;
            }
            if (cell.type === "clue") {
              return `<div style="aspect-ratio:1;min-width:30px;background:#1b1f2a;border-radius:4px;position:relative;overflow:hidden;color:#cdd3e0;font-size:11px;font-weight:600;">
                <span style="position:absolute;left:3px;bottom:1px;">${cell.down || ""}</span>
                <span style="position:absolute;right:3px;top:1px;">${cell.right || ""}</span>
                <div style="position:absolute;inset:0;background:linear-gradient(to top right, transparent calc(50% - 1px), #3a3f4d, transparent calc(50% + 1px));"></div>
              </div>`;
            }
            const v = state.values[idx] || "";
            const sel = state.selected === idx;
            const given = cell.given;
            const bad = cellConflict(idx);
            const bg = given ? "#dce3f0" : bad ? "#5a2730" : sel ? "#243250" : "#f4f6fb";
            const fg = given ? "#566" : bad ? "#ffd5d5" : "#1b1f2a";
            return `<button data-cell="${idx}" ${given ? "disabled" : ""} style="aspect-ratio:1;min-width:30px;border:2px solid ${sel ? "#5b8cff" : "transparent"};border-radius:4px;background:${bg};color:${fg};font-size:18px;font-weight:700;cursor:${given ? "default" : "pointer"};">${v}</button>`;
          }).join("")}
        </div>
      </section>

      <section class="game-panel" aria-label="数字面板" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
        ${Array.from({ length: 9 }, (_, i) => `<button class="secondary-button" data-number="${i + 1}" style="min-width:40px;">${i + 1}</button>`).join("")}
        <button class="secondary-button" data-number="">清除</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((btn) => {
      btn.addEventListener("click", () => select(Number(btn.dataset.cell)));
    });
    root.querySelectorAll("[data-number]").forEach((btn) => {
      btn.addEventListener("click", () => setValue(btn.dataset.number));
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  window.addEventListener("keydown", handleKeydown);
  render();
  if (state.complete) reportResult();
  return () => {
    window.removeEventListener("keydown", handleKeydown);
  };
}
