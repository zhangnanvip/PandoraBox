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

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tankRect(tank, x = tank.x, y = tank.y) {
  return { x: x - 11, y: y - 11, w: 22, h: 22 };
}

function makeWalls() {
  const bricks = [
    [2, 2], [3, 2], [8, 2], [9, 2], [5, 4], [6, 4], [1, 6], [2, 6], [9, 6], [10, 6],
    [4, 8], [7, 8], [5, 10], [6, 10], [4, 11], [7, 11]
  ].map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "brick", hp: 1 }));
  const steel = [[0, 4], [11, 4], [4, 5], [7, 5], [0, 9], [11, 9]]
    .map(([x, y]) => ({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type: "steel", hp: 99 }));
  return [...bricks, ...steel];
}

function initialState(config) {
  return {
    player: { x: W / 2, y: H - 44, dir: "up", lives: config.playerLives, reload: 0, invuln: 1 },
    enemies: [],
    bullets: [],
    walls: makeWalls(),
    base: { x: W / 2 - 16, y: H - 28, w: 32, h: 24, alive: true },
    score: 0,
    spawned: 0,
    destroyed: 0,
    total: config.total,
    message: "守住基地",
    over: false,
    won: false,
    time: 0,
    spawnTimer: 0
  };
}

function spawnEnemy(state, config) {
  if (state.spawned >= state.total || state.enemies.length >= config.active) return;
  const spawns = [
    { x: 28, y: 28 },
    { x: W / 2, y: 28 },
    { x: W - 28, y: 28 }
  ];
  const spawn = spawns[state.spawned % spawns.length];
  state.enemies.push({
    x: spawn.x,
    y: spawn.y,
    dir: "down",
    reload: 0.8 + Math.random() * 0.6,
    turn: 0,
    hp: state.spawned % 4 === 3 ? 2 : 1
  });
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
  if (tank.reload > 0) return;
  const dir = DIRS[tank.dir];
  state.bullets.push({
    x: tank.x + dir.x * 14,
    y: tank.y + dir.y * 14,
    vx: dir.x * 178,
    vy: dir.y * 178,
    owner
  });
  tank.reload = owner === "player" ? 0.46 : 0.9;
}

function hitWall(state, bulletRect) {
  const index = state.walls.findIndex((wall) => rectsOverlap(bulletRect, wall));
  if (index < 0) return false;
  const wall = state.walls[index];
  if (wall.type === "brick") state.walls.splice(index, 1);
  return true;
}

function damagePlayer(state) {
  if (state.player.invuln > 0) return;
  state.player.lives -= 1;
  state.player.x = W / 2;
  state.player.y = H - 44;
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
  if (state.over) return;
  state.time += dt;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state, config);
    state.spawnTimer = 1.25;
  }

  state.player.reload = Math.max(0, state.player.reload - dt);
  state.player.invuln = Math.max(0, state.player.invuln - dt);
  const wanted = ["up", "down", "left", "right"].find((dir) => controls[dir]);
  if (wanted) {
    state.player.dir = wanted;
    moveTank(state, state.player, 74, dt);
  }
  if (controls.fire) fire(state, state.player, "player");

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
    if (!moveTank(state, enemy, config.enemySpeed, dt)) enemy.turn = 0;
    if (Math.random() < dt / config.enemyFire) fire(state, enemy, "enemy");
  }

  state.bullets = state.bullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    const rect = { x: bullet.x - 3, y: bullet.y - 3, w: 6, h: 6 };
    if (rect.x < -6 || rect.y < -6 || rect.x > W + 6 || rect.y > H + 6) return false;
    if (hitWall(state, rect)) return false;
    if (state.base.alive && rectsOverlap(rect, state.base)) {
      state.base.alive = false;
      finish(state, false, context);
      return false;
    }
    if (bullet.owner === "player") {
      const hit = state.enemies.find((enemy) => rectsOverlap(rect, tankRect(enemy)));
      if (hit) {
        hit.hp -= 1;
        if (hit.hp <= 0) {
          state.enemies = state.enemies.filter((enemy) => enemy !== hit);
          state.destroyed += 1;
          state.score += 100;
          state.message = `击毁敌坦 ${state.destroyed}/${state.total}`;
          context.playSound?.("score");
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
  if (state.destroyed >= state.total && !state.enemies.length) finish(state, true, context);
}

function drawTank(ctx, tank, color, stroke) {
  ctx.save();
  ctx.translate(tank.x, tank.y);
  const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[tank.dir];
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fillRect(-12, -11, 24, 22);
  ctx.strokeRect(-12, -11, 24, 22);
  ctx.fillStyle = stroke;
  ctx.fillRect(-3, -20, 6, 18);
  ctx.fillStyle = "rgba(255,250,240,.82)";
  ctx.fillRect(-7, -5, 14, 10);
  ctx.restore();
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#17231e";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,250,240,.08)";
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
    ctx.fillStyle = wall.type === "steel" ? "#8f9389" : "#9f4c35";
    ctx.fillRect(wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4);
    ctx.strokeStyle = "rgba(255,250,240,.25)";
    ctx.strokeRect(wall.x + 4, wall.y + 4, wall.w - 8, wall.h - 8);
  }
  ctx.fillStyle = state.base.alive ? "#d79d38" : "#4b2b25";
  ctx.fillRect(state.base.x, state.base.y, state.base.w, state.base.h);
  ctx.fillStyle = "#1f5f4a";
  ctx.fillRect(state.base.x + 9, state.base.y + 6, 14, 13);

  drawTank(ctx, state.player, state.player.invuln > 0 ? "#f0c76d" : "#1f8d67", "#fffaf0");
  state.enemies.forEach((enemy) => drawTank(ctx, enemy, enemy.hp > 1 ? "#b63b2b" : "#be5c79", "#fffaf0"));

  for (const bullet of state.bullets) {
    ctx.fillStyle = bullet.owner === "player" ? "#fffaf0" : "#d79d38";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bindHold(root, controls, selector, key) {
  root.querySelector(selector)?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    controls[key] = true;
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((type) => {
    root.querySelector(selector)?.addEventListener(type, () => {
      controls[key] = false;
    });
  });
}

export function mountTankBattle(root, context) {
  const config = DIFFICULTY[context.difficulty] || DIFFICULTY.medium;
  let state = initialState(config);
  const controls = { up: false, down: false, left: false, right: false, fire: false };
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels.difficulty} · ${config.total} 辆敌坦 · 基地防守</p>
      </div>
      <div class="mini-stats">
        <span data-lives>生命 ${state.player.lives}</span>
        <span data-score>分数 0</span>
        <span data-left>敌军 ${config.total}</span>
      </div>
    </section>
    <section class="arcade-shell">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="坦克大战"></canvas></div>
      <div class="arcade-controls">
        <div class="arcade-dpad" aria-label="移动方向">
          <button data-control="up">上</button>
          <button data-control="left">左</button>
          <button data-control="right">右</button>
          <button data-control="down">下</button>
        </div>
        <button class="arcade-fire" data-control="fire">开火</button>
      </div>
    </section>
    <section class="game-panel toolbar">
      <button class="danger-button" data-action="restart">重开</button>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const lives = root.querySelector("[data-lives]");
  const score = root.querySelector("[data-score]");
  const left = root.querySelector("[data-left]");

  function refreshHud() {
    status.textContent = state.message;
    lives.textContent = `生命 ${state.player.lives}`;
    score.textContent = `分数 ${state.score}`;
    left.textContent = `敌军 ${Math.max(0, state.total - state.destroyed)}`;
  }

  function loop(now) {
    if (disposed) return;
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

  ["up", "down", "left", "right", "fire"].forEach((key) => bindHold(root, controls, `[data-control="${key}"]`, key));
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
