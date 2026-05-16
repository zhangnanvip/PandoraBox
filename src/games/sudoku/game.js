import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 9;
const BASE_SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const CLUES = {
  easy: [
    0, 1, 2, 4, 6, 8, 9, 11, 12, 13, 14, 17, 19, 20, 23, 25, 27, 28, 31, 32, 35, 36, 40, 44, 45, 48, 49, 52, 55, 57, 60, 61, 63, 66, 67, 68, 69, 71, 72, 74, 76, 78, 79, 80
  ],
  medium: [
    0, 2, 4, 8, 10, 12, 14, 17, 19, 23, 25, 27, 31, 35, 36, 40, 44, 45, 49, 53, 55, 57, 61, 63, 67, 69, 72, 76, 80
  ],
  hard: [
    0, 4, 8, 10, 14, 19, 23, 27, 31, 35, 40, 45, 49, 53, 57, 61, 66, 70, 72, 76, 80
  ],
  devil: [
    0, 8, 10, 14, 19, 23, 31, 35, 40, 45, 49, 57, 61, 66, 72, 76, 80
  ]
};

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function shuffledUnitOrder() {
  return shuffle([0, 1, 2]).flatMap((band) =>
    shuffle([0, 1, 2]).map((offset) => band * 3 + offset)
  );
}

function createPuzzle(difficulty) {
  const digits = shuffle(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  const digitMap = Object.fromEntries(digits.map((digit, index) => [String(index + 1), digit]));
  const rowOrder = shuffledUnitOrder();
  const colOrder = shuffledUnitOrder();
  const solution = Array.from({ length: SIZE * SIZE }, (_, index) => {
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    return digitMap[BASE_SOLUTION[rowOrder[row] * SIZE + colOrder[col]]];
  }).join("");
  const clueIndexes = new Set((CLUES[difficulty] || CLUES.medium).map((oldIndex) => {
    const oldRow = Math.floor(oldIndex / SIZE);
    const oldCol = oldIndex % SIZE;
    return rowOrder.indexOf(oldRow) * SIZE + colOrder.indexOf(oldCol);
  }));
  const puzzle = solution.split("").map((value, index) => (clueIndexes.has(index) ? value : "0")).join("");

  return {
    puzzle,
    solution,
    puzzleId: `${difficulty}-${Math.random().toString(36).slice(2, 7)}`
  };
}

function initialState(difficulty) {
  const { puzzle, solution, puzzleId } = createPuzzle(difficulty);
  return {
    puzzleId,
    puzzle,
    solution,
    values: puzzle.split("").map((value) => (value === "0" ? "" : value)),
    selected: puzzle.indexOf("0"),
    mistakes: 0,
    complete: false,
    history: [],
    message: "选择空格后填入数字"
  };
}

function isValidState(state) {
  return state?.puzzle?.length === SIZE * SIZE && state?.solution?.length === SIZE * SIZE && state?.values?.length === SIZE * SIZE;
}

function rowOf(index) {
  return Math.floor(index / SIZE);
}

function colOf(index) {
  return index % SIZE;
}

function boxOf(index) {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3);
}

function isPeer(a, b) {
  return rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b);
}

function hasConflict(values, index) {
  const value = values[index];
  if (!value) return false;
  return values.some((other, otherIndex) => otherIndex !== index && other === value && isPeer(index, otherIndex));
}

function isFixed(state, index) {
  return state.puzzle[index] !== "0";
}

function isSolved(state) {
  return state.values.join("") === state.solution;
}

export function mountSudoku(root, context) {
  const storageKey = `sudoku:${context.difficulty}`;
  let state = loadState(storageKey, initialState(context.difficulty));
  if (!isValidState(state)) state = initialState(context.difficulty);
  if (!Array.isArray(state.history)) state.history = [];
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
  }

  function snapshot() {
    return {
      values: [...state.values],
      selected: state.selected,
      mistakes: state.mistakes,
      complete: state.complete,
      message: state.message
    };
  }

  function restore(previous) {
    Object.assign(state, previous, {
      values: [...previous.values]
    });
  }

  function reportResult() {
    if (resultReported || !state.complete) return;
    resultReported = true;
    context.reportResult?.({
      outcome: "complete",
      detail: state.message,
      moves: state.history.length,
      score: Math.max(0, 1000 - state.mistakes * 80 - state.history.length * 3)
    });
  }

  function select(index) {
    state.selected = index;
    save();
    render();
  }

  function setValue(value) {
    if (state.complete || state.selected < 0 || isFixed(state, state.selected)) return;
    if (state.values[state.selected] === value) return;
    state.history.push(snapshot());
    state.values[state.selected] = value;
    if (value && value !== state.solution[state.selected]) {
      state.mistakes += 1;
      state.message = "这里暂时不对，再想一想";
    } else if (isSolved(state)) {
      state.complete = true;
      state.message = "完成数独";
      reportResult();
    } else {
      state.message = value ? "填入正确" : "已清除";
    }
    save();
    render();
  }

  function hint() {
    const index = state.selected >= 0 && !isFixed(state, state.selected) && state.values[state.selected] !== state.solution[state.selected]
      ? state.selected
      : state.values.findIndex((value, idx) => !isFixed(state, idx) && value !== state.solution[idx]);
    if (index < 0) return;
    state.history.push(snapshot());
    state.selected = index;
    state.values[index] = state.solution[index];
    state.message = `提示填入 ${state.solution[index]}`;
    state.complete = isSolved(state);
    reportResult();
    save();
    render();
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) return;
    restore(previous);
    save();
    render();
  }

  function check() {
    const wrong = state.values.findIndex((value, index) => value && value !== state.solution[index]);
    if (wrong >= 0) {
      state.selected = wrong;
      state.message = "发现一个冲突位置";
    } else if (state.values.some((value) => !value)) {
      state.message = "当前已填内容正确，还有空格";
    } else {
      state.complete = true;
      state.message = "完成数独";
      reportResult();
    }
    save();
    render();
  }

  function restart() {
    state = initialState(context.difficulty);
    resultReported = false;
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
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.difficulty} · 9x9 数独 · 随机题</p>
        </div>
        <div class="mini-stats">
          <span>错误 ${state.mistakes}</span>
          <span>${state.values.filter(Boolean).length}/81</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="sudoku-board" aria-label="数独棋盘">
          ${state.values.map((value, index) => {
            const selected = state.selected === index;
            const related = state.selected >= 0 && isPeer(state.selected, index);
            const fixed = isFixed(state, index);
            const conflict = hasConflict(state.values, index) || (value && value !== state.solution[index]);
            return `
              <button
                class="sudoku-cell ${fixed ? "is-fixed" : ""} ${selected ? "is-selected" : ""} ${related ? "is-related" : ""} ${conflict ? "is-error" : ""}"
                data-cell="${index}"
              >${value}</button>
            `;
          }).join("")}
        </div>
      </section>

      <section class="game-panel sudoku-pad" aria-label="数字面板">
        ${Array.from({ length: 9 }, (_, index) => `<button class="secondary-button" data-number="${index + 1}">${index + 1}</button>`).join("")}
        <button class="secondary-button" data-number="">清除</button>
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="secondary-button" data-action="hint">提示</button>
        <button class="secondary-button" data-action="check">检查</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((button) => {
      button.addEventListener("click", () => select(Number(button.dataset.cell)));
    });
    root.querySelectorAll("[data-number]").forEach((button) => {
      button.addEventListener("click", () => setValue(button.dataset.number));
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='hint']").addEventListener("click", hint);
    root.querySelector("[data-action='check']").addEventListener("click", check);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  window.addEventListener("keydown", handleKeydown);
  render();
  return () => {
    window.removeEventListener("keydown", handleKeydown);
  };
}
