import { bindVirtualJoystick, joystickMarkup } from "../arcade/controls.js";
import { addBurst, classicArcade, drawEffects, drawEnemyShip, drawPlayerShip, drawStarfield, shakeOffset, updateEffects } from "../arcade/classic-visuals.js";

const W = 300;
const H = 400;
const CONFIG = {
  easy: { lives: 4, waves: 22, enemyEvery: 1.05, enemySpeed: 58, bulletSpeed: 96 },
  medium: { lives: 3, waves: 30, enemyEvery: 0.82, enemySpeed: 72, bulletSpeed: 116 },
  hard: { lives: 3, waves: 38, enemyEvery: 0.66, enemySpeed: 88, bulletSpeed: 136 },
  devil: { lives: 2, waves: 46, enemyEvery: 0.5, enemySpeed: 104, bulletSpeed: 158 }
};

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function initialState(config) {
  return {
    player: { x: W / 2, y: H - 45, lives: config.lives, reload: 0, invuln: 1 },
    enemies: [],
    bullets: [],
    enemyBullets: [],
    spawned: 0,
    killed: 0,
    score: 0,
    spawnTimer: 0.5,
    time: 0,
    over: false,
    won: false,
    message: "穿过弹幕",
    effects: [],
    shake: 0
  };
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "突破空域" : "战机坠落";
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    detail: state.message,
    score: state.score,
    moves: Math.round(state.time)
  });
}

function spawnEnemy(state, config) {
  if (state.spawned >= config.waves) return;
  state.enemies.push({
    x: 24 + Math.random() * (W - 48),
    y: -18,
    vx: (Math.random() - 0.5) * 42,
    hp: state.spawned % 7 === 6 ? 2 : 1,
    fire: 0.55 + Math.random() * 0.75
  });
  state.spawned += 1;
}

function update(state, config, controls, dt, context) {
  state.time += dt;
  updateEffects(state.effects, dt);
  state.shake = Math.max(0, state.shake - dt * 18);
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
    addBurst(state.effects, player.x, player.y - 18, { count: 4, color: classicArcade.cyan, secondary: classicArcade.white, speed: 34, life: 0.12, radius: 3 });
    player.reload = 0.18;
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state, config);
    state.spawnTimer = config.enemyEvery;
  }

  for (const enemy of state.enemies) {
    enemy.y += config.enemySpeed * dt;
    enemy.x += enemy.vx * dt;
    if (enemy.x < 16 || enemy.x > W - 16) enemy.vx *= -1;
    enemy.fire -= dt;
    if (enemy.fire <= 0) {
      state.enemyBullets.push({ x: enemy.x, y: enemy.y + 14, vy: config.bulletSpeed });
      enemy.fire = 0.9 + Math.random() * 0.85;
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.y < H + 24 && enemy.hp > 0);

  state.bullets.forEach((bullet) => {
    bullet.y += bullet.vy * dt;
  });
  state.enemyBullets.forEach((bullet) => {
    bullet.y += bullet.vy * dt;
  });
  state.bullets = state.bullets.filter((bullet) => bullet.y > -20);
  state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.y < H + 20);

  for (const bullet of state.bullets) {
    const hit = state.enemies.find((enemy) => overlap({ x: bullet.x - 3, y: bullet.y - 8, w: 6, h: 12 }, { x: enemy.x - 13, y: enemy.y - 11, w: 26, h: 22 }));
    if (hit) {
      hit.hp -= 1;
      bullet.y = -99;
      addBurst(state.effects, bullet.x, bullet.y, { count: 6, color: classicArcade.cyan, secondary: classicArcade.white, speed: 46, life: 0.18, radius: 4 });
      if (hit.hp <= 0) {
        addBurst(state.effects, hit.x, hit.y, { count: 18, color: classicArcade.red, secondary: classicArcade.yellow, speed: 94, radius: 11 });
        state.killed += 1;
        state.score += 80;
        state.message = `击落敌机 ${state.killed}/${config.waves}`;
        state.shake = Math.max(state.shake, 3.4);
        context.playSound?.("score");
      }
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);

  const playerRect = { x: player.x - 12, y: player.y - 13, w: 24, h: 26 };
  const hitByBullet = state.enemyBullets.some((bullet) => overlap(playerRect, { x: bullet.x - 4, y: bullet.y - 4, w: 8, h: 8 }));
  const hitByEnemy = state.enemies.some((enemy) => overlap(playerRect, { x: enemy.x - 13, y: enemy.y - 11, w: 26, h: 22 }));
  if ((hitByBullet || hitByEnemy) && player.invuln <= 0) {
    addBurst(state.effects, player.x, player.y, { count: 22, color: classicArcade.red, secondary: classicArcade.yellow, speed: 104, radius: 13 });
    state.shake = Math.max(state.shake, 6);
    player.lives -= 1;
    player.invuln = 1.2;
    state.enemyBullets = [];
    state.message = player.lives > 0 ? "中弹，护盾重启" : "战机坠落";
  }

  if (player.lives <= 0) finish(state, false, context);
  if (state.spawned >= config.waves && !state.enemies.length) finish(state, true, context);
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const offset = shakeOffset(state.shake);
  ctx.translate(offset.x, offset.y);
  drawStarfield(ctx, W, H, state.time);
  drawPlayerShip(ctx, state.player);

  for (const enemy of state.enemies) {
    drawEnemyShip(ctx, enemy);
  }
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
}

export function mountSpaceShooter(root, context) {
  const config = CONFIG[context.difficulty] || CONFIG.medium;
  let state = initialState(config);
  const controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0, pointer: null, pointerOffset: null };
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels.difficulty} · ${config.waves} 波敌机 · 自动射击</p>
      </div>
      <div class="mini-stats">
        <span data-lives>生命 ${state.player.lives}</span>
        <span data-score>分数 0</span>
        <span data-kills>击落 0</span>
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
  const lives = root.querySelector("[data-lives]");
  const score = root.querySelector("[data-score]");
  const kills = root.querySelector("[data-kills]");

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }

  function loop(now) {
    if (disposed) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(state, config, controls, dt, context);
    draw(state, ctx);
    status.textContent = state.message;
    lives.textContent = `生命 ${state.player.lives}`;
    score.textContent = `分数 ${state.score}`;
    kills.textContent = `击落 ${state.killed}`;
    raf = requestAnimationFrame(loop);
  }

  function restart() {
    state = initialState(config);
    controls.pointer = null;
    controls.pointerOffset = null;
    last = performance.now();
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
  const onKeyDown = (event) => setKey(event, true);
  const onKeyUp = (event) => setKey(event, false);
  function setKey(event, pressed) {
    const map = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    const key = map[event.code];
    if (!key) return;
    event.preventDefault();
    controls[key] = pressed;
  }
  const cleanupJoystick = bindVirtualJoystick(root, controls);
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  root.querySelector("[data-action='clear-pointer']").addEventListener("click", () => { controls.pointer = null; controls.pointerOffset = null; });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerLeave);
  canvas.addEventListener("pointercancel", onPointerLeave);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cleanupJoystick();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
