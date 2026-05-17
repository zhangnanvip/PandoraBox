import { bindHold, bindVirtualJoystick, joystickMarkup } from "../arcade/controls.js";
import { addBurst, classicArcade, drawArcadeBackdrop, drawBase, drawEffects, drawPowerup, drawTankSprite, drawTankWall, shakeOffset, updateEffects } from "../arcade/classic-visuals.js";

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
const MAX_LEVEL = 5;
const PLAYER_SPAWN = { x: W / 2 - 50, y: H - 44 };
const POWERUP_SPAWNS = [
  { x: 75, y: 75 },
  { x: 285, y: 75 },
  { x: 75, y: 210 },
  { x: 285, y: 210 },
  { x: W / 2, y: 255 }
];

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tankRect(tank, x = tank.x, y = tank.y) {
  return { x: x - 11, y: y - 11, w: 22, h: 22 };
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

function makeWalls(level = 1) {
  const bricks = [
    [2, 2], [3, 2], [8, 2], [9, 2], [5, 4], [6, 4], [1, 6], [2, 6], [9, 6], [10, 6],
    [4, 8], [7, 8], [5, 10], [6, 10], [4, 11], [7, 11]
  ].map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "brick", hp: 1 }));
  const levelBricks = [
    [],
    [[4, 2], [7, 2], [3, 7], [8, 7]],
    [[1, 3], [10, 3], [5, 7], [6, 7], [2, 10], [9, 10]],
    [[3, 3], [8, 3], [3, 9], [8, 9], [1, 11], [10, 11]],
    [[4, 3], [7, 3], [2, 5], [9, 5], [3, 10], [8, 10]]
  ][level - 1] || [];
  bricks.push(...levelBricks.map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "brick", hp: 1 })));
  const steel = [[0, 4], [11, 4], [4, 5], [7, 5], [0, 9], [11, 9]]
    .map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "steel", hp: 99 }));
  if (level >= 3) {
    steel.push(...[[5, 2], [6, 2]].map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "steel", hp: 99 })));
  }
  return [...bricks, ...steel];
}

function initialState(config) {
  const levelConfig = levelTuning(config, 1);
  return {
    level: 1,
    maxLevel: MAX_LEVEL,
    levelConfig,
    player: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, dir: "up", lives: config.playerLives, reload: 0, invuln: 1 },
    enemies: [],
    bullets: [],
    walls: makeWalls(1),
    powerups: [],
    buffs: { rapid: 0, shield: 0, freeze: 0 },
    base: { x: W / 2 - 16, y: H - 28, w: 32, h: 24, alive: true },
    score: 0,
    spawned: 0,
    destroyed: 0,
    total: levelConfig.total,
    message: "第 1 关：守住基地",
    over: false,
    won: false,
    time: 0,
    spawnTimer: 0,
    effects: [],
    shake: 0
  };
}

function advanceLevel(state, config, context) {
  state.level += 1;
  state.levelConfig = levelTuning(config, state.level);
  state.enemies = [];
  state.bullets = [];
  state.powerups = [];
  state.walls = makeWalls(state.level);
  state.base = { x: W / 2 - 16, y: H - 28, w: 32, h: 24, alive: true };
  state.spawned = 0;
  state.destroyed = 0;
  state.total = state.levelConfig.total;
  state.spawnTimer = 0.75;
  state.player.x = PLAYER_SPAWN.x;
  state.player.y = PLAYER_SPAWN.y;
  state.player.dir = "up";
  state.player.invuln = 1.2;
  state.message = state.level === MAX_LEVEL ? "第 5 关：重装指挥坦克来袭" : `第 ${state.level} 关：敌军增援`;
  addBurst(state.effects, W / 2, H / 2, { count: 28, color: classicArcade.cyan, secondary: classicArcade.yellow, speed: 92, radius: 22 });
  state.shake = Math.max(state.shake, 3.5);
  context.playSound?.("start");
}

function spawnPowerup(state, forcedType = "") {
  if (state.powerups.length >= 2) return;
  const types = ["rapid", "shield", "repair", "freeze"];
  const type = forcedType || types[Math.floor(Math.random() * types.length)];
  const spot = POWERUP_SPAWNS[(state.destroyed + state.powerups.length + Math.floor(Math.random() * POWERUP_SPAWNS.length)) % POWERUP_SPAWNS.length];
  state.powerups.push({ type, x: spot.x, y: spot.y, ttl: 11 });
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
  } else {
    state.player.lives = Math.min(5, state.player.lives + 1);
    state.message = "维修补给：生命 +1";
  }
  addBurst(state.effects, item.x, item.y, { count: 16, color: classicArcade.green, secondary: classicArcade.yellow, speed: 72, radius: 10 });
  context.playSound?.("score");
}

function spawnEnemy(state) {
  const config = state.levelConfig;
  if (state.spawned >= state.total || state.enemies.length >= config.active) return;
  const spawns = [
    { x: 28, y: 28 },
    { x: W / 2, y: 28 },
    { x: W - 28, y: 28 }
  ];
  const spawn = spawns[state.spawned % spawns.length];
  const isBoss = state.level === MAX_LEVEL && state.spawned === state.total - 1;
  state.enemies.push({
    x: spawn.x,
    y: spawn.y,
    dir: "down",
    reload: 0.8 + Math.random() * 0.6,
    turn: 0,
    hp: isBoss ? 9 + config.active : (state.spawned + state.level) % 4 === 0 ? 2 : 1,
    boss: isBoss
  });
  if (isBoss) state.message = "Boss 出现：重装指挥坦克";
  state.spawned += 1;
}

function obstacleAt(state, rect, self = null) {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > W || rect.y + rect.h > H) return true;
  if (state.base.alive && rectsOverlap(rect, state.base)) return true;
  if (state.walls.some((wall) => rectsOverlap(rect, wall))) return true;
  if (self !== state.player && rectsOverlap(rect, tankRect(state.player))) return true;
  return state.enemies.some((enemy) => enemy !== self && rectsOverlap(rect, tankRect(enemy)));
}

function moveTank(state, tank, speed, dt) {
  const dir = DIRS[tank.dir];
  const nx = tank.x + dir.x * speed * dt;
  const ny = tank.y + dir.y * speed * dt;
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

function damagePlayer(state) {
  if (state.player.invuln > 0) return;
  addBurst(state.effects, state.player.x, state.player.y, { count: 18, color: classicArcade.red, secondary: classicArcade.yellow, speed: 92, radius: 11 });
  state.shake = Math.max(state.shake, 5);
  state.player.lives -= 1;
  state.player.x = PLAYER_SPAWN.x;
  state.player.y = PLAYER_SPAWN.y;
  state.player.dir = "up";
  state.player.invuln = 1.4;
  state.message = state.player.lives > 0 ? "被击中，重新出击" : "坦克被击毁";
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "基地守住，敌军清空" : "基地失守";
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
  state.powerups.forEach((item) => { item.ttl -= dt; });
  state.powerups = state.powerups.filter((item) => item.ttl > 0);
  if (state.over) return;
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
  }
  if (controls.fire && fire(state, state.player, "player")) context.playSound?.("move");

  state.powerups = state.powerups.filter((item) => {
    const collected = rectsOverlap(tankRect(state.player), { x: item.x - 11, y: item.y - 11, w: 22, h: 22 });
    if (collected) applyPowerup(state, item, context);
    return !collected;
  });

  for (const enemy of state.enemies) {
    enemy.reload = Math.max(0, enemy.reload - dt);
    enemy.turn -= dt;
    if (enemy.turn <= 0) {
      const chaseAxis = Math.random() < 0.55 ? "x" : "y";
      if (chaseAxis === "x") enemy.dir = enemy.x < state.player.x ? "right" : "left";
      else enemy.dir = enemy.y < state.player.y ? "down" : "up";
      if (Math.random() < 0.25) enemy.dir = ["up", "down", "left", "right"][Math.floor(Math.random() * 4)];
      enemy.turn = 0.55 + Math.random() * 0.8;
    }
    const levelConfig = state.levelConfig;
    const speedBoost = enemy.boss ? 0.76 : 1;
    if (!moveTank(state, enemy, levelConfig.enemySpeed * speedBoost * (state.buffs.freeze > 0 ? 0.45 : 1), dt)) enemy.turn = 0;
    if (state.buffs.freeze <= 0 && Math.random() < dt / (enemy.boss ? levelConfig.enemyFire * 0.62 : levelConfig.enemyFire)) fire(state, enemy, "enemy");
  }

  state.bullets = state.bullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    const rect = { x: bullet.x - 3, y: bullet.y - 3, w: 6, h: 6 };
    if (rect.x < -6 || rect.y < -6 || rect.x > W + 6 || rect.y > H + 6) return false;
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
          addBurst(state.effects, hit.x, hit.y, { count: 20, color: classicArcade.red, secondary: classicArcade.yellow, speed: 92, radius: 12 });
          state.enemies = state.enemies.filter((enemy) => enemy !== hit);
          state.destroyed += 1;
          state.score += hit.boss ? 600 : 100;
          state.message = hit.boss ? "Boss 已击破" : `击毁敌坦 ${state.destroyed}/${state.total}`;
          state.shake = Math.max(state.shake, 4);
          context.playSound?.("score");
          if (!hit.boss && (Math.random() < 0.36 || state.destroyed === 2)) spawnPowerup(state);
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
    if (state.level >= state.maxLevel) finish(state, true, context);
    else advanceLevel(state, config, context);
  }
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const offset = shakeOffset(state.shake);
  ctx.translate(offset.x, offset.y);
  drawArcadeBackdrop(ctx, W, H, state.time, { top: "#101616", bottom: "#17231e", grid: "rgba(93,255,139,.09)", gridSize: TILE });
  ctx.strokeStyle = "rgba(255, 255, 255, .05)";
  for (let x = 0; x <= W; x += TILE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += TILE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

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
      ctx.fillRect(enemy.x - 16, enemy.y - 24, Math.max(3, enemy.hp * 2), 4);
    }
  });
  state.powerups.forEach((item) => drawPowerup(ctx, item));

  for (const bullet of state.bullets) {
    ctx.fillStyle = bullet.owner === "player" ? classicArcade.white : classicArcade.orange;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  drawEffects(ctx, state.effects);
  ctx.restore();
}

export function mountTankBattle(root, context) {
  const config = DIFFICULTY[context.difficulty] || DIFFICULTY.medium;
  let state = initialState(config);
  const controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0, fire: false };
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>${context.labels.difficulty} · 5 关防守 · 第 5 关 Boss</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/5</span>
        <span data-lives>生命 ${state.player.lives}</span>
        <span data-score>分数 0</span>
        <span data-left>敌军 ${config.total}</span>
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
    note.textContent = `${context.labels.difficulty} · 第 ${state.level}/${state.maxLevel} 关 · ${state.level === state.maxLevel ? "Boss 防守" : "波次防守"}`;
    level.textContent = `关卡 ${state.level}/${state.maxLevel}`;
    lives.textContent = `生命 ${state.player.lives}`;
    score.textContent = `分数 ${state.score}`;
    left.textContent = `敌军 ${Math.max(0, state.total - state.destroyed)}`;
    const buffs = [
      state.buffs.rapid > 0 ? `速射 ${Math.ceil(state.buffs.rapid)}` : "",
      state.buffs.shield > 0 ? `护盾 ${Math.ceil(state.buffs.shield)}` : "",
      state.buffs.freeze > 0 ? `冻结 ${Math.ceil(state.buffs.freeze)}` : ""
    ].filter(Boolean);
    power.textContent = buffs.length ? buffs.join(" · ") : "道具 无";
  }

  function loop(now) {
    if (disposed) return;
    if (context.isPaused?.()) {
      last = now;
      draw(state, ctx);
      refreshHud();
      raf = requestAnimationFrame(loop);
      return;
    }
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(state, config, controls, dt, context);
    draw(state, ctx);
    refreshHud();
    raf = requestAnimationFrame(loop);
  }

  function restart() {
    state = initialState(config);
    last = performance.now();
  }

  function onKey(event, pressed) {
    const keyMap = {
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      Space: "fire"
    };
    const key = keyMap[event.code];
    if (!key) return;
    event.preventDefault();
    controls[key] = pressed;
  }
  const onKeyDown = (event) => onKey(event, true);
  const onKeyUp = (event) => onKey(event, false);

  const cleanupJoystick = bindVirtualJoystick(root, controls);
  const cleanupFire = bindHold(root, "[data-control='fire']", (pressed) => { controls.fire = pressed; });
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cleanupJoystick();
    cleanupFire();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
