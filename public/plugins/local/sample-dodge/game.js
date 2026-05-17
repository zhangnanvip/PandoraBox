export function mount(root, context = {}) {
  let score = 0;
  let running = true;
  let raf = 0;
  const state = {
    playerX: 150,
    enemyX: 40,
    enemyY: 0,
    speed: context.difficulty === "hard" ? 150 : context.difficulty === "medium" ? 120 : 96
  };

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>外部插件示例</strong>
        <p class="game-note">这是插件包模板，默认不启用。</p>
      </div>
      <div class="mini-stats">
        <span data-score>分数 0</span>
      </div>
    </section>
    <section class="arcade-shell" data-visual-style="classic-arcade">
      <div class="arcade-stage">
        <canvas class="arcade-canvas tall" width="300" height="400" aria-label="示例躲避"></canvas>
      </div>
      <div class="arcade-controls">
        <p class="empty-note">拖动或使用方向键移动。</p>
      </div>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const scoreNode = root.querySelector("[data-score]");

  function draw() {
    ctx.fillStyle = "#101629";
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = "#42f2ff";
    ctx.fillRect(state.playerX - 16, 340, 32, 22);
    ctx.fillStyle = "#ff4d5e";
    ctx.fillRect(state.enemyX - 12, state.enemyY - 12, 24, 24);
    ctx.fillStyle = "rgba(248,251,255,.22)";
    for (let y = 0; y < 400; y += 28) ctx.fillRect(0, y, 300, 1);
  }

  function loop(now) {
    if (!running) return;
    if (!context.isPaused?.()) {
      const dt = Math.min(0.033, (now - (loop.last || now)) / 1000);
      state.enemyY += state.speed * dt;
      if (state.enemyY > 420) {
        state.enemyY = -20;
        state.enemyX = 24 + Math.random() * 252;
        score += 10;
        scoreNode.textContent = `分数 ${score}`;
      }
      draw();
    }
    loop.last = now;
    raf = requestAnimationFrame(loop);
  }

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    state.playerX = Math.max(16, Math.min(284, ((event.clientX - rect.left) / rect.width) * 300));
  };
  const onKeyDown = (event) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") state.playerX = Math.max(16, state.playerX - 18);
    if (event.code === "ArrowRight" || event.code === "KeyD") state.playerX = Math.min(284, state.playerX + 18);
  };

  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("keydown", onKeyDown);
  raf = requestAnimationFrame(loop);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("keydown", onKeyDown);
  };
}
