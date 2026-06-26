import { clamp } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

// 瓦片图例： # 墙  . 目标  $ 箱  * 箱在目标上  @ 人  + 人在目标上  (空格)地板
const LEVELS = [
  [
    "#####",
    "#@  #",
    "# $ #",
    "#  .#",
    "#####"
  ],
  [
    "######",
    "#.   #",
    "# $$ #",
    "# @  #",
    "#.   #",
    "######"
  ],
  [
    "#######",
    "#  .  #",
    "# $#$ #",
    "#. @ .#",
    "# $#$ #",
    "#  .  #",
    "#######"
  ],
  [
    "########",
    "#  @   #",
    "# $$$  #",
    "# ...  #",
    "#      #",
    "########"
  ],
  [
    "#######",
    "#  .  #",
    "#  $  #",
    "#.$@$.#",
    "#  $  #",
    "#  .  #",
    "#######"
  ],
  [
    "########",
    "#.    .#",
    "# $  $ #",
    "#  @   #",
    "# $  $ #",
    "#.    .#",
    "########"
  ],
  [
    "########",
    "#   .  #",
    "# $$ # #",
    "# $.@. #",
    "## # $ #",
    "#  .   #",
    "########"
  ],
  [
    "########",
    "#      #",
    "#    . #",
    "#      #",
    "# . *  #",
    "#* $ $ #",
    "#    $+#",
    "########"
  ],
  [
    "  #####",
    "###   #",
    "#.@$  #",
    "### $.#",
    "#.##$ #",
    "# # . ##",
    "#$ *$$.#",
    "#   .  #",
    "#######"
  ]
];

function parseLevel(rows) {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const walls = [];
  const targets = [];
  const boxes = [];
  let player = { x: 0, y: 0 };
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    walls.push(new Array(width).fill(false));
    for (let x = 0; x < width; x += 1) {
      const ch = row[x] || " ";
      if (ch === "#") walls[y][x] = true;
      if (ch === "." || ch === "*" || ch === "+") targets.push(y * width + x);
      if (ch === "$" || ch === "*") boxes.push(y * width + x);
      if (ch === "@" || ch === "+") player = { x, y };
    }
  }
  return { width, height, walls, targets, boxes, player };
}

function freshFrom(level) {
  const map = parseLevel(LEVELS[level]);
  return {
    level,
    width: map.width,
    height: map.height,
    walls: map.walls,
    targets: map.targets,
    boxes: map.boxes.slice(),
    player: { ...map.player },
    moves: 0,
    pushes: 0,
    history: [],
    solved: false
  };
}

function isValidState(s) {
  return s && typeof s.level === "number" && s.level >= 0 && s.level < LEVELS.length;
}

export function mountSokoban(root, context) {
  const storageKey = "sokoban:solo";
  const startLevel = (() => {
    if (isValidState(context.savedState)) return clamp(context.savedState.level, 0, LEVELS.length - 1);
    const legacy = loadState(storageKey, null);
    return isValidState(legacy) ? clamp(legacy.level, 0, LEVELS.length - 1) : 0;
  })();

  let state = freshFrom(startLevel);
  let disposed = false;

  const targetSet = () => new Set(state.targets);

  function boxAt(idx) {
    return state.boxes.indexOf(idx);
  }

  function isWall(x, y) {
    return x < 0 || y < 0 || x >= state.width || y >= state.height || state.walls[y][x];
  }

  function solved() {
    const t = targetSet();
    return state.boxes.every((b) => t.has(b));
  }

  function save() {
    const meta = {
      stage: `第 ${state.level + 1} 关 · ${state.moves} 步`,
      level: state.level,
      score: state.level * 100
    };
    saveState(storageKey, { level: state.level });
    if (context.saveSession) context.saveSession({ level: state.level }, meta);
  }

  function move(dx, dy) {
    if (state.solved || disposed) return;
    const { x, y } = state.player;
    const nx = x + dx;
    const ny = y + dy;
    if (isWall(nx, ny)) return;
    const target = ny * state.width + nx;
    const bi = boxAt(target);
    let pushed = false;
    if (bi >= 0) {
      const bx = nx + dx;
      const by = ny + dy;
      if (isWall(bx, by) || boxAt(by * state.width + bx) >= 0) return;
      state.history.push({ boxes: state.boxes.slice(), player: { ...state.player } });
      state.boxes[bi] = by * state.width + bx;
      pushed = true;
    } else {
      state.history.push({ boxes: state.boxes.slice(), player: { ...state.player } });
    }
    state.player = { x: nx, y: ny };
    state.moves += 1;
    if (pushed) state.pushes += 1;
    context.playSound?.(pushed ? "push" : "move");
    if (solved()) {
      state.solved = true;
      context.reportResult?.({ outcome: "complete", score: (state.level + 1) * 100, moves: state.moves });
      context.playSound?.("win");
    } else {
      save();
    }
    render();
  }

  function undo() {
    if (state.solved || !state.history.length) return;
    const prev = state.history.pop();
    state.boxes = prev.boxes;
    state.player = prev.player;
    state.moves = Math.max(0, state.moves - 1);
    render();
  }

  function restart() {
    state = freshFrom(state.level);
    render();
  }

  function nextLevel() {
    const lvl = state.level + 1 < LEVELS.length ? state.level + 1 : 0;
    state = freshFrom(lvl);
    save();
    render();
  }

  function onKey(e) {
    const map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
    };
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
    const t = targetSet();
    const onTarget = state.boxes.filter((b) => t.has(b)).length;
    const tile = clamp(Math.floor(320 / Math.max(state.width, state.height)), 24, 56);
    const cells = [];
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const idx = y * state.width + x;
        const wall = state.walls[y][x];
        const isTgt = t.has(idx);
        const box = boxAt(idx) >= 0;
        const player = state.player.x === x && state.player.y === y;
        let bg = wall ? "#3a3550" : isTgt ? "rgba(120,200,160,.22)" : "rgba(255,255,255,.04)";
        let content = "";
        if (box) { bg = t.has(idx) ? "#5fb893" : "#c79a5b"; content = "📦"; }
        if (player) { content = "🧍"; if (!box) bg = "rgba(110,140,240,.28)"; }
        else if (isTgt && !box) content = "·";
        cells.push(`<div style="display:flex;align-items:center;justify-content:center;font-size:${Math.floor(tile * 0.6)}px;background:${bg};border-radius:6px;">${content}</div>`);
      }
    }
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.solved ? "过关！" : `第 ${state.level + 1} / ${LEVELS.length} 关`}</strong>
          <p class="game-note">${context.labels?.mode || "推箱子"} · 把箱子推到目标 · 上目标 ${onTarget}/${state.targets.length}</p>
        </div>
        <div class="mini-stats"><span>步 ${state.moves}</span><span>推 ${state.pushes}</span></div>
      </section>
      <section class="board-wrap">
        <div data-grid style="display:grid;gap:3px;grid-template-columns:repeat(${state.width},${tile}px);grid-template-rows:repeat(${state.height},${tile}px);margin:0 auto;touch-action:none;user-select:none;">${cells.join("")}</div>
      </section>
      <section class="game-panel toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;">
        <div style="display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,44px);gap:6px;">
          <span></span><button class="secondary-button" data-dir="u">↑</button><span></span>
          <button class="secondary-button" data-dir="l">←</button><button class="secondary-button" data-dir="d">↓</button><button class="secondary-button" data-dir="r">→</button>
        </div>
        <button class="secondary-button" data-action="undo" ${state.history.length && !state.solved ? "" : "disabled"}>悔一步</button>
        <button class="danger-button" data-action="restart">重开</button>
        ${state.solved ? `<button class="primary-button" data-action="next">下一关</button>` : ""}
      </section>`;
    const grid = root.querySelector("[data-grid]");
    grid.addEventListener("touchstart", onStart, { passive: true });
    grid.addEventListener("touchend", onEnd, { passive: true });
    const dirs = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
    root.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("click", () => { b.blur(); const v = dirs[b.dataset.dir]; move(v[0], v[1]); }));
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    root.querySelector("[data-action='next']")?.addEventListener("click", nextLevel);
  }

  render();
  save();

  return () => {
    disposed = true;
    window.removeEventListener("keydown", onKey);
    removeState(storageKey);
  };
}
