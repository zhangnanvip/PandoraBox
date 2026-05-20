import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 6;
const MAX_LEVEL = 60;

const CHAINS = [
  { id: "plant", title: "灵植", generator: "苗圃", tone: 0, items: ["种", "芽", "花", "果", "晶", "冠"] },
  { id: "gear", title: "机关", generator: "齿轮炉", tone: 1, items: ["铜", "轮", "轴", "芯", "塔", "核"] },
  { id: "gem", title: "星石", generator: "矿脉", tone: 2, items: ["砂", "石", "玉", "璧", "星", "曜"] },
  { id: "rune", title: "符文", generator: "符台", tone: 3, items: ["墨", "符", "印", "卷", "典", "阵"] }
];

const DIFFICULTY = {
  easy: { label: "简单", energy: 62, orders: -1, crates: -1, webs: -1, hints: 5, undos: 6, keys: 2, brooms: 2, refreshes: 3 },
  medium: { label: "中等", energy: 54, orders: 0, crates: 0, webs: 0, hints: 4, undos: 5, keys: 1, brooms: 1, refreshes: 2 },
  hard: { label: "困难", energy: 47, orders: 1, crates: 1, webs: 1, hints: 3, undos: 4, keys: 1, brooms: 1, refreshes: 2 },
  devil: { label: "魔鬼", energy: 41, orders: 2, crates: 2, webs: 2, hints: 2, undos: 3, keys: 0, brooms: 1, refreshes: 1 }
};

const MERGE_MODES = {
  campaign: { label: "订单闯关", levels: MAX_LEVEL, pressure: 0 },
  rush: { label: "紧急订单", levels: MAX_LEVEL, pressure: 10 },
  relaxed: { label: "经典工坊", levels: 1, pressure: 6 }
};

function selectedMode(options) {
  return MERGE_MODES[options?.mergeMode] ? options.mergeMode : "campaign";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function chainMeta(chain) {
  return CHAINS.find((item) => item.id === chain) || CHAINS[0];
}

function itemLabel(chain, level) {
  return chainMeta(chain).items[level - 1] || "?";
}

function configFor(difficulty, mode, level) {
  const base = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const modeConfig = MERGE_MODES[mode] || MERGE_MODES.campaign;
  const levelIndex = modeConfig.levels > 1 ? level - 1 + modeConfig.pressure : modeConfig.pressure;
  const chainCount = clamp(2 + Math.floor(levelIndex / 12), 2, CHAINS.length);
  const maxTier = clamp(3 + Math.floor(levelIndex / 9), 3, 6);
  const targetOrders = clamp(4 + Math.floor(levelIndex / 5) + base.orders, 3, 13);
  const crates = clamp(Math.floor((levelIndex - 2) / 6) + base.crates + (mode === "rush" ? 1 : 0), 0, 8);
  const webs = clamp(Math.floor((levelIndex - 6) / 7) + base.webs + (mode === "rush" ? 1 : 0), 0, 8);
  return {
    modeLabel: modeConfig.label,
    maxLevel: modeConfig.levels,
    chainCount,
    chains: CHAINS.slice(0, chainCount).map((chain) => chain.id),
    maxTier,
    targetOrders,
    energy: Math.max(26, base.energy - Math.floor(levelIndex * 0.42) + (mode === "relaxed" ? 16 : 0)),
    orderEnergy: mode === "rush" ? 5 : 7,
    crates,
    webs,
    hints: base.hints,
    undos: base.undos,
    keys: base.keys + (crates ? 1 : 0),
    brooms: base.brooms + (webs ? 1 : 0),
    refreshes: base.refreshes + (mode === "relaxed" ? 1 : 0),
    initialItems: 9 + chainCount + Math.floor(levelIndex / 8)
  };
}

function emptyBoard() {
  return Array.from({ length: SIZE * SIZE }, () => null);
}

function randomChain(config) {
  return config.chains[Math.floor(Math.random() * config.chains.length)];
}

function makeItem(chain, level = 1, locked = "") {
  return {
    type: "item",
    id: randomId("item"),
    chain,
    level,
    locked
  };
}

function makeGenerator(chain) {
  return {
    type: "generator",
    id: randomId("gen"),
    chain
  };
}

function makeCrate(config) {
  const chain = randomChain(config);
  const level = clamp(1 + Math.floor(Math.random() * Math.min(3, config.maxTier)), 1, config.maxTier);
  return {
    type: "crate",
    id: randomId("crate"),
    chain,
    level
  };
}

function makeWeb(config) {
  const chain = randomChain(config);
  const level = clamp(1 + Math.floor(Math.random() * Math.min(3, config.maxTier)), 1, config.maxTier);
  return makeItem(chain, level, "web");
}

function freeIndexes(board) {
  return board.map((cell, index) => cell ? -1 : index).filter((index) => index >= 0);
}

function placeRandom(board, cell) {
  const free = freeIndexes(board);
  if (!free.length) return false;
  board[free[Math.floor(Math.random() * free.length)]] = cell;
  return true;
}

function createOrders(config, count = 3, level = 1) {
  return Array.from({ length: count }, () => makeOrder(config, level));
}

function makeOrder(config, level) {
  const needCount = Math.random() < Math.min(0.45, 0.14 + level * 0.008) ? 2 : 1;
  const needs = Array.from({ length: needCount }, () => {
    const chain = randomChain(config);
    const ceiling = Math.min(config.maxTier, 2 + Math.floor(level / 7) + Math.floor(Math.random() * 2));
    const floor = level > 22 && Math.random() < 0.25 ? 2 : 1;
    const itemLevel = clamp(floor + Math.floor(Math.random() * Math.max(1, ceiling - floor + 1)), 1, config.maxTier);
    return { chain, level: itemLevel };
  });
  const reward = needs.reduce((sum, need) => sum + 90 + need.level * need.level * 48, 80);
  return {
    id: randomId("order"),
    needs,
    reward: Math.round(reward * (1 + level * 0.018)),
    energy: config.orderEnergy + Math.floor(Math.random() * 3),
    key: Math.random() < 0.22 ? 1 : 0,
    broom: Math.random() < 0.2 ? 1 : 0
  };
}

function createBoard(config) {
  const board = emptyBoard();
  const generatorSlots = [0, 5, 30, 35];
  config.chains.forEach((chain, index) => {
    board[generatorSlots[index]] = makeGenerator(chain);
  });
  for (let i = 0; i < config.initialItems; i += 1) {
    const chain = randomChain(config);
    const level = Math.random() < 0.18 && config.maxTier > 3 ? 2 : 1;
    placeRandom(board, makeItem(chain, level));
  }
  for (let i = 0; i < config.crates; i += 1) placeRandom(board, makeCrate(config));
  for (let i = 0; i < config.webs; i += 1) placeRandom(board, makeWeb(config));
  return board;
}

function initialState(difficulty, mode, level = 1, score = 0) {
  const config = configFor(difficulty, mode, level);
  return {
    mode,
    level,
    maxLevel: config.maxLevel,
    maxTier: config.maxTier,
    targetOrders: config.targetOrders,
    board: createBoard(config),
    orders: createOrders(config, 3, level),
    selected: null,
    hintCells: [],
    hintOrder: "",
    energy: config.energy,
    maxEnergy: config.energy,
    completedOrders: 0,
    score,
    stageScore: 0,
    bestTier: 1,
    streak: 0,
    hints: config.hints,
    undos: config.undos,
    keys: config.keys,
    brooms: config.brooms,
    refreshes: config.refreshes,
    history: [],
    keyMode: false,
    broomMode: false,
    message: "点生成器产出材料，合成后完成订单",
    over: false,
    complete: false
  };
}

function isValidState(state) {
  return typeof state?.mode === "string"
    && Number.isFinite(state?.level)
    && Number.isFinite(state?.energy)
    && Number.isFinite(state?.score)
    && Array.isArray(state?.board)
    && state.board.length === SIZE * SIZE
    && Array.isArray(state?.orders);
}

function serializeState(state) {
  const snapshot = JSON.parse(JSON.stringify(state));
  snapshot.hintCells = [];
  snapshot.hintOrder = "";
  snapshot.keyMode = false;
  snapshot.broomMode = false;
  snapshot.selected = null;
  return snapshot;
}

function undoSnapshot(state) {
  const snapshot = serializeState(state);
  snapshot.history = [];
  return snapshot;
}

function restoreSnapshot(current, snapshot) {
  return {
    ...snapshot,
    history: current.history.slice(0, -1),
    selected: null,
    hintCells: [],
    hintOrder: "",
    keyMode: false,
    broomMode: false
  };
}

function sessionMeta(state) {
  return {
    level: state.maxLevel > 1 ? `${state.level}/${state.maxLevel}` : MERGE_MODES[state.mode].label,
    stage: `订单 ${state.completedOrders}/${state.targetOrders} · 能量 ${state.energy}`,
    score: state.score + state.stageScore
  };
}

function progressText(state, difficulty) {
  const modeLabel = MERGE_MODES[state.mode]?.label || "订单闯关";
  const level = state.maxLevel > 1 ? `关卡 ${state.level}/${state.maxLevel} · ` : "";
  return `${DIFFICULTY[difficulty].label} · ${modeLabel} · ${level}订单 ${state.completedOrders}/${state.targetOrders} · 能量 ${state.energy}/${state.maxEnergy}`;
}

function itemMatches(cell, need) {
  return cell?.type === "item" && !cell.locked && cell.chain === need.chain && cell.level === need.level;
}

function canMerge(a, b, maxTier) {
  return a?.type === "item"
    && b?.type === "item"
    && !a.locked
    && !b.locked
    && a.chain === b.chain
    && a.level === b.level
    && a.level < maxTier;
}

function orderIndexes(board, order) {
  const used = new Set();
  const indexes = [];
  for (const need of order.needs) {
    const index = board.findIndex((cell, cellIndex) => !used.has(cellIndex) && itemMatches(cell, need));
    if (index < 0) return null;
    used.add(index);
    indexes.push(index);
  }
  return indexes;
}

function orderReady(board, order) {
  return Boolean(orderIndexes(board, order));
}

function canCompleteAnyOrder(state) {
  return state.orders.some((order) => orderReady(state.board, order));
}

function findMergePair(state) {
  for (let i = 0; i < state.board.length; i += 1) {
    for (let j = i + 1; j < state.board.length; j += 1) {
      if (canMerge(state.board[i], state.board[j], state.maxTier)) return [i, j];
    }
  }
  return null;
}

function hasAnyAction(state) {
  return canCompleteAnyOrder(state) || Boolean(findMergePair(state)) || state.energy > 0 && freeIndexes(state.board).length > 0;
}

function itemValue(cell) {
  if (!cell || cell.type !== "item") return 0;
  return 20 + cell.level * cell.level * 18;
}

function generatedItem(config, chain) {
  const roll = Math.random();
  const level = config.maxTier >= 4 && roll > 0.88 ? 2 : 1;
  return makeItem(chain, level);
}

export function mountMergeWorkshop(root, context) {
  const difficulty = DIFFICULTY[context.difficulty] ? context.difficulty : "medium";
  const mode = selectedMode(context.options);
  const storageKey = `merge-workshop:${mode}:${difficulty}`;
  let state = context.savedState || loadState(storageKey, initialState(difficulty, mode));
  if (!isValidState(state) || state.mode !== mode) state = initialState(difficulty, mode);
  let resultReported = false;
  let removeShellRestart = null;

  function config() {
    return configFor(difficulty, state.mode, state.level);
  }

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
        ? (state.maxLevel > 1 ? `完成 ${state.maxLevel} 关合成订单` : "完成本局合成工坊")
        : `${MERGE_MODES[state.mode].label} 推进到第 ${state.level} 关`,
      extra: progressText(state, difficulty)
    });
  }

  function pushHistory() {
    state.history.push(undoSnapshot(state));
    if (state.history.length > 24) state.history.shift();
  }

  function advanceLevel() {
    const bonus = Math.round(220 + state.level * 42 + state.energy * 8 + state.bestTier * 55 + state.keys * 20 + state.brooms * 18);
    const nextScore = state.score + state.stageScore + bonus;
    if (state.level >= state.maxLevel) {
      state.score = nextScore;
      state.over = true;
      state.complete = true;
      state.message = `全部订单完成，奖励 +${bonus}`;
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

  function checkAfterAction() {
    if (state.completedOrders >= state.targetOrders) {
      advanceLevel();
      return;
    }
    if (!hasAnyAction(state)) {
      endGame("没有可合成、可交付或可生成的操作，挑战失败");
      return;
    }
    save();
    render();
  }

  function generateFrom(index) {
    const cell = state.board[index];
    if (cell?.type !== "generator") return false;
    if (state.energy <= 0) {
      state.message = "能量不足，先完成订单回收能量";
      context.playSound?.("invalid");
      render();
      return true;
    }
    const free = freeIndexes(state.board);
    if (!free.length) {
      state.message = "棋盘已满，先合成或交付订单";
      context.playSound?.("invalid");
      render();
      return true;
    }
    pushHistory();
    const target = free[Math.floor(Math.random() * free.length)];
    state.board[target] = generatedItem(config(), cell.chain);
    state.energy -= 1;
    state.selected = null;
    state.hintCells = [target];
    state.hintOrder = "";
    state.message = `${chainMeta(cell.chain).generator}产出 ${itemLabel(cell.chain, state.board[target].level)}`;
    context.playSound?.("select");
    checkAfterAction();
    return true;
  }

  function mergeCells(from, to) {
    const source = state.board[from];
    const target = state.board[to];
    if (!canMerge(source, target, state.maxTier)) {
      state.message = "只有同系列同等级材料才能合成";
      context.playSound?.("invalid");
      render();
      return;
    }
    pushHistory();
    const nextLevel = target.level + 1;
    state.board[to] = makeItem(target.chain, nextLevel);
    state.board[from] = null;
    state.stageScore += itemValue(state.board[to]) + state.streak * 12;
    state.bestTier = Math.max(state.bestTier, nextLevel);
    state.streak += 1;
    state.selected = null;
    state.hintCells = [to];
    state.hintOrder = "";
    state.message = `合成 ${chainMeta(target.chain).title}${itemLabel(target.chain, nextLevel)}，连合 ${state.streak}`;
    context.playSound?.("move");
    checkAfterAction();
  }

  function unlockCrate(index) {
    const cell = state.board[index];
    if (cell?.type !== "crate") {
      state.message = "选择锁箱使用钥匙";
      render();
      return;
    }
    if (state.keys <= 0) {
      state.message = "钥匙已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    pushHistory();
    state.board[index] = makeItem(cell.chain, cell.level);
    state.keys -= 1;
    state.keyMode = false;
    state.hintCells = [index];
    state.message = "锁箱已打开";
    context.playSound?.("select");
    checkAfterAction();
  }

  function clearWeb(index) {
    const cell = state.board[index];
    if (cell?.type !== "item" || cell.locked !== "web") {
      state.message = "选择封印材料进行清理";
      render();
      return;
    }
    if (state.brooms <= 0) {
      state.message = "清扫道具已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    pushHistory();
    cell.locked = "";
    state.brooms -= 1;
    state.broomMode = false;
    state.hintCells = [index];
    state.message = "封印已清理，可继续合成";
    context.playSound?.("select");
    checkAfterAction();
  }

  function selectCell(index) {
    if (state.over) return;
    const cell = state.board[index];
    if (state.keyMode) {
      unlockCrate(index);
      return;
    }
    if (state.broomMode) {
      clearWeb(index);
      return;
    }
    state.hintCells = [];
    state.hintOrder = "";
    if (generateFrom(index)) return;
    if (!cell) {
      state.selected = null;
      state.message = "选择材料或生成器";
      render();
      return;
    }
    if (cell.type === "crate") {
      state.message = "锁箱需要钥匙打开";
      context.playSound?.("invalid");
      render();
      return;
    }
    if (cell.type === "item" && cell.locked === "web") {
      state.message = "封印材料需要清扫后才能合成或交付";
      context.playSound?.("invalid");
      render();
      return;
    }
    if (state.selected === null) {
      state.selected = index;
      state.message = "选择同等级材料进行合成";
      context.playSound?.("select");
      render();
      return;
    }
    if (state.selected === index) {
      state.selected = null;
      state.message = "已取消选择";
      render();
      return;
    }
    if (canMerge(state.board[state.selected], cell, state.maxTier)) {
      mergeCells(state.selected, index);
      return;
    }
    if (cell.type === "item" && !cell.locked) {
      state.selected = index;
      state.message = "已改选材料";
    } else {
      state.message = "这个格子不能合成";
      context.playSound?.("invalid");
    }
    render();
  }

  function completeOrder(orderId) {
    if (state.over) return;
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return;
    const indexes = orderIndexes(state.board, order);
    if (!indexes) {
      state.message = "订单材料还不齐";
      state.hintCells = [];
      state.hintOrder = order.id;
      context.playSound?.("invalid");
      render();
      return;
    }
    pushHistory();
    indexes.forEach((index) => { state.board[index] = null; });
    state.orders = state.orders.map((item) => item.id === order.id ? makeOrder(config(), state.level) : item);
    state.completedOrders += 1;
    state.stageScore += order.reward;
    state.energy = Math.min(state.maxEnergy + 10, state.energy + order.energy);
    state.keys += order.key;
    state.brooms += order.broom;
    state.streak = 0;
    state.selected = null;
    state.hintCells = [];
    state.hintOrder = "";
    state.message = `订单交付，获得 ${order.reward} 分和 ${order.energy} 能量`;
    context.playSound?.("win");
    checkAfterAction();
  }

  function showHint() {
    if (state.over) return;
    if (state.hints <= 0) {
      state.message = "提示次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    const ready = state.orders.find((order) => orderReady(state.board, order));
    if (ready) {
      state.hints -= 1;
      state.hintOrder = ready.id;
      state.hintCells = orderIndexes(state.board, ready) || [];
      state.message = "已标出可交付订单";
      context.playSound?.("select");
      save();
      render();
      return;
    }
    const pair = findMergePair(state);
    if (pair) {
      state.hints -= 1;
      state.hintCells = pair;
      state.hintOrder = "";
      state.selected = pair[0];
      state.message = "已标出可合成材料";
      context.playSound?.("select");
      save();
      render();
      return;
    }
    state.message = "当前建议先点生成器补充材料";
    render();
  }

  function undoMove() {
    if (state.over) return;
    if (state.undos <= 0) {
      state.message = "撤回次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    if (!state.history.length) {
      state.message = "没有可撤回的操作";
      render();
      return;
    }
    state = restoreSnapshot(state, state.history[state.history.length - 1]);
    state.undos = Math.max(0, state.undos - 1);
    state.message = "已撤回上一步";
    context.playSound?.("move");
    save();
    render();
  }

  function toggleKeyMode() {
    if (state.over) return;
    if (state.keys <= 0) {
      state.message = "钥匙已经用完";
      context.playSound?.("invalid");
    } else {
      state.keyMode = !state.keyMode;
      state.broomMode = false;
      state.message = state.keyMode ? "选择锁箱使用钥匙" : "已取消钥匙";
    }
    render();
  }

  function toggleBroomMode() {
    if (state.over) return;
    if (state.brooms <= 0) {
      state.message = "清扫道具已经用完";
      context.playSound?.("invalid");
    } else {
      state.broomMode = !state.broomMode;
      state.keyMode = false;
      state.message = state.broomMode ? "选择封印材料清理" : "已取消清扫";
    }
    render();
  }

  function refreshOrders() {
    if (state.over) return;
    if (state.refreshes <= 0) {
      state.message = "换单次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    pushHistory();
    state.orders = createOrders(config(), 3, state.level);
    state.refreshes -= 1;
    state.selected = null;
    state.hintCells = [];
    state.hintOrder = "";
    state.message = "已刷新订单";
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
    if (!cell) return `<button type="button" class="merge-cell is-empty" data-merge-cell="${index}" aria-label="空格"></button>`;
    const hinted = state.hintCells.includes(index) ? " is-hint" : "";
    if (cell.type === "generator") {
      const meta = chainMeta(cell.chain);
      return `
        <button type="button" class="merge-cell is-generator tone-${meta.tone}${hinted}" data-merge-cell="${index}" aria-label="${meta.generator}">
          <span>${meta.generator}</span>
          <b>能量 -1</b>
        </button>
      `;
    }
    if (cell.type === "crate") {
      const meta = chainMeta(cell.chain);
      return `
        <button type="button" class="merge-cell is-crate tone-${meta.tone}${hinted}" data-merge-cell="${index}" aria-label="锁箱">
          <span>锁箱</span>
          <b>${meta.title}${cell.level}</b>
        </button>
      `;
    }
    const meta = chainMeta(cell.chain);
    const locked = cell.locked ? " is-web" : "";
    const selected = state.selected === index ? " is-selected" : "";
    return `
      <button type="button" class="merge-cell is-item tone-${meta.tone} tier-${cell.level}${locked}${selected}${hinted}" data-merge-cell="${index}" aria-label="${meta.title}${itemLabel(cell.chain, cell.level)}">
        <span>${itemLabel(cell.chain, cell.level)}</span>
        <b>${meta.title} Lv.${cell.level}</b>
        ${cell.locked ? "<em>封</em>" : ""}
      </button>
    `;
  }

  function needMarkup(need) {
    const meta = chainMeta(need.chain);
    return `<span class="merge-need tone-${meta.tone}">${meta.title}${itemLabel(need.chain, need.level)}</span>`;
  }

  function orderMarkup(order) {
    const ready = orderReady(state.board, order);
    const classes = ["merge-order", ready ? "is-ready" : "", state.hintOrder === order.id ? "is-hint" : ""].filter(Boolean).join(" ");
    return `
      <button type="button" class="${classes}" data-merge-order="${order.id}">
        <strong>${order.needs.map(needMarkup).join("")}</strong>
        <span>奖励 ${order.reward} · 能量 +${order.energy}${order.key ? " · 钥匙 +1" : ""}${order.broom ? " · 清扫 +1" : ""}</span>
      </button>
    `;
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status merge-workshop-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${progressText(state, difficulty)}</p>
        </div>
        <div class="mini-stats">
          <span>${MERGE_MODES[state.mode].label}</span>
          ${state.maxLevel > 1 ? `<span>关卡 ${state.level}/${state.maxLevel}</span>` : ""}
          <span>订单 ${state.completedOrders}/${state.targetOrders}</span>
          <span>能量 ${state.energy}</span>
          <span>最高 Lv.${state.bestTier}</span>
          <span>分 ${state.score + state.stageScore}</span>
        </div>
      </section>
      <section class="merge-layout">
        <section class="merge-board" aria-label="合成工坊棋盘">
          ${state.board.map(cellMarkup).join("")}
        </section>
        <section class="merge-orders" aria-label="订单">
          <header>
            <strong>订单</strong>
            <span>${state.orders.filter((order) => orderReady(state.board, order)).length} 可交付</span>
          </header>
          ${state.orders.map(orderMarkup).join("")}
        </section>
      </section>
      <section class="game-panel toolbar merge-tools">
        <button class="secondary-button" type="button" data-merge-action="hint">提示 ${state.hints}</button>
        <button class="secondary-button" type="button" data-merge-action="undo">撤回 ${state.undos}</button>
        <button class="secondary-button ${state.keyMode ? "is-active" : ""}" type="button" data-merge-action="key">钥匙 ${state.keys}</button>
        <button class="secondary-button ${state.broomMode ? "is-active" : ""}" type="button" data-merge-action="broom">清扫 ${state.brooms}</button>
        <button class="secondary-button" type="button" data-merge-action="refresh">换单 ${state.refreshes}</button>
      </section>
    `;
    root.querySelectorAll("[data-merge-cell]").forEach((button) => {
      button.addEventListener("click", () => selectCell(Number(button.dataset.mergeCell)));
    });
    root.querySelectorAll("[data-merge-order]").forEach((button) => {
      button.addEventListener("click", () => completeOrder(button.dataset.mergeOrder));
    });
    root.querySelector("[data-merge-action='hint']").addEventListener("click", showHint);
    root.querySelector("[data-merge-action='undo']").addEventListener("click", undoMove);
    root.querySelector("[data-merge-action='key']").addEventListener("click", toggleKeyMode);
    root.querySelector("[data-merge-action='broom']").addEventListener("click", toggleBroomMode);
    root.querySelector("[data-merge-action='refresh']").addEventListener("click", refreshOrders);
  }

  removeShellRestart = context.shell?.onRestart?.(() => restart()) || null;
  render();

  return () => {
    removeShellRestart?.();
    if (!state.over && !state.complete) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
