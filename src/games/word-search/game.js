import { shuffle, choice, clamp } from "../../utils/random.js";

// 成语库：每个四字成语会被整条藏进字阵，找到即可消除
const IDIOMS = [
  "一举两得", "画蛇添足", "守株待兔", "亡羊补牢", "塞翁失马",
  "井底之蛙", "对牛弹琴", "杯弓蛇影", "刻舟求剑", "掩耳盗铃",
  "狐假虎威", "南辕北辙", "叶公好龙", "愚公移山", "卧薪尝胆",
  "破釜沉舟", "胸有成竹", "锦上添花", "雪中送炭", "水到渠成",
  "鹤立鸡群", "如鱼得水", "画龙点睛", "百发百中", "九牛一毛",
  "三心二意", "四面楚歌", "五光十色", "七上八下", "八仙过海",
  "津津有味", "井然有序", "兴高采烈", "全神贯注", "心花怒放",
  "龙争虎斗", "马到成功", "鸟语花香", "春暖花开", "万紫千红"
];

// 难度即网格大小：找词数随网格增大而增多
const LEVELS = {
  easy: { size: 7, words: 4 },
  medium: { size: 9, words: 6 },
  hard: { size: 11, words: 8 },
  devil: { size: 13, words: 10 }
};

// 八方向：水平/垂直/对角，正反向都允许
const DIRS = [
  [0, 1], [0, -1],
  [1, 0], [-1, 0],
  [1, 1], [-1, -1],
  [1, -1], [-1, 1]
];

const POOL = "天地日月山水风云雷电花鸟鱼龙虎马牛羊金木火土光彩兴心三意上下功成";

function configFor(difficulty) {
  return LEVELS[difficulty] || LEVELS.easy;
}

function key(r, c) {
  return `${r},${c}`;
}

function tryPlace(grid, size, word, dr, dc) {
  const len = word.length;
  const rMax = dr > 0 ? size - len : (dr < 0 ? len - 1 : size - 1);
  const rMin = dr < 0 ? len - 1 : 0;
  const cMax = dc > 0 ? size - len : (dc < 0 ? len - 1 : size - 1);
  const cMin = dc < 0 ? len - 1 : 0;
  if (rMax < rMin || cMax < cMin) return null;
  const sr = rMin + Math.floor(Math.random() * (rMax - rMin + 1));
  const sc = cMin + Math.floor(Math.random() * (cMax - cMin + 1));
  const cells = [];
  for (let i = 0; i < len; i += 1) {
    const r = sr + dr * i;
    const c = sc + dc * i;
    const ch = grid[r][c];
    if (ch && ch !== word[i]) return null; // 冲突
    cells.push([r, c]);
  }
  return cells;
}

function buildGrid(size, count) {
  const chosen = shuffle(IDIOMS.slice()).slice(0, count);
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => ""));
  const placed = [];
  for (const word of chosen) {
    let done = false;
    for (let attempt = 0; attempt < 60 && !done; attempt += 1) {
      const [dr, dc] = choice(DIRS);
      const cells = tryPlace(grid, size, word, dr, dc);
      if (cells) {
        cells.forEach(([r, c], i) => { grid[r][c] = word[i]; });
        placed.push({ word, cells });
        done = true;
      }
    }
  }
  // 空格补随机汉字
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!grid[r][c]) grid[r][c] = POOL[Math.floor(Math.random() * POOL.length)];
    }
  }
  return { grid, words: placed };
}

function newState(difficulty) {
  const { size, words } = configFor(difficulty);
  const { grid, words: placed } = buildGrid(size, words);
  return {
    size,
    grid,
    words: placed.map((p) => ({ word: p.word, cells: p.cells, found: false })),
    moves: 0,
    done: false
  };
}

export function mountWordSearch(root, context) {
  const opts = context?.options || {};
  const difficulty = context?.difficulty || "easy";
  const labels = context?.labels || {};

  let state = newState(difficulty);
  let dragging = false;
  let startCell = null;
  let path = []; // 当前选区单元格 [r,c]
  const handlers = [];

  function on(target, evt, fn) {
    target.addEventListener(evt, fn);
    handlers.push(() => target.removeEventListener(evt, fn));
  }

  // 由起点 + 终点生成直线（仅限八方向且步距相等才合法）
  function lineCells(a, b) {
    const dr = b[0] - a[0];
    const dc = b[1] - a[1];
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) return [a];
    const sr = dr === 0 ? 0 : dr / Math.abs(dr);
    const sc = dc === 0 ? 0 : dc / Math.abs(dc);
    const straight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
    if (!straight) return null;
    const cells = [];
    for (let i = 0; i <= steps; i += 1) cells.push([a[0] + sr * i, a[1] + sc * i]);
    return cells;
  }

  function cellsToText(cells) {
    return cells.map(([r, c]) => state.grid[r][c]).join("");
  }

  function matchSelection(cells) {
    const fwd = cellsToText(cells);
    const back = fwd.split("").reverse().join("");
    return state.words.find((w) => !w.found && (w.word === fwd || w.word === back)) || null;
  }

  function commit() {
    if (path.length > 1) {
      const hit = matchSelection(path);
      if (hit) {
        hit.found = true;
        context?.playSound?.("win");
        if (state.words.every((w) => w.found)) finish();
      }
    }
    dragging = false;
    startCell = null;
    path = [];
    render();
  }

  function finish() {
    if (state.done) return;
    state.done = true;
    const base = state.words.length * 200 + state.size * 50;
    const score = clamp(Math.round(base * 1000 / Math.max(1, state.moves)), 0, 9999);
    context?.playSound?.("win");
    context?.reportResult?.({
      outcome: "complete",
      detail: `${state.size}×${state.size} 集齐 ${state.words.length} 成语`,
      score,
      moves: state.moves
    });
  }

  function restart() {
    state = newState(difficulty);
    dragging = false;
    startCell = null;
    path = [];
    render();
  }

  function inPath(r, c) {
    return path.some(([pr, pc]) => pr === r && pc === c);
  }

  function foundSet() {
    const s = new Set();
    state.words.forEach((w) => { if (w.found) w.cells.forEach(([r, c]) => s.add(key(r, c))); });
    return s;
  }

  function render() {
    const n = state.size;
    const cap = Math.min(root.clientWidth || 360, 360);
    const cell = clamp(Math.floor((cap - (n - 1) - 8) / n), 16, 40);
    const fs = clamp(Math.round(cell * 0.62), 11, 24);
    const found = foundSet();
    const remain = state.words.filter((w) => !w.found).length;
    const total = state.words.length;

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.done ? "全部找出，过关" : "找词 · 拖出一条成语"}</strong>
          <p class="game-note">${labels.mode || "单人"} · ${labels.difficulty || ""} · ${n}×${n}</p>
        </div>
        <div class="mini-stats"><span>余 ${remain}/${total}</span><span>步 ${state.moves}</span></div>
      </section>
      <section class="board-wrap">
        <div class="ws-grid" style="display:grid;grid-template-columns:repeat(${n}, ${cell}px);gap:1px;justify-content:center;user-select:none;touch-action:none;max-width:100%;">
          ${state.grid.map((row, r) => row.map((ch, c) => {
            const isFound = found.has(key(r, c));
            const sel = inPath(r, c);
            const bg = sel ? "var(--accent,#3a6df0)" : (isFound ? "var(--accent-soft,#cfe0ff)" : "var(--surface,#f4f4f4)");
            const col = sel ? "#fff" : (isFound ? "var(--accent,#3a6df0)" : "var(--text,#222)");
            return `<button type="button" data-r="${r}" data-c="${c}" aria-label="${ch}" style="width:${cell}px;height:${cell}px;border:1px solid var(--border,#3334);background:${bg};color:${col};font-size:${fs}px;line-height:1;cursor:pointer;padding:0;font-weight:600">${ch}</button>`;
          }).join("")).join("")}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px">
          ${state.words.map((w) => `<span style="font-size:13px;padding:3px 8px;border-radius:12px;border:1px solid var(--border,#3334);background:var(--surface,#f4f4f4);${w.found ? "opacity:.45;text-decoration:line-through" : ""}">${w.word}</span>`).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    const grid = root.querySelector(".ws-grid");
    const cellAt = (target) => {
      const btn = target?.closest?.("[data-r]");
      if (!btn) return null;
      return [Number(btn.dataset.r), Number(btn.dataset.c)];
    };
    const update = (cur) => {
      if (!dragging || !startCell || !cur) return;
      const line = lineCells(startCell, cur);
      path = line || [startCell];
      render();
    };

    on(grid, "pointerdown", (e) => {
      if (state.done) return;
      const cur = cellAt(e.target);
      if (!cur) return;
      e.preventDefault();
      dragging = true;
      startCell = cur;
      path = [cur];
      state.moves += 1;
      render();
    });
    on(grid, "pointermove", (e) => {
      if (!dragging) return;
      const cur = cellAt(document.elementFromPoint(e.clientX, e.clientY));
      update(cur);
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  // window 监听只绑一次，避免 render 累积泄漏
  const onUp = () => { if (dragging) commit(); };
  window.addEventListener("pointerup", onUp);
  handlers.push(() => window.removeEventListener("pointerup", onUp));

  render();

  return () => {
    handlers.forEach((off) => off());
    state.done = true;
  };
}
