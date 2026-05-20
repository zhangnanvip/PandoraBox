import { addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { drawCirclePulse, feedbackTimeScale, triggerFlash, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { classicArcade, drawArcadeBackdrop } from "../arcade/classic-visuals.js";
import { clamp, distance, withinDistance } from "../arcade/collision.js";
import { bindActionKeys } from "../arcade/controls.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { announceBossIntro, createBossEnemy } from "../arcade/bosses.js";
import { announceStageClear, drawStageTransition, grantProgressRewards, rewardSummary, updateStageTransition } from "../arcade/progression.js";
import { advanceWave, createStageState, isFinalWave, restoreStageLevel, stageLabel, stageMeta, totalWaves, waveIndex, waveLabel, waveMeta } from "../arcade/stages.js";

const W = 360;
const H = 360;
const CELL = 30;
const GRID = 12;
const MAX_LEVEL = 30;
const WAVES_PER_LEVEL = 4;
const MAP_VERSION = 3;
const TOWER_MAX_LEVEL = 5;
const ACTION_CONFIRM_TIMEOUT = 10;

const DIFFICULTY = {
  easy: { lives: 22, gold: 230, hp: 0.85, speed: 0.86, count: -1 },
  medium: { lives: 18, gold: 200, hp: 1, speed: 1, count: 0 },
  hard: { lives: 14, gold: 175, hp: 1.28, speed: 1.12, count: 2 },
  devil: { lives: 10, gold: 155, hp: 1.55, speed: 1.25, count: 4 }
};

const TOWER_TYPES = {
  arrow: { label: "弩塔", role: "高速单体", cost: 60, damage: 17, range: 74, cooldown: 0.52, speed: 255, color: classicArcade.cyan },
  cannon: { label: "炮塔", role: "范围爆破", cost: 92, damage: 31, range: 65, cooldown: 1.05, speed: 210, splash: 30, color: classicArcade.orange },
  frost: { label: "冰塔", role: "减速控场", cost: 76, damage: 9, range: 68, cooldown: 0.86, speed: 225, slow: 0.48, slowTime: 1.45, color: classicArcade.blue },
  spark: { label: "电塔", role: "连锁电击", cost: 108, damage: 14, range: 86, cooldown: 0.74, speed: 290, chain: 2, color: classicArcade.yellow },
  venom: { label: "毒雾塔", role: "持续腐蚀", cost: 88, damage: 10, range: 72, cooldown: 0.9, speed: 215, splash: 24, poison: 8, poisonTime: 2.8, color: classicArcade.green },
  mortar: { label: "迫击塔", role: "远程重炮", cost: 132, damage: 44, range: 116, cooldown: 1.48, speed: 170, splash: 42, color: classicArcade.red }
};

const TOWER_ORDER = ["arrow", "cannon", "frost", "spark", "venom", "mortar"];

const TARGET_MODES = {
  first: { label: "前线", detail: "优先攻击最靠近核心的敌人" },
  strong: { label: "强敌", detail: "优先攻击当前生命最高的敌人" },
  weak: { label: "补刀", detail: "优先攻击当前生命最低的敌人" },
  nearest: { label: "近身", detail: "优先攻击距离防御塔最近的敌人" }
};

const TARGET_ORDER = ["first", "strong", "weak", "nearest"];

const WAVE_AFFIXES = {
  rush: { label: "急行", detail: "速度提升，出怪更密" },
  armor: { label: "铁甲", detail: "生命和护甲提升" },
  swarm: { label: "群潮", detail: "数量增加，小怪更多" },
  regen: { label: "腐生", detail: "敌人缓慢回血" },
  elite: { label: "精英", detail: "周期性出现强化敌人" }
};

const TACTICS = {
  storm: { label: "雷暴", role: "轰击敌群", cooldown: 22, radius: 58, damage: 72, color: classicArcade.yellow },
  barricade: { label: "路障", role: "封锁控场", cooldown: 18, radius: 38, duration: 5.2, slow: 0.34, color: classicArcade.green }
};

const TACTIC_ORDER = ["storm", "barricade"];

const HERO = {
  label: "守卫",
  role: "机动支援",
  maxLevel: 5,
  rallyCooldown: 8,
  color: classicArcade.cyan
};

const ENEMY_TRAITS = {
  grunt: { label: "杂兵", unlock: 1, hp: 1, speed: 1, reward: 0, penalty: 1 },
  runner: { label: "快怪", unlock: 2, hp: 0.72, speed: 1.42, reward: 1, penalty: 1 },
  armored: { label: "重甲", unlock: 3, hp: 1.72, speed: 0.76, reward: 4, penalty: 1 },
  regen: { label: "再生", unlock: 5, hp: 1.22, speed: 0.92, reward: 4, penalty: 1, regen: 4 },
  swarm: { label: "蜂群", unlock: 6, hp: 0.52, speed: 1.76, reward: -1, penalty: 1 },
  healer: { label: "祭司", unlock: 8, hp: 1.05, speed: 0.84, reward: 5, penalty: 1, healAura: 5 },
  splitter: { label: "分裂", unlock: 9, hp: 1.18, speed: 0.96, reward: 3, penalty: 1, split: 2 },
  phantom: { label: "相位", unlock: 12, hp: 0.86, speed: 1.28, reward: 6, penalty: 1, dodge: 0.28 },
  shield: { label: "护盾", unlock: 14, hp: 2.35, speed: 0.66, reward: 7, penalty: 2 },
  juggernaut: { label: "攻城", unlock: 18, hp: 3.15, speed: 0.52, reward: 10, penalty: 3, armor: 0.28 },
  sapper: { label: "爆破", unlock: 22, hp: 1.38, speed: 1.04, reward: 8, penalty: 2, burst: 1 },
  warlock: { label: "术士", unlock: 28, hp: 1.62, speed: 0.82, reward: 11, penalty: 2, healAura: 3, armor: 0.16 },
  boss: { label: "守门兽", unlock: 4, hp: 1, speed: 1, reward: 0, penalty: 5 }
};

const MAPS = [
  {
    name: "回廊试炼",
    feature: "基础折返",
    cells: [
      [0, 5], [1, 5], [2, 5], [3, 5],
      [3, 4], [3, 3], [3, 2], [4, 2], [5, 2], [6, 2],
      [6, 3], [6, 4], [6, 5], [6, 6], [6, 7], [6, 8],
      [7, 8], [8, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4],
      [10, 4], [11, 4]
    ]
  },
  {
    name: "双折回廊",
    feature: "长线压迫",
    cells: [
      [0, 2], [1, 2], [2, 2], [2, 3], [2, 4], [2, 5],
      [3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [6, 3],
      [7, 3], [8, 3], [8, 4], [8, 5], [8, 6], [7, 6],
      [6, 6], [5, 6], [5, 7], [5, 8], [6, 8], [7, 8],
      [8, 8], [9, 8], [10, 8], [11, 8]
    ]
  },
  {
    name: "蛇形矿道",
    feature: "前后夹击",
    cells: [
      [0, 8], [1, 8], [2, 8], [3, 8], [3, 7], [3, 6],
      [3, 5], [2, 5], [1, 5], [1, 4], [1, 3], [2, 3],
      [3, 3], [4, 3], [5, 3], [5, 4], [5, 5], [5, 6],
      [6, 6], [7, 6], [7, 5], [7, 4], [8, 4], [9, 4],
      [9, 3], [9, 2], [10, 2], [11, 2]
    ]
  },
  {
    name: "核心环线",
    feature: "近核转弯",
    cells: [
      [0, 6], [1, 6], [2, 6], [2, 7], [2, 8], [3, 8],
      [4, 8], [4, 7], [4, 6], [4, 5], [4, 4], [5, 4],
      [6, 4], [7, 4], [7, 5], [7, 6], [8, 6], [9, 6],
      [9, 7], [9, 8], [10, 8], [10, 7], [10, 6], [10, 5],
      [10, 4], [11, 4]
    ]
  },
  {
    name: "沼泽弯道",
    feature: "长廊回折",
    cells: [
      [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3],
      [4, 4], [3, 4], [2, 4], [1, 4], [1, 5], [1, 6], [2, 6],
      [3, 6], [4, 6], [5, 6], [6, 6], [6, 7], [6, 8], [7, 8],
      [8, 8], [9, 8], [10, 8], [10, 7], [10, 6], [11, 6]
    ]
  },
  {
    name: "环形核心",
    feature: "内圈绕行",
    cells: [
      [0, 10], [1, 10], [2, 10], [3, 10], [3, 9], [3, 8], [3, 7],
      [4, 7], [5, 7], [6, 7], [7, 7], [7, 6], [7, 5], [6, 5],
      [5, 5], [4, 5], [4, 4], [4, 3], [5, 3], [6, 3], [7, 3],
      [8, 3], [8, 4], [8, 5], [9, 5], [10, 5], [11, 5]
    ]
  },
  {
    name: "双桥矿线",
    feature: "中段回压",
    cells: [
      [0, 4], [1, 4], [2, 4], [3, 4], [3, 5], [3, 6], [4, 6],
      [5, 6], [5, 5], [5, 4], [6, 4], [7, 4], [7, 3], [7, 2],
      [8, 2], [9, 2], [9, 3], [9, 4], [9, 5], [8, 5], [7, 5],
      [7, 6], [8, 6], [9, 6], [10, 6], [11, 6]
    ]
  },
  {
    name: "深渊螺旋",
    feature: "密集折返",
    cells: [
      [0, 6], [1, 6], [2, 6], [2, 5], [2, 4], [3, 4], [4, 4],
      [4, 5], [4, 6], [4, 7], [5, 7], [6, 7], [6, 6], [6, 5],
      [6, 4], [7, 4], [8, 4], [8, 5], [8, 6], [8, 7], [9, 7],
      [10, 7], [10, 6], [10, 5], [11, 5]
    ]
  }
].map((map) => ({
  ...map,
  pathSet: new Set(map.cells.map(([x, y]) => `${x}:${y}`)),
  waypoints: [
    { x: -CELL / 2, y: map.cells[0][1] * CELL + CELL / 2 },
    ...map.cells.map(([x, y]) => ({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 })),
    { x: W + CELL / 2, y: map.cells[map.cells.length - 1][1] * CELL + CELL / 2 }
  ]
}));

function towerIconSvg(type) {
  if (type === "cannon") {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 39h30v10H16z"/><path d="M30 22h24v12H30z"/><circle cx="24" cy="44" r="10"/><circle cx="24" cy="44" r="4" class="cut"/><path d="M45 18l8 5v10l-8-3z"/></svg>`;
  }
  if (type === "frost") {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8l16 12v24L32 56 16 44V20z"/><path d="M32 16v32M18 24l28 16M46 24L18 40" class="line"/><circle cx="32" cy="32" r="7" class="cut"/></svg>`;
  }
  if (type === "spark") {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M35 6L14 36h16l-3 22 23-33H34z"/><path d="M20 51h24M17 57h30" class="line"/></svg>`;
  }
  if (type === "venom") {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8c9 12 16 21 16 31 0 10-7 17-16 17s-16-7-16-17c0-10 7-19 16-31z"/><path d="M24 38c4 4 12 4 16 0M23 28h.1M41 28h.1" class="line"/></svg>`;
  }
  if (type === "mortar") {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 46h30l5 10H12z"/><path d="M25 37l22-20 8 9-23 20z"/><path d="M13 24l7-7M16 15l7-7M45 9l7-5" class="line"/></svg>`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8v42"/><path d="M14 28c10-14 26-14 36 0"/><path d="M14 28c10 11 26 11 36 0"/><path d="M26 36h12v14H26z"/><path d="M20 54h24" class="line"/></svg>`;
}

function towerButtonMarkup(type) {
  const tower = TOWER_TYPES[type];
  return `
    <button type="button" class="tower-card" data-tower="${type}" style="--tower-color: ${tower.color}">
      <span class="tower-card-icon">${towerIconSvg(type)}</span>
      <span class="tower-card-copy">
        <strong>${tower.label}</strong>
        <small>${tower.role}</small>
      </span>
      <span class="tower-card-cost">${tower.cost}</span>
    </button>
  `;
}

function actionIconSvg(type) {
  if (type === "upgrade") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5l8 9h-5v12h-6V14H8z"/></svg>`;
  }
  if (type === "sell") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 10h18l-2 16H9z"/><path d="M11 10V7h10v3M12 15h8M12 20h8"/></svg>`;
  }
  if (type === "target") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="3" class="cut"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6" class="line"/></svg>`;
  }
  if (type === "storm") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18 3L7 18h8l-2 11 12-17h-8z"/><path d="M6 25c5 3 15 3 20 0" class="line"/></svg>`;
  }
  if (type === "barricade") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 11h20v6H6zM8 20h16v6H8z"/><path d="M10 8v21M22 8v21" class="line"/></svg>`;
  }
  if (type === "hero") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4l10 4v7c0 7-4 11-10 14C10 26 6 22 6 15V8z"/><path d="M16 9v13M10 15h12" class="line"/></svg>`;
  }
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 17h15l-5 6 10-9H11l5-6z"/></svg>`;
}

function mapForLevel(level) {
  return MAPS[((Math.max(1, level) - 1) % MAPS.length)];
}

function waypointsForLevel(level) {
  return mapForLevel(level).waypoints;
}

function startPointForLevel(level) {
  return waypointsForLevel(level)[0];
}

function endpointForLevel(level) {
  const waypoints = waypointsForLevel(level);
  return waypoints[waypoints.length - 1];
}

function heroHomeForLevel(level) {
  const waypoints = waypointsForLevel(level);
  const point = waypoints[Math.min(4, waypoints.length - 2)] || { x: W / 2, y: H / 2 };
  return {
    x: clamp(point.x, 24, W - 24),
    y: clamp(point.y - 34, 24, H - 24)
  };
}

function createHero(level = 1) {
  const home = heroHomeForLevel(level);
  return {
    x: home.x,
    y: home.y,
    targetX: home.x,
    targetY: home.y,
    level: 1,
    xp: 0,
    attackTimer: 0,
    rallyCooldown: 0
  };
}

function normalizeHero(hero, level = 1) {
  const base = createHero(level);
  if (!hero || typeof hero !== "object") return base;
  return {
    ...base,
    ...hero,
    level: clamp(Math.round(Number(hero.level) || 1), 1, HERO.maxLevel),
    xp: Math.max(0, Number(hero.xp) || 0),
    attackTimer: Math.max(0, Number(hero.attackTimer) || 0),
    rallyCooldown: Math.max(0, Number(hero.rallyCooldown) || 0),
    x: clamp(Number(hero.x) || base.x, 12, W - 12),
    y: clamp(Number(hero.y) || base.y, 12, H - 12),
    targetX: clamp(Number(hero.targetX) || base.targetX, 12, W - 12),
    targetY: clamp(Number(hero.targetY) || base.targetY, 12, H - 12)
  };
}

function resetHeroForLevel(state) {
  const home = heroHomeForLevel(state.level);
  state.hero = {
    ...normalizeHero(state.hero, state.level),
    x: home.x,
    y: home.y,
    targetX: home.x,
    targetY: home.y,
    attackTimer: 0
  };
}

function heroStats(hero) {
  const level = clamp(hero?.level || 1, 1, HERO.maxLevel);
  return {
    range: 52 + level * 7,
    aura: 46 + level * 5,
    damage: 13 + level * 7,
    cooldown: Math.max(0.34, 0.78 - level * 0.07),
    speed: 118 + level * 10
  };
}

function towerStats(tower) {
  const base = TOWER_TYPES[tower.type] || TOWER_TYPES.arrow;
  const boost = tower.level - 1;
  return {
    ...base,
    damage: Math.round(base.damage * (1 + boost * 0.42)),
    range: base.range + boost * 8,
    cooldown: Math.max(0.18, base.cooldown * (1 - boost * 0.1)),
    splash: base.splash ? base.splash + boost * 5 : 0,
    slowTime: base.slowTime ? base.slowTime + boost * 0.22 : 0,
    poison: base.poison ? base.poison + boost * 3 : 0,
    poisonTime: base.poisonTime ? base.poisonTime + boost * 0.32 : 0,
    chain: base.chain ? base.chain + Math.floor(boost / 2) : 0
  };
}

function upgradeCost(tower) {
  const base = TOWER_TYPES[tower.type] || TOWER_TYPES.arrow;
  return Math.round(base.cost * (0.72 + tower.level * 0.38));
}

function towerInvestment(tower) {
  const base = TOWER_TYPES[tower.type] || TOWER_TYPES.arrow;
  let value = base.cost;
  for (let level = 1; level < tower.level; level += 1) {
    value += Math.round(base.cost * (0.72 + level * 0.38));
  }
  return value;
}

function waveNumber(state) {
  return waveIndex(state, WAVES_PER_LEVEL);
}

function waveAffixes(totalWave, wave) {
  const affixes = [];
  if (wave === WAVES_PER_LEVEL) affixes.push("elite");
  if (totalWave >= 10 && totalWave % 5 === 0) affixes.push("rush");
  if (totalWave >= 15 && totalWave % 6 === 0) affixes.push("armor");
  if (totalWave >= 20 && totalWave % 7 === 0) affixes.push("swarm");
  if (totalWave >= 26 && totalWave % 8 === 0) affixes.push("regen");
  return [...new Set(affixes)].slice(0, 2);
}

function affixText(affixes) {
  if (!affixes?.length) return "";
  return affixes.map((id) => WAVE_AFFIXES[id]?.label).filter(Boolean).join("/");
}

function waveConfig(config, level, wave) {
  const totalWave = waveIndex({ level, wave }, WAVES_PER_LEVEL);
  const chapter = Math.floor((level - 1) / 5);
  const affixes = waveAffixes(totalWave, wave);
  const rush = affixes.includes("rush");
  const armor = affixes.includes("armor");
  const swarm = affixes.includes("swarm");
  const regen = affixes.includes("regen");
  const elite = affixes.includes("elite");
  return {
    count: Math.max(6, Math.round((7 + level * 2 + wave * 2 + Math.floor(totalWave / 6) + chapter + config.count) * (swarm ? 1.18 : 1))),
    hp: Math.round((36 + level * 15 + wave * 12 + Math.floor(totalWave / 4) * 4 + chapter * 22) * config.hp * (armor ? 1.18 : 1) * (swarm ? 0.9 : 1)),
    speed: (24 + level * 1.55 + wave * 1.1 + Math.floor(totalWave / 10)) * config.speed * (rush ? 1.16 : 1),
    reward: 8 + level + Math.floor(totalWave / 12) + affixes.length * 2,
    interval: Math.max(0.25, (0.74 - level * 0.014 - wave * 0.014) * (rush ? 0.88 : 1) * (swarm ? 0.92 : 1)),
    totalWave,
    affixes,
    bonusArmor: armor ? 0.12 : 0,
    bonusRegen: regen ? 2.4 : 0,
    eliteEvery: elite ? 7 : 0
  };
}

function isBossWave(level, wave) {
  return wave >= WAVES_PER_LEVEL;
}

function unlockedEnemyLabels(totalWave) {
  return Object.entries(ENEMY_TRAITS)
    .filter(([kind, trait]) => kind !== "boss" && trait.unlock === totalWave)
    .map(([, trait]) => trait.label)
    .join("/");
}

function wavePreview(config, level, wave) {
  const next = waveConfig(config, level, wave);
  const boss = isBossWave(level, wave) ? " · 守门兽" : "";
  const unlock = unlockedEnemyLabels(next.totalWave);
  const affixes = affixText(next.affixes);
  return `${next.count}${boss} 敌 · HP ${next.hp}${affixes ? ` · ${affixes}` : ""}${unlock ? ` · 新${unlock}` : ""}`;
}

function enemyKindAt(index, totalWave) {
  if (totalWave >= ENEMY_TRAITS.warlock.unlock && index % 17 === 12) return "warlock";
  if (totalWave >= ENEMY_TRAITS.sapper.unlock && index % 13 === 4) return "sapper";
  if (totalWave >= ENEMY_TRAITS.juggernaut.unlock && index % 16 === 8) return "juggernaut";
  if (totalWave >= ENEMY_TRAITS.shield.unlock && index % 13 === 9) return "shield";
  if (totalWave >= ENEMY_TRAITS.phantom.unlock && index % 10 === 5) return "phantom";
  if (totalWave >= ENEMY_TRAITS.splitter.unlock && index % 11 === 6) return "splitter";
  if (totalWave >= ENEMY_TRAITS.healer.unlock && index % 12 === 7) return "healer";
  if (totalWave >= ENEMY_TRAITS.swarm.unlock && index % 6 === 2) return "swarm";
  if (totalWave >= ENEMY_TRAITS.regen.unlock && index % 9 === 4) return "regen";
  if (totalWave >= ENEMY_TRAITS.armored.unlock && index % 7 === 5) return "armored";
  if (totalWave >= ENEMY_TRAITS.runner.unlock && index % 5 === 3) return "runner";
  return "grunt";
}

function createEnemyTemplate(kind, id, waveCfg, index = 0) {
  const trait = ENEMY_TRAITS[kind] || ENEMY_TRAITS.grunt;
  const elite = Boolean(waveCfg.eliteEvery && index > 0 && index % waveCfg.eliteEvery === 0);
  return {
    id,
    kind,
    hp: Math.max(1, Math.round(waveCfg.hp * trait.hp * (elite ? 1.55 : 1))),
    speed: waveCfg.speed * trait.speed * (elite ? 1.05 : 1),
    reward: Math.max(2, waveCfg.reward + trait.reward + (elite ? 6 : 0)),
    penalty: trait.penalty || 1,
    elite,
    regen: (trait.regen || 0) + (waveCfg.bonusRegen || 0),
    healAura: trait.healAura || 0,
    dodge: trait.dodge || 0,
    armor: (trait.armor || 0) + (waveCfg.bonusArmor || 0),
    burst: trait.burst || 0
  };
}

function createWave(config, level, wave, nextId) {
  const waveCfg = waveConfig(config, level, wave);
  const queue = [];
  for (let i = 0; i < waveCfg.count; i += 1) {
    queue.push(createEnemyTemplate(enemyKindAt(i, waveCfg.totalWave), nextId + i, waveCfg, i));
  }
  if (isBossWave(level, wave)) {
    const finalBoss = isFinalWave({ level, wave, maxLevel: MAX_LEVEL }, WAVES_PER_LEVEL);
    queue.push(createBossEnemy({
      id: nextId + queue.length,
      kind: "boss",
      name: finalBoss ? "终局魔盒攻城兽" : `${mapForLevel(level).name}守门兽`,
      hp: Math.round((220 + level * 72 + waveCfg.hp * 2.1) * config.hp * (finalBoss ? 1.8 : 1)),
      speed: (16 + level * 0.8) * config.speed,
      reward: finalBoss ? 220 : 80 + level * 8,
      penalty: finalBoss ? 8 : 4
    }));
  }
  return queue;
}

function initialState(config) {
  return {
    ...createStageState(MAX_LEVEL),
    mapVersion: MAP_VERSION,
    wave: 1,
    lives: config.lives,
    gold: config.gold,
    score: 0,
    towers: [],
    enemies: [],
    shots: [],
    fields: [],
    hero: createHero(1),
    queue: [],
    effects: [],
    tacticCooldowns: Object.fromEntries(TACTIC_ORDER.map((id) => [id, 0])),
    nextId: 1,
    selectedType: "arrow",
    selectedTower: null,
    pendingAction: null,
    waveActive: false,
    spawning: false,
    spawnTimer: 0,
    shake: 0,
    time: 0,
    message: "选择空地建塔，点击出怪开始防守",
    over: false,
    resultReported: false
  };
}

function restoreState(config, saved) {
  const state = initialState(config);
  if (!saved || typeof saved !== "object") return state;
  const level = restoreStageLevel(saved.level, MAX_LEVEL);
  const wave = clamp(Number(saved.wave) || 1, 1, WAVES_PER_LEVEL);
  const mapCompatible = saved.mapVersion === MAP_VERSION;
  const savedTowers = Array.isArray(saved.towers) && mapCompatible
    ? saved.towers.filter((tower) => !isPathCell({ x: tower.cellX, y: tower.cellY }, level))
    : [];
  return {
    ...state,
    ...saved,
    mapVersion: MAP_VERSION,
    level,
    wave,
    maxLevel: MAX_LEVEL,
    effects: [],
    towers: savedTowers,
    enemies: Array.isArray(saved.enemies) && mapCompatible ? saved.enemies : [],
    shots: Array.isArray(saved.shots) && mapCompatible ? saved.shots : [],
    fields: Array.isArray(saved.fields) && mapCompatible ? saved.fields : [],
    hero: mapCompatible ? normalizeHero(saved.hero, level) : createHero(level),
    queue: Array.isArray(saved.queue) && mapCompatible ? saved.queue : [],
    tacticCooldowns: { ...state.tacticCooldowns, ...(saved.tacticCooldowns || {}) },
    selectedType: TOWER_TYPES[saved.selectedType] ? saved.selectedType : "arrow",
    selectedTower: savedTowers.some((tower) => tower.id === saved.selectedTower) ? saved.selectedTower : null,
    pendingAction: null,
    waveActive: mapCompatible ? Boolean(saved.waveActive) : false,
    spawning: mapCompatible ? Boolean(saved.spawning) : false,
    transition: null,
    feedback: null,
    over: false,
    resultReported: false,
    message: mapCompatible ? (saved.message || state.message) : "路线已更新，重新部署防线"
  };
}

function serializeState(state) {
  const { effects, resultReported, transition, feedback, pendingAction, ...snapshot } = state;
  return {
    ...snapshot,
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    towers: state.towers.map((tower) => ({ ...tower })),
    shots: state.shots.map((shot) => ({ ...shot })),
    fields: state.fields.map((field) => ({ ...field })),
    hero: { ...state.hero },
    queue: state.queue.map((enemy) => ({ ...enemy })),
    effects: undefined,
    resultReported: undefined,
    transition: undefined,
    feedback: undefined,
    pendingAction: undefined
  };
}

function sessionMeta(state) {
  return {
    level: stageMeta(state),
    stage: `第 ${waveMeta(state, WAVES_PER_LEVEL)} 波`,
    score: state.score
  };
}

function cellAt(point) {
  return {
    x: Math.floor(point.x / CELL),
    y: Math.floor(point.y / CELL)
  };
}

function isInsideCell(cell) {
  return cell.x >= 0 && cell.x < GRID && cell.y >= 0 && cell.y < GRID;
}

function isPathCell(cell, level = 1) {
  return mapForLevel(level).pathSet.has(`${cell.x}:${cell.y}`);
}

function towerAt(state, cell) {
  return state.towers.find((tower) => tower.cellX === cell.x && tower.cellY === cell.y);
}

function clearPendingAction(state) {
  state.pendingAction = null;
}

function pendingActionKey(action) {
  if (!action) return "";
  if (action.type === "build") return `build:${action.cell.x}:${action.cell.y}:${action.towerType}`;
  return `${action.type}:${action.towerId}`;
}

function requestActionConfirmation(state, action) {
  const key = pendingActionKey(action);
  state.pendingAction = {
    ...action,
    key,
    expiresAt: state.time + ACTION_CONFIRM_TIMEOUT
  };
  state.message = action.message || "请确认本次操作";
}

function expirePendingAction(state) {
  if (state.pendingAction && state.pendingAction.expiresAt <= state.time) {
    state.pendingAction = null;
  }
}

function placeTower(state, cell, towerType) {
  if (state.over || state.spawning) return;
  if (!isInsideCell(cell)) return;
  if (isPathCell(cell, state.level)) {
    state.message = "道路上不能建塔";
    return;
  }
  if (towerAt(state, cell)) {
    state.message = "这里已经有防御塔";
    return;
  }
  const type = TOWER_TYPES[towerType] ? towerType : "arrow";
  const def = TOWER_TYPES[type];
  if (state.gold < def.cost) {
    state.message = `金币不足，需要 ${def.cost}`;
    return;
  }
  const tower = {
    id: state.nextId++,
    type,
    level: 1,
    targetMode: "first",
    cellX: cell.x,
    cellY: cell.y,
    x: cell.x * CELL + CELL / 2,
    y: cell.y * CELL + CELL / 2,
    cooldown: 0
  };
  state.towers.push(tower);
  state.selectedTower = tower.id;
  state.gold -= def.cost;
  state.message = `建造${def.label}`;
  addBurst(state.effects, tower.x, tower.y, { color: def.color, secondary: classicArcade.white, count: 8, speed: 45 });
  addFloatingText(state.effects, tower.x, tower.y - 12, `-${def.cost}`, { color: classicArcade.yellow, size: 12 });
}

function buildTower(state, cell) {
  if (state.over || state.spawning) return;
  if (!isInsideCell(cell)) return;
  clearPendingAction(state);
  if (isPathCell(cell, state.level)) {
    state.message = "道路上不能建塔";
    return;
  }
  const existing = towerAt(state, cell);
  if (existing) {
    if (state.selectedTower === existing.id) {
      state.selectedTower = null;
      state.message = "已取消选中，隐藏攻击范围";
    } else {
      state.selectedTower = existing.id;
      state.message = `${TOWER_TYPES[existing.type].label} Lv.${existing.level}`;
    }
    return;
  }
  const type = TOWER_TYPES[state.selectedType] ? state.selectedType : "arrow";
  const def = TOWER_TYPES[type];
  if (state.gold < def.cost) {
    state.message = `金币不足，需要 ${def.cost}`;
    return;
  }
  state.selectedTower = null;
  requestActionConfirmation(state, {
    type: "build",
    cell: { ...cell },
    towerType: type,
    title: `建造${def.label}`,
    detail: `消耗 ${def.cost} 金币，在此格部署${def.role}。`,
    confirmLabel: "确认建造",
    message: `确认建造${def.label}？`
  });
}

function performUpgradeTower(state, towerId) {
  const tower = state.towers.find((item) => item.id === towerId);
  if (!tower) {
    state.message = "先点击一座塔";
    return;
  }
  if (tower.level >= TOWER_MAX_LEVEL) {
    state.message = "这座塔已满级";
    return;
  }
  const cost = upgradeCost(tower);
  if (state.gold < cost) {
    state.message = `升级需要 ${cost} 金币`;
    return;
  }
  state.gold -= cost;
  tower.level += 1;
  state.selectedTower = tower.id;
  state.message = `${TOWER_TYPES[tower.type].label} 升到 Lv.${tower.level}`;
  addBurst(state.effects, tower.x, tower.y, { color: classicArcade.yellow, secondary: classicArcade.cyan, count: 12, speed: 58 });
  addFloatingText(state.effects, tower.x, tower.y - 12, "UP", { color: classicArcade.yellow });
}

function upgradeSelectedTower(state) {
  const tower = state.towers.find((item) => item.id === state.selectedTower);
  if (!tower) {
    state.message = "先点击一座塔";
    return;
  }
  if (tower.level >= TOWER_MAX_LEVEL) {
    state.message = "这座塔已满级";
    return;
  }
  const cost = upgradeCost(tower);
  if (state.gold < cost) {
    state.message = `升级需要 ${cost} 金币`;
    return;
  }
  const label = TOWER_TYPES[tower.type]?.label || "防御塔";
  requestActionConfirmation(state, {
    type: "upgrade",
    towerId: tower.id,
    title: `升级${label}`,
    detail: `消耗 ${cost} 金币，提升到 Lv.${tower.level + 1}。`,
    confirmLabel: "确认升级",
    message: `确认升级${label}？`
  });
}

function performSellTower(state, towerId) {
  const index = state.towers.findIndex((item) => item.id === towerId);
  if (index < 0) {
    state.message = "先点击一座塔";
    return;
  }
  const tower = state.towers[index];
  const refund = Math.max(20, Math.round(towerInvestment(tower) * 0.62));
  const label = TOWER_TYPES[tower.type]?.label || "防御塔";
  state.gold += refund;
  state.towers.splice(index, 1);
  state.selectedTower = null;
  state.message = `出售${label}，回收 ${refund} 金币`;
  addBurst(state.effects, tower.x, tower.y, { color: classicArcade.green, secondary: classicArcade.white, count: 10, speed: 52 });
  addFloatingText(state.effects, tower.x, tower.y - 12, `+${refund}`, { color: classicArcade.green });
}

function sellSelectedTower(state) {
  const tower = state.towers.find((item) => item.id === state.selectedTower);
  if (!tower) {
    state.message = "先点击一座塔";
    return;
  }
  const refund = Math.max(20, Math.round(towerInvestment(tower) * 0.62));
  const label = TOWER_TYPES[tower.type]?.label || "防御塔";
  requestActionConfirmation(state, {
    type: "sell",
    towerId: tower.id,
    title: `出售${label}`,
    detail: `回收 ${refund} 金币，出售后这格会变为空地。`,
    confirmLabel: "确认出售",
    message: `确认出售${label}？`
  });
}

function cycleSelectedTowerTarget(state) {
  const tower = state.towers.find((item) => item.id === state.selectedTower);
  if (!tower) {
    state.message = "先点击一座塔";
    return;
  }
  clearPendingAction(state);
  const current = TARGET_ORDER.includes(tower.targetMode) ? tower.targetMode : "first";
  const next = TARGET_ORDER[(TARGET_ORDER.indexOf(current) + 1) % TARGET_ORDER.length];
  tower.targetMode = next;
  state.message = `${TOWER_TYPES[tower.type].label} 目标：${TARGET_MODES[next].label}`;
  addFloatingText(state.effects, tower.x, tower.y - 14, TARGET_MODES[next].label, { color: TOWER_TYPES[tower.type].color, size: 11 });
}

function confirmPendingAction(state) {
  const action = state.pendingAction;
  if (!action) return;
  clearPendingAction(state);
  if (action.type === "build") {
    placeTower(state, action.cell, action.towerType);
  } else if (action.type === "upgrade") {
    performUpgradeTower(state, action.towerId);
  } else if (action.type === "sell") {
    performSellTower(state, action.towerId);
  }
}

function tacticReady(state, id) {
  return Math.max(0, state.tacticCooldowns?.[id] || 0) <= 0;
}

function tacticCooldownText(state, id) {
  const cooldown = Math.ceil(Math.max(0, state.tacticCooldowns?.[id] || 0));
  return cooldown > 0 ? `${cooldown}s` : "就绪";
}

function enemyClusterTarget(state, radius) {
  let best = null;
  let bestScore = -Infinity;
  for (const enemy of state.enemies) {
    if (enemy.defeated) continue;
    const nearby = state.enemies.filter((item) => !item.defeated && withinDistance(enemy, item, radius)).length;
    const score = nearby * 100 + enemy.pathIndex * 5 + (enemy.elite ? 24 : 0) + (enemy.kind === "boss" ? 60 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

function castStorm(state) {
  const tactic = TACTICS.storm;
  if (!tacticReady(state, "storm")) {
    state.message = `雷暴冷却 ${tacticCooldownText(state, "storm")}`;
    return;
  }
  const target = enemyClusterTarget(state, tactic.radius);
  if (!target) {
    state.message = "敌人进入战场后才能释放雷暴";
    return;
  }
  state.tacticCooldowns.storm = tactic.cooldown;
  state.message = "雷暴轰击敌群";
  state.shake = Math.max(state.shake, 8);
  triggerHitStop(state, 0.08, 0.48);
  addBurst(state.effects, target.x, target.y, { color: classicArcade.yellow, secondary: classicArcade.cyan, count: 30, speed: 116, radius: 22 });
  addFloatingText(state.effects, target.x, target.y - 18, "雷暴", { color: classicArcade.yellow, size: 16 });
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    if (!withinDistance(enemy, target, tactic.radius)) continue;
    const falloff = 1 - clamp(distance(enemy, target) / tactic.radius, 0, 0.48);
    const killed = damageEnemy(state, enemy, (tactic.damage + state.level * 3) * falloff, { kind: "spark" });
    if (killed) state.enemies.splice(i, 1);
  }
}

function deployBarricade(state) {
  const tactic = TACTICS.barricade;
  if (!tacticReady(state, "barricade")) {
    state.message = `路障冷却 ${tacticCooldownText(state, "barricade")}`;
    return;
  }
  const target = state.enemies
    .filter((enemy) => !enemy.defeated)
    .sort((a, b) => b.pathIndex - a.pathIndex || distance(endpointForLevel(state.level), a) - distance(endpointForLevel(state.level), b))[0];
  if (!target) {
    state.message = "敌人进入战场后才能部署路障";
    return;
  }
  state.tacticCooldowns.barricade = tactic.cooldown;
  state.fields.push({
    id: state.nextId++,
    kind: "barricade",
    x: target.x,
    y: target.y,
    radius: tactic.radius,
    duration: tactic.duration,
    maxDuration: tactic.duration,
    slow: tactic.slow
  });
  state.message = "路障已部署，敌人减速";
  addBurst(state.effects, target.x, target.y, { color: classicArcade.green, secondary: classicArcade.white, count: 18, speed: 58, radius: 14 });
  addFloatingText(state.effects, target.x, target.y - 16, "路障", { color: classicArcade.green, size: 14 });
}

function castTactic(state, id) {
  clearPendingAction(state);
  if (id === "storm") castStorm(state);
  else if (id === "barricade") deployBarricade(state);
}

function heroXpForLevel(level) {
  return 52 + level * 34;
}

function grantHeroXp(state, amount, position = state.hero) {
  const hero = state.hero;
  if (!hero || hero.level >= HERO.maxLevel) return;
  hero.xp += amount;
  let threshold = heroXpForLevel(hero.level);
  while (hero.xp >= threshold && hero.level < HERO.maxLevel) {
    hero.xp -= threshold;
    hero.level += 1;
    threshold = heroXpForLevel(hero.level);
    state.message = `${HERO.label} 升到 Lv.${hero.level}`;
    addBurst(state.effects, position.x, position.y, { color: HERO.color, secondary: classicArcade.yellow, count: 18, speed: 78, radius: 15 });
    addFloatingText(state.effects, position.x, position.y - 22, `守卫 Lv.${hero.level}`, { color: HERO.color, size: 14 });
  }
}

function heroRallyTarget(state) {
  const enemy = enemyClusterTarget(state, 70);
  if (enemy) return { x: clamp(enemy.x, 24, W - 24), y: clamp(enemy.y - 28, 24, H - 24) };
  const waypoints = waypointsForLevel(state.level);
  const point = waypoints[Math.min(7, waypoints.length - 2)] || heroHomeForLevel(state.level);
  return { x: clamp(point.x, 24, W - 24), y: clamp(point.y - 34, 24, H - 24) };
}

function rallyHero(state) {
  const hero = state.hero;
  if (!hero) return;
  if (hero.rallyCooldown > 0) {
    state.message = `守卫调度冷却 ${Math.ceil(hero.rallyCooldown)}s`;
    return;
  }
  const target = heroRallyTarget(state);
  hero.targetX = target.x;
  hero.targetY = target.y;
  hero.rallyCooldown = HERO.rallyCooldown;
  clearPendingAction(state);
  state.message = `${HERO.label} 正在前往交战点`;
  addBurst(state.effects, hero.x, hero.y, { color: HERO.color, secondary: classicArcade.white, count: 12, speed: 58, radius: 10 });
  addFloatingText(state.effects, hero.x, hero.y - 18, "调度", { color: HERO.color, size: 12 });
}

function spawnEnemy(state, template, context) {
  const start = startPointForLevel(state.level);
  const enemy = {
    ...template,
    maxHp: template.hp,
    x: start.x,
    y: start.y,
    pathIndex: 0,
    slowTimer: 0,
    slowFactor: 1
  };
  state.enemies.push(enemy);
  if (enemy.kind === "boss") {
    announceBossIntro(state, context, enemy, {
      message: `Boss 出现：${enemy.name || "魔盒攻城兽"}`,
      title: "Boss 波来袭",
      subtitle: enemy.name || "魔盒攻城兽",
      effects: state.effects,
      position: { x: 26, y: start.y },
      burst: { count: 32, color: classicArcade.red, secondary: classicArcade.yellow, speed: 92, radius: 20 },
      shake: 4.5,
      flash: 0.5,
      hitStop: 0.08,
      hitStopScale: 0.42
    });
  }
}

function startWave(state, config) {
  if (state.over) return;
  clearPendingAction(state);
  if (state.spawning || state.enemies.length) {
    state.message = "当前波次仍在推进";
    return;
  }
  const queue = createWave(config, state.level, state.wave, state.nextId);
  state.nextId += queue.length + 1;
  state.queue = queue;
  state.waveActive = true;
  state.spawning = true;
  state.spawnTimer = 0.2;
  state.message = `第 ${waveMeta(state, WAVES_PER_LEVEL)} 波来袭`;
}

function completeWave(state, context) {
  if (state.over) return;
  state.waveActive = false;
  clearPendingAction(state);
  const endpoint = endpointForLevel(state.level);
  const rewards = {
    gold: 30 + state.level * 6 + state.wave * 3,
    score: 46 + state.level * 16 + state.wave * 4
  };
  grantProgressRewards(state, rewards, {
    effects: state.effects,
    position: { x: endpoint.x - 10, y: endpoint.y - 10 },
    labels: { gold: "金币", score: "分数" },
    color: classicArcade.yellow,
    size: 12
  });
  if (isFinalWave(state, WAVES_PER_LEVEL)) {
    state.over = true;
    announceStageClear(state, context, {
      message: "魔盒防线守住了",
      transition: {
        title: "防守完成",
        subtitle: rewardSummary(rewards, { gold: "金币", score: "分数" }),
        duration: 1.25
      },
      effects: state.effects,
      position: { x: endpoint.x - 10, y: endpoint.y },
      burst: { color: classicArcade.green, secondary: classicArcade.yellow, count: 16, speed: 76 },
      shake: 2.8
    });
    context.clearSession?.();
    context.reportResult?.({
      outcome: "win",
      score: state.score,
      detail: "完成全部塔防关卡",
      extra: `剩余生命 ${state.lives}`
    });
    state.resultReported = true;
    return;
  }
  const progressType = advanceWave(state, WAVES_PER_LEVEL);
  let redeployRefund = 0;
  if (progressType === "stage") {
    redeployRefund = Math.round(state.towers.reduce((sum, tower) => sum + towerInvestment(tower), 0) * 0.72);
    if (redeployRefund > 0) {
      state.gold += redeployRefund;
      addFloatingText(state.effects, W / 2, H / 2, `换防返还 +${redeployRefund}`, { color: classicArcade.green, size: 13 });
    }
    state.towers = [];
    state.shots = [];
    state.fields = [];
    state.selectedTower = null;
    resetHeroForLevel(state);
  }
  announceStageClear(state, context, {
    message: progressType === "stage"
      ? `进入${mapForLevel(state.level).name}，重新部署防线`
      : `准备第 ${waveMeta(state, WAVES_PER_LEVEL)} 波`,
    transition: {
      title: progressType === "stage" ? "区域推进" : "波次完成",
      subtitle: rewardSummary({ ...rewards, ...(redeployRefund ? { redeploy: redeployRefund } : {}) }, { gold: "金币", score: "分数", redeploy: "返还" }),
      duration: 1.1
    },
    effects: state.effects,
    position: { x: endpoint.x - 10, y: endpoint.y },
    burst: { color: classicArcade.green, secondary: classicArcade.yellow, count: 16, speed: 76 },
    shake: 2.3
  });
}

function damageEnemy(state, enemy, amount, shot) {
  if (!enemy || enemy.defeated) return false;
  const shotKind = shot?.kind || "hit";
  if (enemy.dodge && !["spark", "venom", "venom-dot"].includes(shotKind) && Math.random() < enemy.dodge) {
    addFloatingText(state.effects, enemy.x, enemy.y - 10, "闪避", { color: classicArcade.cyan, size: 10 });
    return false;
  }
  if (shot?.poison) {
    enemy.poisonTimer = Math.max(enemy.poisonTimer || 0, shot.poisonTime || 2.2);
    enemy.poisonDps = Math.max(enemy.poisonDps || 0, shot.poison || 4);
  }
  let finalAmount = amount;
  if (enemy.armor && !["spark", "venom", "venom-dot"].includes(shotKind)) {
    finalAmount *= Math.max(0.35, 1 - enemy.armor);
  }
  if (enemy.kind === "juggernaut" && shotKind === "mortar") finalAmount *= 1.18;
  if (enemy.kind === "phantom" && shotKind === "spark") finalAmount *= 1.22;
  enemy.hp -= finalAmount;
  if (shotKind === "frost") {
    enemy.slowTimer = Math.max(enemy.slowTimer, shot.slowTime || 1.2);
    enemy.slowFactor = shot.slow || 0.5;
  }
  if (enemy.hp <= 0) {
    enemy.defeated = true;
    state.gold += enemy.reward;
    state.score += enemy.kind === "boss" ? 360 + state.level * 18 : 18 + enemy.reward;
    if (enemy.kind === "boss") triggerHitStop(state, 0.1, 0.36);
    if (ENEMY_TRAITS[enemy.kind]?.split && !enemy.splitChild) {
      for (let i = 0; i < ENEMY_TRAITS[enemy.kind].split; i += 1) {
        const dir = i % 2 === 0 ? -1 : 1;
        const hp = Math.max(3, Math.round(enemy.maxHp * 0.22));
        state.enemies.push({
          id: state.nextId++,
          kind: "swarm",
          hp,
          maxHp: hp,
          x: clamp(enemy.x + dir * 8, 8, W - 8),
          y: enemy.y,
          pathIndex: enemy.pathIndex,
          slowTimer: 0,
          slowFactor: 1,
          speed: enemy.speed * 1.16,
          reward: Math.max(2, Math.round(enemy.reward * 0.34)),
          splitChild: true
        });
      }
    }
    if (enemy.burst) {
      state.shake = Math.max(state.shake, 6);
      addBurst(state.effects, enemy.x, enemy.y, { color: classicArcade.red, secondary: classicArcade.yellow, count: 18, speed: 92, radius: 14 });
    }
    addBurst(state.effects, enemy.x, enemy.y, {
      color: enemy.kind === "boss" ? classicArcade.red : classicArcade.orange,
      secondary: classicArcade.yellow,
      count: enemy.kind === "boss" ? 24 : 10,
      speed: enemy.kind === "boss" ? 110 : 70
    });
    addFloatingText(state.effects, enemy.x, enemy.y - 12, enemy.kind === "boss" ? "+360" : `+${enemy.reward}`, { color: classicArcade.yellow, size: enemy.kind === "boss" ? 16 : 13 });
    return true;
  }
  triggerFlash(enemy, enemy.kind === "boss" ? 0.16 : 0.1);
  return false;
}

function updateEnemies(state, dt) {
  const waypoints = waypointsForLevel(state.level);
  for (const enemy of state.enemies) {
    if (enemy.defeated) continue;
    if (enemy.poisonTimer > 0) {
      enemy.poisonTimer -= dt;
      const killed = damageEnemy(state, enemy, (enemy.poisonDps || 0) * dt, { kind: "venom-dot" });
      if (killed) continue;
    }
    if (enemy.regen && enemy.hp > 0 && enemy.hp < enemy.maxHp) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.regen * dt);
    }
    if (enemy.healAura) {
      for (const ally of state.enemies) {
        if (ally === enemy || ally.defeated || ally.hp >= ally.maxHp) continue;
        if (withinDistance(enemy, ally, 44)) {
          ally.hp = Math.min(ally.maxHp, ally.hp + enemy.healAura * dt);
        }
      }
    }
    if (enemy.slowTimer > 0) enemy.slowTimer -= dt;
    else enemy.slowFactor = 1;
    let fieldSlow = 1;
    for (const field of state.fields) {
      if (field.kind === "barricade" && withinDistance(enemy, field, field.radius)) {
        fieldSlow = Math.min(fieldSlow, field.slow || 0.45);
      }
    }
    const target = waypoints[enemy.pathIndex + 1];
    if (!target) {
      enemy.reached = true;
      continue;
    }
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const speed = enemy.speed * (enemy.slowTimer > 0 ? enemy.slowFactor : 1) * fieldSlow;
    const step = speed * dt;
    if (distance <= step) {
      enemy.x = target.x;
      enemy.y = target.y;
      enemy.pathIndex += 1;
      if (enemy.pathIndex >= waypoints.length - 1) enemy.reached = true;
    } else {
      enemy.x += (dx / distance) * step;
      enemy.y += (dy / distance) * step;
    }
  }
  const endpoint = endpointForLevel(state.level);
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    if (state.enemies[i].defeated) {
      state.enemies.splice(i, 1);
      continue;
    }
    if (!state.enemies[i].reached) continue;
    const enemy = state.enemies[i];
    const penalty = enemy.penalty || ENEMY_TRAITS[enemy.kind]?.penalty || (enemy.kind === "boss" ? 5 : 1);
    state.lives -= penalty;
    state.shake = Math.max(state.shake, 7);
    addBurst(state.effects, endpoint.x - 8, endpoint.y, { color: classicArcade.red, secondary: classicArcade.white, count: 12, speed: 88 });
    state.enemies.splice(i, 1);
  }
}

function targetCompare(tower, a, b) {
  const mode = TARGET_ORDER.includes(tower.targetMode) ? tower.targetMode : "first";
  if (mode === "strong") return b.hp - a.hp || b.pathIndex - a.pathIndex;
  if (mode === "weak") return a.hp - b.hp || b.pathIndex - a.pathIndex;
  if (mode === "nearest") return distance(tower, a) - distance(tower, b) || b.pathIndex - a.pathIndex;
  return b.pathIndex - a.pathIndex || a.hp - b.hp;
}

function heroBoostsTower(state, tower) {
  if (!state.hero) return false;
  return withinDistance(state.hero, tower, heroStats(state.hero).aura);
}

function updateTowers(state, dt) {
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) continue;
    const boosted = heroBoostsTower(state, tower);
    const baseStats = towerStats(tower);
    const stats = boosted
      ? { ...baseStats, damage: Math.round(baseStats.damage * 1.12), cooldown: baseStats.cooldown * 0.94 }
      : baseStats;
    const target = state.enemies
      .filter((enemy) => !enemy.defeated && withinDistance(tower, enemy, stats.range))
      .sort((a, b) => targetCompare(tower, a, b))[0];
    if (!target) continue;
    tower.cooldown = stats.cooldown;
    state.shots.push({
      id: state.nextId++,
      x: tower.x,
      y: tower.y,
      targetId: target.id,
      kind: tower.type,
      damage: stats.damage,
      speed: stats.speed,
      splash: stats.splash || 0,
      slow: stats.slow || 1,
      slowTime: stats.slowTime || 0,
      poison: stats.poison || 0,
      poisonTime: stats.poisonTime || 0,
      chain: stats.chain || 0,
      color: stats.color
    });
  }
}

function updateHero(state, dt) {
  const hero = state.hero;
  if (!hero) return;
  hero.rallyCooldown = Math.max(0, (hero.rallyCooldown || 0) - dt);
  hero.attackTimer = Math.max(0, (hero.attackTimer || 0) - dt);
  const dx = hero.targetX - hero.x;
  const dy = hero.targetY - hero.y;
  const remaining = Math.hypot(dx, dy);
  const stats = heroStats(hero);
  if (remaining > 1) {
    const step = Math.min(remaining, stats.speed * dt);
    hero.x += (dx / remaining) * step;
    hero.y += (dy / remaining) * step;
  }
  if (hero.attackTimer > 0) return;
  const target = state.enemies
    .filter((enemy) => !enemy.defeated && withinDistance(hero, enemy, stats.range))
    .sort((a, b) => b.pathIndex - a.pathIndex || a.hp - b.hp)[0];
  if (!target) return;
  hero.attackTimer = stats.cooldown;
  state.shots.push({
    id: state.nextId++,
    x: hero.x,
    y: hero.y,
    targetId: target.id,
    kind: "hero",
    damage: stats.damage,
    speed: 320,
    splash: hero.level >= 4 ? 18 : 0,
    chain: 0,
    slow: 1,
    slowTime: 0,
    color: HERO.color
  });
}

function updateShots(state, dt) {
  for (const shot of state.shots) {
    const target = state.enemies.find((enemy) => enemy.id === shot.targetId && !enemy.defeated);
    if (!target) {
      shot.done = true;
      continue;
    }
    const dx = target.x - shot.x;
    const dy = target.y - shot.y;
    const targetDistance = Math.hypot(dx, dy);
    const step = shot.speed * dt;
    if (targetDistance <= step + 4) {
      shot.done = true;
      if (shot.splash) {
        for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
          const enemy = state.enemies[i];
          if (!withinDistance(enemy, target, shot.splash)) continue;
          const killed = damageEnemy(state, enemy, shot.damage * (enemy === target ? 1 : 0.62), shot);
          if (killed && shot.kind === "hero") grantHeroXp(state, enemy.kind === "boss" ? 30 : 10 + (enemy.elite ? 8 : 0), enemy);
          if (killed) state.enemies.splice(i, 1);
        }
      } else if (shot.chain) {
        const chainTargets = state.enemies
          .filter((enemy) => enemy !== target && !enemy.defeated && withinDistance(enemy, target, 56))
          .sort((a, b) => distance(a, target) - distance(b, target))
          .slice(0, shot.chain);
        const hits = [
          { enemy: target, damage: shot.damage },
          ...chainTargets.map((enemy, index) => ({ enemy, damage: shot.damage * (0.58 - index * 0.12) }))
        ];
        for (const hit of hits) {
          if (!state.enemies.includes(hit.enemy)) continue;
          const killed = damageEnemy(state, hit.enemy, hit.damage, shot);
          if (killed && shot.kind === "hero") grantHeroXp(state, hit.enemy.kind === "boss" ? 30 : 10 + (hit.enemy.elite ? 8 : 0), hit.enemy);
          if (killed) state.enemies.splice(state.enemies.indexOf(hit.enemy), 1);
        }
      } else {
        const killed = damageEnemy(state, target, shot.damage, shot);
        if (killed && shot.kind === "hero") grantHeroXp(state, target.kind === "boss" ? 30 : 10 + (target.elite ? 8 : 0), target);
        if (killed) state.enemies.splice(state.enemies.indexOf(target), 1);
      }
      addBurst(state.effects, target.x, target.y, { color: shot.color, secondary: classicArcade.white, count: 5, speed: 40, life: 0.18 });
    } else {
      shot.x += (dx / targetDistance) * step;
      shot.y += (dy / targetDistance) * step;
    }
  }
  for (let i = state.shots.length - 1; i >= 0; i -= 1) {
    if (state.shots[i].done) state.shots.splice(i, 1);
  }
}

function updateTactics(state, dt) {
  for (const id of TACTIC_ORDER) {
    state.tacticCooldowns[id] = Math.max(0, (state.tacticCooldowns[id] || 0) - dt);
  }
  for (const field of state.fields) {
    field.duration -= dt;
  }
  for (let i = state.fields.length - 1; i >= 0; i -= 1) {
    if (state.fields[i].duration <= 0) state.fields.splice(i, 1);
  }
}

function update(state, config, dt, context, rawDt = dt) {
  if (state.over) return;
  state.time += dt;
  expirePendingAction(state);
  state.shake = Math.max(0, state.shake - dt * 18);
  updateTactics(state, dt);
  updateEffects(state.effects, dt);
  updateFeedback(state, rawDt, state.enemies);
  updateStageTransition(state, dt);
  if (state.spawning) {
    const waveCfg = waveConfig(config, state.level, state.wave);
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.queue.length) {
      spawnEnemy(state, state.queue.shift(), context);
      state.spawnTimer = waveCfg.interval;
    }
    if (!state.queue.length) state.spawning = false;
  }
  updateEnemies(state, dt);
  updateHero(state, dt);
  updateTowers(state, dt);
  updateShots(state, dt);
  if (state.waveActive && !state.spawning && !state.queue.length && !state.enemies.length) {
    completeWave(state, context);
  }
  if (state.lives <= 0 && !state.resultReported) {
    state.over = true;
    state.message = "魔盒核心被突破";
    context.clearSession?.();
    context.reportResult?.({
      outcome: "loss",
      score: state.score,
      detail: `防守到第 ${waveNumber(state)} 波`,
      extra: `金币 ${state.gold}`
    });
    state.resultReported = true;
  }
}

function drawRoundedRect(ctx, x, y, w, h, radius = 4) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function strokePath(ctx, points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  });
  ctx.stroke();
}

function fillPath(ctx, points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  });
  ctx.closePath();
  ctx.fill();
}

function cellHash(x, y, level) {
  return Math.abs((x * 97 + y * 151 + level * 211) % 997);
}

function drawTerrain(ctx, state) {
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (isPathCell({ x, y }, state.level)) continue;
      const px = x * CELL;
      const py = y * CELL;
      const hash = cellHash(x, y, state.level);
      const occupied = towerAt(state, { x, y });
      ctx.fillStyle = hash % 2
        ? "rgba(18, 44, 66, .34)"
        : "rgba(16, 34, 55, .28)";
      ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = occupied ? "rgba(255,209,102,.16)" : "rgba(248,251,255,.07)";
      ctx.strokeRect(px + 5.5, py + 5.5, CELL - 11, CELL - 11);
      ctx.fillStyle = "rgba(66,242,255,.12)";
      ctx.fillRect(px + 8, py + 7, 5, 1.2);
      ctx.fillRect(px + 7, py + 8, 1.2, 5);
      if (!occupied && hash % 11 === 0) {
        ctx.fillStyle = "rgba(93,255,139,.12)";
        ctx.beginPath();
        ctx.arc(px + 21, py + 20, 4.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (!occupied && hash % 17 === 0) {
        ctx.fillStyle = "rgba(255,209,102,.1)";
        fillPath(ctx, [[px + 19, py + 7], [px + 24, py + 15], [px + 17, py + 18], [px + 14, py + 11]]);
      }
    }
  }
}

function drawPath(ctx, state) {
  const waypoints = waypointsForLevel(state.level);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(2, 7, 16, .66)";
  ctx.lineWidth = 31;
  ctx.beginPath();
  waypoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.strokeStyle = "rgba(95, 73, 49, .92)";
  ctx.lineWidth = 27;
  ctx.stroke();
  ctx.strokeStyle = "#273d5d";
  ctx.lineWidth = 21;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,209,102,.16)";
  ctx.lineWidth = 25;
  ctx.setLineDash([5, 13]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(66,242,255,.18)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 1; i < waypoints.length - 1; i += 4) {
    const point = waypoints[i];
    ctx.fillStyle = "rgba(248,251,255,.16)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 1; i < waypoints.length - 2; i += 5) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(248,251,255,.18)";
    fillPath(ctx, [[6, 0], [-4, -5], [-1, 0], [-4, 5]]);
    ctx.restore();
  }
}

function drawTacticalFields(ctx, state) {
  for (const field of state.fields) {
    const progress = clamp(field.duration / (field.maxDuration || field.duration || 1), 0, 1);
    if (field.kind !== "barricade") continue;
    ctx.save();
    ctx.translate(field.x, field.y);
    ctx.fillStyle = `rgba(93,255,139,${0.08 + progress * 0.08})`;
    ctx.beginPath();
    ctx.arc(0, 0, field.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(93,255,139,.42)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, field.radius - 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#121b20";
    drawRoundedRect(ctx, -16, -6, 32, 12, 4);
    ctx.fill();
    ctx.strokeStyle = classicArcade.green;
    ctx.stroke();
    ctx.fillStyle = classicArcade.green;
    for (let i = -1; i <= 1; i += 1) {
      drawRoundedRect(ctx, i * 10 - 2, -12, 4, 24, 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawTower(ctx, tower, selected = false) {
  const stats = towerStats(tower);
  const def = TOWER_TYPES[tower.type] || TOWER_TYPES.arrow;
  if (selected) {
    ctx.fillStyle = "rgba(66, 242, 255, .075)";
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, stats.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(66, 242, 255, .34)";
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,209,102,.38)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, stats.range - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save();
  ctx.translate(tower.x, tower.y);
  ctx.fillStyle = classicArcade.shadow;
  ctx.beginPath();
  ctx.ellipse(0, 9, 18, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1223";
  drawRoundedRect(ctx, -16, -8, 32, 24, 6);
  ctx.fill();
  ctx.fillStyle = "#111a2c";
  drawRoundedRect(ctx, -13, -12, 26, 24, 5);
  ctx.fill();
  ctx.fillStyle = "rgba(248,251,255,.09)";
  ctx.fillRect(-10, -9, 20, 2);
  ctx.fillStyle = "rgba(0,0,0,.2)";
  ctx.fillRect(-11, 8, 22, 3);
  ctx.strokeStyle = "rgba(248,251,255,.25)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.strokeStyle = "rgba(66,242,255,.15)";
  ctx.lineWidth = 1;
  strokePath(ctx, [[-15, 3], [-22, 8]]);
  strokePath(ctx, [[15, 3], [22, 8]]);
  strokePath(ctx, [[-9, 14], [-13, 21]]);
  strokePath(ctx, [[9, 14], [13, 21]]);
  ctx.fillStyle = stats.color;
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  ctx.arc(0, -3, 21, 0, Math.PI * 2);
  ctx.strokeStyle = stats.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = stats.color;
  ctx.strokeStyle = classicArcade.white;
  ctx.lineWidth = 2;
  if (tower.type === "cannon") {
    ctx.save();
    ctx.rotate(-0.18);
    drawRoundedRect(ctx, -3, -23, 18, 9, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, -3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#101629";
    ctx.beginPath();
    ctx.arc(0, -3, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (tower.type === "mortar") {
    ctx.save();
    ctx.rotate(-0.42);
    drawRoundedRect(ctx, -5, -27, 24, 11, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#32121d";
    drawRoundedRect(ctx, -12, -2, 24, 16, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = stats.color;
    ctx.beginPath();
    ctx.arc(0, -4, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (tower.type === "venom") {
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.bezierCurveTo(13, -7, 13, 10, 0, 17);
    ctx.bezierCurveTo(-13, 10, -13, -7, 0, -22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(248,251,255,.78)";
    ctx.beginPath();
    ctx.arc(-4, -2, 2.4, 0, Math.PI * 2);
    ctx.arc(5, 2, 3, 0, Math.PI * 2);
    ctx.arc(0, 8, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (tower.type === "frost") {
    fillPath(ctx, [[0, -22], [12, -7], [8, 8], [0, 16], [-8, 8], [-12, -7]]);
    ctx.stroke();
    ctx.strokeStyle = "rgba(248,251,255,.8)";
    ctx.lineWidth = 1.5;
    strokePath(ctx, [[0, -16], [0, 10]]);
    strokePath(ctx, [[-8, -6], [8, 6]]);
    strokePath(ctx, [[8, -6], [-8, 6]]);
  } else if (tower.type === "spark") {
    fillPath(ctx, [[4, -24], [-11, 0], [-1, 0], [-7, 18], [13, -9], [2, -8]]);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 1.4;
    strokePath(ctx, [[-12, 15], [12, 15]]);
    strokePath(ctx, [[-8, 20], [8, 20]]);
  } else {
    ctx.lineCap = "round";
    strokePath(ctx, [[0, -23], [0, 10]]);
    ctx.beginPath();
    ctx.arc(0, -6, 16, Math.PI * 1.14, Math.PI * 1.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -6, 16, Math.PI * 0.14, Math.PI * 0.86);
    ctx.stroke();
    ctx.fillStyle = stats.color;
    fillPath(ctx, [[0, -25], [4, -14], [0, -17], [-4, -14]]);
  }
  ctx.fillStyle = classicArcade.bg;
  ctx.globalAlpha = 0.78;
  drawRoundedRect(ctx, -12, 12, 24, 9, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = classicArcade.white;
  ctx.font = "900 8px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Lv${tower.level}`, 0, 16.8);
  for (let i = 0; i < TOWER_MAX_LEVEL; i += 1) {
    ctx.fillStyle = i < tower.level ? stats.color : "rgba(248,251,255,.18)";
    ctx.beginPath();
    ctx.arc(-8 + i * 4, 23, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
  if (selected) {
    const targetLabel = TARGET_MODES[tower.targetMode || "first"]?.label || TARGET_MODES.first.label;
    ctx.fillStyle = stats.color;
    ctx.font = "900 6.5px system-ui, sans-serif";
    ctx.fillText(targetLabel, 0, -30);
  }
  if (def.role) {
    ctx.fillStyle = stats.color;
    ctx.fillRect(-8, 26, 16 * (tower.level / TOWER_MAX_LEVEL), 2);
  }
  ctx.restore();
}

function drawHero(ctx, state) {
  const hero = state.hero;
  if (!hero) return;
  const stats = heroStats(hero);
  ctx.save();
  ctx.fillStyle = "rgba(66,242,255,.045)";
  ctx.beginPath();
  ctx.arc(hero.x, hero.y, stats.aura, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(66,242,255,.16)";
  ctx.setLineDash([5, 9]);
  ctx.beginPath();
  ctx.arc(hero.x, hero.y, stats.range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,209,102,.34)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(hero.x, hero.y);
  ctx.lineTo(hero.targetX, hero.targetY);
  ctx.stroke();
  ctx.translate(hero.x, hero.y);
  ctx.fillStyle = classicArcade.shadow;
  ctx.beginPath();
  ctx.ellipse(0, 10, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0d2033";
  fillPath(ctx, [[0, -21], [15, -9], [12, 10], [0, 19], [-12, 10], [-15, -9]]);
  ctx.fillStyle = HERO.color;
  fillPath(ctx, [[0, -17], [10, -7], [8, 7], [0, 14], [-8, 7], [-10, -7]]);
  ctx.fillStyle = "#f8fbff";
  ctx.beginPath();
  ctx.arc(0, -6, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = classicArcade.yellow;
  ctx.lineWidth = 2;
  strokePath(ctx, [[-11, 1], [-20, -4]]);
  strokePath(ctx, [[11, 1], [20, -4]]);
  ctx.fillStyle = "rgba(5,9,20,.82)";
  drawRoundedRect(ctx, -13, 16, 26, 9, 4);
  ctx.fill();
  ctx.fillStyle = classicArcade.white;
  ctx.font = "900 7px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Lv${hero.level}`, 0, 20.5);
  ctx.restore();
}

function enemyHeading(enemy, state) {
  const waypoints = waypointsForLevel(state.level);
  const target = waypoints[enemy.pathIndex + 1] || waypoints[enemy.pathIndex];
  if (!target) return 0;
  return Math.atan2(target.y - enemy.y, target.x - enemy.x) + Math.PI / 2;
}

function drawEnemy(ctx, enemy, state) {
  const colors = {
    grunt: classicArcade.magenta,
    runner: classicArcade.cyan,
    armored: classicArcade.orange,
    regen: classicArcade.green,
    swarm: classicArcade.green,
    healer: classicArcade.white,
    splitter: classicArcade.yellow,
    phantom: classicArcade.blue,
    shield: classicArcade.blue,
    juggernaut: classicArcade.red,
    sapper: classicArcade.orange,
    warlock: classicArcade.magenta,
    boss: classicArcade.red
  };
  const radius = enemy.kind === "boss" ? 15 : (enemy.kind === "juggernaut") ? 13 : (enemy.kind === "armored" || enemy.kind === "shield") ? 11 : enemy.kind === "swarm" ? 7 : 9;
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemyHeading(enemy, state));
  ctx.fillStyle = classicArcade.shadow;
  ctx.beginPath();
  ctx.ellipse(2, 4, radius + 3, radius * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[enemy.kind] || classicArcade.magenta;
  if (enemy.kind === "boss") {
    fillPath(ctx, [[0, -20], [17, -10], [21, 8], [10, 19], [-10, 19], [-21, 8], [-17, -10]]);
    ctx.fillStyle = "#6a1929";
    fillPath(ctx, [[-18, -12], [-27, -20], [-20, 0]]);
    fillPath(ctx, [[18, -12], [27, -20], [20, 0]]);
    ctx.fillStyle = colors.boss;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = classicArcade.yellow;
    ctx.beginPath();
    ctx.arc(0, -3, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === "juggernaut") {
    fillPath(ctx, [[0, -18], [15, -10], [16, 10], [0, 18], [-16, 10], [-15, -10]]);
    ctx.fillStyle = "rgba(0,0,0,.32)";
    fillPath(ctx, [[0, -11], [9, -5], [9, 6], [0, 11], [-9, 6], [-9, -5]]);
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 2;
    strokePath(ctx, [[-12, -14], [-20, -21]]);
    strokePath(ctx, [[12, -14], [20, -21]]);
  } else if (enemy.kind === "sapper") {
    fillPath(ctx, [[0, -14], [12, -3], [7, 13], [-7, 13], [-12, -3]]);
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.arc(0, 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 1.6;
    strokePath(ctx, [[3, -9], [11, -17]]);
  } else if (enemy.kind === "warlock") {
    fillPath(ctx, [[0, -17], [11, 3], [6, 16], [-6, 16], [-11, 3]]);
    ctx.fillStyle = "#220f36";
    ctx.beginPath();
    ctx.arc(0, -5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.magenta;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 1, 15, 0.18, Math.PI * 1.18);
    ctx.stroke();
  } else if (enemy.kind === "phantom") {
    ctx.globalAlpha = 0.72 + Math.sin(enemy.x * 0.08) * 0.12;
    fillPath(ctx, [[0, -16], [12, 0], [4, 13], [0, 8], [-4, 13], [-12, 0]]);
    ctx.fillStyle = "rgba(248,251,255,.38)";
    ctx.beginPath();
    ctx.arc(0, -4, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === "healer") {
    fillPath(ctx, [[0, -15], [12, -3], [8, 13], [0, 17], [-8, 13], [-12, -3]]);
    ctx.fillStyle = classicArcade.green;
    ctx.fillRect(-2, -10, 4, 17);
    ctx.fillRect(-8, -4, 16, 4);
  } else if (enemy.kind === "regen") {
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(93,255,139,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -1, 15, -0.6, Math.PI * 1.15);
    ctx.stroke();
  } else if (enemy.kind === "shield") {
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(248,251,255,.16)";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = classicArcade.cyan;
    fillPath(ctx, [[0, -12], [9, -2], [5, 10], [-5, 10], [-9, -2]]);
  } else if (enemy.kind === "armored") {
    fillPath(ctx, [[0, -15], [13, -8], [11, 10], [0, 16], [-11, 10], [-13, -8]]);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    fillPath(ctx, [[0, -9], [8, -4], [7, 6], [0, 10], [-7, 6], [-8, -4]]);
  } else if (enemy.kind === "splitter") {
    fillPath(ctx, [[0, -15], [12, -2], [6, 14], [0, 10], [-6, 14], [-12, -2]]);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(-2, -10, 4, 20);
    ctx.fillStyle = colors.splitter;
    ctx.beginPath();
    ctx.arc(-5, -2, 3, 0, Math.PI * 2);
    ctx.arc(5, -2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === "swarm") {
    fillPath(ctx, [[0, -11], [7, 5], [2, 3], [0, 12], [-2, 3], [-7, 5]]);
    ctx.strokeStyle = "rgba(93,255,139,.55)";
    ctx.lineWidth = 1.5;
    strokePath(ctx, [[-8, 2], [-15, 6]]);
    strokePath(ctx, [[8, 2], [15, 6]]);
  } else if (enemy.kind === "runner") {
    fillPath(ctx, [[0, -15], [14, 7], [5, 4], [0, 15], [-5, 4], [-14, 7]]);
    ctx.strokeStyle = "rgba(66,242,255,.48)";
    ctx.lineWidth = 1.5;
    strokePath(ctx, [[-17, 1], [-25, 1]]);
    strokePath(ctx, [[17, 1], [25, 1]]);
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.grunt;
    ctx.lineWidth = 2;
    strokePath(ctx, [[-8, 1], [-15, -5]]);
    strokePath(ctx, [[8, 1], [15, -5]]);
  }
  ctx.strokeStyle = enemy.slowTimer > 0 ? classicArcade.blue : enemy.elite ? classicArcade.yellow : "rgba(255,255,255,.45)";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (enemy.poisonTimer > 0) {
    ctx.strokeStyle = "rgba(93,255,139,.72)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = classicArcade.bg;
  ctx.fillRect(-4, -5, 3, 4);
  ctx.fillRect(2, -5, 3, 4);
  ctx.fillStyle = "rgba(248,251,255,.72)";
  ctx.fillRect(-3, -4, 1.5, 1.5);
  ctx.fillRect(3, -4, 1.5, 1.5);
  ctx.restore();
  if (enemy.flash) drawCirclePulse(ctx, enemy, radius + 5, enemy.flash * 20, { color: classicArcade.yellow, alpha: 0.52, growth: 3 });
  const barW = radius * 2;
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(enemy.x - radius, enemy.y - radius - 7, barW, 4);
  ctx.fillStyle = classicArcade.green;
  ctx.fillRect(enemy.x - radius, enemy.y - radius - 7, barW * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
  const badges = [
    enemy.elite ? { text: "E", color: classicArcade.yellow } : null,
    enemy.armor ? { text: "A", color: classicArcade.blue } : null,
    enemy.regen || enemy.healAura ? { text: "+", color: classicArcade.green } : null
  ].filter(Boolean);
  badges.forEach((badge, index) => {
    const x = enemy.x - radius + index * 8;
    const y = enemy.y + radius + 3;
    ctx.fillStyle = "rgba(5,9,20,.78)";
    drawRoundedRect(ctx, x, y, 7, 7, 2);
    ctx.fill();
    ctx.fillStyle = badge.color;
    ctx.font = "900 5.5px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge.text, x + 3.5, y + 3.8);
  });
}

function drawTowerEndpoint(ctx, x, y, color, label) {
  ctx.fillStyle = classicArcade.shadow;
  drawRoundedRect(ctx, x - 13, y - 13, 26, 26, 6);
  ctx.fill();
  ctx.fillStyle = color;
  drawRoundedRect(ctx, x - 11, y - 11, 22, 22, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(248,251,255,.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = classicArcade.bg;
  ctx.font = "900 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 0.5);
}

function drawShot(ctx, shot) {
  ctx.save();
  ctx.translate(shot.x, shot.y);
  ctx.fillStyle = shot.color;
  ctx.strokeStyle = "rgba(248,251,255,.72)";
  ctx.lineWidth = 1.4;
  if (shot.kind === "cannon") {
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (shot.kind === "mortar") {
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,209,102,.72)";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shot.kind === "venom") {
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(248,251,255,.72)";
    ctx.beginPath();
    ctx.arc(-2, -1, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (shot.kind === "frost") {
    fillPath(ctx, [[0, -6], [6, 0], [0, 6], [-6, 0]]);
    ctx.stroke();
  } else if (shot.kind === "spark") {
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    strokePath(ctx, [[-6, 4], [-1, -2], [3, 1], [7, -5]]);
  } else {
    fillPath(ctx, [[0, -7], [4, 3], [0, 1], [-4, 3]]);
  }
  ctx.restore();
}

function draw(state, ctx) {
  const offset = shakeOffset(state.shake);
  drawArcadeBackdrop(ctx, W, H, state.time, { top: "#071527", bottom: "#14213b", grid: "rgba(66,242,255,.08)", gridSize: CELL });
  ctx.save();
  ctx.translate(offset.x, offset.y);
  drawTerrain(ctx, state);
  drawPath(ctx, state);
  drawTacticalFields(ctx, state);
  drawTowerEndpoint(ctx, 12, startPointForLevel(state.level).y, classicArcade.green, "入");
  drawTowerEndpoint(ctx, W - 12, endpointForLevel(state.level).y, classicArcade.red, "核");
  drawHero(ctx, state);
  state.towers.forEach((tower) => drawTower(ctx, tower, tower.id === state.selectedTower));
  state.enemies.forEach((enemy) => drawEnemy(ctx, enemy, state));
  state.shots.forEach((shot) => drawShot(ctx, shot));
  drawEffects(ctx, state.effects);
  ctx.restore();
  drawStageTransition(ctx, W, H, state.transition);
}

export function mountTowerDefense(root, context) {
  const config = DIFFICULTY[context.difficulty] || DIFFICULTY.medium;
  let state = restoreState(config, context.savedState);

  root.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong data-status>${state.message}</strong>
        <p class="game-note" data-note>${context.labels.difficulty} · ${MAX_LEVEL} 关 · ${totalWaves(state, WAVES_PER_LEVEL)} 波 · ${MAPS.length} 套路线</p>
      </div>
      <div class="mini-stats">
        <span data-level>关卡 1/${MAX_LEVEL}</span>
        <span data-wave>波次 1/${totalWaves(state, WAVES_PER_LEVEL)}</span>
        <span data-lives>核心 ${state.lives}</span>
        <span data-gold>金币 ${state.gold}</span>
        <span data-score>分数 ${state.score}</span>
      </div>
    </section>
    <section class="arcade-shell tower-defense-shell" data-visual-style="${context.visualStyle || "classic-arcade"}">
      <div class="arcade-stage"><canvas class="arcade-canvas" width="${W}" height="${H}" aria-label="机关塔防"></canvas></div>
      <div class="arcade-controls tower-defense-controls">
        <div class="tower-controls">
          ${TOWER_ORDER.map((type) => towerButtonMarkup(type)).join("")}
        </div>
        <div class="tower-action-row">
          <button type="button" class="tower-action tower-action-wave" data-action="wave">
            <span>${actionIconSvg("wave")}</span>
            <strong>出怪</strong>
            <small data-wave-tip>下一波</small>
          </button>
          <button type="button" class="tower-action tower-action-hero" data-action="hero">
            <span>${actionIconSvg("hero")}</span>
            <strong>守卫</strong>
            <small data-hero-tip>Lv.1</small>
          </button>
          <button type="button" class="tower-action" data-action="upgrade">
            <span>${actionIconSvg("upgrade")}</span>
            <strong>升级</strong>
            <small data-upgrade-tip>选中塔</small>
          </button>
          <button type="button" class="tower-action" data-action="target">
            <span>${actionIconSvg("target")}</span>
            <strong>目标</strong>
            <small data-target-tip>选中塔</small>
          </button>
          <button type="button" class="tower-action" data-action="sell">
            <span>${actionIconSvg("sell")}</span>
            <strong>出售</strong>
            <small data-sell-tip>回收</small>
          </button>
          <button type="button" class="tower-action tower-action-tactic" data-action="storm">
            <span>${actionIconSvg("storm")}</span>
            <strong>雷暴</strong>
            <small data-tactic-tip="storm">就绪</small>
          </button>
          <button type="button" class="tower-action tower-action-tactic" data-action="barricade">
            <span>${actionIconSvg("barricade")}</span>
            <strong>路障</strong>
            <small data-tactic-tip="barricade">就绪</small>
          </button>
        </div>
      </div>
      <section class="tower-confirm" data-confirm-panel hidden>
        <strong data-confirm-title>确认操作</strong>
        <p data-confirm-detail></p>
        <div class="tower-confirm-actions">
          <button type="button" data-confirm-cancel>取消</button>
          <button type="button" data-confirm-ok>确认</button>
        </div>
      </section>
    </section>
  `;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const status = root.querySelector("[data-status]");
  const note = root.querySelector("[data-note]");
  const level = root.querySelector("[data-level]");
  const wave = root.querySelector("[data-wave]");
  const lives = root.querySelector("[data-lives]");
  const gold = root.querySelector("[data-gold]");
  const score = root.querySelector("[data-score]");
  const towerButtons = [...root.querySelectorAll("[data-tower]")];
  const waveButton = root.querySelector("[data-action='wave']");
  const heroButton = root.querySelector("[data-action='hero']");
  const upgradeButton = root.querySelector("[data-action='upgrade']");
  const targetButton = root.querySelector("[data-action='target']");
  const sellButton = root.querySelector("[data-action='sell']");
  const tacticButtons = Object.fromEntries(TACTIC_ORDER.map((id) => [id, root.querySelector(`[data-action='${id}']`)]));
  const waveTip = root.querySelector("[data-wave-tip]");
  const heroTip = root.querySelector("[data-hero-tip]");
  const upgradeTip = root.querySelector("[data-upgrade-tip]");
  const targetTip = root.querySelector("[data-target-tip]");
  const sellTip = root.querySelector("[data-sell-tip]");
  const tacticTips = Object.fromEntries(TACTIC_ORDER.map((id) => [id, root.querySelector(`[data-tactic-tip='${id}']`)]));
  const confirmPanel = root.querySelector("[data-confirm-panel]");
  const confirmTitle = root.querySelector("[data-confirm-title]");
  const confirmDetail = root.querySelector("[data-confirm-detail]");
  const confirmOk = root.querySelector("[data-confirm-ok]");
  const confirmCancel = root.querySelector("[data-confirm-cancel]");

  function refreshHud() {
    status.textContent = state.message;
    const map = mapForLevel(state.level);
    const selectedTower = state.towers.find((tower) => tower.id === state.selectedTower);
    const targetMode = selectedTower ? TARGET_MODES[selectedTower.targetMode || "first"] : null;
    const selectedText = selectedTower ? `选中 ${TOWER_TYPES[selectedTower.type].label} Lv.${selectedTower.level} · ${targetMode?.label || "前线"}` : `${TOWER_TYPES[state.selectedType].label} ${TOWER_TYPES[state.selectedType].cost} 金币`;
    const waveText = state.waveActive
      ? `场上 ${state.enemies.length + state.queue.length} 敌`
      : `下一波 ${wavePreview(config, state.level, state.wave)}`;
    note.textContent = `${context.labels.difficulty} · ${map.name}/${map.feature} · ${selectedText} · ${waveText}`;
    level.textContent = stageLabel(state);
    wave.textContent = waveLabel(state, WAVES_PER_LEVEL);
    lives.textContent = `核心 ${Math.max(0, state.lives)}`;
    gold.textContent = `金币 ${state.gold}`;
    score.textContent = `分数 ${state.score}`;
    towerButtons.forEach((button) => {
      const def = TOWER_TYPES[button.dataset.tower];
      button.classList.toggle("is-active", button.dataset.tower === state.selectedType);
      button.classList.toggle("is-unavailable", Boolean(def && state.gold < def.cost && button.dataset.tower !== state.selectedType));
    });
    waveButton.disabled = state.over || state.spawning || state.enemies.length > 0;
    waveTip.textContent = state.waveActive ? `场上 ${state.enemies.length}` : wavePreview(config, state.level, state.wave);
    const heroReady = (state.hero?.rallyCooldown || 0) <= 0;
    heroButton.disabled = state.over || !heroReady;
    heroTip.textContent = heroReady ? `Lv.${state.hero?.level || 1}` : `${Math.ceil(state.hero.rallyCooldown)}s`;
    const upgradeCostValue = selectedTower ? upgradeCost(selectedTower) : 0;
    upgradeButton.disabled = !selectedTower || selectedTower.level >= TOWER_MAX_LEVEL || state.gold < upgradeCostValue;
    upgradeTip.textContent = selectedTower
      ? (selectedTower.level >= TOWER_MAX_LEVEL ? "满级" : `${upgradeCostValue} 金币`)
      : "选中塔";
    targetButton.disabled = !selectedTower;
    targetTip.textContent = selectedTower ? (targetMode?.label || "前线") : "选中塔";
    sellButton.disabled = !selectedTower;
    sellTip.textContent = selectedTower ? `+${Math.max(20, Math.round(towerInvestment(selectedTower) * 0.62))}` : "回收";
    TACTIC_ORDER.forEach((id) => {
      const button = tacticButtons[id];
      const tip = tacticTips[id];
      const ready = tacticReady(state, id);
      const hasTargets = state.enemies.some((enemy) => !enemy.defeated);
      if (button) {
        button.disabled = state.over || !ready || !hasTargets;
        button.style.setProperty("--tactic-color", TACTICS[id].color);
      }
      if (tip) tip.textContent = hasTargets ? tacticCooldownText(state, id) : "待敌";
    });
    if (confirmPanel) {
      const pending = state.pendingAction;
      confirmPanel.hidden = !pending;
      if (pending) {
        confirmTitle.textContent = pending.title || "确认操作";
        confirmDetail.textContent = pending.detail || "确认后会立即执行。";
        confirmOk.textContent = pending.confirmLabel || "确认";
      }
    }
  }

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H
    };
  }

  const loop = createArcadeLoop({
    context,
    timeScale: () => feedbackTimeScale(state),
    update: (dt, rawDt) => update(state, config, dt, context, rawDt),
    draw: () => {
      draw(state, ctx);
      refreshHud();
    },
    save: () => {
      if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    }
  });

  function restart() {
    state = initialState(config);
    context.clearSession?.();
    loop.resetClock();
  }

  function onPointerDown(event) {
    event.preventDefault();
    buildTower(state, cellAt(toCanvasPoint(event)));
  }

  function handleKeyAction(action) {
    if (TOWER_TYPES[action]) {
      clearPendingAction(state);
      state.selectedType = action;
      state.message = `选择${TOWER_TYPES[state.selectedType].label}`;
    } else if (action === "wave") {
      startWave(state, config);
    } else if (action === "hero") {
      rallyHero(state);
    } else if (action === "upgrade") {
      upgradeSelectedTower(state);
    } else if (action === "target") {
      cycleSelectedTowerTarget(state);
    } else if (action === "sell") {
      sellSelectedTower(state);
    } else if (TACTICS[action]) {
      castTactic(state, action);
    } else if (action === "confirm") {
      confirmPendingAction(state);
    } else if (action === "cancel") {
      clearPendingAction(state);
      state.message = "已取消操作";
    } else if (action === "restart") {
      restart();
    }
  }

  towerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      clearPendingAction(state);
      state.selectedType = button.dataset.tower;
      state.message = `选择${TOWER_TYPES[state.selectedType].label}`;
    });
  });
  confirmOk.addEventListener("click", () => confirmPendingAction(state));
  confirmCancel.addEventListener("click", () => {
    clearPendingAction(state);
    state.message = "已取消操作";
  });
  root.querySelector("[data-action='hero']").addEventListener("click", () => rallyHero(state));
  root.querySelector("[data-action='upgrade']").addEventListener("click", () => upgradeSelectedTower(state));
  root.querySelector("[data-action='target']").addEventListener("click", () => cycleSelectedTowerTarget(state));
  root.querySelector("[data-action='wave']").addEventListener("click", () => startWave(state, config));
  root.querySelector("[data-action='sell']").addEventListener("click", () => sellSelectedTower(state));
  TACTIC_ORDER.forEach((id) => {
    root.querySelector(`[data-action='${id}']`)?.addEventListener("click", () => castTactic(state, id));
  });
  const cleanupKeys = bindActionKeys({
    Digit1: "arrow",
    Digit2: "cannon",
    Digit3: "frost",
    Digit4: "spark",
    Digit5: "venom",
    Digit6: "mortar",
    Space: "wave",
    KeyE: "hero",
    KeyU: "upgrade",
    KeyT: "target",
    KeyX: "sell",
    KeyQ: "storm",
    KeyW: "barricade",
    Enter: "confirm",
    Escape: "cancel",
    KeyR: "restart"
  }, handleKeyAction);
  const cleanupShellRestart = bindShellRestart(root, context, restart);
  root.querySelector("[data-action='restart']")?.addEventListener("click", restart);
  canvas.addEventListener("pointerdown", onPointerDown);
  loop.start();

  return () => {
    if (!state.over) context.saveSession?.(serializeState(state), sessionMeta(state));
    loop.stop();
    cleanupKeys();
    cleanupShellRestart();
    canvas.removeEventListener("pointerdown", onPointerDown);
  };
}
