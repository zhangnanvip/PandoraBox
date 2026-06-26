import { loadState, removeState, saveState } from "../../utils/storage.js";
import { choice, clamp } from "../../utils/random.js";

// 难度 → 棋盘边长 + 打乱步数。devil 同 5x5 但重度打乱。
const SETTINGS = {
  easy: { size: 3, shuffle: 60 },
  medium: { size: 4, shuffle: 200 },
  hard: { size: 5, shuffle: 400 },
  devil: { size: 5, shuffle: 1200 }
};

function settingsFor(context) {
  const fromOptions = Number(context?.options?.boardSize);
  const base = SETTINGS[context?.difficulty] || SETTINGS.easy;
  const size = clamp(Number.isFinite(fromOptions) && fromOptions ? fromOptions : base.size, 3, 5);
  return { size, shuffle: base.shuffle };
}

// 已排好序的盘面: 1..n²-1 顺次, 0 代表空格在最后。
function solvedTiles(size) {
  const tiles = [];
  for (let i = 1; i < size * size; i += 1) tiles.push(i);
  tiles.push(0);
  return tiles;
}

function isSolved(tiles) {
  for (let i = 0; i < tiles.length - 1; i += 1) {
    if (tiles[i] !== i + 1) return false;
  }
  return tiles[tiles.length - 1] === 0;
}

function neighbors(blank, size) {
  const row = Math.floor(blank / size);
  const col = blank % size;
  const out = [];
  if (row > 0) out.push(blank - size);
  if (row < size - 1) out.push(blank + size);
  if (col > 0) out.push(blank - 1);
  if (col < size - 1) out.push(blank + 1);
  return out;
}

// 从已排序盘面反复随机滑动空格, 必然可解。避免立即回退保证打乱充分。
function scramble(size, steps) {
  const tiles = solvedTiles(size);
  let blank = tiles.length - 1;
  let last = -1;
  for (let i = 0; i < steps; i += 1) {
    const options = neighbors(blank, size).filter((n) => n !== last);
    const next = choice(options.length ? options : neighbors(blank, size));
    [tiles[blank], tiles[next]] = [tiles[next], tiles[blank]];
    last = blank;
    blank = next;
  }
  return isSolved(tiles) ? scramble(size, steps + 4) : tiles;
}

function isValidSnapshot(snap, size) {
  return snap
    && Array.isArray(snap.tiles)
    && snap.tiles.length === size * size
    && Number.isFinite(snap.moves)
    && Number.isFinite(snap.elapsed);
}

export function mountFifteen(root, context) {
  const { size, shuffle: shuffleSteps } = settingsFor(context);
  const total = size * size;
  const storageKey = `fifteen:${size}:${context?.mode || "solo"}`;

  function freshState() {
    return { tiles: scramble(size, shuffleSteps), moves: 0, elapsed: 0 };
  }

  const snapshot = (context?.savedState && isValidSnapshot(context.savedState, size))
    ? context.savedState
    : (() => {
        const legacy = loadState(storageKey, null);
        return isValidSnapshot(legacy, size) ? legacy : null;
      })();

  let tiles = snapshot ? [...snapshot.tiles] : [];
  let moves = snapshot ? snapshot.moves : 0;
  let elapsed = snapshot ? snapshot.elapsed : 0;
  if (!tiles.length) {
    const s = freshState();
    tiles = s.tiles;
  }

  let done = isSolved(tiles);
  let reported = false;
  let startTs = Date.now();
  let timer = 0;
  let disposed = false;

  const blankIndex = () => tiles.indexOf(0);
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const elapsedMs = () => elapsed + (done ? 0 : Date.now() - startTs);

  function persist() {
    const snap = { tiles: [...tiles], moves, elapsed: elapsedMs(), size };
    saveState(storageKey, snap);
    if (done) {
      context?.clearSession?.();
    } else if (context?.saveSession) {
      context.saveSession(snap, { stage: `${size}×${size} · ${moves} 步`, level: moves, score: moves });
    }
  }

  function reportDone() {
    if (reported) return;
    reported = true;
    const seconds = Math.max(1, Math.round(elapsedMs() / 1000));
    const score = Math.max(50, Math.round(size * size * 400 - moves * 6 - seconds * 2));
    context?.reportResult?.({ outcome: "complete", detail: `${moves} 步 · ${fmt(elapsedMs())}`, score, moves });
  }

  function tryMove(index) {
    if (done) return;
    const blank = blankIndex();
    if (!neighbors(blank, size).includes(index)) return;
    [tiles[blank], tiles[index]] = [tiles[index], tiles[blank]];
    moves += 1;
    context?.playSound?.("move");
    if (isSolved(tiles)) {
      done = true;
      elapsed = elapsedMs();
      context?.playSound?.("win");
      reportDone();
    }
    persist();
    render();
  }

  function newGame() {
    const s = freshState();
    tiles = s.tiles;
    moves = 0;
    elapsed = 0;
    done = false;
    reported = false;
    startTs = Date.now();
    removeState(storageKey);
    context?.clearSession?.();
    render();
  }

  function tick() {
    if (disposed || done) return;
    const el = root.querySelector("[data-time]");
    if (el) el.textContent = fmt(elapsedMs());
  }

  function render() {
    const cell = clamp(Math.floor(320 / size), 48, 96);
    const gap = size >= 5 ? 6 : 8;
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${done ? "已还原！" : "数字华容道"}</strong>
          <p class="game-note">${context?.labels?.mode || "单人挑战"} · ${context?.labels?.difficulty || `${size}×${size}`} · 把数字滑到顺序</p>
        </div>
        <div class="mini-stats">
          <span>步 ${moves}</span>
          <span data-time>${fmt(elapsedMs())}</span>
        </div>
      </section>
      <section class="board-wrap">
        <div data-board style="display:grid;grid-template-columns:repeat(${size},${cell}px);gap:${gap}px;justify-content:center;margin:0 auto;max-width:100%;">
          ${tiles.map((v, i) => v === 0
            ? `<div style="width:${cell}px;height:${cell}px;border-radius:10px;background:rgba(255,255,255,0.04);"></div>`
            : `<button type="button" data-tile="${i}" style="width:${cell}px;height:${cell}px;border:0;border-radius:10px;cursor:pointer;font-size:${Math.round(cell * 0.42)}px;font-weight:700;color:#0c111b;background:linear-gradient(160deg,#7cd4ff,#4a9bff);box-shadow:0 4px 10px rgba(0,0,0,0.25);transition:transform .08s;">${v}</button>`
          ).join("")}
        </div>
      </section>
      <section class="game-panel toolbar">
        <button class="primary-button" data-action="restart">重开</button>
        <button class="secondary-button" data-action="shuffle">打乱</button>
      </section>
    `;
    root.querySelectorAll("[data-tile]").forEach((btn) => {
      btn.addEventListener("click", () => { btn.blur(); tryMove(Number(btn.dataset.tile)); });
    });
    root.querySelector("[data-action='restart']")?.addEventListener("click", newGame);
    root.querySelector("[data-action='shuffle']")?.addEventListener("click", newGame);
  }

  if (done) reported = true; // 续玩恢复到已解状态时不重复上报
  render();
  persist();
  timer = window.setInterval(tick, 1000);

  return () => {
    disposed = true;
    clearInterval(timer);
  };
}
