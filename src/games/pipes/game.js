import { choice, shuffle, clamp } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

// 方向位掩码: 北 上 东 右 南 下 西 左
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const ALL = [N, E, S, W];
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };
const DELTA = { [N]: [-1, 0], [E]: [0, 1], [S]: [1, 0], [W]: [0, -1] };

// 顺时针旋转一个方向掩码 90°: 北->东 东->南 南->西 西->北
function rotateMask(mask) {
  let next = 0;
  if (mask & N) next |= E;
  if (mask & E) next |= S;
  if (mask & S) next |= W;
  if (mask & W) next |= N;
  return next;
}

const SIZES = { easy: 4, medium: 5, hard: 6, devil: 7 };

function gridSize(difficulty) {
  return SIZES[difficulty] || SIZES.medium;
}

// 形如管道的 SVG: 以中心为节点, 向掩码所示方向画粗线
function pipeSvg(mask, accent) {
  const segs = [];
  if (mask & N) segs.push('<line x1="50" y1="50" x2="50" y2="0"/>');
  if (mask & S) segs.push('<line x1="50" y1="50" x2="50" y2="100"/>');
  if (mask & W) segs.push('<line x1="50" y1="50" x2="0" y2="50"/>');
  if (mask & E) segs.push('<line x1="50" y1="50" x2="100" y2="50"/>');
  const col = accent ? "#5ad1ff" : "#9aa6c4";
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block" aria-hidden="true">
    <g stroke="${col}" stroke-width="20" stroke-linecap="round" fill="none">${segs.join("")}</g>
    <circle cx="50" cy="50" r="11" fill="${accent ? "#5ad1ff" : "#7d88a8"}"/>
  </svg>`;
}

function emptyTile() {
  return { base: 0, rot: 0 };
}

function tileMask(tile) {
  let m = tile.base;
  for (let i = 0; i < (tile.rot % 4); i += 1) m = rotateMask(m);
  return m;
}

// 沿随机路径铺一条 start->end 通路, 形成可解局, 再随机旋转打乱
function buildPuzzle(size) {
  const tiles = Array.from({ length: size * size }, emptyTile);
  const idx = (r, c) => r * size + c;
  const start = idx(0, 0);
  const end = idx(size - 1, size - 1);

  // 随机游走出一条通路
  const visited = new Set([0]);
  const path = [0];
  let cur = 0;
  let guard = 0;
  while (cur !== end && guard < size * size * 12) {
    guard += 1;
    const r = Math.floor(cur / size);
    const c = cur % size;
    const opts = [];
    for (const d of ALL) {
      const nr = r + DELTA[d][0];
      const nc = c + DELTA[d][1];
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const ni = idx(nr, nc);
      if (visited.has(ni)) continue;
      // 偏向朝终点走, 但保留分叉随机性
      const bias = (nr >= r && nc >= c) ? [d, d] : [d];
      opts.push(...bias);
    }
    if (!opts.length) {
      // 退一格再试
      path.pop();
      cur = path[path.length - 1] ?? 0;
      if (path.length === 0) { path.push(0); cur = 0; }
      continue;
    }
    const dir = choice(opts);
    const nr = r + DELTA[dir][0];
    const nc = c + DELTA[dir][1];
    const ni = idx(nr, nc);
    tiles[cur].base |= dir;
    tiles[ni].base |= OPP[dir];
    visited.add(ni);
    path.push(ni);
    cur = ni;
  }

  // 给空白格填一点装饰管道(只为视觉, 不影响解): 连到任一相邻有路格
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i].base) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    const cand = shuffle(ALL).filter((d) => {
      const nr = r + DELTA[d][0];
      const nc = c + DELTA[d][1];
      return nr >= 0 && nc >= 0 && nr < size && nc < size;
    });
    const pick = cand.slice(0, choice([1, 2]));
    pick.forEach((d) => (tiles[i].base |= d));
  }

  // 随机旋转打乱; 确保起点不是已连通态
  tiles.forEach((t) => (t.rot = Math.floor(Math.random() * 4)));
  return { size, start, end, tiles };
}

// 从 start 沿互相对接的开口洪泛, 看能否到 end
function isConnected(state) {
  const { size, start, end, tiles } = state;
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const cell = stack.pop();
    if (seen.has(cell)) continue;
    seen.add(cell);
    if (cell === end) return { solved: true, seen };
    const r = Math.floor(cell / size);
    const c = cell % size;
    const m = tileMask(tiles[cell]);
    for (const d of ALL) {
      if (!(m & d)) continue;
      const nr = r + DELTA[d][0];
      const nc = c + DELTA[d][1];
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const ni = nr * size + nc;
      if (tileMask(tiles[ni]) & OPP[d]) stack.push(ni);
    }
  }
  return { solved: seen.has(end), seen };
}

function validState(snap) {
  return snap && Array.isArray(snap.tiles) && Number.isInteger(snap.size)
    && snap.tiles.length === snap.size * snap.size;
}

export function mountPipes(root, context) {
  const difficulty = context.difficulty || "medium";
  const storageKey = `pipes:${difficulty}`;

  function freshState() {
    const s = buildPuzzle(gridSize(difficulty));
    s.moves = 0;
    s.done = false;
    return s;
  }

  let state = (context.savedState && validState(context.savedState))
    ? context.savedState
    : (() => {
        const legacy = loadState(storageKey, null);
        return validState(legacy) ? legacy : freshState();
      })();
  if (typeof state.moves !== "number") state.moves = 0;
  state.done = false;

  let disposed = false;
  let reported = false;

  function save() {
    saveState(storageKey, state);
    if (context.saveSession && !state.done) {
      context.saveSession(state, { stage: `进行中 · ${state.moves} 步`, level: state.moves, score: state.moves });
    }
  }

  function score() {
    return Math.max(50, 1000 - state.moves * 10);
  }

  function rotate(i) {
    if (disposed || state.done) return;
    const tile = state.tiles[i];
    if (!tile.base) return;
    tile.rot = (tile.rot + 1) % 4;
    state.moves += 1;
    context.playSound?.("tap");
    const r = isConnected(state);
    if (r.solved) {
      state.done = true;
      if (!reported) {
        reported = true;
        context.reportResult?.({ outcome: "complete", score: score(), moves: state.moves });
      }
      context.clearSession?.();
      removeState(storageKey);
    } else {
      save();
    }
    render();
  }

  function restart() {
    state = freshState();
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function render() {
    const conn = isConnected(state).seen;
    const cells = state.tiles.map((tile, i) => {
      const m = tileMask(tile);
      const live = conn.has(i) && tile.base;
      const isStart = i === state.start;
      const isEnd = i === state.end;
      const ring = isStart ? "outline:2px solid #4fd483;" : isEnd ? "outline:2px solid #ff9d5a;" : "";
      const bg = live ? "#16324a" : "#101626";
      return `<button type="button" data-i="${i}" aria-label="管道 ${i + 1}"
        style="aspect-ratio:1;border:1px solid #243049;border-radius:10px;padding:6%;background:${bg};${ring}cursor:pointer;position:relative">
        ${pipeSvg(m, live)}
        ${isStart ? '<span style="position:absolute;left:4px;top:2px;font-size:10px;color:#4fd483">源</span>' : ""}
        ${isEnd ? '<span style="position:absolute;right:4px;bottom:2px;font-size:10px;color:#ff9d5a">汇</span>' : ""}
      </button>`;
    }).join("");

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.done ? "全线接通!" : "旋转管道接通水流"}</strong>
          <p class="game-note">${context.labels?.mode || "单人"} · ${context.labels?.difficulty || difficulty} · 点按旋转 90°</p>
        </div>
        <div class="mini-stats"><span>步数 ${state.moves}</span><span>分 ${state.done ? score() : "—"}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(${state.size},1fr);gap:6px;max-width:min(92vw,420px);margin:0 auto;width:100%">
          ${cells}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-i]").forEach((b) => {
      b.addEventListener("click", () => { b.blur(); rotate(Number(b.dataset.i)); });
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  return () => { disposed = true; };
}
