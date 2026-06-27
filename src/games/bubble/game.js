import { choice, clamp } from "../../utils/random.js";

// 内核 320 宽，留边后移动端 < 340px
const COLS = 8; // 偶数行 8 格，奇数行 7 格（缩进半格）
const R = 18; // 泡泡半径
const D = R * 2; // 直径 = 列宽
const W = COLS * D; // 320
const ROW_H = Math.round(R * Math.sqrt(3)); // 六边形行距 ≈31
const TOP_ROWS = 12; // 棋盘可见行数
const H = ROW_H * TOP_ROWS + D + 64; // 顶部网格 + 发射台
const LAUNCH_Y = H - 40; // 发射器中心
const SPEED = 520; // 子弹基础速度 px/s
const MIN_ANGLE = -75 * Math.PI / 180; // 瞄准角度上限（避免水平）
const MAX_ANGLE = 75 * Math.PI / 180;

const PALETTE = ["#ff5d5d", "#34d6e8", "#f5d23a", "#5ce86a", "#b86bff", "#ff9b3a"];

const DIFFS = {
  easy: { colors: 3, rows: 4, descend: 22 },
  medium: { colors: 4, rows: 5, descend: 16 },
  hard: { colors: 5, rows: 6, descend: 11 },
  devil: { colors: 6, rows: 7, descend: 7 }
};

function config(difficulty) {
  return DIFFS[difficulty] || DIFFS.medium;
}

function rowCols(row) {
  return row % 2 === 0 ? COLS : COLS - 1;
}

// 格心坐标（偏移坐标系：奇数行右移半格）
function cellCenter(row, col) {
  const offset = row % 2 === 0 ? R : D; // 偶行从 R 起，奇行缩进半格
  return { x: offset + col * D, y: R + 8 + row * ROW_H };
}

function colorsFor(cfg) {
  return PALETTE.slice(0, cfg.colors);
}

function makeGrid(cfg) {
  const colors = colorsFor(cfg);
  const grid = [];
  for (let r = 0; r < cfg.rows; r += 1) {
    const row = [];
    for (let c = 0; c < rowCols(r); c += 1) row.push(choice(colors));
    grid.push(row);
  }
  return grid;
}

function initialState(cfg) {
  const colors = colorsFor(cfg);
  return {
    grid: makeGrid(cfg),
    pushOffset: 0, // 整盘下沉像素
    shooter: choice(colors),
    queued: choice(colors),
    shots: 0,
    score: 0,
    over: false,
    won: false,
    message: "瞄准发射，3 颗同色即爆"
  };
}

function gridBottomY(state) {
  return R + 8 + state.grid.length * ROW_H + state.pushOffset;
}

function neighbors(grid, r, c) {
  const odd = r % 2 !== 0;
  const cand = odd
    ? [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
    : [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
  return cand.filter(([nr, nc]) => grid[nr] && grid[nr][nc]);
}

function clusterSameColor(grid, r, c, color) {
  const seen = new Set([`${r},${c}`]);
  const stack = [[r, c]];
  const out = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    for (const [nr, nc] of neighbors(grid, cr, cc)) {
      const key = `${nr},${nc}`;
      if (seen.has(key) || grid[nr][nc] !== color) continue;
      seen.add(key);
      out.push([nr, nc]);
      stack.push([nr, nc]);
    }
  }
  return out;
}

// 移除悬空（不与顶行连通）的泡泡
function dropFloaters(grid) {
  const safe = new Set();
  const stack = [];
  for (let c = 0; c < (grid[0] ? grid[0].length : 0); c += 1) {
    if (grid[0][c]) { stack.push([0, c]); safe.add(`0,${c}`); }
  }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(grid, r, c)) {
      const key = `${nr},${nc}`;
      if (safe.has(key)) continue;
      safe.add(key);
      stack.push([nr, nc]);
    }
  }
  let dropped = 0;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (grid[r][c] && !safe.has(`${r},${c}`)) { grid[r][c] = null; dropped += 1; }
    }
  }
  return dropped;
}

function gridEmpty(grid) {
  return grid.every((row) => row.every((cell) => !cell));
}

// 寻找子弹应吸附的最近空格（在已存在泡泡周围）
function snapTarget(state, x, y) {
  let best = null;
  let bestDist = Infinity;
  const rows = state.grid.length + 1; // 允许在底部新开一行
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      if (state.grid[r] && state.grid[r][c]) continue;
      const ctr = cellCenter(r, c);
      const dist = (ctr.x - x) ** 2 + (ctr.y + state.pushOffset - y) ** 2;
      if (dist < bestDist) { bestDist = dist; best = { r, c }; }
    }
  }
  return best;
}

export function mountBubble(root, context) {
  const cfg = config(context.difficulty);
  let state = initialState(cfg);
  const colors = colorsFor(cfg);
  let ball = null; // 飞行中的子弹 {x,y,vx,vy,color}
  let aim = -Math.PI / 2; // 当前瞄准角（向上）
  let raf = 0;
  let last = 0;
  let reported = false;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels?.mode || "单人挑战"} · ${context.labels?.difficulty || ""} · 触底即负</p>
      </div>
      <div class="mini-stats">
        <span data-score>分 0</span>
        <span data-shots>发射 0</span>
      </div>
    </section>
    <section class="board-wrap" style="display:flex;justify-content:center;">
      <canvas data-board width="${W}" height="${H}" style="background:rgba(0,0,0,.35);border-radius:10px;touch-action:none;max-width:100%;cursor:crosshair;" aria-label="泡泡龙"></canvas>
    </section>
    <section class="game-panel toolbar">
      <button class="danger-button" data-ctrl="restart">重开</button>
    </section>
  `;

  const cv = root.querySelector("[data-board]");
  const ctx = cv.getContext("2d");
  const elStatus = root.querySelector("[data-status]");
  const elScore = root.querySelector("[data-score]");
  const elShots = root.querySelector("[data-shots]");

  function descendStep() {
    state.pushOffset += ROW_H;
    if (gridBottomY(state) >= LAUNCH_Y - R) endGame(false);
  }

  let sinceDescend = 0;

  function endGame(won) {
    if (reported) return;
    reported = true;
    state.over = true;
    state.won = won;
    state.message = won ? "全部清空，过关" : "泡泡触底，挑战结束";
    context.clearSession?.();
    context.reportResult?.({ outcome: "score", score: state.score, detail: state.message });
  }

  function fire() {
    if (ball || state.over) return;
    ball = { x: W / 2, y: LAUNCH_Y, vx: Math.cos(aim) * SPEED, vy: Math.sin(aim) * SPEED, color: state.shooter };
    state.shooter = state.queued;
    state.queued = choice(colors);
    state.shots += 1;
    context.playSound?.("move");
  }

  function settle(r, c, color) {
    if (!state.grid[r]) state.grid[r] = Array(rowCols(r)).fill(null);
    state.grid[r][c] = color;
    const cluster = clusterSameColor(state.grid, r, c, color);
    if (cluster.length >= 3) {
      cluster.forEach(([cr, cc]) => { state.grid[cr][cc] = null; });
      const dropped = dropFloaters(state.grid);
      state.score += cluster.length * 10 + dropped * 20;
      state.message = `消除 ${cluster.length} 颗${dropped ? `，连锁 ${dropped}` : ""}`;
      context.playSound?.("score");
    } else {
      state.message = "未成 3 连，继续";
    }
    if (gridEmpty(state.grid)) endGame(true);
    else if (gridBottomY(state) >= LAUNCH_Y - R) endGame(false);
  }

  function step(dt) {
    if (!ball) return;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); }
    let stop = false;
    if (ball.y <= R + 8 + state.pushOffset) stop = true;
    for (let r = 0; r < state.grid.length && !stop; r += 1) {
      for (let c = 0; c < state.grid[r].length; c += 1) {
        if (!state.grid[r][c]) continue;
        const ctr = cellCenter(r, c);
        if ((ctr.x - ball.x) ** 2 + (ctr.y + state.pushOffset - ball.y) ** 2 < (D * 0.86) ** 2) { stop = true; break; }
      }
    }
    if (stop) {
      const t = snapTarget(state, ball.x, ball.y);
      const color = ball.color;
      ball = null;
      if (t) settle(t.r, t.c, color);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let r = 0; r < state.grid.length; r += 1) {
      for (let c = 0; c < state.grid[r].length; c += 1) {
        const color = state.grid[r][c];
        if (!color) continue;
        const ctr = cellCenter(r, c);
        drawBubble(ctr.x, ctr.y + state.pushOffset, color);
      }
    }
    // 触底警戒线
    ctx.strokeStyle = "rgba(255,80,80,.5)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, LAUNCH_Y - R);
    ctx.lineTo(W, LAUNCH_Y - R);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!state.over) {
      ctx.strokeStyle = "rgba(255,255,255,.4)";
      ctx.beginPath();
      ctx.moveTo(W / 2, LAUNCH_Y);
      ctx.lineTo(W / 2 + Math.cos(aim) * 70, LAUNCH_Y + Math.sin(aim) * 70);
      ctx.stroke();
    }
    drawBubble(W / 2, LAUNCH_Y, state.shooter);
    drawBubble(W / 2 + 44, LAUNCH_Y + 8, state.queued, 0.6);
    if (ball) drawBubble(ball.x, ball.y, ball.color);
    elStatus.textContent = state.message;
    elScore.textContent = `分 ${state.score}`;
    elShots.textContent = `发射 ${state.shots}`;
  }

  function drawBubble(x, y, color, scale = 1) {
    const rr = R * scale - 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function aimTo(clientX, clientY) {
    const rect = cv.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * W;
    const y = (clientY - rect.top) / rect.height * H;
    const raw = Math.atan2(y - LAUNCH_Y, x - W / 2);
    aim = clamp(raw, -Math.PI / 2 + MIN_ANGLE, -Math.PI / 2 + MAX_ANGLE); // 上方 ±75°
  }

  function restart() {
    state = initialState(cfg);
    ball = null;
    aim = -Math.PI / 2;
    sinceDescend = 0;
    reported = false;
    draw();
  }

  function onMove(e) { aimTo(e.clientX, e.clientY); }
  function onDown(e) { e.preventDefault(); aimTo(e.clientX, e.clientY); fire(); }
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerdown", onDown);
  root.querySelector("[data-ctrl=restart]").addEventListener("click", (e) => { e.currentTarget.blur(); restart(); });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.over && !context.isPaused?.()) {
      step(dt);
      sinceDescend += dt;
      if (!ball && sinceDescend >= cfg.descend) { sinceDescend = 0; descendStep(); }
    }
    draw();
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    cv.removeEventListener("pointermove", onMove);
    cv.removeEventListener("pointerdown", onDown);
  };
}
