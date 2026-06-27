import { choice, clamp } from "../../utils/random.js";

const HUMAN = "you";
const OPPONENT = "ai";

function buildRows() {
  // 3-4 rows of stones, escalating piles
  const counts = [3, 4, 5, 6];
  return counts.map((n) => clamp(n, 1, 9));
}

function initialState() {
  return {
    rows: buildRows(),
    turn: HUMAN,
    selectedRow: -1,
    selectedTake: 0,
    winner: "",
    message: "选一排，从中拿走任意颗石子",
    moves: 0
  };
}

function totalStones(rows) {
  return rows.reduce((sum, n) => sum + n, 0);
}

function isOver(rows) {
  return totalStones(rows) === 0;
}

// Misère Nim optimal move via Sprague-Grundy XOR, with endgame heel turn.
function optimalMove(rows) {
  const piles = rows.map((n, i) => ({ i, n })).filter((p) => p.n > 0);
  const xor = piles.reduce((x, p) => x ^ p.n, 0);
  const heaps = piles.filter((p) => p.n > 1).length;
  // Endgame: only piles of size 1 remain (heaps with >1 are gone).
  if (heaps === 0) {
    const ones = piles.length;
    // misère: leave an odd number of single stones for opponent.
    const take = ones % 2 === 0 ? piles[0].n : 1;
    return { row: piles[0].i, take };
  }
  // One heap >1 left: reduce it to make remaining ones-count odd.
  if (heaps === 1) {
    const big = piles.find((p) => p.n > 1);
    const ones = piles.filter((p) => p.n === 1).length;
    const target = ones % 2 === 0 ? 1 : 0;
    return { row: big.i, take: big.n - target };
  }
  // General play same as normal Nim: drive XOR to 0.
  if (xor === 0) {
    const p = piles[0];
    return { row: p.i, take: 1 };
  }
  for (const p of piles) {
    const desired = p.n ^ xor;
    if (desired < p.n) return { row: p.i, take: p.n - desired };
  }
  const p = piles[0];
  return { row: p.i, take: 1 };
}

function randomMove(rows) {
  const piles = rows.map((n, i) => ({ i, n })).filter((p) => p.n > 0);
  const pile = choice(piles);
  return { row: pile.i, take: clamp(Math.floor(Math.random() * pile.n) + 1, 1, pile.n) };
}

function chooseMove(rows, difficulty) {
  if (difficulty === "easy") return randomMove(rows);
  return optimalMove(rows);
}

function isValidState(state) {
  return Array.isArray(state?.rows) && typeof state.turn === "string";
}

export function mountNim(root, context) {
  const initial = (context.savedState && isValidState(context.savedState))
    ? { ...initialState(), ...context.savedState, rows: [...context.savedState.rows] }
    : initialState();
  let state = initial;
  let disposed = false;
  let aiTimer = 0;
  let resultReported = false;
  const difficulty = context.difficulty || "medium";
  const isAi = context.mode === "ai";

  function save() {
    if (context.saveSession && !state.winner) {
      context.saveSession({ rows: [...state.rows], turn: state.turn, moves: state.moves }, {
        stage: `进行中 · ${totalStones(state.rows)} 颗`,
        level: state.moves,
        score: state.moves
      });
    } else if (context.clearSession && state.winner) {
      context.clearSession();
    }
  }

  function actorLabel(actor) {
    if (isAi) return actor === HUMAN ? "你" : "AI";
    return actor === HUMAN ? "玩家 1" : "玩家 2";
  }

  function reportResult() {
    if (resultReported || !state.winner) return;
    resultReported = true;
    const outcome = isAi ? (state.winner === HUMAN ? "win" : "loss") : "complete";
    context.reportResult?.({ outcome, detail: state.message, moves: state.moves });
  }

  function applyTake(row, take) {
    if (state.winner || row < 0 || take < 1 || take > state.rows[row]) return;
    state.rows[row] -= take;
    state.moves += 1;
    state.selectedRow = -1;
    state.selectedTake = 0;
    if (isOver(state.rows)) {
      // taker of last stone loses (misère)
      const loser = state.turn;
      const winner = loser === HUMAN ? OPPONENT : HUMAN;
      state.winner = winner;
      state.message = isAi
        ? (winner === HUMAN ? "你赢了！对手拿了最后一颗" : "你拿了最后一颗，输了")
        : `${actorLabel(winner)} 获胜（${actorLabel(loser)} 拿了最后一颗）`;
      context.playSound?.(isAi && winner === HUMAN ? "win" : "lose");
      save();
      reportResult();
      render();
      return;
    }
    state.turn = state.turn === HUMAN ? OPPONENT : HUMAN;
    state.message = `轮到 ${actorLabel(state.turn)}：选一排取石子`;
    save();
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || !isAi || state.turn !== OPPONENT || state.winner) return;
    aiTimer = window.setTimeout(() => {
      const move = chooseMove(state.rows, difficulty);
      applyTake(move.row, move.take);
    }, 360);
  }

  function selectRow(row) {
    if (state.winner) return;
    if (isAi && state.turn !== HUMAN) return;
    if (state.rows[row] <= 0) return;
    state.selectedRow = row;
    state.selectedTake = clamp(state.selectedTake || 1, 1, state.rows[row]);
    render();
  }

  function setTake(n) {
    if (state.selectedRow < 0) return;
    state.selectedTake = clamp(n, 1, state.rows[state.selectedRow]);
    render();
  }

  function restart() {
    state = initialState();
    resultReported = false;
    context.clearSession?.();
    render();
  }

  function render() {
    const sel = state.selectedRow;
    const canConfirm = sel >= 0 && state.selectedTake >= 1 && state.selectedTake <= (state.rows[sel] || 0);
    const myTurn = !state.winner && (!isAi || state.turn === HUMAN);
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${state.message}</strong>
          <p class="game-note">${context.labels?.mode || ""} · ${context.labels?.difficulty || ""} · 拿到最后一颗者负</p>
        </div>
        <div class="mini-stats">
          <span>剩 ${totalStones(state.rows)}</span>
          <span>步 ${state.moves}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:340px;margin:0 auto;">
          ${state.rows.map((count, i) => `
            <button type="button" data-row="${i}" ${count > 0 && myTurn ? "" : "disabled"}
              style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:42px;padding:8px 10px;border-radius:12px;border:2px solid ${i === sel ? "#f59e0b" : "rgba(148,163,184,.35)"};background:${i === sel ? "rgba(245,158,11,.12)" : "transparent"};cursor:${count > 0 && myTurn ? "pointer" : "default"};">
              ${Array.from({ length: count }, (_, k) => `<span style="width:20px;height:20px;border-radius:50%;background:${i === sel && k >= count - state.selectedTake ? "#f59e0b" : "#64748b"};"></span>`).join("") || '<span style="opacity:.4;">空</span>'}
            </button>
          `).join("")}
        </div>
        ${sel >= 0 ? `
        <div style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
          ${Array.from({ length: state.rows[sel] }, (_, k) => k + 1).map((n) => `
            <button type="button" data-take="${n}" class="secondary-button" style="min-width:40px;${n === state.selectedTake ? "outline:2px solid #f59e0b;" : ""}">${n}</button>
          `).join("")}
        </div>` : ""}
      </section>

      <section class="game-panel toolbar">
        <button class="primary-button" data-action="confirm" ${canConfirm && myTurn ? "" : "disabled"}>拿走 ${sel >= 0 ? state.selectedTake : ""}</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    root.querySelectorAll("[data-row]").forEach((b) => b.addEventListener("click", () => selectRow(Number(b.dataset.row))));
    root.querySelectorAll("[data-take]").forEach((b) => b.addEventListener("click", () => setTake(Number(b.dataset.take))));
    root.querySelector("[data-action='confirm']").addEventListener("click", () => {
      if (canConfirm) applyTake(sel, state.selectedTake);
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    scheduleAi();
  }

  render();

  return () => {
    disposed = true;
    clearTimeout(aiTimer);
  };
}
