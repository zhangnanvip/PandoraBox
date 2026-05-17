import { clamp } from "./collision.js";
import { triggerFlash, triggerHitStop } from "./feedback.js";
import { announceProgress } from "./progression.js";

export function createBoss(config = {}) {
  const hp = Math.max(1, Math.round(config.hp ?? config.maxHp ?? 1));
  return {
    ...config,
    hp,
    maxHp: Math.max(1, Math.round(config.maxHp ?? hp))
  };
}

export function createBossEnemy(config = {}) {
  return createBoss({
    ...config,
    boss: true,
    kind: config.kind || "boss"
  });
}

export function spawnBossOnce(state, factory, options = {}) {
  if (state.bossSpawned) return null;
  const boss = factory();
  state.bossSpawned = true;
  state.boss = boss;
  if (options.intro) {
    announceBossIntro(state, options.context, boss, {
      message: options.message,
      ...options.intro
    });
  } else if (options.message) {
    state.message = options.message;
  }
  options.onSpawn?.(boss);
  return boss;
}

export function announceBossIntro(state, context, boss, options = {}) {
  const title = options.title || "Boss 出现";
  const subtitle = options.subtitle || options.name || "";
  const message = options.message || (subtitle ? `${title}：${subtitle}` : title);
  const position = options.position || (boss ? { x: boss.x, y: boss.y } : null);
  triggerFlash(boss, options.flash ?? 0.48);
  triggerHitStop(state, options.hitStop ?? 0.09, options.hitStopScale ?? 0.38);
  announceProgress(state, context, {
    message,
    transition: {
      title,
      subtitle,
      duration: options.duration ?? 1.18
    },
    effects: options.effects || state.effects,
    position,
    burst: options.burst || {
      count: 34,
      color: options.color,
      secondary: options.secondary,
      speed: 90,
      radius: 24
    },
    shake: options.shake ?? 5,
    sound: options.sound ?? "start"
  });
  return boss;
}

export function bossHealthRatio(boss) {
  if (!boss) return 0;
  return clamp((boss.hp ?? 0) / Math.max(1, boss.maxHp ?? boss.hp ?? 1), 0, 1);
}

export function bossHealthLabel(boss, prefix = "Boss") {
  return `${prefix} ${Math.max(0, Math.ceil(boss?.hp ?? 0))}`;
}

export function isBossDefeated(boss) {
  return Boolean(boss) && (boss.hp ?? 0) <= 0;
}
