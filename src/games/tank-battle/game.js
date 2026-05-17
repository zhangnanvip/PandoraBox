import { DIRECTION_KEY_MAP, bindDigitalKeys, bindHold, bindVirtualJoystick, joystickMarkup } from "../arcade/controls.js";
import { clamp, rectFromCenter, rectsOverlap } from "../arcade/collision.js";
import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { classicArcade, drawArcadeBackdrop, drawBase, drawPowerup, drawTankSprite, drawTankWall } from "../arcade/classic-visuals.js";
import { bossHealthRatio, createBossEnemy } from "../arcade/bosses.js";
import { announceStageStart, drawStageTransition, updateStageTransition } from "../arcade/progression.js";
import { addPickup, chooseRewardType, collectPickups, pickupRect, shouldDropReward, updatePickups } from "../arcade/rewards.js";
import { advanceStage, isFinalStage, restoreStageLevel, stageLabel, stageMeta } from "../arcade/stages.js";

const W = 360;
const H = 360;
const TILE = 30;
const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const DIFFICULTY = {
  easy: { total: 5, active: 2, enemySpeed: 34, enemyFire: 1.8, playerLives: 4 },
  medium: { total: 7, active: 3, enemySpeed: 42, enemyFire: 1.35, playerLives: 3 },
  hard: { total: 9, active: 3, enemySpeed: 50, enemyFire: 1.05, playerLives: 3 },
  devil: { total: 12, active: 4, enemySpeed: 58, enemyFire: 0.78, playerLives: 2 }
};
const LEVEL_PROFILES = [
  { cols: 12, rows: 12, title: "训练防线", feature: "砖墙阵地" },
  { cols: 12, rows: 12, title: "草丛伏击", feature: "草地遮蔽" },
  { cols: 13, rows: 13, title: "泥沼推进", feature: "泥沼减速" },
  { cols: 14, rows: 14, title: "河湾渡口", feature: "河流 · 船只补给" },
  { cols: 14, rows: 15, title: "雷区封锁", feature: "草地 · 泥沼 · 地雷" },
  { cols: 15, rows: 15, title: "湿地迷宫", feature: "大地图 · 河流 · 草地" },
  { cols: 16, rows: 16, title: "最终指挥部", feature: "Boss · 全地形" }
];
const MAX_LEVEL = LEVEL_PROFILES.length;

function levelProfile(level) {
  return LEVEL_PROFILES[clamp(level, 1, MAX_LEVEL) - 1] || LEVEL_PROFILES[0];
}

function mapForLevel(level) {
  const profile = levelProfile(level);
  return {
    ...profile,
    w: profile.cols * TILE,
    h: profile.rows * TILE
  };
}

function playerSpawnFor(map) {
  return { x: map.w / 2 - 50, y: map.h - 44 };
}

function baseFor(map) {
  return { x: map.w / 2 - 16, y: map.h - 28, w: 32, h: 24, alive: true };
}

function tankRect(tank, x = tank.x, y = tank.y) {
  return rectFromCenter({ x, y }, 22);
}

function wantedDirection(controls) {
  if (Math.abs(controls.axisX || 0) > Math.abs(controls.axisY || 0)) {
    return controls.axisX > 0 ? "right" : "left";
  }
  if (Math.abs(controls.axisY || 0) > 0) return controls.axisY > 0 ? "down" : "up";
  return ["up", "down", "left", "right"].find((dir) => controls[dir]);
}

function levelTuning(config, level) {
  return {
    total: Math.max(3, Math.round(config.total * 0.5) + (level - 1) * 2 + (level === MAX_LEVEL ? 3 : 0)),
    active: Math.min(5, config.active + Math.floor((level - 1) / 2)),
    enemySpeed: config.enemySpeed + (level - 1) * 4,
    enemyFire: Math.max(0.48, config.enemyFire - (level - 1) * 0.12)
  };
}

function tileRect(x, y, type, extra = {}) {
  return { x: x * TILE, y: y * TILE, w: TILE, h: TILE, type, ...extra };
}

function isProtectedRect(rect, map) {
  const spawn = playerSpawnFor(map);
  const base = baseFor(map);
  const zones = [
    { x: spawn.x - 34, y: spawn.y - 34, w: 78, h: 74 },
    { x: base.x - 48, y: base.y - 34, w: base.w + 96, h: base.h + 58 },
    { x: 0, y: 0, w: 70, h: 70 },
    { x: map.w / 2 - 42, y: 0, w: 84, h: 70 },
    { x: map.w - 70, y: 0, w: 70, h: 70 }
  ];
  return zones.some((zone) => rectsOverlap(rect, zone));
}

function makeWalls(level = 1, map = mapForLevel(level)) {
  const bricks = [
    [2, 2], [3, 2], [8, 2], [9, 2], [5, 4], [6, 4], [1, 6], [2, 6], [9, 6], [10, 6],
    [4, 8], [7, 8], [5, 10], [6, 10], [4, 11], [7, 11]
  ].map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "brick", hp: 1 }));
  const levelBricks = [
    [],
    [[4, 2], [7, 2], [3, 7], [8, 7]],
    [[1, 3], [10, 3], [5, 7], [6, 7], [2, 10], [9, 10]],
    [[3, 3], [8, 3], [3, 9], [8, 9], [1, 11], [10, 11]],
    [[4, 3], [7, 3], [2, 5], [9, 5], [3, 10], [8, 10]],
    [[12, 4], [12, 5], [2, 12], [9, 12], [6, 3], [7, 9]],
    [[13, 3], [13, 4], [2, 13], [10, 13], [6, 12], [9, 8]]
  ][level - 1] || [];
  bricks.push(...levelBricks.map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "brick", hp: 1 })));
  const steel = [[0, 4], [11, 4], [4, 5], [7, 5], [0, 9], [11, 9]]
    .map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "steel", hp: 99 }));
  if (level >= 3) {
    steel.push(...[[5, 2], [6, 2]].map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "steel", hp: 99 })));
  }
  if (level >= 5) {
    steel.push(...[[map.cols - 2, 6], [map.cols - 2, 10], [1, map.rows - 5]].map(([x, y]) => tileRect(x, y, "steel", { hp: 99 })));
  }
  return [...bricks, ...steel].filter((wall) =>
    wall.x >= 0 && wall.y >= 0 && wall.x + wall.w <= map.w && wall.y + wall.h <= map.h && !isProtectedRect(wall, map)
  );
}

function addTerrainTile(terrain, map, x, y, type) {
  const rect = tileRect(x, y, type);
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > map.w || rect.y + rect.h > map.h) return;
  if (isProtectedRect(rect, map)) return;
  const existing = terrain.find((tile) => tile.x === rect.x && tile.y === rect.y);
  if (existing) {
    if (type !== "river") return;
    terrain.splice(terrain.indexOf(existing), 1);
  }
  terrain.push(rect);
}

function addPatch(terrain, map, type, coords) {
  coords.forEach(([x, y]) => addTerrainTile(terrain, map, x, y, type));
}

function makeTerrain(level = 1, map = mapForLevel(level)) {
  const terrain = [];
  if (level >= 2) {
    addPatch(terrain, map, "grass", [
      [1, 4], [2, 4], [1, 5], [2, 5], [9, 4], [10, 4], [9, 5], [10, 5],
      [4, 7], [5, 7], [6, 7]
    ]);
  }
  if (level >= 3) {
    addPatch(terrain, map, "mud", [
      [4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5],
      [2, 8], [3, 8], [9, 8], [10, 8], [map.cols - 4, map.rows - 5]
    ]);
  }
  if (level >= 4) {
    const riverRow = Math.floor(map.rows * 0.48);
    for (let x = 0; x < map.cols; x += 1) addTerrainTile(terrain, map, x, riverRow, "river");
    if (level >= 6) {
      const riverCol = Math.floor(map.cols * 0.68);
      for (let y = 2; y < map.rows - 3; y += 1) addTerrainTile(terrain, map, riverCol, y, "river");
    }
  }
  if (level >= 5) {
    addPatch(terrain, map, "mine", [
      [3, 3], [8, 3], [map.cols - 4, 6], [2, map.rows - 6], [map.cols - 5, map.rows - 5],
      [Math.floor(map.cols / 2), Math.floor(map.rows / 2) + 2]
    ]);
  }
  if (level >= 6) {
    addPatch(terrain, map, "grass", [
      [map.cols - 5, 2], [map.cols - 4, 2], [map.cols - 5, 3], [map.cols - 4, 3],
      [3, map.rows - 7], [4, map.rows - 7], [3, map.rows - 8], [4, map.rows - 8]
    ]);
    addPatch(terrain, map, "mud", [
      [map.cols - 6, map.rows - 8], [map.cols - 5, map.rows - 8],
      [map.cols - 6, map.rows - 7], [map.cols - 5, map.rows - 7]
    ]);
  }
  return terrain;
}

function levelHasTerrain(state, type) {
  return state.terrain.some((tile) => tile.type === type);
}

function initialState(config) {
  const levelConfig = levelTuning(config, 1);
  const map = mapForLevel(1);
  const playerSpawn = playerSpawnFor(map);
  return {
    level: 1,
    maxLevel: MAX_LEVEL,
    map,
    levelConfig,
    player: { x: playerSpawn.x, y: playerSpawn.y, dir: "up", lives: config.playerLives, reload: 0, invuln: 1 },
    enemies: [],
    bullets: [],
    walls: makeWalls(1, map),
    terrain: makeTerrain(1, map),
    powerups: [],
    buffs: { rapid: 0, shield: 0, freeze: 0, boat: 0 },
    base: baseFor(map),
    score: 0,
    spawned: 0,
    destroyed: 0,
    total: levelConfig.total,
    message: "第 1 关：训练防线",
    over: false,
    won: false,
    time: 0,
    spawnTimer: 0,
    boatTimer: 0,
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
  snapshot.over = false;
  snapshot.won = false;
  snapshot.version = 2;
  return snapshot;
}

function restoreState(config, savedState) {
  if (!savedState || savedState.version !== 2 || savedState.over) return initialState(config);
  const fallback = initialState(config);
  const snapshot = clonePlain(savedState);
  const level = restoreStageLevel(snapshot.level, MAX_LEVEL);
  const map = mapForLevel(level);
  const playerSpawn = playerSpawnFor(map);
  return {
    ...fallback,
    ...snapshot,
    level,
    maxLevel: MAX_LEVEL,
    map,
    levelConfig: levelTuning(config, level),
    walls: Array.isArray(snapshot.walls) ? snapshot.walls : makeWalls(level, map),
    terrain: Array.isArray(snapshot.terrain) ? snapshot.terrain : makeTerrain(level, map),
    buffs: { rapid: 0, shield: 0, freeze: 0, boat: 0, ...(snapshot.buffs || {}) },
    base: snapshot.base || baseFor(map),
    player: { ...fallback.player, ...snapshot.player, x: snapshot.player?.x ?? playerSpawn.x, y: snapshot.player?.y ?? playerSpawn.y },
    effects: [],
    transition: null,
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
  state.map = mapForLevel(state.level);
  state.levelConfig = levelTuning(config, state.level);
  state.enemies = [];
  state.bullets = [];
  state.powerups = [];
  state.walls = makeWalls(state.level, state.map);
  state.terrain = makeTerrain(state.level, state.map);
  state.base = baseFor(state.map);
  state.spawned = 0;
  state.destroyed = 0;
  state.total = state.levelConfig.total;
  state.spawnTimer = 0.75;
  const playerSpawn = playerSpawnFor(state.map);
  state.player.x = playerSpawn.x;
  state.player.y = playerSpawn.y;
  state.player.dir = "up";
  state.player.invuln = 1.2;
  state.boatTimer = 0;
  const bossStage = isFinalStage(state);
  announceStageStart(state, context, {
    message: bossStage ? `第 ${state.maxLevel} 关：重装指挥坦克来袭` : `第 ${state.level} 关：${state.map.title}`,
    transition: {
      title: `第 ${stageMeta(state)} 关`,
      subtitle: bossStage ? "重装指挥坦克" : state.map.feature
    },
    effects: state.effects,
    position: { x: state.map.w / 2, y: state.map.h / 2 },
    burst: { count: 28, color: classicArcade.cyan, secondary: classicArcade.yellow, speed: 92, radius: 22 },
    shake: 3.5
  });
  if (levelHasTerrain(state, "river")) spawnPowerup(state, "boat");
}

function powerupSpotsFor(state) {
  const map = state.map || mapForLevel(state.level);
  return [
    { x: TILE * 2.5, y: TILE * 2.5 },
    { x: map.w - TILE * 2.5, y: TILE * 2.5 },
    { x: TILE * 2.5, y: map.h - TILE * 4.5 },
    { x: map.w - TILE * 2.5, y: map.h - TILE * 4.5 },
    { x: map.w / 2, y: map.h * 0.35 },
    { x: map.w / 2, y: map.h * 0.68 }
  ];
}

function spotBlocked(state, spot) {
  const rect = rectFromCenter(spot, 24);
  return state.walls.some((wall) => rectsOverlap(rect, wall)) ||
    state.terrain.some((tile) => tile.type === "river" && rectsOverlap(rect, tile)) ||
    (state.base.alive && rectsOverlap(rect, state.base));
}

function spawnPowerup(state, forcedType = "") {
  if (state.powerups.length >= 2) return;
  const types = ["rapid", "shield", "repair", "freeze", ...(levelHasTerrain(state, "river") ? ["boat"] : [])];
  const type = forcedType || chooseRewardType(types);
  const allSpots = powerupSpotsFor(state);
  const spots = type === "boat"
    ? allSpots.filter((spot) => spot.y > (state.map || mapForLevel(state.level)).h * 0.52)
    : allSpots;
  const offset = state.destroyed + state.powerups.length + Math.floor(Math.random() * spots.length);
  const spot = spots.slice(offset).concat(spots.slice(0, offset)).find((candidate) => !spotBlocked(state, candidate)) || spots[0];
  addPickup(state.powerups, type, spot, { ttl: type === "boat" ? 18 : 11, maxCount: 2 });
}

function applyPowerup(state, item, context) {
  if (item.type === "rapid") {
    state.buffs.rapid = 7;
    state.message = "速射补给：装填加快";
  } else if (item.type === "shield") {
    state.buffs.shield = 6;
    state.player.invuln = Math.max(state.player.invuln, 6);
    state.message = "护盾补给：短暂无敌";
  } else if (item.type === "freeze") {
    state.buffs.freeze = 4.5;
    state.message = "冻结补给：敌军减速";
  } else if (item.type === "boat") {
    state.buffs.boat = 14;
    state.message = "船只补给：可以渡河";
  } else {
    state.player.lives = Math.min(5, state.player.lives + 1);
    state.message = "维修补给：生命 +1";
  }
  addBurst(state.effects, item.x, item.y, { count: 16, color: classicArcade.green, secondary: classicArcade.yellow, speed: 72, radius: 10 });
  addFloatingText(state.effects, item.x, item.y - 16, item.type === "repair" ? "+1" : "BUFF", { color: classicArcade.yellow });
  context.playSound?.("score");
}

function spawnEnemy(state) {
  const config = state.levelConfig;
  if (state.spawned >= state.total || state.enemies.length >= config.active) return;
  const map = state.map || mapForLevel(state.level);
  const spawns = [
    { x: 28, y: 28 },
    { x: map.w / 2, y: 28 },
    { x: map.w - 28, y: 28 },
    { x: map.w * 0.25, y: 58 },
    { x: map.w * 0.75, y: 58 }
  ];
  const spawn = spawns[state.spawned % spawns.length];
  const isBoss = isFinalStage(state) && state.spawned === state.total - 1;
  const enemy = {
    x: spawn.x,
    y: spawn.y,
    dir: "down",
    reload: 0.8 + Math.random() * 0.6,
    turn: 0,
    hp: isBoss ? 9 + config.active : (state.spawned + state.level) % 4 === 0 ? 2 : 1
  };
  state.enemies.push(isBoss ? createBossEnemy(enemy) : enemy);
  if (isBoss) state.message = "Boss 出现：重装指挥坦克";
  state.spawned += 1;
}

function terrainTilesAt(state, rect, type = "") {
  return state.terrain.filter((tile) => (!type || tile.type === type) && rectsOverlap(rect, tile));
}

function tankInTerrain(state, tank, type) {
  return terrainTilesAt(state, tankRect(tank), type).length > 0;
}

function canCrossRiver(state, tank) {
  return tank === state.player && (state.buffs.boat > 0 || tankInTerrain(state, tank, "river"));
}

function terrainSpeedFactor(state, tank) {
  const rect = tankRect(tank);
  let factor = 1;
  if (terrainTilesAt(state, rect, "mud").length) factor *= tank === state.player ? 0.52 : 0.68;
  if (terrainTilesAt(state, rect, "river").length && canCrossRiver(state, tank)) factor *= 0.78;
  return factor;
}

function obstacleAt(state, rect, self = null) {
  const map = state.map || mapForLevel(state.level);
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > map.w || rect.y + rect.h > map.h) return true;
  if (state.base.alive && rectsOverlap(rect, state.base)) return true;
  if (state.walls.some((wall) => rectsOverlap(rect, wall))) return true;
  if (terrainTilesAt(state, rect, "river").length && !canCrossRiver(state, self)) return true;
  if (self !== state.player && rectsOverlap(rect, tankRect(state.player))) return true;
  return state.enemies.some((enemy) => enemy !== self && rectsOverlap(rect, tankRect(enemy)));
}

function moveTank(state, tank, speed, dt) {
  const dir = DIRS[tank.dir];
  const terrainFactor = terrainSpeedFactor(state, tank);
  const nx = tank.x + dir.x * speed * terrainFactor * dt;
  const ny = tank.y + dir.y * speed * terrainFactor * dt;
  const rect = tankRect(tank, nx, ny);
  if (!obstacleAt(state, rect, tank)) {
    tank.x = nx;
    tank.y = ny;
    return true;
  }
  return false;
}

function fire(state, tank, owner) {
  if (tank.reload > 0) return false;
  const dir = DIRS[tank.dir];
  const muzzleX = tank.x + dir.x * 18;
  const muzzleY = tank.y + dir.y * 18;
  state.bullets.push({
    x: muzzleX,
    y: muzzleY,
    vx: dir.x * 178,
    vy: dir.y * 178,
    owner
  });
  addBurst(state.effects, muzzleX, muzzleY, {
    count: owner === "player" ? 5 : 3,
    color: owner === "player" ? classicArcade.cyan : classicArcade.orange,
    secondary: classicArcade.white,
    speed: 46,
    life: 0.16,
    radius: 3
  });
  if (owner === "player") state.shake = Math.max(state.shake, 1.4);
  tank.reload = owner === "player" ? (state.buffs.rapid > 0 ? 0.22 : 0.46) : 0.9;
  return true;
}

function hitWall(state, bulletRect) {
  const index = state.walls.findIndex((wall) => rectsOverlap(bulletRect, wall));
  if (index < 0) return false;
  const wall = state.walls[index];
  addBurst(state.effects, bulletRect.x + bulletRect.w / 2, bulletRect.y + bulletRect.h / 2, {
    count: wall.type === "brick" ? 10 : 6,
    color: wall.type === "brick" ? classicArcade.brick2 : classicArcade.steel,
    secondary: classicArcade.white,
    speed: wall.type === "brick" ? 62 : 38,
    life: 0.24,
    radius: 5
  });
  state.shake = Math.max(state.shake, wall.type === "brick" ? 2.2 : 1.2);
  if (wall.type === "brick") state.walls.splice(index, 1);
  return true;
}

function hitMineWithBullet(state, bulletRect) {
  const mine = state.terrain.find((tile) => tile.type === "mine" && rectsOverlap(bulletRect, tile));
  if (!mine) return false;
  state.terrain = state.terrain.filter((tile) => tile !== mine);
  addBurst(state.effects, mine.x + mine.w / 2, mine.y + mine.h / 2, {
    count: 18,
    color: classicArcade.orange,
    secondary: classicArcade.red,
    speed: 86,
    radius: 14
  });
  state.shake = Math.max(state.shake, 3.2);
  return true;
}

function damagePlayer(state) {
  if (state.player.invuln > 0) return;
  addBurst(state.effects, state.player.x, state.player.y, { count: 18, color: classicArcade.red, secondary: classicArcade.yellow, speed: 92, radius: 11 });
  addFloatingText(state.effects, state.player.x, state.player.y - 16, "-1", { color: classicArcade.red });
  state.shake = Math.max(state.shake, 5);
  state.player.lives -= 1;
  const playerSpawn = playerSpawnFor(state.map || mapForLevel(state.level));
  state.player.x = playerSpawn.x;
  state.player.y = playerSpawn.y;
  state.player.dir = "up";
  state.player.invuln = 1.4;
  state.message = state.player.lives > 0 ? "被击中，重新出击" : "坦克被击毁";
}

function destroyEnemy(state, hit, context, source = "shot") {
  addBurst(state.effects, hit.x, hit.y, {
    count: hit.boss ? 34 : 20,
    color: classicArcade.red,
    secondary: classicArcade.yellow,
    speed: hit.boss ? 118 : 92,
    radius: hit.boss ? 18 : 12
  });
  addFloatingText(state.effects, hit.x, hit.y - 16, hit.boss ? "+600" : source === "mine" ? "+130" : "+100", { color: classicArcade.yellow, size: hit.boss ? 16 : 14 });
  state.enemies = state.enemies.filter((enemy) => enemy !== hit);
  state.destroyed += 1;
  state.score += hit.boss ? 600 : source === "mine" ? 130 : 100;
  state.message = hit.boss ? "Boss 已击破" : source === "mine" ? `地雷击毁敌坦 ${state.destroyed}/${state.total}` : `击毁敌坦 ${state.destroyed}/${state.total}`;
  state.shake = Math.max(state.shake, hit.boss ? 6 : 4);
  context.playSound?.("score");
  if (!hit.boss && shouldDropReward({ rate: 0.36, count: state.destroyed, forceAt: [2] })) spawnPowerup(state);
}

function triggerMines(state, tank, context, owner) {
  const rect = tankRect(tank);
  const mine = state.terrain.find((tile) => tile.type === "mine" && rectsOverlap(rect, tile));
  if (!mine) return;
  state.terrain = state.terrain.filter((tile) => tile !== mine);
  const cx = mine.x + mine.w / 2;
  const cy = mine.y + mine.h / 2;
  addBurst(state.effects, cx, cy, { count: 24, color: classicArcade.orange, secondary: classicArcade.red, speed: 112, radius: 18 });
  state.shake = Math.max(state.shake, 5.5);
  if (owner === "player") {
    state.message = "触雷！重新出击";
    damagePlayer(state);
  } else {
    tank.hp -= 2;
    if (tank.hp <= 0) destroyEnemy(state, tank, context, "mine");
  }
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "基地守住，敌军清空" : "基地失守";
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
  updateStageTransition(state, dt);
  state.shake = Math.max(0, state.shake - dt * 16);
  for (const key of Object.keys(state.buffs)) state.buffs[key] = Math.max(0, state.buffs[key] - dt);
  state.powerups = updatePickups(state.powerups, dt);
  if (state.over) return;
  if (levelHasTerrain(state, "river") && state.buffs.boat <= 0 && !state.powerups.some((item) => item.type === "boat")) {
    state.boatTimer -= dt;
    if (state.boatTimer <= 0) {
      spawnPowerup(state, "boat");
      state.boatTimer = 13;
    }
  }
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state);
    state.spawnTimer = 1.25;
  }

  state.player.reload = Math.max(0, state.player.reload - dt);
  state.player.invuln = Math.max(0, state.player.invuln - dt);
  const wanted = wantedDirection(controls);
  if (wanted) {
    state.player.dir = wanted;
    moveTank(state, state.player, 74, dt);
    triggerMines(state, state.player, context, "player");
    if (tankInTerrain(state, state.player, "mud")) state.message = "泥沼区域：移动减速";
    if (tankInTerrain(state, state.player, "grass")) state.message = "草地遮蔽：敌军难以锁定";
  }
  if (controls.fire && fire(state, state.player, "player")) context.playSound?.("move");

  state.powerups = collectPickups(
    state.powerups,
    (item) => rectsOverlap(tankRect(state.player), pickupRect(item, 22)),
    (item) => applyPowerup(state, item, context)
  );

  const playerHidden = tankInTerrain(state, state.player, "grass");
  for (const enemy of state.enemies) {
    enemy.reload = Math.max(0, enemy.reload - dt);
    enemy.turn -= dt;
    if (enemy.turn <= 0) {
      const chaseAxis = Math.random() < 0.55 ? "x" : "y";
      if (playerHidden && Math.random() < 0.68) {
        enemy.dir = ["up", "down", "left", "right"][Math.floor(Math.random() * 4)];
      } else if (chaseAxis === "x") enemy.dir = enemy.x < state.player.x ? "right" : "left";
      else enemy.dir = enemy.y < state.player.y ? "down" : "up";
      if (Math.random() < (playerHidden ? 0.42 : 0.25)) enemy.dir = ["up", "down", "left", "right"][Math.floor(Math.random() * 4)];
      enemy.turn = 0.55 + Math.random() * 0.8;
    }
    const levelConfig = state.levelConfig;
    const speedBoost = enemy.boss ? 0.76 : 1;
    if (!moveTank(state, enemy, levelConfig.enemySpeed * speedBoost * (state.buffs.freeze > 0 ? 0.45 : 1), dt)) enemy.turn = 0;
    triggerMines(state, enemy, context, "enemy");
    if (!state.enemies.includes(enemy)) continue;
    const fireDelay = enemy.boss ? levelConfig.enemyFire * 0.62 : levelConfig.enemyFire;
    const concealPenalty = playerHidden ? 0.35 : 1;
    if (state.buffs.freeze <= 0 && Math.random() < (dt / fireDelay) * concealPenalty) fire(state, enemy, "enemy");
  }

  state.bullets = state.bullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    const rect = rectFromCenter(bullet, 6);
    const map = state.map || mapForLevel(state.level);
    if (rect.x < -6 || rect.y < -6 || rect.x > map.w + 6 || rect.y > map.h + 6) return false;
    if (hitMineWithBullet(state, rect)) return false;
    if (hitWall(state, rect)) return false;
    if (state.base.alive && rectsOverlap(rect, state.base)) {
      state.base.alive = false;
      addBurst(state.effects, state.base.x + state.base.w / 2, state.base.y + state.base.h / 2, { count: 24, color: classicArcade.red, secondary: classicArcade.yellow, speed: 98, radius: 14 });
      state.shake = Math.max(state.shake, 7);
      finish(state, false, context);
      return false;
    }
    if (bullet.owner === "player") {
      const hit = state.enemies.find((enemy) => rectsOverlap(rect, tankRect(enemy)));
      if (hit) {
        hit.hp -= 1;
        addBurst(state.effects, bullet.x, bullet.y, { count: 8, color: classicArcade.red, secondary: classicArcade.yellow, speed: 56, life: 0.22, radius: 5 });
        if (hit.hp <= 0) {
          destroyEnemy(state, hit, context);
        }
        return false;
      }
    } else if (rectsOverlap(rect, tankRect(state.player))) {
      damagePlayer(state);
      return false;
    }
    return true;
  });

  if (state.player.lives <= 0) finish(state, false, context);
  if (state.destroyed >= state.total && !state.enemies.length) {
    if (isFinalStage(state)) finish(state, true, context);
    else advanceLevel(state, config, context);
  }
}

function cameraFor(state) {
  const map = state.map || mapForLevel(state.level);
  return {
    x: clamp(state.player.x - W / 2, 0, Math.max(0, map.w - W)),
    y: clamp(state.player.y - H / 2, 0, Math.max(0, map.h - H))
  };
}

function drawTerrainTile(ctx, tile, time, overlay = false) {
  if (tile.type === "grass") {
    ctx.save();
    ctx.globalAlpha = overlay ? 0.72 : 0.32;
    ctx.fillStyle = overlay ? "#4fd37d" : "#26794a";
    ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
    ctx.strokeStyle = overlay ? "rgba(210,255,218,.42)" : "rgba(93,255,139,.16)";
    ctx.lineWidth = 1;
    for (let i = 4; i < tile.w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(tile.x + i, tile.y + tile.h);
      ctx.quadraticCurveTo(tile.x + i - 5, tile.y + tile.h / 2, tile.x + i + 2, tile.y + 4);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (tile.type === "river") {
    ctx.fillStyle = "#1e6ea8";
    ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
    ctx.fillStyle = "rgba(132, 231, 255, .38)";
    const shift = (time * 22) % 16;
    for (let x = -16; x < tile.w + 16; x += 16) {
      ctx.fillRect(tile.x + x + shift, tile.y + 9, 10, 3);
      ctx.fillRect(tile.x + x - shift, tile.y + 20, 8, 2);
    }
    ctx.strokeStyle = "rgba(215,255,255,.28)";
    ctx.strokeRect(tile.x + 0.5, tile.y + 0.5, tile.w - 1, tile.h - 1);
    return;
  }

  if (tile.type === "mud") {
    ctx.fillStyle = "#574833";
    ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
    ctx.fillStyle = "rgba(230, 188, 122, .22)";
    ctx.beginPath();
    ctx.arc(tile.x + 10, tile.y + 10, 6, 0, Math.PI * 2);
    ctx.arc(tile.x + 21, tile.y + 22, 5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (tile.type === "mine") {
    ctx.fillStyle = "rgba(255, 77, 94, .18)";
    ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.arc(tile.x + tile.w / 2, tile.y + tile.h / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tile.x + tile.w / 2 - 10, tile.y + tile.h / 2);
    ctx.lineTo(tile.x + tile.w / 2 + 10, tile.y + tile.h / 2);
    ctx.moveTo(tile.x + tile.w / 2, tile.y + tile.h / 2 - 10);
    ctx.lineTo(tile.x + tile.w / 2, tile.y + tile.h / 2 + 10);
    ctx.stroke();
  }
}

function drawTerrain(ctx, state, overlay = false) {
  for (const tile of state.terrain) {
    if (overlay !== (tile.type === "grass")) continue;
    drawTerrainTile(ctx, tile, state.time, overlay);
  }
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  const offset = shakeOffset(state.shake);
  drawArcadeBackdrop(ctx, W, H, state.time, { top: "#101616", bottom: "#17231e", grid: "rgba(93,255,139,.09)", gridSize: TILE });
  ctx.save();
  const map = state.map || mapForLevel(state.level);
  const camera = cameraFor(state);
  ctx.translate(offset.x - camera.x, offset.y - camera.y);
  ctx.strokeStyle = "rgba(255, 255, 255, .05)";
  for (let x = 0; x <= map.w; x += TILE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, map.h);
    ctx.stroke();
  }
  for (let y = 0; y <= map.h; y += TILE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(map.w, y);
    ctx.stroke();
  }

  drawTerrain(ctx, state, false);
  for (const wall of state.walls) {
    drawTankWall(ctx, wall);
  }
  drawBase(ctx, state.base, state.base.alive);

  drawTankSprite(ctx, state.player, "player");
  if (state.player.invuln > 0 && Math.floor(state.time * 12) % 2 === 0) {
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 2;
    ctx.strokeRect(state.player.x - 16, state.player.y - 16, 32, 32);
  }
  state.enemies.forEach((enemy) => {
    drawTankSprite(ctx, enemy, "enemy");
    if (enemy.boss) {
      ctx.strokeStyle = classicArcade.red;
      ctx.lineWidth = 2;
      ctx.strokeRect(enemy.x - 18, enemy.y - 18, 36, 36);
      ctx.fillStyle = classicArcade.red;
      ctx.fillRect(enemy.x - 16, enemy.y - 24, Math.max(3, 32 * bossHealthRatio(enemy)), 4);
    }
  });
  drawTerrain(ctx, state, true);
  state.powerups.forEach((item) => drawPowerup(ctx, item));

  for (const bullet of state.bullets) {
    ctx.fillStyle = bullet.owner === "player" ? classicArcade.white : classicArcade.orange;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  drawEffects(ctx, state.effects);
  ctx.restore();
  drawStageTransition(ctx, W, H, state.transition);
}

export function mountTankBattle(root, context) {
  const config = DIFFICULTY[context.difficulty] || DIFFICULTY.medium;
  let state = restoreState(config, context.savedState);
  const controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0, fire: false };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>${context.labels.difficulty} · ${MAX_LEVEL} 关防守 · 后期大地图</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/${MAX_LEVEL}</span>
        <span data-lives>生命 ${state.player.lives}</span>
        <span data-score>分数 0</span>
        <span data-left>敌军 ${state.total}</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="坦克大战"></canvas></div>
      <div class="arcade-controls">
        ${joystickMarkup("坦克移动")}
        <div class="arcade-control-stack">
          <button class="arcade-fire compact" data-action="restart">重开</button>
          <button class="arcade-fire" data-control="fire">开火</button>
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
  const power = document.createElement("span");
  power.dataset.power = "true";
  power.textContent = "道具 无";
  left.after(power);

  function refreshHud() {
    status.textContent = state.message;
    note.textContent = `${context.labels.difficulty} · ${state.map.cols}x${state.map.rows} 地图 · ${state.map.feature}`;
    level.textContent = stageLabel(state);
    lives.textContent = `生命 ${state.player.lives}`;
    score.textContent = `分数 ${state.score}`;
    left.textContent = `敌军 ${Math.max(0, state.total - state.destroyed)}`;
    const buffs = [
      state.buffs.rapid > 0 ? `速射 ${Math.ceil(state.buffs.rapid)}` : "",
      state.buffs.shield > 0 ? `护盾 ${Math.ceil(state.buffs.shield)}` : "",
      state.buffs.freeze > 0 ? `冻结 ${Math.ceil(state.buffs.freeze)}` : "",
      state.buffs.boat > 0 ? `船 ${Math.ceil(state.buffs.boat)}` : ""
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

  function restart() {
    state = initialState(config);
    context.clearSession?.();
    loop.resetClock();
  }

  const cleanupJoystick = bindVirtualJoystick(root, controls);
  const cleanupFire = bindHold(root, "[data-control='fire']", (pressed) => { controls.fire = pressed; });
  const cleanupKeys = bindDigitalKeys(controls, { ...DIRECTION_KEY_MAP, Space: "fire" });
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupJoystick();
    cleanupFire();
    cleanupKeys();
    cleanupShellRestart();
  };
}
