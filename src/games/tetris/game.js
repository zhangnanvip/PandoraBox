import { loadState, removeState, saveState } from "../../utils/storage.js";
import { clamp } from "../../utils/random.js";

const COLS = 10;
const ROWS = 20;
const CELL = 16; // 10 * 16 = 160 内核宽，留边后 < 340px
const W = COLS * CELL;
const H = ROWS * CELL;
const NEXT_CELL = 13;
const NEXT_BOX = 4 * NEXT_CELL;
const STORAGE_KEY = "tetris:solo";

// 每种方块 4x4 旋转态（4 个旋转方向），用 4x4 网格里 1 表示实心
const SHAPES = {
  I: { color: "#34d6e8", cells: [0x0f00, 0x2222, 0x00f0, 0x4444] },
  O: { color: "#f5d23a", cells: [0x0660, 0x0660, 0x0660, 0x0660] },
  T: { color: "#b86bff", cells: [0x0e40, 0x4c40, 0x4e00, 0x4640] },
  S: { color: "#5ce86a", cells: [0x06c0, 0x4620, 0x06c0, 0x4620] },
  Z: { color: "#ff5d5d", cells: [0x0c60, 0x2640, 0x0c60, 0x2640] },
  J: { color: "#4f7bff", cells: [0x08e0, 0x6440, 0x0e20, 0x44c0] },
  L: { color: "#ff9b3a", cells: [0x02e0, 0x4460, 0x0e80, 0xc440] }
};
const TYPES = ["I", "O", "T", "S", "Z", "J", "L"];
const LINE_SCORES = [0, 100, 300, 500, 800];

function cellsAt(type, rot) {
  const mask = SHAPES[type].cells[rot & 3];
  const out = [];
  for (let i = 0; i < 16; i += 1) {
    if (mask & (0x8000 >> i)) out.push({ x: i % 4, y: Math.floor(i / 4) });
  }
  return out;
}

function nextBag(bag) {
  if (bag.length) return bag;
  const fresh = [...TYPES];
  for (let i = fresh.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  return fresh;
}

function spawnPiece(state) {
  state.bag = nextBag(state.bag);
  const type = state.bag.shift();
  return { type, rot: 0, x: type === "I" ? 3 : type === "O" ? 4 : 4, y: 0 };
}

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(""));
}

function initialState() {
  const state = {
    grid: emptyGrid(),
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    over: false,
    piece: null,
    next: null
  };
  state.bag = nextBag(state.bag);
  state.piece = spawnPiece(state);
  state.next = spawnPiece(state);
  return state;
}

function collides(grid, piece, dx, dy, rot) {
  for (const c of cellsAt(piece.type, rot)) {
    const nx = piece.x + c.x + dx;
    const ny = piece.y + c.y + dy;
    if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
    if (ny >= 0 && grid[ny][nx]) return true;
  }
  return false;
}

function lockPiece(state, context) {
  const piece = state.piece;
  for (const c of cellsAt(piece.type, piece.rot)) {
    const ny = piece.y + c.y;
    const nx = piece.x + c.x;
    if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) state.grid[ny][nx] = piece.type;
  }
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (state.grid[y].every((cell) => cell)) {
      state.grid.splice(y, 1);
      state.grid.unshift(Array(COLS).fill(""));
      cleared += 1;
      y += 1;
    }
  }
  if (cleared) {
    state.score += LINE_SCORES[cleared] * state.level;
    state.lines += cleared;
    state.level = clamp(1 + Math.floor(state.lines / 10), 1, 20);
    context.playSound?.("score");
  }
  // 顶出：栈顶触及最上两行即结束（spawn 区被占）
  if (state.grid[0].some((c) => c) || state.grid[1].some((c) => c)) {
    state.over = true;
    return;
  }
  state.piece = state.next;
  state.next = spawnPiece(state);
  if (collides(state.grid, state.piece, 0, 0, state.piece.rot)) {
    state.over = true;
  }
}

function dropInterval(level) {
  return Math.max(110, 800 - (level - 1) * 70);
}

export function mountTetris(root, context) {
  let state = (context.savedState && restore(context.savedState))
    || restore(loadState(STORAGE_KEY, null))
    || initialState();
  let raf = 0;
  let last = 0;
  let acc = 0;
  let reported = false;
  let saveTimer = 0;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>俄罗斯方块</strong>
        <p class="game-note">${context.labels?.mode || "单人挑战"} · 消行升速</p>
      </div>
      <div class="mini-stats">
        <span data-score>分 0</span>
        <span data-lines>行 0</span>
        <span data-level>级 1</span>
      </div>
    </section>
    <section class="board-wrap" style="display:flex;justify-content:center;gap:12px;align-items:flex-start;flex-wrap:wrap;">
      <canvas data-board width="${W}" height="${H}" style="background:rgba(0,0,0,.35);border-radius:8px;touch-action:none;max-width:100%;"></canvas>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
        <span style="font-size:.72rem;opacity:.7;">下一个</span>
        <canvas data-next width="${NEXT_BOX}" height="${NEXT_BOX}" style="background:rgba(0,0,0,.25);border-radius:6px;"></canvas>
      </div>
    </section>
    <section class="game-panel" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
      <button class="secondary-button" data-ctrl="left" aria-label="左移">←</button>
      <button class="secondary-button" data-ctrl="rotate" aria-label="旋转">⟳</button>
      <button class="secondary-button" data-ctrl="right" aria-label="右移">→</button>
      <button class="secondary-button" data-ctrl="down" aria-label="下移">↓</button>
      <button class="primary-button" data-ctrl="drop" aria-label="直落">⤓</button>
    </section>
    <section class="game-panel toolbar">
      <button class="danger-button" data-ctrl="restart">重开</button>
    </section>
  `;

  const board = root.querySelector("[data-board]");
  const nextCv = root.querySelector("[data-next]");
  const ctx = board.getContext("2d");
  const nctx = nextCv.getContext("2d");
  const elStatus = root.querySelector("[data-status]");
  const elScore = root.querySelector("[data-score]");
  const elLines = root.querySelector("[data-lines]");
  const elLevel = root.querySelector("[data-level]");

  function block(g, x, y, color) {
    g.fillStyle = color;
    g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    g.fillStyle = "rgba(255,255,255,.22)";
    g.fillRect(x + 1, y + 1, CELL - 2, 3);
  }

  function ghostY() {
    let dy = 0;
    while (!collides(state.grid, state.piece, 0, dy + 1, state.piece.rot)) dy += 1;
    return dy;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (state.grid[y][x]) block(ctx, x * CELL, y * CELL, SHAPES[state.grid[y][x]].color);
      }
    }
    if (state.piece && !state.over) {
      const gd = ghostY();
      for (const c of cellsAt(state.piece.type, state.piece.rot)) {
        const gx = (state.piece.x + c.x) * CELL;
        const gy = (state.piece.y + c.y + gd) * CELL;
        if (gy >= 0) { ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(gx + 1, gy + 1, CELL - 2, CELL - 2); }
      }
      for (const c of cellsAt(state.piece.type, state.piece.rot)) {
        const py = state.piece.y + c.y;
        if (py >= 0) block(ctx, (state.piece.x + c.x) * CELL, py * CELL, SHAPES[state.piece.type].color);
      }
    }
    nctx.clearRect(0, 0, NEXT_BOX, NEXT_BOX);
    if (state.next) {
      for (const c of cellsAt(state.next.type, 0)) {
        nctx.fillStyle = SHAPES[state.next.type].color;
        nctx.fillRect(c.x * NEXT_CELL + 2, c.y * NEXT_CELL + 2, NEXT_CELL - 3, NEXT_CELL - 3);
      }
    }
    elStatus.textContent = state.over ? "游戏结束" : "俄罗斯方块";
    elScore.textContent = `分 ${state.score}`;
    elLines.textContent = `行 ${state.lines}`;
    elLevel.textContent = `级 ${state.level}`;
  }

  function move(dx) { if (!state.over && !collides(state.grid, state.piece, dx, 0, state.piece.rot)) state.piece.x += dx; }
  function rotate() {
    if (state.over) return;
    const nr = (state.piece.rot + 1) & 3;
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(state.grid, state.piece, kick, 0, nr)) { state.piece.x += kick; state.piece.rot = nr; context.playSound?.("move"); return; }
    }
  }
  function soft() { if (!state.over && !collides(state.grid, state.piece, 0, 1, state.piece.rot)) state.piece.y += 1; }
  function hard() { if (state.over) return; state.piece.y += ghostY(); lockPiece(state, context); acc = 0; if (state.over) endGame(); }
  function endGame() {
    if (reported) return;
    reported = true;
    removeState(STORAGE_KEY);
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", score: state.score, detail: `消除 ${state.lines} 行 · 第 ${state.level} 级` });
  }
  function persist() {
    if (state.over) return;
    saveState(STORAGE_KEY, serialize(state));
    context.saveSession?.(serialize(state), { stage: `${state.lines} 行`, level: state.level, score: state.score });
  }
  function restart() { state = initialState(); reported = false; removeState(STORAGE_KEY); context.clearSession?.(); acc = 0; draw(); }

  root.querySelectorAll("[data-ctrl]").forEach((btn) => btn.addEventListener("click", (e) => {
    e.currentTarget.blur();
    const a = btn.dataset.ctrl;
    if (a === "left") move(-1); else if (a === "right") move(1); else if (a === "rotate") rotate();
    else if (a === "down") soft(); else if (a === "drop") hard(); else if (a === "restart") restart();
    draw();
  }));

  function onKey(e) {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "rotate", ArrowDown: "down", Space: "drop" };
    const a = map[e.code]; if (!a) return; e.preventDefault();
    if (a === "left") move(-1); else if (a === "right") move(1); else if (a === "rotate") rotate(); else if (a === "down") soft(); else hard();
    draw();
  }
  window.addEventListener("keydown", onKey);

  let sx = 0, sy = 0, st = 0;
  function onDown(e) { sx = e.clientX; sy = e.clientY; st = performance.now(); }
  function onUp(e) {
    const ax = e.clientX - sx, ay = e.clientY - sy;
    if (Math.abs(ax) < 18 && Math.abs(ay) < 18 && performance.now() - st < 250) { rotate(); draw(); return; }
    if (Math.abs(ax) > Math.abs(ay)) move(ax > 0 ? 1 : -1); else if (ay > 36) hard(); else soft();
    draw();
  }
  board.addEventListener("pointerdown", onDown);
  board.addEventListener("pointerup", onUp);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    const dt = now - last; last = now;
    if (state.over) { endGame(); draw(); return; }
    if (!context.isPaused?.()) {
      acc += dt;
      saveTimer += dt;
      while (acc >= dropInterval(state.level)) { acc -= dropInterval(state.level); if (collides(state.grid, state.piece, 0, 1, state.piece.rot)) { lockPiece(state, context); if (state.over) { endGame(); break; } } else state.piece.y += 1; }
      if (saveTimer > 3000) { saveTimer = 0; persist(); }
    }
    draw();
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    board.removeEventListener("pointerdown", onDown);
    board.removeEventListener("pointerup", onUp);
    if (!state.over) persist();
  };
}

function serialize(state) {
  return { grid: state.grid.map((r) => [...r]), bag: [...state.bag], score: state.score, lines: state.lines, level: state.level, piece: { ...state.piece }, next: { ...state.next } };
}

function restore(snap) {
  if (!snap || !Array.isArray(snap.grid) || snap.grid.length !== ROWS || snap.over) return null;
  const base = initialState();
  return { ...base, ...snap, over: false, grid: snap.grid.map((r) => [...r]) };
}
