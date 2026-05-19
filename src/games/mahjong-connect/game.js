import { loadState, removeState, saveState } from "../../utils/storage.js";

const ROWS = 8;
const COLS = 10;
const MAX_LEVEL = 30;
const BLOCKER = "blocker";
const TILE_SET = [
  { id: "wan1", label: "一万", tone: "red" },
  { id: "wan2", label: "二万", tone: "red" },
  { id: "wan3", label: "三万", tone: "red" },
  { id: "tong1", label: "一筒", tone: "blue" },
  { id: "tong2", label: "二筒", tone: "blue" },
  { id: "tong3", label: "三筒", tone: "blue" },
  { id: "tiao1", label: "一条", tone: "green" },
  { id: "tiao2", label: "二条", tone: "green" },
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

const DIFFICULTY = {
  easy: { label: "简单", pairs: 18, growth: 0.45, blockers: -2, hints: 6, shuffles: 5 },
  medium: { label: "中等", pairs: 22, growth: 0.58, blockers: 0, hints: 4, shuffles: 4 },
  hard: { label: "困难", pairs: 26, growth: 0.68, blockers: 3, hints: 3, shuffles: 3 },
  devil: { label: "魔鬼", pairs: 30, growth: 0.78, blockers: 6, hints: 2, shuffles: 2 }
};

function configFor(difficulty, level) {
  const base = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const blockers = Math.min(12, Math.max(0, Math.floor((level - 1) * 0.38) + base.blockers));
  const pairs = Math.min(Math.floor((ROWS * COLS - blockers) / 2), Math.max(12, Math.round(base.pairs + level * base.growth)));
  const tileKinds = Math.min(TILE_SET.length, Math.max(8, 8 + Math.floor((level - 1) / 4)));
  return {
    ...base,
    pairs,
    blockers,
    tileKinds
  };
}

function emptyBoard() {
  return Array(ROWS * COLS).fill("");
}

function rowOf(index) {
  return Math.floor(index / COLS);
}

function colOf(index) {
  return index % COLS;
}

function indexOf(row, col) {
  return row * COLS + col;
}

function inside(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function tileDef(id) {
  return TILE_SET.find((tile) => tile.id === id) || TILE_SET[0];
}

function createTiles(config) {
  const ids = TILE_SET.slice(0, config.tileKinds).map((tile) => tile.id);
  const tiles = [];
  for (let pair = 0; pair < config.pairs; pair += 1) {
    const id = ids[pair % ids.length];
    tiles.push(id, id);
  }
  return shuffle(tiles);
}

function placeBlockers(board, count) {
  const candidates = board.flatMap((value, index) => (value ? [] : [index]));
  for (let i = 0; i < count && candidates.length; i += 1) {
    const pick = Math.floor(Math.random() * candidates.length);
    board[candidates[pick]] = BLOCKER;
    candidates.splice(pick, 1);
  }
}

function createBoard(config) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const board = emptyBoard();
    const cells = shuffle(Array.from({ length: ROWS * COLS }, (_, index) => index));
    const tiles = createTiles(config);
    tiles.forEach((tile, offset) => {
      board[cells[offset]] = tile;
    });
    placeBlockers(board, config.blockers);
    if (findMove(board).length) return board;
  }
  const fallback = emptyBoard();
  createTiles(config).forEach((tile, index) => {
    fallback[index] = tile;
  });
  return fallback;
}

function isPassable(board, row, col, target) {
  if (!inside(row, col)) return true;
  const index = indexOf(row, col);
  return index === target || !board[index];
}

function findPath(board, start, end) {
  if (start === end || board[start] !== board[end] || board[start] === BLOCKER) return [];
  const queue = [];
  const seen = new Set();
  const directions = [
    { dr: -1, dc: 0, name: "up" },
    { dr: 1, dc: 0, name: "down" },
    { dr: 0, dc: -1, name: "left" },
    { dr: 0, dc: 1, name: "right" }
  ];
  const startRow = rowOf(start);
  const startCol = colOf(start);
  const endRow = rowOf(end);
  const endCol = colOf(end);

  queue.push({ row: startRow, col: startCol, dir: "", turns: 0, path: [[startRow, startCol]] });
  while (queue.length) {
    const current = queue.shift();
    for (const direction of directions) {
      const turns = current.dir && current.dir !== direction.name ? current.turns + 1 : current.turns;
      if (turns > 2) continue;
      const row = current.row + direction.dr;
      const col = current.col + direction.dc;
      if (row < -1 || row > ROWS || col < -1 || col > COLS) continue;
      if (!isPassable(board, row, col, end)) continue;
      const key = `${row}:${col}:${direction.name}:${turns}`;
      if (seen.has(key)) continue;
      const path = [...current.path, [row, col]];
      if (row === endRow && col === endCol) return path;
      seen.add(key);
      queue.push({ row, col, dir: direction.name, turns, path });
    }
  }
  return [];
}

function findMove(board) {
  const byTile = new Map();
  board.forEach((value, index) => {
    if (!value || value === BLOCKER) return;
    if (!byTile.has(value)) byTile.set(value, []);
    byTile.get(value).push(index);
  });
  for (const indexes of byTile.values()) {
    for (let i = 0; i < indexes.length; i += 1) {
      for (let j = i + 1; j < indexes.length; j += 1) {
        const path = findPath(board, indexes[i], indexes[j]);
        if (path.length) return [indexes[i], indexes[j]];
      }
    }
  }
  return [];
}

function shuffleBoardTiles(board) {
  const indexes = board.flatMap((value, index) => (value && value !== BLOCKER ? [index] : []));
  const tiles = shuffle(indexes.map((index) => board[index]));
  indexes.forEach((index, offset) => {
    board[index] = tiles[offset];
  });
  return findMove(board).length > 0;
}

function ensureMove(state) {
  if (!remainingPairs(state.board)) return true;
  if (findMove(state.board).length) return true;
  for (let i = 0; i < 40; i += 1) {
    if (shuffleBoardTiles(state.board)) {
      state.message = "没有可连牌，已自动洗牌";
      return true;
    }
  }
  state.over = true;
  state.message = "牌局无解，挑战结束";
  return false;
}

function remainingTiles(board) {
  return board.filter((value) => value && value !== BLOCKER).length;
}

function remainingPairs(board) {
  return remainingTiles(board) / 2;
}

function initialState(difficulty, level = 1, score = 0) {
  const config = configFor(difficulty, level);
  return {
    level,
    maxLevel: MAX_LEVEL,
    board: createBoard(config),
    selected: -1,
    hint: [],
    lastPath: [],
    score,
    streak: 0,
    hints: config.hints,
    shuffles: config.shuffles,
    message: "点选两张相同牌，路径两折以内即可消除",
    over: false,
    complete: false
  };
}

function isValidState(state) {
  return state?.board?.length === ROWS * COLS
    && Number.isFinite(state.level)
    && Number.isFinite(state.score)
    && Number.isFinite(state.hints)
    && Number.isFinite(state.shuffles);
}

function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}

function sessionMeta(state) {
  return {
    level: `${state.level}/${MAX_LEVEL}`,
    stage: `剩余 ${remainingPairs(state.board)} 对`,
    score: state.score
  };
}

function progressText(state) {
  return `剩余 ${remainingPairs(state.board)} 对 · 提示 ${state.hints} · 洗牌 ${state.shuffles}`;
}

export function mountMahjongConnect(root, context) {
  const difficulty = DIFFICULTY[context.difficulty] ? context.difficulty : "medium";
  const storageKey = `mahjong-connect:${difficulty}`;
  let state = context.savedState || loadState(storageKey, initialState(difficulty));
  if (!isValidState(state)) state = initialState(difficulty);
  let resultReported = false;

  function save() {
    saveState(storageKey, state);
    if (!state.over && !state.complete) context.saveSession?.(serializeState(state), sessionMeta(state));
    else context.clearSession?.();
  }

  function reportResult(outcome) {
    if (resultReported) return;
    resultReported = true;
    context.reportResult?.({
      outcome,
      score: state.score,
      detail: outcome === "complete" ? "完成全部连连看关卡" : `挑战到第 ${state.level} 关`,
      extra: progressText(state)
    });
  }

  function advanceLevel() {
    const bonus = Math.round(80 + state.level * 18 + state.streak * 8);
    state.score += bonus;
    if (state.level >= MAX_LEVEL) {
      state.over = true;
      state.complete = true;
      state.message = `全部通关，奖励 +${bonus}`;
      removeState(storageKey);
      context.clearSession?.();
      reportResult("complete");
      render();
      return;
    }
    state = initialState(difficulty, state.level + 1, state.score);
    state.message = `进入第 ${state.level} 关，上一关奖励 +${bonus}`;
    save();
    render();
  }

  function clearPair(a, b, path) {
    const removedLabel = tileDef(state.board[a]).label;
    const gained = 32 + state.level * 3 + state.streak * 4 + Math.max(0, 4 - path.length);
    state.board[a] = "";
    state.board[b] = "";
    state.selected = -1;
    state.hint = [];
    state.lastPath = path
      .filter(([row, col]) => inside(row, col))
      .map(([row, col]) => indexOf(row, col));
    state.streak += 1;
    state.score += gained;
    context.playSound?.("move");
    if (!remainingTiles(state.board)) {
      state.message = "本关清空";
      advanceLevel();
      return;
    }
    state.message = `消除 ${removedLabel}，得分 +${gained}`;
    ensureMove(state);
    save();
    render();
  }

  function select(index) {
    const value = state.board[index];
    if (state.over || !value || value === BLOCKER) return;
    state.lastPath = [];
    state.hint = [];
    if (state.selected < 0 || state.selected === index) {
      state.selected = state.selected === index ? -1 : index;
      state.message = state.selected >= 0 ? "再选一张相同牌" : "点选两张相同牌";
      save();
      render();
      return;
    }
    const first = state.selected;
    const firstValue = state.board[first];
    if (firstValue !== value) {
      state.selected = index;
      state.streak = 0;
      state.message = "牌面不同，已重新选择";
      context.playSound?.("invalid");
      save();
      render();
      return;
    }
    const path = findPath(state.board, first, index);
    if (!path.length) {
      state.selected = index;
      state.streak = 0;
      state.message = "这两张牌暂时连不起来";
      context.playSound?.("invalid");
      save();
      render();
      return;
    }
    clearPair(first, index, path);
  }

  function showHint() {
    if (state.over) return;
    const move = findMove(state.board);
    if (!move.length) {
      state.message = "暂时没有可消除牌";
      ensureMove(state);
    } else if (state.hints <= 0) {
      state.message = "提示次数用完了";
    } else {
      state.hints -= 1;
      state.hint = move;
      state.selected = -1;
      state.lastPath = [];
      state.message = "已标出可连牌";
      context.playSound?.("select");
    }
    save();
    render();
  }

  function shuffleTiles() {
    if (state.over) return;
    if (state.shuffles <= 0) {
      state.message = "洗牌次数用完了";
      render();
      return;
    }
    state.shuffles -= 1;
    state.selected = -1;
    state.hint = [];
    state.lastPath = [];
    for (let i = 0; i < 40; i += 1) {
      if (shuffleBoardTiles(state.board)) break;
    }
    state.streak = 0;
    state.message = "已重新洗牌";
    save();
    render();
  }

  function restart() {
    state = initialState(difficulty);
    resultReported = false;
    removeState(storageKey);
    save();
    render();
  }

  function tileMarkup(value, index) {
    const selected = state.selected === index ? " is-selected" : "";
    const hinted = state.hint.includes(index) ? " is-hint" : "";
    const path = state.lastPath.includes(index) ? " is-path" : "";
    if (!value) return `<span class="mahjong-cell is-empty${path}" aria-hidden="true"></span>`;
    if (value === BLOCKER) return `<span class="mahjong-cell is-blocker" aria-label="障碍"></span>`;
    const tile = tileDef(value);
    return `
      <button type="button" class="mahjong-cell mahjong-tile tone-${tile.tone}${selected}${hinted}${path}" data-index="${index}" aria-label="${tile.label}">
        <span>${tile.label}</span>
      </button>
    `;
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status mahjong-connect-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${DIFFICULTY[difficulty].label} · ${progressText(state)}</p>
        </div>
        <div class="mini-stats">
          <span>关卡 ${state.level}/${MAX_LEVEL}</span>
          <span>剩余 ${remainingPairs(state.board)} 对</span>
          <span>连击 ${state.streak}</span>
          <span>提示 ${state.hints}</span>
          <span>洗牌 ${state.shuffles}</span>
          <span>分数 ${state.score}</span>
        </div>
      </section>
      <section class="mahjong-connect-board" aria-label="麻将连连看棋盘">
        ${state.board.map((value, index) => tileMarkup(value, index)).join("")}
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" type="button" data-action="hint">提示</button>
        <button class="secondary-button" type="button" data-action="shuffle">洗牌</button>
        <button class="danger-button" type="button" data-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-index]").forEach((button) => {
      button.addEventListener("click", () => select(Number(button.dataset.index)));
    });
    root.querySelector("[data-action='hint']").addEventListener("click", showHint);
    root.querySelector("[data-action='shuffle']").addEventListener("click", shuffleTiles);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  ensureMove(state);
  render();

  return () => {
    if (!state.over && !state.complete) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
