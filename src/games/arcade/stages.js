import { clamp } from "./collision.js";

export function normalizeStageLevel(value, maxLevel, fallback = 1) {
  const numeric = Number(value);
  const level = Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  return clamp(level || fallback, 1, Math.max(1, maxLevel || fallback));
}

export function createStageState(maxLevel, level = 1) {
  return {
    level: normalizeStageLevel(level, maxLevel),
    maxLevel: Math.max(1, maxLevel)
  };
}

export function restoreStageLevel(value, maxLevel, fallback = 1) {
  return normalizeStageLevel(value, maxLevel, fallback);
}

export function advanceStage(state, step = 1) {
  state.level = normalizeStageLevel((state.level || 1) + step, state.maxLevel || state.level || 1);
  return state.level;
}

export function isFinalStage(state) {
  return (state.level || 1) >= (state.maxLevel || state.level || 1);
}

export function stageMeta(state) {
  return `${state.level}/${state.maxLevel}`;
}

export function stageLabel(state, prefix = "关卡") {
  return `${prefix} ${stageMeta(state)}`;
}

export function waveIndex(state, wavesPerStage) {
  return ((state.level || 1) - 1) * wavesPerStage + (state.wave || 1);
}

export function totalWaves(state, wavesPerStage) {
  return (state.maxLevel || state.level || 1) * wavesPerStage;
}

export function waveMeta(state, wavesPerStage) {
  return `${waveIndex(state, wavesPerStage)}/${totalWaves(state, wavesPerStage)}`;
}

export function waveLabel(state, wavesPerStage, prefix = "波次") {
  return `${prefix} ${waveMeta(state, wavesPerStage)}`;
}

export function isFinalWave(state, wavesPerStage) {
  return isFinalStage(state) && (state.wave || 1) >= wavesPerStage;
}

export function advanceWave(state, wavesPerStage) {
  if ((state.wave || 1) < wavesPerStage) {
    state.wave += 1;
    return "wave";
  }
  advanceStage(state);
  state.wave = 1;
  return "stage";
}
