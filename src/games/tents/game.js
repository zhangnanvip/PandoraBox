import { clamp } from "../../utils/random.js";

const EMPTY = 0;
const TENT = 1;
const GRASS = 2;

// 三套手工校验过的固定谜面。坐标 [row, col]，0 起。
// 每棵树恰好配 1 个帐篷（正交相邻），帐篷彼此不相邻（含对角）。
const PUZZLES = [
  {
    title: "营地入门",
    n: 6,
    trees: [[0, 0], [0, 3], [2, 0], [2, 3], [4, 0], [4, 3]],
    tents: [[0, 1], [0, 4], [2, 1], [2, 4], [4, 1], [4, 4]]
  },
  {
    title: "林间棋局",
    n: 6,
    trees: [[0, 1], [1, 4], [3, 0], [2, 3], [5, 1], [4, 4]],
    tents: [[0, 0], [0, 4], [2, 0], [2, 2], [4, 1], [5, 4]]
  },
  {
    title: "对角营寨",
    n: 7,
    trees: [[0, 0], [0, 6], [2, 2], [4, 4], [6, 0], [6, 6], [3, 0]],
    tents: [[0, 1], [1, 6], [2, 3], [5, 4], [6, 1], [5, 6], [2, 0]]
  }
];

function emptyGrid(n) {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => EMPTY));
}

function deriveCounts(puzzle) {
  const { n, tents } = puzzle;
  const rows = Array(n).fill(0);
  const cols = Array(n).fill(0);
  tents.forEach(([r, c]) => { rows[r] += 1; cols[c] += 1; });
  return { rows, cols };
}

function treeSet(puzzle) {
  const set = new Set();
  puzzle.trees.forEach(([r, c]) => set.add(`${r},${c}`));
  return set;
}

function newState(index) {
  const puzzle = PUZZLES[index % PUZZLES.length];
  const counts = deriveCounts(puzzle);
  return {
    index,
    puzzle,
    n: puzzle.n,
    rows: counts.rows,
    cols: counts.cols,
    trees: treeSet(puzzle),
    grid: emptyGrid(puzzle.n),
    moves: 0,
    done: false
  };
}

function restore(snap) {
  if (!snap || typeof snap.index !== "number" || !Array.isArray(snap.grid)) return null;
  const base = newState(snap.index);
  if (snap.grid.length !== base.n) return null;
  base.grid = snap.grid.map((row) => [...row]);
  base.moves = snap.moves || 0;
  return base;
}

// 校验完整合法解：帐篷数==每行/列计数；每帐篷不相邻；树↔帐篷一一配对。
function validate(state) {
  const { n, grid, rows, cols } = state;
  const rc = Array(n).fill(0);
  const cc = Array(n).fill(0);
  const tents = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (grid[r][c] === TENT) { rc[r] += 1; cc[c] += 1; tents.push([r, c]); }
    }
  }
  for (let i = 0; i < n; i += 1) {
    if (rc[i] !== rows[i] || cc[i] !== cols[i]) return false;
  }
  // 帐篷不接触（含对角）
  for (const [r, c] of tents) {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc] === TENT) return false;
      }
    }
  }
  // 树数==帐篷数 且 完美配对（每树正好 1 邻接帐篷，无共用）
  const treeList = [...state.trees].map((s) => s.split(",").map(Number));
  if (treeList.length !== tents.length) return false;
  const tentMatched = tents.map(() => false);
  for (const [tr, tc] of treeList) {
    let m = -1;
    for (let i = 0; i < tents.length; i += 1) {
      if (tentMatched[i]) continue;
      const [er, ec] = tents[i];
      if (Math.abs(er - tr) + Math.abs(ec - tc) === 1) { m = i; break; }
    }
    if (m < 0) return false;
    tentMatched[m] = true;
  }
  return true;
}

export function mountTents(root, context) {
  const labels = context?.labels || {};
  let state = restore(context?.savedState) || newState(0);
  const timers = [];

  function save() {
    if (state.done) { context?.clearSession?.(); return; }
    context?.saveSession?.(
      { index: state.index, grid: state.grid.map((r) => [...r]), moves: state.moves },
      { stage: state.puzzle.title, level: state.index + 1, score: state.moves }
    );
  }

  function cycle(r, c) {
    if (state.done) return;
    if (state.trees.has(`${r},${c}`)) return; // 树格不可改
    const cur = state.grid[r][c];
    state.grid[r][c] = cur === EMPTY ? TENT : cur === TENT ? GRASS : EMPTY;
    state.moves += 1;
    if (validate(state)) finish();
    else save();
    render();
  }

  function finish() {
    state.done = true;
    const score = clamp(Math.round(state.n * state.n * 1000 / Math.max(1, state.moves)), 0, 9999);
    context?.playSound?.("win");
    context?.reportResult?.({ outcome: "complete", detail: `${state.puzzle.title} 完成`, score, moves: state.moves });
    context?.clearSession?.();
  }

  function next() {
    state = newState((state.index + 1) % PUZZLES.length);
    context?.clearSession?.();
    render();
  }

  function restart() {
    state = newState(state.index);
    context?.clearSession?.();
    render();
  }

  function render() {
    const n = state.n;
    const avail = Math.min((root.clientWidth || 360), 380) - 40;
    const cell = clamp(Math.floor(avail / (n + 1)), 34, 52);
    const rc = state.rows.map((_, r) => state.grid[r].filter((v) => v === TENT).length);
    const cc = state.cols.map((_, c) => state.grid.reduce((s, row) => s + (row[c] === TENT ? 1 : 0), 0));

    const cells = [`<div style="width:${cell}px;height:${cell}px"></div>`];
    for (let c = 0; c < n; c += 1) {
      const ok = cc[c] === state.cols[c];
      cells.push(`<div style="width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center;font-weight:600;color:${ok ? "var(--accent,#2b8a3e)" : "var(--text-muted,#888)"}">${state.cols[c]}</div>`);
    }
    for (let r = 0; r < n; r += 1) {
      const ok = rc[r] === state.rows[r];
      cells.push(`<div style="width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center;font-weight:600;color:${ok ? "var(--accent,#2b8a3e)" : "var(--text-muted,#888)"}">${state.rows[r]}</div>`);
      for (let c = 0; c < n; c += 1) {
        const v = state.grid[r][c];
        const tree = state.trees.has(`${r},${c}`);
        const glyph = tree ? "🌳" : v === TENT ? "⛺" : v === GRASS ? "·" : "";
        const bg = tree ? "rgba(43,138,62,.12)" : v === TENT ? "rgba(43,138,62,.22)" : "var(--surface,#f4f4f4)";
        cells.push(`<button type="button" data-r="${r}" data-c="${c}" aria-label="${r + 1},${c + 1}" style="width:${cell}px;height:${cell}px;border:1px solid var(--border,#3334);background:${bg};font-size:${cell > 40 ? 22 : 18}px;line-height:1;cursor:${tree ? "default" : "pointer"};padding:0;color:var(--text-muted,#999)">${glyph}</button>`);
      }
    }

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.done ? "营地齐整，过关" : "帐篷 · 每棵树配一顶"}</strong>
          <p class="game-note">${labels.mode || "单人"} · ${state.puzzle.title} · 行列数字=帐篷数，帐篷不相邻</p>
        </div>
        <div class="mini-stats"><span>步 ${state.moves}</span><span>第 ${state.index + 1}/${PUZZLES.length}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${n + 1}, ${cell}px);gap:2px;justify-content:center;user-select:none;">${cells.join("")}</div>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="next">换题</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-r]").forEach((btn) => {
      btn.addEventListener("click", () => cycle(Number(btn.dataset.r), Number(btn.dataset.c)));
    });
    root.querySelector("[data-action='next']").addEventListener("click", next);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();

  return () => { timers.forEach((t) => clearTimeout(t)); };
}
