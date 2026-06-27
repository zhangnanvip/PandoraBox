import { loadState, removeState, saveState } from "../../utils/storage.js";
import { choice, clamp, shuffle } from "../../utils/random.js";

const SIZE = 8;
// 经典舰队：航母5、战列4、巡洋3、潜艇3、驱逐2 —— 共 17 格
const FLEET = [
  { name: "航母", len: 5 },
  { name: "战列舰", len: 4 },
  { name: "巡洋舰", len: 3 },
  { name: "潜艇", len: 3 },
  { name: "驱逐舰", len: 2 }
];
const TOTAL_SHIP_CELLS = FLEET.reduce((sum, s) => sum + s.len, 0);

// difficulty = AI 智商
const DIFFICULTY = {
  easy: { label: "简单", smart: false, parity: false },
  medium: { label: "中等", smart: true, parity: false },
  hard: { label: "困难", smart: true, parity: true },
  devil: { label: "魔鬼", smart: true, parity: true }
};

function diffConfig(difficulty) {
  return DIFFICULTY[difficulty] || DIFFICULTY.medium;
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function idx(r, c) {
  return r * SIZE + c;
}

function emptyBoard() {
  return Array.from({ length: SIZE * SIZE }, () => ({
    ship: -1, // 所属舰队索引，-1 表示空海
    shot: false
  }));
}

function placeFleet() {
  const board = emptyBoard();
  const ships = FLEET.map((s) => ({ name: s.name, len: s.len, hits: 0, cells: [] }));
  ships.forEach((ship, shipIndex) => {
    let placed = false;
    let guard = 0;
    while (!placed && guard < 500) {
      guard += 1;
      const horizontal = Math.random() < 0.5;
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      const cells = [];
      let ok = true;
      for (let i = 0; i < ship.len; i += 1) {
        const rr = horizontal ? r : r + i;
        const cc = horizontal ? c + i : c;
        if (!inBounds(rr, cc) || board[idx(rr, cc)].ship !== -1) {
          ok = false;
          break;
        }
        cells.push(idx(rr, cc));
      }
      if (!ok) continue;
      cells.forEach((cell) => {
        board[cell].ship = shipIndex;
      });
      ship.cells = cells;
      placed = true;
    }
  });
  return { board, ships };
}

function initialState() {
  const player = placeFleet();
  const ai = placeFleet();
  return {
    playerBoard: player.board,
    playerShips: player.ships,
    aiBoard: ai.board,
    aiShips: ai.ships,
    turn: "player", // player | ai
    playerShots: 0,
    aiShots: 0,
    aiSunkOfPlayer: 0,
    playerSunkOfAi: 0,
    hunt: [], // AI 命中后待打的相邻队列
    over: false,
    won: false,
    message: "点击敌方海域开火，击沉全部舰队取胜"
  };
}

function isValidState(s) {
  return s
    && Array.isArray(s.playerBoard) && s.playerBoard.length === SIZE * SIZE
    && Array.isArray(s.aiBoard) && s.aiBoard.length === SIZE * SIZE
    && Array.isArray(s.playerShips) && Array.isArray(s.aiShips)
    && Number.isFinite(s.playerShots) && Number.isFinite(s.aiShots);
}

function shipDestroyed(ship) {
  return ship.hits >= ship.len;
}

function fleetDestroyed(ships) {
  return ships.every(shipDestroyed);
}

export function mountBattleship(root, context) {
  const difficulty = DIFFICULTY[context?.difficulty] ? context.difficulty : "medium";
  const cfg = diffConfig(difficulty);
  const storageKey = `battleship:${difficulty}`;
  let state = context?.savedState || loadState(storageKey, null);
  if (!isValidState(state)) state = initialState();
  let resultReported = false;
  let aiTimer = 0;
  let removeShellRestart = null;

  function save() {
    if (state.over) {
      removeState(storageKey);
      context?.clearSession?.();
      return;
    }
    saveState(storageKey, state);
    context?.saveSession?.(state, {
      level: cfg.label,
      stage: `8x8 · ${FLEET.length} 舰`,
      score: state.playerSunkOfAi
    });
  }

  function reportResult() {
    if (resultReported) return;
    resultReported = true;
    const outcome = state.won ? "win" : "loss";
    context?.reportResult?.({
      outcome,
      score: state.playerSunkOfAi,
      moves: state.playerShots,
      detail: state.won
        ? `击沉敌方全部 ${FLEET.length} 艘战舰`
        : `舰队覆没，击沉敌舰 ${state.playerSunkOfAi}/${FLEET.length}`
    });
  }

  function finish(won) {
    state.over = true;
    state.won = won;
    state.message = won ? "全歼敌方舰队，胜利！" : "我方舰队被摧毁，败北";
    context?.playSound?.(won ? "win" : "invalid");
    save();
    reportResult();
    render();
  }

  // 玩家开火
  function fire(cellIndex) {
    if (state.over || state.turn !== "player") return;
    const cell = state.aiBoard[cellIndex];
    if (!cell || cell.shot) return;
    cell.shot = true;
    state.playerShots += 1;
    if (cell.ship >= 0) {
      const ship = state.aiShips[cell.ship];
      ship.hits += 1;
      if (shipDestroyed(ship)) {
        state.playerSunkOfAi += 1;
        state.message = `击沉敌方${ship.name}！`;
        context?.playSound?.("win");
      } else {
        state.message = "命中敌舰";
        context?.playSound?.("move");
      }
      if (fleetDestroyed(state.aiShips)) {
        finish(true);
        return;
      }
      save();
      render();
      return; // 命中后仍是玩家回合
    }
    state.message = "未命中，敌方还击";
    context?.playSound?.("select");
    state.turn = "ai";
    save();
    render();
    scheduleAiTurn();
  }

  function scheduleAiTurn() {
    clearTimeout(aiTimer);
    aiTimer = window.setTimeout(aiTurn, 520);
  }

  function aiPickTarget() {
    // target 模式：清空 hunt 队列里仍未打的格
    if (cfg.smart) {
      while (state.hunt.length) {
        const next = state.hunt.shift();
        if (!state.playerBoard[next].shot) return next;
      }
    }
    // hunt 模式：随机（hard/devil 用奇偶棋盘缩小搜索）
    const candidates = [];
    for (let i = 0; i < state.playerBoard.length; i += 1) {
      if (state.playerBoard[i].shot) continue;
      if (cfg.parity) {
        const r = Math.floor(i / SIZE);
        const c = i % SIZE;
        if ((r + c) % 2 !== 0) continue;
      }
      candidates.push(i);
    }
    if (!candidates.length) {
      for (let i = 0; i < state.playerBoard.length; i += 1) {
        if (!state.playerBoard[i].shot) candidates.push(i);
      }
    }
    return candidates.length ? choice(candidates) : -1;
  }

  function enqueueNeighbors(cellIndex) {
    const r = Math.floor(cellIndex / SIZE);
    const c = cellIndex % SIZE;
    const adj = shuffle([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]);
    adj.forEach(([rr, cc]) => {
      if (inBounds(rr, cc) && !state.playerBoard[idx(rr, cc)].shot) {
        state.hunt.push(idx(rr, cc));
      }
    });
  }

  function aiTurn() {
    if (state.over) return;
    const target = aiPickTarget();
    if (target < 0) return;
    const cell = state.playerBoard[target];
    cell.shot = true;
    state.aiShots += 1;
    if (cell.ship >= 0) {
      const ship = state.playerShips[cell.ship];
      ship.hits += 1;
      if (cfg.smart) enqueueNeighbors(target);
      if (shipDestroyed(ship)) {
        state.aiSunkOfPlayer += 1;
        state.hunt = []; // 沉了就重新搜索
        state.message = `敌方击沉了我方${ship.name}`;
      } else {
        state.message = "敌方命中我方战舰";
      }
      if (fleetDestroyed(state.playerShips)) {
        finish(false);
        return;
      }
      save();
      render();
      scheduleAiTurn(); // 命中后敌方继续
      return;
    }
    state.message = "敌方未命中，轮到我方开火";
    state.turn = "player";
    save();
    render();
  }

  function restart() {
    clearTimeout(aiTimer);
    state = initialState();
    resultReported = false;
    removeState(storageKey);
    context?.clearSession?.();
    save();
    render();
  }

  function cellMarkup(cell, index, enemy) {
    const classes = ["bs-cell"];
    let content = "";
    if (cell.shot) {
      if (cell.ship >= 0) {
        classes.push("bs-hit");
        content = "✶";
      } else {
        classes.push("bs-miss");
        content = "·";
      }
    } else if (!enemy && cell.ship >= 0) {
      classes.push("bs-ship");
    } else {
      classes.push("bs-water");
    }
    const r = Math.floor(index / SIZE) + 1;
    const c = (index % SIZE) + 1;
    if (enemy) {
      const disabled = state.over || state.turn !== "player" || cell.shot;
      return `<button type="button" class="${classes.join(" ")}" data-fire="${index}" ${disabled ? "disabled" : ""} aria-label="敌方 ${r}行${c}列"><span>${content}</span></button>`;
    }
    return `<div class="${classes.join(" ")}" aria-hidden="true"><span>${content}</span></div>`;
  }

  function gridMarkup(board, enemy) {
    return `<div class="bs-grid" style="display:grid;grid-template-columns:repeat(${SIZE},1fr);gap:2px;">${
      board.map((cell, i) => cellMarkup(cell, i, enemy)).join("")
    }</div>`;
  }

  function render() {
    const aiLeft = FLEET.length - state.playerSunkOfAi;
    const myLeft = FLEET.length - state.aiSunkOfPlayer;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">8x8 海战棋 · AI ${cfg.label} · ${state.over ? "对局结束" : state.turn === "player" ? "我方回合" : "敌方回合"}</p>
        </div>
        <div class="mini-stats">
          <span>敌舰 ${aiLeft}</span>
          <span>我舰 ${myLeft}</span>
          <span>开火 ${state.playerShots}</span>
        </div>
      </section>
      <section class="board-wrap" style="display:flex;flex-direction:column;gap:12px;max-width:360px;margin:0 auto;">
        <div>
          <p class="game-note" style="margin:0 0 4px;">敌方海域（点击开火）</p>
          ${gridMarkup(state.aiBoard, true)}
        </div>
        <div>
          <p class="game-note" style="margin:0 0 4px;">我方海域</p>
          ${gridMarkup(state.playerBoard, false)}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" type="button" data-action="restart">重开</button>
      </section>
      <style>
        .bs-cell{aspect-ratio:1;border:none;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;padding:0;}
        .bs-water{background:rgba(56,128,200,.22);}
        .bs-ship{background:rgba(120,130,150,.65);}
        .bs-hit{background:#d9534f;color:#fff;}
        .bs-miss{background:rgba(180,190,205,.35);color:rgba(0,0,0,.4);}
        button.bs-cell{cursor:pointer;}
        button.bs-cell:disabled{cursor:default;}
        button.bs-cell.bs-water:hover:not(:disabled){background:rgba(56,128,200,.45);}
      </style>
    `;
    root.querySelectorAll("[data-fire]").forEach((btn) => {
      btn.addEventListener("click", () => fire(Number(btn.dataset.fire)));
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  removeShellRestart = context?.shell?.onRestart?.(() => restart()) || null;
  render();
  if (state.turn === "ai" && !state.over) scheduleAiTurn();

  return () => {
    clearTimeout(aiTimer);
    removeShellRestart?.();
    if (!state.over) save();
  };
}
