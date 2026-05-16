const W = 360;
const H = 360;
const CONFIG = {
  easy: { rows: 4, speed: 142, paddle: 86, lives: 4 },
  medium: { rows: 5, speed: 162, paddle: 76, lives: 3 },
  hard: { rows: 6, speed: 184, paddle: 66, lives: 3 },
  devil: { rows: 7, speed: 210, paddle: 58, lives: 2 }
};

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function makeBricks(rows) {
  const bricks = [];
  const cols = 8;
  const gap = 4;
  const bw = (W - 32 - gap * (cols - 1)) / cols;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      bricks.push({ x: 16 + x * (bw + gap), y: 34 + y * 18, w: bw, h: 13, hp: y < 2 ? 1 : 2 });
    }
  }
  return bricks;
}

function initialState(config) {
  return {
    paddle: { x: W / 2, y: H - 34, w: config.paddle },
    ball: { x: W / 2, y: H - 56, vx: config.speed * 0.56, vy: -config.speed },
    bricks: makeBricks(config.rows),
    lives: config.lives,
    score: 0,
    time: 0,
    over: false,
    won: false,
    message: "接住弹球"
  };
}

function resetBall(state, config) {
  state.ball = { x: state.paddle.x, y: H - 56, vx: config.speed * (Math.random() < 0.5 ? -0.52 : 0.52), vy: -config.speed };
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  state.message = won ? "砖阵清空" : "弹球落尽";
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
  const move = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  state.paddle.x = Math.max(state.paddle.w / 2, Math.min(W - state.paddle.w / 2, state.paddle.x + move * 220 * dt));
  if (Number.isFinite(controls.pointerX)) state.paddle.x = Math.max(state.paddle.w / 2, Math.min(W - state.paddle.w / 2, controls.pointerX));

  const ball = state.ball;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.x < 7 || ball.x > W - 7) {
    ball.x = Math.max(7, Math.min(W - 7, ball.x));
    ball.vx *= -1;
  }
  if (ball.y < 7) {
    ball.y = 7;
    ball.vy *= -1;
  }
  const paddleRect = { x: state.paddle.x - state.paddle.w / 2, y: state.paddle.y, w: state.paddle.w, h: 12 };
  if (ball.vy > 0 && overlap({ x: ball.x - 6, y: ball.y - 6, w: 12, h: 12 }, paddleRect)) {
    const offset = (ball.x - state.paddle.x) / (state.paddle.w / 2);
    ball.vx = offset * config.speed * 0.9;
    ball.vy = -Math.abs(ball.vy);
    context.playSound?.("move");
  }

  const hit = state.bricks.find((brick) => overlap({ x: ball.x - 6, y: ball.y - 6, w: 12, h: 12 }, brick));
  if (hit) {
    hit.hp -= 1;
    ball.vy *= -1;
    state.score += 20;
    if (hit.hp <= 0) {
      state.bricks = state.bricks.filter((brick) => brick !== hit);
      state.score += 30;
      context.playSound?.("score");
    }
    state.message = `剩余砖块 ${state.bricks.length}`;
  }

  if (ball.y > H + 10) {
    state.lives -= 1;
    if (state.lives <= 0) finish(state, false, context);
    else {
      state.message = "漏球，重新发球";
      resetBall(state, config);
    }
  }
  if (!state.bricks.length) finish(state, true, context);
}

function draw(state, ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#18251f";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,250,240,.08)";
  for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 1, H);
  for (const brick of state.bricks) {
    ctx.fillStyle = brick.hp > 1 ? "#be5c79" : "#d79d38";
    ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
  }
  ctx.fillStyle = "#1f8d67";
  ctx.fillRect(state.paddle.x - state.paddle.w / 2, state.paddle.y, state.paddle.w, 12);
  ctx.fillStyle = "#fffaf0";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

export function mountBreakout(root, context) {
  const config = CONFIG[context.difficulty] || CONFIG.medium;
  let state = initialState(config);
  const controls = { left: false, right: false, pointerX: NaN };
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note">${context.labels.difficulty} · ${state.bricks.length} 块砖 · ${config.paddle}px 挡板</p>
      </div>
      <div class="mini-stats">
        <span data-lives>生命 ${state.lives}</span>
        <span data-score>分数 0</span>
        <span data-left>砖块 ${state.bricks.length}</span>
      </div>
    </section>
    <section class="arcade-shell">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="打砖块"></canvas></div>
      <div class="arcade-control-row">
        <button data-control="left">左</button>
        <button data-action="restart">重开</button>
        <button data-control="right">右</button>
      </div>
    </section>
  `;
  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const lives = root.querySelector("[data-lives]");
  const score = root.querySelector("[data-score]");
  const left = root.querySelector("[data-left]");

  function restart() {
    state = initialState(config);
    controls.pointerX = NaN;
    last = performance.now();
  }

  function loop(now) {
    if (disposed) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(state, config, controls, dt, context);
    draw(state, ctx);
    status.textContent = state.message;
    lives.textContent = `生命 ${state.lives}`;
    score.textContent = `分数 ${state.score}`;
    left.textContent = `砖块 ${state.bricks.length}`;
    raf = requestAnimationFrame(loop);
  }

  const onKeyDown = (event) => setKey(event, true);
  const onKeyUp = (event) => setKey(event, false);
  function setKey(event, pressed) {
    if (event.code === "ArrowLeft" || event.code === "KeyA") controls.left = pressed;
    else if (event.code === "ArrowRight" || event.code === "KeyD") controls.right = pressed;
    else return;
    controls.pointerX = NaN;
    event.preventDefault();
  }
  function hold(button, key) {
    button.addEventListener("pointerdown", () => { controls[key] = true; controls.pointerX = NaN; });
    ["pointerup", "pointerleave", "pointercancel"].forEach((type) => button.addEventListener(type, () => { controls[key] = false; }));
  }
  root.querySelectorAll("[data-control]").forEach((button) => hold(button, button.dataset.control));
  root.querySelector("[data-action='restart']").addEventListener("click", restart);
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    controls.pointerX = ((event.clientX - rect.left) / rect.width) * W;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.buttons !== 1) return;
    const rect = canvas.getBoundingClientRect();
    controls.pointerX = ((event.clientX - rect.left) / rect.width) * W;
  });
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
