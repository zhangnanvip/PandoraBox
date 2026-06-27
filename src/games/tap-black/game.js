const COLS = 4;
const VISIBLE_ROWS = 4;
const TOTAL_ROWS = 50;
const CELL_H = 88; // px, ≥80
const START_FALL = 720; // ms per row at start
const MIN_FALL = 240; // fastest

function makeRow(index) {
  return { black: Math.floor(Math.random() * COLS), tapped: -1, index };
}

function fallMsFor(cleared) {
  const t = Math.min(cleared / TOTAL_ROWS, 1);
  return Math.round(START_FALL - (START_FALL - MIN_FALL) * t);
}

export function mountTapBlack(root, context) {
  let disposed = false;
  let rows = [];
  let cleared = 0; // 已踩对的黑块数 = 得分
  let offset = 0; // 当前底排下移像素
  let startAt = 0;
  let elapsed = 0;
  let over = false;
  let reported = false;
  let rafId = 0;
  let lastTs = 0;

  function reset() {
    rows = Array.from({ length: VISIBLE_ROWS }, (_, i) => makeRow(VISIBLE_ROWS - 1 - i));
    cleared = 0;
    offset = 0;
    startAt = 0;
    elapsed = 0;
    over = false;
    reported = false;
    lastTs = 0;
  }

  function settle(win) {
    if (over) return;
    over = true;
    const score = cleared;
    const seconds = (elapsed / 1000).toFixed(1);
    if (!reported) {
      reported = true;
      context.reportResult?.({
        outcome: win ? "complete" : "score",
        detail: win ? `通关 50 行 · ${seconds}s` : `踩中 ${score} 块 · ${seconds}s`,
        score
      });
    }
    context.playSound?.(win ? "win" : "fail");
    render();
  }

  function advance() {
    cleared += 1;
    rows.shift();
    if (cleared >= TOTAL_ROWS) {
      settle(true);
      return;
    }
    rows.push(makeRow(cleared + VISIBLE_ROWS));
    offset = 0;
  }

  function tap(rowIndexFromBottom, col) {
    if (over) return;
    if (rowIndexFromBottom !== 0) return; // 只能踩最底一行
    const row = rows[0];
    if (!row || row.tapped >= 0) return;
    if (col === row.black) {
      row.tapped = col;
      context.playSound?.("move");
      advance();
      paintCells();
    } else {
      row.tapped = col;
      settle(false);
    }
  }

  function loop(ts) {
    if (disposed || over) return;
    if (!startAt) startAt = ts;
    if (!lastTs) lastTs = ts;
    if (context.isPaused?.()) {
      lastTs = ts;
      rafId = requestAnimationFrame(loop);
      return;
    }
    const dt = ts - lastTs;
    lastTs = ts;
    elapsed = ts - startAt;
    offset += (dt / fallMsFor(cleared)) * CELL_H;
    if (offset >= CELL_H) {
      // 底排未踩黑块即掉落 → 失败
      settle(false);
      return;
    }
    const stack = root.querySelector("[data-stack]");
    if (stack) stack.style.transform = `translateY(${offset}px)`;
    setTimer();
    rafId = requestAnimationFrame(loop);
  }

  function setTimer() {
    const t = root.querySelector("[data-time]");
    if (t) t.textContent = (elapsed / 1000).toFixed(1) + "s";
    const s = root.querySelector("[data-score]");
    if (s) s.textContent = String(cleared);
  }

  function restart() {
    reset();
    render();
  }

  function paintCells() {
    const board = root.querySelector("[data-board]");
    if (!board) return render();
    const rowEls = board.querySelectorAll("[data-row]");
    rows.forEach((row, i) => {
      const el = rowEls[i];
      if (!el) return;
      el.querySelectorAll("[data-col]").forEach((cell, c) => {
        const isBlack = c === row.black;
        cell.style.background = isBlack ? "#16181d" : "#f6f7fb";
        cell.style.borderColor = isBlack ? "#0c0d10" : "#dde0ea";
      });
    });
  }

  function render() {
    const seconds = (elapsed / 1000).toFixed(1);
    root.innerHTML = `
      <section class="game-panel game-status">
        <div>
          <strong>${over ? (cleared >= TOTAL_ROWS ? "全部踩中！" : "踩到白块了") : "别踩白块"}</strong>
          <p class="game-note">点最底排黑块上推 · ${context.labels?.mode || "单人"} · 共 ${TOTAL_ROWS} 行</p>
        </div>
        <div class="mini-stats">
          <span>分 <b data-score>${cleared}</b></span>
          <span><b data-time>${seconds}</b>s</span>
        </div>
      </section>

      <section class="board-wrap">
        <div style="position:relative;width:100%;max-width:360px;margin:0 auto;height:${VISIBLE_ROWS * CELL_H}px;overflow:hidden;border-radius:12px;background:#eceefb;touch-action:none;border:1px solid #d8dbe9;">
          <div data-board style="position:absolute;left:0;right:0;bottom:0;">
            <div data-stack style="display:flex;flex-direction:column;">
              ${rows.map((row, i) => `
                <div data-row style="display:grid;grid-template-columns:repeat(${COLS},1fr);gap:4px;padding:0 4px 4px;">
                  ${Array.from({ length: COLS }, (_, c) => `
                    <button type="button" data-r="${i}" data-col="${c}" aria-label="${i === 0 ? "底排第" + (c + 1) + "格" : "格"}"
                      style="height:${CELL_H - 4}px;border-radius:8px;border:1px solid ${c === row.black ? "#0c0d10" : "#dde0ea"};background:${c === row.black ? "#16181d" : "#f6f7fb"};touch-action:none;cursor:pointer;"></button>
                  `).join("")}
                </div>`).join("")}
            </div>
          </div>
          ${over ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(20,22,28,.55);color:#fff;font-weight:700;font-size:18px;">${cleared >= TOTAL_ROWS ? "通关 · " + seconds + "s" : "踩中 " + cleared + " 块"}</div>` : ""}
        </div>
      </section>

      <section class="game-panel toolbar">
        <button class="danger-button" data-action="restart">重开</button>
      </section>
    `;

    const board = root.querySelector("[data-board]");
    board.querySelectorAll("[data-col]").forEach((cell) => {
      cell.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        tap(Number(cell.dataset.r), Number(cell.dataset.col));
      });
    });
    root.querySelector("[data-action='restart']").addEventListener("click", restart);

    cancelAnimationFrame(rafId);
    if (!over && !disposed) {
      lastTs = 0;
      rafId = requestAnimationFrame(loop);
    }
  }

  reset();
  render();

  return () => {
    disposed = true;
    cancelAnimationFrame(rafId);
  };
}
