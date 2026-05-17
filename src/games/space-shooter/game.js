import { bindDigitalKeys } from "../arcade/controls.js";
import { clamp, rectFromCenter, rectsOverlap as overlap } from "../arcade/collision.js";
import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { drawFlashHalo, feedbackTimeScale, triggerFlash, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { classicArcade, drawPlayerShip, drawPowerup, drawStarfield } from "../arcade/classic-visuals.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { bossHealthRatio, createBoss, isBossDefeated, spawnBossOnce } from "../arcade/bosses.js";
import { announceStageStart, drawStageTransition, updateStageTransition } from "../arcade/progression.js";
import { addPickup, collectPickups, pickupRect, shouldDropReward, updatePickups } from "../arcade/rewards.js";
import { advanceStage, isFinalStage, restoreStageLevel, stageMeta } from "../arcade/stages.js";

const W = 320;
const H = 568;
const PLAYER_MIN_Y = 86;
const BOSS_Y = 92;
const MAX_LEVEL = 160;
const BOSS_INTERVAL = 10;
const CONFIG = { lives: 3, enemyEvery: 0.74, enemySpeed: 70, bulletSpeed: 118 };

const CHAPTERS = [
  { from: 1, name: "曙光边境", subtitle: "基础机群" },
  { from: 21, name: "陨石航道", subtitle: "高速侦察" },
  { from: 41, name: "离子风暴", subtitle: "装甲集群" },
  { from: 61, name: "暗影前线", subtitle: "散射弹幕" },
  { from: 81, name: "星门深处", subtitle: "激光封锁" },
  { from: 101, name: "虚空裂隙", subtitle: "分裂舰群" },
  { from: 121, name: "核心环带", subtitle: "护盾精英" },
  { from: 141, name: "终焉星域", subtitle: "混编决战" }
];

const ENEMY_TYPES = {
  grunt: { unlock: 1, hp: 1, score: 80, speed: 1, fire: 1, bullet: "single", color: classicArcade.magenta, weight: 7 },
  scout: { unlock: 3, hp: 1, score: 75, speed: 1.45, fire: 1.28, bullet: "single", color: classicArcade.cyan, weight: 4 },
  armored: { unlock: 7, hp: 3, score: 135, speed: 0.78, fire: 0.95, bullet: "single", color: classicArcade.red, weight: 3 },
  scatter: { unlock: 14, hp: 2, score: 155, speed: 0.94, fire: 0.82, bullet: "spread", color: classicArcade.orange, weight: 3 },
  rusher: { unlock: 24, hp: 2, score: 125, speed: 1.62, fire: 1.4, bullet: "none", color: classicArcade.yellow, weight: 3 },
  laser: { unlock: 35, hp: 2, score: 175, speed: 0.88, fire: 0.72, bullet: "laser", color: classicArcade.blue, weight: 2 },
  splitter: { unlock: 50, hp: 3, score: 195, speed: 0.86, fire: 0.9, bullet: "single", color: classicArcade.green, weight: 2 },
  shield: { unlock: 70, hp: 4, score: 235, speed: 0.76, fire: 0.76, bullet: "spread", color: "#f8fbff", weight: 2 },
  carrier: { unlock: 95, hp: 5, score: 280, speed: 0.7, fire: 0.68, bullet: "burst", color: "#d45cff", weight: 1.5 },
  commander: { unlock: 130, hp: 6, score: 360, speed: 0.68, fire: 0.56, bullet: "command", color: "#ff4d5e", weight: 1 }
};

function isBossLevel(level) {
  return level % BOSS_INTERVAL === 0 || level >= MAX_LEVEL;
}

function chapterFor(level) {
  return [...CHAPTERS].reverse().find((chapter) => level >= chapter.from) || CHAPTERS[0];
}

function levelTuning(level) {
  const chapter = chapterFor(level);
  const rank = (level - 1) / (MAX_LEVEL - 1);
  const chapterIndex = Math.floor((level - 1) / 20);
  const scoreTarget = Math.round(380 + level * 42 + Math.pow(level, 1.13) * 14 + chapterIndex * 120);
  return {
    chapter,
    scoreTarget,
    enemyEvery: Math.max(0.28, CONFIG.enemyEvery - rank * 0.34 - chapterIndex * 0.015),
    enemySpeed: CONFIG.enemySpeed + rank * 86 + chapterIndex * 2,
    bulletSpeed: CONFIG.bulletSpeed + rank * 118 + chapterIndex * 4,
    bossHp: Math.round(36 + level * 4.9 + chapterIndex * 18),
    maxEnemyCount: 5 + Math.min(7, chapterIndex),
    bossStage: isBossLevel(level)
  };
}

function initialState() {
  const levelConfig = levelTuning(1);
  return {
    level: 1,
    maxLevel: MAX_LEVEL,
    levelConfig,
    player: { x: W / 2, y: H - 58, lives: CONFIG.lives, reload: 0, invuln: 1 },
    enemies: [],
    boss: null,
    bossSpawned: false,
    bullets: [],
    enemyBullets: [],
    powerups: [],
    buffs: { weapon: 0, shield: 0, laser: 0, wingman: 0 },
    spawned: 0,
    killed: 0,
    levelDestroyed: 0,
    levelScore: 0,
    escaped: 0,
    score: 0,
    enemyId: 1,
    spawnTimer: 0.4,
    time: 0,
    over: false,
    won: false,
    message: "第 1 关：曙光边境",
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
  snapshot.version = 2;
  return snapshot;
}

function restoreState(savedState) {
  if (!savedState || savedState.version !== 2 || savedState.over) return initialState();
  const fallback = initialState();
  const snapshot = clonePlain(savedState);
  const level = restoreStageLevel(snapshot.level, MAX_LEVEL);
  return {
    ...fallback,
    ...snapshot,
    level,
    maxLevel: MAX_LEVEL,
    levelConfig: levelTuning(level),
    buffs: { weapon: 0, shield: 0, laser: 0, wingman: 0, ...(snapshot.buffs || {}) },
    effects: [],
    transition: null,
    feedback: null,
    shake: 0,
    over: false,
    won: false
  };
}

function levelProgress(state) {
  return clamp(state.levelScore / Math.max(1, state.levelConfig.scoreTarget), 0, 1);
}

function campaignProgress(state) {
  return clamp(((state.level - 1) + levelProgress(state)) / state.maxLevel, 0, 1);
}

function sessionMeta(state) {
  return {
    level: stageMeta(state),
    score: state.score,
    progress: `${Math.round(campaignProgress(state) * 100)}%`
  };
}

function addScore(state, amount) {
  state.score += amount;
  state.levelScore += amount;
}

function advanceLevel(state, context) {
  advanceStage(state);
  state.levelConfig = levelTuning(state.level);
  state.enemies = [];
  state.boss = null;
  state.bossSpawned = false;
  state.bullets = [];
  state.enemyBullets = [];
  state.powerups = [];
  state.spawned = 0;
  state.levelDestroyed = 0;
  state.levelScore = 0;
  state.spawnTimer = 0.65;
  state.player.x = W / 2;
  state.player.y = H - 58;
  state.player.invuln = 1.25;
  const chapter = state.levelConfig.chapter;
  announceStageStart(state, context, {
    message: `第 ${state.level} 关：${chapter.name}`,
    transition: {
      title: `第 ${stageMeta(state)} 关`,
      subtitle: state.levelConfig.bossStage ? `${chapter.subtitle} · Boss 空域` : chapter.subtitle
    },
    effects: state.effects,
    position: { x: W / 2, y: H / 2 },
    burst: { count: 30, color: classicArcade.cyan, secondary: classicArcade.yellow, speed: 92, radius: 24 },
    shake: 3.2
  });
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "突破终焉星域" : "战机坠落";
  context.clearSession?.();
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    detail: state.message,
    score: state.score,
    moves: Math.round(state.time)
  });
}

function availableEnemyTypes(level) {
  return Object.entries(ENEMY_TYPES)
    .filter(([, spec]) => level >= spec.unlock)
    .map(([type, spec]) => ({ type, spec }));
}

function enemyWeight(type, spec, level) {
  const age = Math.max(0, level - spec.unlock);
  const lateBoost = ["laser", "splitter", "shield", "carrier", "commander"].includes(type) ? Math.min(5, age / 16) : 0;
  const earlyFade = type === "grunt" ? Math.max(0.35, 1 - level / 190) : 1;
  return (spec.weight + lateBoost) * earlyFade;
}

function chooseEnemyType(level) {
  const entries = availableEnemyTypes(level);
  const total = entries.reduce((sum, entry) => sum + enemyWeight(entry.type, entry.spec, level), 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= enemyWeight(entry.type, entry.spec, level);
    if (roll <= 0) return entry.type;
  }
  return entries[0]?.type || "grunt";
}

function makeEnemy(state, type, x, y, overrides = {}) {
  const spec = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
  const hpBonus = Math.floor(Math.max(0, state.level - spec.unlock) / 55);
  const hp = Math.max(1, spec.hp + hpBonus + (overrides.hpBonus || 0));
  return {
    id: state.enemyId++,
    type,
    x,
    y,
    vx: overrides.vx ?? (Math.random() - 0.5) * (type === "scout" ? 88 : 46),
    hp,
    maxHp: hp,
    score: spec.score + Math.floor(state.level * 1.5),
    speedMul: overrides.speedMul ?? spec.speed,
    fire: overrides.fire ?? (0.62 + Math.random() * 0.8),
    phase: Math.random() * Math.PI * 2,
    bullet: spec.bullet
  };
}

function spawnEnemy(state) {
  if (levelProgress(state) >= 1 || state.enemies.length >= state.levelConfig.maxEnemyCount) return;
  const type = chooseEnemyType(state.level);
  const x = 24 + Math.random() * (W - 48);
  state.enemies.push(makeEnemy(state, type, x, -24));
  state.spawned += 1;
}

function spawnPowerup(state, x, y) {
  const types = ["weapon", "shield", "repair", "clear"];
  if (state.level >= 8) types.push("laser");
  if (state.level >= 14) types.push("wingman");
  if (state.level >= 55) types.push("laser", "wingman");
  addPickup(state.powerups, types, { x, y }, { vy: 44, ttl: 9 });
}

function applyPowerup(state, item, context) {
  if (item.type === "weapon") {
    state.buffs.weapon = 10;
    state.message = "散弹火力：侧翼弹道展开";
  } else if (item.type === "laser") {
    state.buffs.laser = 8;
    state.message = "激光武器：穿透射束启动";
  } else if (item.type === "wingman") {
    state.buffs.wingman = 12;
    state.message = "僚机上线：辅助射击";
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

function spawnBoss(state, context) {
  const chapter = state.levelConfig.chapter;
  spawnBossOnce(state, () => createBoss({
    x: W / 2,
    y: BOSS_Y,
    vx: 54 + Math.min(42, state.level * 0.28),
    hp: state.levelConfig.bossHp,
    fire: 0.5
  }), {
    context,
    intro: {
      message: `Boss 出现：${chapter.name} 指挥舰`,
      title: "Boss 出现",
      subtitle: `${chapter.name} 指挥舰`,
      effects: state.effects,
      position: { x: W / 2, y: BOSS_Y },
      burst: { count: 38, color: classicArcade.red, secondary: classicArcade.magenta, speed: 92, radius: 30 },
      shake: 5,
      flash: 0.44,
      hitStop: 0.08,
      hitStopScale: 0.42
    }
  });
}

function bossRect(boss) {
  return { x: boss.x - 40, y: boss.y - 20, w: 80, h: 44 };
}

function bulletRect(bullet) {
  if (bullet.kind === "laser") return rectFromCenter({ x: bullet.x, y: bullet.y - 8 }, 8, 28);
  return rectFromCenter({ x: bullet.x, y: bullet.y - 2 }, 6, 12);
}

function fireEnemy(state, enemy) {
  const speed = state.levelConfig.bulletSpeed;
  if (enemy.bullet === "none") return;
  if (enemy.bullet === "spread") {
    [-0.42, 0, 0.42].forEach((angle) => {
      state.enemyBullets.push({ x: enemy.x, y: enemy.y + 12, vx: Math.sin(angle) * 68, vy: speed * (0.92 + Math.abs(angle) * 0.2) });
    });
  } else if (enemy.bullet === "laser") {
    state.enemyBullets.push({ x: enemy.x, y: enemy.y + 15, vy: speed * 1.38, kind: "laser" });
  } else if (enemy.bullet === "burst" || enemy.bullet === "command") {
    const angles = enemy.bullet === "command" ? [-0.58, -0.28, 0, 0.28, 0.58] : [-0.3, 0.3];
    angles.forEach((angle) => {
      state.enemyBullets.push({ x: enemy.x, y: enemy.y + 14, vx: Math.sin(angle) * 84, vy: speed * (0.9 + Math.abs(angle) * 0.24) });
    });
  } else {
    state.enemyBullets.push({ x: enemy.x, y: enemy.y + 14, vy: speed });
  }
  enemy.fire = Math.max(0.34, 1.05 / ENEMY_TYPES[enemy.type].fire - state.level * 0.002) + Math.random() * 0.55;
}

function updateEnemy(state, enemy, dt, player) {
  enemy.y += state.levelConfig.enemySpeed * enemy.speedMul * dt;
  enemy.x += enemy.vx * dt;
  enemy.phase += dt * (enemy.type === "scout" ? 5 : 3);
  if (enemy.type === "scout" || enemy.type === "laser") enemy.x += Math.sin(enemy.phase) * 34 * dt;
  if (enemy.type === "rusher") enemy.x += Math.sign(player.x - enemy.x) * 42 * dt;
  if (enemy.type === "carrier" || enemy.type === "commander") enemy.x += Math.sin(state.time * 1.7 + enemy.phase) * 24 * dt;
  if (enemy.x < 16 || enemy.x > W - 16) {
    enemy.x = clamp(enemy.x, 16, W - 16);
    enemy.vx *= -1;
  }
  enemy.fire -= dt;
  if (enemy.fire <= 0 && enemy.y > 18) fireEnemy(state, enemy);
}

function destroyEnemy(state, enemy, context) {
  const score = enemy.score;
  addBurst(state.effects, enemy.x, enemy.y, { count: enemy.type === "carrier" || enemy.type === "commander" ? 28 : 18, color: classicArcade.red, secondary: classicArcade.yellow, speed: 94, radius: enemy.maxHp > 3 ? 15 : 11 });
  addFloatingText(state.effects, enemy.x, enemy.y - 14, `+${score}`, { color: classicArcade.yellow });
  addScore(state, score);
  state.killed += 1;
  state.levelDestroyed += 1;
  state.message = `第 ${state.level} 关积分 ${state.levelScore}/${state.levelConfig.scoreTarget}`;
  state.shake = Math.max(state.shake, enemy.maxHp > 3 ? 4.8 : 3.2);
  context.playSound?.("score");

  if (enemy.type === "splitter") {
    [-1, 1].forEach((dir) => {
      state.enemies.push(makeEnemy(state, "scout", clamp(enemy.x + dir * 18, 18, W - 18), enemy.y, { vx: dir * 70, speedMul: 1.72, hpBonus: -1, fire: 0.8 }));
    });
  }
  if ((enemy.type === "carrier" || enemy.type === "commander") && state.enemies.length < state.levelConfig.maxEnemyCount + 2) {
    [-1, 1].forEach((dir) => {
      state.enemies.push(makeEnemy(state, "grunt", clamp(enemy.x + dir * 22, 18, W - 18), enemy.y + 6, { vx: dir * 58, speedMul: 1.18, fire: 0.7 }));
    });
  }
  if (enemy.type === "carrier" || shouldDropReward({ rate: 0.22, count: state.levelDestroyed, forceAt: [4] })) {
    spawnPowerup(state, enemy.x, enemy.y, enemy.type === "carrier");
  }
}

function updateBoss(state, dt) {
  const boss = state.boss;
  if (!boss) return;
  boss.x += boss.vx * dt;
  if (boss.x < 48 || boss.x > W - 48) {
    boss.x = clamp(boss.x, 48, W - 48);
    boss.vx *= -1;
  }
  boss.y = BOSS_Y + Math.sin(state.time * 1.35) * 9;
  boss.fire -= dt;
  if (boss.fire <= 0) {
    const pattern = state.level >= 90 ? [-0.7, -0.35, 0, 0.35, 0.7] : [-0.55, 0, 0.55];
    pattern.forEach((angle) => {
      state.enemyBullets.push({
        x: boss.x,
        y: boss.y + 24,
        vx: Math.sin(angle) * 82,
        vy: state.levelConfig.bulletSpeed * (0.92 + Math.abs(angle) * 0.18)
      });
    });
    if (state.level >= 60) {
      state.enemyBullets.push({ x: boss.x - 28, y: boss.y + 20, vy: state.levelConfig.bulletSpeed * 1.35, kind: "laser" });
      state.enemyBullets.push({ x: boss.x + 28, y: boss.y + 20, vy: state.levelConfig.bulletSpeed * 1.35, kind: "laser" });
    }
    boss.fire = Math.max(0.38, 0.72 - state.level * 0.0016);
  }
}

function firePlayer(state, player) {
  const laser = state.buffs.laser > 0;
  state.bullets.push({ x: player.x - 5, y: player.y - 17, vy: laser ? -330 : -255, damage: laser ? 2 : 1, kind: laser ? "laser" : "bolt", pierce: laser ? 2 : 0 });
  state.bullets.push({ x: player.x + 5, y: player.y - 17, vy: laser ? -330 : -255, damage: laser ? 2 : 1, kind: laser ? "laser" : "bolt", pierce: laser ? 2 : 0 });
  if (state.buffs.weapon > 0) {
    state.bullets.push({ x: player.x - 16, y: player.y - 11, vx: -44, vy: -238, damage: 1, kind: "bolt" });
    state.bullets.push({ x: player.x + 16, y: player.y - 11, vx: 44, vy: -238, damage: 1, kind: "bolt" });
  }
  if (state.buffs.wingman > 0) {
    state.bullets.push({ x: player.x - 30, y: player.y - 7, vy: -236, damage: 1, kind: "wing" });
    state.bullets.push({ x: player.x + 30, y: player.y - 7, vy: -236, damage: 1, kind: "wing" });
  }
  addBurst(state.effects, player.x, player.y - 18, { count: laser ? 6 : 4, color: classicArcade.cyan, secondary: classicArcade.white, speed: 34, life: 0.12, radius: 3 });
  player.reload = laser ? 0.14 : 0.18;
}

function handleBossDefeated(state, context) {
  const bonus = 1100 + state.level * 26;
  addScore(state, bonus);
  addBurst(state.effects, state.boss.x, state.boss.y, { count: 48, color: classicArcade.red, secondary: classicArcade.yellow, speed: 122, radius: 30 });
  addFloatingText(state.effects, state.boss.x, state.boss.y - 24, `+${bonus}`, { color: classicArcade.yellow, size: 16 });
  state.message = `${state.levelConfig.chapter.name} 指挥舰击破`;
  state.shake = Math.max(state.shake, 8);
  state.boss = null;
  context.playSound?.("win");
  if (isFinalStage(state)) finish(state, true, context);
  else advanceLevel(state, context);
}

function maybeAdvanceByScore(state, context) {
  if (state.over || state.boss) return;
  if (levelProgress(state) < 1) return;
  if (state.levelConfig.bossStage) {
    if (!state.bossSpawned) {
      state.enemies = [];
      state.enemyBullets = [];
      spawnBoss(state, context);
    }
    return;
  }
  if (isFinalStage(state)) finish(state, true, context);
  else advanceLevel(state, context);
}

function update(state, controls, dt, context, rawDt = dt) {
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
  player.x = clamp(player.x + moveX * 168 * dt, 14, W - 14);
  player.y = clamp(player.y + moveY * 168 * dt, PLAYER_MIN_Y, H - 18);
  if (controls.pointer) {
    player.x += (controls.pointer.x - player.x) * Math.min(1, dt * 13);
    player.y += (controls.pointer.y - player.y) * Math.min(1, dt * 13);
  }
  player.reload -= dt;
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.reload <= 0) firePlayer(state, player);

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state);
    state.spawnTimer = state.levelConfig.enemyEvery * (0.82 + Math.random() * 0.38);
  }

  for (const enemy of state.enemies) updateEnemy(state, enemy, dt, player);
  updateBoss(state, dt);

  const activeEnemies = [];
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.y < H + 30) activeEnemies.push(enemy);
    else state.escaped += 1;
  }
  state.enemies = activeEnemies;

  for (const bullet of state.bullets) {
    bullet.x += (bullet.vx || 0) * dt;
    bullet.y += bullet.vy * dt;
    const hit = state.enemies.find((enemy) => overlap(bulletRect(bullet), rectFromCenter(enemy, enemy.maxHp > 3 ? 32 : 26, enemy.maxHp > 3 ? 26 : 22)));
    if (hit) {
      hit.hp -= bullet.damage || 1;
      addBurst(state.effects, bullet.x, bullet.y, { count: bullet.kind === "laser" ? 8 : 5, color: classicArcade.cyan, secondary: classicArcade.white, speed: 46, life: 0.16, radius: 4 });
      if (hit.hp <= 0) destroyEnemy(state, hit, context);
      else triggerFlash(hit, 0.12);
      if (bullet.pierce > 0) {
        bullet.pierce -= 1;
        bullet.y -= 14;
      } else {
        bullet.y = -99;
      }
    }
    if (bullet.y > -90 && state.boss && overlap(bulletRect(bullet), bossRect(state.boss))) {
      state.boss.hp -= bullet.damage || 1;
      triggerFlash(state.boss, 0.1);
      triggerHitStop(state, 0.035, 0.48);
      addBurst(state.effects, bullet.x, bullet.y, { count: bullet.kind === "laser" ? 9 : 6, color: classicArcade.cyan, secondary: classicArcade.white, speed: 48, life: 0.18, radius: 4 });
      if (bullet.pierce > 0) bullet.pierce -= 1;
      else bullet.y = -99;
      if (isBossDefeated(state.boss)) handleBossDefeated(state, context);
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  state.bullets = state.bullets.filter((bullet) => bullet.y > -24 && bullet.x > -24 && bullet.x < W + 24);

  for (const bullet of state.enemyBullets) {
    bullet.x += (bullet.vx || 0) * dt;
    bullet.y += bullet.vy * dt;
  }
  state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.y < H + 26 && bullet.x > -26 && bullet.x < W + 26);
  state.powerups = updatePickups(state.powerups, dt, { maxY: H, margin: 20 });

  const playerRect = rectFromCenter(player, 24, 26);
  state.powerups = collectPickups(
    state.powerups,
    (item) => overlap(playerRect, pickupRect(item)),
    (item) => applyPowerup(state, item, context)
  );

  const hitByBullet = state.enemyBullets.some((bullet) => overlap(playerRect, rectFromCenter(bullet, bullet.kind === "laser" ? 10 : 8, bullet.kind === "laser" ? 16 : 8)));
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
    addBurst(state.effects, player.x, player.y, { count: 24, color: classicArcade.red, secondary: classicArcade.yellow, speed: 106, radius: 13 });
    triggerFlash(player, 0.28);
    triggerHitStop(state, 0.09, 0.35);
    state.shake = Math.max(state.shake, 6);
    player.lives -= 1;
    player.invuln = 1.25;
    state.enemyBullets = [];
    state.message = player.lives > 0 ? "中弹，护盾重启" : "战机坠落";
  }

  if (player.lives <= 0) finish(state, false, context);
  maybeAdvanceByScore(state, context);
}

function enemyColor(enemy) {
  return ENEMY_TYPES[enemy.type]?.color || classicArcade.magenta;
}

function drawEnemy(ctx, enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  const color = enemyColor(enemy);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (enemy.type === "rusher") {
    ctx.moveTo(0, 19);
    ctx.lineTo(-10, -14);
    ctx.lineTo(0, -7);
    ctx.lineTo(10, -14);
  } else if (enemy.type === "armored" || enemy.type === "shield" || enemy.type === "carrier" || enemy.type === "commander") {
    ctx.moveTo(0, 17);
    ctx.lineTo(-19, 0);
    ctx.lineTo(-14, -14);
    ctx.lineTo(14, -14);
    ctx.lineTo(19, 0);
  } else {
    ctx.moveTo(0, 16);
    ctx.lineTo(-17, -10);
    ctx.lineTo(-6, -5);
    ctx.lineTo(0, -15);
    ctx.lineTo(6, -5);
    ctx.lineTo(17, -10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = enemy.type === "shield" ? classicArcade.blue : classicArcade.yellow;
  ctx.fillRect(-4, -4, 8, 8);
  if (enemy.type === "laser") {
    ctx.fillStyle = classicArcade.cyan;
    ctx.fillRect(-2, 5, 4, 12);
  }
  if (enemy.type === "shield") {
    ctx.strokeStyle = "rgba(248,251,255,.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (enemy.maxHp > 1) {
    ctx.fillStyle = "rgba(248,251,255,.28)";
    ctx.fillRect(-13, -23, 26, 3);
    ctx.fillStyle = color;
    ctx.fillRect(-13, -23, 26 * clamp(enemy.hp / enemy.maxHp, 0, 1), 3);
  }
  ctx.restore();
}

function drawWingmen(ctx, player) {
  [-28, 28].forEach((offset) => {
    ctx.save();
    ctx.translate(player.x + offset, player.y + 14);
    ctx.fillStyle = classicArcade.green;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawBoss(ctx, state) {
  const boss = state.boss;
  if (!boss) return;
  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.fillStyle = classicArcade.red;
  ctx.beginPath();
  ctx.moveTo(0, 27);
  ctx.lineTo(-46, -3);
  ctx.lineTo(-28, -24);
  ctx.lineTo(28, -24);
  ctx.lineTo(46, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = classicArcade.magenta;
  ctx.fillRect(-27, -7, 54, 15);
  ctx.fillStyle = classicArcade.yellow;
  ctx.fillRect(-8, -16, 16, 15);
  ctx.restore();
  if (boss.flash) drawFlashHalo(ctx, bossRect(boss), { alpha: 0.62, color: classicArcade.yellow, pad: 5 });
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.fillRect(50, 26, W - 100, 6);
  ctx.fillStyle = classicArcade.red;
  ctx.fillRect(50, 26, (W - 100) * bossHealthRatio(boss), 6);
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const offset = shakeOffset(state.shake);
  ctx.translate(offset.x, offset.y);
  drawStarfield(ctx, W, H, state.time);
  if (state.buffs.wingman > 0) drawWingmen(ctx, state.player);
  drawPlayerShip(ctx, state.player);
  drawFlashHalo(ctx, { x: state.player.x - 16, y: state.player.y - 21, w: 32, h: 40 }, { alpha: state.player.flash ? 0.68 : 0, color: classicArcade.yellow });

  for (const enemy of state.enemies) {
    drawEnemy(ctx, enemy);
    if (enemy.flash) drawFlashHalo(ctx, { x: enemy.x - 17, y: enemy.y - 17, w: 34, h: 34 }, { alpha: 0.58, color: classicArcade.yellow, pad: 3 });
  }
  drawBoss(ctx, state);
  state.powerups.forEach((item) => drawPowerup(ctx, item));
  state.bullets.forEach((bullet) => {
    ctx.fillStyle = bullet.kind === "laser" ? classicArcade.cyan : bullet.kind === "wing" ? classicArcade.green : classicArcade.white;
    if (bullet.kind === "laser") ctx.fillRect(bullet.x - 3, bullet.y - 16, 6, 28);
    else ctx.fillRect(bullet.x - 2, bullet.y - 8, 4, 12);
  });
  state.enemyBullets.forEach((bullet) => {
    ctx.fillStyle = bullet.kind === "laser" ? classicArcade.red : classicArcade.orange;
    if (bullet.kind === "laser") {
      ctx.fillRect(bullet.x - 3, bullet.y - 10, 6, 18);
    } else {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  drawEffects(ctx, state.effects);
  ctx.restore();
  drawStageTransition(ctx, W, H, state.transition);
}

function buffLabel(state) {
  const buffs = [
    state.buffs.weapon > 0 ? `散弹 ${Math.ceil(state.buffs.weapon)}` : "",
    state.buffs.laser > 0 ? `激光 ${Math.ceil(state.buffs.laser)}` : "",
    state.buffs.wingman > 0 ? `僚机 ${Math.ceil(state.buffs.wingman)}` : "",
    state.buffs.shield > 0 ? `护盾 ${Math.ceil(state.buffs.shield)}` : ""
  ].filter(Boolean);
  return buffs.length ? buffs.join(" · ") : "道具 无";
}

export function mountSpaceShooter(root, context) {
  let state = restoreState(context.savedState);
  const controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0, pointer: null, pointerOffset: null };

  root.innerHTML = `
    <section class="game-panel game-status space-shooter-hud">
      <div class="space-hud-top">
        <strong data-status>${state.message}</strong>
        <span data-level>关卡 1/${MAX_LEVEL}</span>
      </div>
      <div class="space-progress-grid">
        <label>
          <span>通关</span>
          <i><b data-clear-progress></b></i>
          <em data-clear-text>0%</em>
        </label>
        <label>
          <span>积分</span>
          <i><b data-score-progress></b></i>
          <em data-score-target>${state.levelScore}/${state.levelConfig.scoreTarget}</em>
        </label>
      </div>
      <div class="mini-stats">
        <span data-lives>生命 ${state.player.lives}</span>
        <span data-score>分数 ${state.score}</span>
        <span data-kills>击坠 0</span>
        <span data-power>道具 无</span>
      </div>
    </section>
    <section class="arcade-shell space-shooter-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas tall space-shooter-canvas" width="${W}" height="${H}" aria-label="雷霆战机"></canvas></div>
    </section>
  `;
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const level = root.querySelector("[data-level]");
  const clearProgress = root.querySelector("[data-clear-progress]");
  const clearText = root.querySelector("[data-clear-text]");
  const scoreProgress = root.querySelector("[data-score-progress]");
  const scoreTarget = root.querySelector("[data-score-target]");
  const lives = root.querySelector("[data-lives]");
  const score = root.querySelector("[data-score]");
  const kills = root.querySelector("[data-kills]");
  const power = root.querySelector("[data-power]");

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }

  function refreshHud() {
    const passValue = campaignProgress(state) * 100;
    const passPercent = passValue < 10 ? passValue.toFixed(1) : String(Math.round(passValue));
    const scorePercent = Math.round(levelProgress(state) * 100);
    status.textContent = state.message;
    level.textContent = `关卡 ${state.level}/${state.maxLevel} · ${state.levelConfig.chapter.name}`;
    clearProgress.style.width = `${passValue}%`;
    clearText.textContent = `${passPercent}%`;
    scoreProgress.style.width = `${scorePercent}%`;
    scoreTarget.textContent = state.boss ? "Boss 战" : `${state.levelScore}/${state.levelConfig.scoreTarget}`;
    lives.textContent = `生命 ${state.player.lives}`;
    score.textContent = `分数 ${state.score}`;
    kills.textContent = state.boss ? `Boss ${Math.max(0, state.boss.hp)}/${state.boss.maxHp}` : `击坠 ${state.levelDestroyed}`;
    power.textContent = buffLabel(state);
  }

  const loop = createArcadeLoop({
    context,
    timeScale: () => feedbackTimeScale(state),
    update: (dt, rawDt) => update(state, controls, dt, context, rawDt),
    draw: () => {
      draw(state, ctx);
      refreshHud();
    },
    save: () => {
      if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    }
  });

  function restart() {
    state = initialState();
    context.clearSession?.();
    controls.pointer = null;
    controls.pointerOffset = null;
    loop.resetClock();
  }

  const onPointerDown = (event) => {
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
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
      y: clamp(point.y + controls.pointerOffset.y, PLAYER_MIN_Y, H - 18)
    };
  };
  const onPointerLeave = (event) => {
    canvas.releasePointerCapture?.(event.pointerId);
    controls.pointer = null;
    controls.pointerOffset = null;
  };
  const cleanupKeys = bindDigitalKeys(controls);
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerLeave);
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupKeys();
    cleanupShellRestart();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerLeave);
    canvas.removeEventListener("pointercancel", onPointerLeave);
  };
}
