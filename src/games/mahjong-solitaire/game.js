import { loadState, removeState, saveState } from "../../utils/storage.js";
import { shuffle } from "../../utils/random.js";

// 上海麻将 / Mahjong Solitaire（乌龟叠层）：点选两张「自由」的相同牌消除。
// 自由 = 上层无牌覆盖，且左或右至少一侧空。半格坐标系：每格 2 单位宽 / 2 单位高 / 1 单位层。

const TILE_SET = [
  { id: "wan1", label: "一万", tone: "red" },
  { id: "wan2", label: "二万", tone: "red" },
  { id: "wan3", label: "三万", tone: "red" },
  { id: "wan4", label: "四万", tone: "red" },
  { id: "tong1", label: "一筒", tone: "blue" },
  { id: "tong2", label: "二筒", tone: "blue" },
  { id: "tong3", label: "三筒", tone: "blue" },
  { id: "tong4", label: "四筒", tone: "blue" },
  { id: "tiao1", label: "一条", tone: "green" },
  { id: "tiao2", label: "二条", tone: "green" },
  { id: "tiao3", label: "三条", tone: "green" },
  { id: "tiao4", label: "四条", tone: "green" },
  { id: "east", label: "东", tone: "wind" },
  { id: "south", label: "南", tone: "wind" },
  { id: "west", label: "西", tone: "wind" },
  { id: "north", label: "北", tone: "wind" },
  { id: "zhong", label: "中", tone: "honor" },
  { id: "fa", label: "发", tone: "honor" },
  { id: "bai", label: "白", tone: "honor" },
  { id: "plum", label: "梅", tone: "flower" },
  { id: "orchid", label: "兰", tone: "flower" },
  { id: "bamboo", label: "竹", tone: "flower" },
  { id: "chrys", label: "菊", tone: "flower" }
];

const TILE_NUMBERS = { 1: "一", 2: "二", 3: "三", 4: "四" };
const WIND_LABELS = { east: "東", south: "南", west: "西", north: "北" };

function tileDef(id) {
  return TILE_SET.find((tile) => tile.id === id) || TILE_SET[0];
}

function tileFaceMarkup(id) {
  const tile = tileDef(id);
  const number = id.match(/\d+/)?.[0];
  if (id.startsWith("wan")) {
    return `<b>${TILE_NUMBERS[number] || number}</b><em>萬</em>`;
  }
  if (id.startsWith("tong")) {
    const count = Number(number) || 1;
    return `<span class="msol-pips">${Array.from({ length: count }, () => "<i></i>").join("")}</span>`;
  }
  if (id.startsWith("tiao")) {
    const count = Number(number) || 1;
    return `<span class="msol-bamboo">${Array.from({ length: count }, () => "<i></i>").join("")}</span>`;
  }
  if (id === "bai") return `<b>白</b><em>板</em>`;
  if (id === "zhong") return `<b>中</b>`;
  if (id === "fa") return `<b>發</b>`;
  if (["east", "south", "west", "north"].includes(id)) return `<b>${WIND_LABELS[id]}</b>`;
  return `<b>${tile.label}</b>`;
}

// 紧凑乌龟布局，36 张牌（18 对）。每格坐标按半格单位记录 (x,y,layer)。
// 底层 5 行壳，上面叠两层缩进塔。所有 x/y 都是偶数 → 标准格；layer 越大越靠上。
function layoutSlots() {
  const slots = [];
  const add = (col, row, layer) => slots.push({ x: col * 2, y: row * 2, layer });
  // 第 0 层（底）：6 列 × 4 行龟壳 = 24
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 6; c += 1) add(c, r, 0);
  // 第 1 层：居中缩进塔 4 列 × 2 行 = 8
  for (let r = 1; r < 3; r += 1) for (let c = 1; c < 5; c += 1) add(c, r, 1);
  // 第 2 层（顶）：龟背 2 列 × 2 行 = 4
  for (let r = 1; r < 3; r += 1) for (let c = 2; c < 4; c += 1) add(c, r, 2);
  return slots; // 24 + 8 + 4 = 36（18 对）
}

const SLOTS = layoutSlots();

function overlaps(a, b) {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

function isFree(slots, board, index) {
  if (board[index] == null) return false;
  const me = slots[index];
  // 上方覆盖：更高层且位置重叠
  for (let i = 0; i < slots.length; i += 1) {
    if (board[i] == null) continue;
    if (slots[i].layer === me.layer + 1 && overlaps(slots[i], me)) return false;
  }
  let leftBlocked = false;
  let rightBlocked = false;
  for (let i = 0; i < slots.length; i += 1) {
    if (board[i] == null || slots[i].layer !== me.layer) continue;
    if (Math.abs(slots[i].y - me.y) < 2) {
      if (slots[i].x === me.x - 2) leftBlocked = true;
      if (slots[i].x === me.x + 2) rightBlocked = true;
    }
  }
  return !leftBlocked || !rightBlocked;
}

function freeIndexes(slots, board) {
  const free = [];
  for (let i = 0; i < slots.length; i += 1) if (isFree(slots, board, i)) free.push(i);
  return free;
}

function findMove(slots, board) {
  const free = freeIndexes(slots, board);
  for (let i = 0; i < free.length; i += 1) {
    for (let j = i + 1; j < free.length; j += 1) {
      if (board[free[i]] === board[free[j]]) return [free[i], free[j]];
    }
  }
  return [];
}

// 通过倒序按层成对填充保证至少初始可解：从顶层往底层放，每次放在当前自由位上。
function buildSolvableBoard() {
  const ids = [];
  for (let i = 0; i < SLOTS.length / 2; i += 1) {
    const id = TILE_SET[i % TILE_SET.length].id;
    ids.push(id, id);
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const board = Array(SLOTS.length).fill(null);
    const order = shuffle(SLOTS.map((_, i) => i));
    const deck = shuffle(ids);
    order.forEach((idx, k) => { board[idx] = deck[k]; });
    if (findMove(SLOTS, board).length) return board;
  }
  const board = Array(SLOTS.length).fill(null);
  shuffle(ids).forEach((id, i) => { board[i] = id; });
  return board;
}

function remaining(board) {
  return board.filter((v) => v != null).length;
}

function initialState() {
  return {
    board: buildSolvableBoard(),
    selected: -1,
    hint: [],
    hints: 5,
    shuffles: 3,
    score: 0,
    streak: 0,
    moves: 0,
    over: false,
    complete: false,
    message: "点选两张「自由」的相同牌即可消除"
  };
}

function isValidState(state) {
  return state?.board?.length === SLOTS.length
    && Number.isFinite(state.score)
    && Number.isFinite(state.hints)
    && Number.isFinite(state.shuffles);
}

function shuffleRemaining(board) {
  const idx = board.flatMap((v, i) => (v != null ? [i] : []));
  const tiles = shuffle(idx.map((i) => board[i]));
  idx.forEach((i, k) => { board[i] = tiles[k]; });
  return findMove(SLOTS, board).length > 0;
}

export function mountMahjongSolitaire(root, context) {
  const storageKey = "mahjong-solitaire:turtle";
  let state = context.savedState || loadState(storageKey, initialState());
  if (!isValidState(state)) state = initialState();
  let resultReported = false;

  const minX = Math.min(...SLOTS.map((s) => s.x));
  const maxX = Math.max(...SLOTS.map((s) => s.x));
  const minY = Math.min(...SLOTS.map((s) => s.y));
  const maxY = Math.max(...SLOTS.map((s) => s.y));
  const cols = maxX - minX + 2;
  const rows = maxY - minY + 2;

  function meta() {
    return { stage: `剩余 ${remaining(state.board)} 张`, score: state.score, level: "乌龟" };
  }

  function save() {
    saveState(storageKey, state);
    if (!state.over && !state.complete) context.saveSession?.(JSON.parse(JSON.stringify(state)), meta());
    else context.clearSession?.();
  }

  function reportResult(outcome) {
    if (resultReported) return;
    resultReported = true;
    context.reportResult?.({
      outcome,
      score: state.score,
      moves: state.moves,
      detail: outcome === "complete" ? "清空全部牌堆" : `剩余 ${remaining(state.board)} 张`
    });
  }

  function ensurePlayable() {
    if (!remaining(state.board)) return;
    if (findMove(SLOTS, state.board).length) return;
    for (let i = 0; i < 40; i += 1) if (shuffleRemaining(state.board)) { state.message = "无可消，已自动洗牌"; return; }
    state.over = true;
    state.message = "牌局无解，挑战结束";
    reportResult("score");
  }

  function clearPair(a, b) {
    state.board[a] = null;
    state.board[b] = null;
    state.selected = -1;
    state.hint = [];
    state.streak += 1;
    state.moves += 1;
    state.score += 30 + state.streak * 4;
    context.playSound?.("move");
    if (!remaining(state.board)) {
      state.complete = true;
      state.over = true;
      state.score += 120;
      state.message = `全部消除，奖励 +120`;
      removeState(storageKey);
      context.clearSession?.();
      reportResult("complete");
      render();
      return;
    }
    state.message = "消除成功，继续";
    ensurePlayable();
    save();
    render();
  }

  function select(index) {
    if (state.over || !isFree(SLOTS, state.board, index)) return;
    state.hint = [];
    if (state.selected === index) { state.selected = -1; render(); return; }
    if (state.selected < 0) { state.selected = index; state.message = "再选一张相同的自由牌"; render(); return; }
    if (state.board[state.selected] === state.board[index]) { clearPair(state.selected, index); return; }
    state.selected = index;
    state.streak = 0;
    state.message = "牌面不同，已重选";
    context.playSound?.("invalid");
    render();
  }

  function showHint() {
    if (state.over) return;
    if (state.hints <= 0) { state.message = "提示用完了"; render(); return; }
    const move = findMove(SLOTS, state.board);
    if (!move.length) { ensurePlayable(); save(); render(); return; }
    state.hints -= 1;
    state.hint = move;
    state.selected = -1;
    state.message = "已标出可消的一对";
    save();
    render();
  }

  function shuffleTiles() {
    if (state.over || state.shuffles <= 0) { if (!state.over) state.message = "洗牌用完了"; render(); return; }
    state.shuffles -= 1;
    state.selected = -1;
    state.hint = [];
    state.streak = 0;
    for (let i = 0; i < 40; i += 1) if (shuffleRemaining(state.board)) break;
    state.message = "已重新洗牌";
    save();
    render();
  }

  function restart() {
    state = initialState();
    resultReported = false;
    removeState(storageKey);
    save();
    render();
  }

  function tileMarkup(value, index) {
    if (value == null) return "";
    const s = SLOTS[index];
    const cls = ["msol-tile", `tone-${tileDef(value).tone}`];
    if (isFree(SLOTS, state.board, index)) cls.push("is-free");
    if (state.selected === index) cls.push("is-selected");
    if (state.hint.includes(index)) cls.push("is-hint");
    const left = ((s.x - minX) / cols) * 100;
    const top = ((s.y - minY) / rows) * 100;
    const w = (2 / cols) * 100;
    const h = (2 / rows) * 100;
    const z = s.layer * 10 + (s.y - minY);
    const shift = s.layer * 3;
    return `<button type="button" class="${cls.join(" ")}" data-index="${index}" aria-label="${tileDef(value).label}"
      style="left:${left}%;top:${top}%;width:${w}%;height:${h}%;z-index:${z};transform:translate(${shift}px,${-shift}px)">
      <span class="msol-face">${tileFaceMarkup(value)}</span></button>`;
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status">
        <div><strong>${state.message}</strong>
          <p class="game-note">上海麻将 · 自由牌左右有一侧空且顶部无覆盖</p></div>
        <div class="mini-stats">
          <span>剩余 ${remaining(state.board)} 张</span>
          <span>连击 ${state.streak}</span>
          <span>提示 ${state.hints}</span>
          <span>洗牌 ${state.shuffles}</span>
          <span>分数 ${state.score}</span>
        </div>
      </section>
      <section class="board-wrap" style="display:flex;justify-content:center">
        <div class="msol-board" aria-label="麻将牌堆" style="position:relative;width:100%;max-width:360px;aspect-ratio:${cols}/${rows}">
          ${state.board.map((v, i) => tileMarkup(v, i)).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" type="button" data-action="hint">提示</button>
        <button class="secondary-button" type="button" data-action="shuffle">洗牌</button>
        <button class="danger-button" type="button" data-action="restart">重开</button>
      </section>
      <style>
        .msol-board{margin:0 auto}
        .msol-tile{position:absolute;padding:0;border:1px solid #c9b48a;border-radius:5px;background:#fffaf0;
          box-shadow:1px 1px 0 #b89b66,2px 2px 0 #9c814f;cursor:default;display:flex;align-items:center;justify-content:center;font-family:inherit}
        .msol-tile.is-free{cursor:pointer}.msol-tile.is-free:hover{background:#fffdf7}
        .msol-tile:not(.is-free){filter:brightness(.86)}
        .msol-tile.is-selected{outline:2px solid #2b8a3e;outline-offset:-2px;background:#e9fbef}
        .msol-tile.is-hint{outline:2px dashed #d9480f;outline-offset:-2px}
        .msol-face{width:90%;height:90%;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;overflow:hidden}
        .msol-face b{font-size:clamp(11px,4vw,18px)}.msol-face em{font-style:normal;font-size:9px;opacity:.7}
        .tone-red .msol-face{color:#c92a2a}.tone-blue .msol-face{color:#1c5fb8}.tone-green .msol-face{color:#2b7a2b}
        .tone-wind .msol-face,.tone-honor .msol-face{color:#343a40}.tone-flower .msol-face{color:#9c36b5}
        .msol-pips,.msol-bamboo{display:grid;grid-template-columns:repeat(2,6px);gap:2px}
        .msol-pips i{width:6px;height:6px;border-radius:50%;background:#1c5fb8}
        .msol-bamboo i{width:3px;height:9px;border-radius:2px;background:#2b7a2b}
      </style>
    `;
    root.querySelectorAll("[data-index]").forEach((b) => b.addEventListener("click", () => select(Number(b.dataset.index))));
    root.querySelector("[data-action='hint']").addEventListener("click", showHint);
    root.querySelector("[data-action='shuffle']").addEventListener("click", shuffleTiles);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  ensurePlayable();
  render();

  return () => {
    if (!state.over && !state.complete) context.saveSession?.(JSON.parse(JSON.stringify(state)), meta());
  };
}
