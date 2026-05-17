export const classicArcade = {
  bg: "#0b1020",
  bg2: "#151b2f",
  grid: "rgba(116, 241, 255, 0.1)",
  scanline: "rgba(255, 255, 255, 0.035)",
  cyan: "#42f2ff",
  green: "#5dff8b",
  yellow: "#ffd166",
  orange: "#ff9f1c",
  red: "#ff4d5e",
  magenta: "#d45cff",
  blue: "#4f8dff",
  white: "#f8fbff",
  steel: "#8b95a7",
  brick: "#b04b3d",
  brick2: "#e07352",
  shadow: "rgba(0, 0, 0, 0.42)"
};

export function drawArcadeBackdrop(ctx, width, height, time = 0, options = {}) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, options.top || classicArcade.bg);
  gradient.addColorStop(1, options.bottom || classicArcade.bg2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = options.grid || classicArcade.grid;
  ctx.lineWidth = 1;
  const grid = options.gridSize || 24;
  for (let x = 0; x <= width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = (time * 18) % grid; y <= height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = classicArcade.scanline;
  for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
}

export function drawPixelRect(ctx, x, y, w, h, fill, stroke = "rgba(255,255,255,.24)") {
  ctx.fillStyle = classicArcade.shadow;
  ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function drawTankSprite(ctx, tank, variant = "player") {
  const palette = variant === "player"
    ? { body: classicArcade.green, dark: "#24764f", light: "#c9ffd7", cannon: classicArcade.yellow }
    : { body: tank.hp > 1 ? classicArcade.red : classicArcade.magenta, dark: "#6e284d", light: "#ffd1e5", cannon: classicArcade.orange };
  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[tank.dir]);
  drawPixelRect(ctx, -13, -11, 26, 22, palette.dark, "rgba(255,255,255,.22)");
  drawPixelRect(ctx, -9, -13, 18, 26, palette.body, "rgba(255,255,255,.38)");
  ctx.fillStyle = palette.cannon;
  ctx.fillRect(-3, -24, 6, 17);
  ctx.fillStyle = palette.light;
  ctx.fillRect(-5, -5, 10, 10);
  ctx.fillStyle = classicArcade.bg;
  ctx.fillRect(-14, -8, 3, 16);
  ctx.fillRect(11, -8, 3, 16);
  ctx.restore();
}

export function drawTankWall(ctx, wall) {
  if (wall.type === "steel") {
    drawPixelRect(ctx, wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4, classicArcade.steel, "rgba(255,255,255,.3)");
    ctx.fillStyle = "#c9d1dc";
    ctx.fillRect(wall.x + 7, wall.y + 7, wall.w - 14, 3);
    ctx.fillRect(wall.x + 7, wall.y + 16, wall.w - 14, 3);
    return;
  }
  drawPixelRect(ctx, wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4, classicArcade.brick, "rgba(255,255,255,.2)");
  ctx.fillStyle = classicArcade.brick2;
  ctx.fillRect(wall.x + 5, wall.y + 7, wall.w - 10, 3);
  ctx.fillRect(wall.x + 5, wall.y + 17, wall.w - 10, 3);
}

export function drawBase(ctx, base, alive) {
  drawPixelRect(ctx, base.x, base.y, base.w, base.h, alive ? classicArcade.yellow : "#3b4252", "rgba(255,255,255,.28)");
  ctx.fillStyle = alive ? classicArcade.green : classicArcade.red;
  ctx.fillRect(base.x + 9, base.y + 5, 14, 14);
  ctx.fillStyle = classicArcade.bg;
  ctx.fillRect(base.x + 13, base.y + 8, 6, 8);
}

export function drawStarfield(ctx, width, height, time) {
  drawArcadeBackdrop(ctx, width, height, time, { top: "#090d1c", bottom: "#101f3e", grid: "rgba(79,141,255,.08)", gridSize: 32 });
  for (let i = 0; i < 46; i += 1) {
    const y = (i * 37 + time * (34 + (i % 4) * 12)) % height;
    const x = (i * 71 + (i % 5) * 17) % width;
    ctx.fillStyle = i % 5 === 0 ? classicArcade.cyan : "rgba(248,251,255,.55)";
    ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 5 : 2);
  }
}

export function drawPlayerShip(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = player.invuln > 0 ? classicArcade.yellow : classicArcade.cyan;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.lineTo(15, 15);
  ctx.lineTo(5, 10);
  ctx.lineTo(0, 18);
  ctx.lineTo(-5, 10);
  ctx.lineTo(-15, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = classicArcade.white;
  ctx.fillRect(-4, -6, 8, 11);
  ctx.fillStyle = classicArcade.orange;
  ctx.fillRect(-8, 15, 5, 8);
  ctx.fillRect(3, 15, 5, 8);
  ctx.restore();
}

export function drawEnemyShip(ctx, enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.fillStyle = enemy.hp > 1 ? classicArcade.red : classicArcade.magenta;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(-17, -10);
  ctx.lineTo(-6, -5);
  ctx.lineTo(0, -15);
  ctx.lineTo(6, -5);
  ctx.lineTo(17, -10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = classicArcade.yellow;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
}

export function drawSnakeArena(ctx, size, cell) {
  const width = size * cell;
  drawArcadeBackdrop(ctx, width, width, 0, { top: "#071a17", bottom: "#102b24", grid: "rgba(93,255,139,.11)", gridSize: cell });
}

export function drawSnakeSegment(ctx, cell, index, cellSize, dir = "right") {
  const x = cell.x * cellSize;
  const y = cell.y * cellSize;
  const fill = index === 0 ? classicArcade.yellow : (index % 2 ? classicArcade.green : "#39d579");
  drawPixelRect(ctx, x + 2, y + 2, cellSize - 4, cellSize - 4, fill, "rgba(255,255,255,.22)");
  if (index === 0) {
    ctx.fillStyle = classicArcade.bg;
    const eyeY = y + 6;
    if (dir === "left" || dir === "right") {
      ctx.fillRect(x + (dir === "right" ? 13 : 5), eyeY, 3, 3);
      ctx.fillRect(x + (dir === "right" ? 13 : 5), y + 12, 3, 3);
    } else {
      ctx.fillRect(x + 6, y + (dir === "down" ? 13 : 5), 3, 3);
      ctx.fillRect(x + 12, y + (dir === "down" ? 13 : 5), 3, 3);
    }
  }
}

export function drawFood(ctx, food, cellSize) {
  const cx = food.x * cellSize + cellSize / 2;
  const cy = food.y * cellSize + cellSize / 2;
  ctx.fillStyle = classicArcade.red;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = classicArcade.white;
  ctx.fillRect(cx - 2, cy - 4, 3, 3);
}

export function drawBreakoutBackdrop(ctx, width, height, time) {
  drawArcadeBackdrop(ctx, width, height, time, { top: "#0b0f23", bottom: "#20133a", grid: "rgba(212,92,255,.1)", gridSize: 28 });
}

export function drawBreakoutBrick(ctx, brick, rowIndex = 0) {
  const colors = [classicArcade.red, classicArcade.orange, classicArcade.yellow, classicArcade.green, classicArcade.cyan, classicArcade.blue, classicArcade.magenta];
  drawPixelRect(ctx, brick.x, brick.y, brick.w, brick.h, brick.hp > 1 ? colors[(rowIndex + 3) % colors.length] : colors[rowIndex % colors.length], "rgba(255,255,255,.25)");
  ctx.fillStyle = "rgba(255,255,255,.42)";
  ctx.fillRect(brick.x + 3, brick.y + 2, brick.w - 6, 2);
}

export function drawPaddle(ctx, paddle) {
  drawPixelRect(ctx, paddle.x - paddle.w / 2, paddle.y, paddle.w, 12, classicArcade.cyan, "rgba(255,255,255,.35)");
  ctx.fillStyle = classicArcade.white;
  ctx.fillRect(paddle.x - 12, paddle.y + 3, 24, 3);
}

export function drawBall(ctx, ball) {
  ctx.fillStyle = classicArcade.white;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = classicArcade.cyan;
  ctx.fillRect(ball.x - 2, ball.y - 2, 3, 3);
}

export function drawPowerup(ctx, item) {
  const colors = {
    rapid: classicArcade.cyan,
    shield: classicArcade.blue,
    repair: classicArcade.green,
    freeze: classicArcade.magenta,
    boat: classicArcade.cyan,
    weapon: classicArcade.cyan,
    laser: classicArcade.magenta,
    wingman: classicArcade.green,
    clear: classicArcade.yellow,
    slow: classicArcade.blue,
    expand: classicArcade.green,
    life: classicArcade.red,
    bonus: classicArcade.yellow
  };
  const labels = {
    rapid: "R",
    shield: "S",
    repair: "+",
    freeze: "F",
    boat: "船",
    weapon: "W",
    laser: "L",
    wingman: "僚",
    clear: "B",
    slow: "L",
    expand: "E",
    life: "+",
    bonus: "B"
  };
  const color = colors[item.type] || classicArcade.yellow;
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.fillStyle = classicArcade.shadow;
  ctx.fillRect(-11, -8, 22, 22);
  ctx.fillStyle = color;
  ctx.fillRect(-10, -10, 20, 20);
  ctx.strokeStyle = classicArcade.white;
  ctx.lineWidth = 2;
  ctx.strokeRect(-9, -9, 18, 18);
  ctx.fillStyle = classicArcade.bg;
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(labels[item.type] || "?", 0, 1);
  ctx.restore();
}
