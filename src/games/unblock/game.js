import { loadState, removeState, saveState } from "../../utils/storage.js";

const SIZE = 6;
const EXIT_ROW = 2; // 红车出口固定在第 3 行（0 起）

// 每关：红车 id 必为 "red"，朝向 h，停在 EXIT_ROW，从右侧第 6 列离场。
// 坐标 x,y 为左上格；w/h 决定朝向（w>1 横向，h>1 纵向，长度 2 或 3）。
// 8 关由易到难，均为可解布局。
const LEVELS = [
  {
    title: "第 1 关 · 起步",
    target: 8,
    cars: [
      { id: "red", x: 1, y: 2, w: 2, h: 1 },
      { id: "a", x: 0, y: 0, w: 1, h: 2 },
      { id: "b", x: 3, y: 0, w: 1, h: 3 },
      { id: "c", x: 2, y: 4, w: 2, h: 1 }
    ]
  },
  {
    title: "第 2 关 · 错位",
    target: 12,
    cars: [
      { id: "red", x: 0, y: 2, w: 2, h: 1 },
      { id: "a", x: 2, y: 0, w: 1, h: 2 },
      { id: "b", x: 3, y: 1, w: 1, h: 3 },
      { id: "c", x: 4, y: 0, w: 1, h: 2 },
      { id: "d", x: 0, y: 4, w: 1, h: 2 },
      { id: "e", x: 1, y: 4, w: 2, h: 1 }
    ]
  },
  {
    title: "第 3 关 · 三车封口",
    target: 16,
    cars: [
      { id: "red", x: 0, y: 2, w: 2, h: 1 },
      { id: "a", x: 2, y: 0, w: 1, h: 2 },
      { id: "b", x: 3, y: 0, w: 1, h: 2 },
      { id: "c", x: 4, y: 0, w: 1, h: 2 },
      { id: "d", x: 5, y: 2, w: 1, h: 3 },
      { id: "e", x: 0, y: 4, w: 3, h: 1 }
    ]
  },
  {
    title: "第 4 关 · 双层",
    target: 20,
    cars: [
      { id: "red", x: 1, y: 2, w: 2, h: 1 },
      { id: "a", x: 0, y: 0, w: 2, h: 1 },
      { id: "b", x: 3, y: 0, w: 1, h: 3 },
      { id: "c", x: 4, y: 0, w: 2, h: 1 },
      { id: "d", x: 0, y: 3, w: 1, h: 2 },
      { id: "e", x: 2, y: 3, w: 1, h: 2 },
      { id: "f", x: 4, y: 4, w: 2, h: 1 }
    ]
  },
  {
    title: "第 5 关 · 缠绕",
    target: 26,
    cars: [
      { id: "red", x: 0, y: 2, w: 2, h: 1 },
      { id: "a", x: 2, y: 1, w: 1, h: 2 },
      { id: "b", x: 4, y: 2, w: 1, h: 2 },
      { id: "c", x: 5, y: 0, w: 1, h: 3 },
      { id: "d", x: 0, y: 0, w: 2, h: 1 },
      { id: "e", x: 0, y: 4, w: 1, h: 2 },
      { id: "f", x: 3, y: 0, w: 1, h: 2 },
      { id: "g", x: 1, y: 4, w: 2, h: 1 }
    ]
  },
  {
    title: "第 6 关 · 交叉",
    target: 30,
    cars: [
      { id: "red", x: 1, y: 2, w: 2, h: 1 },
      { id: "a", x: 0, y: 0, w: 1, h: 3 },
      { id: "b", x: 1, y: 0, w: 2, h: 1 },
      { id: "c", x: 3, y: 0, w: 1, h: 2 },
      { id: "d", x: 5, y: 1, w: 1, h: 3 },
      { id: "e", x: 3, y: 2, w: 1, h: 2 },
      { id: "f", x: 0, y: 3, w: 2, h: 1 },
      { id: "g", x: 1, y: 4, w: 2, h: 1 }
    ]
  },
  {
    title: "第 7 关 · 重围",
    target: 36,
    cars: [
      { id: "red", x: 1, y: 2, w: 2, h: 1 },
      { id: "a", x: 0, y: 0, w: 2, h: 1 },
      { id: "b", x: 2, y: 0, w: 1, h: 2 },
      { id: "c", x: 3, y: 0, w: 1, h: 3 },
      { id: "d", x: 4, y: 0, w: 1, h: 2 },
      { id: "e", x: 5, y: 0, w: 1, h: 3 },
      { id: "f", x: 0, y: 1, w: 1, h: 2 },
      { id: "g", x: 4, y: 3, w: 2, h: 1 },
      { id: "h", x: 0, y: 4, w: 2, h: 1 }
    ]
  },
  {
    title: "第 8 关 · 死局",
    target: 42,
    cars: [
      { id: "red", x: 1, y: 2, w: 2, h: 1 },
      { id: "a", x: 0, y: 0, w: 1, h: 2 },
      { id: "b", x: 1, y: 0, w: 2, h: 1 },
      { id: "c", x: 3, y: 0, w: 1, h: 2 },
      { id: "d", x: 4, y: 0, w: 2, h: 1 },
      { id: "e", x: 5, y: 1, w: 1, h: 2 },
      { id: "f", x: 0, y: 2, w: 1, h: 3 },
      { id: "g", x: 3, y: 2, w: 1, h: 2 },
      { id: "h", x: 4, y: 3, w: 1, h: 2 },
      { id: "i", x: 1, y: 4, w: 2, h: 1 }
    ]
  }
];

// 色块调色，红车始终醒目
const PALETTE = ["#facc15", "#34d399", "#60a5fa", "#c084fc", "#f97316", "#22d3ee", "#a3e635", "#fb7185", "#94a3b8"];

function totalLevels() {
  return LEVELS.length;
}

function clampLevel(idx) {
  if (!Number.isInteger(idx) || idx < 0) return 0;
  return idx >= LEVELS.length ? LEVELS.length - 1 : idx;
}

function initialState(levelIdx) {
  const idx = clampLevel(levelIdx);
  const level = LEVELS[idx];
  return {
    level: idx,
    cars: level.cars.map((car) => ({ ...car })),
    selected: "red",
    moves: 0,
    complete: false,
    cleared: false
  };
}

function isValidState(state) {
  if (!state || !Array.isArray(state.cars)) return false;
  const idx = state.level;
  if (!Number.isInteger(idx) || idx < 0 || idx >= LEVELS.length) return false;
  if (!state.cars.some((car) => car.id === "red")) return false;
  return state.cars.every(
    (car) => car.x >= 0 && car.y >= 0 && car.x + car.w <= SIZE && car.y + car.h <= SIZE
  );
}

function occupiedBy(cars, ignoreId) {
  const grid = new Map();
  cars.forEach((car) => {
    if (car.id === ignoreId) return;
    for (let y = car.y; y < car.y + car.h; y += 1) {
      for (let x = car.x; x < car.x + car.w; x += 1) {
        grid.set(`${x},${y}`, car.id);
      }
    }
  });
  return grid;
}

function canPlace(cars, car, nx, ny) {
  if (nx < 0 || ny < 0 || nx + car.w > SIZE || ny + car.h > SIZE) return false;
  const grid = occupiedBy(cars, car.id);
  for (let y = ny; y < ny + car.h; y += 1) {
    for (let x = nx; x < nx + car.w; x += 1) {
      if (grid.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

function maxSlide(cars, car, dir) {
  // dir: -1/+1 沿车朝向。返回该方向能滑动的最大格数。
  const horizontal = car.w > 1;
  let steps = 0;
  for (let n = 1; n <= SIZE; n += 1) {
    const nx = horizontal ? car.x + dir * n : car.x;
    const ny = horizontal ? car.y : car.y + dir * n;
    if (!canPlace(cars, car, nx, ny)) break;
    steps = n;
  }
  return steps;
}

function isSolved(state) {
  const red = state.cars.find((c) => c.id === "red");
  return red && red.x + red.w >= SIZE;
}

export function mountUnblock(root, context) {
  const difficulty = context?.difficulty || "medium";
  const storageKey = `unblock:${difficulty}`;
  let state = loadState(storageKey, initialState(0));
  if (!isValidState(state)) state = initialState(0);
  let resultReported = false;
  let drag = null; // { id, startX, startY, axis, origin, max, neg, cell }

  function save() {
    saveState(storageKey, state);
    context.saveSession?.(state, { stage: "play", level: state.level + 1, score: scoreFor() });
  }

  function scoreFor() {
    const target = LEVELS[state.level].target;
    return Math.max(20, target * 20 - state.moves * 5);
  }

  function report() {
    if (resultReported || !state.cleared) return;
    resultReported = true;
    context.reportResult?.({
      outcome: "complete",
      detail: `通关 ${totalLevels()} 关，最后用 ${state.moves} 步`,
      moves: state.moves,
      score: (state.level + 1) * 100
    });
    context.clearSession?.();
  }

  function selectedCar() {
    return state.cars.find((c) => c.id === state.selected) || state.cars[0];
  }

  function slide(car, delta) {
    if (state.complete) return;
    const horizontal = car.w > 1;
    const nx = horizontal ? car.x + delta : car.x;
    const ny = horizontal ? car.y : car.y + delta;
    if (!canPlace(state.cars, car, nx, ny)) return;
    car.x = nx;
    car.y = ny;
    state.selected = car.id;
    state.moves += 1;
    context.playSound?.("move");
    if (isSolved(state)) {
      state.complete = true;
      if (state.level + 1 >= LEVELS.length) {
        state.cleared = true;
        report();
      }
      context.playSound?.("win");
    }
    save();
    render();
  }

  function nextLevel() {
    if (state.cleared) {
      restart();
      return;
    }
    state = initialState(state.level + 1);
    resultReported = false;
    save();
    render();
  }

  function restart() {
    state = initialState(0);
    resultReported = false;
    removeState(storageKey);
    context.clearSession?.();
    render();
  }

  function replayLevel() {
    state = initialState(state.level);
    save();
    render();
  }

  function geom() {
    const board = root.querySelector(".unblock-board");
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    return { cell: rect.width / SIZE, left: rect.left, top: rect.top };
  }

  function beginDrag(id, px, py) {
    if (state.complete) return;
    const car = state.cars.find((c) => c.id === id);
    if (!car) return;
    const g = geom();
    if (!g) return;
    const horizontal = car.w > 1;
    drag = {
      id,
      px,
      py,
      horizontal,
      cell: g.cell,
      neg: maxSlide(state.cars, car, -1),
      pos: maxSlide(state.cars, car, 1),
      moved: false
    };
    state.selected = id;
  }

  function endDrag(px, py) {
    if (!drag) return;
    const car = state.cars.find((c) => c.id === drag.id);
    const wasMoved = drag.moved;
    if (car) {
      const dist = drag.horizontal ? px - drag.px : py - drag.py;
      let cells = Math.round(dist / drag.cell);
      cells = Math.max(-drag.neg, Math.min(drag.pos, cells));
      drag = null;
      if (cells !== 0) {
        slide(car, cells);
        return;
      }
    } else {
      drag = null;
    }
    // 仅点击未拖动：保留选中高亮
    if (!wasMoved) render();
  }

  function onMove(px, py) {
    if (!drag) return;
    if (Math.abs(px - drag.px) > 4 || Math.abs(py - drag.py) > 4) drag.moved = true;
  }

  function pointerUp(e) {
    endDrag(e.clientX, e.clientY);
  }
  function pointerMove(e) {
    onMove(e.clientX, e.clientY);
  }
  function touchEnd(e) {
    const t = e.changedTouches[0];
    if (t) endDrag(t.clientX, t.clientY);
  }
  function touchMove(e) {
    const t = e.touches[0];
    if (t) onMove(t.clientX, t.clientY);
  }

  function render() {
    const level = LEVELS[state.level];
    const car = selectedCar();
    const cleared = state.cleared;
    const won = state.complete;
    const head = cleared
      ? "全部通关，恭喜脱困！"
      : won
        ? `${level.title} 完成！${state.moves} 步`
        : "把红车开出右侧缺口";
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${head}</strong>
          <p class="game-note">${context.labels?.difficulty || difficulty} · ${level.title} · 目标 ${level.target} 步 · 滑动/点选移动</p>
        </div>
        <div class="mini-stats">
          <span>步数 ${state.moves}</span>
          <span>关卡 ${state.level + 1}/${totalLevels()}</span>
          <span>分 ${scoreFor()}</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="position:relative;width:100%;max-width:360px;margin:0 auto;">
          <div class="unblock-board" style="position:relative;width:100%;aspect-ratio:1;background:#1f2937;border-radius:12px;padding:0;display:grid;grid-template-columns:repeat(${SIZE},1fr);grid-template-rows:repeat(${SIZE},1fr);gap:0;overflow:hidden;touch-action:none;">
            ${Array.from({ length: SIZE * SIZE }, () => `<div style="border:1px solid rgba(255,255,255,.05);"></div>`).join("")}
            ${state.cars.map((c, i) => carHtml(c, i)).join("")}
          </div>
          <div style="position:absolute;right:-6px;top:${(EXIT_ROW * 100) / SIZE}%;height:${100 / SIZE}%;width:8px;background:#ef4444;border-radius:4px;"></div>
        </div>
      </section>

      <section class="game-panel toolbar">
        ${won ? `<button class="primary-button" data-action="next">${cleared ? "再玩一轮" : "下一关"}</button>` : ""}
        <button class="secondary-button" data-action="replay">本关重摆</button>
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    const board = root.querySelector(".unblock-board");
    board.querySelectorAll("[data-car]").forEach((el) => {
      el.addEventListener("pointerdown", (e) => {
        beginDrag(el.dataset.car, e.clientX, e.clientY);
        el.setPointerCapture?.(e.pointerId);
      });
    });
    root.querySelector("[data-action='replay']").addEventListener("click", replayLevel);
    root.querySelector("[data-action='restart']").addEventListener("click", restart);
    const nextBtn = root.querySelector("[data-action='next']");
    if (nextBtn) nextBtn.addEventListener("click", nextLevel);
  }

  function carHtml(c, i) {
    const isRed = c.id === "red";
    const color = isRed ? "#ef4444" : PALETTE[i % PALETTE.length];
    const pct = (v) => `calc(${(v * 100) / SIZE}% )`;
    return `<button data-car="${c.id}" class="${c.id === state.selected ? "is-selected" : ""}"
      style="position:absolute;left:${pct(c.x)};top:${pct(c.y)};width:calc(${(c.w * 100) / SIZE}% - 6px);height:calc(${(c.h * 100) / SIZE}% - 6px);margin:3px;background:${color};border:none;border-radius:9px;cursor:grab;box-shadow:inset 0 -3px 6px rgba(0,0,0,.25)${c.id === state.selected ? ",0 0 0 3px #fff" : ""};touch-action:none;font-size:11px;color:#1f2937;font-weight:700;">${isRed ? "红" : ""}</button>`;
  }

  window.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("touchmove", touchMove, { passive: true });
  window.addEventListener("touchend", touchEnd);
  render();
  report();
  return () => {
    window.removeEventListener("pointermove", pointerMove);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("touchmove", touchMove);
    window.removeEventListener("touchend", touchEnd);
  };
}
