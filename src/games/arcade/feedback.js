function ensureFeedback(state) {
  if (!state.feedback) state.feedback = {};
  return state.feedback;
}

export function triggerHitStop(state, duration = 0.08, scale = 0.35) {
  const feedback = ensureFeedback(state);
  feedback.hitStop = Math.max(feedback.hitStop || 0, duration);
  feedback.hitStopScale = scale;
}

export function feedbackTimeScale(state) {
  const feedback = state?.feedback;
  if (!feedback?.hitStop) return 1;
  return feedback.hitStopScale ?? 0.35;
}

export function triggerFlash(target, duration = 0.18) {
  if (!target) return;
  target.flash = Math.max(target.flash || 0, duration);
}

export function updateFlash(target, dt) {
  if (!target?.flash) return;
  target.flash = Math.max(0, target.flash - dt);
}

export function updateFeedback(state, dt, targets = []) {
  const feedback = state?.feedback;
  if (feedback?.hitStop) {
    feedback.hitStop = Math.max(0, feedback.hitStop - dt);
  }
  targets.flat().filter(Boolean).forEach((target) => updateFlash(target, dt));
}

export function isFlashing(target, time = 0, frequency = 18) {
  return Boolean(target?.flash) && Math.floor(time * frequency) % 2 === 0;
}

export function drawFlashHalo(ctx, rect, options = {}) {
  if (!rect) return;
  const alpha = options.alpha ?? 0.72;
  const pad = options.pad ?? 5;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = options.color || "#ffd166";
  ctx.lineWidth = options.lineWidth || 2;
  ctx.shadowColor = options.shadow || "rgba(255, 209, 102, .45)";
  ctx.shadowBlur = options.blur ?? 10;
  ctx.strokeRect(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2);
  ctx.restore();
}

export function drawCirclePulse(ctx, point, radius, time = 0, options = {}) {
  if (!point) return;
  const phase = (Math.sin(time * (options.speed || 8)) + 1) / 2;
  ctx.save();
  ctx.globalAlpha = options.alpha ?? (0.24 + phase * 0.18);
  ctx.strokeStyle = options.color || "#ffd166";
  ctx.lineWidth = options.lineWidth || 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius + phase * (options.growth || 5), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
