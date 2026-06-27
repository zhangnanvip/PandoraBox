import { clamp } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

// 难度档 → 第一关迷宫边长（奇数，含外墙）；每过一关 +2
const BASE_SIZE = { easy: 7, medium: 11, hard: 15, devil: 19 };
const STORAGE_KEY = "maze:solo";

function dimFromLevel(diff, level) {
  const base = BASE_SIZE[diff] || BASE_SIZE.medium;
  return clamp(base + level * 2, 7, 41); // 保持奇数
}

// 递归回溯法生成完美迷宫：cells 为奇数索引，墙在偶数索引
function buildMaze(size) {
  const grid = [];
  for (let y = 0; y < size; y += 1) grid.push(new Array(size).fill(1)); // 1=墙 0=路
  const start = { x: 1, y: 1 };
  grid[start.y][start.x] = 0;
  const stack = [start];
  const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = [];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && grid[ny][nx] === 1) {
        options.push({ nx, ny, wx: cur.x + dx / 2, wy: cur.y + dy / 2 });
      }
    }
    if (!options.length) { stack.pop(); continue; }
    const pick = options[Math.floor(Math.random() * options.length)];
    grid[pick.wy][pick.wx] = 0;
    grid[pick.ny][pick.nx] = 0;
    stack.push({ x: pick.nx, y: pick.ny });
  }
  return grid;
}

function freshFrom(diff, level) {
  const size = dimFromLevel(diff, level);
  const grid = buildMaze(size);
  return {
    level,
    size,
    grid,
    player: { x: 1, y: 1 },
    exit: { x: size - 2, y: size - 2 },
    moves: 0,
    seconds: 0,
    solved: false
  };
}

export function mountMaze(root, context) {
  const diff = context.options?.difficulty || context.difficulty || "medium";
  const startLevel = (() => {
    const s = context.savedState;
    if (s && typeof s.level === "number" && s.level >= 0) return clamp(s.level, 0, 16);
    const legacy = loadState(STORAGE_KEY, null);
    return legacy && typeof legacy.level === "number" ? clamp(legacy.level, 0, 16) : 0;
  })();

  let state = freshFrom(diff, startLevel);
  let disposed = false;
  let timer = null;

  function tick() {
    if (disposed || state.solved || context.isPaused?.()) return;
    state.seconds += 1;
    const el = root.querySelector("[data-clock]");
    if (el) el.textContent = `${state.seconds}s`;
  }
  timer = setInterval(tick, 1000);

  function save() {
    const meta = { stage: `第 ${state.level + 1} 关 · ${state.seconds}s`, level: state.level, score: state.level * 100 };
    saveState(STORAGE_KEY, { level: state.level });
    context.saveSession?.({ level: state.level }, meta);
  }

  function move(dx, dy) {
    if (state.solved || disposed) return;
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    if (nx < 0 || ny < 0 || nx >= state.size || ny >= state.size || state.grid[ny][nx] === 1) return;
    state.player = { x: nx, y: ny };
    state.moves += 1;
    context.playSound?.("move");
    if (nx === state.exit.x && ny === state.exit.y) {
      state.solved = true;
      context.reportResult?.({ outcome: "complete", score: (state.level + 1) * 100, moves: state.moves });
      context.playSound?.("win");
    } else {
      save();
    }
    render();
  }

  function restart() { state = freshFrom(diff, state.level); render(); }
  function nextLevel() { state = freshFrom(diff, state.level + 1); save(); render(); }

  function onKey(e) {
    const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
    if (state.solved && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); nextLevel(); return; }
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir[0], dir[1]);
  }
  window.addEventListener("keydown", onKey);

  let touch = null;
  function onStart(e) { const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY }; }
  function onEnd(e) {
    if (!touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
    else move(0, dy > 0 ? 1 : -1);
  }

  function render() {
    const tile = clamp(Math.floor(336 / state.size), 12, 40);
    const cells = [];
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const wall = state.grid[y][x] === 1;
        const isPlayer = state.player.x === x && state.player.y === y;
        const isExit = state.exit.x === x && state.exit.y === y;
        let bg = wall ? "#3a3550" : "rgba(255,255,255,.05)";
        let content = "";
        if (isExit) { bg = "rgba(120,200,160,.28)"; content = "🚩"; }
        if (isPlayer) { bg = "rgba(110,140,240,.32)"; content = "🟦"; }
        cells.push(`<div style="display:flex;align-items:center;justify-content:center;font-size:${Math.floor(tile * 0.7)}px;background:${bg};">${content}</div>`);
      }
    }
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.solved ? "到达终点！" : `第 ${state.level + 1} 关 · ${state.size - 2}×${state.size - 2}`}</strong>
          <p class="game-note">${context.labels?.mode || "迷宫"} · 从左上走到右下 🚩 · 难度 ${context.labels?.difficulty || diff}</p>
        </div>
        <div class="mini-stats"><span data-clock>${state.seconds}s</span><span>步 ${state.moves}</span></div>
      </section>
      <section class="board-wrap">
        <div data-grid style="display:grid;gap:0;grid-template-columns:repeat(${state.size},${tile}px);grid-template-rows:repeat(${state.size},${tile}px);margin:0 auto;touch-action:none;user-select:none;border-radius:8px;overflow:hidden;">${cells.join("")}</div>
      </section>
      <section class="game-panel toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;">
        <div style="display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,44px);gap:6px;">
          <span></span><button class="secondary-button" data-dir="u">↑</button><span></span>
          <button class="secondary-button" data-dir="l">←</button><button class="secondary-button" data-dir="d">↓</button><button class="secondary-button" data-dir="r">→</button>
        </div>
        <button class="danger-button" data-action="restart">重开</button>
        ${state.solved ? `<button class="primary-button" data-action="next">下一关</button>` : ""}
      </section>`;
    const grid = root.querySelector("[data-grid]");
    grid.addEventListener("touchstart", onStart, { passive: true });
    grid.addEventListener("touchend", onEnd, { passive: true });
    const dirs = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
    root.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("click", () => { b.blur(); const v = dirs[b.dataset.dir]; move(v[0], v[1]); }));
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    root.querySelector("[data-action='next']")?.addEventListener("click", nextLevel);
  }

  render();
  save();

  return () => {
    disposed = true;
    if (timer) clearInterval(timer);
    window.removeEventListener("keydown", onKey);
    removeState(STORAGE_KEY);
  };
}
