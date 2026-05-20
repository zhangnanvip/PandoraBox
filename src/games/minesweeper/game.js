import { loadState, removeState, saveState } from "../../utils/storage.js";

const LONG_PRESS_MS = 420;

const DIFFICULTY = {
  easy: { label: "简单", rows: 9, cols: 9, mines: 10 },
  medium: { label: "中等", rows: 12, cols: 12, mines: 24 },
  hard: { label: "困难", rows: 14, cols: 14, mines: 38 },
  devil: { label: "魔鬼", rows: 16, cols: 16, mines: 60 }
};

function configFor(difficulty) {
  return DIFFICULTY[difficulty] || DIFFICULTY.medium;
}

function createCells(rows, cols) {
  return Array.from({ length: rows * cols }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    count: 0
  }));
}

function rowOf(index, cols) {
  return Math.floor(index / cols);
}

function colOf(index, cols) {
  return index % cols;
}

function indexOf(row, col, cols) {
  return row * cols + col;
}

function neighborsOf(index, rows, cols) {
  const row = rowOf(index, cols);
  const col = colOf(index, cols);
  const indexes = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
        indexes.push(indexOf(nextRow, nextCol, cols));
      }
    }
  }
  return indexes;
}

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function placeMines(cells, firstIndex, rows, cols, mines) {
  const safe = new Set([firstIndex, ...neighborsOf(firstIndex, rows, cols)]);
  const candidates = shuffle(cells.map((_, index) => index).filter((index) => !safe.has(index)));
  candidates.slice(0, mines).forEach((index) => {
    cells[index].mine = true;
  });
  cells.forEach((cell, index) => {
    if (cell.mine) return;
    cell.count = neighborsOf(index, rows, cols).filter((neighbor) => cells[neighbor].mine).length;
  });
}

function initialState(difficulty) {
  const config = configFor(difficulty);
  return {
    rows: config.rows,
    cols: config.cols,
    mines: config.mines,
    cells: createCells(config.rows, config.cols),
    firstMove: true,
    flags: 0,
    revealed: 0,
    elapsed: 0,
    startedAt: 0,
    flagMode: false,
    boom: -1,
    over: false,
    won: false,
    message: "点击任意格开始，首点一定安全"
  };
}

function isValidState(state) {
  return Number.isFinite(state?.rows)
    && Number.isFinite(state?.cols)
    && Number.isFinite(state?.mines)
    && Array.isArray(state?.cells)
    && state.cells.length === state.rows * state.cols
    && Number.isFinite(state.flags)
    && Number.isFinite(state.revealed);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function currentElapsed(state) {
  if (!state.startedAt) return state.elapsed;
  return state.elapsed + Math.floor((Date.now() - state.startedAt) / 1000);
}

function serializeState(state) {
  return {
    ...JSON.parse(JSON.stringify(state)),
    elapsed: currentElapsed(state),
    startedAt: 0
  };
}

function sessionMeta(state) {
  return {
    stage: `${state.rows}x${state.cols}`,
    score: state.revealed,
    time: formatTime(currentElapsed(state))
  };
}

function hiddenSafeCells(state) {
  return state.cells.length - state.mines - state.revealed;
}

function progressText(state) {
  return `剩余安全格 ${hiddenSafeCells(state)} · 标记 ${state.flags}/${state.mines} · 用时 ${formatTime(currentElapsed(state))}`;
}

function scoreFor(state) {
  const sizeBonus = state.rows * state.cols;
  const mineBonus = state.mines * 8;
  const timePenalty = Math.floor(currentElapsed(state) * 0.9);
  const flagPenalty = Math.max(0, state.flags - state.mines) * 6;
  return Math.max(0, sizeBonus + mineBonus - timePenalty - flagPenalty);
}

function revealAllMines(state) {
  state.cells.forEach((cell) => {
    if (cell.mine) cell.revealed = true;
  });
}

export function mountMinesweeper(root, context) {
  const difficulty = DIFFICULTY[context.difficulty] ? context.difficulty : "medium";
  const storageKey = `minesweeper:${difficulty}`;
  let state = context.savedState || loadState(storageKey, initialState(difficulty));
  if (!isValidState(state)) state = initialState(difficulty);
  let resultReported = false;
  let timer = 0;

  function startTimer() {
    if (!state.startedAt && !state.firstMove && !state.over && !state.won) {
      state.startedAt = Date.now();
    }
  }

  function pauseTimer() {
    state.elapsed = currentElapsed(state);
    state.startedAt = 0;
  }

  function save() {
    const snapshot = serializeState(state);
    if (state.over || state.won) {
      removeState(storageKey);
      context.clearSession?.();
      return;
    }
    saveState(storageKey, snapshot);
    if (!state.firstMove) context.saveSession?.(snapshot, sessionMeta(state));
  }

  function reportResult(outcome) {
    if (resultReported) return;
    resultReported = true;
    context.reportResult?.({
      outcome,
      score: outcome === "complete" ? scoreFor(state) : state.revealed,
      detail: outcome === "complete" ? "成功排除全部雷区" : "踩中地雷",
      extra: progressText(state)
    });
  }

  function ensureTimer() {
    clearInterval(timer);
    timer = window.setInterval(() => {
      if (!state.startedAt || state.over || state.won) return;
      const timeNode = root.querySelector("[data-mine-time]");
      const progressNode = root.querySelector("[data-mine-progress]");
      if (timeNode) timeNode.textContent = formatTime(currentElapsed(state));
      if (progressNode) progressNode.textContent = progressText(state);
    }, 1000);
  }

  function finishWin() {
    pauseTimer();
    state.over = true;
    state.won = true;
    state.message = `排雷成功，得分 ${scoreFor(state)}`;
    state.cells.forEach((cell) => {
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
        state.flags += 1;
      }
    });
    context.playSound?.("win");
    save();
    reportResult("complete");
    render();
  }

  function finishLoss(index) {
    pauseTimer();
    state.over = true;
    state.won = false;
    state.boom = index;
    state.message = "踩中地雷，挑战结束";
    revealAllMines(state);
    context.playSound?.("invalid");
    save();
    reportResult("loss");
    render();
  }

  function revealSafe(index) {
    const stack = [index];
    const seen = new Set();
    while (stack.length) {
      const current = stack.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      const cell = state.cells[current];
      if (!cell || cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      state.revealed += 1;
      if (cell.count === 0) {
        neighborsOf(current, state.rows, state.cols).forEach((neighbor) => {
          if (!seen.has(neighbor) && !state.cells[neighbor].mine) stack.push(neighbor);
        });
      }
    }
  }

  function checkWin() {
    if (state.revealed >= state.rows * state.cols - state.mines) {
      finishWin();
      return true;
    }
    return false;
  }

  function toggleFlag(index) {
    if (state.over || state.won) return;
    const cell = state.cells[index];
    if (!cell || cell.revealed) return;
    cell.flagged = !cell.flagged;
    state.flags += cell.flagged ? 1 : -1;
    state.message = cell.flagged ? "已标记疑似地雷" : "已取消标记";
    context.playSound?.("select");
    save();
    render();
  }

  function reveal(index) {
    if (state.over || state.won) return;
    const cell = state.cells[index];
    if (!cell) return;
    if (state.flagMode && !cell.revealed) {
      toggleFlag(index);
      return;
    }
    if (cell.flagged) {
      state.message = "这个格子已标记，先取消标记再翻开";
      context.playSound?.("invalid");
      render();
      return;
    }
    if (cell.revealed) {
      chord(index);
      return;
    }
    if (state.firstMove) {
      placeMines(state.cells, index, state.rows, state.cols, state.mines);
      state.firstMove = false;
      startTimer();
    }
    if (cell.mine) {
      finishLoss(index);
      return;
    }
    revealSafe(index);
    if (checkWin()) return;
    state.message = cell.count ? `周围共有 ${cell.count} 个地雷` : "已展开一片安全区域";
    context.playSound?.("move");
    save();
    render();
  }

  function chord(index) {
    const cell = state.cells[index];
    if (!cell?.revealed || cell.count <= 0 || state.over) return;
    const neighbors = neighborsOf(index, state.rows, state.cols);
    const flagCount = neighbors.filter((neighbor) => state.cells[neighbor].flagged).length;
    if (flagCount !== cell.count) {
      state.message = `需要标记 ${cell.count} 个周围雷后才能快速展开`;
      context.playSound?.("invalid");
      render();
      return;
    }
    for (const neighbor of neighbors) {
      const next = state.cells[neighbor];
      if (!next || next.revealed || next.flagged) continue;
      if (next.mine) {
        finishLoss(neighbor);
        return;
      }
      revealSafe(neighbor);
    }
    if (checkWin()) return;
    state.message = "已快速展开周围安全格";
    context.playSound?.("move");
    save();
    render();
  }

  function restart() {
    state = initialState(difficulty);
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    save();
    render();
  }

  function toggleFlagMode() {
    state.flagMode = !state.flagMode;
    state.message = state.flagMode ? "标记模式已开启，点击格子插旗" : "翻开模式已开启，长按仍可插旗";
    save();
    render();
  }

  function cellLabel(cell, index) {
    const row = rowOf(index, state.cols) + 1;
    const col = colOf(index, state.cols) + 1;
    if (cell.flagged && !cell.revealed) return `${row} 行 ${col} 列，已标记`;
    if (!cell.revealed) return `${row} 行 ${col} 列，未翻开`;
    if (cell.mine) return `${row} 行 ${col} 列，地雷`;
    return `${row} 行 ${col} 列，数字 ${cell.count}`;
  }

  function cellMarkup(cell, index) {
    const classes = [
      "mine-cell",
      cell.revealed ? "is-revealed" : "",
      cell.flagged && !cell.revealed ? "is-flagged" : "",
      cell.mine && cell.revealed ? "is-mine" : "",
      state.boom === index ? "is-boom" : "",
      cell.revealed && !cell.mine ? `count-${cell.count}` : ""
    ].filter(Boolean).join(" ");
    const content = cell.revealed
      ? (cell.mine ? "雷" : (cell.count || ""))
      : (cell.flagged ? "旗" : "");
    return `
      <button type="button" class="${classes}" data-mine-index="${index}" aria-label="${cellLabel(cell, index)}">
        <span>${content}</span>
      </button>
    `;
  }

  function bindCell(button) {
    const index = Number(button.dataset.mineIndex);
    let longPress = 0;
    let suppressClick = false;
    button.addEventListener("pointerdown", () => {
      clearTimeout(longPress);
      suppressClick = false;
      longPress = window.setTimeout(() => {
        suppressClick = true;
        toggleFlag(index);
      }, LONG_PRESS_MS);
    });
    button.addEventListener("pointerup", () => {
      clearTimeout(longPress);
    });
    button.addEventListener("pointerleave", () => {
      clearTimeout(longPress);
    });
    button.addEventListener("pointercancel", () => {
      clearTimeout(longPress);
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      toggleFlag(index);
    });
    button.addEventListener("click", (event) => {
      if (suppressClick) {
        event.preventDefault();
        suppressClick = false;
        return;
      }
      reveal(index);
    });
  }

  function render() {
    root.innerHTML = `
      <section class="game-panel game-status minesweeper-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note" data-mine-progress>${DIFFICULTY[difficulty].label} · ${progressText(state)}</p>
        </div>
        <div class="mini-stats">
          <span>${state.rows}x${state.cols}</span>
          <span>雷 ${state.mines}</span>
          <span>旗 ${state.flags}</span>
          <span>安全 ${hiddenSafeCells(state)}</span>
          <span>用时 <b data-mine-time>${formatTime(currentElapsed(state))}</b></span>
        </div>
      </section>
      <section class="minesweeper-board" style="--mine-cols: ${state.cols}; --mine-rows: ${state.rows};" aria-label="扫雷棋盘">
        ${state.cells.map((cell, index) => cellMarkup(cell, index)).join("")}
      </section>
      <section class="game-panel toolbar mine-tools">
        <button class="secondary-button ${state.flagMode ? "is-active" : ""}" type="button" data-mine-action="flag-mode">
          ${state.flagMode ? "标记中" : "标记模式"}
        </button>
        <button class="danger-button" type="button" data-mine-action="restart">重开</button>
      </section>
    `;
    root.querySelectorAll("[data-mine-index]").forEach(bindCell);
    root.querySelector("[data-mine-action='flag-mode']").addEventListener("click", toggleFlagMode);
    root.querySelector("[data-mine-action='restart']").addEventListener("click", restart);
    ensureTimer();
  }

  if (!state.firstMove && !state.over && !state.won) startTimer();
  render();

  return () => {
    clearInterval(timer);
    if (!state.over && !state.won && !state.firstMove) {
      context.saveSession?.(serializeState(state), sessionMeta(state));
    }
  };
}
