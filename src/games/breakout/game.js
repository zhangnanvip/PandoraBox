import { bindVirtualJoystick, joystickMarkup } from "../arcade/controls.js";
import { addBurst, classicArcade, drawBall, drawBreakoutBackdrop, drawBreakoutBrick, drawEffects, drawPaddle, drawPowerup, shakeOffset, updateEffects } from "../arcade/classic-visuals.js";

const W = 360;
const H = 360;
const CONFIG = {
  easy: { rows: 4, speed: 142, paddle: 86, lives: 4 },
  medium: { rows: 5, speed: 162, paddle: 76, lives: 3 },
  hard: { rows: 6, speed: 184, paddle: 66, lives: 3 },
  devil: { rows: 7, speed: 210, paddle: 58, lives: 2 }
};

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeBricks(rows) {
  const bricks = [];
  const cols = 8;
  const gap = 4;
  const bw = (W - 32 - gap * (cols - 1)) / cols;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      bricks.push({ x: 16 + x * (bw + gap), y: 34 + y * 18, w: bw, h: 13, hp: y < 2 ? 1 : 2, row: y });
    }
  }
  return bricks;
}

function initialState(config) {
  return {
    paddle: { x: W / 2, y: H - 34, w: config.paddle, baseW: config.paddle },
    ball: { x: W / 2, y: H - 56, vx: config.speed * 0.56, vy: -config.speed },
    bricks: makeBricks(config.rows),
    powerups: [],
    buffs: { expand: 0, slow: 0 },
    lives: config.lives,
    score: 0,
    time: 0,
    over: false,
    won: false,
    message: "接住弹球",
    effects: [],
    shake: 0
  };
}

function spawnPowerup(state, brick) {
  if (Math.random() > 0.32 && state.bricks.length % 7 !== 0) return;
  const types = ["expand", "slow", "life"];
  state.powerups.push({
    type: types[Math.floor(Math.random() * types.length)],
    x: brick.x + brick.w / 2,
    y: brick.y + brick.h / 2,
    vy: 58,
    ttl: 8
  });
}

function applyPowerup(state, item, context) {
  if (item.type === "expand") {
    state.buffs.expand = 9;
    state.message = "扩展挡板：接球范围增加";
  } else if (item.type === "slow") {
    state.buffs.slow = 7;
    state.message = "慢速力场：球速降低";
  } else {
    state.lives = Math.min(5, state.lives + 1);
    state.message = "备用球：生命 +1";
  }
  addBurst(state.effects, item.x, item.y, { count: 16, color: classicArcade.green, secondary: classicArcade.yellow, speed: 72, radius: 10 });
  context.playSound?.("score");
}

function resetBall(state, config) {
  state.ball = { x: state.paddle.x, y: H - 56, vx: config.speed * (Math.random() < 0.5 ? -0.52 : 0.52), vy: -config.speed };
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "砖阵清空" : "弹球落尽";
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    detail: state.message,
    score: state.score,
    moves: Math.round(state.time)
  });
}

function update(state, config, controls, dt, context) {
  state.time += dt;
  updateEffects(state.effects, dt);
  state.shake = Math.max(0, state.shake - dt * 16);
  for (const key of Object.keys(state.buffs)) state.buffs[key] = Math.max(0, state.buffs[key] - dt);
  if (state.over) return;
  state.paddle.w = state.paddle.baseW + (state.buffs.expand > 0 ? 36 : 0);
  const move = controls.axisX || ((controls.right ? 1 : 0) - (controls.left ? 1 : 0));
  state.paddle.x = Math.max(state.paddle.w / 2, Math.min(W - state.paddle.w / 2, state.paddle.x + move * 220 * dt));
  if (Number.isFinite(controls.pointerX)) state.paddle.x = Math.max(state.paddle.w / 2, Math.min(W - state.paddle.w / 2, controls.pointerX));

  const ball = state.ball;
  const ballDt = dt * (state.buffs.slow > 0 ? 0.72 : 1);
  ball.x += ball.vx * ballDt;
  ball.y += ball.vy * ballDt;
  state.powerups.forEach((item) => {
    item.y += item.vy * dt;
    item.ttl -= dt;
  });
  state.powerups = state.powerups.filter((item) => item.y < H + 24 && item.ttl > 0);
  if (ball.x < 7 || ball.x > W - 7) {
    ball.x = Math.max(7, Math.min(W - 7, ball.x));
    ball.vx *= -1;
    addBurst(state.effects, ball.x, ball.y, { count: 4, color: classicArcade.cyan, secondary: classicArcade.white, speed: 38, life: 0.16, radius: 3 });
  }
  if (ball.y < 7) {
    ball.y = 7;
    ball.vy *= -1;
    addBurst(state.effects, ball.x, ball.y, { count: 4, color: classicArcade.cyan, secondary: classicArcade.white, speed: 38, life: 0.16, radius: 3 });
  }
  const paddleRect = { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y, w: state.paddle.w, h: 12 };
  if (ball.vy > 0 && overlap({ x: ball.x - 6, y: ball.y - 6, w: 12, h: 12 }, paddleRect)) {
    const offset = (ball.x - state.paddle.x) / (state.paddle.w / 2);
    ball.vx = offset * config.speed * 0.9;
    ball.vy = -Math.abs(ball.vy);
    addBurst(state.effects, ball.x, state.paddle.y, { count: 8, color: classicArcade.cyan, secondary: classicArcade.white, speed: 48, life: 0.2, radius: 4 });
    context.playSound?.("move");
  }

  const hit = state.bricks.find((brick) => overlap({ x: ball.x - 6, y: ball.y - 6, w: 12, h: 12 }, brick));
  if (hit) {
    hit.hp -= 1;
    ball.vy *= -1;
    state.score += 20;
    addBurst(state.effects, ball.x, ball.y, { count: 8, color: classicArcade.magenta, secondary: classicArcade.yellow, speed: 52, life: 0.22, radius: 5 });
    if (hit.hp <= 0) {
      addBurst(state.effects, hit.x + hit.w / 2, hit.y + hit.h / 2, { count: 14, color: classicArcade.orange, secondary: classicArcade.yellow, speed: 76, radius: 8 });
      spawnPowerup(state, hit);
      state.bricks = state.bricks.filter((brick) => brick !== hit);
      state.score += 30;
      state.shake = Math.max(state.shake, 2.5);
      context.playSound?.("score");
    }
    state.message = `剩余砖块 ${state.bricks.length}`;
  }

  const paddleRectForPower = { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y - 8, w: state.paddle.w, h: 26 };
  state.powerups = state.powerups.filter((item) => {
    const collected = overlap(paddleRectForPower, { x: item.x - 10, y: item.y - 10, w: 20, h: 20 });
    if (collected) applyPowerup(state, item, context);
    return !collected;
  });

  if (ball.y > H + 10) {
    state.lives -= 1;
    if (state.lives <= 0) finish(state, false, context);
    else {
      addBurst(state.effects, state.paddle.x, H - 18, { count: 16, color: classicArcade.red, secondary: classicArcade.yellow, speed: 84, radius: 10 });
      state.shake = Math.max(state.shake, 4.5);
      state.message = "漏球，重新发球";
      resetBall(state, config);
    }
  }
  if (!state.bricks.length) finish(state, true, context);
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const offset = shakeOffset(state.shake);
  ctx.translate(offset.x, offset.y);
  drawBreakoutBackdrop(ctx, W, H, state.time);
  for (const brick of state.bricks) {
    drawBreakoutBrick(ctx, brick, brick.row);
  }
  state.powerups.forEach((item) => drawPowerup(ctx, item));
  drawPaddle(ctx, state.paddle);
  drawBall(ctx, state.ball);
  drawEffects(ctx, state.effects);
  ctx.restore();
}

export function mountBreakout(root, context) {
  const config = CONFIG[context.difficulty] || CONFIG.medium;
  let state = initialState(config);
  const controls = { left: false, right: false, up: false, down: false, axisX: 0, axisY: 0, pointerX: NaN, dragOffsetX: NaN };
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels.difficulty} · ${state.bricks.length} 块砖 · ${config.paddle}px 挡板</p>
      </div>
      <div class="mini-stats">
        <span data-lives>生命 ${state.lives}</span>
        <span data-score>分数 0</span>
        <span data-left>砖块 ${state.bricks.length}</span>
        <span data-power>道具 无</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="打砖块"></canvas></div>
      <div class="arcade-controls">
        ${joystickMarkup("挡板移动")}
        <div class="arcade-control-stack">
          <button class="arcade-fire compact" data-action="restart">重开</button>
        </div>
      </div>
    </section>
  `;
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const lives = root.querySelector("[data-lives]");
  const score = root.querySelector("[data-score]");
  const left = root.querySelector("[data-left]");
  const power = root.querySelector("[data-power]");

  function restart() {
    state = initialState(config);
    controls.pointerX = NaN;
    controls.dragOffsetX = NaN;
    last = performance.now();
  }

  function loop(now) {
    if (disposed) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(state, config, controls, dt, context);
    draw(state, ctx);
    status.textContent = state.message;
    lives.textContent = `生命 ${state.lives}`;
    score.textContent = `分数 ${state.score}`;
    left.textContent = `砖块 ${state.bricks.length}`;
    const buffs = [
      state.buffs.expand > 0 ? `扩板 ${Math.ceil(state.buffs.expand)}` : "",
      state.buffs.slow > 0 ? `慢速 ${Math.ceil(state.buffs.slow)}` : ""
    ].filter(Boolean);
    power.textContent = buffs.length ? buffs.join(" · ") : "道具 无";
    raf = requestAnimationFrame(loop);
  }

  const onKeyDown = (event) => setKey(event, true);
  const onKeyUp = (event) => setKey(event, false);
  function setKey(event, pressed) {
    if (event.code === "ArrowLeft" || event.code === "KeyA") controls.left = pressed;
    else if (event.code === "ArrowRight" || event.code === "KeyD") controls.right = pressed;
    else return;
    controls.pointerX = NaN;
    event.preventDefault();
  }
  const cleanupJoystick = bindVirtualJoystick(root, controls);
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  const onPointerDown = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    controls.dragOffsetX = state.paddle.x - x;
    controls.pointerX = state.paddle.x;
  };
  const onPointerMove = (event) => {
    if (!Number.isFinite(controls.dragOffsetX)) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    controls.pointerX = clamp(x + controls.dragOffsetX, state.paddle.w / 2, W - state.paddle.w / 2);
  };
  const onPointerEnd = () => {
    controls.dragOffsetX = NaN;
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cleanupJoystick();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerEnd);
    canvas.removeEventListener("pointercancel", onPointerEnd);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
