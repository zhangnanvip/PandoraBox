import { rectFromCenter } from "./collision.js";

export function chooseRewardType(types, rng = Math.random) {
  if (!Array.isArray(types) || !types.length) return "";
  const weighted = types.map((item) => typeof item === "string" ? { type: item, weight: 1 } : item)
    .filter((item) => item?.type && item.weight !== 0);
  const total = weighted.reduce((sum, item) => sum + Math.max(0, item.weight ?? 1), 0);
  if (total <= 0) return weighted[0]?.type || "";
  let roll = rng() * total;
  for (const item of weighted) {
    roll -= Math.max(0, item.weight ?? 1);
    if (roll <= 0) return item.type;
  }
  return weighted[weighted.length - 1]?.type || "";
}

export function shouldDropReward(options = {}, rng = Math.random) {
  const count = Number(options.count) || 0;
  const forceAt = Array.isArray(options.forceAt) ? options.forceAt : [];
  if (forceAt.includes(count)) return true;
  if (options.forceEvery && count > 0 && count % options.forceEvery === 0) return true;
  return rng() < (options.rate ?? 0);
}

export function createPickup(type, position, options = {}) {
  if (!position) return null;
  return {
    type,
    x: position.x,
    y: position.y,
    ttl: options.ttl ?? 8,
    ...(Number.isFinite(options.vx) ? { vx: options.vx } : {}),
    ...(Number.isFinite(options.vy) ? { vy: options.vy } : {}),
    ...(options.meta || {})
  };
}

export function addPickup(collection, typeOrTypes, position, options = {}) {
  if (!Array.isArray(collection)) return null;
  if (options.maxCount && collection.length >= options.maxCount) return null;
  const type = Array.isArray(typeOrTypes) ? chooseRewardType(typeOrTypes, options.rng) : typeOrTypes;
  if (!type) return null;
  const pickup = createPickup(type, position, options);
  if (!pickup) return null;
  collection.push(pickup);
  return pickup;
}

export function updatePickups(pickups, dt, options = {}) {
  return pickups.filter((item) => {
    if (Number.isFinite(item.vx)) item.x += item.vx * dt;
    if (Number.isFinite(item.vy)) item.y += item.vy * dt;
    if (Number.isFinite(item.ttl)) item.ttl -= dt;
    options.onUpdate?.(item, dt);
    if (Number.isFinite(item.ttl) && item.ttl <= 0) return false;
    const margin = options.margin ?? 24;
    if (Number.isFinite(options.maxY) && item.y > options.maxY + margin) return false;
    if (Number.isFinite(options.minY) && item.y < options.minY - margin) return false;
    if (Number.isFinite(options.maxX) && item.x > options.maxX + margin) return false;
    if (Number.isFinite(options.minX) && item.x < options.minX - margin) return false;
    return true;
  });
}

export function collectPickups(pickups, isCollected, onCollect) {
  return pickups.filter((item) => {
    const collected = isCollected(item);
    if (collected) onCollect?.(item);
    return !collected;
  });
}

export function pickupRect(item, size = 20) {
  return rectFromCenter(item, size);
}
