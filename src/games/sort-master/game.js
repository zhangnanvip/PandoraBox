import { loadState, removeState, saveState } from "../../utils/storage.js";

const CAPACITY = 4;
const MAX_LEVEL = 60;

const COLORS = [
  { id: "coral", label: "赤", tone: 0 },
  { id: "sky", label: "蓝", tone: 1 },
  { id: "jade", label: "绿", tone: 2 },
  { id: "gold", label: "金", tone: 3 },
  { id: "violet", label: "紫", tone: 4 },
  { id: "teal", label: "青", tone: 5 },
  { id: "rose", label: "粉", tone: 6 },
  { id: "amber", label: "橙", tone: 7 },
  { id: "indigo", label: "靛", tone: 8 },
  { id: "mint", label: "薄荷", tone: 9 }
];

const DIFFICULTY = {
  easy: { label: "简单", moves: 42, colorOffset: -1, locks: -1, frozen: -1, hints: 5, undos: 6, shuffles: 3 },
  medium: { label: "中等", moves: 36, colorOffset: 0, locks: 0, frozen: 0, hints: 4, undos: 5, shuffles: 2 },
  hard: { label: "困难", moves: 31, colorOffset: 1, locks: 1, frozen: 1, hints: 3, undos: 4, shuffles: 2 },
  devil: { label: "魔鬼", moves: 27, colorOffset: 2, locks: 2, frozen: 2, hints: 2, undos: 3, shuffles: 1 }
};

const SORT_MODES = {
  campaign: { label: "闯关排序", levels: MAX_LEVEL, pressure: 0 },
  chain: { label: "锁链挑战", levels: MAX_LEVEL, pressure: 8 },
  relaxed: { label: "经典单局", levels: 1, pressure: 12 }
};

function selectedMode(options) {
  return SORT_MODES[options?.sortMode] ? options.sortMode : "campaign";
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

function configFor(difficulty, mode, level) {
  const base = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const modeConfig = SORT_MODES[mode] || SORT_MODES.campaign;
  const levelIndex = modeConfig.levels > 1 ? level - 1 + modeConfig.pressure : modeConfig.pressure;
  const colorCount = clamp(4 + Math.floor(levelIndex / 5) + base.colorOffset, 4, 10);
  const extraTubes = levelIndex >= 28 && difficulty !== "devil" ? 3 : 2;
  const locks = clamp(Math.floor((levelIndex - 5) / 9) + base.locks + (mode === "chain" ? 1 : 0), 0, 4);
  const frozen = clamp(Math.floor((levelIndex - 2) / 8) + base.frozen + (mode === "chain" ? 1 : 0), 0, 5);
  return {
    modeLabel: modeConfig.label,
    maxLevel: modeConfig.levels,
    colorCount,
    tubeCount: colorCount + extraTubes,
    moves: Math.max(18, base.moves + extraTubes * 4 - Math.floor(levelIndex * 0.36) + (mode === "relaxed" ? 10 : 0)),
    locks: Math.min(locks, colorCount + extraTubes - 3),
    frozen: Math.min(frozen, colorCount + extraTubes - locks - 2),
    hints: base.hints,
    undos: base.undos,
    shuffles: base.shuffles + (mode === "relaxed" ? 1 : 0),
    scramble: 46 + levelIndex * 5 + base.colorOffset * 7
  };
}

function topColor(tube) {
  return tube.items[tube.items.length - 1] || null;
}

function isUniform(items) {
  return items.length > 0 && items.every((item) => item === items[0]);
}

function isTubeComplete(tube) {
  return tube.items.length === CAPACITY && isUniform(tube.items);
}

function makeSolvedTubes(colorCount, tubeCount) {
  const tubes = Array.from({ length: tubeCount }, (_, index) => ({
    id: `tube-${index}`,
    items: index < colorCount ? Array.from({ length: CAPACITY }, () => COLORS[index].id) : [],
    locked: false,
    frozen: 0
  }));
  return tubes;
}

function reverseScramble(tubes, steps) {
  for (let step = 0; step < steps; step += 1) {
    const sources = tubes
      .map((tube, index) => ({ tube, index }))
      .filter(({ tube }) => tube.items.length > 0);
    const source = sources[Math.floor(Math.random() * sources.length)];
    const targets = tubes
      .map((tube, index) => ({ tube, index }))
      .filter(({ tube, index }) => index !== source.index && tube.items.length < CAPACITY);
    if (!source || !targets.length) continue;
    const target = targets[Math.floor(Math.random() * targets.length)];
    target.tube.items.push(source.tube.items.pop());
  }
}

function isSolvedTubes(tubes) {
  return tubes.every((tube) => tube.items.length === 0 || isTubeComplete(tube));
}

function addTubeObstacles(tubes, config) {
  const candidates = shuffle(tubes
    .map((tube, index) => ({ tube, index }))
    .filter(({ tube }) => tube.items.length > 0 && !isTubeComplete(tube))
    .map(({ index }) => index));
  const locked = new Set(candidates.slice(0, config.locks));
  const frozen = new Set(candidates.filter((index) => !locked.has(index)).slice(0, config.frozen));
  return tubes.map((tube, index) => ({
    ...tube,
    locked: locked.has(index),
    frozen: frozen.has(index) ? 1 : 0
  }));
}

function createPuzzle(config) {
  let tubes = makeSolvedTubes(config.colorCount, config.tubeCount);
  reverseScramble(tubes, config.scramble);
  for (let attempt = 0; attempt < 16 && isSolvedTubes(tubes); attempt += 1) {
    reverseScramble(tubes, config.scramble + attempt * 8);
  }
  tubes = shuffle(tubes).map((tube, index) => ({ ...tube, id: `tube-${index}` }));
  return addTubeObstacles(tubes, config);
}

function initialState(difficulty, mode, level = 1, score = 0) {
  const config = configFor(difficulty, mode, level);
  const tubes = createPuzzle(config);
  return {
    mode,
    level,
    maxLevel: config.maxLevel,
    colorCount: config.colorCount,
    tubes,
    selected: null,
    moves: config.moves,
    hints: config.hints,
    undos: config.undos,
    shuffles: config.shuffles,
    keys: config.locks,
    icePicks: config.frozen,
    score,
    stageScore: 0,
    completedColors: completedColorIds({ tubes }),
    streak: 0,
    bestStreak: 0,
    history: [],
    hint: null,
    keyMode: false,
    iceMode: false,
    message: "选择瓶子，把同色液体倒到一起",
    over: false,
    complete: false
  };
}

function isValidState(state) {
  return typeof state?.mode === "string"
    && Number.isFinite(state?.level)
    && Number.isFinite(state?.moves)
    && Number.isFinite(state?.score)
    && Number.isFinite(state?.stageScore)
    && Array.isArray(state?.tubes)
    && state.tubes.every((tube) => Array.isArray(tube.items));
}

function serializeState(state) {
  const snapshot = JSON.parse(JSON.stringify(state));
  snapshot.hint = null;
  snapshot.keyMode = false;
  snapshot.iceMode = false;
  return snapshot;
}

function undoSnapshot(state) {
  const snapshot = serializeState(state);
  snapshot.history = [];
  return snapshot;
}

function sessionMeta(state) {
  return {
    level: state.maxLevel > 1 ? `${state.level}/${state.maxLevel}` : SORT_MODES[state.mode].label,
    stage: `步数 ${state.moves} · 完成 ${state.completedColors.length}/${state.colorCount}`,
    score: state.score + state.stageScore
  };
}

function progressText(state, difficulty) {
  const modeLabel = SORT_MODES[state.mode]?.label || "闯关排序";
  const level = state.maxLevel > 1 ? `关卡 ${state.level}/${state.maxLevel} · ` : "";
  return `${DIFFICULTY[difficulty].label} · ${modeLabel} · ${level}完成 ${state.completedColors.length}/${state.colorCount} 色`;
}

function canUseTube(tube) {
  return !tube.locked && !tube.frozen;
}

function pourInfo(tubes, from, to) {
  if (from === to) return null;
  const source = tubes[from];
  const target = tubes[to];
  if (!source || !target || !canUseTube(source) || !canUseTube(target)) return null;
  if (!source.items.length || target.items.length >= CAPACITY) return null;
  const color = topColor(source);
  const targetTop = topColor(target);
  if (targetTop && targetTop !== color) return null;
  let group = 0;
  for (let index = source.items.length - 1; index >= 0 && source.items[index] === color; index -= 1) group += 1;
  const amount = Math.min(group, CAPACITY - target.items.length);
  if (amount <= 0) return null;
  return { color, amount };
}

function colorMeta(colorId) {
  return COLORS.find((color) => color.id === colorId) || COLORS[0];
}

function completedColorIds(state) {
  return state.tubes
    .filter(isTubeComplete)
    .map((tube) => tube.items[0]);
}

function isStageComplete(state) {
  return completedColorIds(state).length >= state.colorCount;
}

function hasAnyMove(state) {
  return state.tubes.some((_, from) => state.tubes.some((__, to) => pourInfo(state.tubes, from, to)));
}

function findHintMove(state) {
  let best = null;
  let bestScore = -Infinity;
  state.tubes.forEach((source, from) => {
    state.tubes.forEach((target, to) => {
      const info = pourInfo(state.tubes, from, to);
      if (!info) return;
      const targetWillFill = target.items.length + info.amount === CAPACITY;
      const sourceWillEmpty = source.items.length - info.amount === 0;
      const score = (target.items.length ? 20 : 4) + (targetWillFill ? 40 : 0) + (sourceWillEmpty ? 12 : 0) - Math.max(0, source.items.length - info.amount);
      if (score > bestScore) {
        bestScore = score;
        best = { from, to };
      }
    });
  });
  return best;
}

function restoreSnapshot(current, snapshot) {
  const history = current.history.slice(0, -1);
  return {
    ...snapshot,
    history,
    hint: null,
    keyMode: false,
    iceMode: false,
    selected: null
  };
}

export function mountSortMaster(root, context) {
  const difficulty = DIFFICULTY[context.difficulty] ? context.difficulty : "medium";
  const mode = selectedMode(context.options);
  const storageKey = `sort-master:${mode}:${difficulty}`;
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
        ? (state.maxLevel > 1 ? `完成 ${state.maxLevel} 关排序挑战` : "完成本局排序")
        : `${SORT_MODES[state.mode].label} 挑战到第 ${state.level} 关`,
      extra: progressText(state, difficulty)
    });
  }

  function pushHistory() {
    state.history.push(undoSnapshot(state));
    if (state.history.length > 24) state.history.shift();
  }

  function advanceLevel() {
    const bonus = Math.round(220 + state.level * 36 + state.moves * 12 + state.bestStreak * 45 + state.keys * 20 + state.icePicks * 16);
    const nextScore = state.score + state.stageScore + bonus;
    if (state.level >= state.maxLevel) {
      state.score = nextScore;
      state.over = true;
      state.complete = true;
      state.message = `全部排序完成，奖励 +${bonus}`;
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

  function scoreCompletion() {
    const before = new Set(state.completedColors);
    const now = completedColorIds(state);
    let gained = 0;
    now.forEach((color) => {
      if (before.has(color)) return;
      state.completedColors.push(color);
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      gained += 140 + state.streak * 35;
    });
    if (!gained) state.streak = 0;
    return gained;
  }

  function checkAfterAction() {
    if (isStageComplete(state)) {
      advanceLevel();
      return;
    }
    if (state.moves <= 0) {
      endGame("步数用完，挑战失败");
      return;
    }
    if (!hasAnyMove(state) && state.shuffles <= 0) {
      endGame("没有可倒的瓶子，挑战失败");
      return;
    }
    save();
    render();
  }

  function pour(from, to) {
    const info = pourInfo(state.tubes, from, to);
    if (!info) {
      state.message = "这两个瓶子不能这样倒";
      context.playSound?.("invalid");
      render();
      return;
    }
    pushHistory();
    const source = state.tubes[from];
    const target = state.tubes[to];
    for (let i = 0; i < info.amount; i += 1) target.items.push(source.items.pop());
    state.moves -= 1;
    state.selected = null;
    state.hint = null;
    const completedGain = scoreCompletion();
    const pourScore = info.amount * 16 + (target.items.length === CAPACITY ? 35 : 0) + completedGain;
    state.stageScore += pourScore;
    state.message = completedGain
      ? `${colorMeta(info.color).label}色归位，得分 +${pourScore}`
      : `倒入 ${info.amount} 格${colorMeta(info.color).label}色，得分 +${pourScore}`;
    context.playSound?.("move");
    checkAfterAction();
  }

  function unlockTube(index) {
    const tube = state.tubes[index];
    if (!tube?.locked) {
      state.message = "选择带锁链的瓶子解锁";
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
    tube.locked = false;
    state.keys -= 1;
    state.keyMode = false;
    state.message = "锁链瓶已打开";
    context.playSound?.("select");
    save();
    render();
  }

  function thawTube(index) {
    const tube = state.tubes[index];
    if (!tube?.frozen) {
      state.message = "选择冰封瓶破冰";
      render();
      return;
    }
    if (state.icePicks <= 0) {
      state.message = "破冰次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    pushHistory();
    tube.frozen -= 1;
    state.icePicks -= 1;
    state.iceMode = false;
    state.message = tube.frozen ? "冰层裂开，还需要再破一次" : "冰封瓶已解冻";
    context.playSound?.("select");
    save();
    render();
  }

  function selectTube(index) {
    if (state.over) return;
    const tube = state.tubes[index];
    if (!tube) return;
    if (state.keyMode) {
      unlockTube(index);
      return;
    }
    if (state.iceMode) {
      thawTube(index);
      return;
    }
    state.hint = null;
    if (state.selected === null) {
      if (!canUseTube(tube)) {
        state.message = tube.locked ? "这个瓶子被锁住了，先使用钥匙" : "这个瓶子被冰封了，先破冰";
        context.playSound?.("invalid");
      } else if (!tube.items.length) {
        state.message = "空瓶不能作为起点";
      } else {
        state.selected = index;
        state.message = "选择目标瓶倒入";
        context.playSound?.("select");
      }
      render();
      return;
    }
    if (state.selected === index) {
      state.selected = null;
      state.message = "已取消选择";
      render();
      return;
    }
    const from = state.selected;
    if (pourInfo(state.tubes, from, index)) {
      pour(from, index);
      return;
    }
    if (canUseTube(tube) && tube.items.length) {
      state.selected = index;
      state.message = "已改选起点瓶";
    } else {
      state.message = "目标瓶不能接收这种颜色";
      context.playSound?.("invalid");
    }
    render();
  }

  function showHint() {
    if (state.over) return;
    if (state.hints <= 0) {
      state.message = "提示次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    const hint = findHintMove(state);
    if (!hint) {
      state.message = "暂时没有可提示的倒法";
      render();
      return;
    }
    state.hints -= 1;
    state.hint = hint;
    state.selected = hint.from;
    state.message = "已标出推荐倒法";
    context.playSound?.("select");
    save();
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
    const snapshot = state.history[state.history.length - 1];
    state = restoreSnapshot(state, snapshot);
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
      state.iceMode = false;
      state.message = state.keyMode ? "选择锁链瓶使用钥匙" : "已取消钥匙";
    }
    render();
  }

  function toggleIceMode() {
    if (state.over) return;
    if (state.icePicks <= 0) {
      state.message = "破冰次数已经用完";
      context.playSound?.("invalid");
    } else {
      state.iceMode = !state.iceMode;
      state.keyMode = false;
      state.message = state.iceMode ? "选择冰封瓶破冰" : "已取消破冰";
    }
    render();
  }

  function shuffleLevel() {
    if (state.over) return;
    if (state.shuffles <= 0) {
      state.message = "洗局次数已经用完";
      context.playSound?.("invalid");
      render();
      return;
    }
    const shuffles = state.shuffles - 1;
    const score = state.score;
    const level = state.level;
    state = initialState(difficulty, mode, level, score);
    state.shuffles = shuffles;
    state.message = "已重新生成本关排序";
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

  function tubeMarkup(tube, index) {
    const classes = [
      "sort-tube",
      state.selected === index ? "is-selected" : "",
      state.hint?.from === index ? "is-hint-from" : "",
      state.hint?.to === index ? "is-hint-to" : "",
      tube.locked ? "is-locked" : "",
      tube.frozen ? "is-frozen" : "",
      isTubeComplete(tube) ? "is-complete" : ""
    ].filter(Boolean).join(" ");
    const layers = Array.from({ length: CAPACITY }, (_, layerIndex) => {
      const color = tube.items[layerIndex];
      if (!color) return `<span class="sort-layer is-empty"></span>`;
      const meta = colorMeta(color);
      return `<span class="sort-layer tone-${meta.tone}"><b>${meta.label}</b></span>`;
    }).join("");
    const lock = tube.locked ? `<span class="tube-badge">锁</span>` : "";
    const ice = tube.frozen ? `<span class="tube-badge ice">冰${tube.frozen}</span>` : "";
    return `
      <button type="button" class="${classes}" data-sort-tube="${index}" aria-label="第 ${index + 1} 个瓶子">
        <span class="sort-liquid-stack">${layers}</span>
        ${lock}${ice}
      </button>
    `;
  }

  function render() {
    const config = configFor(difficulty, mode, state.level);
    root.innerHTML = `
      <section class="game-panel game-status sort-master-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${progressText(state, difficulty)}</p>
        </div>
        <div class="mini-stats">
          <span>${SORT_MODES[state.mode].label}</span>
          ${state.maxLevel > 1 ? `<span>关卡 ${state.level}/${state.maxLevel}</span>` : ""}
          <span>步 ${state.moves}</span>
          <span>色 ${state.completedColors.length}/${state.colorCount}</span>
          <span>分 ${state.score + state.stageScore}</span>
          <span>连 ${state.bestStreak}</span>
        </div>
      </section>
      <section class="sort-board" style="--sort-cols:${Math.min(5, Math.ceil(config.tubeCount / 2))};" aria-label="排序大师瓶阵">
        ${state.tubes.map(tubeMarkup).join("")}
      </section>
      <section class="game-panel toolbar sort-tools">
        <button class="secondary-button" type="button" data-sort-action="hint">提示 ${state.hints}</button>
        <button class="secondary-button" type="button" data-sort-action="undo">撤回 ${state.undos}</button>
        <button class="secondary-button ${state.keyMode ? "is-active" : ""}" type="button" data-sort-action="key">钥匙 ${state.keys}</button>
        <button class="secondary-button ${state.iceMode ? "is-active" : ""}" type="button" data-sort-action="ice">破冰 ${state.icePicks}</button>
        <button class="secondary-button" type="button" data-sort-action="shuffle">洗局 ${state.shuffles}</button>
      </section>
    `;
    root.querySelectorAll("[data-sort-tube]").forEach((button) => {
      button.addEventListener("click", () => selectTube(Number(button.dataset.sortTube)));
    });
    root.querySelector("[data-sort-action='hint']").addEventListener("click", showHint);
    root.querySelector("[data-sort-action='undo']").addEventListener("click", undoMove);
    root.querySelector("[data-sort-action='key']").addEventListener("click", toggleKeyMode);
    root.querySelector("[data-sort-action='ice']").addEventListener("click", toggleIceMode);
    root.querySelector("[data-sort-action='shuffle']").addEventListener("click", shuffleLevel);
  }

  removeShellRestart = context.shell?.onRestart?.(() => restart()) || null;
  render();

  return () => {
    removeShellRestart?.();
    if (!state.over && !state.complete) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
