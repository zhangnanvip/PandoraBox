// Copy this file to src/games/<game-id>/game.js, then adjust import paths and game logic.
import { bindDigitalKeys } from "../arcade/controls.js";
import { rectFromCenter, rectsOverlap } from "../arcade/collision.js";
import { addBurst, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { feedbackTimeScale, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { advanceStage, isFinalStage, restoreStageLevel, stageLabel, stageMeta } from "../arcade/stages.js";
import { announceStageStart, drawStageTransition, updateStageTransition } from "../arcade/progression.js";

const W = 360;
const H = 360;
const MAX_LEVEL = 5;

const CONFIG = { lives: 3, speed: 110 };

function levelTuning(config, level) {
  return {
    speed: config.speed + (level - 1) * 8,
    target: 6 + level * 2
  };
}

function initialState(config) {
  const levelConfig = levelTuning(config, 1);
  return {
    level: 1,
    maxLevel: MAX_LEVEL,
    levelConfig,
    player: { x: W / 2, y: H - 48, lives: config.lives },
    enemies: [],
    score: 0,
    time: 0,
    over: false,
    won: false,
    message: "第 1 关开始",
    effects: [],
    transition: null,
    feedback: null,
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
  snapshot.transition = null;
  snapshot.feedback = null;
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

function advanceLevel(state, config, context) {
  advanceStage(state);
  state.levelConfig = levelTuning(config, state.level);
  state.enemies = [];
  announceStageStart(state, context, {
    message: `第 ${state.level} 关开始`,
    transition: { title: `第 ${stageMeta(state)} 关`, subtitle: "准备" },
    effects: state.effects,
    position: { x: W / 2, y: H / 2 },
    burst: { count: 18, speed: 72 },
    shake: 2
  });
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "挑战完成" : "挑战失败";
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
  updateFeedback(state, rawDt, [state.player, state.enemies]);
  updateStageTransition(state, dt);
  if (state.over) return;

  const moveX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0) + (controls.axisX || 0);
  const moveY = (controls.down ? 1 : 0) - (controls.up ? 1 : 0) + (controls.axisY || 0);
  state.player.x = Math.max(14, Math.min(W - 14, state.player.x + moveX * state.levelConfig.speed * dt));
  state.player.y = Math.max(14, Math.min(H - 14, state.player.y + moveY * state.levelConfig.speed * dt));

  const playerRect = rectFromCenter(state.player, 24);
  const hit = state.enemies.find((enemy) => rectsOverlap(playerRect, rectFromCenter(enemy, 24)));
  if (hit) {
    triggerHitStop(state, 0.06, 0.45);
    addBurst(state.effects, state.player.x, state.player.y, { count: 16 });
    finish(state, false, context);
  }

  if (state.score >= state.levelConfig.target) {
    if (isFinalStage(state)) finish(state, true, context);
    else advanceLevel(state, config, context);
  }
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  const offset = shakeOffset(state.shake);
  ctx.save();
  ctx.translate(offset.x, offset.y);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#42f2ff";
  ctx.fillRect(state.player.x - 10, state.player.y - 10, 20, 20);
  drawEffects(ctx, state.effects);
  ctx.restore();
  drawStageTransition(ctx, W, H, state.transition);
}

export function mountTemplateGame(root, context) {
  const config = CONFIG;
  let state = restoreState(config, context.savedState);
  const controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>单人闯关 · 模板游戏</p>
      </div>
      <div class="mini-stats">
        <span data-level>${stageLabel(state)}</span>
        <span data-score>分数 ${state.score}</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="模板游戏"></canvas></div>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const level = root.querySelector("[data-level]");
  const score = root.querySelector("[data-score]");

  function restart() {
    state = initialState(config);
    context.clearSession?.();
    loop.resetClock();
  }

  function refreshHud() {
    status.textContent = state.message;
    level.textContent = stageLabel(state);
    score.textContent = `分数 ${state.score}`;
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

  const cleanupKeys = bindDigitalKeys(controls);
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupKeys();
    cleanupShellRestart();
  };
}
