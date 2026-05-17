import { HORIZONTAL_KEY_MAP, bindDigitalKeys, bindVirtualJoystick, joystickMarkup } from "../arcade/controls.js";
import { clamp, rectFromCenter, rectsOverlap as overlap } from "../arcade/collision.js";
import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { classicArcade, drawBall, drawBreakoutBackdrop, drawBreakoutBrick, drawPaddle, drawPowerup } from "../arcade/classic-visuals.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";

const W = 360;
const H = 360;
const CONFIG = {
  easy: { rows: 4, speed: 142, paddle: 86, lives: 4 },
  medium: { rows: 5, speed: 162, paddle: 76, lives: 3 },
  hard: { rows: 6, speed: 184, paddle: 66, lives: 3 },
  devil: { rows: 7, speed: 210, paddle: 58, lives: 2 }
};
const MAX_LEVEL = 5;

function levelTuning(config, level) {
  return {
    rows: Math.min(7, Math.max(3, Math.round(config.rows * 0.62)) + level - 1),
    speed: config.speed + (level - 1) * 14,
    paddle: Math.max(48, config.paddle - (level - 1) * 4),
    bossHp: 20 + level * 5 + Math.max(0, 4 - config.lives) * 4
  };
}

function makeBricks(rows, level = 1) {
  const bricks = [];
  const cols = 8;
  const gap = 4;
  const bw = (W - 32 - gap * (cols - 1)) / cols;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      bricks.push({ x: 16 + x * (bw + gap), y: 34 + y * 18, w: bw, h: 13, hp: y + level < 4 ? 1 : 2, row: y });
    }
  }
  return bricks;
}

function initialState(config) {
  const levelConfig = levelTuning(config, 1);
  return {
    level: 1,
    maxLevel: MAX_LEVEL,
    levelConfig,
    paddle: { x: W / 2, y: H - 34, w: levelConfig.paddle, baseW: levelConfig.paddle },
    ball: { x: W / 2, y: H - 56, vx: levelConfig.speed * 0.56, vy: -levelConfig.speed },
    bricks: makeBricks(levelConfig.rows, 1),
    boss: null,
    bossSpawned: false,
    powerups: [],
    buffs: { expand: 0, slow: 0 },
    lives: config.lives,
    score: 0,
    time: 0,
    over: false,
    won: false,
    message: "第 1 关：清空砖阵",
    effects: [],
    shake: 0
  };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeState(state) {
  const snapshot = clonePlain(state);
  delete snapshot.levelConfig;
  snapshot.effects = [];
  snapshot.shake = 0;
  snapshot.over = false;
  snapshot.won = false;
  snapshot.version = 1;
  return snapshot;
}

function restoreState(config, savedState) {
  if (!savedState || savedState.version !== 1 || savedState.over) return initialState(config);
  const fallback = initialState(config);
  const snapshot = clonePlain(savedState);
  const level = clamp(Number(snapshot.level) || 1, 1, MAX_LEVEL);
  return {
    ...fallback,
    ...snapshot,
    level,
    maxLevel: MAX_LEVEL,
    levelConfig: levelTuning(config, level),
    effects: [],
    shake: 0,
    over: false,
    won: false
  };
}

function sessionMeta(state) {
  return {
    level: `${state.level}/${state.maxLevel}`,
    score: state.score
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
  addFloatingText(state.effects, item.x, item.y - 16, item.type === "life" ? "+1" : "BUFF", { color: classicArcade.yellow });
  context.playSound?.("score");
}

function resetBall(state) {
  state.ball = { x: state.paddle.x, y: H - 56, vx: state.levelConfig.speed * (Math.random() < 0.5 ? -0.52 : 0.52), vy: -state.levelConfig.speed };
}

function spawnBoss(state) {
  if (state.bossSpawned) return;
  state.bossSpawned = true;
  state.boss = {
    x: W / 2,
    y: 74,
    w: 96,
    h: 24,
    vx: 44,
    hp: state.levelConfig.bossHp,
    maxHp: state.levelConfig.bossHp
  };
  state.message = "Boss 砖核心出现";
  addBurst(state.effects, W / 2, 86, { count: 34, color: classicArcade.magenta, secondary: classicArcade.yellow, speed: 92, radius: 24 });
  state.shake = Math.max(state.shake, 4.5);
}

function advanceLevel(state, config, context) {
  state.level += 1;
  state.levelConfig = levelTuning(config, state.level);
  state.paddle = { x: W / 2, y: H - 34, w: state.levelConfig.paddle, baseW: state.levelConfig.paddle };
  state.bricks = makeBricks(state.levelConfig.rows, state.level);
  state.boss = null;
  state.bossSpawned = false;
  state.powerups = [];
  state.buffs = { expand: 0, slow: 0 };
  resetBall(state);
  state.message = state.level === MAX_LEVEL ? "第 5 关：Boss 砖阵" : `第 ${state.level} 关：砖阵加固`;
  addBurst(state.effects, W / 2, H / 2, { count: 28, color: classicArcade.cyan, secondary: classicArcade.yellow, speed: 84, radius: 22 });
  state.shake = Math.max(state.shake, 2.8);
  context.playSound?.("start");
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "全部砖阵清空" : "弹球落尽";
  context.clearSession?.();
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
  const ballRect = rectFromCenter(ball, 12);
  const paddleRect = { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y, w: state.paddle.w, h: 12 };
  if (ball.vy > 0 && overlap(ballRect, paddleRect)) {
    const offset = (ball.x - state.paddle.x) / (state.paddle.w / 2);
    ball.vx = offset * state.levelConfig.speed * 0.9;
    ball.vy = -Math.abs(ball.vy);
    addBurst(state.effects, ball.x, state.paddle.y, { count: 8, color: classicArcade.cyan, secondary: classicArcade.white, speed: 48, life: 0.2, radius: 4 });
    context.playSound?.("move");
  }

  const hit = state.bricks.find((brick) => overlap(ballRect, brick));
  if (hit) {
    hit.hp -= 1;
    ball.vy *= -1;
    state.score += 20;
    addBurst(state.effects, ball.x, ball.y, { count: 8, color: classicArcade.magenta, secondary: classicArcade.yellow, speed: 52, life: 0.22, radius: 5 });
    if (hit.hp <= 0) {
      const hitCenter = { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 };
      addBurst(state.effects, hitCenter.x, hitCenter.y, { count: 14, color: classicArcade.orange, secondary: classicArcade.yellow, speed: 76, radius: 8 });
      addFloatingText(state.effects, hitCenter.x, hitCenter.y - 10, "+50", { color: classicArcade.yellow });
      spawnPowerup(state, hit);
      state.bricks = state.bricks.filter((brick) => brick !== hit);
      state.score += 30;
      state.shake = Math.max(state.shake, 2.5);
      context.playSound?.("score");
    }
    state.message = `剩余砖块 ${state.bricks.length}`;
  }

  if (!hit && state.boss) {
    const bossRect = { x: state.boss.x - state.boss.w / 2, y: state.boss.y, w: state.boss.w, h: state.boss.h };
    if (overlap(ballRect, bossRect)) {
      state.boss.hp -= 1;
      ball.vy = Math.abs(ball.vy);
      ball.vx += (ball.x - state.boss.x) * 0.9;
      state.score += 40;
      addBurst(state.effects, ball.x, ball.y, { count: 10, color: classicArcade.magenta, secondary: classicArcade.yellow, speed: 66, life: 0.24, radius: 7 });
      state.shake = Math.max(state.shake, 3);
      state.message = `Boss 核心 ${Math.max(0, state.boss.hp)}/${state.boss.maxHp}`;
      context.playSound?.("score");
      if (state.boss.hp <= 0) {
        addBurst(state.effects, state.boss.x, state.boss.y, { count: 44, color: classicArcade.red, secondary: classicArcade.yellow, speed: 116, radius: 26 });
        addFloatingText(state.effects, state.boss.x, state.boss.y - 18, "+900", { color: classicArcade.yellow, size: 16 });
        state.score += 900;
        state.boss = null;
        finish(state, true, context);
      }
    }
  }

  if (state.boss) {
    state.boss.x += state.boss.vx * dt;
    if (state.boss.x < state.boss.w / 2 + 12 || state.boss.x > W - state.boss.w / 2 - 12) {
      state.boss.x = clamp(state.boss.x, state.boss.w / 2 + 12, W - state.boss.w / 2 - 12);
      state.boss.vx *= -1;
    }
  }

  const paddleRectForPower = { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y - 8, w: state.paddle.w, h: 26 };
  state.powerups = state.powerups.filter((item) => {
    const collected = overlap(paddleRectForPower, rectFromCenter(item, 20));
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
      resetBall(state);
    }
  }
  if (!state.bricks.length && !state.boss && !state.over) {
    if (state.level < state.maxLevel) advanceLevel(state, config, context);
    else if (!state.bossSpawned) spawnBoss(state);
  }
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
  if (state.boss) {
    const boss = state.boss;
    drawPixelBoss(ctx, boss);
  }
  state.powerups.forEach((item) => drawPowerup(ctx, item));
  drawPaddle(ctx, state.paddle);
  drawBall(ctx, state.ball);
  drawEffects(ctx, state.effects);
  ctx.restore();
}

function drawPixelBoss(ctx, boss) {
  ctx.fillStyle = classicArcade.shadow;
  ctx.fillRect(boss.x - boss.w / 2 + 3, boss.y + 3, boss.w, boss.h);
  ctx.fillStyle = classicArcade.magenta;
  ctx.fillRect(boss.x - boss.w / 2, boss.y, boss.w, boss.h);
  ctx.strokeStyle = classicArcade.white;
  ctx.lineWidth = 2;
  ctx.strokeRect(boss.x - boss.w / 2 + 1, boss.y + 1, boss.w - 2, boss.h - 2);
  ctx.fillStyle = classicArcade.yellow;
  ctx.fillRect(boss.x - 12, boss.y + 6, 24, 8);
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.fillRect(50, 14, W - 100, 5);
  ctx.fillStyle = classicArcade.red;
  ctx.fillRect(50, 14, (W - 100) * Math.max(0, boss.hp / boss.maxHp), 5);
}

export function mountBreakout(root, context) {
  const config = CONFIG[context.difficulty] || CONFIG.medium;
  let state = restoreState(config, context.savedState);
  const controls = { left: false, right: false, up: false, down: false, axisX: 0, axisY: 0, pointerX: NaN, dragOffsetX: NaN };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>${context.labels.difficulty} · 5 关砖阵 · 终关 Boss</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/5</span>
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
  const note = root.querySelector("[data-note]");
  const level = root.querySelector("[data-level]");
  const lives = root.querySelector("[data-lives]");
  const score = root.querySelector("[data-score]");
  const left = root.querySelector("[data-left]");
  const power = root.querySelector("[data-power]");

  function restart() {
    state = initialState(config);
    context.clearSession?.();
    controls.pointerX = NaN;
    controls.dragOffsetX = NaN;
    loop.resetClock();
  }

  function refreshHud() {
    status.textContent = state.message;
    note.textContent = `${context.labels.difficulty} · 第 ${state.level}/${state.maxLevel} 关 · ${state.boss ? "Boss 砖核心" : "砖阵"}`;
    level.textContent = `关卡 ${state.level}/${state.maxLevel}`;
    lives.textContent = `生命 ${state.lives}`;
    score.textContent = `分数 ${state.score}`;
    left.textContent = state.boss ? `Boss ${Math.max(0, state.boss.hp)}` : `砖块 ${state.bricks.length}`;
    const buffs = [
      state.buffs.expand > 0 ? `扩板 ${Math.ceil(state.buffs.expand)}` : "",
      state.buffs.slow > 0 ? `慢速 ${Math.ceil(state.buffs.slow)}` : ""
    ].filter(Boolean);
    power.textContent = buffs.length ? buffs.join(" · ") : "道具 无";
  }

  const loop = createArcadeLoop({
    context,
    update: (dt) => update(state, config, controls, dt, context),
    draw: () => {
      draw(state, ctx);
      refreshHud();
    },
    save: () => {
      if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    }
  });

  const cleanupJoystick = bindVirtualJoystick(root, controls);
  const cleanupKeys = bindDigitalKeys(controls, HORIZONTAL_KEY_MAP, {
    onChange: () => {
      controls.pointerX = NaN;
    }
  });
  const cleanupShellRestart = bindShellRestart(root, context, restart);
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
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupJoystick();
    cleanupKeys();
    cleanupShellRestart();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerEnd);
    canvas.removeEventListener("pointercancel", onPointerEnd);
  };
}
