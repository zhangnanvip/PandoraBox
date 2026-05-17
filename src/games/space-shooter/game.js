import { bindDigitalKeys, bindVirtualJoystick, joystickMarkup } from "../arcade/controls.js";
import { clamp, rectFromCenter, rectsOverlap as overlap } from "../arcade/collision.js";
import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { drawFlashHalo, feedbackTimeScale, triggerFlash, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { classicArcade, drawEnemyShip, drawPlayerShip, drawPowerup, drawStarfield } from "../arcade/classic-visuals.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { bossHealthLabel, bossHealthRatio, createBoss, isBossDefeated, spawnBossOnce } from "../arcade/bosses.js";
import { announceStageStart, drawStageTransition, updateStageTransition } from "../arcade/progression.js";
import { addPickup, collectPickups, pickupRect, shouldDropReward, updatePickups } from "../arcade/rewards.js";
import { advanceStage, isFinalStage, restoreStageLevel, stageLabel, stageMeta } from "../arcade/stages.js";

const W = 300;
const H = 400;
const CONFIG = {
  easy: { lives: 4, waves: 22, enemyEvery: 1.05, enemySpeed: 58, bulletSpeed: 96 },
  medium: { lives: 3, waves: 30, enemyEvery: 0.82, enemySpeed: 72, bulletSpeed: 116 },
  hard: { lives: 3, waves: 38, enemyEvery: 0.66, enemySpeed: 88, bulletSpeed: 136 },
  devil: { lives: 2, waves: 46, enemyEvery: 0.5, enemySpeed: 104, bulletSpeed: 158 }
};
const MAX_LEVEL = 5;

function levelTuning(config, level) {
  return {
    waves: Math.max(5, Math.round(config.waves * 0.22) + (level - 1) * 2),
    enemyEvery: Math.max(0.36, config.enemyEvery - (level - 1) * 0.08),
    enemySpeed: config.enemySpeed + (level - 1) * 8,
    bulletSpeed: config.bulletSpeed + (level - 1) * 9,
    bossHp: 26 + level * 5 + Math.max(0, 4 - config.lives) * 4
  };
}

function initialState(config) {
  const levelConfig = levelTuning(config, 1);
  return {
    level: 1,
    maxLevel: MAX_LEVEL,
    levelConfig,
    player: { x: W / 2, y: H - 45, lives: config.lives, reload: 0, invuln: 1 },
    enemies: [],
    boss: null,
    bossSpawned: false,
    bullets: [],
    enemyBullets: [],
    powerups: [],
    buffs: { weapon: 0, shield: 0 },
    spawned: 0,
    killed: 0,
    levelKills: 0,
    score: 0,
    spawnTimer: 0.5,
    time: 0,
    over: false,
    won: false,
    message: "第 1 关：穿过弹幕",
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

function advanceLevel(state, config, context) {
  advanceStage(state);
  state.levelConfig = levelTuning(config, state.level);
  state.enemies = [];
  state.boss = null;
  state.bossSpawned = false;
  state.bullets = [];
  state.enemyBullets = [];
  state.powerups = [];
  state.spawned = 0;
  state.levelKills = 0;
  state.spawnTimer = 0.8;
  state.player.x = W / 2;
  state.player.y = H - 45;
  state.player.invuln = 1.3;
  const bossStage = isFinalStage(state);
  announceStageStart(state, context, {
    message: bossStage ? `第 ${state.maxLevel} 关：穿越 Boss 空域` : `第 ${state.level} 关：敌机加速`,
    transition: {
      title: `第 ${stageMeta(state)} 关`,
      subtitle: bossStage ? "Boss 空域" : "敌机加速"
    },
    effects: state.effects,
    position: { x: W / 2, y: H / 2 },
    burst: { count: 30, color: classicArcade.cyan, secondary: classicArcade.yellow, speed: 92, radius: 24 },
    shake: 3.6
  });
}

function spawnPowerup(state, x, y) {
  const types = ["weapon", "shield", "repair", "clear"];
  addPickup(state.powerups, types, { x, y }, { vy: 42, ttl: 9 });
}

function applyPowerup(state, item, context) {
  if (item.type === "weapon") {
    state.buffs.weapon = 9;
    state.message = "火力升级：三线射击";
  } else if (item.type === "shield") {
    state.buffs.shield = 7;
    state.player.invuln = Math.max(state.player.invuln, 2.2);
    state.message = "护盾启动：抵挡一次伤害";
  } else if (item.type === "clear") {
    state.enemyBullets = [];
    state.message = "清屏脉冲：弹幕清除";
  } else {
    state.player.lives = Math.min(5, state.player.lives + 1);
    state.message = "维修胶囊：生命 +1";
  }
  addBurst(state.effects, item.x, item.y, { count: 18, color: classicArcade.cyan, secondary: classicArcade.yellow, speed: 78, radius: 10 });
  addFloatingText(state.effects, item.x, item.y - 16, item.type === "repair" ? "+1" : "BUFF", { color: classicArcade.yellow });
  context.playSound?.("score");
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "突破全部空域" : "战机坠落";
  context.clearSession?.();
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    detail: state.message,
    score: state.score,
    moves: Math.round(state.time)
  });
}

function spawnEnemy(state, config) {
  const levelConfig = state.levelConfig;
  if (state.spawned >= levelConfig.waves) return;
  state.enemies.push({
    x: 24 + Math.random() * (W - 48),
    y: -18,
    vx: (Math.random() - 0.5) * 42,
    hp: (state.spawned + state.level) % 7 === 0 ? 2 : 1,
    fire: 0.55 + Math.random() * 0.75
  });
  state.spawned += 1;
}

function spawnBoss(state) {
  spawnBossOnce(state, () => createBoss({
    x: W / 2,
    y: 54,
    vx: 58,
    hp: state.levelConfig.bossHp,
    fire: 0.65
  }), {
    message: "Boss 出现：核心战舰",
    onSpawn: (boss) => {
      triggerFlash(boss, 0.44);
      triggerHitStop(state, 0.08, 0.42);
      addBurst(state.effects, W / 2, 58, { count: 34, color: classicArcade.red, secondary: classicArcade.magenta, speed: 88, radius: 28 });
      state.shake = Math.max(state.shake, 5);
    }
  });
}

function bossRect(boss) {
  return { x: boss.x - 36, y: boss.y - 18, w: 72, h: 38 };
}

function update(state, config, controls, dt, context, rawDt = dt) {
  state.time += dt;
  updateEffects(state.effects, dt);
  updateFeedback(state, rawDt, [state.player, state.boss, state.enemies]);
  updateStageTransition(state, dt);
  state.shake = Math.max(0, state.shake - dt * 18);
  for (const key of Object.keys(state.buffs)) state.buffs[key] = Math.max(0, state.buffs[key] - dt);
  if (state.over) return;
  const player = state.player;
  const moveX = controls.axisX || ((controls.right ? 1 : 0) - (controls.left ? 1 : 0));
  const moveY = controls.axisY || ((controls.down ? 1 : 0) - (controls.up ? 1 : 0));
  player.x = Math.max(14, Math.min(W - 14, player.x + moveX * 152 * dt));
  player.y = Math.max(32, Math.min(H - 18, player.y + moveY * 152 * dt));
  if (controls.pointer) {
    player.x += (controls.pointer.x - player.x) * Math.min(1, dt * 12);
    player.y += (controls.pointer.y - player.y) * Math.min(1, dt * 12);
  }
  player.reload -= dt;
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.reload <= 0) {
    state.bullets.push({ x: player.x - 5, y: player.y - 16, vy: -230 });
    state.bullets.push({ x: player.x + 5, y: player.y - 16, vy: -230 });
    if (state.buffs.weapon > 0) {
      state.bullets.push({ x: player.x - 15, y: player.y - 10, vx: -34, vy: -218 });
      state.bullets.push({ x: player.x + 15, y: player.y - 10, vx: 34, vy: -218 });
    }
    addBurst(state.effects, player.x, player.y - 18, { count: 4, color: classicArcade.cyan, secondary: classicArcade.white, speed: 34, life: 0.12, radius: 3 });
    player.reload = 0.18;
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state, config);
    state.spawnTimer = state.levelConfig.enemyEvery;
  }

  for (const enemy of state.enemies) {
    enemy.y += state.levelConfig.enemySpeed * dt;
    enemy.x += enemy.vx * dt;
    if (enemy.x < 16 || enemy.x > W - 16) enemy.vx *= -1;
    enemy.fire -= dt;
    if (enemy.fire <= 0) {
      state.enemyBullets.push({ x: enemy.x, y: enemy.y + 14, vy: state.levelConfig.bulletSpeed });
      enemy.fire = 0.9 + Math.random() * 0.85;
    }
  }
  if (state.spawned >= state.levelConfig.waves && !state.enemies.length && isFinalStage(state) && !state.bossSpawned) {
    spawnBoss(state);
  }
  if (state.boss) {
    const boss = state.boss;
    boss.x += boss.vx * dt;
    if (boss.x < 44 || boss.x > W - 44) {
      boss.x = clamp(boss.x, 44, W - 44);
      boss.vx *= -1;
    }
    boss.y = 54 + Math.sin(state.time * 1.5) * 8;
    boss.fire -= dt;
    if (boss.fire <= 0) {
      [-0.55, 0, 0.55].forEach((angle) => {
        state.enemyBullets.push({
          x: boss.x,
          y: boss.y + 22,
          vx: Math.sin(angle) * 74,
          vy: state.levelConfig.bulletSpeed * (0.92 + Math.abs(angle) * 0.18)
        });
      });
      boss.fire = 0.58;
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.y < H + 24 && enemy.hp > 0);

  state.bullets.forEach((bullet) => {
    bullet.y += bullet.vy * dt;
  });
  state.enemyBullets.forEach((bullet) => {
    bullet.x += (bullet.vx || 0) * dt;
    bullet.y += bullet.vy * dt;
  });
  state.bullets = state.bullets.filter((bullet) => bullet.y > -20);
  state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.y < H + 20);
  state.powerups = updatePickups(state.powerups, dt, { maxY: H, margin: 20 });

  for (const bullet of state.bullets) {
    bullet.x += (bullet.vx || 0) * dt;
    const hit = state.enemies.find((enemy) => overlap(rectFromCenter({ x: bullet.x, y: bullet.y - 2 }, 6, 12), rectFromCenter(enemy, 26, 22)));
    if (hit) {
      hit.hp -= 1;
      bullet.y = -99;
      addBurst(state.effects, bullet.x, bullet.y, { count: 6, color: classicArcade.cyan, secondary: classicArcade.white, speed: 46, life: 0.18, radius: 4 });
      if (hit.hp <= 0) {
        addBurst(state.effects, hit.x, hit.y, { count: 18, color: classicArcade.red, secondary: classicArcade.yellow, speed: 94, radius: 11 });
        addFloatingText(state.effects, hit.x, hit.y - 14, "+80", { color: classicArcade.yellow });
        state.killed += 1;
        state.levelKills += 1;
        state.score += 80;
        state.message = `第 ${state.level} 关击落 ${state.levelKills}/${state.levelConfig.waves}`;
        state.shake = Math.max(state.shake, 3.4);
        context.playSound?.("score");
        if (shouldDropReward({ rate: 0.24, count: state.levelKills, forceAt: [3] })) spawnPowerup(state, hit.x, hit.y);
      } else {
        triggerFlash(hit, 0.12);
      }
    }
    if (bullet.y > -90 && state.boss && overlap(rectFromCenter({ x: bullet.x, y: bullet.y - 2 }, 6, 12), bossRect(state.boss))) {
      state.boss.hp -= 1;
      bullet.y = -99;
      triggerFlash(state.boss, 0.1);
      triggerHitStop(state, 0.035, 0.48);
      addBurst(state.effects, bullet.x, bullet.y, { count: 7, color: classicArcade.cyan, secondary: classicArcade.white, speed: 48, life: 0.18, radius: 4 });
      if (isBossDefeated(state.boss)) {
        addBurst(state.effects, state.boss.x, state.boss.y, { count: 42, color: classicArcade.red, secondary: classicArcade.yellow, speed: 118, radius: 28 });
        addFloatingText(state.effects, state.boss.x, state.boss.y - 22, "+1000", { color: classicArcade.yellow, size: 16 });
        state.score += 1000;
        state.message = "核心战舰击破";
        state.shake = Math.max(state.shake, 8);
        state.boss = null;
        context.playSound?.("win");
      }
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);

  const playerRect = rectFromCenter(player, 24, 26);
  state.powerups = collectPickups(
    state.powerups,
    (item) => overlap(playerRect, pickupRect(item)),
    (item) => applyPowerup(state, item, context)
  );

  const hitByBullet = state.enemyBullets.some((bullet) => overlap(playerRect, rectFromCenter(bullet, 8)));
  const hitByEnemy = state.enemies.some((enemy) => overlap(playerRect, rectFromCenter(enemy, 26, 22)));
  const hitByBoss = state.boss ? overlap(playerRect, bossRect(state.boss)) : false;
  if ((hitByBullet || hitByEnemy || hitByBoss) && player.invuln <= 0) {
    if (state.buffs.shield > 0) {
      state.buffs.shield = 0;
      player.invuln = 1.4;
      state.enemyBullets = [];
      triggerFlash(player, 0.24);
      triggerHitStop(state, 0.06, 0.5);
      addBurst(state.effects, player.x, player.y, { count: 18, color: classicArcade.blue, secondary: classicArcade.white, speed: 96, radius: 13 });
      state.message = "护盾抵消伤害";
      context.playSound?.("move");
      return;
    }
    addBurst(state.effects, player.x, player.y, { count: 22, color: classicArcade.red, secondary: classicArcade.yellow, speed: 104, radius: 13 });
    triggerFlash(player, 0.28);
    triggerHitStop(state, 0.09, 0.35);
    state.shake = Math.max(state.shake, 6);
    player.lives -= 1;
    player.invuln = 1.2;
    state.enemyBullets = [];
    state.message = player.lives > 0 ? "中弹，护盾重启" : "战机坠落";
  }

  if (player.lives <= 0) finish(state, false, context);
  if (state.spawned >= state.levelConfig.waves && !state.enemies.length && !state.boss) {
    if (isFinalStage(state) && state.bossSpawned) finish(state, true, context);
    else if (!isFinalStage(state)) advanceLevel(state, config, context);
  }
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const offset = shakeOffset(state.shake);
  ctx.translate(offset.x, offset.y);
  drawStarfield(ctx, W, H, state.time);
  drawPlayerShip(ctx, state.player);
  drawFlashHalo(ctx, { x: state.player.x - 16, y: state.player.y - 21, w: 32, h: 40 }, { alpha: state.player.flash ? 0.68 : 0, color: classicArcade.yellow });

  for (const enemy of state.enemies) {
    drawEnemyShip(ctx, enemy);
    if (enemy.flash) drawFlashHalo(ctx, { x: enemy.x - 16, y: enemy.y - 16, w: 32, h: 32 }, { alpha: 0.58, color: classicArcade.yellow, pad: 3 });
  }
  if (state.boss) {
    const boss = state.boss;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(-42, -4);
    ctx.lineTo(-24, -22);
    ctx.lineTo(24, -22);
    ctx.lineTo(42, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = classicArcade.magenta;
    ctx.fillRect(-24, -6, 48, 13);
    ctx.fillStyle = classicArcade.yellow;
    ctx.fillRect(-7, -14, 14, 14);
    ctx.restore();
    if (boss.flash) drawFlashHalo(ctx, bossRect(boss), { alpha: 0.62, color: classicArcade.yellow, pad: 5 });
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.fillRect(48, 10, W - 96, 5);
    ctx.fillStyle = classicArcade.red;
    ctx.fillRect(48, 10, (W - 96) * bossHealthRatio(boss), 5);
  }
  state.powerups.forEach((item) => drawPowerup(ctx, item));
  ctx.fillStyle = classicArcade.cyan;
  state.bullets.forEach((bullet) => ctx.fillRect(bullet.x - 2, bullet.y - 8, 4, 12));
  ctx.fillStyle = classicArcade.orange;
  state.enemyBullets.forEach((bullet) => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  drawEffects(ctx, state.effects);
  ctx.restore();
  drawStageTransition(ctx, W, H, state.transition);
}

export function mountSpaceShooter(root, context) {
  const config = CONFIG[context.difficulty] || CONFIG.medium;
  let state = restoreState(config, context.savedState);
  const controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0, pointer: null, pointerOffset: null };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>${context.labels.difficulty} · 5 关空域 · 终关 Boss</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/5</span>
        <span data-lives>生命 ${state.player.lives}</span>
        <span data-score>分数 0</span>
        <span data-kills>击落 0/${state.levelConfig.waves}</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas tall" width="${W}" height="${H}" aria-label="雷霆战机"></canvas></div>
      <div class="arcade-controls">
        ${joystickMarkup("战机移动")}
        <div class="arcade-control-stack">
          <button class="arcade-fire compact" data-action="restart">重开</button>
          <button class="arcade-fire compact" data-action="clear-pointer">停靠</button>
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
  const kills = root.querySelector("[data-kills]");
  const power = document.createElement("span");
  power.dataset.power = "true";
  power.textContent = "道具 无";
  kills.after(power);

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }

  function refreshHud() {
    status.textContent = state.message;
    note.textContent = `${context.labels.difficulty} · 第 ${stageMeta(state)} 关 · ${isFinalStage(state) ? "Boss 空域" : "敌机波次"}`;
    level.textContent = stageLabel(state);
    lives.textContent = `生命 ${state.player.lives}`;
    score.textContent = `分数 ${state.score}`;
    kills.textContent = state.boss ? bossHealthLabel(state.boss) : `击落 ${state.levelKills}/${state.levelConfig.waves}`;
    const buffs = [
      state.buffs.weapon > 0 ? `火力 ${Math.ceil(state.buffs.weapon)}` : "",
      state.buffs.shield > 0 ? `护盾 ${Math.ceil(state.buffs.shield)}` : ""
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

  function restart() {
    state = initialState(config);
    context.clearSession?.();
    controls.pointer = null;
    controls.pointerOffset = null;
    loop.resetClock();
  }

  const onPointerDown = (event) => {
    event.preventDefault();
    const point = toCanvasPoint(event);
    controls.pointerOffset = { x: state.player.x - point.x, y: state.player.y - point.y };
    controls.pointer = { x: state.player.x, y: state.player.y };
  };
  const onPointerMove = (event) => {
    if (!controls.pointerOffset) return;
    event.preventDefault();
    const point = toCanvasPoint(event);
    controls.pointer = {
      x: clamp(point.x + controls.pointerOffset.x, 14, W - 14),
      y: clamp(point.y + controls.pointerOffset.y, 32, H - 18)
    };
  };
  const onPointerLeave = () => {
    controls.pointer = null;
    controls.pointerOffset = null;
  };
  const cleanupJoystick = bindVirtualJoystick(root, controls);
  const cleanupKeys = bindDigitalKeys(controls);
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  root.querySelector("[data-action='clear-pointer']").addEventListener("click", () => { controls.pointer = null; controls.pointerOffset = null; });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerLeave);
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupJoystick();
    cleanupKeys();
    cleanupShellRestart();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerLeave);
    canvas.removeEventListener("pointercancel", onPointerLeave);
  };
}
