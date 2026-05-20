import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 10;
const MAX_LEVEL = 60;
const EMPTY = "";
const BLOCK = "block";
const ICE = "ice";
const BOMB = "bomb";

const DIFFICULTY = {
  easy: { label: "简单", moves: 30, target: 0.82, ice: -2, bombs: -1, hammers: 3, shuffles: 3 },
  medium: { label: "中等", moves: 26, target: 1, ice: 0, bombs: 0, hammers: 2, shuffles: 2 },
  hard: { label: "困难", moves: 23, target: 1.24, ice: 3, bombs: 1, hammers: 2, shuffles: 1 },
  devil: { label: "魔鬼", moves: 20, target: 1.52, ice: 5, bombs: 2, hammers: 1, shuffles: 1 }
};

const GAME_MODES = {
  campaign: { label: "闯关任务", levels: MAX_LEVEL },
  classic: { label: "经典高分", levels: 1 },
  pressure: { label: "炸弹压力", levels: 1 }
};

const SHAPES = [
  { id: "dot", cells: [[0, 0]], unlock: 1, weight: 8 },
  { id: "line2h", cells: [[0, 0], [0, 1]], unlock: 1, weight: 8 },
  { id: "line2v", cells: [[0, 0], [1, 0]], unlock: 1, weight: 8 },
  { id: "line3h", cells: [[0, 0], [0, 1], [0, 2]], unlock: 1, weight: 8 },
  { id: "line3v", cells: [[0, 0], [1, 0], [2, 0]], unlock: 1, weight: 8 },
  { id: "square2", cells: [[0, 0], [0, 1], [1, 0], [1, 1]], unlock: 1, weight: 8 },
  { id: "l3", cells: [[0, 0], [1, 0], [1, 1]], unlock: 2, weight: 7 },
  { id: "corner3", cells: [[0, 0], [0, 1], [1, 0]], unlock: 2, weight: 7 },
  { id: "line4h", cells: [[0, 0], [0, 1], [0, 2], [0, 3]], unlock: 3, weight: 6 },
  { id: "line4v", cells: [[0, 0], [1, 0], [2, 0], [3, 0]], unlock: 3, weight: 6 },
  { id: "t4", cells: [[0, 0], [0, 1], [0, 2], [1, 1]], unlock: 5, weight: 5 },
  { id: "s4", cells: [[0, 1], [0, 2], [1, 0], [1, 1]], unlock: 7, weight: 5 },
  { id: "z4", cells: [[0, 0], [0, 1], [1, 1], [1, 2]], unlock: 7, weight: 5 },
  { id: "line5h", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], unlock: 10, weight: 4 },
  { id: "line5v", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], unlock: 10, weight: 4 },
  { id: "plus5", cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], unlock: 14, weight: 4 },
  { id: "u5", cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], unlock: 18, weight: 3 },
  { id: "bigL", cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], unlock: 22, weight: 3 }
];

function selectedMode(options) {
  return GAME_MODES[options?.blockMode] ? options.blockMode : "campaign";
}

function configFor(difficulty, mode, level) {
  const base = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const modeConfig = GAME_MODES[mode] || GAME_MODES.campaign;
  const levelIndex = modeConfig.levels > 1 ? level - 1 : mode === "pressure" ? 18 : 0;
  return {
    label: base.label,
    maxLevel: modeConfig.levels,
    moves: Math.max(12, base.moves - Math.floor(levelIndex / 5)),
    targetScore: Math.round((520 + level * 150 + Math.pow(level, 1.18) * 44) * base.target),
    targetLines: Math.max(4, 4 + Math.floor(levelIndex * 0.42)),
    targetIce: Math.max(0, Math.min(18, Math.floor(levelIndex * 0.55) + base.ice)),
    ice: Math.max(0, Math.min(24, Math.floor(levelIndex * 0.65) + base.ice)),
    bombs: Math.max(0, Math.min(8, Math.floor((levelIndex - 3) / 5) + base.bombs + (mode === "pressure" ? 3 : 0))),
    hammers: Math.max(0, base.hammers - Math.floor(levelIndex / 18)),
    shuffles: Math.max(0, base.shuffles - Math.floor(levelIndex / 22)),
    bombTimer: Math.max(4, 8 - Math.floor(levelIndex / 10))
  };
}

function emptyBoard() {
  return Array.from({ length: SIZE * SIZE }, () => ({ type: EMPTY, tone: 0, timer: 0 }));
}

function rowOf(index) {
  return Math.floor(index / SIZE);
}

function colOf(index) {
  return index % SIZE;
}

function indexOf(row, col) {
  return row * SIZE + col;
}

function inside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function weightedShape(level) {
  const pool = SHAPES.filter((shape) => shape.unlock <= level);
  const total = pool.reduce((sum, shape) => sum + shape.weight, 0);
  let roll = Math.random() * total;
  for (const shape of pool) {
    roll -= shape.weight;
    if (roll <= 0) return shape;
  }
  return pool[0];
}

function normalizeCells(cells) {
  const minRow = Math.min(...cells.map(([row]) => row));
  const minCol = Math.min(...cells.map(([, col]) => col));
  return cells
    .map(([row, col]) => [row - minRow, col - minCol])
    .sort(([aRow, aCol], [bRow, bCol]) => aRow - bRow || aCol - bCol);
}

function rotateCells(cells) {
  return normalizeCells(cells.map(([row, col]) => [col, -row]));
}

function makePiece(level) {
  const shape = weightedShape(level);
  return {
    id: `${shape.id}-${Math.random().toString(36).slice(2, 8)}`,
    shapeId: shape.id,
    cells: normalizeCells(shape.cells),
    tone: Math.floor(Math.random() * 6)
  };
}

function pieceSize(piece) {
  return {
    rows: Math.max(...piece.cells.map(([row]) => row)) + 1,
    cols: Math.max(...piece.cells.map(([, col]) => col)) + 1
  };
}

function createTray(level) {
  return [makePiece(level), makePiece(level), makePiece(level)];
}

function placeObstacles(board, config) {
  const safeCenter = new Set([44, 45, 54, 55]);
  const candidates = shuffle(board.map((_, index) => index).filter((index) => !safeCenter.has(index)));
  candidates.slice(0, config.ice).forEach((index) => {
    board[index] = { type: ICE, tone: 0, timer: 0 };
  });
  const open = candidates.slice(config.ice).filter((index) => board[index].type === EMPTY);
  open.slice(0, config.bombs).forEach((index) => {
    board[index] = { type: BOMB, tone: 0, timer: config.bombTimer };
  });
}

function initialState(difficulty, mode, level = 1, score = 0) {
  const config = configFor(difficulty, mode, level);
  const board = emptyBoard();
  placeObstacles(board, config);
  return {
    mode,
    level,
    maxLevel: config.maxLevel,
    board,
    tray: createTray(level),
    selected: 0,
    score,
    stageScore: 0,
    lines: 0,
    iceCleared: 0,
    moves: config.moves,
    hammers: config.hammers,
    shuffles: config.shuffles,
    combo: 0,
    bestCombo: 0,
    lastClear: [],
    message: "选择方块后点棋盘落位，填满行列即可爆破",
    over: false,
    complete: false
  };
}

function isValidState(state) {
  return typeof state?.mode === "string"
    && Number.isFinite(state?.level)
    && Number.isFinite(state?.score)
    && Number.isFinite(state?.stageScore)
    && Number.isFinite(state?.moves)
    && Array.isArray(state?.board)
    && state.board.length === SIZE * SIZE
    && Array.isArray(state?.tray);
}

function configForState(state, difficulty) {
  return configFor(difficulty, state.mode, state.level);
}

function canPlace(board, piece, anchor) {
  if (!piece) return false;
  const baseRow = rowOf(anchor);
  const baseCol = colOf(anchor);
  return piece.cells.every(([dr, dc]) => {
    const row = baseRow + dr;
    const col = baseCol + dc;
    return inside(row, col) && board[indexOf(row, col)].type === EMPTY;
  });
}

function placeIndexes(piece, anchor) {
  const baseRow = rowOf(anchor);
  const baseCol = colOf(anchor);
  return piece.cells.map(([dr, dc]) => indexOf(baseRow + dr, baseCol + dc));
}

function filledForLine(cell) {
  return cell.type !== EMPTY;
}

function completeLines(board) {
  const rows = [];
  const cols = [];
  for (let row = 0; row < SIZE; row += 1) {
    if (Array.from({ length: SIZE }, (_, col) => board[indexOf(row, col)]).every(filledForLine)) rows.push(row);
  }
  for (let col = 0; col < SIZE; col += 1) {
    if (Array.from({ length: SIZE }, (_, row) => board[indexOf(row, col)]).every(filledForLine)) cols.push(col);
  }
  return { rows, cols };
}

function clearLines(state, lines) {
  const indexes = new Set();
  lines.rows.forEach((row) => {
    for (let col = 0; col < SIZE; col += 1) indexes.add(indexOf(row, col));
  });
  lines.cols.forEach((col) => {
    for (let row = 0; row < SIZE; row += 1) indexes.add(indexOf(row, col));
  });
  let ice = 0;
  let bombs = 0;
  indexes.forEach((index) => {
    if (state.board[index].type === ICE) ice += 1;
    if (state.board[index].type === BOMB) bombs += 1;
    state.board[index] = { type: EMPTY, tone: 0, timer: 0 };
  });
  state.lastClear = [...indexes];
  return { cells: indexes.size, ice, bombs, lines: lines.rows.length + lines.cols.length };
}

function decrementBombs(state) {
  let expired = false;
  state.board.forEach((cell) => {
    if (cell.type !== BOMB) return;
    cell.timer -= 1;
    if (cell.timer <= 0) expired = true;
  });
  return expired;
}

function canPlaceAny(state) {
  return state.tray.some((piece) =>
    piece && state.board.some((_, index) => canPlace(state.board, piece, index))
  );
}

function refillTrayIfNeeded(state) {
  if (state.tray.every((piece) => !piece)) {
    state.tray = createTray(state.level);
    state.selected = 0;
    state.message = "新一组方块已补充";
  }
}

function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}

function sessionMeta(state) {
  return {
    level: state.maxLevel > 1 ? `${state.level}/${state.maxLevel}` : GAME_MODES[state.mode].label,
    stage: `步数 ${state.moves} · 行列 ${state.lines}`,
    score: state.score + state.stageScore
  };
}

function progressText(state, difficulty) {
  const config = configForState(state, difficulty);
  const mode = GAME_MODES[state.mode]?.label || "闯关任务";
  const level = state.maxLevel > 1 ? `关卡 ${state.level}/${state.maxLevel} · ` : "";
  const iceTarget = config.targetIce ? ` · 冰 ${state.iceCleared}/${config.targetIce}` : "";
  return `${mode} · ${level}目标 ${state.stageScore}/${config.targetScore} · 行列 ${state.lines}/${config.targetLines}${iceTarget}`;
}

function isStageComplete(state, difficulty) {
  const config = configForState(state, difficulty);
  return state.stageScore >= config.targetScore
    && state.lines >= config.targetLines
    && state.iceCleared >= config.targetIce;
}

function reportScore(state) {
  return state.score + state.stageScore;
}

export function mountBlockBlast(root, context) {
  const difficulty = DIFFICULTY[context.difficulty] ? context.difficulty : "medium";
  const mode = selectedMode(context.options);
  const storageKey = `block-blast:${mode}:${difficulty}`;
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
      score: reportScore(state),
      detail: outcome === "complete"
        ? (state.maxLevel > 1 ? `完成 ${state.maxLevel} 关方块爆破任务` : "完成本局挑战")
        : `${GAME_MODES[state.mode].label} 挑战到第 ${state.level} 关`,
      extra: progressText(state, difficulty)
    });
  }

  function advanceLevel() {
    const bonus = Math.round(160 + state.level * 34 + state.bestCombo * 28 + state.moves * 10);
    const nextScore = state.score + state.stageScore + bonus;
    if (state.level >= state.maxLevel) {
      state.score = nextScore;
      state.over = true;
      state.complete = true;
      state.message = `全部通关，奖励 +${bonus}`;
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

  function placePiece(anchor) {
    if (state.over) return;
    const piece = state.tray[state.selected];
    if (!piece) {
      state.message = "先选择一个待放置方块";
      render();
      return;
    }
    if (!canPlace(state.board, piece, anchor)) {
      state.message = "这个位置放不下";
      context.playSound?.("invalid");
      render();
      return;
    }
    placeIndexes(piece, anchor).forEach((index) => {
      state.board[index] = { type: BLOCK, tone: piece.tone, timer: 0 };
    });
    state.tray[state.selected] = null;
    const nextSelectable = state.tray.findIndex(Boolean);
    state.selected = nextSelectable >= 0 ? nextSelectable : state.selected;
    state.moves -= 1;
    const lines = completeLines(state.board);
    const cleared = clearLines(state, lines);
    if (cleared.lines) {
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.lines += cleared.lines;
      state.iceCleared += cleared.ice;
      const gained = piece.cells.length * 8 + cleared.cells * 10 + cleared.lines * 70 + state.combo * 45 + cleared.bombs * 60;
      state.stageScore += gained;
      state.message = `爆破 ${cleared.lines} 条线，连击 ${state.combo}，得分 +${gained}`;
      context.playSound?.("move");
    } else {
      state.combo = 0;
      state.lastClear = [];
      state.stageScore += piece.cells.length * 4;
      state.message = "方块已落位";
      context.playSound?.("select");
    }
    if (isStageComplete(state, difficulty)) {
      advanceLevel();
      return;
    }
    if (decrementBombs(state)) {
      endGame("炸弹倒计时归零，挑战失败");
      return;
    }
    refillTrayIfNeeded(state);
    if (state.moves <= 0) {
      endGame("步数用完，挑战失败");
      return;
    }
    if (!canPlaceAny(state)) {
      endGame("没有可落位方块，挑战失败");
      return;
    }
    save();
    render();
  }

  function selectPiece(index) {
    if (!state.tray[index]) return;
    state.selected = index;
    state.message = "选择落点放置方块";
    render();
  }

  function rotateSelected() {
    const piece = state.tray[state.selected];
    if (!piece || state.over) return;
    piece.cells = rotateCells(piece.cells);
    state.message = "已旋转当前方块";
    context.playSound?.("select");
    save();
    render();
  }

  function useHammer() {
    if (state.over) return;
    if (state.hammers <= 0) {
      state.message = "锤子已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    state.message = "选择棋盘上的一格清除";
    state.hammerMode = true;
    render();
  }

  function hammerCell(index) {
    if (!state.hammerMode) return false;
    const cell = state.board[index];
    if (cell.type === EMPTY) {
      state.message = "只能清除已占用格";
      context.playSound?.("invalid");
      render();
      return true;
    }
    if (cell.type === ICE) state.iceCleared += 1;
    state.board[index] = { type: EMPTY, tone: 0, timer: 0 };
    state.hammers -= 1;
    state.hammerMode = false;
    state.combo = 0;
    state.message = "锤子清除了一格";
    context.playSound?.("move");
    save();
    render();
    return true;
  }

  function shuffleTray() {
    if (state.over) return;
    if (state.shuffles <= 0) {
      state.message = "换组次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    state.shuffles -= 1;
    state.tray = createTray(state.level);
    state.selected = 0;
    state.combo = 0;
    state.message = "已更换一组方块";
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

  function cellMarkup(cell, index) {
    const selectable = state.hammerMode || canPlace(state.board, state.tray[state.selected], index);
    const classes = [
      "block-cell",
      cell.type ? `is-${cell.type}` : "",
      cell.type === BLOCK ? `tone-${cell.tone}` : "",
      state.lastClear.includes(index) ? "is-cleared" : "",
      selectable && cell.type === EMPTY && !state.hammerMode ? "is-ghost" : "",
      state.hammerMode && cell.type !== EMPTY ? "is-targetable" : ""
    ].filter(Boolean).join(" ");
    const label = cell.type === ICE ? "冰" : cell.type === BOMB ? cell.timer : "";
    return `<button type="button" class="${classes}" data-block-index="${index}" aria-label="第 ${rowOf(index) + 1} 行第 ${colOf(index) + 1} 列">${label}</button>`;
  }

  function pieceMarkup(piece, index) {
    if (!piece) return `<button type="button" class="block-piece is-empty" disabled>已放置</button>`;
    const size = pieceSize(piece);
    const cells = Array.from({ length: size.rows * size.cols }, (_, cellIndex) => {
      const row = Math.floor(cellIndex / size.cols);
      const col = cellIndex % size.cols;
      const filled = piece.cells.some(([dr, dc]) => dr === row && dc === col);
      return `<span class="${filled ? `filled tone-${piece.tone}` : ""}"></span>`;
    }).join("");
    return `
      <button type="button" class="block-piece ${state.selected === index ? "is-selected" : ""}" data-piece-index="${index}" style="--piece-cols:${size.cols}; --piece-rows:${size.rows};">
        <span class="piece-grid">${cells}</span>
      </button>
    `;
  }

  function render() {
    const config = configForState(state, difficulty);
    root.innerHTML = `
      <section class="game-panel game-status block-blast-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${DIFFICULTY[difficulty].label} · ${progressText(state, difficulty)}</p>
        </div>
        <div class="mini-stats">
          <span>${GAME_MODES[state.mode].label}</span>
          ${state.maxLevel > 1 ? `<span>关卡 ${state.level}/${state.maxLevel}</span>` : ""}
          <span>步 ${state.moves}</span>
          <span>线 ${state.lines}/${config.targetLines}</span>
          <span>分 ${state.score + state.stageScore}</span>
          <span>连 ${state.bestCombo}</span>
        </div>
      </section>
      <section class="block-blast-board" aria-label="方块爆破棋盘">
        ${state.board.map(cellMarkup).join("")}
      </section>
      <section class="block-tray" aria-label="待放置方块">
        ${state.tray.map(pieceMarkup).join("")}
      </section>
      <section class="game-panel toolbar block-tools">
        <button class="secondary-button" type="button" data-block-action="rotate">旋转</button>
        <button class="secondary-button ${state.hammerMode ? "is-active" : ""}" type="button" data-block-action="hammer">锤子 ${state.hammers}</button>
        <button class="secondary-button" type="button" data-block-action="shuffle">换组 ${state.shuffles}</button>
        <button class="danger-button" type="button" data-block-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-block-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.blockIndex);
        if (!hammerCell(index)) placePiece(index);
      });
    });
    root.querySelectorAll("[data-piece-index]").forEach((button) => {
      button.addEventListener("click", () => selectPiece(Number(button.dataset.pieceIndex)));
    });
    root.querySelector("[data-block-action='rotate']").addEventListener("click", rotateSelected);
    root.querySelector("[data-block-action='hammer']").addEventListener("click", useHammer);
    root.querySelector("[data-block-action='shuffle']").addEventListener("click", shuffleTray);
    root.querySelector("[data-block-action='restart']").addEventListener("click", restart);
  }

  removeShellRestart = context.shell?.onRestart?.(() => restart()) || null;
  render();

  return () => {
    removeShellRestart?.();
    if (!state.over && !state.complete) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
