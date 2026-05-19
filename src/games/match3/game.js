import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 8;
const MAX_LEVEL = 30;
const STONE = "stone";
const GEM_TYPES = [
  { id: "ruby", label: "红晶", points: 12 },
  { id: "jade", label: "青玉", points: 12 },
  { id: "amber", label: "琥珀", points: 12 },
  { id: "sapphire", label: "蓝钻", points: 13 },
  { id: "violet", label: "紫晶", points: 13 },
  { id: "emerald", label: "绿核", points: 14 },
  { id: "sun", label: "日珀", points: 15 }
];

const DIFFICULTY = {
  easy: { label: "简单", moves: 32, target: 0.82, blockers: -1, colors: -1, targetCount: -2 },
  medium: { label: "中等", moves: 28, target: 1, blockers: 0, colors: 0, targetCount: 0 },
  hard: { label: "困难", moves: 24, target: 1.22, blockers: 2, colors: 1, targetCount: 3 },
  devil: { label: "魔鬼", moves: 21, target: 1.45, blockers: 4, colors: 1, targetCount: 5 }
};

function configFor(difficulty, level) {
  const base = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const colors = Math.min(GEM_TYPES.length, Math.max(5, 5 + Math.floor((level - 1) / 8) + base.colors));
  return {
    ...base,
    colors,
    moves: Math.max(14, base.moves - Math.floor((level - 1) / 4)),
    targetScore: Math.round((760 + level * 132 + Math.pow(level, 1.18) * 42) * base.target),
    targetType: GEM_TYPES[(level + Math.floor(level / 4)) % colors].id,
    targetCount: Math.max(6, 7 + Math.floor(level * 1.12) + base.targetCount),
    blockers: Math.min(18, Math.max(0, Math.floor((level - 2) * 0.7) + base.blockers))
  };
}

function emptyBoard() {
  return Array(SIZE * SIZE).fill("");
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

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function isAdjacent(a, b) {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)) === 1;
}

function randomGem(colors) {
  return GEM_TYPES[Math.floor(Math.random() * colors)].id;
}

function gemLabel(type) {
  return GEM_TYPES.find((gem) => gem.id === type)?.label || "";
}

function gemPoints(type) {
  return GEM_TYPES.find((gem) => gem.id === type)?.points || 10;
}

function wouldCreateImmediateMatch(board, index, type) {
  const row = rowOf(index);
  const col = colOf(index);
  return (
    col >= 2 && board[indexOf(row, col - 1)] === type && board[indexOf(row, col - 2)] === type
  ) || (
    row >= 2 && board[indexOf(row - 1, col)] === type && board[indexOf(row - 2, col)] === type
  );
}

function fillBoardWithoutMatches(colors) {
  const board = emptyBoard();
  for (let index = 0; index < board.length; index += 1) {
    let type = randomGem(colors);
    let guard = 0;
    while (wouldCreateImmediateMatch(board, index, type) && guard < 20) {
      type = randomGem(colors);
      guard += 1;
    }
    board[index] = type;
  }
  return board;
}

function placeStones(board, count) {
  const candidates = board
    .map((value, index) => ({ value, index }))
    .filter(({ index }) => rowOf(index) > 0 && rowOf(index) < SIZE - 1 && colOf(index) > 0 && colOf(index) < SIZE - 1)
    .map(({ index }) => index);
  for (let i = 0; i < count && candidates.length; i += 1) {
    const pick = Math.floor(Math.random() * candidates.length);
    board[candidates[pick]] = STONE;
    candidates.splice(pick, 1);
  }
}

function findMatches(board) {
  const groups = [];
  for (let row = 0; row < SIZE; row += 1) {
    let col = 0;
    while (col < SIZE) {
      const type = board[indexOf(row, col)];
      if (!type || type === STONE) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (end < SIZE && board[indexOf(row, end)] === type) end += 1;
      if (end - col >= 3) {
        groups.push(Array.from({ length: end - col }, (_, offset) => indexOf(row, col + offset)));
      }
      col = end;
    }
  }
  for (let col = 0; col < SIZE; col += 1) {
    let row = 0;
    while (row < SIZE) {
      const type = board[indexOf(row, col)];
      if (!type || type === STONE) {
        row += 1;
        continue;
      }
      let end = row + 1;
      while (end < SIZE && board[indexOf(end, col)] === type) end += 1;
      if (end - row >= 3) {
        groups.push(Array.from({ length: end - row }, (_, offset) => indexOf(row + offset, col)));
      }
      row = end;
    }
  }
  return groups;
}

function swap(board, a, b) {
  [board[a], board[b]] = [board[b], board[a]];
}

function validSwap(board, a, b) {
  if (!isAdjacent(a, b) || !board[a] || !board[b] || board[a] === STONE || board[b] === STONE) return false;
  swap(board, a, b);
  const works = findMatches(board).length > 0;
  swap(board, a, b);
  return works;
}

function findHint(board) {
  for (let index = 0; index < board.length; index += 1) {
    const row = rowOf(index);
    const col = colOf(index);
    const right = indexOf(row, col + 1);
    const down = indexOf(row + 1, col);
    if (col < SIZE - 1 && validSwap(board, index, right)) return [index, right];
    if (row < SIZE - 1 && validSwap(board, index, down)) return [index, down];
  }
  return [];
}

function hasMove(board) {
  return findHint(board).length > 0;
}

function createBoard(config) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const board = fillBoardWithoutMatches(config.colors);
    placeStones(board, config.blockers);
    if (!findMatches(board).length && hasMove(board)) return board;
  }
  return fillBoardWithoutMatches(config.colors);
}

function initialState(difficulty, level = 1, previousScore = 0) {
  const config = configFor(difficulty, level);
  return {
    level,
    maxLevel: MAX_LEVEL,
    board: createBoard(config),
    moves: config.moves,
    score: previousScore,
    stageScore: 0,
    collected: {},
    selected: -1,
    hint: [],
    message: "交换相邻宝石，完成本关目标",
    over: false,
    complete: false
  };
}

function isValidState(state) {
  return state?.board?.length === SIZE * SIZE
    && Number.isFinite(state.level)
    && Number.isFinite(state.moves)
    && typeof state.collected === "object";
}

function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}

function sessionMeta(state) {
  return {
    level: `${state.level}/${MAX_LEVEL}`,
    stage: `步数 ${state.moves}`,
    score: state.score
  };
}

function adjacentIndexes(index) {
  const row = rowOf(index);
  const col = colOf(index);
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1]
  ].filter(([r, c]) => inBounds(r, c)).map(([r, c]) => indexOf(r, c));
}

function collapseAndFill(board, colors) {
  for (let col = 0; col < SIZE; col += 1) {
    let write = SIZE - 1;
    for (let row = SIZE - 1; row >= 0; row -= 1) {
      const idx = indexOf(row, col);
      if (board[idx] === STONE) {
        write = row - 1;
      } else if (board[idx]) {
        if (write !== row) {
          board[indexOf(write, col)] = board[idx];
          board[idx] = "";
        }
        write -= 1;
      }
    }
    for (let row = write; row >= 0; row -= 1) {
      const idx = indexOf(row, col);
      if (!board[idx]) board[idx] = randomGem(colors);
    }
  }
}

function reshuffle(board, colors) {
  const gemIndexes = board.flatMap((value, index) => (value && value !== STONE ? [index] : []));
  const gems = gemIndexes.map((index) => board[index]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const shuffled = [...gems].sort(() => Math.random() - 0.5);
    gemIndexes.forEach((index, offset) => {
      board[index] = shuffled[offset];
    });
    if (!findMatches(board).length && hasMove(board)) return true;
  }
  gemIndexes.forEach((index) => {
    board[index] = randomGem(colors);
  });
  return false;
}

function resolveBoard(state, config) {
  let combo = 0;
  let cleared = 0;
  let gained = 0;
  let stones = 0;

  while (true) {
    const groups = findMatches(state.board);
    if (!groups.length) break;
    combo += 1;
    const clear = new Set(groups.flat());
    const stoneHits = new Set();
    clear.forEach((index) => {
      adjacentIndexes(index).forEach((near) => {
        if (state.board[near] === STONE) stoneHits.add(near);
      });
    });
    clear.forEach((index) => {
      const type = state.board[index];
      if (!type || type === STONE) return;
      if (type === config.targetType) {
        state.collected[type] = (state.collected[type] || 0) + 1;
      }
      cleared += 1;
      gained += gemPoints(type) * combo;
      state.board[index] = "";
    });
    stoneHits.forEach((index) => {
      state.board[index] = "";
      stones += 1;
      gained += 28 * combo;
    });
    collapseAndFill(state.board, config.colors);
  }

  if (!hasMove(state.board)) {
    reshuffle(state.board, config.colors);
    state.message = "没有可消除交换，已自动洗牌";
  }

  state.score += gained;
  state.stageScore += gained;
  return { cleared, gained, combo: Math.max(0, combo - 1), stones };
}

function targetReached(state, config) {
  return state.stageScore >= config.targetScore && (state.collected[config.targetType] || 0) >= config.targetCount;
}

function progressText(state, config) {
  return `${Math.min(config.targetCount, state.collected[config.targetType] || 0)}/${config.targetCount} ${gemLabel(config.targetType)} · ${Math.min(config.targetScore, state.stageScore)}/${config.targetScore} 分`;
}

export function mountMatch3(root, context) {
  const difficulty = DIFFICULTY[context.difficulty] ? context.difficulty : "medium";
  const storageKey = `match3:${difficulty}`;
  let state = context.savedState || loadState(storageKey, initialState(difficulty));
  if (!isValidState(state)) state = initialState(difficulty);
  state.level = Math.min(MAX_LEVEL, Math.max(1, Number(state.level) || 1));
  let config = configFor(difficulty, state.level);
  let resultReported = false;
  let pointerStart = null;

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
      detail: outcome === "complete" ? "完成宝石消除全部关卡" : `挑战到第 ${state.level} 关`,
      extra: progressText(state, config)
    });
  }

  function advanceStage() {
    if (state.level >= MAX_LEVEL) {
      state.complete = true;
      state.over = true;
      state.message = "完成全部宝石关卡";
      reportResult("complete");
      removeState(storageKey);
      context.clearSession?.();
      return;
    }
    const next = initialState(difficulty, state.level + 1, state.score);
    state = {
      ...next,
      message: `进入第 ${next.level} 关`
    };
    config = configFor(difficulty, state.level);
    save();
  }

  function afterMove(result) {
    state.hint = [];
    if (targetReached(state, config)) {
      state.message = `目标完成：${progressText(state, config)}`;
      context.playSound?.("win");
      advanceStage();
    } else if (state.moves <= 0) {
      state.over = true;
      state.message = "步数用尽，挑战失败";
      reportResult("loss");
      removeState(storageKey);
      context.clearSession?.();
    } else {
      state.message = result.gained
        ? `消除 ${result.cleared} 枚，得分 +${result.gained}${result.stones ? `，击碎 ${result.stones} 块障碍` : ""}`
        : "继续寻找交换机会";
      save();
    }
    render();
  }

  function trySwap(a, b) {
    if (state.over || !Number.isFinite(a) || !Number.isFinite(b)) return;
    state.selected = -1;
    if (!validSwap(state.board, a, b)) {
      state.message = "这一步无法形成消除";
      context.playSound?.("invalid");
      render();
      return;
    }
    swap(state.board, a, b);
    state.moves -= 1;
    context.playSound?.("move");
    afterMove(resolveBoard(state, config));
  }

  function select(index) {
    if (state.over || state.board[index] === STONE) return;
    state.hint = [];
    if (state.selected >= 0 && state.selected !== index) {
      if (isAdjacent(state.selected, index)) {
        trySwap(state.selected, index);
        return;
      }
      state.selected = index;
    } else {
      state.selected = state.selected === index ? -1 : index;
    }
    state.message = state.selected >= 0 ? "再点一个相邻宝石交换" : "选择宝石开始交换";
    save();
    render();
  }

  function showHint() {
    if (state.over) return;
    const hint = findHint(state.board);
    state.hint = hint;
    state.message = hint.length ? "已标出可交换宝石" : "暂无可交换，已洗牌";
    if (!hint.length) reshuffle(state.board, config.colors);
    save();
    render();
  }

  function shuffleBoard() {
    if (state.over) return;
    if (state.moves <= 1) {
      state.message = "步数太少，不能洗牌";
      render();
      return;
    }
    reshuffle(state.board, config.colors);
    state.moves -= 1;
    state.selected = -1;
    state.hint = [];
    state.message = "消耗 1 步重新洗牌";
    save();
    render();
  }

  function restart() {
    state = initialState(difficulty);
    config = configFor(difficulty, state.level);
    resultReported = false;
    removeState(storageKey);
    save();
    render();
  }

  function cellMarkup(value, index) {
    const selected = state.selected === index ? " is-selected" : "";
    const hinted = state.hint.includes(index) ? " is-hint" : "";
    if (value === STONE) {
      return `<button type="button" class="match3-cell is-stone${hinted}" data-index="${index}" aria-label="障碍石"><span class="match3-stone"></span></button>`;
    }
    return `
      <button type="button" class="match3-cell${selected}${hinted}" data-index="${index}" aria-label="${gemLabel(value) || "空格"}">
        ${value ? `<span class="match3-gem gem-${value}"></span>` : ""}
      </button>
    `;
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status match3-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${DIFFICULTY[difficulty].label} · 目标 ${progressText(state, config)}</p>
        </div>
        <div class="mini-stats">
          <span>关卡 ${state.level}/${MAX_LEVEL}</span>
          <span>步数 ${state.moves}</span>
          <span>${gemLabel(config.targetType)} ${Math.min(config.targetCount, state.collected[config.targetType] || 0)}/${config.targetCount}</span>
          <span>本关 ${state.stageScore}/${config.targetScore}</span>
          <span>总分 ${state.score}</span>
        </div>
      </section>
      <section class="match3-board" aria-label="宝石消除棋盘">
        ${state.board.map((value, index) => cellMarkup(value, index)).join("")}
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" type="button" data-action="hint">提示</button>
        <button class="secondary-button" type="button" data-action="shuffle">洗牌</button>
        <button class="danger-button" type="button" data-action="restart">重开</button>
      </section>
    `;
    bindEvents();
  }

  function targetIndex(event) {
    const button = event.target.closest("[data-index]");
    return button ? Number(button.dataset.index) : -1;
  }

  function bindEvents() {
    root.querySelectorAll("[data-index]").forEach((button) => {
      button.addEventListener("click", () => select(Number(button.dataset.index)));
    });
    const board = root.querySelector(".match3-board");
    board.addEventListener("pointerdown", (event) => {
      pointerStart = {
        index: targetIndex(event),
        x: event.clientX,
        y: event.clientY
      };
    });
    board.addEventListener("pointerup", (event) => {
      if (!pointerStart || pointerStart.index < 0) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      const moved = Math.max(Math.abs(dx), Math.abs(dy));
      const start = pointerStart.index;
      pointerStart = null;
      if (moved < 22) return;
      const row = rowOf(start);
      const col = colOf(start);
      const target = Math.abs(dx) > Math.abs(dy)
        ? indexOf(row, col + (dx > 0 ? 1 : -1))
        : indexOf(row + (dy > 0 ? 1 : -1), col);
      if (target >= 0 && target < SIZE * SIZE && isAdjacent(start, target)) trySwap(start, target);
    });
    root.querySelector("[data-action='hint']").addEventListener("click", showHint);
    root.querySelector("[data-action='shuffle']").addEventListener("click", shuffleBoard);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();

  return () => {
    if (!state.over && !state.complete) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
