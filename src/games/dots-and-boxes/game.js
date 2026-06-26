import { choice, clamp, shuffle } from "../../utils/random.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const HUMAN = "human";
const AI = "ai";

const PLAYER_LABEL = { human: "你", ai: "电脑", p1: "蓝", p2: "红" };
const PLAYER_COLOR = { human: "#3b82f6", ai: "#ef4444", p1: "#3b82f6", p2: "#ef4444" };

function sizeForDifficulty(difficulty) {
  if (difficulty === "easy") return 4;
  if (difficulty === "hard" || difficulty === "devil") return 6;
  return 5; // medium / default
}

function edgeCount(boxes) {
  // boxes = number of cells per side; dots = boxes + 1
  const dots = boxes + 1;
  const h = dots * boxes; // horizontal edges
  const v = boxes * dots; // vertical edges
  return h + v;
}

// Edge indexing: horizontal edges first, then vertical.
// horizontal: row in [0..dots-1], col in [0..boxes-1] -> r*boxes + c
// vertical:   row in [0..boxes-1], col in [0..dots-1] -> HCOUNT + r*dots + c
function edgesForBox(boxes, r, c) {
  const dots = boxes + 1;
  const hCount = dots * boxes;
  const top = r * boxes + c;
  const bottom = (r + 1) * boxes + c;
  const left = hCount + r * dots + c;
  const right = hCount + r * dots + (c + 1);
  return [top, bottom, left, right];
}

function initialState(boxes, mode) {
  return {
    boxes,
    edges: Array(edgeCount(boxes)).fill(false),
    owners: Array(boxes * boxes).fill(""), // HUMAN/AI/p1/p2
    turn: mode === "ai" ? HUMAN : "p1",
    scores: mode === "ai" ? { human: 0, ai: 0 } : { p1: 0, p2: 0 },
    winner: "",
    moves: 0
  };
}

function isValidState(state, boxes) {
  return state
    && state.boxes === boxes
    && Array.isArray(state.edges) && state.edges.length === edgeCount(boxes)
    && Array.isArray(state.owners) && state.owners.length === boxes * boxes;
}

function boxSides(edges, boxes, r, c) {
  return edgesForBox(boxes, r, c).reduce((n, e) => n + (edges[e] ? 1 : 0), 0);
}

function freeEdges(state) {
  const out = [];
  for (let i = 0; i < state.edges.length; i += 1) if (!state.edges[i]) out.push(i);
  return out;
}

// boxes touched by drawing edge i; return list of {idx,sides-after}
function boxesForEdge(boxes, idx) {
  const dots = boxes + 1;
  const hCount = dots * boxes;
  const out = [];
  if (idx < hCount) {
    const r = Math.floor(idx / boxes);
    const c = idx % boxes;
    if (r > 0) out.push((r - 1) * boxes + c); // box above
    if (r < boxes) out.push(r * boxes + c); // box below
  } else {
    const v = idx - hCount;
    const r = Math.floor(v / dots);
    const c = v % dots;
    if (c > 0) out.push(r * boxes + (c - 1)); // box left
    if (c < boxes) out.push(r * boxes + c); // box right
  }
  return out;
}

// How many boxes drawing edge i completes (already 3 sides -> 4)
function completesCount(state, idx) {
  let n = 0;
  for (const b of boxesForEdge(state.boxes, idx)) {
    const r = Math.floor(b / state.boxes);
    const c = b % state.boxes;
    if (boxSides(state.edges, state.boxes, r, c) === 3) n += 1;
  }
  return n;
}

// Edges that do NOT create a 3-sided box for opponent
function safeEdges(state, list) {
  return list.filter((idx) => {
    for (const b of boxesForEdge(state.boxes, idx)) {
      const r = Math.floor(b / state.boxes);
      const c = b % state.boxes;
      if (boxSides(state.edges, state.boxes, r, c) === 2) return false;
    }
    return true;
  });
}

function chooseAiMove(state, difficulty) {
  const free = freeEdges(state);
  if (!free.length) return -1;
  if (difficulty === "easy") return choice(free);

  // capture: take any edge that completes a box
  const captures = free.filter((i) => completesCount(state, i) > 0);
  if (captures.length) {
    // prefer move completing the most boxes
    captures.sort((a, b) => completesCount(state, b) - completesCount(state, a));
    return captures[0];
  }

  // safe move: doesn't hand opponent a box
  const safe = shuffle(safeEdges(state, free));
  if (safe.length) return safe[0];

  // hard/devil: chain-aware — sacrifice the smallest chain
  if (difficulty === "hard" || difficulty === "devil") {
    let bestIdx = -1;
    let bestCost = Infinity;
    for (const i of free) {
      const cost = completesCount(state, i); // 1 or 2 boxes given away now
      if (cost < bestCost) { bestCost = cost; bestIdx = i; }
    }
    if (bestIdx >= 0) return bestIdx;
  }
  return choice(free);
}

export function mountDotsBoxes(root, context) {
  const mode = context.mode === "local" ? "local" : "ai";
  const difficulty = context.difficulty || "medium";
  const optSize = Number(context.options?.boardSize);
  const boxes = clamp(Number.isFinite(optSize) ? optSize : sizeForDifficulty(difficulty), 4, 6);
  const storageKey = `dotsbox:${mode}:${boxes}`;

  function restore(snap) {
    if (!isValidState(snap, boxes)) return null;
    const fresh = initialState(boxes, mode);
    return { ...fresh, ...snap, edges: [...snap.edges], owners: [...snap.owners], scores: { ...snap.scores } };
  }

  let state = restore(context.savedState) || restore(loadState(storageKey, null)) || initialState(boxes, mode);
  let disposed = false;
  let aiTimer = 0;
  let reported = false;

  function activePlayer() { return mode === "ai" ? (state.turn === HUMAN ? HUMAN : AI) : state.turn; }
  function nextTurn() { return mode === "ai" ? (state.turn === HUMAN ? AI : HUMAN) : (state.turn === "p1" ? "p2" : "p1"); }

  function save() {
    saveState(storageKey, state);
    if (context.saveSession && !state.winner) {
      const total = state.boxes * state.boxes;
      const taken = state.owners.filter(Boolean).length;
      context.saveSession(state, { stage: `进行中 · ${taken}/${total}`, level: state.boxes, score: taken });
    } else if (context.clearSession && state.winner) {
      context.clearSession();
    }
  }

  function reportResult() {
    if (reported || !state.winner) return;
    reported = true;
    const keys = Object.keys(state.scores);
    const mine = mode === "ai" ? state.scores.human : Math.max(state.scores.p1, state.scores.p2);
    let outcome = "complete";
    if (mode === "ai") {
      outcome = state.winner === "draw" ? "draw" : state.winner === HUMAN ? "win" : "loss";
    }
    context.reportResult?.({ outcome, detail: state.winner === "draw" ? "平局" : `${PLAYER_LABEL[state.winner]}获胜`, score: mine, moves: state.moves });
  }

  function checkEnd() {
    if (state.owners.every(Boolean)) {
      const [a, b] = Object.keys(state.scores);
      state.winner = state.scores[a] === state.scores[b] ? "draw" : state.scores[a] > state.scores[b] ? a : b;
    }
  }

  function play(idx) {
    if (state.winner || state.edges[idx]) return false;
    const me = activePlayer();
    state.edges[idx] = true;
    state.moves += 1;
    let gained = 0;
    for (const b of boxesForEdge(boxes, idx)) {
      const r = Math.floor(b / boxes);
      const c = b % boxes;
      if (boxSides(state.edges, boxes, r, c) === 4 && !state.owners[b]) { state.owners[b] = me; gained += 1; }
    }
    if (gained) state.scores[me] += gained;
    else state.turn = nextTurn();
    checkEnd();
    save();
    render();
    return true;
  }

  function restart() {
    state = initialState(boxes, mode);
    reported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    if (disposed || mode !== "ai" || activePlayer() !== AI || state.winner) return;
    aiTimer = window.setTimeout(() => {
      if (disposed) return;
      const m = chooseAiMove(state, difficulty);
      if (m >= 0) play(m);
    }, 260);
  }

  function render() {
    const dots = boxes + 1;
    const gap = boxes >= 6 ? 46 : 56;
    const pad = 20;
    const dim = pad * 2 + (dots - 1) * gap;
    const me = activePlayer();
    const turnLabel = mode === "ai" && me === AI && !state.winner ? "电脑思考中…" : `轮到 ${PLAYER_LABEL[state.turn]}`;
    const title = state.winner ? (state.winner === "draw" ? "平局" : `${PLAYER_LABEL[state.winner]} 胜`) : turnLabel;
    const keys = Object.keys(state.scores);

    const hCount = dots * boxes;
    let edgeSvg = "";
    for (let i = 0; i < state.edges.length; i += 1) {
      let x1, y1, x2, y2;
      if (i < hCount) {
        const r = Math.floor(i / boxes), c = i % boxes;
        x1 = pad + c * gap; y1 = pad + r * gap; x2 = pad + (c + 1) * gap; y2 = y1;
      } else {
        const v = i - hCount, r = Math.floor(v / dots), c = v % dots;
        x1 = pad + c * gap; y1 = pad + r * gap; x2 = x1; y2 = pad + (r + 1) * gap;
      }
      const on = state.edges[i];
      const stroke = on ? "#cbd5f5" : "rgba(148,163,184,.18)";
      edgeSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${on ? 5 : 14}" stroke-linecap="round" data-edge="${i}" style="cursor:${on || state.winner ? "default" : "pointer"};${on ? "" : "opacity:.5"}"></line>`;
    }
    let boxSvg = "";
    for (let b = 0; b < boxes * boxes; b += 1) {
      const o = state.owners[b];
      if (!o) continue;
      const r = Math.floor(b / boxes), c = b % boxes;
      boxSvg += `<rect x="${pad + c * gap + 4}" y="${pad + r * gap + 4}" width="${gap - 8}" height="${gap - 8}" rx="6" fill="${PLAYER_COLOR[o]}22"></rect><text x="${pad + c * gap + gap / 2}" y="${pad + r * gap + gap / 2 + 6}" text-anchor="middle" font-size="16" fill="${PLAYER_COLOR[o]}" font-weight="700">${PLAYER_LABEL[o]}</text>`;
    }
    let dotSvg = "";
    for (let r = 0; r < dots; r += 1) for (let c = 0; c < dots; c += 1) dotSvg += `<circle cx="${pad + c * gap}" cy="${pad + r * gap}" r="4" fill="#94a3b8"></circle>`;

    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${title}</strong>
          <p class="game-note">${context.labels.mode} · ${context.labels.difficulty} · ${boxes}×${boxes}</p>
        </div>
        <div class="mini-stats">
          ${keys.map((k) => `<span style="color:${PLAYER_COLOR[k]}">${PLAYER_LABEL[k]} ${state.scores[k]}</span>`).join("")}
        </div>
      </section>
      <section class="board-wrap" style="display:flex;justify-content:center;">
        <svg viewBox="0 0 ${dim} ${dim}" style="width:100%;max-width:380px;height:auto;touch-action:manipulation;" aria-label="点格棋棋盘">
          ${boxSvg}${edgeSvg}${dotSvg}
        </svg>
      </section>
      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    if (!state.winner && me !== AI) {
      root.querySelectorAll("[data-edge]").forEach((el) => {
        el.addEventListener("click", () => play(Number(el.dataset.edge)));
      });
    }
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    scheduleAi();
  }

  render();

  return () => { disposed = true; clearTimeout(aiTimer); };
}
