import { addBurst, addFloatingText } from "./effects.js";

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
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
  ctx.closePath();
}

function setFitFont(ctx, text, maxWidth, baseSize, weight = "700") {
  let size = baseSize;
  do {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  } while (size >= 10);
  return size;
}

export function startStageTransition(state, options = {}) {
  const duration = Math.max(0.4, finiteNumber(options.duration, 1.15));
  state.transition = {
    title: options.title || "",
    subtitle: options.subtitle || "",
    timer: duration,
    duration
  };
  return state.transition;
}

export function updateStageTransition(state, dt) {
  if (!state.transition) return false;
  state.transition.timer -= dt;
  if (state.transition.timer <= 0) {
    state.transition = null;
    return false;
  }
  return true;
}

export function drawStageTransition(ctx, width, height, transition, palette = {}) {
  if (!transition) return;
  const duration = Math.max(0.4, finiteNumber(transition.duration, 1));
  const timer = Math.max(0, finiteNumber(transition.timer, 0));
  const elapsed = duration - timer;
  const alpha = Math.min(1, timer / 0.24, elapsed / 0.18);
  if (alpha <= 0) return;

  const boxW = Math.min(width - 32, 264);
  const boxH = transition.subtitle ? 74 : 58;
  const x = (width - boxW) / 2;
  const y = Math.max(18, height * 0.42 - boxH / 2);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(0,0,0,.38)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(ctx, x, y, boxW, boxH, 10);
  ctx.fillStyle = palette.fill || "rgba(8, 15, 28, .84)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.stroke || "rgba(116, 241, 255, .54)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = transition.title || "";
  const subtitle = transition.subtitle || "";
  ctx.fillStyle = palette.title || "#f8fbff";
  setFitFont(ctx, title, boxW - 28, 20, "800");
  ctx.fillText(title, width / 2, y + (subtitle ? 28 : boxH / 2));

  if (subtitle) {
    ctx.fillStyle = palette.subtitle || "#ffd166";
    setFitFont(ctx, subtitle, boxW - 28, 13, "700");
    ctx.fillText(subtitle, width / 2, y + 53);
  }
  ctx.restore();
}

export function grantProgressRewards(state, rewards = {}, options = {}) {
  const applied = {};
  Object.entries(rewards).forEach(([key, value]) => {
    const amount = Number(value) || 0;
    if (!amount) return;
    state[key] = (Number(state[key]) || 0) + amount;
    applied[key] = amount;
  });

  const label = options.label || rewardSummary(applied, options.labels);
  if (label && options.effects && options.position) {
    addFloatingText(options.effects, options.position.x, options.position.y, label, {
      color: options.color,
      size: options.size
    });
  }
  return applied;
}

export function rewardSummary(rewards = {}, labels = {}) {
  return Object.entries(rewards)
    .filter(([, value]) => value)
    .map(([key, value]) => `${labels[key] || key} ${value > 0 ? `+${value}` : value}`)
    .join(" / ");
}

export function announceProgress(state, context, options = {}) {
  if (options.message) state.message = options.message;
  if (options.transition) startStageTransition(state, options.transition);
  if (options.effects && options.position && options.burst) {
    addBurst(options.effects, options.position.x, options.position.y, options.burst);
  }
  if (options.effects && options.position && options.floatText) {
    addFloatingText(options.effects, options.position.x, options.position.y, options.floatText, {
      color: options.floatColor,
      size: options.floatSize
    });
  }
  if (Number.isFinite(options.shake)) state.shake = Math.max(state.shake || 0, options.shake);
  if (options.sound) context?.playSound?.(options.sound);
  return state.message;
}

export function announceStageStart(state, context, options = {}) {
  return announceProgress(state, context, {
    sound: "start",
    ...options
  });
}

export function announceStageClear(state, context, options = {}) {
  return announceProgress(state, context, options);
}
