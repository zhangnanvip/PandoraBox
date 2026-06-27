import { clamp } from "../../utils/random.js";

const SIZES = {
  easy: { size: 5, fill: 0.55 },
  medium: { size: 10, fill: 0.55 },
  hard: { size: 15, fill: 0.5 },
  devil: { size: 15, fill: 0.7 }
};

const EMPTY = 0;
const FILLED = 1;
const MARK = 2;

function configFor(difficulty) {
  return SIZES[difficulty] || SIZES.easy;
}

function makeSolution(size, fill) {
  // 至少一个填充的可解谜面；每行/每列允许全空（合法 0 提示）
  let grid;
  let total;
  do {
    grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => (Math.random() < fill ? FILLED : EMPTY))
    );
    total = grid.flat().filter((c) => c === FILLED).length;
  } while (total === 0 || total === size * size);
  return grid;
}

function lineClues(cells) {
  const clues = [];
  let run = 0;
  for (const c of cells) {
    if (c === FILLED) run += 1;
    else if (run) { clues.push(run); run = 0; }
  }
  if (run) clues.push(run);
  return clues.length ? clues : [0];
}

function rowClues(grid) {
  return grid.map((row) => lineClues(row));
}

function colClues(grid) {
  const size = grid.length;
  const cols = [];
  for (let c = 0; c < size; c += 1) {
    cols.push(lineClues(grid.map((row) => row[c])));
  }
  return cols;
}

function emptyGrid(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => EMPTY));
}

function lineSolved(player, solution) {
  for (let i = 0; i < player.length; i += 1) {
    const want = solution[i] === FILLED;
    const got = player[i] === FILLED;
    if (want !== got) return false;
  }
  return true;
}

function newState(difficulty) {
  const { size, fill } = configFor(difficulty);
  const solution = makeSolution(size, fill);
  return {
    size,
    solution,
    rows: rowClues(solution),
    cols: colClues(solution),
    grid: emptyGrid(size),
    moves: 0,
    done: false
  };
}

export function mountNonogram(root, context) {
  const opts = context?.options || {};
  const difficulty = context?.difficulty || "easy";
  const labels = context?.labels || {};

  let state = restore(context?.savedState) || newState(difficulty);
  let markMode = false;
  const saveTimers = [];

  function restore(snap) {
    if (!snap || !Array.isArray(snap.solution) || !Array.isArray(snap.grid)) return null;
    const size = snap.size;
    if (snap.solution.length !== size || snap.grid.length !== size) return null;
    return {
      size,
      solution: snap.solution.map((r) => [...r]),
      rows: rowClues(snap.solution),
      cols: colClues(snap.solution),
      grid: snap.grid.map((r) => [...r]),
      moves: snap.moves || 0,
      done: !!snap.done
    };
  }

  function save() {
    if (context?.saveSession && !state.done) {
      context.saveSession(
        {
          size: state.size,
          solution: state.solution.map((r) => [...r]),
          grid: state.grid.map((r) => [...r]),
          moves: state.moves,
          done: state.done
        },
        { stage: `${state.size}×${state.size}`, level: 1, score: state.moves }
      );
    } else if (context?.clearSession && state.done) {
      context.clearSession();
    }
  }

  function isComplete() {
    for (let r = 0; r < state.size; r += 1) {
      for (let c = 0; c < state.size; c += 1) {
        const want = state.solution[r][c] === FILLED;
        const got = state.grid[r][c] === FILLED;
        if (want !== got) return false;
      }
    }
    return true;
  }

  function mistakes() {
    let n = 0;
    for (let r = 0; r < state.size; r += 1) {
      for (let c = 0; c < state.size; c += 1) {
        if (state.grid[r][c] === FILLED && state.solution[r][c] !== FILLED) n += 1;
      }
    }
    return n;
  }

  function toggle(r, c) {
    if (state.done) return;
    const cur = state.grid[r][c];
    if (markMode) {
      state.grid[r][c] = cur === MARK ? EMPTY : MARK;
    } else {
      state.grid[r][c] = cur === FILLED ? EMPTY : FILLED;
    }
    state.moves += 1;
    if (isComplete()) finish();
    save();
    render();
  }

  function finish() {
    if (state.done) return;
    state.done = true;
    const cells = state.size * state.size;
    const score = clamp(Math.round(cells * 1000 / Math.max(1, state.moves)), 0, 9999);
    context?.playSound?.("win");
    context?.reportResult?.({ outcome: "complete", detail: `${state.size}×${state.size} 完成`, score, moves: state.moves });
    context?.clearSession?.();
  }

  function clearMarks() {
    for (let r = 0; r < state.size; r += 1) {
      for (let c = 0; c < state.size; c += 1) {
        if (state.grid[r][c] === MARK) state.grid[r][c] = EMPTY;
      }
    }
    render();
  }

  function restart() {
    state = newState(difficulty);
    markMode = false;
    context?.clearSession?.();
    render();
  }

  function clueBlock(arr, vertical) {
    return `<div class="ng-clue ${vertical ? "ng-clue-col" : "ng-clue-row"}">${arr.map((n) => `<span>${n}</span>`).join("")}</div>`;
  }

  function render() {
    const n = state.size;
    const avail = Math.min((root.clientWidth || 360), 400) - 56; // 预留行号槽 + 间隙
    const cellPx = clamp(Math.floor(avail / n), 18, 44);
    const head = `${labels.mode || "单人"} · ${labels.difficulty || ""} · ${n}×${n}`;
    const wrong = mistakes();
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.done ? "全部正确，过关" : "数织 · 按数字涂格"}</strong>
          <p class="game-note">${head}</p>
        </div>
        <div class="mini-stats"><span>步 ${state.moves}</span><span>误 ${wrong}</span></div>
      </section>
      <section class="board-wrap">
        <div class="ng-grid" style="display:grid;grid-template-columns:auto repeat(${n}, ${cellPx}px);gap:1px;justify-content:center;user-select:none;">
          <div></div>
          ${state.cols.map((col) => `<div style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:11px;line-height:1.1;min-height:48px;color:var(--text-muted,#888)">${col.map((v) => `<span>${v}</span>`).join("")}</div>`).join("")}
          ${state.grid.map((row, r) => `
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px;padding-right:4px;font-size:11px;color:var(--text-muted,#888)">${state.rows[r].map((v) => `<span>${v}</span>`).join("")}</div>
            ${row.map((cell, c) => `<button type="button" data-r="${r}" data-c="${c}" aria-label="${r + 1},${c + 1}" style="width:${cellPx}px;height:${cellPx}px;border:1px solid var(--border,#3334);background:${cell === FILLED ? "var(--accent,#2b2b2b)" : "var(--surface,#f4f4f4)"};color:var(--accent,#2b2b2b);font-size:${cellPx > 30 ? 18 : 13}px;line-height:1;cursor:pointer;padding:0">${cell === MARK ? "×" : ""}</button>`).join("")}
          `).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="${markMode ? "primary-button" : "secondary-button"}" data-action="mark">标记 ${markMode ? "开" : "关"}</button>
        <button class="secondary-button" data-action="marks">清标记</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-r]").forEach((btn) => {
      const r = Number(btn.dataset.r);
      const c = Number(btn.dataset.c);
      btn.addEventListener("click", () => toggle(r, c));
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (state.done) return;
        state.grid[r][c] = state.grid[r][c] === MARK ? EMPTY : MARK;
        render();
      });
      let lp = 0;
      btn.addEventListener("pointerdown", () => {
        lp = window.setTimeout(() => {
          if (state.done) return;
          state.grid[r][c] = state.grid[r][c] === MARK ? EMPTY : MARK;
          render();
        }, 420);
        saveTimers.push(lp);
      });
      const clr = () => clearTimeout(lp);
      btn.addEventListener("pointerup", clr);
      btn.addEventListener("pointerleave", clr);
    });
    root.querySelector("[data-action='mark']").addEventListener("click", () => { markMode = !markMode; render(); });
    root.querySelector("[data-action='marks']").addEventListener("click", clearMarks);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();

  return () => {
    saveTimers.forEach((t) => clearTimeout(t));
  };
}
