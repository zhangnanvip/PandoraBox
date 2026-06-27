import { loadState, removeState, saveState } from "../../utils/storage.js";

const MIN_DISKS = 3;
const MAX_DISKS = 7;
const DISK_COLORS = ["#ff7676", "#ffb347", "#ffe066", "#7bd88f", "#5cc8ff", "#9d8bff", "#ff8bd0"];

function diskCount(options = {}, difficulty = "medium") {
  const byDifficulty = { easy: 3, medium: 4, hard: 5, devil: 6 };
  const raw = Number.parseInt(options.disks, 10);
  const value = Number.isFinite(raw) ? raw : byDifficulty[difficulty] ?? 4;
  return Math.min(MAX_DISKS, Math.max(MIN_DISKS, value));
}

function optimal(n) {
  return Math.pow(2, n) - 1;
}

function initialState(disks) {
  const pegs = [[], [], []];
  for (let size = disks; size >= 1; size -= 1) pegs[0].push(size);
  return {
    disks,
    pegs,
    selected: null,
    moves: 0,
    complete: false,
    message: "把全部圆盘移到最右柱"
  };
}

function isValidState(state, disks) {
  if (!state || state.disks !== disks || !Array.isArray(state.pegs) || state.pegs.length !== 3) return false;
  const seen = new Set();
  for (const peg of state.pegs) {
    if (!Array.isArray(peg)) return false;
    for (const size of peg) {
      if (!Number.isInteger(size) || size < 1 || size > disks || seen.has(size)) return false;
      seen.add(size);
    }
  }
  return seen.size === disks;
}

export function mountHanoi(root, context) {
  const disks = diskCount(context.options, context.difficulty);
  const best = optimal(disks);
  const storageKey = `hanoi:${context.difficulty}:${disks}`;
  let state = loadState(storageKey, initialState(disks));
  if (!isValidState(state, disks)) state = initialState(disks);
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
  }

  function reportResult() {
    if (resultReported || !state.complete) return;
    resultReported = true;
    context.reportResult?.({
      outcome: "complete",
      detail: state.message,
      moves: state.moves,
      score: Math.max(0, best * 100 - (state.moves - best) * 50)
    });
  }

  function tapPeg(index) {
    if (state.complete) return;
    const peg = state.pegs[index];
    if (state.selected === null) {
      if (!peg.length) {
        state.message = "这根柱子是空的，换一根";
        context.playSound?.("invalid");
        render();
        return;
      }
      state.selected = index;
      state.message = "已抬起，点目标柱放下";
    } else if (state.selected === index) {
      state.selected = null;
      state.message = "已放回原柱";
    } else {
      const from = state.pegs[state.selected];
      const top = from[from.length - 1];
      const onto = peg[peg.length - 1];
      if (onto && top > onto) {
        state.message = "大盘不能压小盘";
        context.playSound?.("invalid");
        state.selected = null;
        render();
        return;
      }
      from.pop();
      peg.push(top);
      state.moves += 1;
      state.selected = null;
      if (state.pegs[2].length === state.disks) {
        state.complete = true;
        state.message = `通关，用 ${state.moves} 步（最优 ${best}）`;
        reportResult();
      } else {
        state.message = `已移动 ${state.moves} 步`;
        context.playSound?.("move");
      }
    }
    save();
    render();
  }

  function restart() {
    state = initialState(disks);
    resultReported = false;
    removeState(storageKey);
    render();
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels.difficulty} · ${disks} 盘 · 最优 ${best} 步 · 点柱抬起再点柱放下</p>
        </div>
        <div class="mini-stats">
          <span>步数 ${state.moves}</span>
          <span>最优 ${best}</span>
          <span>${state.complete ? "完成" : "进行中"}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div class="hanoi-board" style="display:flex;gap:8px;align-items:flex-end;max-width:360px;margin:0 auto;height:200px;">
          ${state.pegs.map((peg, i) => `
            <button data-peg="${i}" aria-label="第${i + 1}根柱子"
              style="flex:1;display:flex;flex-direction:column-reverse;align-items:center;justify-content:flex-start;gap:4px;height:100%;border:none;border-radius:10px;cursor:pointer;padding:0 0 8px;background:${state.selected === i ? "rgba(124,216,143,.18)" : "rgba(255,255,255,.05)"};box-shadow:inset 0 -6px 0 rgba(255,255,255,.12);position:relative;">
              ${peg.map((size) => `
                <span style="height:18px;border-radius:6px;width:${20 + (size - 1) * (80 / disks)}%;background:${DISK_COLORS[(size - 1) % DISK_COLORS.length]};box-shadow:0 1px 3px rgba(0,0,0,.3);"></span>
              `).join("")}
              ${state.selected === i ? '<span style="position:absolute;top:6px;font-size:12px;color:#7bd88f;">抬起</span>' : ""}
            </button>
          `).join("")}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-peg]").forEach((button) => {
      button.addEventListener("click", () => tapPeg(Number(button.dataset.peg)));
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  return () => {
    root.innerHTML = "";
  };
}
