import { loadState, removeState, saveState } from "../../utils/storage.js";

// 7x7 网格，四角去掉 → 33 洞十字盘。-1=盘外, 0=空, 1=有棋
const VALID = (() => {
  const grid = [];
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const corner = (r < 2 || r > 4) && (c < 2 || c > 4);
      grid.push(!corner);
    }
  }
  return grid;
})();
const CENTER = 24; // 3*7+3

function rc(i) {
  return [Math.floor(i / 7), i % 7];
}

function initialBoard(difficulty) {
  const board = VALID.map((ok) => (ok ? 1 : -1));
  if (difficulty === "easy") {
    // 多挖一个空: 中心 + 左侧一格, 更易达成
    board[CENTER] = 0;
    board[CENTER - 1] = 0;
  } else {
    board[CENTER] = 0;
  }
  return board;
}

// 返回所有合法跳法 {from, over, to}
function legalMoves(board) {
  const moves = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let i = 0; i < 49; i += 1) {
    if (board[i] !== 1) continue;
    const [r, c] = rc(i);
    for (const [dr, dc] of dirs) {
      const mr = r + dr, mc = c + dc, tr = r + dr * 2, tc = c + dc * 2;
      if (tr < 0 || tr > 6 || tc < 0 || tc > 6) continue;
      const over = mr * 7 + mc, to = tr * 7 + tc;
      if (board[over] === 1 && board[to] === 0) moves.push({ from: i, over, to });
    }
  }
  return moves;
}

function pegCount(board) {
  return board.filter((cell) => cell === 1).length;
}

function initialState(difficulty) {
  const board = initialBoard(difficulty);
  return { board, selected: -1, history: [], moves: 0 };
}

function isValidState(state) {
  return Array.isArray(state?.board) && state.board.length === 49 && Array.isArray(state.history);
}

export function mountPegSolitaire(root, context) {
  const difficulty = context.difficulty || "medium";
  const storageKey = `peg-solitaire:${difficulty}`;
  const winGoal = difficulty === "hard"
    ? "剩 1 子且落点在中心"
    : difficulty === "easy"
    ? "尽量剩 1 子"
    : "剩 1 子获胜";

  function fresh() {
    return initialState(difficulty);
  }

  const restored = (context.savedState && isValidState(context.savedState))
    ? { ...context.savedState, board: [...context.savedState.board], history: [], selected: -1 }
    : (() => {
        const legacy = loadState(storageKey, null);
        return legacy && isValidState(legacy)
          ? { ...legacy, board: [...legacy.board], history: [], selected: -1 }
          : fresh();
      })();

  let state = restored;
  let reported = false;

  function over() {
    return legalMoves(state.board).length === 0;
  }

  function won() {
    const pegs = pegCount(state.board);
    if (difficulty === "hard") return pegs === 1 && state.board[CENTER] === 1;
    return pegs === 1;
  }

  function save() {
    saveState(storageKey, { board: [...state.board], moves: state.moves });
    if (over()) {
      context.clearSession?.();
    } else if (context.saveSession) {
      context.saveSession(
        { board: [...state.board], moves: state.moves },
        { stage: `剩 ${pegCount(state.board)} 子`, level: state.moves, score: 100 - pegCount(state.board) * 5 }
      );
    }
  }

  function report() {
    if (reported || !over()) return;
    reported = true;
    const pegs = pegCount(state.board);
    context.clearSession?.();
    context.reportResult?.({
      outcome: "complete",
      detail: won() ? "恰好剩 1 子，完美！" : `结束，剩 ${pegs} 子`,
      score: Math.max(0, 100 - pegs * 5),
      moves: state.moves
    });
  }

  function tryMove(from, to) {
    const move = legalMoves(state.board).find((m) => m.from === from && m.to === to);
    if (!move) return false;
    state.history.push(state.board.slice());
    state.board[move.from] = 0;
    state.board[move.over] = 0;
    state.board[move.to] = 1;
    state.moves += 1;
    state.selected = -1;
    context.playSound?.("move");
    save();
    render();
    if (over()) report();
    return true;
  }

  function tap(i) {
    if (over()) return;
    if (state.selected === i) {
      state.selected = -1;
      render();
      return;
    }
    if (state.board[i] === 1) {
      state.selected = i;
      render();
    } else if (state.board[i] === 0 && state.selected >= 0) {
      if (!tryMove(state.selected, i)) {
        state.selected = -1;
        render();
      }
    }
  }

  function undo() {
    const prev = state.history.pop();
    if (!prev) return;
    state.board = prev;
    state.moves = Math.max(0, state.moves - 1);
    state.selected = -1;
    reported = false;
    save();
    render();
  }

  function restart() {
    state = fresh();
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function render() {
    const pegs = pegCount(state.board);
    const done = over();
    const targets = state.selected >= 0
      ? new Set(legalMoves(state.board).filter((m) => m.from === state.selected).map((m) => m.to))
      : new Set();
    const message = done ? (won() ? "完美收官！" : `游戏结束 · 剩 ${pegs} 子`) : "点棋子，再点空位跳吃";

    const cells = state.board.map((cell, i) => {
      if (cell === -1) return `<div style="aspect-ratio:1"></div>`;
      const sel = i === state.selected;
      const tgt = targets.has(i);
      const peg = cell === 1;
      const bg = peg ? (sel ? "#f6c453" : "#8b5cf6") : "rgba(255,255,255,0.06)";
      const shadow = peg ? "inset 0 -3px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.35)" : "inset 0 2px 4px rgba(0,0,0,0.4)";
      const ring = tgt ? "box-shadow:0 0 0 3px #34d399;" : "";
      return `<button type="button" data-cell="${i}" aria-label="格 ${i}" style="aspect-ratio:1;border:none;border-radius:50%;cursor:pointer;background:${bg};box-shadow:${shadow};${ring}padding:0;transition:background .12s,box-shadow .12s"></button>`;
    }).join("");

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${message}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty} · ${winGoal}</p>
        </div>
        <div class="mini-stats"><span>剩 ${pegs}</span><span>步 ${state.moves}</span></div>
      </section>
      <section class="board-wrap">
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;max-width:340px;margin:0 auto;width:100%">${cells}</div>
      </section>
      <section class="game-panel toolbar">
        <button class="secondary-button" data-action="undo" ${state.history.length ? "" : "disabled"}>悔棋</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-cell]").forEach((btn) => {
      btn.addEventListener("click", () => tap(Number(btn.dataset.cell)));
    });
    root.querySelector("[data-action='undo']").addEventListener("click", undo);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
  }

  render();
  if (over()) report();

  return () => {};
}
