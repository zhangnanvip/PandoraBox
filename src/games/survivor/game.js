import { DIRECTION_KEY_MAP, bindDigitalKeys } from "../arcade/controls.js";
import { clamp, distance } from "../arcade/collision.js";
import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { feedbackTimeScale, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { classicArcade } from "../arcade/classic-visuals.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const W = 360;
const H = 568;
const WORLD = 1180;
const MAX_LEVEL = 60;
const BOSS_INTERVAL = 5;
const SAVE_KEY = "survivor:campaign";

const ENEMIES = {
  crawler: { unlock: 1, hp: 12, speed: 38, damage: 7, xp: 3, score: 18, radius: 10, color: "#ff7a7a", weight: 8 },
  bat: { unlock: 2, hp: 8, speed: 68, damage: 5, xp: 3, score: 16, radius: 8, color: "#7bd4ff", weight: 5 },
  brute: { unlock: 4, hp: 42, speed: 28, damage: 13, xp: 8, score: 55, radius: 15, color: "#ffb84d", weight: 3 },
  spitter: { unlock: 7, hp: 24, speed: 34, damage: 9, xp: 7, score: 44, radius: 12, color: "#8ce8bd", weight: 3 },
  charger: { unlock: 11, hp: 34, speed: 78, damage: 15, xp: 9, score: 60, radius: 12, color: "#ff4d8d", weight: 2.5 },
  shield: { unlock: 17, hp: 72, speed: 30, damage: 16, xp: 14, score: 90, radius: 16, color: "#f8fbff", weight: 1.8 },
  elite: { unlock: 25, hp: 120, speed: 42, damage: 22, xp: 26, score: 160, radius: 18, color: "#d45cff", weight: 1.2 }
};

const UPGRADES = [
  { id: "knife", title: "飞刃", desc: "提高自动射击数量与伤害", max: 6 },
  { id: "aura", title: "灵能环", desc: "近身范围持续伤害", max: 5 },
  { id: "orbit", title: "护身轮", desc: "环绕弹击退贴身敌人", max: 5 },
  { id: "lightning", title: "雷链", desc: "定时打击多名敌人", max: 5 },
  { id: "speed", title: "疾行", desc: "提升移动速度与拾取距离", max: 4 },
  { id: "vitality", title: "体魄", desc: "提升生命上限并回复", max: 4 },
  { id: "magnet", title: "磁吸", desc: "扩大经验与补给拾取范围", max: 4 }
];

function levelTuning(level) {
  const chapter = Math.floor((level - 1) / 10);
  return {
    duration: 68 + Math.min(42, level * 2),
    spawnEvery: Math.max(0.22, 0.78 - level * 0.012 - chapter * 0.035),
    maxEnemies: Math.min(120, 38 + level * 2 + chapter * 6),
    hpScale: 1 + level * 0.13 + chapter * 0.25,
    speedScale: 1 + level * 0.012,
    bossHp: Math.round(260 + level * 58 + chapter * 180),
    bossStage: level % BOSS_INTERVAL === 0
  };
}

function initialState() {
  return {
    version: 1,
    level: 1,
    maxLevel: MAX_LEVEL,
    player: {
      x: WORLD / 2,
      y: WORLD / 2,
      hp: 100,
      maxHp: 100,
      speed: 116,
      radius: 12,
      invuln: 1,
      level: 1,
      xp: 0,
      xpNeed: 22
    },
    skills: { knife: 1, aura: 0, orbit: 0, lightning: 0, speed: 0, vitality: 0, magnet: 0 },
    enemies: [],
    projectiles: [],
    enemyShots: [],
    pickups: [],
    effects: [],
    controls: { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 },
    spawnTimer: 0.2,
    attackTimer: 0,
    lightningTimer: 2.5,
    bossSpawned: false,
    bossAlive: false,
    enemyId: 1,
    time: 0,
    score: 0,
    kills: 0,
    stageKills: 0,
    message: "拖动画布移动，武器会自动攻击",
    choices: [],
    shake: 0,
    over: false,
    won: false
  };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function restoreState(saved) {
  if (!saved || saved.version !== 1 || saved.over) return initialState();
  return {
    ...initialState(),
    ...clonePlain(saved),
    controls: { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 },
    effects: [],
    choices: [],
    shake: 0,
    over: false,
    won: false
  };
}

function serializeState(state) {
  const snapshot = clonePlain(state);
  snapshot.controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 };
  snapshot.effects = [];
  snapshot.choices = [];
  snapshot.shake = 0;
  snapshot.over = false;
  snapshot.won = false;
  return snapshot;
}

function sessionMeta(state) {
  const tuning = levelTuning(state.level);
  return {
    level: `${state.level}/${MAX_LEVEL}`,
    stage: `${Math.floor(state.time)}/${tuning.duration}s · 击破 ${state.stageKills}`,
    score: state.score
  };
}

function worldToScreen(state, x, y) {
  const camera = cameraFor(state);
  return { x: x - camera.x, y: y - camera.y };
}

function cameraFor(state) {
  return {
    x: clamp(state.player.x - W / 2, 0, WORLD - W),
    y: clamp(state.player.y - H / 2, 0, WORLD - H)
  };
}

function enemySpec(type) {
  return ENEMIES[type] || ENEMIES.crawler;
}

function availableEnemyTypes(level) {
  return Object.entries(ENEMIES).filter(([, spec]) => level >= spec.unlock);
}

function chooseEnemyType(level) {
  const entries = availableEnemyTypes(level);
  const total = entries.reduce((sum, [type, spec]) => {
    const late = ["shield", "elite"].includes(type) ? Math.min(4, (level - spec.unlock) / 10) : 0;
    return sum + spec.weight + late;
  }, 0);
  let roll = Math.random() * total;
  for (const [type, spec] of entries) {
    const late = ["shield", "elite"].includes(type) ? Math.min(4, (level - spec.unlock) / 10) : 0;
    roll -= spec.weight + late;
    if (roll <= 0) return type;
  }
  return "crawler";
}

function spawnPointNearPlayer(state, distanceFromPlayer = 360) {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: clamp(state.player.x + Math.cos(angle) * distanceFromPlayer, 24, WORLD - 24),
    y: clamp(state.player.y + Math.sin(angle) * distanceFromPlayer, 24, WORLD - 24)
  };
}

function makeEnemy(state, type, point, boss = false) {
  const tuning = levelTuning(state.level);
  const spec = enemySpec(type);
  const hp = boss ? tuning.bossHp : Math.round(spec.hp * tuning.hpScale);
  return {
    id: state.enemyId++,
    type,
    x: point.x,
    y: point.y,
    radius: boss ? 32 : spec.radius,
    hp,
    maxHp: hp,
    speed: boss ? 34 + state.level * 0.8 : spec.speed * tuning.speedScale,
    damage: boss ? 26 + state.level : spec.damage,
    xp: boss ? 80 + state.level * 4 : spec.xp,
    score: boss ? 900 + state.level * 30 : spec.score,
    color: boss ? "#ff4d5e" : spec.color,
    boss,
    shoot: boss ? 1.2 : type === "spitter" ? 1.8 : 0,
    phase: Math.random() * Math.PI * 2,
    flash: 0
  };
}

function spawnEnemy(state) {
  const tuning = levelTuning(state.level);
  if (state.enemies.length >= tuning.maxEnemies || state.choices.length) return;
  const type = chooseEnemyType(state.level);
  state.enemies.push(makeEnemy(state, type, spawnPointNearPlayer(state)));
}

function spawnBoss(state) {
  if (state.bossSpawned || !levelTuning(state.level).bossStage) return;
  state.bossSpawned = true;
  state.bossAlive = true;
  state.enemies.push(makeEnemy(state, "elite", spawnPointNearPlayer(state, 300), true));
  state.message = "Boss 入场";
  addFloatingText(state.effects, state.player.x, state.player.y - 42, "Boss", { color: classicArcade.red, size: 22 });
}

function nearestEnemy(state, range = 520) {
  let best = null;
  let bestDistance = range;
  for (const enemy of state.enemies) {
    const d = distance(state.player, enemy);
    if (d < bestDistance) {
      bestDistance = d;
      best = enemy;
    }
  }
  return best;
}

function damageEnemy(state, enemy, amount, source = "hit") {
  if (enemy.dead) return false;
  enemy.hp -= amount;
  enemy.flash = 0.12;
  if (enemy.hp > 0) return false;
  enemy.dead = true;
  state.score += enemy.score;
  state.kills += 1;
  state.stageKills += 1;
  if (enemy.boss) {
    state.bossAlive = false;
    state.message = "Boss 已击破";
  }
  addBurst(state.effects, enemy.x, enemy.y, { count: enemy.boss ? 34 : 14, color: enemy.color, secondary: classicArcade.yellow, radius: enemy.boss ? 26 : 10 });
  addFloatingText(state.effects, enemy.x, enemy.y - 12, `+${enemy.score}`, { color: classicArcade.yellow });
  dropPickup(state, enemy, source);
  return true;
}

function dropPickup(state, enemy, source) {
  state.pickups.push({ type: "xp", x: enemy.x, y: enemy.y, value: enemy.xp, radius: 8, vy: 0 });
  const roll = Math.random();
  if (enemy.boss || roll > 0.93) {
    state.pickups.push({ type: enemy.boss ? "chest" : "heal", x: enemy.x + 10, y: enemy.y - 10, value: enemy.boss ? 1 : 20, radius: 10, vy: 0 });
  } else if (source === "lightning" && roll > 0.86) {
    state.pickups.push({ type: "bomb", x: enemy.x, y: enemy.y, value: 1, radius: 10, vy: 0 });
  }
}

function gainXp(state, amount) {
  state.player.xp += amount;
  while (state.player.xp >= state.player.xpNeed) {
    state.player.xp -= state.player.xpNeed;
    state.player.level += 1;
    state.player.xpNeed = Math.round(state.player.xpNeed * 1.2 + 8);
    state.choices = createUpgradeChoices(state);
    state.message = "选择一次升级";
    break;
  }
}

function createUpgradeChoices(state) {
  const candidates = UPGRADES.filter((upgrade) => (state.skills[upgrade.id] || 0) < upgrade.max);
  return shuffle(candidates).slice(0, 3);
}

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function applyUpgrade(state, id) {
  const upgrade = UPGRADES.find((item) => item.id === id);
  if (!upgrade) return;
  state.skills[id] = Math.min(upgrade.max, (state.skills[id] || 0) + 1);
  if (id === "speed") state.player.speed += 10;
  if (id === "vitality") {
    state.player.maxHp += 18;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 28);
  }
  state.choices = [];
  state.message = `${upgrade.title} 升到 ${state.skills[id]} 级`;
}

function collectPickups(state) {
  const magnet = 44 + (state.skills.magnet || 0) * 28 + (state.skills.speed || 0) * 8;
  for (const pickup of state.pickups) {
    const d = distance(state.player, pickup);
    if (d < magnet * 2.2) {
      const pull = clamp((magnet * 2.2 - d) / (magnet * 2.2), 0, 1);
      const angle = Math.atan2(state.player.y - pickup.y, state.player.x - pickup.x);
      pickup.x += Math.cos(angle) * pull * 5;
      pickup.y += Math.sin(angle) * pull * 5;
    }
  }
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = state.pickups[i];
    if (distance(state.player, pickup) > state.player.radius + pickup.radius + 7) continue;
    state.pickups.splice(i, 1);
    if (pickup.type === "xp") gainXp(state, pickup.value);
    if (pickup.type === "heal") state.player.hp = Math.min(state.player.maxHp, state.player.hp + pickup.value);
    if (pickup.type === "bomb") {
      state.enemies.forEach((enemy) => damageEnemy(state, enemy, 55 + state.level * 3, "bomb"));
      state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
      triggerHitStop(state, 0.05, 0.45);
    }
    if (pickup.type === "chest") {
      state.score += 500;
      state.choices = createUpgradeChoices(state);
      state.message = "Boss 宝箱：选择强化";
    }
  }
}

function updatePlayer(state, dt) {
  const c = state.controls;
  let x = c.axisX || 0;
  let y = c.axisY || 0;
  if (!x && !y) {
    x = Number(c.right) - Number(c.left);
    y = Number(c.down) - Number(c.up);
  }
  const length = Math.hypot(x, y) || 1;
  state.player.x = clamp(state.player.x + (x / length) * state.player.speed * dt, 18, WORLD - 18);
  state.player.y = clamp(state.player.y + (y / length) * state.player.speed * dt, 18, WORLD - 18);
  state.player.invuln = Math.max(0, state.player.invuln - dt);
}

function fireWeapons(state, dt) {
  state.attackTimer -= dt;
  if (state.attackTimer <= 0) {
    const target = nearestEnemy(state);
    if (target) {
      const knifeLevel = state.skills.knife || 1;
      const shots = Math.min(5, 1 + Math.floor(knifeLevel / 2));
      for (let i = 0; i < shots; i += 1) {
        const angle = Math.atan2(target.y - state.player.y, target.x - state.player.x) + (i - (shots - 1) / 2) * 0.16;
        state.projectiles.push({
          type: "knife",
          x: state.player.x,
          y: state.player.y,
          vx: Math.cos(angle) * 320,
          vy: Math.sin(angle) * 320,
          damage: 16 + knifeLevel * 6,
          radius: 5,
          life: 1.25,
          pierce: Math.floor(knifeLevel / 3)
        });
      }
    }
    state.attackTimer = Math.max(0.22, 0.72 - (state.skills.knife || 1) * 0.06);
  }
  if (state.skills.lightning) {
    state.lightningTimer -= dt;
    if (state.lightningTimer <= 0) {
      const targets = [...state.enemies].sort((a, b) => distance(state.player, a) - distance(state.player, b)).slice(0, 2 + state.skills.lightning);
      targets.forEach((enemy) => {
        addBurst(state.effects, enemy.x, enemy.y, { count: 10, color: classicArcade.cyan, secondary: classicArcade.white, radius: 8 });
        damageEnemy(state, enemy, 24 + state.skills.lightning * 12, "lightning");
      });
      state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
      state.lightningTimer = Math.max(0.85, 3.1 - state.skills.lightning * 0.32);
    }
  }
}

function updateEnemies(state, dt) {
  for (const enemy of state.enemies) {
    const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
    const wave = Math.sin(state.time * 2.2 + enemy.phase) * (enemy.type === "bat" ? 0.55 : 0.2);
    enemy.x += Math.cos(angle + wave) * enemy.speed * dt;
    enemy.y += Math.sin(angle + wave) * enemy.speed * dt;
    enemy.shoot -= dt;
    if (enemy.shoot <= 0 && (enemy.type === "spitter" || enemy.boss)) {
      state.enemyShots.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * (enemy.boss ? 110 : 86),
        vy: Math.sin(angle) * (enemy.boss ? 110 : 86),
        radius: enemy.boss ? 7 : 5,
        damage: enemy.boss ? 18 : 10,
        life: 4
      });
      enemy.shoot = enemy.boss ? 1.25 : 2.1;
    }
  }
}

function updateProjectiles(state, dt) {
  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
  }
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = state.projectiles[i];
    let hit = false;
    for (const enemy of state.enemies) {
      if (enemy.dead || distance(projectile, enemy) > projectile.radius + enemy.radius) continue;
      hit = true;
      if (damageEnemy(state, enemy, projectile.damage, projectile.type)) {
        // Enemy removal happens below so multiple systems can finish cleanly.
      }
      projectile.pierce -= 1;
      if (projectile.pierce < 0) break;
    }
    if (projectile.life <= 0 || hit && projectile.pierce < 0) state.projectiles.splice(i, 1);
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
}

function updatePassiveDamage(state, dt) {
  if (state.skills.aura) {
    const radius = 42 + state.skills.aura * 12;
    for (const enemy of state.enemies) {
      if (distance(state.player, enemy) <= radius + enemy.radius) {
        enemy.hp -= (10 + state.skills.aura * 4) * dt;
        enemy.flash = 0.05;
      }
    }
  }
  if (state.skills.orbit) {
    const count = 1 + Math.floor(state.skills.orbit / 2);
    for (let i = 0; i < count; i += 1) {
      const angle = state.time * (1.9 + state.skills.orbit * 0.12) + i * Math.PI * 2 / count;
      const orb = { x: state.player.x + Math.cos(angle) * 42, y: state.player.y + Math.sin(angle) * 42 };
      for (const enemy of state.enemies) {
        if (distance(orb, enemy) <= enemy.radius + 8) {
          enemy.hp -= (18 + state.skills.orbit * 5) * dt;
          enemy.x += Math.cos(angle) * 18 * dt;
          enemy.y += Math.sin(angle) * 18 * dt;
        }
      }
    }
  }
  state.enemies.forEach((enemy) => {
    if (enemy.hp <= 0) damageEnemy(state, enemy, 0, "aura");
  });
  state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
}

function updateEnemyShots(state, dt) {
  for (const shot of state.enemyShots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
  }
  for (let i = state.enemyShots.length - 1; i >= 0; i -= 1) {
    const shot = state.enemyShots[i];
    if (shot.life <= 0) {
      state.enemyShots.splice(i, 1);
      continue;
    }
    if (distance(shot, state.player) <= shot.radius + state.player.radius && state.player.invuln <= 0) {
      state.player.hp -= shot.damage;
      state.player.invuln = 0.55;
      state.enemyShots.splice(i, 1);
      state.shake = Math.max(state.shake, 4);
      triggerHitStop(state, 0.035, 0.5);
    }
  }
}

function updatePlayerDamage(state) {
  if (state.player.invuln > 0) return;
  const hit = state.enemies.find((enemy) => distance(enemy, state.player) <= enemy.radius + state.player.radius);
  if (!hit) return;
  state.player.hp -= hit.damage;
  state.player.invuln = 0.62;
  state.shake = Math.max(state.shake, 5);
  addBurst(state.effects, state.player.x, state.player.y, { count: 12, color: classicArcade.red, secondary: classicArcade.white, radius: 8 });
  triggerHitStop(state, 0.045, 0.42);
}

function advanceLevel(state, context) {
  if (state.level >= state.maxLevel) {
    finish(state, true, context);
    return;
  }
  state.level += 1;
  state.time = 0;
  state.stageKills = 0;
  state.enemies = [];
  state.projectiles = [];
  state.enemyShots = [];
  state.pickups = [];
  state.spawnTimer = 0.55;
  state.bossSpawned = false;
  state.bossAlive = false;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 25);
  state.player.invuln = 1.2;
  state.message = `第 ${state.level} 关：怪潮升级`;
  addBurst(state.effects, state.player.x, state.player.y, { count: 28, color: classicArcade.green, secondary: classicArcade.yellow, radius: 24 });
  context.playSound?.("win");
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "完成全部怪潮" : "被怪潮吞没";
  context.clearSession?.();
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    detail: state.message,
    score: state.score,
    moves: Math.round(state.time)
  });
}

function update(state, dt, context) {
  if (state.over || state.choices.length) return;
  const tuning = levelTuning(state.level);
  state.time += dt;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state);
    state.spawnTimer = tuning.spawnEvery;
  }
  if (state.time >= tuning.duration * 0.72) spawnBoss(state);
  updatePlayer(state, dt);
  updateEnemies(state, dt);
  updateProjectiles(state, dt);
  updatePassiveDamage(state, dt);
  updateEnemyShots(state, dt);
  fireWeapons(state, dt);
  collectPickups(state);
  updatePlayerDamage(state);
  updateEffects(state.effects, dt);
  updateFeedback(state, dt, [state.enemies]);
  state.shake = Math.max(0, state.shake - dt * 18);
  if (state.player.hp <= 0) finish(state, false, context);
  if (state.time >= tuning.duration && !state.bossAlive) advanceLevel(state, context);
}

function drawGrid(ctx, camera) {
  ctx.fillStyle = "#0d1720";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  const bg = ctx.createLinearGradient(camera.x, camera.y, camera.x + W, camera.y + H);
  bg.addColorStop(0, "#13292d");
  bg.addColorStop(0.52, "#102328");
  bg.addColorStop(1, "#19243a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD, WORLD);
  ctx.strokeStyle = "rgba(255,255,255,.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(56,210,124,.055)";
  for (let x = 90; x < WORLD; x += 210) {
    for (let y = 120; y < WORLD; y += 240) {
      const wobble = Math.sin(x * 0.03 + y * 0.02) * 18;
      ctx.beginPath();
      ctx.ellipse(x + wobble, y - wobble * 0.5, 34, 16, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function drawHealthBar(ctx, p, entity) {
  const width = entity.radius * 2.25;
  const y = p.y - entity.radius - 10;
  ctx.fillStyle = "rgba(0,0,0,.52)";
  roundedRectPath(ctx, p.x - width / 2, y, width, 5, 3);
  ctx.fill();
  ctx.fillStyle = entity.boss ? classicArcade.yellow : classicArcade.green;
  roundedRectPath(ctx, p.x - width / 2, y, width * clamp(entity.hp / entity.maxHp, 0, 1), 5, 3);
  ctx.fill();
}

function drawPickup(ctx, state, pickup) {
  const p = worldToScreen(state, pickup.x, pickup.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.shadowColor = "rgba(66,242,255,.28)";
  ctx.shadowBlur = 10;
  if (pickup.type === "xp") {
    ctx.fillStyle = classicArcade.cyan;
    ctx.beginPath();
    ctx.moveTo(0, -pickup.radius);
    ctx.lineTo(pickup.radius, 0);
    ctx.lineTo(0, pickup.radius);
    ctx.lineTo(-pickup.radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillRect(-2, -2, 4, 4);
  } else if (pickup.type === "heal") {
    ctx.fillStyle = classicArcade.green;
    roundedRectPath(ctx, -pickup.radius, -pickup.radius, pickup.radius * 2, pickup.radius * 2, 5);
    ctx.fill();
    ctx.fillStyle = classicArcade.white;
    ctx.fillRect(-2, -7, 4, 14);
    ctx.fillRect(-7, -2, 14, 4);
  } else if (pickup.type === "bomb") {
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.arc(0, 1, pickup.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, -pickup.radius + 1);
    ctx.quadraticCurveTo(8, -pickup.radius - 9, 13, -pickup.radius - 5);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#7b4b21";
    roundedRectPath(ctx, -12, -8, 24, 18, 4);
    ctx.fill();
    ctx.fillStyle = classicArcade.yellow;
    ctx.fillRect(-12, -2, 24, 4);
    ctx.fillRect(-2, -8, 4, 18);
  }
  ctx.restore();
}

function drawBlade(ctx, x, y, angle, scale = 1, color = classicArcade.yellow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -10 * scale);
  ctx.lineTo(4 * scale, 3 * scale);
  ctx.lineTo(0, 8 * scale);
  ctx.lineTo(-4 * scale, 3 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.fillRect(-1 * scale, -7 * scale, 2 * scale, 10 * scale);
  ctx.restore();
}

function drawProjectile(ctx, state, projectile) {
  const p = worldToScreen(state, projectile.x, projectile.y);
  const angle = Math.atan2(projectile.vy, projectile.vx) + Math.PI / 2;
  drawBlade(ctx, p.x, p.y, angle, 0.72, projectile.type === "knife" ? classicArcade.yellow : classicArcade.cyan);
}

function drawEnemyShot(ctx, state, shot) {
  const p = worldToScreen(state, shot.x, shot.y);
  const angle = Math.atan2(shot.vy, shot.vx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.fillStyle = classicArcade.red;
  ctx.beginPath();
  ctx.moveTo(shot.radius + 4, 0);
  ctx.quadraticCurveTo(0, -shot.radius, -shot.radius - 3, 0);
  ctx.quadraticCurveTo(0, shot.radius, shot.radius + 4, 0);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.beginPath();
  ctx.arc(1, -2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemyBody(ctx, enemy, scale) {
  if (enemy.boss) {
    ctx.fillStyle = "#5a1024";
    ctx.beginPath();
    ctx.moveTo(0, -30 * scale);
    ctx.lineTo(26 * scale, -16 * scale);
    ctx.lineTo(31 * scale, 16 * scale);
    ctx.lineTo(0, 33 * scale);
    ctx.lineTo(-31 * scale, 16 * scale);
    ctx.lineTo(-26 * scale, -16 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.ellipse(0, 2 * scale, 22 * scale, 25 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = classicArcade.yellow;
    ctx.beginPath();
    ctx.arc(0, 2 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(-16 * scale, -22 * scale);
    ctx.lineTo(-25 * scale, -34 * scale);
    ctx.moveTo(16 * scale, -22 * scale);
    ctx.lineTo(25 * scale, -34 * scale);
    ctx.stroke();
    return;
  }

  if (enemy.type === "bat") {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(-4 * scale, -4 * scale);
    ctx.lineTo(-24 * scale, -16 * scale);
    ctx.lineTo(-18 * scale, 6 * scale);
    ctx.lineTo(-5 * scale, 3 * scale);
    ctx.lineTo(0, 12 * scale);
    ctx.lineTo(5 * scale, 3 * scale);
    ctx.lineTo(18 * scale, 6 * scale);
    ctx.lineTo(24 * scale, -16 * scale);
    ctx.lineTo(4 * scale, -4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#12233a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 7 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === "brute") {
    ctx.fillStyle = "#60401e";
    roundedRectPath(ctx, -15 * scale, -14 * scale, 30 * scale, 30 * scale, 7 * scale);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    roundedRectPath(ctx, -11 * scale, -18 * scale, 22 * scale, 26 * scale, 6 * scale);
    ctx.fill();
  } else if (enemy.type === "spitter") {
    ctx.fillStyle = "#133a2d";
    ctx.beginPath();
    ctx.ellipse(0, 1 * scale, 15 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(0, -9 * scale, 10 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.arc(0, -8 * scale, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === "charger") {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, -18 * scale);
    ctx.lineTo(15 * scale, 12 * scale);
    ctx.lineTo(4 * scale, 8 * scale);
    ctx.lineTo(0, 18 * scale);
    ctx.lineTo(-4 * scale, 8 * scale);
    ctx.lineTo(-15 * scale, 12 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = classicArcade.white;
    ctx.fillRect(-3 * scale, -13 * scale, 6 * scale, 14 * scale);
  } else if (enemy.type === "shield") {
    ctx.fillStyle = "#dfe8ef";
    ctx.beginPath();
    ctx.moveTo(0, -18 * scale);
    ctx.quadraticCurveTo(17 * scale, -13 * scale, 16 * scale, 2 * scale);
    ctx.quadraticCurveTo(12 * scale, 17 * scale, 0, 22 * scale);
    ctx.quadraticCurveTo(-12 * scale, 17 * scale, -16 * scale, 2 * scale);
    ctx.quadraticCurveTo(-17 * scale, -13 * scale, 0, -18 * scale);
    ctx.fill();
    ctx.strokeStyle = classicArcade.cyan;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
  } else if (enemy.type === "elite") {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 ? 10 * scale : 19 * scale;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#211033";
    ctx.beginPath();
    ctx.arc(0, 0, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 * scale, 15 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.42)";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * 8 * scale, -4 * scale);
      ctx.lineTo(side * 18 * scale, -10 * scale);
      ctx.moveTo(side * 9 * scale, 3 * scale);
      ctx.lineTo(side * 19 * scale, 8 * scale);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,.62)";
  ctx.beginPath();
  ctx.arc(-4 * scale, -4 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.arc(4 * scale, -4 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(ctx, state, enemy) {
  const p = worldToScreen(state, enemy.x, enemy.y);
  const scale = enemy.radius / 12;
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x) + Math.PI / 2;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.globalAlpha = enemy.flash ? 0.68 : 1;
  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.beginPath();
  ctx.ellipse(0, enemy.radius * 0.55, enemy.radius * 0.95, enemy.radius * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  drawEnemyBody(ctx, enemy, scale);
  ctx.restore();
  drawHealthBar(ctx, p, enemy);
}

function drawPlayer(ctx, state) {
  const p = worldToScreen(state, state.player.x, state.player.y);
  const moving = Math.hypot(state.controls.axisX || 0, state.controls.axisY || 0);
  const angle = moving ? Math.atan2(state.controls.axisY, state.controls.axisX) + Math.PI / 2 : Math.sin(state.time * 2) * 0.05;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  const blink = state.player.invuln > 0 && Math.floor(state.time * 16) % 2;
  ctx.globalAlpha = blink ? 0.58 : 1;
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 11, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#123832";
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(16, 14);
  ctx.lineTo(0, 8);
  ctx.lineTo(-16, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = classicArcade.green;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.lineTo(10, 9);
  ctx.lineTo(0, 17);
  ctx.lineTo(-10, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = classicArcade.cyan;
  roundedRectPath(ctx, -6, -9, 12, 15, 4);
  ctx.fill();
  ctx.fillStyle = classicArcade.white;
  ctx.beginPath();
  ctx.arc(0, -13, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = classicArcade.yellow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-15, 2);
  ctx.lineTo(-25, -4);
  ctx.moveTo(15, 2);
  ctx.lineTo(25, -4);
  ctx.stroke();
  ctx.restore();
}

function draw(state, ctx) {
  const camera = cameraFor(state);
  const offset = shakeOffset(state.shake);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(offset.x, offset.y);
  drawGrid(ctx, camera);
  state.pickups.forEach((pickup) => drawPickup(ctx, state, pickup));
  state.projectiles.forEach((projectile) => drawProjectile(ctx, state, projectile));
  state.enemyShots.forEach((shot) => drawEnemyShot(ctx, state, shot));
  state.enemies.forEach((enemy) => drawEnemy(ctx, state, enemy));
  if (state.skills.aura) {
    const p = worldToScreen(state, state.player.x, state.player.y);
    ctx.strokeStyle = "rgba(123,212,255,.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 42 + state.skills.aura * 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (state.skills.orbit) {
    const count = 1 + Math.floor(state.skills.orbit / 2);
    const p = worldToScreen(state, state.player.x, state.player.y);
    for (let i = 0; i < count; i += 1) {
      const angle = state.time * (1.9 + state.skills.orbit * 0.12) + i * Math.PI * 2 / count;
      const ox = p.x + Math.cos(angle) * 42;
      const oy = p.y + Math.sin(angle) * 42;
      ctx.fillStyle = classicArcade.blue;
      ctx.beginPath();
      ctx.arc(ox, oy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.beginPath();
      ctx.arc(ox - 2, oy - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawPlayer(ctx, state);
  drawEffects(ctx, state.effects.map((effect) => ({ ...effect, x: effect.x - camera.x, y: effect.y - camera.y })));
  ctx.restore();
  drawHud(ctx, state);
}

function drawHud(ctx, state) {
  const tuning = levelTuning(state.level);
  const progress = clamp(state.time / tuning.duration, 0, 1);
  ctx.fillStyle = "rgba(6,12,16,.74)";
  ctx.fillRect(10, 10, W - 20, 58);
  ctx.fillStyle = classicArcade.white;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText(`第 ${state.level}/${MAX_LEVEL} 关  击破 ${state.stageKills}  分 ${state.score}`, 18, 30);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(18, 42, W - 36, 8);
  ctx.fillStyle = tuning.bossStage ? classicArcade.red : classicArcade.cyan;
  ctx.fillRect(18, 42, (W - 36) * progress, 8);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(18, 56, W - 36, 6);
  ctx.fillStyle = classicArcade.green;
  ctx.fillRect(18, 56, (W - 36) * clamp(state.player.hp / state.player.maxHp, 0, 1), 6);
}

function renderChoices(root, state) {
  let panel = root.querySelector(".survivor-upgrades");
  if (!state.choices.length) {
    panel?.remove();
    return;
  }
  // 同一组 choices 期间避免每帧重建按钮 DOM——否则用户的 pointerdown
  // 和 pointerup 跨过一次 game-loop tick 时，按钮节点被替换，click 不触发
  const signature = state.choices.map((c) => `${c.id}:${(state.skills[c.id] || 0) + 1}`).join("|");
  if (panel && panel.dataset.choicesSig === signature) return;
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "survivor-upgrades";
    root.append(panel);
  }
  panel.dataset.choicesSig = signature;
  panel.innerHTML = `
    <strong>选择强化</strong>
    ${state.choices.map((choice) => `
      <button type="button" data-survivor-upgrade="${choice.id}">
        <b>${choice.title} Lv.${(state.skills[choice.id] || 0) + 1}</b>
        <span>${choice.desc}</span>
      </button>
    `).join("")}
  `;
}

export function mountSurvivor(root, context) {
  let state = restoreState(context.savedState || loadState(SAVE_KEY, null));
  let canvas = null;
  let ctx = null;
  let loop = null;
  let cleanupKeys = null;
  let cleanupRestart = null;
  let cleanupPointer = null;
  let statusNode = null;
  let levelNode = null;
  let playerLevelNode = null;
  let killsNode = null;
  let scoreNode = null;
  let activePointer = null;
  let finalCleared = false;

  function save() {
    if (state.over || state.won) {
      if (!finalCleared) {
        finalCleared = true;
        removeState(SAVE_KEY);
        context.clearSession?.();
      }
      return;
    }
    finalCleared = false;
    const snapshot = serializeState(state);
    saveState(SAVE_KEY, snapshot);
    context.saveSession?.(snapshot, sessionMeta(state));
  }

  function restart() {
    state = initialState();
    finalCleared = false;
    removeState(SAVE_KEY);
    context.clearSession?.();
    root.querySelector(".survivor-upgrades")?.remove();
    refreshDom();
    loop?.resetClock();
    save();
  }

  function refreshDom() {
    if (!statusNode) return;
    statusNode.textContent = state.message;
    levelNode.textContent = `关 ${state.level}/${MAX_LEVEL}`;
    playerLevelNode.textContent = `Lv.${state.player.level}`;
    killsNode.textContent = `击破 ${state.kills}`;
    scoreNode.textContent = `分 ${state.score}`;
  }

  function setAxisFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * W;
    const y = (event.clientY - rect.top) / rect.height * H;
    const player = worldToScreen(state, state.player.x, state.player.y);
    const dx = x - player.x;
    const dy = y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    state.controls.axisX = dx / length;
    state.controls.axisY = dy / length;
  }

  function bindPointer() {
    const down = (event) => {
      event.preventDefault();
      activePointer = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      setAxisFromPointer(event);
    };
    const move = (event) => {
      if (activePointer !== event.pointerId) return;
      event.preventDefault();
      setAxisFromPointer(event);
    };
    const up = (event) => {
      if (activePointer !== event.pointerId) return;
      canvas.releasePointerCapture?.(event.pointerId);
      activePointer = null;
      state.controls.axisX = 0;
      state.controls.axisY = 0;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }

  function renderShell() {
    root.innerHTML = `
      <section class="game-panel game-status survivor-status">
        <div>
          <strong data-survivor-status>${state.message}</strong>
          <p class="game-note">拖动画布移动 · 自动攻击 · 升级选择技能</p>
        </div>
        <div class="mini-stats">
          <span data-survivor-level>关 ${state.level}/${MAX_LEVEL}</span>
          <span data-survivor-player-level>Lv.${state.player.level}</span>
          <span data-survivor-kills>击破 ${state.kills}</span>
          <span data-survivor-score>分 ${state.score}</span>
        </div>
      </section>
      <div class="arcade-shell survivor-shell" data-visual-style="classic-arcade">
        <div class="arcade-stage"><canvas class="arcade-canvas tall survivor-canvas" width="${W}" height="${H}" aria-label="割草生存"></canvas></div>
      </div>
    `;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    statusNode = root.querySelector("[data-survivor-status]");
    levelNode = root.querySelector("[data-survivor-level]");
    playerLevelNode = root.querySelector("[data-survivor-player-level]");
    killsNode = root.querySelector("[data-survivor-kills]");
    scoreNode = root.querySelector("[data-survivor-score]");
    cleanupKeys?.();
    cleanupKeys = bindDigitalKeys(state.controls, DIRECTION_KEY_MAP);
    cleanupPointer?.();
    cleanupPointer = bindPointer();
    cleanupRestart?.();
    cleanupRestart = bindShellRestart(root, context, restart);
    loop?.stop();
    loop = createArcadeLoop({
      context,
      update: (dt) => {
        update(state, dt, context);
        renderChoices(root, state);
        refreshDom();
        if (state.over) save();
      },
      draw: () => draw(state, ctx),
      save,
      saveEvery: 1.3,
      timeScale: () => state.choices.length ? 0.05 : feedbackTimeScale(state)
    });
    root.querySelector(".survivor-upgrades")?.remove();
    root.onclick = (event) => {
      const button = event.target.closest("[data-survivor-upgrade]");
      if (!button) return;
      applyUpgrade(state, button.dataset.survivorUpgrade);
      renderChoices(root, state);
      refreshDom();
      save();
    };
    loop.start();
  }

  renderShell();

  return () => {
    cleanupPointer?.();
    cleanupKeys?.();
    cleanupRestart?.();
    loop?.stop();
    root.onclick = null;
    if (!state.over && !state.won) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
