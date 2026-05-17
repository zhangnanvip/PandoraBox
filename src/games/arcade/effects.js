const effectColors = {
  orange: "#ff9f1c",
  yellow: "#ffd166",
  white: "#f8fbff"
};

export function addBurst(effects, x, y, options = {}) {
  const count = options.count || 12;
  const color = options.color || effectColors.orange;
  const secondary = options.secondary || effectColors.yellow;
  const speed = options.speed || 78;
  const life = options.life || 0.42;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
    const velocity = speed * (0.45 + Math.random() * 0.7);
    effects.push({
      type: "spark",
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      age: 0,
      life: life * (0.72 + Math.random() * 0.46),
      size: options.size || (2 + Math.random() * 3),
      color: i % 3 === 0 ? secondary : color
    });
  }
  effects.push({
    type: "ring",
    x,
    y,
    age: 0,
    life: options.ringLife || 0.28,
    radius: options.radius || 8,
    color: options.ringColor || secondary
  });
}

export function addFloatingText(effects, x, y, text, options = {}) {
  effects.push({
    type: "text",
    x,
    y,
    text,
    vy: options.vy ?? -28,
    age: 0,
    life: options.life || 0.72,
    size: options.size || 14,
    color: options.color || effectColors.white,
    stroke: options.stroke || "rgba(0, 0, 0, 0.5)",
    weight: options.weight || 800
  });
}

export function updateEffects(effects, dt) {
  for (const effect of effects) {
    effect.age += dt;
    if (effect.type === "spark") {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.vx *= 0.92;
      effect.vy *= 0.92;
    } else if (effect.type === "text") {
      effect.y += effect.vy * dt;
    }
  }
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    if (effects[i].age >= effects[i].life) effects.splice(i, 1);
  }
}

export function drawEffects(ctx, effects) {
  for (const effect of effects) {
    const t = Math.min(1, effect.age / effect.life);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    if (effect.type === "ring") {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius + t * 18, 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.type === "text") {
      ctx.font = `${effect.weight} ${effect.size}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = effect.stroke;
      ctx.fillStyle = effect.color;
      ctx.strokeText(effect.text, effect.x, effect.y);
      ctx.fillText(effect.text, effect.x, effect.y);
    } else {
      ctx.fillStyle = effect.color;
      const size = Math.max(1, effect.size * (1 - t * 0.35));
      ctx.fillRect(effect.x - size / 2, effect.y - size / 2, size, size);
    }
    ctx.restore();
  }
}

export function shakeOffset(amount = 0) {
  if (amount <= 0) return { x: 0, y: 0 };
  return {
    x: (Math.random() - 0.5) * amount,
    y: (Math.random() - 0.5) * amount
  };
}
