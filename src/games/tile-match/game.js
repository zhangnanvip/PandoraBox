import { loadState, removeState, saveState } from "../../utils/storage.js";

const ROWS = 7;
const COLS = 7;
const MAX_LEVEL = 60;

const TILE_SET = [
  { id: "wan1", label: "一万", tone: "red", points: 18 },
  { id: "wan2", label: "二万", tone: "red", points: 18 },
  { id: "wan3", label: "三万", tone: "red", points: 18 },
  { id: "tong1", label: "一筒", tone: "blue", points: 19 },
  { id: "tong2", label: "二筒", tone: "blue", points: 19 },
  { id: "tong3", label: "三筒", tone: "blue", points: 19 },
  { id: "tiao1", label: "一条", tone: "green", points: 20 },
  { id: "tiao2", label: "二条", tone: "green", points: 20 },
  { id: "east", label: "东", tone: "wind", points: 22 },
  { id: "south", label: "南", tone: "wind", points: 22 },
  { id: "west", label: "西", tone: "wind", points: 22 },
  { id: "north", label: "北", tone: "wind", points: 22 },
  { id: "zhong", label: "中", tone: "honor", points: 24 },
  { id: "fa", label: "发", tone: "honor", points: 24 },
  { id: "bai", label: "白", tone: "honor", points: 24 },
  { id: "plum", label: "梅", tone: "flower", points: 26 },
  { id: "orchid", label: "兰", tone: "flower", points: 26 },
  { id: "bamboo", label: "竹", tone: "flower", points: 26 },
  { id: "chrys", label: "菊", tone: "flower", points: 26 }
];

const DIFFICULTY = {
  easy: { label: "简单", triples: 10, growth: 0.34, slots: 8, ice: -2, locks: -2, hidden: -2, hints: 6, undos: 5, shuffles: 4 },
  medium: { label: "中等", triples: 12, growth: 0.44, slots: 7, ice: 0, locks: 0, hidden: 0, hints: 4, undos: 3, shuffles: 3 },
  hard: { label: "困难", triples: 14, growth: 0.56, slots: 7, ice: 3, locks: 2, hidden: 2, hints: 3, undos: 2, shuffles: 2 },
  devil: { label: "魔鬼", triples: 16, growth: 0.68, slots: 6, ice: 5, locks: 4, hidden: 4, hints: 2, undos: 1, shuffles: 1 }
};

const TILE_MODES = {
  campaign: { label: "章节闯关", levels: MAX_LEVEL, pressure: 0 },
  classic: { label: "经典消除", levels: 1, pressure: 0 },
  pressure: { label: "槽位压力", levels: 1, pressure: 8 }
};

function selectedMode(options) {
  return TILE_MODES[options?.tileMode] ? options.tileMode : "campaign";
}

function configFor(difficulty, mode, level) {
  const base = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const modeConfig = TILE_MODES[mode] || TILE_MODES.campaign;
  const levelIndex = modeConfig.levels > 1 ? level - 1 : modeConfig.pressure;
  return {
    ...base,
    maxLevel: modeConfig.levels,
    triples: Math.min(34, Math.round(base.triples + levelIndex * base.growth)),
    tileKinds: Math.min(TILE_SET.length, 8 + Math.floor(levelIndex / 5)),
    maxDepth: Math.min(5, 2 + Math.floor(levelIndex / 15)),
    ice: Math.min(18, Math.max(0, Math.floor(levelIndex * 0.34) + base.ice)),
    locks: Math.min(16, Math.max(0, Math.floor(levelIndex * 0.28) + base.locks)),
    hidden: Math.min(18, Math.max(0, Math.floor(levelIndex * 0.32) + base.hidden)),
    targetScore: Math.round((600 + level * 145 + Math.pow(level, 1.15) * 38) * (1 + Math.max(0, 7 - base.slots) * 0.08))
  };
}

function indexOf(row, col) {
  return row * COLS + col;
}

function rowOf(index) {
  return Math.floor(index / COLS);
}

function colOf(index) {
  return index % COLS;
}

function emptyBoard() {
  return Array.from({ length: ROWS * COLS }, () => []);
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

function topTile(stack) {
  return stack[stack.length - 1] || null;
}

function createTile(id) {
  const def = tileDef(id);
  return {
    uid: Math.random().toString(36).slice(2, 10),
    id,
    label: def.label,
    tone: def.tone,
    points: def.points,
    ice: 0,
    locked: false,
    hidden: false
  };
}

function createTileList(config) {
  const ids = TILE_SET.slice(0, config.tileKinds).map((tile) => tile.id);
  const tiles = [];
  for (let triple = 0; triple < config.triples; triple += 1) {
    const id = ids[triple % ids.length];
    tiles.push(createTile(id), createTile(id), createTile(id));
  }
  return shuffle(tiles);
}

function placeTiles(config) {
  const board = emptyBoard();
  createTileList(config).forEach((tile) => {
    const candidates = board
      .map((stack, index) => ({ stack, index }))
      .filter(({ stack }) => stack.length < config.maxDepth);
    const weighted = [
      ...candidates.filter(({ index }) => rowOf(index) > 0 && rowOf(index) < ROWS - 1 && colOf(index) > 0 && colOf(index) < COLS - 1),
      ...candidates
    ];
    const pick = weighted[Math.floor(Math.random() * weighted.length)] || candidates[0];
    board[pick.index].push(tile);
  });
  return board;
}

function allTiles(board) {
  return board.flatMap((stack, cellIndex) => stack.map((tile, depth) => ({ tile, cellIndex, depth, top: depth === stack.length - 1 })));
}

function applySpecials(board, config) {
  const tiles = allTiles(board);
  const topIndexes = new Set(board.map((stack) => topTile(stack)?.uid).filter(Boolean));
  shuffle(tiles.filter(({ tile }) => !topIndexes.has(tile.uid))).slice(0, config.locks).forEach(({ tile }) => {
    tile.locked = true;
  });
  shuffle(tiles).slice(0, config.ice).forEach(({ tile }, index) => {
    tile.ice = index % 5 === 0 && config.ice > 8 ? 2 : 1;
  });
  shuffle(tiles.filter(({ tile }) => !tile.ice)).slice(0, config.hidden).forEach(({ tile }) => {
    tile.hidden = true;
  });
}

function createBoard(config) {
  const board = placeTiles(config);
  applySpecials(board, config);
  return board;
}

function initialState(difficulty, mode, level = 1, score = 0) {
  const config = configFor(difficulty, mode, level);
  return {
    mode,
    level,
    maxLevel: config.maxLevel,
    board: createBoard(config),
    tray: [],
    history: [],
    score,
    stageScore: 0,
    matches: 0,
    combo: 0,
    bestCombo: 0,
    hints: config.hints,
    undos: config.undos,
    shuffles: config.shuffles,
    slots: config.slots,
    hintCells: [],
    message: "点击可选麻将牌进入槽位，三张相同牌自动消除",
    over: false,
    complete: false
  };
}

function isValidState(state) {
  return typeof state?.mode === "string"
    && Number.isFinite(state?.level)
    && Number.isFinite(state?.score)
    && Number.isFinite(state?.stageScore)
    && Number.isFinite(state?.slots)
    && Array.isArray(state?.board)
    && state.board.length === ROWS * COLS
    && Array.isArray(state?.tray);
}

function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}

function remainingTiles(state) {
  return state.board.reduce((sum, stack) => sum + stack.length, 0) + state.tray.length;
}

function configForState(state, difficulty) {
  return configFor(difficulty, state.mode, state.level);
}

function sessionMeta(state) {
  return {
    level: state.maxLevel > 1 ? `${state.level}/${state.maxLevel}` : TILE_MODES[state.mode].label,
    stage: `剩余 ${remainingTiles(state)} 张 · 槽 ${state.tray.length}/${state.slots}`,
    score: state.score + state.stageScore
  };
}

function progressText(state, difficulty) {
  const config = configForState(state, difficulty);
  const mode = TILE_MODES[state.mode]?.label || "章节闯关";
  const level = state.maxLevel > 1 ? `关卡 ${state.level}/${state.maxLevel} · ` : "";
  return `${mode} · ${level}目标 ${state.stageScore}/${config.targetScore} · 剩余 ${remainingTiles(state)} 张 · 槽 ${state.tray.length}/${state.slots}`;
}

function selectableTopTiles(state) {
  return state.board
    .map((stack, cellIndex) => ({ tile: topTile(stack), cellIndex }))
    .filter(({ tile }) => tile && !tile.locked);
}

function unlockTopTiles(state, amount = 1) {
  const locked = shuffle(state.board
    .map((stack) => topTile(stack))
    .filter((tile) => tile?.locked));
  locked.slice(0, amount).forEach((tile) => {
    tile.locked = false;
  });
  return Math.min(amount, locked.length);
}

function findHintCells(state) {
  const trayCounts = new Map();
  state.tray.forEach((tile) => {
    trayCounts.set(tile.id, (trayCounts.get(tile.id) || 0) + 1);
  });
  const visible = selectableTopTiles(state).filter(({ tile }) => !tile.hidden && tile.ice <= 0);
  for (const [id, count] of trayCounts.entries()) {
    const needed = 3 - count;
    const matches = visible.filter(({ tile }) => tile.id === id);
    if (needed > 0 && matches.length >= needed) return matches.slice(0, needed).map(({ cellIndex }) => cellIndex);
  }
  const byId = new Map();
  visible.forEach((entry) => {
    if (!byId.has(entry.tile.id)) byId.set(entry.tile.id, []);
    byId.get(entry.tile.id).push(entry.cellIndex);
  });
  for (const indexes of byId.values()) {
    if (indexes.length >= 3) return indexes.slice(0, 3);
  }
  return visible.slice(0, 2).map(({ cellIndex }) => cellIndex);
}

function resolveTrayMatches(state) {
  const byId = new Map();
  state.tray.forEach((tile, index) => {
    if (!byId.has(tile.id)) byId.set(tile.id, []);
    byId.get(tile.id).push(index);
  });
  for (const [id, indexes] of byId.entries()) {
    if (indexes.length < 3) continue;
    const remove = new Set(indexes.slice(0, 3));
    const matched = state.tray.filter((_, index) => remove.has(index));
    state.tray = state.tray.filter((_, index) => !remove.has(index));
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.matches += 1;
    const gained = matched.reduce((sum, tile) => sum + tile.points, 0) + 90 + state.level * 8 + state.combo * 38;
    state.stageScore += gained;
    const unlocked = unlockTopTiles(state, state.combo >= 3 ? 2 : 1);
    const label = tileDef(id).label;
    state.message = `消除 ${label}，连击 ${state.combo}，得分 +${gained}${unlocked ? `，解开 ${unlocked} 张封印` : ""}`;
    return true;
  }
  state.combo = 0;
  return false;
}

function shuffleBoardIds(state) {
  const entries = allTiles(state.board);
  const defs = shuffle(entries.map(({ tile }) => ({
    id: tile.id,
    label: tile.label,
    tone: tile.tone,
    points: tile.points
  })));
  entries.forEach(({ tile }, index) => {
    Object.assign(tile, defs[index]);
  });
}

function isStageComplete(state, difficulty) {
  return remainingTiles(state) === 0;
}

export function mountTileMatch(root, context) {
  const difficulty = DIFFICULTY[context.difficulty] ? context.difficulty : "medium";
  const mode = selectedMode(context.options);
  const storageKey = `tile-match:${mode}:${difficulty}`;
  let state = context.savedState || loadState(storageKey, initialState(difficulty, mode));
  if (!isValidState(state) || state.mode !== mode) state = initialState(difficulty, mode);
  let resultReported = false;
  let removeShellRestart = null;

  function save() {
    if (state.over || state.complete) {
      removeState(storageKey);
      context.clearSession?.();
      return;
    }
    const snapshot = serializeState(state);
    saveState(storageKey, snapshot);
    context.saveSession?.(snapshot, sessionMeta(state));
  }

  function reportResult(outcome) {
    if (resultReported) return;
    resultReported = true;
    context.reportResult?.({
      outcome,
      score: state.score + state.stageScore,
      detail: outcome === "complete"
        ? (state.maxLevel > 1 ? `完成 ${state.maxLevel} 关麻将三消章节` : "完成本局麻将三消")
        : `${TILE_MODES[state.mode].label} 挑战到第 ${state.level} 关`,
      extra: progressText(state, difficulty)
    });
  }

  function advanceLevel() {
    const bonus = Math.round(180 + state.level * 32 + state.bestCombo * 42 + state.hints * 15 + state.undos * 18 + state.shuffles * 20);
    const nextScore = state.score + state.stageScore + bonus;
    if (state.level >= state.maxLevel) {
      state.score = nextScore;
      state.over = true;
      state.complete = true;
      state.message = `全部章节完成，奖励 +${bonus}`;
      context.playSound?.("win");
      save();
      reportResult("complete");
      render();
      return;
    }
    state = initialState(difficulty, mode, state.level + 1, nextScore);
    state.message = `进入第 ${state.level} 关，上一关奖励 +${bonus}`;
    context.playSound?.("win");
    save();
    render();
  }

  function endGame(message) {
    state.over = true;
    state.message = message;
    context.playSound?.("invalid");
    save();
    reportResult("loss");
    render();
  }

  function checkAfterMove() {
    if (isStageComplete(state, difficulty)) {
      advanceLevel();
      return;
    }
    if (!selectableTopTiles(state).length && remainingTiles(state) > state.tray.length) {
      const unlocked = unlockTopTiles(state, 2);
      if (unlocked) state.message = `没有可点牌，已自动解开 ${unlocked} 张封印`;
    }
    if (state.tray.length >= state.slots) {
      endGame("槽位已满，挑战失败");
      return;
    }
    save();
    render();
  }

  function pickTile(cellIndex) {
    if (state.over) return;
    const stack = state.board[cellIndex];
    const tile = topTile(stack);
    state.hintCells = [];
    if (!tile) return;
    if (tile.locked) {
      state.message = "这张牌被封印，先消除其他三张牌解封";
      context.playSound?.("invalid");
      render();
      return;
    }
    if (tile.hidden) {
      tile.hidden = false;
      state.message = "暗牌已翻开";
      context.playSound?.("select");
      save();
      render();
      return;
    }
    if (tile.ice > 0) {
      tile.ice -= 1;
      state.message = tile.ice ? "冰封牌已裂开，还需要再点一次" : "冰封已解除，再点一次可收入槽位";
      context.playSound?.("select");
      save();
      render();
      return;
    }
    if (state.tray.length >= state.slots) {
      endGame("槽位已满，挑战失败");
      return;
    }
    const picked = stack.pop();
    state.tray.push({ ...picked, origin: cellIndex });
    state.history.push({ tile: picked, origin: cellIndex });
    const matched = resolveTrayMatches(state);
    if (!matched) {
      state.stageScore += picked.points;
      state.message = `收入 ${picked.label}，等待凑齐三张`;
      context.playSound?.("select");
    } else {
      context.playSound?.("move");
    }
    checkAfterMove();
  }

  function showHint() {
    if (state.over) return;
    if (state.hints <= 0) {
      state.message = "提示次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    const hint = findHintCells(state);
    if (!hint.length) {
      state.message = "暂时没有可提示的牌";
      render();
      return;
    }
    state.hints -= 1;
    state.hintCells = hint;
    state.message = "已标出推荐点击牌";
    context.playSound?.("select");
    save();
    render();
  }

  function undoPick() {
    if (state.over) return;
    if (state.undos <= 0) {
      state.message = "撤回次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    const last = state.tray.pop();
    if (!last) {
      state.message = "槽位里没有可撤回的牌";
      render();
      return;
    }
    const { origin, ...tile } = last;
    state.board[origin]?.push(tile);
    state.undos -= 1;
    state.combo = 0;
    state.message = "已撤回上一张槽位牌";
    context.playSound?.("move");
    save();
    render();
  }

  function shuffleTiles() {
    if (state.over) return;
    if (state.shuffles <= 0) {
      state.message = "洗牌次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    state.shuffles -= 1;
    state.combo = 0;
    state.hintCells = [];
    shuffleBoardIds(state);
    state.message = "已重新洗牌";
    context.playSound?.("select");
    save();
    render();
  }

  function restart() {
    state = initialState(difficulty, mode);
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    save();
    render();
  }

  function tileMarkup(tile, cellIndex, depth) {
    const hint = state.hintCells.includes(cellIndex) ? " is-hint" : "";
    const locked = tile.locked ? " is-locked" : "";
    const hidden = tile.hidden ? " is-hidden" : "";
    const ice = tile.ice ? " is-ice" : "";
    const label = tile.hidden ? "?" : tile.label;
    return `
      <button
        type="button"
        class="tile-match-tile tone-${tile.tone}${hint}${locked}${hidden}${ice}"
        data-tile-index="${cellIndex}"
        style="--tile-depth:${depth};"
        aria-label="${label}"
      >
        <span>${tile.locked ? "封" : label}</span>
        ${tile.ice ? `<b>冰${tile.ice}</b>` : ""}
      </button>
    `;
  }

  function cellMarkup(stack, cellIndex) {
    const tile = topTile(stack);
    if (!tile) return `<span class="tile-match-cell is-empty"></span>`;
    const depth = stack.length;
    return `
      <span class="tile-match-cell ${depth > 1 ? "has-stack" : ""}" data-depth="${depth}">
        ${tileMarkup(tile, cellIndex, depth)}
        ${depth > 1 ? `<em>${depth}</em>` : ""}
      </span>
    `;
  }

  function trayMarkup() {
    const slots = Array.from({ length: state.slots }, (_, index) => state.tray[index] || null);
    return slots.map((tile) => {
      if (!tile) return `<span class="tile-slot is-empty"></span>`;
      return `<span class="tile-slot tone-${tile.tone}"><b>${tile.label}</b></span>`;
    }).join("");
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status tile-match-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${DIFFICULTY[difficulty].label} · ${progressText(state, difficulty)}</p>
        </div>
        <div class="mini-stats">
          <span>${TILE_MODES[state.mode].label}</span>
          ${state.maxLevel > 1 ? `<span>关卡 ${state.level}/${state.maxLevel}</span>` : ""}
          <span>槽 ${state.tray.length}/${state.slots}</span>
          <span>消 ${state.matches}</span>
          <span>连 ${state.bestCombo}</span>
          <span>分 ${state.score + state.stageScore}</span>
        </div>
      </section>
      <section class="tile-match-board" aria-label="麻将三消牌阵">
        ${state.board.map(cellMarkup).join("")}
      </section>
      <section class="tile-slot-bar" aria-label="槽位">
        ${trayMarkup()}
      </section>
      <section class="game-panel toolbar tile-match-tools">
        <button class="secondary-button" type="button" data-tile-action="hint">提示 ${state.hints}</button>
        <button class="secondary-button" type="button" data-tile-action="undo">撤回 ${state.undos}</button>
        <button class="secondary-button" type="button" data-tile-action="shuffle">洗牌 ${state.shuffles}</button>
        <button class="danger-button" type="button" data-tile-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-tile-index]").forEach((button) => {
      button.addEventListener("click", () => pickTile(Number(button.dataset.tileIndex)));
    });
    root.querySelector("[data-tile-action='hint']").addEventListener("click", showHint);
    root.querySelector("[data-tile-action='undo']").addEventListener("click", undoPick);
    root.querySelector("[data-tile-action='shuffle']").addEventListener("click", shuffleTiles);
    root.querySelector("[data-tile-action='restart']").addEventListener("click", restart);
  }

  removeShellRestart = context.shell?.onRestart?.(() => restart()) || null;
  render();

  return () => {
    removeShellRestart?.();
    if (!state.over && !state.complete) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
