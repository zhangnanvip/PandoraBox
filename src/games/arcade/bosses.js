import { clamp } from "./collision.js";

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
  if (options.message) state.message = options.message;
  options.onSpawn?.(boss);
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
