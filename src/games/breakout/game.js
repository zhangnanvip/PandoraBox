import { HORIZONTAL_KEY_MAP, bindDigitalKeys } from "../arcade/controls.js";
import { clamp, rectFromCenter, rectsOverlap as overlap } from "../arcade/collision.js";
import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { drawFlashHalo, feedbackTimeScale, triggerFlash, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { classicArcade, drawBall, drawBreakoutBackdrop, drawBreakoutBrick, drawPaddle, drawPowerup } from "../arcade/classic-visuals.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { bossHealthLabel, bossHealthRatio, createBoss, isBossDefeated, spawnBossOnce } from "../arcade/bosses.js";
import { announceStageStart, drawStageTransition, updateStageTransition } from "../arcade/progression.js";
import { addPickup, collectPickups, pickupRect, shouldDropReward, updatePickups } from "../arcade/rewards.js";
import { advanceStage, isFinalStage, restoreStageLevel, stageLabel, stageMeta } from "../arcade/stages.js";

const W = 360;
const H = 360;
const CONFIG = { rows: 6, speed: 156, paddle: 76, lives: 3 };
const MAX_LEVEL = 30;
const BOSS_INTERVAL = 5;

function isBossLevel(level) {
  return level % BOSS_INTERVAL === 0 || level >= MAX_LEVEL;
}

function levelTuning(config, level) {
  const chapter = Math.floor((level - 1) / BOSS_INTERVAL);
  return {
    rows: Math.min(8, Math.max(5, Math.round(config.rows * 0.82)) + Math.floor((level - 1) / 2)),
    speed: config.speed + (level - 1) * 5 + chapter * 4,
    paddle: Math.max(48, config.paddle - Math.floor((level - 1) / 3) * 2),
    bossHp: 24 + level * 4 + chapter * 12
  };
}

function makeBricks(rows, level = 1) {
  const bricks = [];
  const cols = 8;
  const gap = 4;
  const bw = (W - 32 - gap * (cols - 1)) / cols;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const hp = y < 3 && level < 4 ? 1 : level >= 12 && y % 3 === 0 ? 3 : 2;
      bricks.push({ x: 16 + x * (bw + gap), y: 34 + y * 18, w: bw, h: 13, hp, row: y });
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
  snapshot.transition = null;
  snapshot.feedback = null;
  snapshot.over = false;
  snapshot.won = false;
  snapshot.version = 1;
  return snapshot;
}

function restoreState(config, savedState) {
  if (!savedState || savedState.version !== 1 || savedState.over) return initialState(config);
  const fallback = initialState(config);
  const snapshot = clonePlain(savedState);
  const level = restoreStageLevel(snapshot.level, MAX_LEVEL);
  return {
    ...fallback,
    ...snapshot,
    level,
    maxLevel: MAX_LEVEL,
    levelConfig: levelTuning(config, level),
    effects: [],
    transition: null,
    feedback: null,
    shake: 0,
    over: false,
    won: false
  };
}

function sessionMeta(state) {
  return {
    level: stageMeta(state),
    score: state.score
  };
}

function spawnPowerup(state, brick) {
  if (!shouldDropReward({ rate: 0.32, count: state.bricks.length, forceEvery: 7 })) return;
  addPickup(state.powerups, ["expand", "slow", "life"], {
    x: brick.x + brick.w / 2,
    y: brick.y + brick.h / 2
  }, { vy: 58, ttl: 8 });
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

function spawnBoss(state, context) {
  spawnBossOnce(state, () => createBoss({
    x: W / 2,
    y: 74,
    w: 96,
    h: 24,
    vx: 44,
    hp: state.levelConfig.bossHp
  }), {
    context,
    intro: {
      message: "Boss 砖核心出现",
      title: "Boss 出现",
      subtitle: "砖核心",
      effects: state.effects,
      position: { x: W / 2, y: 86 },
      burst: { count: 34, color: classicArcade.magenta, secondary: classicArcade.yellow, speed: 92, radius: 24 },
      shake: 4.5,
      flash: 0.42,
      hitStop: 0.07,
      hitStopScale: 0.45
    }
  });
}

function advanceLevel(state, config, context) {
  advanceStage(state);
  state.levelConfig = levelTuning(config, state.level);
  state.paddle = { x: W / 2, y: H - 34, w: state.levelConfig.paddle, baseW: state.levelConfig.paddle };
  state.bricks = makeBricks(state.levelConfig.rows, state.level);
  state.boss = null;
  state.bossSpawned = false;
  state.powerups = [];
  state.buffs = { expand: 0, slow: 0 };
  resetBall(state);
  const bossStage = isBossLevel(state.level);
  announceStageStart(state, context, {
    message: bossStage ? `第 ${state.level} 关：Boss 砖阵` : `第 ${state.level} 关：砖阵加固`,
    transition: {
      title: `第 ${stageMeta(state)} 关`,
      subtitle: bossStage ? "Boss 砖阵" : "砖阵加固"
    },
    effects: state.effects,
    position: { x: W / 2, y: H / 2 },
    burst: { count: 28, color: classicArcade.cyan, secondary: classicArcade.yellow, speed: 84, radius: 22 },
    shake: 2.8
  });
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

function update(state, config, controls, dt, context, rawDt = dt) {
  state.time += dt;
  updateEffects(state.effects, dt);
  updateFeedback(state, rawDt, [state.paddle, state.boss, state.bricks]);
  updateStageTransition(state, dt);
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
  state.powerups = updatePickups(state.powerups, dt, { maxY: H, margin: 24 });
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
      triggerFlash(state.boss, 0.1);
      triggerHitStop(state, 0.035, 0.5);
      state.score += 40;
      addBurst(state.effects, ball.x, ball.y, { count: 10, color: classicArcade.magenta, secondary: classicArcade.yellow, speed: 66, life: 0.24, radius: 7 });
      state.shake = Math.max(state.shake, 3);
      state.message = `Boss 核心 ${Math.max(0, state.boss.hp)}/${state.boss.maxHp}`;
      context.playSound?.("score");
      if (isBossDefeated(state.boss)) {
        addBurst(state.effects, state.boss.x, state.boss.y, { count: 44, color: classicArcade.red, secondary: classicArcade.yellow, speed: 116, radius: 26 });
        addFloatingText(state.effects, state.boss.x, state.boss.y - 18, "+900", { color: classicArcade.yellow, size: 16 });
        state.score += 900;
        state.boss = null;
        if (isFinalStage(state)) finish(state, true, context);
        else advanceLevel(state, config, context);
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
  state.powerups = collectPickups(
    state.powerups,
    (item) => overlap(paddleRectForPower, pickupRect(item)),
    (item) => applyPowerup(state, item, context)
  );

  if (ball.y > H + 10) {
    state.lives -= 1;
    if (state.lives <= 0) finish(state, false, context);
    else {
      addBurst(state.effects, state.paddle.x, H - 18, { count: 16, color: classicArcade.red, secondary: classicArcade.yellow, speed: 84, radius: 10 });
      triggerFlash(state.paddle, 0.24);
      triggerHitStop(state, 0.065, 0.42);
      state.shake = Math.max(state.shake, 4.5);
      state.message = "漏球，重新发球";
      resetBall(state);
    }
  }
  if (!state.bricks.length && !state.boss && !state.over) {
    if (isBossLevel(state.level) && !state.bossSpawned) spawnBoss(state, context);
    else if (!isFinalStage(state)) advanceLevel(state, config, context);
    else finish(state, true, context);
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
    if (boss.flash) drawFlashHalo(ctx, { x: boss.x - boss.w / 2, y: boss.y, w: boss.w, h: boss.h }, { alpha: 0.62, color: classicArcade.yellow, pad: 5 });
  }
  state.powerups.forEach((item) => drawPowerup(ctx, item));
  drawPaddle(ctx, state.paddle);
  if (state.paddle.flash) drawFlashHalo(ctx, { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y, w: state.paddle.w, h: 12 }, { alpha: 0.62, color: classicArcade.red, pad: 4 });
  drawBall(ctx, state.ball);
  drawEffects(ctx, state.effects);
  ctx.restore();
  drawStageTransition(ctx, W, H, state.transition);
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
  ctx.fillRect(50, 14, (W - 100) * bossHealthRatio(boss), 5);
}

export function mountBreakout(root, context) {
  const config = CONFIG;
  let state = restoreState(config, context.savedState);
  const controls = { left: false, right: false, up: false, down: false, axisX: 0, axisY: 0, pointerX: NaN, dragOffsetX: NaN };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>单人闯关 · ${MAX_LEVEL} 关砖阵 · 每 ${BOSS_INTERVAL} 关 Boss</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/${MAX_LEVEL}</span>
        <span data-lives>生命 ${state.lives}</span>
        <span data-score>分数 0</span>
        <span data-left>砖块 ${state.bricks.length}</span>
        <span data-power>道具 无</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="打砖块"></canvas></div>
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
    note.textContent = `第 ${stageMeta(state)} 关 · ${state.boss ? "Boss 砖核心" : isBossLevel(state.level) ? "Boss 砖阵" : "砖阵"}`;
    level.textContent = stageLabel(state);
    lives.textContent = `生命 ${state.lives}`;
    score.textContent = `分数 ${state.score}`;
    left.textContent = state.boss ? bossHealthLabel(state.boss) : `砖块 ${state.bricks.length}`;
    const buffs = [
      state.buffs.expand > 0 ? `扩板 ${Math.ceil(state.buffs.expand)}` : "",
      state.buffs.slow > 0 ? `慢速 ${Math.ceil(state.buffs.slow)}` : ""
    ].filter(Boolean);
    power.textContent = buffs.length ? buffs.join(" · ") : "道具 无";
  }

  const loop = createArcadeLoop({
    context,
    timeScale: () => feedbackTimeScale(state),
    update: (dt, rawDt) => update(state, config, controls, dt, context, rawDt),
    draw: () => {
      draw(state, ctx);
      refreshHud();
    },
    save: () => {
      if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    }
  });

  const cleanupKeys = bindDigitalKeys(controls, HORIZONTAL_KEY_MAP, {
    onChange: () => {
      controls.pointerX = NaN;
    }
  });
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  const onPointerDown = (event) => {
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    controls.dragOffsetX = state.paddle.x - x;
    controls.pointerX = state.paddle.x;
  };
  const onPointerMove = (event) => {
    if (!Number.isFinite(controls.dragOffsetX)) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    controls.pointerX = clamp(x + controls.dragOffsetX, state.paddle.w / 2, W - state.paddle.w / 2);
  };
  const onPointerEnd = (event) => {
    canvas.releasePointerCapture?.(event.pointerId);
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
    cleanupKeys();
    cleanupShellRestart();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerEnd);
    canvas.removeEventListener("pointercancel", onPointerEnd);
  };
}
