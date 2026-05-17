import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { classicArcade, drawArcadeBackdrop } from "../arcade/classic-visuals.js";
import { clamp, distance, withinDistance } from "../arcade/collision.js";
import { bindActionKeys } from "../arcade/controls.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { advanceWave, createStageState, isFinalWave, restoreStageLevel, stageLabel, stageMeta, totalWaves, waveIndex, waveLabel, waveMeta } from "../arcade/stages.js";

const W = 360;
const H = 360;
const CELL = 30;
const GRID = 12;
const MAX_LEVEL = 5;
const WAVES_PER_LEVEL = 3;

const DIFFICULTY = {
  easy: { lives: 22, gold: 230, hp: 0.85, speed: 0.86, count: -1 },
  medium: { lives: 18, gold: 200, hp: 1, speed: 1, count: 0 },
  hard: { lives: 14, gold: 175, hp: 1.28, speed: 1.12, count: 2 },
  devil: { lives: 10, gold: 155, hp: 1.55, speed: 1.25, count: 4 }
};

const TOWER_TYPES = {
  arrow: { label: "弩塔", cost: 60, damage: 17, range: 74, cooldown: 0.52, speed: 255, color: classicArcade.cyan },
  cannon: { label: "炮塔", cost: 92, damage: 31, range: 65, cooldown: 1.05, speed: 210, splash: 30, color: classicArcade.orange },
  frost: { label: "冰塔", cost: 76, damage: 9, range: 68, cooldown: 0.86, speed: 225, slow: 0.48, slowTime: 1.45, color: classicArcade.blue },
  spark: { label: "电塔", cost: 108, damage: 14, range: 86, cooldown: 0.74, speed: 290, chain: 2, color: classicArcade.yellow }
};

const PATH_CELLS = [
  [0, 5], [1, 5], [2, 5], [3, 5],
  [3, 4], [3, 3], [3, 2], [4, 2], [5, 2], [6, 2],
  [6, 3], [6, 4], [6, 5], [6, 6], [6, 7], [6, 8],
  [7, 8], [8, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4],
  [10, 4], [11, 4]
];

const PATH_SET = new Set(PATH_CELLS.map(([x, y]) => `${x}:${y}`));
const WAYPOINTS = [
  { x: -CELL / 2, y: 5.5 * CELL },
  ...PATH_CELLS.map(([x, y]) => ({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 })),
  { x: W + CELL / 2, y: 4.5 * CELL }
];

function towerStats(tower) {
  const base = TOWER_TYPES[tower.type] || TOWER_TYPES.arrow;
  const boost = tower.level - 1;
  return {
    ...base,
    damage: Math.round(base.damage * (1 + boost * 0.48)),
    range: base.range + boost * 10,
    cooldown: Math.max(0.22, base.cooldown * (1 - boost * 0.12)),
    splash: base.splash ? base.splash + boost * 5 : 0,
    slowTime: base.slowTime ? base.slowTime + boost * 0.22 : 0,
    chain: base.chain ? base.chain + (tower.level >= 3 ? 1 : 0) : 0
  };
}

function upgradeCost(tower) {
  const base = TOWER_TYPES[tower.type] || TOWER_TYPES.arrow;
  return Math.round(base.cost * (0.72 + tower.level * 0.38));
}

function towerInvestment(tower) {
  const base = TOWER_TYPES[tower.type] || TOWER_TYPES.arrow;
  let value = base.cost;
  for (let level = 1; level < tower.level; level += 1) {
    value += Math.round(base.cost * (0.72 + level * 0.38));
  }
  return value;
}

function waveNumber(state) {
  return waveIndex(state, WAVES_PER_LEVEL);
}

function waveConfig(config, level, wave) {
  const totalWave = waveIndex({ level, wave }, WAVES_PER_LEVEL);
  return {
    count: Math.max(4, 5 + level * 2 + wave * 2 + config.count),
    hp: Math.round((30 + level * 18 + wave * 10) * config.hp),
    speed: (24 + level * 2 + wave) * config.speed,
    reward: 8 + level,
    interval: Math.max(0.36, 0.72 - level * 0.04),
    totalWave
  };
}

function wavePreview(config, level, wave) {
  const next = waveConfig(config, level, wave);
  const boss = isFinalWave({ level, wave, maxLevel: MAX_LEVEL }, WAVES_PER_LEVEL) ? " · Boss" : "";
  return `${next.count}${boss} 敌 · HP ${next.hp}`;
}

function createWave(config, level, wave, nextId) {
  const waveCfg = waveConfig(config, level, wave);
  const queue = [];
  for (let i = 0; i < waveCfg.count; i += 1) {
    const runner = i % 5 === 3;
    const armored = i % 7 === 5;
    queue.push({
      id: nextId + i,
      kind: runner ? "runner" : (armored ? "armored" : "grunt"),
      hp: Math.round(waveCfg.hp * (runner ? 0.72 : armored ? 1.72 : 1)),
      speed: waveCfg.speed * (runner ? 1.38 : armored ? 0.76 : 1),
      reward: waveCfg.reward + (runner ? 1 : armored ? 4 : 0)
    });
  }
  if (isFinalWave({ level, wave, maxLevel: MAX_LEVEL }, WAVES_PER_LEVEL)) {
    queue.push({
      id: nextId + queue.length,
      kind: "boss",
      hp: Math.round(520 * config.hp),
      speed: 18 * config.speed,
      reward: 140
    });
  }
  return queue;
}

function initialState(config) {
  return {
    ...createStageState(MAX_LEVEL),
    wave: 1,
    lives: config.lives,
    gold: config.gold,
    score: 0,
    towers: [],
    enemies: [],
    shots: [],
    queue: [],
    effects: [],
    nextId: 1,
    selectedType: "arrow",
    selectedTower: null,
    waveActive: false,
    spawning: false,
    spawnTimer: 0,
    shake: 0,
    time: 0,
    message: "选择空地建塔，点击出怪开始防守",
    over: false,
    resultReported: false
  };
}

function restoreState(config, saved) {
  const state = initialState(config);
  if (!saved || typeof saved !== "object") return state;
  const level = restoreStageLevel(saved.level, MAX_LEVEL);
  const wave = clamp(Number(saved.wave) || 1, 1, WAVES_PER_LEVEL);
  return {
    ...state,
    ...saved,
    level,
    wave,
    maxLevel: MAX_LEVEL,
    effects: [],
    towers: Array.isArray(saved.towers) ? saved.towers : [],
    enemies: Array.isArray(saved.enemies) ? saved.enemies : [],
    shots: Array.isArray(saved.shots) ? saved.shots : [],
    queue: Array.isArray(saved.queue) ? saved.queue : [],
    selectedType: TOWER_TYPES[saved.selectedType] ? saved.selectedType : "arrow",
    selectedTower: saved.selectedTower || null,
    over: false,
    resultReported: false,
    message: saved.message || state.message
  };
}

function serializeState(state) {
  const { effects, resultReported, ...snapshot } = state;
  return {
    ...snapshot,
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    towers: state.towers.map((tower) => ({ ...tower })),
    shots: state.shots.map((shot) => ({ ...shot })),
    queue: state.queue.map((enemy) => ({ ...enemy })),
    effects: undefined,
    resultReported: undefined
  };
}

function sessionMeta(state) {
  return {
    level: stageMeta(state),
    stage: `第 ${waveMeta(state, WAVES_PER_LEVEL)} 波`,
    score: state.score
  };
}

function cellAt(point) {
  return {
    x: Math.floor(point.x / CELL),
    y: Math.floor(point.y / CELL)
  };
}

function isInsideCell(cell) {
  return cell.x >= 0 && cell.x < GRID && cell.y >= 0 && cell.y < GRID;
}

function isPathCell(cell) {
  return PATH_SET.has(`${cell.x}:${cell.y}`);
}

function towerAt(state, cell) {
  return state.towers.find((tower) => tower.cellX === cell.x && tower.cellY === cell.y);
}

function buildTower(state, cell) {
  if (state.over || state.spawning) return;
  if (!isInsideCell(cell)) return;
  if (isPathCell(cell)) {
    state.message = "道路上不能建塔";
    return;
  }
  const existing = towerAt(state, cell);
  if (existing) {
    state.selectedTower = existing.id;
    state.message = `${TOWER_TYPES[existing.type].label} Lv.${existing.level}`;
    return;
  }
  const type = TOWER_TYPES[state.selectedType] ? state.selectedType : "arrow";
  const def = TOWER_TYPES[type];
  if (state.gold < def.cost) {
    state.message = `金币不足，需要 ${def.cost}`;
    return;
  }
  const tower = {
    id: state.nextId++,
    type,
    level: 1,
    cellX: cell.x,
    cellY: cell.y,
    x: cell.x * CELL + CELL / 2,
    y: cell.y * CELL + CELL / 2,
    cooldown: 0
  };
  state.towers.push(tower);
  state.selectedTower = tower.id;
  state.gold -= def.cost;
  state.message = `建造${def.label}`;
  addBurst(state.effects, tower.x, tower.y, { color: def.color, secondary: classicArcade.white, count: 8, speed: 45 });
  addFloatingText(state.effects, tower.x, tower.y - 12, `-${def.cost}`, { color: classicArcade.yellow, size: 12 });
}

function upgradeSelectedTower(state) {
  const tower = state.towers.find((item) => item.id === state.selectedTower);
  if (!tower) {
    state.message = "先点击一座塔";
    return;
  }
  if (tower.level >= 3) {
    state.message = "这座塔已满级";
    return;
  }
  const cost = upgradeCost(tower);
  if (state.gold < cost) {
    state.message = `升级需要 ${cost} 金币`;
    return;
  }
  state.gold -= cost;
  tower.level += 1;
  state.message = `${TOWER_TYPES[tower.type].label} 升到 Lv.${tower.level}`;
  addBurst(state.effects, tower.x, tower.y, { color: classicArcade.yellow, secondary: classicArcade.cyan, count: 12, speed: 58 });
  addFloatingText(state.effects, tower.x, tower.y - 12, "UP", { color: classicArcade.yellow });
}

function sellSelectedTower(state) {
  const index = state.towers.findIndex((item) => item.id === state.selectedTower);
  if (index < 0) {
    state.message = "先点击一座塔";
    return;
  }
  const tower = state.towers[index];
  const refund = Math.max(20, Math.round(towerInvestment(tower) * 0.62));
  const label = TOWER_TYPES[tower.type]?.label || "防御塔";
  state.gold += refund;
  state.towers.splice(index, 1);
  state.selectedTower = null;
  state.message = `出售${label}，回收 ${refund} 金币`;
  addBurst(state.effects, tower.x, tower.y, { color: classicArcade.green, secondary: classicArcade.white, count: 10, speed: 52 });
  addFloatingText(state.effects, tower.x, tower.y - 12, `+${refund}`, { color: classicArcade.green });
}

function spawnEnemy(state, template) {
  const start = WAYPOINTS[0];
  state.enemies.push({
    ...template,
    maxHp: template.hp,
    x: start.x,
    y: start.y,
    pathIndex: 0,
    slowTimer: 0,
    slowFactor: 1
  });
}

function startWave(state, config) {
  if (state.over) return;
  if (state.spawning || state.enemies.length) {
    state.message = "当前波次仍在推进";
    return;
  }
  const queue = createWave(config, state.level, state.wave, state.nextId);
  state.nextId += queue.length + 1;
  state.queue = queue;
  state.waveActive = true;
  state.spawning = true;
  state.spawnTimer = 0.2;
  state.message = `第 ${waveMeta(state, WAVES_PER_LEVEL)} 波来袭`;
}

function completeWave(state, context) {
  if (state.over) return;
  state.waveActive = false;
  state.gold += 28 + state.level * 5;
  state.score += 40 + state.level * 15;
  addBurst(state.effects, W - 20, 4.5 * CELL, { color: classicArcade.green, secondary: classicArcade.yellow, count: 16, speed: 76 });
  if (isFinalWave(state, WAVES_PER_LEVEL)) {
    state.over = true;
    state.message = "魔盒防线守住了";
    context.clearSession?.();
    context.reportResult?.({
      outcome: "win",
      score: state.score,
      detail: "完成全部塔防关卡",
      extra: `剩余生命 ${state.lives}`
    });
    state.resultReported = true;
    return;
  }
  advanceWave(state, WAVES_PER_LEVEL);
  state.message = `准备第 ${waveMeta(state, WAVES_PER_LEVEL)} 波`;
}

function damageEnemy(state, enemy, amount, shot) {
  enemy.hp -= amount;
  if (shot.kind === "frost") {
    enemy.slowTimer = Math.max(enemy.slowTimer, shot.slowTime || 1.2);
    enemy.slowFactor = shot.slow || 0.5;
  }
  if (enemy.hp <= 0) {
    state.gold += enemy.reward;
    state.score += enemy.kind === "boss" ? 360 : 18 + enemy.reward;
    addBurst(state.effects, enemy.x, enemy.y, {
      color: enemy.kind === "boss" ? classicArcade.red : classicArcade.orange,
      secondary: classicArcade.yellow,
      count: enemy.kind === "boss" ? 24 : 10,
      speed: enemy.kind === "boss" ? 110 : 70
    });
    addFloatingText(state.effects, enemy.x, enemy.y - 12, enemy.kind === "boss" ? "+360" : `+${enemy.reward}`, { color: classicArcade.yellow, size: enemy.kind === "boss" ? 16 : 13 });
    return true;
  }
  return false;
}

function updateEnemies(state, dt) {
  for (const enemy of state.enemies) {
    if (enemy.slowTimer > 0) enemy.slowTimer -= dt;
    else enemy.slowFactor = 1;
    const target = WAYPOINTS[enemy.pathIndex + 1];
    if (!target) {
      enemy.reached = true;
      continue;
    }
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const speed = enemy.speed * (enemy.slowTimer > 0 ? enemy.slowFactor : 1);
    const step = speed * dt;
    if (distance <= step) {
      enemy.x = target.x;
      enemy.y = target.y;
      enemy.pathIndex += 1;
      if (enemy.pathIndex >= WAYPOINTS.length - 1) enemy.reached = true;
    } else {
      enemy.x += (dx / distance) * step;
      enemy.y += (dy / distance) * step;
    }
  }
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    if (!state.enemies[i].reached) continue;
    const penalty = state.enemies[i].kind === "boss" ? 5 : 1;
    state.lives -= penalty;
    state.shake = Math.max(state.shake, 7);
    addBurst(state.effects, W - 8, 4.5 * CELL, { color: classicArcade.red, secondary: classicArcade.white, count: 12, speed: 88 });
    state.enemies.splice(i, 1);
  }
}

function updateTowers(state, dt) {
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const stats = towerStats(tower);
    const target = state.enemies
      .filter((enemy) => withinDistance(tower, enemy, stats.range))
      .sort((a, b) => b.pathIndex - a.pathIndex || a.hp - b.hp)[0];
    if (!target) continue;
    tower.cooldown = stats.cooldown;
    state.shots.push({
      id: state.nextId++,
      x: tower.x,
      y: tower.y,
      targetId: target.id,
      kind: tower.type,
      damage: stats.damage,
      speed: stats.speed,
      splash: stats.splash || 0,
      slow: stats.slow || 1,
      slowTime: stats.slowTime || 0,
      chain: stats.chain || 0,
      color: stats.color
    });
  }
}

function updateShots(state, dt) {
  for (const shot of state.shots) {
    const target = state.enemies.find((enemy) => enemy.id === shot.targetId);
    if (!target) {
      shot.done = true;
      continue;
    }
    const dx = target.x - shot.x;
    const dy = target.y - shot.y;
    const distance = Math.hypot(dx, dy);
    const step = shot.speed * dt;
    if (distance <= step + 4) {
      shot.done = true;
      if (shot.splash) {
        for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
          const enemy = state.enemies[i];
          if (!withinDistance(enemy, target, shot.splash)) continue;
          const killed = damageEnemy(state, enemy, shot.damage * (enemy === target ? 1 : 0.62), shot);
          if (killed) state.enemies.splice(i, 1);
        }
      } else if (shot.chain) {
        const chainTargets = state.enemies
          .filter((enemy) => enemy !== target && withinDistance(enemy, target, 56))
          .sort((a, b) => distance(a, target) - distance(b, target))
          .slice(0, shot.chain);
        const hits = [
          { enemy: target, damage: shot.damage },
          ...chainTargets.map((enemy, index) => ({ enemy, damage: shot.damage * (0.58 - index * 0.12) }))
        ];
        for (const hit of hits) {
          if (!state.enemies.includes(hit.enemy)) continue;
          const killed = damageEnemy(state, hit.enemy, hit.damage, shot);
          if (killed) state.enemies.splice(state.enemies.indexOf(hit.enemy), 1);
        }
      } else {
        const killed = damageEnemy(state, target, shot.damage, shot);
        if (killed) state.enemies.splice(state.enemies.indexOf(target), 1);
      }
      addBurst(state.effects, target.x, target.y, { color: shot.color, secondary: classicArcade.white, count: 5, speed: 40, life: 0.18 });
    } else {
      shot.x += (dx / distance) * step;
      shot.y += (dy / distance) * step;
    }
  }
  for (let i = state.shots.length - 1; i >= 0; i -= 1) {
    if (state.shots[i].done) state.shots.splice(i, 1);
  }
}

function update(state, config, dt, context) {
  if (state.over) return;
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 18);
  updateEffects(state.effects, dt);
  if (state.spawning) {
    const waveCfg = waveConfig(config, state.level, state.wave);
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.queue.length) {
      spawnEnemy(state, state.queue.shift());
      state.spawnTimer = waveCfg.interval;
    }
    if (!state.queue.length) state.spawning = false;
  }
  updateEnemies(state, dt);
  updateTowers(state, dt);
  updateShots(state, dt);
  if (state.waveActive && !state.spawning && !state.queue.length && !state.enemies.length) {
    completeWave(state, context);
  }
  if (state.lives <= 0 && !state.resultReported) {
    state.over = true;
    state.message = "魔盒核心被突破";
    context.clearSession?.();
    context.reportResult?.({
      outcome: "loss",
      score: state.score,
      detail: `防守到第 ${waveNumber(state)} 波`,
      extra: `金币 ${state.gold}`
    });
    state.resultReported = true;
  }
}

function drawPath(ctx) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#25324a";
  ctx.lineWidth = 23;
  ctx.beginPath();
  WAYPOINTS.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawTower(ctx, tower, selected = false) {
  const stats = towerStats(tower);
  if (selected) {
    ctx.fillStyle = "rgba(66, 242, 255, .08)";
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(66, 242, 255, .34)";
    ctx.stroke();
  }
  ctx.fillStyle = classicArcade.shadow;
  ctx.fillRect(tower.x - 12, tower.y - 9, 24, 22);
  ctx.fillStyle = stats.color;
  ctx.fillRect(tower.x - 11, tower.y - 13, 22, 22);
  ctx.strokeStyle = classicArcade.white;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tower.x - 10.5, tower.y - 12.5, 21, 21);
  ctx.fillStyle = classicArcade.bg;
  if (tower.type === "cannon") {
    ctx.fillRect(tower.x - 4, tower.y - 23, 8, 14);
  } else if (tower.type === "frost") {
    ctx.beginPath();
    ctx.arc(tower.x, tower.y - 2, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (tower.type === "spark") {
    ctx.beginPath();
    ctx.moveTo(tower.x, tower.y - 11);
    ctx.lineTo(tower.x + 7, tower.y - 2);
    ctx.lineTo(tower.x + 1, tower.y - 1);
    ctx.lineTo(tower.x + 7, tower.y + 9);
    ctx.lineTo(tower.x - 7, tower.y - 4);
    ctx.lineTo(tower.x - 1, tower.y - 4);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(tower.x - 2, tower.y - 23, 4, 17);
  }
  ctx.fillStyle = classicArcade.white;
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(tower.level), tower.x, tower.y + 15);
}

function drawEnemy(ctx, enemy) {
  const colors = {
    grunt: classicArcade.magenta,
    runner: classicArcade.cyan,
    armored: classicArcade.orange,
    boss: classicArcade.red
  };
  const radius = enemy.kind === "boss" ? 15 : enemy.kind === "armored" ? 11 : 9;
  ctx.fillStyle = classicArcade.shadow;
  ctx.beginPath();
  ctx.arc(enemy.x + 2, enemy.y + 2, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[enemy.kind] || classicArcade.magenta;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = enemy.slowTimer > 0 ? classicArcade.blue : "rgba(255,255,255,.38)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const barW = radius * 2;
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(enemy.x - radius, enemy.y - radius - 7, barW, 4);
  ctx.fillStyle = classicArcade.green;
  ctx.fillRect(enemy.x - radius, enemy.y - radius - 7, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
}

function draw(state, ctx) {
  const offset = shakeOffset(state.shake);
  drawArcadeBackdrop(ctx, W, H, state.time, { top: "#071527", bottom: "#14213b", grid: "rgba(66,242,255,.08)", gridSize: CELL });
  ctx.save();
  ctx.translate(offset.x, offset.y);
  drawPath(ctx);
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (isPathCell({ x, y })) continue;
      ctx.strokeStyle = "rgba(248,251,255,.07)";
      ctx.strokeRect(x * CELL + 4.5, y * CELL + 4.5, CELL - 9, CELL - 9);
    }
  }
  ctx.fillStyle = classicArcade.green;
  ctx.fillRect(2, 5 * CELL + 6, 18, 18);
  ctx.fillStyle = classicArcade.red;
  ctx.fillRect(W - 20, 4 * CELL + 6, 18, 18);
  state.towers.forEach((tower) => drawTower(ctx, tower, tower.id === state.selectedTower));
  state.enemies.forEach((enemy) => drawEnemy(ctx, enemy));
  state.shots.forEach((shot) => {
    ctx.fillStyle = shot.color;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.kind === "cannon" ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  });
  drawEffects(ctx, state.effects);
  ctx.restore();
}

export function mountTowerDefense(root, context) {
  const config = DIFFICULTY[context.difficulty] || DIFFICULTY.medium;
  let state = restoreState(config, context.savedState);

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>${context.labels.difficulty} · ${MAX_LEVEL} 关 · ${totalWaves(state, WAVES_PER_LEVEL)} 波</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/${MAX_LEVEL}</span>
        <span data-wave>波次 1/${totalWaves(state, WAVES_PER_LEVEL)}</span>
        <span data-lives>核心 ${state.lives}</span>
        <span data-gold>金币 ${state.gold}</span>
        <span data-score>分数 ${state.score}</span>
      </div>
    </section>
    <section class="arcade-shell tower-defense-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="机关塔防"></canvas></div>
      <div class="arcade-controls tower-defense-controls">
        <div class="tower-controls">
          <button data-tower="arrow">弩塔</button>
          <button data-tower="cannon">炮塔</button>
          <button data-tower="frost">冰塔</button>
          <button data-tower="spark">电塔</button>
          <button data-action="upgrade">升级</button>
          <button data-action="wave">出怪</button>
          <button data-action="sell">出售</button>
          <button data-action="restart">重开</button>
        </div>
      </div>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const note = root.querySelector("[data-note]");
  const level = root.querySelector("[data-level]");
  const wave = root.querySelector("[data-wave]");
  const lives = root.querySelector("[data-lives]");
  const gold = root.querySelector("[data-gold]");
  const score = root.querySelector("[data-score]");
  const towerButtons = [...root.querySelectorAll("[data-tower]")];

  function refreshHud() {
    status.textContent = state.message;
    const selectedTower = state.towers.find((tower) => tower.id === state.selectedTower);
    const selectedText = selectedTower ? `选中 ${TOWER_TYPES[selectedTower.type].label} Lv.${selectedTower.level}` : `${TOWER_TYPES[state.selectedType].label} ${TOWER_TYPES[state.selectedType].cost} 金币`;
    const waveText = state.waveActive
      ? `场上 ${state.enemies.length + state.queue.length} 敌`
      : `下一波 ${wavePreview(config, state.level, state.wave)}`;
    note.textContent = `${context.labels.difficulty} · ${selectedText} · ${waveText}`;
    level.textContent = stageLabel(state);
    wave.textContent = waveLabel(state, WAVES_PER_LEVEL);
    lives.textContent = `核心 ${Math.max(0, state.lives)}`;
    gold.textContent = `金币 ${state.gold}`;
    score.textContent = `分数 ${state.score}`;
    towerButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.tower === state.selectedType));
  }

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H
    };
  }

  const loop = createArcadeLoop({
    context,
    update: (dt) => update(state, config, dt, context),
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
    loop.resetClock();
  }

  function onPointerDown(event) {
    event.preventDefault();
    buildTower(state, cellAt(toCanvasPoint(event)));
  }

  function handleKeyAction(action) {
    if (TOWER_TYPES[action]) {
      state.selectedType = action;
      state.message = `选择${TOWER_TYPES[state.selectedType].label}`;
    } else if (action === "wave") {
      startWave(state, config);
    } else if (action === "upgrade") {
      upgradeSelectedTower(state);
    } else if (action === "sell") {
      sellSelectedTower(state);
    } else if (action === "restart") {
      restart();
    }
  }

  towerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedType = button.dataset.tower;
      state.message = `选择${TOWER_TYPES[state.selectedType].label}`;
    });
  });
  root.querySelector("[data-action='upgrade']").addEventListener("click", () => upgradeSelectedTower(state));
  root.querySelector("[data-action='wave']").addEventListener("click", () => startWave(state, config));
  root.querySelector("[data-action='sell']").addEventListener("click", () => sellSelectedTower(state));
  const cleanupKeys = bindActionKeys({
    Digit1: "arrow",
    Digit2: "cannon",
    Digit3: "frost",
    Digit4: "spark",
    Space: "wave",
    KeyU: "upgrade",
    KeyX: "sell",
    KeyR: "restart"
  }, handleKeyAction);
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  canvas.addEventListener("pointerdown", onPointerDown);
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupKeys();
    cleanupShellRestart();
    canvas.removeEventListener("pointerdown", onPointerDown);
  };
}
