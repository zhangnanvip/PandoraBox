import { DIRECTION_KEY_MAP, bindDigitalKeys } from "../arcade/controls.js";
import { clamp, distance } from "../arcade/collision.js";
import { addBolt, addBurst, addFloatingText, drawEffects, shakeOffset, updateEffects } from "../arcade/effects.js";
import { feedbackTimeScale, triggerHitStop, updateFeedback } from "../arcade/feedback.js";
import { bindShellRestart, createArcadeLoop } from "../arcade/engine.js";
import { classicArcade } from "../arcade/classic-visuals.js";
import { loadState, removeState, saveState } from "../../utils/storage.js";

const W = 360;
const H = 568;
const WORLD = 1180;
const MAX_LEVEL = 60;
const BOSS_INTERVAL = 5;
const SAVE_KEY = "survivor:campaign";
const META_KEY = "survivor:meta";

const CHAPTERS = [
  {
    id: "rain-opera",
    title: "雨夜戏台",
    short: "戏台",
    start: 1,
    end: 10,
    motif: "纸伞、旧戏腔和雨夜招魂",
    enemyBias: { crawler: 1.18, bat: 1.12, swarmer: 1.2, brute: 1.08, bomber: 1.18, sniper: 1.08 },
    eventBias: { horde: 1.3, rush: 1.12, volatile: 1.18, siege: 1.1 },
    dangerBias: { meteor: 1.15, rift: 1.05 },
    modifierBias: { supplyTide: 1.12, bloodMoon: 1.08 },
    skillBias: ["aura", "knife", "lightning"],
    stages: ["巷口魂灯", "纸伞回廊", "空台锣声", "骨奴后台", "尸火压场", "雨棚纸人", "残票鬼市", "戏箱裂隙", "红伞合围", "戏台封夜"]
  },
  {
    id: "paper-alley",
    title: "纸人长巷",
    short: "纸巷",
    start: 11,
    end: 20,
    motif: "纸扎铺、夜叉巡街和白纸伏兵",
    enemyBias: { swarmer: 1.35, charger: 1.4, bat: 1.12, shield: 1.16, brute: 1.08 },
    eventBias: { rush: 1.2, horde: 1.15, ambush: 1.45, volatile: 1.08 },
    dangerBias: { rift: 1.2, meteor: 1.05 },
    modifierBias: { voidVeil: 1.16, staticStorm: 1.08 },
    skillBias: ["frost", "orbit", "aura"],
    stages: ["白纸门楣", "折巷夜叉", "纸马奔街", "无头巡更", "鬼新娘迎亲", "灯笼回潮", "剪影伏兵", "纸桥断面", "骨伞巡游", "长巷镇魂"]
  },
  {
    id: "ghost-market",
    title: "鬼市高架",
    short: "鬼市",
    start: 21,
    end: 30,
    motif: "高架桥、鬼市摊位和缝尸匠",
    enemyBias: { warden: 1.45, spitter: 1.24, bomber: 1.18, shield: 1.2, elite: 1.08 },
    eventBias: { armored: 1.32, siege: 1.28, volatile: 1.12, void: 1.1 },
    dangerBias: { acid: 1.35, rift: 1.18, laser: 1.08 },
    modifierBias: { sporeBloom: 1.28, supplyTide: 1.15, bloodMoon: 1.12 },
    skillBias: ["knife", "drone", "armor"],
    stages: ["高架摊火", "缝尸铺口", "铜钱雨棚", "裂隙货箱", "黑伞夜巡", "血月叫卖", "毒灯摊位", "纸契迷阵", "鬼债合围", "高架封市"]
  },
  {
    id: "metro-gate",
    title: "地铁夜门",
    short: "夜门",
    start: 31,
    end: 40,
    motif: "末班地铁、扫射光束和夜门精英",
    enemyBias: { sniper: 1.42, elite: 1.28, spitter: 1.22, charger: 1.18, shield: 1.12 },
    eventBias: { siege: 1.35, void: 1.35, ambush: 1.18, spitters: 1.18 },
    dangerBias: { laser: 1.55, rift: 1.22, acid: 1.08 },
    modifierBias: { staticStorm: 1.22, voidVeil: 1.32 },
    skillBias: ["speed", "drone", "frost"],
    stages: ["末班空站", "站台灯影", "扶梯裂口", "隧道回音", "百目审判", "车厢纸海", "轨道陨火", "换乘迷门", "夜门精英", "地铁封门"]
  },
  {
    id: "hundred-eye-tower",
    title: "百目写字楼",
    short: "百目",
    start: 41,
    end: 50,
    motif: "写字楼、镜面鬼眼和审判符阵",
    enemyBias: { elite: 1.48, sniper: 1.32, shield: 1.24, warden: 1.22, spitter: 1.12 },
    eventBias: { void: 1.48, siege: 1.36, armored: 1.22, spitters: 1.12 },
    dangerBias: { laser: 1.38, acid: 1.18, rift: 1.18 },
    modifierBias: { bloodMoon: 1.24, voidVeil: 1.28, staticStorm: 1.12 },
    skillBias: ["focus", "lightning", "armor"],
    stages: ["前台残灯", "电梯鬼影", "会议室眼", "档案腐蚀", "百目判官", "楼层错位", "镜墙弹幕", "天台招魂", "审判回廊", "百目封楼"]
  },
  {
    id: "mobox-core",
    title: "魔盒深层",
    short: "魔盒",
    start: 51,
    end: 60,
    motif: "万象魔盒、恶念回潮和终夜封印",
    enemyBias: { elite: 1.55, charger: 1.28, sniper: 1.26, warden: 1.24, bomber: 1.22, shield: 1.2 },
    eventBias: { void: 1.55, ambush: 1.28, siege: 1.24, armored: 1.18, volatile: 1.16 },
    dangerBias: { rift: 1.45, laser: 1.28, meteor: 1.2, acid: 1.16 },
    modifierBias: { voidVeil: 1.42, bloodMoon: 1.34, staticStorm: 1.16, sporeBloom: 1.14 },
    skillBias: ["focus", "vitality", "lightning"],
    stages: ["匣门初开", "万象残片", "魂火倒流", "鬼王回廊", "百鬼总潮", "执念迷宫", "血月匣心", "终夜审判", "魔盒裂界", "百鬼归匣"]
  }
];

const STAGE_PROFILES = [
  { id: "opening", title: "开卷", icon: "卷", objectiveBias: { crate: 1.3, crystal: 1.2 }, eventRate: 0.9, hazardRate: 0.88, eliteBonus: -0.01, spawn: 1.04, progress: 0.96, reward: 1, skillBias: ["magnet", "aura"] },
  { id: "swarm", title: "合围", icon: "围", objectiveBias: { shrine: 1.16, crate: 1.08 }, eventBias: { horde: 1.35, rush: 1.18 }, enemyBias: { crawler: 1.16, swarmer: 1.16, bat: 1.08 }, eventRate: 1.12, hazardRate: 0.96, spawn: 0.94, progress: 1.02, reward: 1.02, skillBias: ["aura", "orbit"] },
  { id: "ambush", title: "伏击", icon: "伏", objectiveBias: { crystal: 1.16, crate: 1.1 }, eventBias: { ambush: 1.42, rush: 1.24 }, enemyBias: { charger: 1.18, bomber: 1.14, bat: 1.1 }, eventRate: 1.24, hazardRate: 1.02, spawn: 0.9, progress: 1.04, reward: 1.04, skillBias: ["speed", "frost"] },
  { id: "objective", title: "镇物", icon: "镇", objectiveBias: { shrine: 1.35, beacon: 1.26, riftSeal: 1.18 }, eventBias: { armored: 1.16, spitters: 1.12 }, eventRate: 1.02, hazardRate: 1.1, spawn: 1, progress: 1.06, reward: 1.08, skillBias: ["armor", "frost"] },
  { id: "boss", title: "鬼王", icon: "王", objectiveBias: { shrine: 1.22, riftSeal: 1.18 }, eventBias: { volatile: 1.18, armored: 1.16, void: 1.12 }, enemyBias: { elite: 1.12, shield: 1.1 }, eventRate: 1.16, hazardRate: 1.12, eliteBonus: 0.025, spawn: 0.92, progress: 1.12, reward: 1.16, skillBias: ["focus", "vitality", "lightning"], boss: true },
  { id: "rebuild", title: "整备", icon: "备", objectiveBias: { crate: 1.28, crystal: 1.18, beacon: 1.08 }, eventRate: 0.92, hazardRate: 0.92, spawn: 1.06, progress: 0.98, reward: 1.06, skillBias: ["magnet", "greed"] },
  { id: "mixed", title: "混潮", icon: "混", objectiveBias: { beacon: 1.18, shrine: 1.12 }, eventBias: { spitters: 1.18, horde: 1.16, siege: 1.1 }, enemyBias: { spitter: 1.14, bomber: 1.12, warden: 1.08 }, eventRate: 1.16, hazardRate: 1.08, spawn: 0.92, progress: 1.06, reward: 1.08, skillBias: ["drone", "knife"] },
  { id: "rift", title: "裂隙", icon: "隙", objectiveBias: { riftSeal: 1.55, beacon: 1.16 }, eventBias: { void: 1.4, ambush: 1.18 }, dangerBias: { rift: 1.45, laser: 1.12 }, enemyBias: { elite: 1.12, charger: 1.12 }, eventRate: 1.24, hazardRate: 1.24, spawn: 0.9, progress: 1.1, reward: 1.12, skillBias: ["mine", "aura"] },
  { id: "pressure", title: "压境", icon: "压", objectiveBias: { beacon: 1.2, shrine: 1.12 }, eventBias: { siege: 1.28, volatile: 1.18, armored: 1.16 }, enemyBias: { shield: 1.14, sniper: 1.12, bomber: 1.12 }, eventRate: 1.34, hazardRate: 1.22, eliteBonus: 0.025, spawn: 0.86, progress: 1.12, reward: 1.14, skillBias: ["focus", "armor"] },
  { id: "seal", title: "封夜", icon: "封", objectiveBias: { riftSeal: 1.34, shrine: 1.24, beacon: 1.12 }, eventBias: { void: 1.32, siege: 1.24, armored: 1.18 }, dangerBias: { rift: 1.22, meteor: 1.14, laser: 1.12 }, enemyBias: { elite: 1.16, warden: 1.12, charger: 1.1 }, eventRate: 1.28, hazardRate: 1.24, eliteBonus: 0.035, spawn: 0.84, progress: 1.16, reward: 1.18, skillBias: ["focus", "vitality", "lightning"], boss: true }
];

const STAGE_PHASES = [
  {
    id: "intro",
    title: "初段试探",
    short: "初段",
    icon: "初",
    threshold: 0,
    spawn: 1.08,
    eventRate: 0.78,
    hazardRate: 0.78,
    eliteBonus: -0.012,
    enemyBias: { crawler: 1.18, bat: 1.08, swarmer: 1.06 },
    eventBias: { rush: 1.14, horde: 1.06 },
    dangerBias: { meteor: 0.92, acid: 0.96 },
    skillBias: ["magnet", "aura", "knife"]
  },
  {
    id: "mid",
    title: "混战展开",
    short: "混战",
    icon: "混",
    threshold: 0.3,
    spawn: 0.96,
    eventRate: 1.04,
    hazardRate: 1,
    eliteBonus: 0.006,
    enemyBias: { brute: 1.08, spitter: 1.12, bomber: 1.08, charger: 1.08 },
    eventBias: { horde: 1.08, spitters: 1.14, volatile: 1.08 },
    dangerBias: { acid: 1.1, rift: 1.06 },
    skillBias: ["frost", "orbit", "drone"]
  },
  {
    id: "late",
    title: "终段压迫",
    short: "终压",
    icon: "压",
    threshold: 0.7,
    spawn: 0.82,
    eventRate: 1.22,
    hazardRate: 1.18,
    eliteBonus: 0.026,
    mutationBonus: 0.02,
    burstBonus: 1,
    enemyBias: { shield: 1.16, warden: 1.1, sniper: 1.08, bomber: 1.12, elite: 1.16 },
    eventBias: { armored: 1.18, siege: 1.14, ambush: 1.12, void: 1.1, volatile: 1.08 },
    dangerBias: { laser: 1.16, rift: 1.14, meteor: 1.1 },
    skillBias: ["focus", "armor", "lightning"]
  },
  {
    id: "bossReady",
    title: "鬼王临门",
    short: "临门",
    icon: "临",
    threshold: 0.72,
    bossPreview: true,
    spawn: 0.76,
    eventRate: 1.32,
    hazardRate: 1.24,
    eliteBonus: 0.038,
    mutationBonus: 0.03,
    burstBonus: 1,
    enemyBias: { elite: 1.24, shield: 1.14, warden: 1.12, charger: 1.12 },
    eventBias: { void: 1.34, armored: 1.22, siege: 1.16, volatile: 1.12 },
    dangerBias: { rift: 1.24, laser: 1.18, meteor: 1.16 },
    skillBias: ["focus", "vitality", "lightning"]
  },
  {
    id: "boss",
    title: "鬼王交锋",
    short: "鬼王",
    icon: "王",
    bossFight: true,
    spawn: 1.34,
    eventRate: 0.35,
    hazardRate: 0.96,
    eliteBonus: 0,
    enemyBias: { swarmer: 1.12, bat: 1.1, crawler: 1.08 },
    dangerBias: { rift: 1.12, laser: 1.08 },
    skillBias: ["vitality", "armor", "focus"]
  }
];

const ENEMIES = {
  crawler: { title: "游魂", family: "魂", weakness: "灵", unlock: 1, hp: 12, speed: 38, damage: 7, xp: 3, score: 18, radius: 10, color: "#ff7a7a", weight: 8 },
  bat: { title: "灯笼鬼", family: "火", weakness: "雷", unlock: 2, hp: 8, speed: 68, damage: 5, xp: 3, score: 16, radius: 8, color: "#7bd4ff", weight: 5 },
  swarmer: { title: "纸人", family: "纸", weakness: "火", unlock: 3, hp: 6, speed: 92, damage: 4, xp: 2, score: 12, radius: 6, color: "#a6ffcb", weight: 7 },
  brute: { title: "骨奴", family: "骨", weakness: "破甲", unlock: 4, hp: 42, speed: 28, damage: 13, xp: 8, score: 55, radius: 15, color: "#ffb84d", weight: 3 },
  spitter: { title: "毒灯鬼", family: "咒", weakness: "雷", unlock: 7, hp: 24, speed: 34, damage: 9, xp: 7, score: 44, radius: 12, color: "#8ce8bd", weight: 3 },
  bomber: { title: "红伞妖", family: "爆", weakness: "远程", unlock: 9, hp: 30, speed: 44, damage: 18, xp: 10, score: 74, radius: 13, color: "#ff6b2c", weight: 2.4 },
  charger: { title: "夜叉", family: "突", weakness: "减速", unlock: 11, hp: 34, speed: 78, damage: 15, xp: 9, score: 60, radius: 12, color: "#ff4d8d", weight: 2.5 },
  shield: { title: "无头将", family: "甲", weakness: "背袭", unlock: 17, hp: 72, speed: 30, damage: 16, xp: 14, score: 90, radius: 16, color: "#f8fbff", weight: 1.8 },
  warden: { title: "缝尸匠", family: "愈", weakness: "集火", unlock: 21, hp: 64, speed: 26, damage: 12, xp: 18, score: 125, radius: 16, color: "#ffd166", weight: 1.5 },
  sniper: { title: "戏伶鬼", family: "音", weakness: "贴近", unlock: 28, hp: 46, speed: 24, damage: 14, xp: 16, score: 132, radius: 14, color: "#9fb7ff", weight: 1.25 },
  elite: { title: "画皮鬼", family: "异", weakness: "爆发", unlock: 25, hp: 120, speed: 42, damage: 22, xp: 26, score: 160, radius: 18, color: "#d45cff", weight: 1.2 }
};

const COUNTER_TIPS = {
  crawler: "保持走位，用朱砂符阵清密集游魂",
  bat: "灯笼鬼速度快，惊雷符和减速更稳",
  swarmer: "纸人成群时优先拿范围匣术",
  brute: "骨奴血厚，靠进化飞刃或雷符破阵",
  spitter: "毒灯鬼会远程，横向移动别直线逃",
  bomber: "红伞妖发亮后立刻拉开距离",
  charger: "夜叉冲锋前会预警，侧向闪避",
  shield: "无头将正面硬，绕开或用雷符压制",
  warden: "缝尸匠会治疗，优先集火打断鬼潮续航",
  sniper: "戏伶鬼远程强，贴近或用飞刃点杀",
  elite: "画皮鬼血厚，留过载和进化匣术爆发",
  meteor: "看到红圈先离开落点",
  acid: "腐蚀区会持续伤害，别在圈里贪输出",
  rift: "夜门裂隙会增援，尽快离开并清小怪",
  laser: "扫射光束要横向躲，别沿光束方向跑"
};

const COUNTER_SKILLS = {
  crawler: "朱砂符阵 / 护身铜轮",
  bat: "惊雷符 / 青灯寒咒",
  swarmer: "朱砂符阵 / 地煞雷符",
  brute: "镇魂飞刃进化 / 惊雷符",
  spitter: "镇魂飞刃 / 纸人傀儡",
  bomber: "青灯寒咒 / 远程飞刃",
  charger: "青灯寒咒 / 护身铜轮",
  shield: "惊雷符 / 地煞雷符",
  warden: "镇魂飞刃 / 过载爆发",
  sniper: "纸人傀儡 / 镇魂飞刃",
  elite: "进化匣术 / 过载",
  meteor: "疾步符 / 护命符",
  acid: "疾步符 / 护身甲符",
  rift: "朱砂符阵 / 地煞雷符",
  laser: "疾步符 / 青灯寒咒"
};

const COUNTER_SKILL_IDS = {
  crawler: ["aura", "orbit"],
  bat: ["lightning", "frost"],
  swarmer: ["aura", "mine"],
  brute: ["knife", "lightning", "focus"],
  spitter: ["knife", "drone", "speed"],
  bomber: ["frost", "knife", "speed"],
  charger: ["frost", "orbit", "speed"],
  shield: ["lightning", "mine", "focus"],
  warden: ["knife", "focus", "drone"],
  sniper: ["drone", "knife", "speed"],
  elite: ["focus", "vitality", "armor"],
  meteor: ["speed", "vitality"],
  acid: ["speed", "armor", "vitality"],
  rift: ["aura", "mine", "frost"],
  laser: ["speed", "frost"]
};

const WAVE_EVENT_SKILL_IDS = {
  rush: ["frost", "orbit", "speed"],
  horde: ["aura", "mine", "orbit"],
  spitters: ["knife", "drone", "speed"],
  volatile: ["frost", "knife", "vitality"],
  armored: ["lightning", "focus", "mine"],
  siege: ["knife", "drone", "focus"],
  ambush: ["frost", "orbit", "speed"],
  void: ["focus", "lightning", "vitality"]
};

const MODIFIER_SKILL_IDS = {
  supplyTide: ["magnet", "aura", "mine"],
  staticStorm: ["speed", "frost", "lightning"],
  sporeBloom: ["focus", "knife", "armor"],
  voidVeil: ["mine", "aura", "vitality"],
  bloodMoon: ["focus", "vitality", "armor"]
};

const OBJECTIVE_SKILL_IDS = {
  crate: ["knife", "focus", "speed"],
  crystal: ["speed", "magnet", "orbit"],
  shrine: ["aura", "orbit", "vitality"],
  beacon: ["frost", "orbit", "armor"],
  riftSeal: ["mine", "aura", "frost"]
};

const RELIC_SKILL_AFFINITY = {
  bladePact: ["knife", "lightning", "drone", "focus"],
  quickCore: ["focus", "lightning", "aura", "frost"],
  hunterMark: ["focus", "knife", "lightning"],
  bloodGem: ["vitality", "armor", "focus"],
  stormBattery: ["lightning", "focus"],
  fieldCrown: ["magnet", "greed", "speed"],
  aegisCharm: ["armor", "vitality", "speed"]
};

const RARITIES = {
  common: { label: "普通", color: "#8ce8bd", levels: 1, score: 0 },
  rare: { label: "稀有", color: "#7bd4ff", levels: 1, score: 80 },
  epic: { label: "史诗", color: "#d45cff", levels: 2, score: 180 },
  evolve: { label: "进化", color: "#ffd166", levels: 1, score: 320 }
};

const CHARACTERS = [
  {
    id: "ranger",
    title: "沈灯",
    icon: "灯",
    color: "#38d27c",
    desc: "镇鬼司后裔，镇魂飞刃起手",
    skills: { knife: 1 },
    hp: 0,
    speed: 8,
    damage: 1.04,
    cooldown: 0.98,
    xpBonus: 0.08,
    coinBonus: 0,
    ability: { id: "shadowVolley", title: "影刃齐射", icon: "影", cooldown: 7.2, color: "#38d27c" }
  },
  {
    id: "engineer",
    title: "陆青岚",
    icon: "机",
    color: "#ffd166",
    desc: "机关术传人，傀儡与资源收益",
    skills: { knife: 1, orbit: 1, magnet: 1 },
    hp: 10,
    speed: -2,
    damage: 0.98,
    cooldown: 1,
    objectDamage: 1.35,
    coinBonus: 0.18,
    ability: { id: "sentry", title: "机关哨戒", icon: "哨", cooldown: 9.2, color: "#ffd166" }
  },
  {
    id: "arcanist",
    title: "白烬",
    icon: "烬",
    color: "#7bd4ff",
    desc: "半鬼幸存者，鬼火咒术爆发",
    skills: { knife: 1, aura: 1, lightning: 1 },
    hp: -8,
    speed: 0,
    damage: 1.12,
    cooldown: 0.9,
    xpBonus: 0,
    coinBonus: 0.04,
    ability: { id: "vortex", title: "星涡牵引", icon: "涡", cooldown: 8.4, color: "#7bd4ff" }
  }
];

const CHARACTER_BY_ID = new Map(CHARACTERS.map((character) => [character.id, character]));

const UPGRADES = [
  { id: "knife", title: "镇魂飞刃", icon: "刃", desc: "提高飞刃数量与镇魂伤害", max: 6, tag: "匣术" },
  { id: "aura", title: "朱砂符阵", icon: "符", desc: "近身符阵持续灼烧百鬼", max: 5, tag: "匣术" },
  { id: "orbit", title: "护身铜轮", icon: "轮", desc: "铜轮环绕并击退贴身妖鬼", max: 5, tag: "匣术" },
  { id: "lightning", title: "惊雷符", icon: "雷", desc: "定时引雷打击多名敌人", max: 5, tag: "匣术" },
  { id: "drone", title: "纸人傀儡", icon: "纸", desc: "召唤纸人傀儡自动扫射", max: 5, tag: "匣术" },
  { id: "mine", title: "地煞雷符", icon: "雷", desc: "周期布设雷符，敌人靠近后爆开", max: 5, tag: "匣术" },
  { id: "frost", title: "青灯寒咒", icon: "灯", desc: "周期释放寒咒，减速周围百鬼", max: 5, tag: "匣术" },
  { id: "speed", title: "疾步符", icon: "疾", desc: "提升移动速度与魂火拾取距离", max: 4, tag: "符牌" },
  { id: "vitality", title: "护命符", icon: "命", desc: "提升生命上限并回复", max: 4, tag: "符牌" },
  { id: "magnet", title: "招魂幡", icon: "幡", desc: "扩大魂火与补给牵引范围", max: 4, tag: "符牌" },
  { id: "focus", title: "镇念诀", icon: "诀", desc: "提升匣术伤害并缩短冷却", max: 4, tag: "符牌" },
  { id: "armor", title: "护身甲符", icon: "甲", desc: "降低受到的伤害", max: 4, tag: "符牌" },
  { id: "greed", title: "铜钱袋", icon: "钱", desc: "提高铜钱与地图奖励收益", max: 4, tag: "符牌" }
];

const UPGRADE_ARCHETYPES = {
  knife: { school: "飞刃流", role: "穿透点杀", counters: "戏伶鬼 / 缝尸匠" },
  aura: { school: "符阵流", role: "近身清潮", counters: "游魂 / 纸人" },
  orbit: { school: "护身流", role: "贴身防线", counters: "夜叉 / 灯笼鬼" },
  lightning: { school: "雷法流", role: "点名控场", counters: "灯笼鬼 / 无头将" },
  drone: { school: "傀儡流", role: "多线补刀", counters: "毒灯鬼 / 戏伶鬼" },
  mine: { school: "地煞流", role: "陷阱爆发", counters: "纸人 / 裂隙增援" },
  frost: { school: "青灯流", role: "减速保命", counters: "夜叉 / 红伞妖" },
  speed: { school: "身法", role: "走位容错", counters: "陨火 / 扫射" },
  vitality: { school: "生存", role: "血量续航", counters: "爆裂 / Boss" },
  magnet: { school: "招魂", role: "经验成型", counters: "快节奏关卡" },
  focus: { school: "镇念", role: "伤害冷却", counters: "鬼王 / 精英" },
  armor: { school: "护身", role: "承伤减免", counters: "腐蚀 / 近身" },
  greed: { school: "鬼市", role: "局外收益", counters: "长期养成" }
};

const UPGRADE_BY_ID = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

const EVOLUTIONS = [
  {
    id: "crescent",
    base: "knife",
    requires: { magnet: 2 },
    title: "千刃镇魂阵",
    icon: "月",
    desc: "镇魂飞刃化为穿透刃阵，贴近目标后继续撕裂鬼潮"
  },
  {
    id: "plagueAura",
    base: "aura",
    requires: { vitality: 2 },
    title: "血月护身咒",
    icon: "蚀",
    desc: "朱砂符阵留下血月咒火，击破敌人时扩散咒爆"
  },
  {
    id: "sawHalo",
    base: "orbit",
    requires: { vitality: 1 },
    title: "百鬼切轮",
    icon: "锯",
    desc: "护身铜轮化为高速切轮，击退更强并能削掉弹幕"
  },
  {
    id: "stormChain",
    base: "lightning",
    requires: { speed: 2 },
    title: "天罚雷箓",
    icon: "暴",
    desc: "惊雷符命中更多目标，并短暂镇住被击中的敌人"
  },
  {
    id: "droneHive",
    base: "drone",
    requires: { focus: 2 },
    title: "百纸夜军",
    icon: "巢",
    desc: "纸人傀儡化为夜军阵列，持续扫射多个方向"
  },
  {
    id: "seismicMine",
    base: "mine",
    requires: { armor: 2 },
    title: "地煞镇魂阵",
    icon: "震",
    desc: "雷符爆开后产生镇魂震荡，持续撕裂周围鬼潮"
  },
  {
    id: "iceNova",
    base: "frost",
    requires: { magnet: 2 },
    title: "青灯冰狱",
    icon: "寒",
    desc: "青灯寒咒范围扩大并冻结百鬼，冻结期间承受更多伤害"
  }
];

const EVOLUTION_BY_ID = new Map(EVOLUTIONS.map((evolution) => [evolution.id, evolution]));

const WAVE_EVENTS = [
  { id: "rush", title: "影鬼疾行", unlock: 1, duration: 11, interval: 15, spawnScale: 0.58, burst: 2, weights: { bat: 8, swarmer: 8, charger: 5, crawler: 4 }, color: "#7bd4ff" },
  { id: "horde", title: "百鬼合围", unlock: 3, duration: 13, interval: 17, spawnScale: 0.52, burst: 3, weights: { crawler: 10, swarmer: 8, brute: 4, bomber: 2 }, color: "#8ce8bd" },
  { id: "spitters", title: "灯笼鬼火", unlock: 7, duration: 12, interval: 18, spawnScale: 0.72, burst: 2, weights: { spitter: 9, sniper: 3, shield: 2, crawler: 3 }, color: "#a6ffcb" },
  { id: "volatile", title: "红伞爆潮", unlock: 9, duration: 12, interval: 18, spawnScale: 0.64, burst: 2, eliteChance: 0.08, weights: { bomber: 8, swarmer: 6, charger: 3, crawler: 3 }, color: "#ff6b2c" },
  { id: "armored", title: "骨奴重甲", unlock: 14, duration: 14, interval: 20, spawnScale: 0.82, burst: 2, eliteChance: 0.18, weights: { shield: 8, warden: 4, brute: 6, elite: 2 }, color: "#ffd166" },
  { id: "siege", title: "戏台围城", unlock: 18, duration: 15, interval: 21, spawnScale: 0.72, burst: 2, eliteChance: 0.2, weights: { sniper: 7, shield: 5, spitter: 5, warden: 3, bomber: 3 }, color: "#9fb7ff" },
  { id: "ambush", title: "夜叉猎杀", unlock: 24, duration: 13, interval: 19, spawnScale: 0.48, burst: 3, eliteChance: 0.22, weights: { charger: 8, bat: 6, swarmer: 6, sniper: 4, elite: 3 }, color: "#ff4d8d" },
  { id: "void", title: "夜门精英", unlock: 25, duration: 14, interval: 22, spawnScale: 0.7, burst: 2, eliteChance: 0.28, weights: { elite: 7, sniper: 5, bomber: 4, charger: 5, spitter: 4 }, color: "#d45cff" }
];

const ENEMY_MUTATIONS = [
  { id: "swift", title: "迅捷", mark: "迅", unlock: 12, color: "#7bd4ff", hp: 0.92, speed: 1.24, damage: 1.08, score: 1.16 },
  { id: "plated", title: "硬壳", mark: "甲", unlock: 16, color: "#ffd166", hp: 1.32, speed: 0.88, damage: 1.04, score: 1.22 },
  { id: "venom", title: "毒化", mark: "毒", unlock: 22, color: "#8ce8bd", hp: 1.08, speed: 1.02, damage: 1.22, score: 1.2 },
  { id: "volatile", title: "不稳", mark: "爆", unlock: 28, color: "#ff6b2c", hp: 1.02, speed: 1.05, damage: 1.18, score: 1.26 }
];

const TALENTS = [
  { id: "vitality", title: "生命训练", icon: "命", max: 8, baseCost: 90, stepCost: 70, desc: "开局生命上限 +8" },
  { id: "stride", title: "疾步训练", icon: "疾", max: 8, baseCost: 90, stepCost: 75, desc: "开局移动速度 +4" },
  { id: "magnet", title: "磁场训练", icon: "吸", max: 8, baseCost: 80, stepCost: 65, desc: "拾取牵引范围 +10" },
  { id: "fortune", title: "幸运训练", icon: "运", max: 6, baseCost: 120, stepCost: 95, desc: "稀有卡与地图奖励概率提升" }
];

const OBJECT_TYPES = {
  crate: { title: "镇夜补给", radius: 15, hp: 42, color: "#b8894d", objective: "crate" },
  crystal: { title: "魂火晶", radius: 14, hp: 1, color: "#42f2ff", objective: "crystal" },
  shrine: { title: "镇魂祭坛", radius: 18, hp: 1, color: "#ffd166", objective: "shrine" },
  beacon: { title: "引魂灯", radius: 20, hp: 1, color: "#38d27c", objective: "beacon" },
  riftSeal: { title: "夜门裂隙", radius: 22, hp: 1, color: "#d45cff", objective: "riftSeal" }
};

const OBJECTIVES = [
  { id: "crate", title: "搜刮镇夜补给", verb: "打开镇夜补给", unlock: 1, target: (level) => 3 + Math.min(3, Math.floor(level / 8)), objectType: "crate", reward: 22 },
  { id: "crystal", title: "采集魂火晶", verb: "采集魂火晶", unlock: 1, target: (level) => 2 + Math.min(3, Math.floor(level / 9)), objectType: "crystal", reward: 26 },
  { id: "shrine", title: "点亮镇魂祭坛", verb: "点亮镇魂祭坛", unlock: 1, target: (level) => 1 + Math.min(2, Math.floor(level / 14)), objectType: "shrine", reward: 34 },
  { id: "beacon", title: "护送引魂灯", verb: "完成引魂灯充能", unlock: 8, target: (level) => 1 + Math.min(2, Math.floor(level / 18)), objectType: "beacon", reward: 38 },
  { id: "riftSeal", title: "封印夜门裂隙", verb: "封印夜门裂隙", unlock: 10, target: (level) => 1 + Math.min(2, Math.floor(level / 16)), objectType: "riftSeal", reward: 42 }
];

const STAGE_MODIFIERS = [
  {
    id: "calm",
    title: "稳定战场",
    icon: "稳",
    unlock: 1,
    color: "#7bd4ff",
    desc: "标准怪潮，没有额外环境干扰",
    weight: 2,
    xp: 1,
    coin: 1,
    hp: 1,
    damage: 1,
    hazard: 1,
    spawn: 1,
    elite: 0,
    mutation: 0,
    cooldown: 1
  },
  {
    id: "supplyTide",
    title: "补给潮汐",
    icon: "补",
    unlock: 3,
    color: "#38d27c",
    desc: "补给和经验更多，但怪潮更密",
    weight: 1.15,
    xp: 1.08,
    coin: 1.14,
    hp: 1,
    damage: 1,
    hazard: 1.06,
    spawn: 0.9,
    elite: 0.015,
    mutation: 0,
    cooldown: 1
  },
  {
    id: "staticStorm",
    title: "静电风暴",
    icon: "电",
    unlock: 7,
    color: "#7bd4ff",
    desc: "周期雷击敌群，危险区也更频繁",
    weight: 1,
    xp: 1.02,
    coin: 1.04,
    hp: 1,
    damage: 1.02,
    hazard: 0.84,
    spawn: 1,
    elite: 0.02,
    mutation: 0.015,
    cooldown: 0.96
  },
  {
    id: "sporeBloom",
    title: "孢子温床",
    icon: "孢",
    unlock: 11,
    color: "#8ce8bd",
    desc: "酸雾滋生，敌群更耐打",
    weight: 1,
    xp: 1.04,
    coin: 1.08,
    hp: 1.08,
    damage: 1,
    hazard: 0.9,
    spawn: 0.96,
    elite: 0.025,
    mutation: 0.025,
    cooldown: 1
  },
  {
    id: "voidVeil",
    title: "虚空薄幕",
    icon: "虚",
    unlock: 16,
    color: "#d45cff",
    desc: "裂隙更活跃，变异怪增多",
    weight: 0.95,
    xp: 1.08,
    coin: 1.1,
    hp: 1.05,
    damage: 1.04,
    hazard: 0.78,
    spawn: 0.94,
    elite: 0.04,
    mutation: 0.06,
    cooldown: 0.98
  },
  {
    id: "bloodMoon",
    title: "赤月压境",
    icon: "月",
    unlock: 24,
    color: "#ff4d5e",
    desc: "精英更凶，金币和分数收益更高",
    weight: 0.82,
    xp: 1.05,
    coin: 1.22,
    hp: 1.1,
    damage: 1.1,
    hazard: 0.88,
    spawn: 0.92,
    elite: 0.08,
    mutation: 0.045,
    cooldown: 1
  }
];

const DANGER_EVENTS = {
  meteor: {
    title: "陨火轰击",
    unlock: 1,
    color: "#ff6b2c",
    radius: 46,
    warn: 1.05,
    life: 0.32,
    damage: 18
  },
  acid: {
    title: "腐蚀地带",
    unlock: 2,
    color: "#8ce8bd",
    radius: 42,
    warn: 0.85,
    life: 5.2,
    damage: 7
  },
  rift: {
    title: "裂隙增援",
    unlock: 4,
    color: "#d45cff",
    radius: 38,
    warn: 1.2,
    life: 5.8,
    damage: 5
  },
  laser: {
    title: "扫射光束",
    unlock: 8,
    color: "#7bd4ff",
    radius: 26,
    warn: 1.15,
    life: 2.1,
    damage: 12
  }
};

const ELITE_AFFIXES = [
  { id: "frenzy", title: "狂暴", color: "#ff4d8d", unlock: 4, hp: 1, speed: 1.18, damage: 1.22 },
  { id: "bulwark", title: "重盾", color: "#ffd166", unlock: 6, hp: 1.38, speed: 0.88, damage: 1.05 },
  { id: "split", title: "分裂", color: "#8ce8bd", unlock: 9, hp: 1.08, speed: 1, damage: 1 },
  { id: "leecher", title: "吸血", color: "#d45cff", unlock: 13, hp: 1.16, speed: 1.04, damage: 1.12 }
];

const BOSS_ARCHETYPES = [
  {
    id: "titan",
    title: "尸山鬼王",
    type: "elite",
    unlock: 5,
    color: "#ff4d5e",
    hp: 1.18,
    speed: 1.05,
    damage: 1.12,
    summon: ["charger", "brute", "shield"],
    danger: "meteor",
    intro: "冲锋、震荡弹幕与尸火压场",
    hint: "绕开冲锋，别站在尸火圈里"
  },
  {
    id: "hive",
    title: "鬼新娘",
    type: "elite",
    unlock: 10,
    color: "#d45cff",
    hp: 0.96,
    speed: 1.16,
    damage: 0.96,
    summon: ["swarmer", "bat", "spitter"],
    danger: "rift",
    intro: "红线召唤、高速纸人和包围弹幕",
    hint: "先清纸人，远离红线裂隙"
  },
  {
    id: "artillery",
    title: "黑伞夜君",
    type: "elite",
    unlock: 15,
    color: "#ff6b2c",
    hp: 1.06,
    speed: 0.82,
    damage: 1.2,
    summon: ["bomber", "spitter", "sniper"],
    danger: "laser",
    intro: "雨夜炮击、扫射光束与红伞爆潮",
    hint: "横向躲扫射，预判伞影落点"
  },
  {
    id: "warden",
    title: "百目判官",
    type: "elite",
    unlock: 20,
    color: "#ffd166",
    hp: 1.24,
    speed: 0.72,
    damage: 0.92,
    summon: ["shield", "warden", "brute"],
    danger: "acid",
    intro: "治疗护卫、腐蚀地带与重甲推进",
    hint: "先断护卫，离开审判腐蚀区"
  }
];

const RELICS = [
  {
    id: "bladePact",
    title: "镇魂刃契",
    icon: "刃",
    max: 5,
    desc: "所有匣术伤害提升，适合飞刃、雷符和纸人流派"
  },
  {
    id: "quickCore",
    title: "疾符核心",
    icon: "核",
    max: 5,
    desc: "匣术冷却缩短，让咒法循环更密集"
  },
  {
    id: "hunterMark",
    title: "鬼王猎印",
    icon: "猎",
    max: 4,
    desc: "对鬼王和精英造成额外伤害，并提高鬼王击破收益"
  },
  {
    id: "bloodGem",
    title: "血晶吊坠",
    icon: "血",
    max: 4,
    desc: "击破精英或鬼王后回复生命，后期容错更高"
  },
  {
    id: "stormBattery",
    title: "雷符过载",
    icon: "电",
    max: 4,
    desc: "更快积累过载，并延长过载爆发时间"
  },
  {
    id: "fieldCrown",
    title: "招魂冠冕",
    icon: "冠",
    max: 4,
    desc: "提高魂火获取、拾取范围和稀有强化出现率"
  },
  {
    id: "aegisCharm",
    title: "棱镜护符",
    icon: "盾",
    max: 4,
    desc: "降低受到的伤害，并略微延长受击后的无敌时间"
  }
];

const WEAPON_HIT_EFFECTS = {
  knife: { color: classicArcade.yellow, secondary: classicArcade.white, radius: 8, count: 5 },
  crescent: { color: RARITIES.evolve.color, secondary: classicArcade.yellow, radius: 12, count: 8 },
  drone: { color: classicArcade.cyan, secondary: classicArcade.white, radius: 8, count: 5 },
  hive: { color: "#d45cff", secondary: classicArcade.cyan, radius: 10, count: 7 },
  mine: { color: "#ff6b2c", secondary: classicArcade.yellow, radius: 14, count: 9 },
  seismicMine: { color: RARITIES.evolve.color, secondary: "#ff6b2c", radius: 17, count: 12 },
  lightning: { color: classicArcade.cyan, secondary: classicArcade.white, radius: 11, count: 7 },
  storm: { color: classicArcade.cyan, secondary: RARITIES.evolve.color, radius: 13, count: 9 },
  shadowVolley: { color: "#38d27c", secondary: classicArcade.white, radius: 13, count: 8 },
  sentry: { color: "#ffd166", secondary: classicArcade.cyan, radius: 10, count: 7 },
  vortex: { color: "#7bd4ff", secondary: "#d45cff", radius: 12, count: 8 },
  frost: { color: "#7bd4ff", secondary: classicArcade.white, radius: 10, count: 7 },
  iceNova: { color: "#bff4ff", secondary: "#7bd4ff", radius: 15, count: 10 },
  orbit: { color: classicArcade.blue, secondary: classicArcade.white, radius: 8, count: 5 },
  saw: { color: RARITIES.evolve.color, secondary: classicArcade.red, radius: 11, count: 8 },
  plague: { color: "#8ce8bd", secondary: "#d45cff", radius: 11, count: 8 },
  aura: { color: "#7bd4ff", secondary: "#8ce8bd", radius: 7, count: 4 },
  bomber: { color: "#ff6b2c", secondary: classicArcade.yellow, radius: 13, count: 10 },
  meteor: { color: "#ff6b2c", secondary: classicArcade.yellow, radius: 14, count: 9 },
  bomb: { color: classicArcade.red, secondary: classicArcade.yellow, radius: 16, count: 12 }
};

const SPRITE_SIZE = 96;
const SPRITE_CACHE = new Map();

function defaultMeta() {
  return {
    version: 1,
    coins: 0,
    totalCoins: 0,
    talents: Object.fromEntries(TALENTS.map((talent) => [talent.id, 0]))
  };
}

function normalizeMeta(raw) {
  const base = defaultMeta();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    version: 1,
    coins: Math.max(0, Math.floor(Number(raw.coins) || 0)),
    totalCoins: Math.max(0, Math.floor(Number(raw.totalCoins) || 0)),
    talents: {
      ...base.talents,
      ...(raw.talents && typeof raw.talents === "object" ? raw.talents : {})
    }
  };
}

function loadMeta() {
  return normalizeMeta(loadState(META_KEY, null));
}

function saveMeta(meta) {
  saveState(META_KEY, normalizeMeta(meta));
}

function talentLevel(meta, id) {
  return clamp(Math.floor(Number(meta?.talents?.[id]) || 0), 0, TALENTS.find((talent) => talent.id === id)?.max || 0);
}

function talentCost(meta, talent) {
  const level = talentLevel(meta, talent.id);
  return level >= talent.max ? Infinity : talent.baseCost + talent.stepCost * level + Math.floor(level * level * 18);
}

function metaLuck(state) {
  return (state.talents?.fortune || 0) * 0.018;
}

function characterIdFromOptions(options = {}) {
  return CHARACTER_BY_ID.has(options.character) ? options.character : "ranger";
}

function characterSpec(idOrState) {
  const id = typeof idOrState === "string" ? idOrState : idOrState?.characterId;
  return CHARACTER_BY_ID.get(id) || CHARACTER_BY_ID.get("ranger");
}

function abilitySpec(state) {
  return characterSpec(state).ability || CHARACTER_BY_ID.get("ranger").ability;
}

function startingSkills(character) {
  return {
    knife: 1,
    aura: 0,
    orbit: 0,
    lightning: 0,
    drone: 0,
    mine: 0,
    frost: 0,
    speed: 0,
    vitality: 0,
    magnet: 0,
    focus: 0,
    armor: 0,
    greed: 0,
    ...(character?.skills || {})
  };
}

function damageMultiplier(state) {
  return (characterSpec(state).damage || 1)
    * (1 + skillLevel(state, "focus") * 0.07 + relicLevel(state, "bladePact") * 0.055)
    * (state.overdrive > 0 ? 1.18 : 1);
}

function cooldownMultiplier(state) {
  return Math.max(0.5, (characterSpec(state).cooldown || 1)
    * (1 - skillLevel(state, "focus") * 0.045 - relicLevel(state, "quickCore") * 0.035)
    * stageModifierValue(state, "cooldown", 1)
    * (state.overdrive > 0 ? 0.82 : 1));
}

function coinMultiplier(state) {
  return (1 + (characterSpec(state).coinBonus || 0) + skillLevel(state, "greed") * 0.12) * stageModifierValue(state, "coin", 1);
}

function incomingDamage(state, amount) {
  return Math.max(1, Math.round(amount * Math.max(0.46, 1 - skillLevel(state, "armor") * 0.08 - relicLevel(state, "aegisCharm") * 0.045)));
}

function objectivePressure(state) {
  return 1 + Math.min(5, Math.max(0, state.pressureDebt || 0)) * 0.045;
}

function stageModifierSpec(idOrState) {
  const id = typeof idOrState === "string" ? idOrState : idOrState?.stageModifier?.id;
  return STAGE_MODIFIERS.find((modifier) => modifier.id === id) || STAGE_MODIFIERS[0];
}

function stageModifierValue(state, key, fallback = 1) {
  const modifier = stageModifierSpec(state);
  return Number.isFinite(modifier?.[key]) ? modifier[key] : fallback;
}

function chooseStageModifier(level, previousId = null) {
  const available = STAGE_MODIFIERS.filter((modifier) => level >= modifier.unlock && modifier.id !== previousId);
  const pool = available.length ? available : STAGE_MODIFIERS.filter((modifier) => level >= modifier.unlock);
  return weightedPick(pool, (modifier) => (modifier.weight || 1) * combinedBias(level, "modifierBias", modifier.id)) || pool[0] || STAGE_MODIFIERS[0];
}

function levelTuning(level) {
  const chapter = Math.floor((level - 1) / 10);
  const profile = stageProfileForLevel(level);
  return {
    duration: Math.round((84 + Math.min(64, level * 2.6)) * (profile.duration || 1)),
    spawnEvery: Math.max(0.18, (0.58 - level * 0.01 - chapter * 0.035) * (profile.spawn || 1)),
    spawnBurst: 1 + Math.floor((level + 2) / 6) + (chapter >= 2 ? 1 : 0) + (profile.burstBonus || 0),
    maxEnemies: Math.min(168, 52 + level * 3 + chapter * 10),
    hpScale: 1.12 + level * 0.16 + chapter * 0.3,
    damageScale: 1.05 + level * 0.035 + chapter * 0.09,
    speedScale: 1.02 + level * 0.014,
    hazardEvery: Math.max(4.6, (10.5 - level * 0.12 - chapter * 0.55) / (profile.hazardRate || 1)),
    bossHp: Math.round(380 + level * 72 + chapter * 220),
    bossStage: Boolean(profile.boss)
  };
}

function stageProgressGoal(level) {
  const chapter = Math.floor((level - 1) / 10);
  const profile = stageProfileForLevel(level);
  const bossTax = profile.boss ? 34 + chapter * 10 : 0;
  return Math.round((112 + level * 16 + chapter * 52 + bossTax) * (profile.progress || 1));
}

function stageBossProgressGoal(level) {
  return Math.ceil(stageProgressGoal(level) * 0.72);
}

function stageProgressRatio(state) {
  return clamp((state.stageProgress || 0) / stageProgressGoal(state.level), 0, 1);
}

function stageProgressPercent(state) {
  return Math.floor(stageProgressRatio(state) * 100);
}

function chapterForLevel(level) {
  return CHAPTERS.find((chapter) => level >= chapter.start && level <= chapter.end) || CHAPTERS[CHAPTERS.length - 1];
}

function stageNameForLevel(level) {
  const chapter = chapterForLevel(level);
  const index = clamp(level - chapter.start, 0, chapter.stages.length - 1);
  return chapter.stages[index] || `${chapter.short} ${level}`;
}

function stageDisplayName(level) {
  const chapter = chapterForLevel(level);
  return `${chapter.short} · ${stageNameForLevel(level)}`;
}

function stageIndexInChapter(level) {
  const chapter = chapterForLevel(level);
  return clamp(level - chapter.start, 0, STAGE_PROFILES.length - 1);
}

function stageProfileForLevel(level) {
  return STAGE_PROFILES[stageIndexInChapter(level)] || STAGE_PROFILES[0];
}

function chapterBias(level, group, id) {
  const chapter = chapterForLevel(level);
  return Math.max(0.1, Number(chapter?.[group]?.[id]) || 1);
}

function stageProfileBias(level, group, id) {
  const profile = stageProfileForLevel(level);
  return Math.max(0.1, Number(profile?.[group]?.[id]) || 1);
}

function combinedBias(level, group, id) {
  return chapterBias(level, group, id) * stageProfileBias(level, group, id);
}

function stagePhaseById(id) {
  return STAGE_PHASES.find((phase) => phase.id === id) || STAGE_PHASES[0];
}

function stagePhaseForState(state) {
  if (!state || !Number.isFinite(state.level)) return STAGE_PHASES[0];
  if (state.bossAlive) return stagePhaseById("boss");
  const ratio = stageProgressRatio(state);
  if (levelTuning(state.level).bossStage && ratio >= stageBossProgressGoal(state.level) / stageProgressGoal(state.level)) {
    return stagePhaseById("bossReady");
  }
  if (ratio >= 0.7) return stagePhaseById("late");
  if (ratio >= 0.3) return stagePhaseById("mid");
  return stagePhaseById("intro");
}

function stagePhaseHint(phase) {
  return {
    intro: "低压成型，优先拿核心匣术",
    mid: "混合怪潮，补控制和清线",
    late: "精英压迫，补爆发与生存",
    bossReady: "鬼王将至，留过载并清精英",
    boss: "鬼王机制生效，先活下来再输出"
  }[phase.id] || "怪潮正在变化";
}

function stagePhaseBias(state, group, id) {
  const phase = stagePhaseForState(state);
  return Math.max(0.1, Number(phase?.[group]?.[id]) || 1);
}

function encounterBias(state, group, id) {
  return combinedBias(state.level, group, id) * stagePhaseBias(state, group, id);
}

function stageEventRate(state) {
  return (stageProfileForLevel(state.level).eventRate || 1) * (stagePhaseForState(state).eventRate || 1);
}

function stageSpawnScale(state) {
  return stagePhaseForState(state).spawn || 1;
}

function stageHazardRate(state) {
  return stagePhaseForState(state).hazardRate || 1;
}

function topChapterBiasIds(level, group, count = 3) {
  const chapter = chapterForLevel(level);
  return Object.entries(chapter?.[group] || {})
    .filter(([, weight]) => Number(weight) > 1)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, count)
    .map(([id]) => id);
}

function chapterIntelChips(stateOrLevel) {
  const level = typeof stateOrLevel === "number" ? stateOrLevel : stateOrLevel.level;
  const chapter = chapterForLevel(level);
  const profile = stageProfileForLevel(level);
  const phase = typeof stateOrLevel === "number" ? null : stagePhaseForState(stateOrLevel);
  const enemies = topChapterBiasIds(level, "enemyBias", 3)
    .filter((id) => level >= (ENEMIES[id]?.unlock || 1))
    .map((id) => ENEMIES[id]?.title || id);
  const events = topChapterBiasIds(level, "eventBias", 2)
    .filter((id) => level >= (WAVE_EVENTS.find((event) => event.id === id)?.unlock || 1))
    .map((id) => WAVE_EVENTS.find((event) => event.id === id)?.title || id);
  const dangers = topChapterBiasIds(level, "dangerBias", 2)
    .filter((id) => level >= (DANGER_EVENTS[id]?.unlock || 1))
    .map((id) => DANGER_EVENTS[id]?.title || id);
  const skills = (chapter.skillBias || [])
    .map((id) => UPGRADE_BY_ID.get(id)?.title || id)
    .slice(0, 3);
  return [
    { icon: "章", title: chapter.title, detail: chapter.motif },
    { icon: profile.icon, title: `本关 · ${profile.title}`, detail: profile.boss ? "鬼王节点，优先补爆发与生存" : stageProfileHint(profile) },
    ...(phase ? [{ icon: phase.icon, title: `阶段 · ${phase.short}`, detail: stagePhaseHint(phase) }] : []),
    { icon: "鬼", title: "本章主敌", detail: enemies.length ? enemies.join(" / ") : "游魂 / 纸人" },
    { icon: "术", title: "推荐匣术", detail: skills.join(" / ") },
    { icon: "潮", title: "高发事件", detail: events.length ? events.join(" / ") : "百鬼合围" },
    { icon: "险", title: "危险区", detail: dangers.length ? dangers.join(" / ") : "陨火轰击" }
  ];
}

function stageProfileHint(profile) {
  return {
    opening: "缓启动，优先成型",
    swarm: "小怪合围，范围清潮",
    ambush: "伏击较多，注意走位",
    objective: "镇物目标压力更高",
    rebuild: "整备窗口，补经济和续航",
    mixed: "组合怪潮，补短板",
    rift: "裂隙活跃，优先封门",
    pressure: "高压波，注意精英",
    seal: "章节终局，准备爆发"
  }[profile.id] || "怪潮变化";
}

function defaultProgressSources() {
  return { kills: 0, elites: 0, objectives: 0, bosses: 0, events: 0 };
}

function progressSourceLabel(key) {
  return {
    kills: "击破",
    elites: "精英",
    objectives: "目标",
    bosses: "鬼王",
    events: "事件"
  }[key] || "镇夜";
}

function progressSourceKey(label, fallback = "kills") {
  if (["kills", "elites", "objectives", "bosses", "events"].includes(label)) return label;
  if (label === "目标") return "objectives";
  if (label === "鬼王") return "bosses";
  if (label === "精英") return "elites";
  if (label === "事件") return "events";
  return fallback;
}

function recordProgressSource(state, key, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const safeKey = progressSourceKey(key);
  state.progressSources = {
    ...defaultProgressSources(),
    ...(state.progressSources || {}),
    [safeKey]: (state.progressSources?.[safeKey] || 0) + Math.round(amount)
  };
}

function progressBreakdownEntries(state) {
  return Object.entries({ ...defaultProgressSources(), ...(state.progressSources || {}) })
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1]);
}

function progressBreakdownText(state, limit = 3) {
  const entries = progressBreakdownEntries(state).slice(0, limit);
  if (!entries.length) return "等待镇夜";
  return entries.map(([key, value]) => `${progressSourceLabel(key)} ${Math.round(value)}`).join(" · ");
}

function initialState(meta = loadMeta(), options = {}) {
  const character = characterSpec(characterIdFromOptions(options));
  const talents = { ...defaultMeta().talents, ...(meta?.talents || {}) };
  const maxHp = 100 + (talents.vitality || 0) * 8 + (character.hp || 0);
  return {
    version: 13,
    characterId: character.id,
    level: 1,
    maxLevel: MAX_LEVEL,
    player: {
      x: WORLD / 2,
      y: WORLD / 2,
      hp: maxHp,
      maxHp,
      speed: 116 + (talents.stride || 0) * 4 + (character.speed || 0),
      radius: 12,
      invuln: 1,
      level: 1,
      xp: 0,
      xpNeed: 22
    },
    skills: startingSkills(character),
    evolutions: [],
    relics: {},
    talents,
    enemies: [],
    objects: [],
    dangerZones: [],
    abilityZones: [],
    projectiles: [],
    enemyShots: [],
    pickups: [],
    effects: [],
    controls: { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 },
    spawnTimer: 0.08,
    eventTimer: 3.2,
    eventChain: 0,
    hazardTimer: 2.8,
    activeEvent: null,
    stageModifier: null,
    modifierTimer: 3.2,
    attackTimer: 0,
    droneTimer: 1.4,
    mineTimer: 1.8,
    frostTimer: 2.6,
    lightningTimer: 2.5,
    abilityTimer: 3.4,
    bossSpawned: false,
    bossAlive: false,
    enemyId: 1,
    objectId: 1,
    time: 0,
    score: 0,
    coinsEarned: 0,
    coinsSynced: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    overdrive: 0,
    overdriveCharge: 0,
    stageKills: 0,
    stageProgress: 0,
    progressSources: defaultProgressSources(),
    timePressureApplied: false,
    stageObjective: null,
    objectiveStreak: 0,
    pressureDebt: 0,
    message: "拖动画布移动，匣术会自动镇鬼",
    lastDamageSource: null,
    damageStats: {},
    rerolls: 2 + Math.floor((talents.fortune || 0) / 3),
    choices: [],
    shake: 0,
    over: false,
    won: false
  };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function restoreState(saved, meta = loadMeta(), options = {}) {
  if (!saved || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(saved.version) || saved.over) return initialState(meta, options);
  const base = initialState(meta, { character: saved.characterId || options.character });
  const next = clonePlain(saved);
  return {
    ...base,
    ...next,
    version: 13,
    characterId: CHARACTER_BY_ID.has(next.characterId) ? next.characterId : base.characterId,
    player: { ...base.player, ...(next.player || {}) },
    skills: { ...base.skills, ...(next.skills || {}) },
    evolutions: Array.isArray(next.evolutions) ? next.evolutions : [],
    relics: next.relics && typeof next.relics === "object" ? next.relics : {},
    talents: { ...base.talents, ...(next.talents || {}) },
    objects: Array.isArray(next.objects) ? next.objects : [],
    dangerZones: Array.isArray(next.dangerZones) ? next.dangerZones : [],
    abilityZones: Array.isArray(next.abilityZones) ? next.abilityZones : [],
    coinsEarned: Number.isFinite(next.coinsEarned) ? next.coinsEarned : 0,
    coinsSynced: Number.isFinite(next.coinsSynced) ? next.coinsSynced : Math.max(0, Number(next.coinsEarned) || 0),
    combo: Number.isFinite(next.combo) ? next.combo : 0,
    comboTimer: Number.isFinite(next.comboTimer) ? next.comboTimer : 0,
    overdrive: Number.isFinite(next.overdrive) ? next.overdrive : 0,
    overdriveCharge: Number.isFinite(next.overdriveCharge) ? next.overdriveCharge : 0,
    stageProgress: Number.isFinite(next.stageProgress) ? next.stageProgress : 0,
    progressSources: { ...defaultProgressSources(), ...(next.progressSources || {}) },
    timePressureApplied: Boolean(next.timePressureApplied),
    objectId: Number.isFinite(next.objectId) ? next.objectId : base.objectId,
    stageObjective: next.stageObjective && next.stageObjective.id ? next.stageObjective : null,
    objectiveStreak: Number.isFinite(next.objectiveStreak) ? next.objectiveStreak : 0,
    pressureDebt: Number.isFinite(next.pressureDebt) ? next.pressureDebt : 0,
    lastDamageSource: next.lastDamageSource && typeof next.lastDamageSource === "object" ? next.lastDamageSource : null,
    damageStats: next.damageStats && typeof next.damageStats === "object" ? next.damageStats : {},
    rerolls: Number.isFinite(next.rerolls) ? next.rerolls : base.rerolls,
    eventTimer: Number.isFinite(next.eventTimer) ? next.eventTimer : base.eventTimer,
    eventChain: Number.isFinite(next.eventChain) ? next.eventChain : 0,
    hazardTimer: Number.isFinite(next.hazardTimer) ? next.hazardTimer : base.hazardTimer,
    droneTimer: Number.isFinite(next.droneTimer) ? next.droneTimer : base.droneTimer,
    mineTimer: Number.isFinite(next.mineTimer) ? next.mineTimer : base.mineTimer,
    frostTimer: Number.isFinite(next.frostTimer) ? next.frostTimer : base.frostTimer,
    abilityTimer: Number.isFinite(next.abilityTimer) ? next.abilityTimer : base.abilityTimer,
    activeEvent: next.activeEvent && next.activeEvent.id ? next.activeEvent : null,
    stageModifier: next.stageModifier?.id ? next.stageModifier : null,
    modifierTimer: Number.isFinite(next.modifierTimer) ? next.modifierTimer : base.modifierTimer,
    controls: { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 },
    effects: [],
    choices: [],
    shake: 0,
    over: false,
    won: false
  };
}

function serializeState(state) {
  const snapshot = clonePlain(state);
  snapshot.controls = { up: false, down: false, left: false, right: false, axisX: 0, axisY: 0 };
  snapshot.effects = [];
  snapshot.choices = [];
  snapshot.shake = 0;
  snapshot.over = false;
  snapshot.won = false;
  return snapshot;
}

function sessionMeta(state) {
  const tuning = levelTuning(state.level);
  const character = characterSpec(state);
  const modifier = stageModifierSpec(state);
  const chapter = chapterForLevel(state.level);
  const profile = stageProfileForLevel(state.level);
  const phase = stagePhaseForState(state);
  return {
    level: `${character.title} ${state.level}/${MAX_LEVEL} · ${chapter.title} · ${profile.title} · ${phase.short}`,
    stage: `${stageDisplayName(state.level)} · 镇夜 ${stageProgressPercent(state)}% · ${progressBreakdownText(state, 2)} · ${Math.floor(state.time)}/${tuning.duration}s · ${modifier.title} · 遗物 ${relicCount(state)} · ${objectiveLabel(state)}`,
    score: state.score
  };
}

function worldToScreen(state, x, y) {
  const camera = cameraFor(state);
  return { x: x - camera.x, y: y - camera.y };
}

function cameraFor(state) {
  return {
    x: clamp(state.player.x - W / 2, 0, WORLD - W),
    y: clamp(state.player.y - H / 2, 0, WORLD - H)
  };
}

function enemySpec(type) {
  return ENEMIES[type] || ENEMIES.crawler;
}

function enemyTitle(enemyOrType) {
  if (!enemyOrType) return "百鬼";
  if (typeof enemyOrType === "string") return enemySpec(enemyOrType).title || "百鬼";
  if (enemyOrType.boss) return enemyOrType.bossTitle || bossSpec(enemyOrType).title || "鬼王";
  const base = enemyOrType.title || enemySpec(enemyOrType.type).title || "百鬼";
  const affix = affixSpec(enemyOrType.affix)?.title;
  const mutation = mutationSpec(enemyOrType.mutation)?.title;
  return [affix, mutation, base].filter(Boolean).join("·");
}

function recordDamageSource(state, source) {
  if (!source) return;
  const amount = Math.max(0, Number(source.amount ?? source.raw) || 0);
  state.lastDamageSource = {
    ...source,
    amount,
    time: state.time,
    level: state.level,
    hp: Math.max(0, Math.ceil(state.player.hp))
  };
  if (amount > 0) {
    const key = damageStatKey(source);
    const current = state.damageStats?.[key] || {
      key,
      kind: source.kind,
      sourceType: source.sourceType,
      name: source.name || "未知伤害",
      total: 0,
      hits: 0
    };
    state.damageStats = {
      ...(state.damageStats || {}),
      [key]: {
        ...current,
        name: source.name || current.name,
        total: current.total + amount,
        hits: current.hits + 1
      }
    };
  }
}

function dangerTitle(type) {
  return DANGER_EVENTS[type]?.title || "危险区域";
}

function counterTip(type) {
  return COUNTER_TIPS[type] || "提升匣术等级，优先清理当前威胁";
}

function counterSkills(type) {
  return COUNTER_SKILLS[type] || "进化匣术 / 护命符";
}

function addSkillRecommendations(bucket, skillIds, score, reason) {
  if (!Array.isArray(skillIds) || !reason) return;
  skillIds.forEach((id, index) => {
    if (!UPGRADE_BY_ID.has(id)) return;
    const weightedScore = Math.max(0, score * Math.max(0.55, 1 - index * 0.12));
    if (weightedScore <= 0) return;
    const current = bucket.get(id) || { score: 0, best: 0, reason };
    bucket.set(id, {
      score: current.score + weightedScore,
      best: Math.max(current.best, weightedScore),
      reason: weightedScore >= current.best ? reason : current.reason
    });
  });
}

function addThreatRecommendation(bucket, type, score, reason) {
  addSkillRecommendations(bucket, COUNTER_SKILL_IDS[type], score, reason);
}

function skillRecommendations(state) {
  const recommendations = new Map();
  const top = topDamageSource(state);
  if (top?.sourceType) {
    addThreatRecommendation(recommendations, top.sourceType, 5.5 + Math.min(3, top.total / 40), `主要威胁：${top.name}`);
  }
  if (state.lastDamageSource?.sourceType && state.time - (state.lastDamageSource.time || 0) <= 32) {
    addThreatRecommendation(recommendations, state.lastDamageSource.sourceType, 4.2, `刚受伤：${state.lastDamageSource.name || "百鬼"}`);
  }

  const enemyPressure = new Map();
  for (const enemy of state.enemies || []) {
    if (!enemy || enemy.dead || enemy.hp <= 0) continue;
    const d = distance(state.player, enemy);
    const proximity = clamp((330 - d) / 330, 0, 1);
    const pressure = (enemy.boss ? 8 : enemy.empowered ? 3 : 1)
      + proximity * 2.4
      + (enemy.shoot ? 0.8 : 0)
      + (enemy.chargeTime > 0 ? 2.2 : 0);
    const current = enemyPressure.get(enemy.type) || { score: 0, name: enemyTitle(enemy) };
    enemyPressure.set(enemy.type, { score: current.score + pressure, name: current.name });
  }
  [...enemyPressure.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .forEach(([type, item], index) => addThreatRecommendation(recommendations, type, Math.max(1.8, item.score * (index ? 0.5 : 0.72)), `场上高压：${item.name}`));

  for (const zone of state.dangerZones || []) {
    if (zone?.type) addThreatRecommendation(recommendations, zone.type, 2.2, `危险区：${dangerTitle(zone.type)}`);
  }
  if (state.activeEvent?.id) {
    addSkillRecommendations(recommendations, WAVE_EVENT_SKILL_IDS[state.activeEvent.id], 3.2, `事件：${state.activeEvent.title}`);
  }
  const modifier = stageModifierSpec(state);
  if (modifier?.id && modifier.id !== "calm") {
    addSkillRecommendations(recommendations, MODIFIER_SKILL_IDS[modifier.id], 1.9, `战场：${modifier.title}`);
  }
  const chapter = chapterForLevel(state.level);
  addSkillRecommendations(recommendations, chapter.skillBias, 1.35, `章节：${chapter.title}`);
  const profile = stageProfileForLevel(state.level);
  addSkillRecommendations(recommendations, profile.skillBias, 1.55, `本关：${profile.title}`);
  const phase = stagePhaseForState(state);
  addSkillRecommendations(recommendations, phase.skillBias, 1.7, `阶段：${phase.short}`);
  if (state.stageObjective?.id && !state.stageObjective.done) {
    addSkillRecommendations(recommendations, OBJECTIVE_SKILL_IDS[state.stageObjective.id], 1.5, `目标：${objectiveLabel(state)}`);
  }
  if (state.player.hp / Math.max(1, state.player.maxHp) <= 0.36) {
    addSkillRecommendations(recommendations, ["vitality", "armor", "speed"], 4.4, "血量偏低");
  }
  if (state.player.level <= 4) {
    addSkillRecommendations(recommendations, ["magnet", "aura", "knife"], 1.2, "前期成型");
  }
  return recommendations;
}

function recommendationForChoice(choice, recommendations) {
  const ids = new Set();
  if (choice.kind === "upgrade") ids.add(choice.id);
  if (choice.kind === "evolution") {
    ids.add(choice.base);
    const evolution = EVOLUTION_BY_ID.get(choice.id);
    Object.keys(evolution?.requires || {}).forEach((id) => ids.add(id));
  }
  if (choice.kind === "relic") {
    (RELIC_SKILL_AFFINITY[choice.id] || []).forEach((id) => ids.add(id));
  }
  let best = null;
  ids.forEach((id) => {
    const item = recommendations.get(id);
    if (item && (!best || item.score > best.score)) best = item;
  });
  return best;
}

function withChoiceRecommendation(choice, recommendations) {
  const recommendation = recommendationForChoice(choice, recommendations);
  if (!recommendation) return choice;
  return {
    ...choice,
    recommended: true,
    recommendedScore: recommendation.score,
    recommendReason: recommendation.reason
  };
}

function damageStatKey(source) {
  return `${source.kind || "unknown"}:${source.sourceType || source.name || "unknown"}`;
}

function deathDetail(state) {
  const source = state.lastDamageSource;
  if (!source) return "被百鬼吞没。建议：保持移动，优先补一件范围匣术。";
  const advice = `建议：${counterTip(source.sourceType)}；推荐 ${counterSkills(source.sourceType)}`;
  if (source.kind === "enemy") return `被 ${source.name} 近身击倒。${advice}`;
  if (source.kind === "shot") return `被 ${source.name || "鬼火弹幕"} 击中。${advice}`;
  if (source.kind === "zone") return `被 ${source.name || "危险区域"} 击倒。${advice}`;
  if (source.kind === "blast") return `被 ${source.name || "爆裂"} 波及。${advice}`;
  return `${source.name || "被百鬼吞没"}。${advice}`;
}

function topDamageSource(state) {
  const entries = Object.values(state.damageStats || {})
    .filter((item) => item && Number.isFinite(item.total) && item.total > 0)
    .sort((a, b) => b.total - a.total);
  return entries[0] || null;
}

function resultExtra(state, won) {
  const top = topDamageSource(state);
  const progress = `${stageDisplayName(state.level)} · 镇夜 ${stageProgressPercent(state)}% · 击破 ${state.kills} · 来源 ${progressBreakdownText(state)}`;
  if (!top) return progress;
  const threat = `主要威胁 ${top.name} ${Math.round(top.total)} 伤`;
  const advice = won ? `推荐继续强化 ${counterSkills(top.sourceType)}` : `下局优先 ${counterSkills(top.sourceType)}`;
  return `${progress} · ${threat} · ${advice}`;
}

function threatLabel(state) {
  const bossEnemy = state.enemies?.find((enemy) => enemy.boss);
  if (bossEnemy) return `鬼王 ${enemyTitle(bossEnemy)} · ${bossSpec(bossEnemy).hint}`;
  const threat = nearestEnemy(state, 260) || state.enemies?.find((enemy) => !enemy.dead);
  if (threat) return `百鬼 ${enemyTitle(threat)} · 弱 ${threat.weakness || enemySpec(threat.type).weakness}`;
  const codex = unlockedEnemyCodex(state.level);
  const latest = codex[codex.length - 1];
  return latest ? `百鬼录 ${latest.title} · 弱 ${latest.weakness}` : "百鬼录 待开卷";
}

function chooseEliteAffix(level) {
  const available = ELITE_AFFIXES.filter((affix) => level >= affix.unlock);
  return available[Math.floor(Math.random() * available.length)] || ELITE_AFFIXES[0];
}

function affixSpec(id) {
  return ELITE_AFFIXES.find((affix) => affix.id === id) || null;
}

function mutationSpec(id) {
  return ENEMY_MUTATIONS.find((mutation) => mutation.id === id) || null;
}

function chooseEnemyMutation(state, empowered = false) {
  const level = state.level;
  const activeEvent = state.activeEvent;
  const available = ENEMY_MUTATIONS.filter((mutation) => level >= mutation.unlock);
  if (!available.length) return null;
  const baseChance = Math.min(0.42, 0.055 + Math.max(0, level - 12) * 0.007 + (activeEvent ? 0.045 : 0) + (empowered ? 0.08 : 0) + stageModifierValue(state, "mutation", 0) + (stagePhaseForState(state).mutationBonus || 0));
  if (Math.random() > baseChance) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function bossArchetypeForLevel(level) {
  const available = BOSS_ARCHETYPES.filter((boss) => level >= boss.unlock);
  const pool = available.length ? available : [BOSS_ARCHETYPES[0]];
  const bossIndex = Math.max(0, Math.floor(level / BOSS_INTERVAL) - 1);
  return pool[bossIndex % pool.length];
}

function bossSpec(idOrEnemy) {
  const id = typeof idOrEnemy === "string" ? idOrEnemy : idOrEnemy?.bossKind;
  return BOSS_ARCHETYPES.find((boss) => boss.id === id) || BOSS_ARCHETYPES[0];
}

function skillLevel(state, id) {
  return state.skills[id] || 0;
}

function hasEvolution(state, id) {
  return (state.evolutions || []).includes(id);
}

function upgradeArchetype(id) {
  return UPGRADE_ARCHETYPES[id] || { school: "通用", role: "均衡成长", counters: "百鬼怪潮" };
}

function requirementProgressText(state, requirements = {}) {
  const parts = Object.entries(requirements).map(([id, required]) => {
    const title = UPGRADE_BY_ID.get(id)?.title || id;
    const current = skillLevel(state, id);
    return current >= required ? `${title}已足` : `${title}${current}/${required}`;
  });
  return parts.join("，");
}

function evolutionHintForUpgrade(state, upgradeId) {
  const related = EVOLUTIONS
    .filter((evolution) => !hasEvolution(state, evolution.id) && (evolution.base === upgradeId || Object.hasOwn(evolution.requires, upgradeId)));
  if (!related.length) return "";
  const ready = related.find((evolution) => evolutionReady(state, evolution));
  if (ready) return `可进化：${ready.title}`;
  const next = related[0];
  const base = UPGRADE_BY_ID.get(next.base)?.title || next.base;
  const baseCurrent = skillLevel(state, next.base);
  const baseMax = UPGRADE_BY_ID.get(next.base)?.max || 1;
  const reqText = requirementProgressText(state, next.requires);
  return `进化预览：${next.title} · ${base}${baseCurrent}/${baseMax}${reqText ? `，${reqText}` : ""}`;
}

function relicLevel(state, id) {
  const relic = RELICS.find((item) => item.id === id);
  return clamp(Math.floor(Number(state.relics?.[id]) || 0), 0, relic?.max || 0);
}

function relicCount(state) {
  return Object.values(state.relics || {}).reduce((sum, level) => sum + Math.max(0, Math.floor(Number(level) || 0)), 0);
}

function unlockedEnemyCodex(level) {
  return Object.entries(ENEMIES)
    .filter(([, spec]) => level >= spec.unlock)
    .sort((a, b) => a[1].unlock - b[1].unlock)
    .slice(-6)
    .map(([type, spec]) => ({ type, ...spec, tip: counterTip(type), skills: counterSkills(type) }));
}

function overdriveDuration(state) {
  return 6.5 + relicLevel(state, "stormBattery") * 0.75;
}

function abilityCooldown(state) {
  const ability = abilitySpec(state);
  return Math.max(3.8, ability.cooldown * (0.96 - relicLevel(state, "quickCore") * 0.025 - skillLevel(state, "focus") * 0.018));
}

function evolutionReady(state, evolution) {
  if (hasEvolution(state, evolution.id)) return false;
  if (skillLevel(state, evolution.base) < (UPGRADE_BY_ID.get(evolution.base)?.max || 1)) return false;
  return Object.entries(evolution.requires).every(([id, required]) => skillLevel(state, id) >= required);
}

function availableEnemyTypes(level) {
  return Object.entries(ENEMIES).filter(([, spec]) => level >= spec.unlock);
}

function chooseEnemyType(state, activeEvent = null) {
  const level = state.level;
  const entries = availableEnemyTypes(level);
  const picked = weightedPick(entries, ([type, spec]) => {
    const themeWeight = encounterBias(state, "enemyBias", type);
    if (activeEvent?.weights?.[type]) return activeEvent.weights[type] * themeWeight;
    const late = ["shield", "elite"].includes(type) ? Math.min(4, (level - spec.unlock) / 10) : 0;
    return (spec.weight + late) * themeWeight;
  });
  return picked?.[0] || "crawler";
}

function spawnPointNearPlayer(state, distanceFromPlayer = 360) {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: clamp(state.player.x + Math.cos(angle) * distanceFromPlayer, 24, WORLD - 24),
    y: clamp(state.player.y + Math.sin(angle) * distanceFromPlayer, 24, WORLD - 24)
  };
}

function randomPointAwayFromPlayer(state, minDistance = 150) {
  for (let i = 0; i < 12; i += 1) {
    const point = {
      x: 48 + Math.random() * (WORLD - 96),
      y: 48 + Math.random() * (WORLD - 96)
    };
    if (distance(point, state.player) >= minDistance) return point;
  }
  return spawnPointNearPlayer(state, minDistance + 120);
}

function chooseObjective(level) {
  const available = OBJECTIVES.filter((objective) => level >= (objective.unlock || 1));
  return weightedPick(available, (objective) => stageProfileBias(level, "objectiveBias", objective.id)) || OBJECTIVES[0];
}

function makeStageObjective(level) {
  const spec = chooseObjective(level);
  const profile = stageProfileForLevel(level);
  return {
    id: spec.id,
    title: spec.title,
    verb: spec.verb,
    target: Math.max(1, Math.round(spec.target(level) * (profile.objectiveScale || 1))),
    progress: 0,
    reward: Math.round((spec.reward + level * 2) * (profile.reward || 1)),
    done: false
  };
}

function objectiveLabel(state) {
  const objective = state.stageObjective;
  if (!objective) return `击破 ${state.stageKills}`;
  const status = objective.done ? "完成" : `${objective.progress}/${objective.target}`;
  return `${objective.title} ${status}`;
}

function awardStageProgress(state, amount, label = "", point = null, source = "") {
  if (!Number.isFinite(amount) || amount <= 0 || state.over) return 0;
  const goal = stageProgressGoal(state.level);
  const before = state.stageProgress || 0;
  const after = Math.min(goal, before + amount);
  state.stageProgress = after;
  const gained = after - before;
  if (gained <= 0) return 0;
  recordProgressSource(state, progressSourceKey(source || label), gained);
  const crossedBossLine = levelTuning(state.level).bossStage
    && before < stageBossProgressGoal(state.level)
    && after >= stageBossProgressGoal(state.level)
    && !state.bossSpawned;
  const crossedGoal = before < goal && after >= goal;
  if (crossedBossLine) {
    state.message = "鬼王气息逼近";
    addFloatingText(state.effects, state.player.x, state.player.y - 58, "鬼王将至", { color: classicArcade.red, size: 18 });
  } else if (crossedGoal && !state.bossAlive) {
    state.message = "镇夜进度已满";
    addFloatingText(state.effects, state.player.x, state.player.y - 58, "镇夜完成", { color: RARITIES.evolve.color, size: 18 });
  } else if (label && gained >= 10 && point) {
    addFloatingText(state.effects, point.x, point.y - 20, `镇夜 +${Math.round(gained)}`, { color: RARITIES.evolve.color, size: 11 });
  }
  return gained;
}

function enemyProgressValue(state, enemy) {
  if (enemy.boss) return stageProgressGoal(state.level);
  const base = Math.max(1, Math.round((enemy.score || 12) / 14));
  const eliteBonus = enemy.empowered ? 9 + Math.floor(state.level * 0.35) : 0;
  const mutationBonus = enemy.mutation ? 2 : 0;
  const affixBonus = enemy.affix ? 3 : 0;
  return base + eliteBonus + mutationBonus + affixBonus;
}

function makeObject(state, type, point) {
  const spec = OBJECT_TYPES[type] || OBJECT_TYPES.crate;
  return {
    id: state.objectId++,
    type,
    x: point.x,
    y: point.y,
    radius: spec.radius,
    hp: spec.hp + (type === "crate" ? Math.floor(state.level * 1.6) : 0),
    maxHp: spec.hp + (type === "crate" ? Math.floor(state.level * 1.6) : 0),
    charge: 0,
    pulse: 0,
    spawnTimer: type === "riftSeal" ? 1.2 + Math.random() * 1.2 : 0,
    flash: 0,
    active: true
  };
}

function setupStageObjects(state) {
  state.objects = [];
  const previousModifierId = state.stageModifier?.id || null;
  const modifier = chooseStageModifier(state.level, previousModifierId);
  state.stageModifier = {
    id: modifier.id,
    title: modifier.title,
    icon: modifier.icon,
    color: modifier.color,
    desc: modifier.desc
  };
  state.modifierTimer = 2.8 + Math.random() * 1.8;
  state.stageObjective = makeStageObjective(state.level);
  const objectiveSpec = OBJECTIVES.find((objective) => objective.id === state.stageObjective.id);
  const objectiveType = objectiveSpec?.objectType || "crate";
  const counts = {
    crate: 5 + Math.min(4, Math.floor(state.level / 7)),
    crystal: 3 + Math.min(3, Math.floor(state.level / 9)),
    shrine: 1 + Math.min(2, Math.floor(state.level / 14)),
    beacon: state.level >= 8 ? 1 + Math.min(2, Math.floor(state.level / 20)) : 0,
    riftSeal: state.level >= 10 ? 1 + Math.min(2, Math.floor(state.level / 18)) : 0
  };
  counts[objectiveType] = Math.max(counts[objectiveType], state.stageObjective.target + 1);
  Object.entries(counts).forEach(([type, count]) => {
    for (let i = 0; i < count; i += 1) {
      state.objects.push(makeObject(state, type, randomPointAwayFromPlayer(state, 150 + (i % 3) * 30)));
    }
  });
}

function ensureStageSetup(state) {
  if (!state.stageObjective || !Array.isArray(state.objects) || !state.objects.length) setupStageObjects(state);
  if (!state.stageModifier?.id) {
    const modifier = chooseStageModifier(state.level);
    state.stageModifier = {
      id: modifier.id,
      title: modifier.title,
      icon: modifier.icon,
      color: modifier.color,
      desc: modifier.desc
    };
    state.modifierTimer = Number.isFinite(state.modifierTimer) ? state.modifierTimer : 3.2;
  }
}

function awardCoins(state, amount) {
  const value = Math.max(0, Math.floor(amount * coinMultiplier(state)));
  if (!value) return;
  state.coinsEarned = (state.coinsEarned || 0) + value;
}

function progressObjective(state, id, amount = 1) {
  const objective = state.stageObjective;
  if (!objective || objective.done || objective.id !== id) return;
  objective.progress = Math.min(objective.target, objective.progress + amount);
  if (objective.progress < objective.target) {
    state.message = `${objective.verb} ${objective.progress}/${objective.target}`;
    return;
  }
  objective.done = true;
  state.objectiveStreak = (state.objectiveStreak || 0) + 1;
  state.pressureDebt = Math.max(0, (state.pressureDebt || 0) - 1);
  state.score += 480 + state.level * 35;
  const streakBonus = Math.min(24, state.objectiveStreak * 4);
  const reward = objective.reward + streakBonus;
  awardStageProgress(state, 28 + state.level * 3 + objective.target * 4 + streakBonus, "目标", state.player, "objectives");
  awardCoins(state, reward);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 10 + state.objectiveStreak * 2);
  state.overdriveCharge = Math.min(100, (state.overdriveCharge || 0) + 12 + Math.min(18, state.objectiveStreak * 2));
  state.message = `${objective.title}完成，连胜 ${state.objectiveStreak}`;
  addFloatingText(state.effects, state.player.x, state.player.y - 50, `目标完成 +${reward}`, { color: RARITIES.evolve.color, size: 16 });
  addBurst(state.effects, state.player.x, state.player.y, { count: 30, color: RARITIES.evolve.color, secondary: classicArcade.white, radius: 32 });
}

function destroyObject(state, object, source = "open") {
  if (!object.active) return;
  object.active = false;
  const spec = OBJECT_TYPES[object.type] || OBJECT_TYPES.crate;
  addBurst(state.effects, object.x, object.y, { count: object.type === "shrine" ? 28 : 16, color: spec.color, secondary: classicArcade.white, radius: object.radius + 8 });
  if (object.type === "crate") {
    state.pickups.push({ type: Math.random() < 0.35 + metaLuck(state) ? "heal" : "xp", x: object.x, y: object.y, value: 14 + state.level * 2, radius: 9, vy: 0 });
    if (Math.random() < 0.18 + metaLuck(state)) state.pickups.push({ type: "bomb", x: object.x + 10, y: object.y - 8, value: 1, radius: 9, vy: 0 });
    if (Math.random() < 0.42 + Math.min(0.24, state.level * 0.015)) spawnAmbush(state, object);
    awardCoins(state, 2 + Math.floor(state.level / 4));
    progressObjective(state, "crate");
  }
  if (object.type === "crystal") {
    gainXp(state, 10 + state.level * 2);
    awardCoins(state, 4 + Math.floor(state.level / 3));
    progressObjective(state, "crystal");
    addFloatingText(state.effects, object.x, object.y - 12, "晶体", { color: classicArcade.cyan });
  }
  if (object.type === "shrine") {
    const heal = 22 + state.level * 2;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
    state.player.invuln = Math.max(state.player.invuln, 1.6);
    state.lightningTimer = Math.min(state.lightningTimer, 0.2);
    state.overdriveCharge = Math.min(100, (state.overdriveCharge || 0) + 18);
    awardCoins(state, 8 + Math.floor(state.level / 2));
    progressObjective(state, "shrine");
    addFloatingText(state.effects, object.x, object.y - 16, `祭坛 +${heal}`, { color: RARITIES.evolve.color });
  }
  if (object.type === "beacon") {
    state.player.invuln = Math.max(state.player.invuln, 1.1);
    state.abilityTimer = Math.min(state.abilityTimer || 0, 0.35);
    awardCoins(state, 7 + Math.floor(state.level / 2));
    progressObjective(state, "beacon");
    addFloatingText(state.effects, object.x, object.y - 18, "信标完成", { color: spec.color, size: 13 });
  }
  if (object.type === "riftSeal") {
    state.dangerZones = state.dangerZones.filter((zone) => distance(zone, object) > 110);
    awardCoins(state, 9 + Math.floor(state.level / 2));
    progressObjective(state, "riftSeal");
    addFloatingText(state.effects, object.x, object.y - 18, "裂隙封印", { color: spec.color, size: 13 });
    addBurst(state.effects, object.x, object.y, { count: 26, color: spec.color, secondary: classicArcade.cyan, radius: 30 });
  }
}

function damageObject(state, object, amount) {
  if (!object.active || object.type !== "crate") return false;
  object.hp -= amount;
  object.flash = 0.12;
  if (object.hp > 0) return false;
  destroyObject(state, object, "hit");
  return true;
}

function makeEnemy(state, type, point, boss = false, options = {}) {
  const tuning = levelTuning(state.level);
  const spec = enemySpec(type);
  const bossInfo = boss ? bossSpec(options.bossKind || bossArchetypeForLevel(state.level).id) : null;
  const empowered = Boolean(options.empowered);
  const affix = empowered && !boss ? chooseEliteAffix(state.level) : null;
  const mutation = !boss && options.mutation !== false ? chooseEnemyMutation(state, empowered) : null;
  const hpScale = (empowered ? 1.55 * (affix?.hp || 1) : 1) * (mutation?.hp || 1);
  const pressure = objectivePressure(state);
  const modifierHp = stageModifierValue(state, "hp", 1);
  const modifierDamage = stageModifierValue(state, "damage", 1);
  const hp = boss ? Math.round(tuning.bossHp * (bossInfo?.hp || 1) * pressure * modifierHp) : Math.round(spec.hp * tuning.hpScale * hpScale * pressure * modifierHp);
  const rangedShot = type === "spitter" ? 1.8 : type === "sniper" ? 1.35 : 0;
  const latePressure = boss ? 1 : 1 + Math.max(0, state.level - 10) * 0.004 + Math.floor(Math.max(0, state.level - 1) / 10) * 0.025;
  return {
    id: state.enemyId++,
    type,
    title: boss ? bossInfo.title : spec.title,
    family: boss ? "鬼王" : spec.family,
    weakness: boss ? bossInfo.hint : spec.weakness,
    x: point.x,
    y: point.y,
    radius: boss ? 32 : spec.radius + (empowered ? 3 : 0),
    hp,
    maxHp: hp,
    speed: boss ? (34 + state.level * 0.8) * (bossInfo?.speed || 1) : spec.speed * tuning.speedScale * latePressure * (empowered ? 1.06 : 1) * (affix?.speed || 1) * (mutation?.speed || 1),
    damage: Math.round((boss ? 26 + state.level : spec.damage + (empowered ? 5 : 0)) * tuning.damageScale * latePressure * pressure * modifierDamage * (affix?.damage || 1) * (bossInfo?.damage || 1) * (mutation?.damage || 1)),
    xp: boss ? 80 + state.level * 4 : Math.round(spec.xp * (empowered ? 2.2 : 1)),
    score: boss ? 900 + state.level * 30 : Math.round(spec.score * (empowered ? 2.4 : 1) * (mutation?.score || 1)),
    color: boss ? bossInfo.color : empowered ? "#d45cff" : mutation?.color || spec.color,
    boss,
    bossKind: bossInfo?.id || null,
    bossTitle: bossInfo?.title || null,
    empowered,
    affix: affix?.id || null,
    mutation: mutation?.id || null,
    shoot: boss ? 1.2 : rangedShot,
    special: boss ? 3.2 : type === "warden" ? 2.2 : type === "charger" ? 1.4 + Math.random() * 0.8 : 0,
    fuse: type === "bomber" ? 0 : 0,
    healPulse: 0,
    phaseIndex: 0,
    chargeTime: 0,
    chargeAngle: 0,
    slow: 0,
    phase: Math.random() * Math.PI * 2,
    flash: 0
  };
}

function spawnEnemy(state) {
  const tuning = levelTuning(state.level);
  if (state.enemies.length >= tuning.maxEnemies || state.choices.length) return;
  const activeEvent = state.activeEvent;
  const type = chooseEnemyType(state, activeEvent);
  const ambientEliteChance = Math.max(0, (state.level - 3) * 0.004);
  const debtChance = Math.min(0.16, (state.pressureDebt || 0) * 0.025);
  const modifierEliteChance = stageModifierValue(state, "elite", 0);
  const profileEliteChance = stageProfileForLevel(state.level).eliteBonus || 0;
  const phaseEliteChance = stagePhaseForState(state).eliteBonus || 0;
  const empowered = Boolean((activeEvent?.eliteChance && Math.random() < activeEvent.eliteChance) || Math.random() < ambientEliteChance + debtChance + modifierEliteChance + profileEliteChance + phaseEliteChance);
  state.enemies.push(makeEnemy(state, type, spawnPointNearPlayer(state), false, { empowered }));
}

function spawnAmbush(state, point, reason = "补给惊动怪群") {
  const phase = stagePhaseForState(state);
  const count = Math.max(3, Math.round((3 + Math.min(8, Math.floor(state.level / 2))) * (phase.ambushScale || 1)));
  const ambushPool = availableEnemyTypes(state.level)
    .filter(([type]) => type !== "elite" || state.level >= 24);
  for (let i = 0; i < count; i += 1) {
    const angle = i * Math.PI * 2 / count + Math.random() * 0.5;
    const picked = weightedPick(ambushPool, ([type, spec]) => (spec.weight || 1) * encounterBias(state, "enemyBias", type) * (type === "charger" || type === "bomber" ? 1.18 : 1));
    const type = picked?.[0] || "swarmer";
    const spawn = {
      x: clamp(point.x + Math.cos(angle) * (36 + Math.random() * 28), 24, WORLD - 24),
      y: clamp(point.y + Math.sin(angle) * (36 + Math.random() * 28), 24, WORLD - 24)
    };
    state.enemies.push(makeEnemy(state, type, spawn, false, { empowered: state.level >= 7 && i === 0 && Math.random() < 0.35 }));
  }
  state.message = reason;
  addFloatingText(state.effects, point.x, point.y - 28, "伏击", { color: classicArcade.red, size: 14 });
}

function spawnBoss(state) {
  if (state.bossSpawned || !levelTuning(state.level).bossStage) return;
  const bossInfo = bossArchetypeForLevel(state.level);
  state.bossSpawned = true;
  state.bossAlive = true;
  state.activeEvent = null;
  state.enemies.push(makeEnemy(state, bossInfo.type || "elite", spawnPointNearPlayer(state, 300), true, { bossKind: bossInfo.id }));
  state.message = `${bossInfo.title} 入场`;
  addFloatingText(state.effects, state.player.x, state.player.y - 42, bossInfo.title, { color: bossInfo.color, size: 22 });
  addFloatingText(state.effects, state.player.x, state.player.y - 66, bossInfo.intro, { color: classicArcade.white, size: 10, life: 1.4 });
  addFloatingText(state.effects, state.player.x, state.player.y - 82, bossInfo.hint, { color: RARITIES.evolve.color, size: 10, life: 1.7 });
  addBurst(state.effects, state.player.x, state.player.y, { count: 26, color: bossInfo.color, secondary: classicArcade.white, radius: 36 });
}

function chooseWaveEvent(state, excludeId = null) {
  let available = WAVE_EVENTS.filter((event) => state.level >= event.unlock && event.id !== excludeId);
  if (!available.length) available = WAVE_EVENTS.filter((event) => state.level >= event.unlock);
  return weightedPick(available, (event) => encounterBias(state, "eventBias", event.id)) || WAVE_EVENTS[0];
}

function startWaveEvent(state, fromChain = false) {
  if (state.bossAlive) return;
  const event = chooseWaveEvent(state, state.activeEvent?.id);
  const phase = stagePhaseForState(state);
  const duration = event.duration * (phase.eventDuration || 1);
  state.activeEvent = { ...event, phaseId: phase.id, remaining: duration, startKills: state.kills };
  state.eventTimer = duration;
  if (!fromChain && state.level >= 16) {
    const chance = Math.min(0.58, (0.12 + (state.level - 16) * 0.012) * stageEventRate(state));
    state.eventChain = Math.random() < chance ? Math.min(2, 1 + Math.floor((state.level - 16) / 22)) : 0;
  }
  state.message = fromChain ? `${event.title} 连锁` : `${phase.short} · ${event.title}`;
  addFloatingText(state.effects, state.player.x, state.player.y - 46, state.message, { color: event.color, size: 17 });
  addBurst(state.effects, state.player.x, state.player.y, { count: 18, color: event.color, secondary: classicArcade.white, radius: 28 });
}

function updateWaveDirector(state, dt) {
  if (state.bossAlive) {
    state.activeEvent = null;
    state.eventChain = 0;
    state.eventTimer = Math.max(state.eventTimer, 8);
    return;
  }
  if (state.activeEvent) {
    state.activeEvent.remaining -= dt;
    if (state.activeEvent.remaining <= 0) {
      const completedEvent = state.activeEvent;
      const killsDuring = Math.max(0, state.kills - (completedEvent.startKills || state.kills));
      const clearTarget = Math.max(5, Math.floor(4 + state.level * 0.18));
      if (killsDuring >= clearTarget) {
        const reward = Math.min(24, 7 + Math.floor(killsDuring * 0.45) + Math.floor(state.level * 0.18));
        awardStageProgress(state, reward, "事件", state.player, "events");
      }
      const interval = state.activeEvent.interval || 16;
      if (state.eventChain > 0) {
        state.eventChain -= 1;
        state.activeEvent = null;
        startWaveEvent(state, true);
        return;
      }
      state.activeEvent = null;
      state.eventTimer = (interval + Math.random() * 5) / stageEventRate(state);
      state.message = "怪潮间隙";
    }
    return;
  }
  state.eventTimer -= dt;
  if (state.eventTimer <= 0) startWaveEvent(state);
}

function nearestEnemy(state, range = 520) {
  let best = null;
  let bestDistance = range;
  for (const enemy of state.enemies) {
    const d = distance(state.player, enemy);
    if (d < bestDistance) {
      bestDistance = d;
      best = enemy;
    }
  }
  return best;
}

function nearestEnemyFrom(state, point, range = 520) {
  let best = null;
  let bestDistance = range;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const d = distance(point, enemy);
    if (d < bestDistance) {
      bestDistance = d;
      best = enemy;
    }
  }
  return best;
}

function weaponHitEffect(state, enemy, source) {
  const style = WEAPON_HIT_EFFECTS[source] || WEAPON_HIT_EFFECTS.knife;
  const subtle = source === "aura" || source === "plague" || source === "orbit" || source === "saw";
  if (subtle && Math.random() > (enemy.boss ? 0.38 : 0.16)) return;
  addBurst(state.effects, enemy.x, enemy.y, {
    count: style.count + (enemy.boss ? 4 : 0),
    color: style.color,
    secondary: style.secondary,
    radius: style.radius + (enemy.boss ? 7 : 0),
    speed: enemy.boss ? 54 : 44,
    life: 0.22,
    ringLife: 0.18,
    size: enemy.boss ? 3.4 : 2.4
  });
}

function damageEnemy(state, enemy, amount, source = "hit") {
  if (enemy.dead) return false;
  const affix = affixSpec(enemy.affix);
  let finalAmount = enemy.frozen > 0 ? amount * 1.18 : amount;
  if (enemy.affix === "bulwark" && enemy.frozen <= 0) finalAmount *= 0.72;
  if (enemy.boss) finalAmount *= 1 + relicLevel(state, "hunterMark") * 0.12;
  else if (enemy.empowered) finalAmount *= 1 + relicLevel(state, "hunterMark") * 0.05;
  enemy.hp -= finalAmount;
  enemy.flash = 0.12;
  if (enemy.hp > 0) {
    if (finalAmount > 0) weaponHitEffect(state, enemy, source);
    return false;
  }
  enemy.dead = true;
  state.score += enemy.score;
  state.kills += 1;
  state.stageKills += 1;
  awardStageProgress(state, enemyProgressValue(state, enemy), enemy.boss ? "鬼王" : enemy.empowered ? "精英" : "", enemy, enemy.boss ? "bosses" : enemy.empowered ? "elites" : "kills");
  state.combo = (state.combo || 0) + 1;
  state.comboTimer = Math.min(4.2, 2.2 + state.combo * 0.018);
  state.overdriveCharge = Math.min(100, (state.overdriveCharge || 0) + (enemy.boss ? 34 : enemy.empowered ? 8 : 2.4) * (1 + relicLevel(state, "stormBattery") * 0.16));
  if (state.overdriveCharge >= 100 && state.overdrive <= 0) {
    state.overdrive = overdriveDuration(state);
    state.overdriveCharge = 0;
    state.message = "过载启动";
    addFloatingText(state.effects, state.player.x, state.player.y - 58, "过载", { color: RARITIES.evolve.color, size: 20 });
    addBurst(state.effects, state.player.x, state.player.y, { count: 30, color: RARITIES.evolve.color, secondary: classicArcade.cyan, radius: 38 });
  }
  if (enemy.empowered && !enemy.boss) awardCoins(state, 2 + Math.floor(state.level / 5));
  if (!enemy.boss && Math.random() < 0.018 + metaLuck(state) * 0.45) awardCoins(state, 1);
  if ((enemy.empowered || enemy.boss) && relicLevel(state, "bloodGem")) {
    const heal = Math.round((enemy.boss ? 18 : 5) + relicLevel(state, "bloodGem") * (enemy.boss ? 6 : 2.5));
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
    addFloatingText(state.effects, state.player.x, state.player.y - 36, `血晶 +${heal}`, { color: "#ff7a7a", size: 12 });
  }
  if (enemy.boss) {
    state.bossAlive = false;
    awardStageProgress(state, stageProgressGoal(state.level), "鬼王", enemy, "bosses");
    awardCoins(state, 18 + Math.floor(state.level * 1.5) + relicLevel(state, "hunterMark") * 6);
    state.message = `${enemy.bossTitle || "鬼王"} 已击破`;
  }
  if (enemy.type === "bomber" && !enemy.boss) detonateBomber(state, enemy, false);
  if (enemy.affix === "split" && !enemy.boss) {
    for (let i = 0; i < 2; i += 1) {
      const angle = enemy.phase + i * Math.PI;
      state.enemies.push(makeEnemy(state, "swarmer", {
        x: clamp(enemy.x + Math.cos(angle) * 16, 24, WORLD - 24),
        y: clamp(enemy.y + Math.sin(angle) * 16, 24, WORLD - 24)
      }, false));
    }
  }
  addBurst(state.effects, enemy.x, enemy.y, { count: enemy.boss ? 34 : 14, color: enemy.color, secondary: classicArcade.yellow, radius: enemy.boss ? 26 : 10 });
  const killLabel = enemy.boss || enemy.empowered || enemy.mutation ? `${enemyTitle(enemy)} +${enemy.score}` : `+${enemy.score}`;
  addFloatingText(state.effects, enemy.x, enemy.y - 12, killLabel, { color: affix?.color || enemy.color || classicArcade.yellow });
  if (source === "plague" && !enemy.boss) {
    for (const nearby of state.enemies) {
      if (nearby === enemy || nearby.dead || distance(enemy, nearby) > 58) continue;
      nearby.hp -= 24 + state.level * 1.8;
      nearby.flash = 0.08;
    }
    addBurst(state.effects, enemy.x, enemy.y, { count: 18, color: "#8ce8bd", secondary: "#d45cff", radius: 24 });
  }
  if (enemy.mutation === "volatile" && !enemy.boss && enemy.type !== "bomber") {
    const blast = 38 + Math.min(26, state.level * 0.7);
    addBurst(state.effects, enemy.x, enemy.y, { count: 16, color: "#ff6b2c", secondary: classicArcade.yellow, radius: blast * 0.36 });
    for (const nearby of state.enemies) {
      if (nearby === enemy || nearby.dead || nearby.boss || distance(enemy, nearby) > blast + nearby.radius) continue;
      nearby.hp -= 14 + state.level * 0.9;
      nearby.flash = 0.08;
    }
  }
  if (enemy.mutation === "venom" && !enemy.boss && Math.random() < 0.22) spawnDangerZone(state, "acid", enemy);
  dropPickup(state, enemy, source);
  return true;
}

function detonateBomber(state, enemy, canHitPlayer = true) {
  if (enemy.exploded) return;
  enemy.exploded = true;
  enemy.dead = true;
  const blast = 58 + Math.min(28, state.level * 1.2);
  addBurst(state.effects, enemy.x, enemy.y, { count: 30, color: "#ff6b2c", secondary: classicArcade.yellow, radius: blast * 0.48 });
  addFloatingText(state.effects, enemy.x, enemy.y - 18, "爆裂", { color: "#ffb84d", size: 14 });
  for (const nearby of state.enemies) {
    if (nearby === enemy || nearby.dead) continue;
    const d = distance(enemy, nearby);
    if (d > blast + nearby.radius) continue;
    const blastDamage = (32 + state.level * 2.2) * clamp(1 - d / (blast + nearby.radius), 0.28, 1);
    nearby.flash = 0.12;
    nearby.slow = Math.max(nearby.slow || 0, 0.45);
    damageEnemy(state, nearby, blastDamage, "bomber");
  }
  if (canHitPlayer && state.player.invuln <= 0 && distance(enemy, state.player) <= blast + state.player.radius) {
    const taken = incomingDamage(state, enemy.damage + Math.floor(state.level * 0.6));
    state.player.hp -= taken;
    recordDamageSource(state, { kind: "blast", name: `${enemyTitle(enemy)} 爆裂`, sourceType: enemy.type, amount: taken, raw: enemy.damage });
    state.player.invuln = 0.72;
    state.shake = Math.max(state.shake, 7);
    triggerHitStop(state, 0.055, 0.45);
  }
}

function dropPickup(state, enemy, source) {
  state.pickups.push({ type: "xp", x: enemy.x, y: enemy.y, value: enemy.xp, radius: 8, vy: 0 });
  const roll = Math.random();
  if (enemy.boss || roll > 0.93 - metaLuck(state)) {
    state.pickups.push({ type: enemy.boss ? "chest" : "heal", x: enemy.x + 10, y: enemy.y - 10, value: enemy.boss ? 1 : 20, radius: 10, vy: 0 });
  } else if (source === "lightning" && roll > 0.86 - metaLuck(state)) {
    state.pickups.push({ type: "bomb", x: enemy.x, y: enemy.y, value: 1, radius: 10, vy: 0 });
  }
}

function gainXp(state, amount) {
  state.player.xp += amount * (1 + (characterSpec(state).xpBonus || 0) + relicLevel(state, "fieldCrown") * 0.055) * stageModifierValue(state, "xp", 1);
  while (state.player.xp >= state.player.xpNeed) {
    state.player.xp -= state.player.xpNeed;
    state.player.level += 1;
    state.player.xpNeed = Math.round(state.player.xpNeed * 1.2 + 8);
    state.choices = createUpgradeChoices(state);
    if (state.choices.length) {
      state.message = "选择一次升级";
    } else {
      state.score += 240;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 12);
      state.message = "匣术已满，转化为补给";
    }
    break;
  }
}

function chooseRarity(state) {
  const pressure = Math.min(0.24, state.level * 0.003 + state.player.level * 0.002 + metaLuck(state) + relicLevel(state, "fieldCrown") * 0.018);
  const roll = Math.random();
  if (roll > 0.94 - pressure) return "epic";
  if (roll > 0.72 - pressure) return "rare";
  return "common";
}

function upgradeChoice(state, upgrade) {
  const rarity = chooseRarity(state);
  const raritySpec = RARITIES[rarity];
  const current = skillLevel(state, upgrade.id);
  const levels = Math.min(raritySpec.levels, upgrade.max - current);
  const archetype = upgradeArchetype(upgrade.id);
  const evolutionHint = evolutionHintForUpgrade(state, upgrade.id);
  return {
    key: `u:${upgrade.id}:${rarity}:${Math.random().toString(36).slice(2, 8)}`,
    kind: "upgrade",
    id: upgrade.id,
    title: upgrade.title,
    icon: upgrade.icon,
    tag: upgrade.tag,
    school: archetype.school,
    comboHint: `${archetype.role} · 克 ${archetype.counters}`,
    evolutionHint,
    rarity,
    levels,
    desc: levels > 1 ? `${upgrade.desc}，本次直接提升 ${levels} 级` : upgrade.desc
  };
}

function evolutionChoice(state, evolution) {
  const archetype = upgradeArchetype(evolution.base);
  return {
    key: `e:${evolution.id}`,
    kind: "evolution",
    id: evolution.id,
    base: evolution.base,
    title: evolution.title,
    icon: evolution.icon,
    tag: "进化",
    school: `${archetype.school}终式`,
    comboHint: `终式成型 · 克 ${archetype.counters}`,
    evolutionHint: "已满足进化条件",
    rarity: "evolve",
    levels: 1,
    desc: evolution.desc
  };
}

function relicChoice(state, relic) {
  const current = relicLevel(state, relic.id);
  return {
    key: `r:${relic.id}:${Math.random().toString(36).slice(2, 8)}`,
    kind: "relic",
    id: relic.id,
    title: relic.title,
    icon: relic.icon,
    tag: "Boss 遗物",
    school: "遗物流派",
    comboHint: relic.id === "hunterMark" ? "鬼王压制 · 精英收益" : relic.id === "fieldCrown" ? "成型加速 · 稀有率" : relic.id === "aegisCharm" ? "保命减伤 · 容错" : "构筑强化 · 长线成长",
    evolutionHint: current + 1 >= relic.max ? "本次后接近满阶" : `遗物 ${current}/${relic.max}`,
    rarity: "evolve",
    levels: 1,
    current,
    max: relic.max,
    desc: `${relic.desc}（${current}/${relic.max}）`
  };
}

function createUpgradeChoices(state, recommendations = skillRecommendations(state)) {
  const evolutions = EVOLUTIONS
    .filter((evolution) => evolutionReady(state, evolution))
    .map((evolution) => withChoiceRecommendation(evolutionChoice(state, evolution), recommendations));
  const upgrades = UPGRADES
    .filter((upgrade) => skillLevel(state, upgrade.id) < upgrade.max)
    .map((upgrade) => withChoiceRecommendation(upgradeChoice(state, upgrade), recommendations));
  if (evolutions.length) {
    return [
      ...weightedShuffle(evolutions, (choice) => 4 + (choice.recommendedScore || 0)).slice(0, 1),
      ...weightedShuffle(upgrades, choiceWeight).slice(0, 2)
    ];
  }
  return weightedShuffle(upgrades, choiceWeight).slice(0, 3);
}

function createChestChoices(state) {
  const recommendations = skillRecommendations(state);
  const relics = RELICS
    .filter((relic) => relicLevel(state, relic.id) < relic.max)
    .map((relic) => withChoiceRecommendation(relicChoice(state, relic), recommendations));
  const growth = createUpgradeChoices(state, recommendations);
  if (!relics.length) return growth;
  return [
    ...weightedShuffle(relics, choiceWeight).slice(0, Math.min(2, relics.length)),
    ...weightedShuffle(growth, choiceWeight).slice(0, relics.length >= 2 ? 1 : 2)
  ].slice(0, 3);
}

function choiceWeight(choice) {
  return 1 + (choice.recommendedScore || 0) * 0.32 + (choice.rarity === "epic" ? 0.25 : 0) + (choice.rarity === "evolve" ? 1.5 : 0);
}

function weightedShuffle(values, weightForValue) {
  const pool = [...values];
  const result = [];
  while (pool.length) {
    const total = pool.reduce((sum, value) => sum + Math.max(0.01, weightForValue(value)), 0);
    let roll = Math.random() * total;
    let index = 0;
    for (; index < pool.length; index += 1) {
      roll -= Math.max(0.01, weightForValue(pool[index]));
      if (roll <= 0) break;
    }
    result.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }
  return result;
}

function weightedPick(values, weightForValue) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + Math.max(0.01, weightForValue(value)), 0);
  let roll = Math.random() * total;
  for (const value of values) {
    roll -= Math.max(0.01, weightForValue(value));
    if (roll <= 0) return value;
  }
  return values[values.length - 1];
}

function shuffle(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function rerollChoices(state) {
  if (!state.choices.length || state.rerolls <= 0) return false;
  const chestPool = state.choices.some((choice) => choice.kind === "relic");
  state.rerolls -= 1;
  state.choices = chestPool ? createChestChoices(state) : createUpgradeChoices(state);
  state.message = `重铸符牌，剩余 ${state.rerolls} 次`;
  addFloatingText(state.effects, state.player.x, state.player.y - 54, "重铸", { color: classicArcade.cyan, size: 15 });
  return true;
}

function applyUpgrade(state, key) {
  const choice = state.choices.find((item) => item.key === key || item.id === key);
  if (!choice) return;
  if (choice.kind === "relic") {
    const relic = RELICS.find((item) => item.id === choice.id);
    if (!relic) return;
    const next = Math.min(relic.max, relicLevel(state, relic.id) + 1);
    state.relics = { ...(state.relics || {}), [relic.id]: next };
    state.score += 720 + state.level * 18;
    state.choices = [];
    state.message = `${relic.title} Lv.${next}`;
    if (relic.id === "aegisCharm" || relic.id === "bloodGem") state.player.hp = Math.min(state.player.maxHp, state.player.hp + 18);
    addBurst(state.effects, state.player.x, state.player.y, { count: 32, color: RARITIES.evolve.color, secondary: classicArcade.cyan, radius: 38 });
    addFloatingText(state.effects, state.player.x, state.player.y - 56, relic.title, { color: RARITIES.evolve.color, size: 17 });
    return;
  }
  if (choice.kind === "evolution") {
    if (!hasEvolution(state, choice.id)) state.evolutions.push(choice.id);
    state.score += RARITIES.evolve.score;
    state.choices = [];
    state.message = `${choice.title} 已进化`;
    addBurst(state.effects, state.player.x, state.player.y, { count: 34, color: RARITIES.evolve.color, secondary: classicArcade.white, radius: 34 });
    return;
  }
  const upgrade = UPGRADE_BY_ID.get(choice.id);
  if (!upgrade) return;
  const before = skillLevel(state, choice.id);
  const nextLevel = Math.min(upgrade.max, before + choice.levels);
  const gained = nextLevel - before;
  state.skills[choice.id] = nextLevel;
  if (choice.id === "speed") state.player.speed += 10 * gained;
  if (choice.id === "vitality") {
    state.player.maxHp += 18 * gained;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 28 * gained);
  }
  if (choice.id === "armor") {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 8 * gained);
  }
  state.score += RARITIES[choice.rarity]?.score || 0;
  state.choices = [];
  const rarityLabel = RARITIES[choice.rarity]?.label || "强化";
  state.message = `${rarityLabel}·${upgrade.title} 升到 ${state.skills[choice.id]} 级`;
}

function collectPickups(state) {
  const magnet = 44 + (state.skills.magnet || 0) * 28 + (state.skills.speed || 0) * 8 + (state.talents?.magnet || 0) * 10 + relicLevel(state, "fieldCrown") * 16;
  for (const pickup of state.pickups) {
    const d = distance(state.player, pickup);
    if (d < magnet * 2.2) {
      const pull = clamp((magnet * 2.2 - d) / (magnet * 2.2), 0, 1);
      const angle = Math.atan2(state.player.y - pickup.y, state.player.x - pickup.x);
      pickup.x += Math.cos(angle) * pull * 5;
      pickup.y += Math.sin(angle) * pull * 5;
    }
  }
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = state.pickups[i];
    if (distance(state.player, pickup) > state.player.radius + pickup.radius + 7) continue;
    state.pickups.splice(i, 1);
    if (pickup.type === "xp") gainXp(state, pickup.value);
    if (pickup.type === "heal") state.player.hp = Math.min(state.player.maxHp, state.player.hp + pickup.value);
    if (pickup.type === "bomb") {
      state.enemies.forEach((enemy) => damageEnemy(state, enemy, 55 + state.level * 3, "bomb"));
      state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
      triggerHitStop(state, 0.05, 0.45);
    }
    if (pickup.type === "chest") {
      state.score += 500;
      state.choices = createChestChoices(state);
      if (state.choices.length) {
        state.message = "鬼王宝箱：选择遗物";
      } else {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 35);
        state.score += 600;
        state.message = "宝箱转化为补给";
      }
    }
  }
}

function updateObjects(state, dt) {
  for (const object of state.objects) {
    if (!object.active) continue;
    object.flash = Math.max(0, (object.flash || 0) - dt);
    object.pulse = (object.pulse || 0) + dt;
    const d = distance(state.player, object);
    const near = d <= state.player.radius + object.radius + 18;
    if (!near) {
      object.charge = Math.max(0, object.charge - dt * 0.8);
      if (object.type === "riftSeal") {
        object.spawnTimer = Math.max(0, (object.spawnTimer || 0) - dt);
        if (object.spawnTimer <= 0) {
          const count = state.level >= 20 ? 3 : 2;
          for (let i = 0; i < count; i += 1) {
            const angle = object.pulse + i * Math.PI * 2 / count;
            state.enemies.push(makeEnemy(state, state.level >= 14 && i === 0 ? "spitter" : "swarmer", {
              x: clamp(object.x + Math.cos(angle) * 26, 24, WORLD - 24),
              y: clamp(object.y + Math.sin(angle) * 26, 24, WORLD - 24)
            }, false, { empowered: state.level >= 18 && Math.random() < 0.18 }));
          }
          object.spawnTimer = Math.max(1.1, 3.2 - state.level * 0.035);
          addBurst(state.effects, object.x, object.y, { count: 10, color: OBJECT_TYPES.riftSeal.color, secondary: classicArcade.cyan, radius: 18 });
        }
      }
      continue;
    }
    if (object.type === "crate") {
      object.charge += dt;
      if (object.charge >= 0.38) {
        object.charge = 0;
        damageObject(state, object, (18 + state.player.level * 2) * (characterSpec(state).objectDamage || 1));
      }
    } else if (object.type === "crystal") {
      object.charge += dt;
      if (object.charge >= 0.55) destroyObject(state, object, "collect");
    } else if (object.type === "shrine") {
      object.charge += dt;
      if (object.charge >= 1.1) destroyObject(state, object, "activate");
    } else if (object.type === "beacon") {
      object.charge += dt;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + dt * 1.4);
      if (object.charge >= 1.8) destroyObject(state, object, "escort");
    } else if (object.type === "riftSeal") {
      object.charge += dt;
      for (const enemy of state.enemies) {
        if (enemy.dead || distance(object, enemy) > 72 + enemy.radius) continue;
        enemy.slow = Math.max(enemy.slow || 0, 0.55);
      }
      if (object.charge >= 1.55) destroyObject(state, object, "seal");
    }
  }
  state.objects = state.objects.filter((object) => object.active);
}

function triggerStageModifierPulse(state) {
  const modifier = stageModifierSpec(state);
  if (modifier.id === "calm") return 5 + Math.random() * 2;
  if (modifier.id === "supplyTide") {
    const angle = Math.random() * Math.PI * 2;
    const point = {
      x: clamp(state.player.x + Math.cos(angle) * (48 + Math.random() * 110), 24, WORLD - 24),
      y: clamp(state.player.y + Math.sin(angle) * (48 + Math.random() * 110), 24, WORLD - 24)
    };
    state.pickups.push({ type: Math.random() < 0.22 ? "heal" : "xp", x: point.x, y: point.y, value: 10 + state.level * 1.4, radius: 8, vy: 0 });
    if (Math.random() < 0.32) spawnAmbush(state, point, "补给潮汐惊动怪群");
    addFloatingText(state.effects, point.x, point.y - 18, "补给潮", { color: modifier.color, size: 12 });
    return 5.2 + Math.random() * 2.4;
  }
  if (modifier.id === "staticStorm") {
    const targets = [...state.enemies].sort((a, b) => distance(state.player, a) - distance(state.player, b)).slice(0, 3);
    targets.forEach((enemy, index) => {
      enemy.slow = Math.max(enemy.slow || 0, 0.7);
      addBurst(state.effects, enemy.x, enemy.y, { count: 13, color: modifier.color, secondary: classicArcade.white, radius: 13 });
      damageEnemy(state, enemy, 22 + state.level * 1.6 + index * 4, "storm");
    });
    state.overdriveCharge = Math.min(100, (state.overdriveCharge || 0) + 4);
    if (targets.length) state.message = "静电风暴劈落";
    return 4.8 + Math.random() * 1.9;
  }
  if (modifier.id === "sporeBloom") {
    spawnDangerZone(state, "acid");
    if (Math.random() < 0.4) {
      for (let i = 0; i < 2; i += 1) state.enemies.push(makeEnemy(state, "swarmer", spawnPointNearPlayer(state, 260), false));
    }
    state.message = "孢子酸雾扩散";
    return 5.8 + Math.random() * 2.2;
  }
  if (modifier.id === "voidVeil") {
    spawnDangerZone(state, "rift");
    if (Math.random() < 0.36) spawnDangerZone(state, "laser");
    state.message = "夜门裂隙活跃";
    return 5.4 + Math.random() * 2;
  }
  if (modifier.id === "bloodMoon") {
    const target = nearestEnemy(state, 520);
    if (target && !target.empowered && !target.boss) {
      target.empowered = true;
      target.affix = chooseEliteAffix(state.level)?.id || target.affix;
      target.hp *= 1.35;
      target.maxHp *= 1.35;
      target.score = Math.round(target.score * 1.6);
      addFloatingText(state.effects, target.x, target.y - 22, "赤月精英", { color: modifier.color, size: 13 });
      addBurst(state.effects, target.x, target.y, { count: 18, color: modifier.color, secondary: RARITIES.evolve.color, radius: 18 });
    } else {
      spawnDangerZone(state, "meteor");
    }
    state.message = "赤月强化怪群";
    return 4.6 + Math.random() * 1.8;
  }
  return 5;
}

function updateStageModifier(state, dt) {
  const modifier = stageModifierSpec(state);
  state.modifierTimer = Math.max(0, (Number.isFinite(state.modifierTimer) ? state.modifierTimer : 4) - dt);
  if (state.modifierTimer > 0 || state.choices.length || state.bossAlive) return;
  state.modifierTimer = triggerStageModifierPulse(state);
  if (modifier.id !== "calm") addFloatingText(state.effects, state.player.x, state.player.y - 70, modifier.title, { color: modifier.color, size: 12, life: 0.68 });
}

function dangerEventTypes(level) {
  return Object.entries(DANGER_EVENTS)
    .filter(([, event]) => level >= event.unlock)
    .map(([id]) => id);
}

function makeDangerZone(state, type = "meteor") {
  const spec = DANGER_EVENTS[type] || DANGER_EVENTS.meteor;
  const angle = Math.random() * Math.PI * 2;
  const near = type === "laser" ? 70 : 64 + Math.random() * 148;
  const point = {
    x: clamp(state.player.x + Math.cos(angle) * near, 36, WORLD - 36),
    y: clamp(state.player.y + Math.sin(angle) * near, 36, WORLD - 36)
  };
  if (type === "laser") {
    point.angle = Math.random() * Math.PI;
    point.length = 210 + Math.min(180, state.level * 7);
  }
  return {
    id: `${type}:${state.time.toFixed(2)}:${Math.random().toString(36).slice(2, 7)}`,
    type,
    x: point.x,
    y: point.y,
    angle: point.angle || 0,
    length: point.length || 0,
    radius: spec.radius + Math.min(18, state.level * 0.7),
    warn: spec.warn,
    life: spec.life,
    damage: Math.round(spec.damage + state.level * 0.8),
    color: spec.color,
    triggered: false,
    tick: 0
  };
}

function spawnDangerZone(state, forcedType = null, origin = null) {
  const types = dangerEventTypes(state.level);
  if (!types.length && !forcedType) return null;
  let pool = state.activeEvent?.id === "volatile" ? [...types, "meteor", "acid"] : [...types];
  const modifierId = stageModifierSpec(state).id;
  if (modifierId === "staticStorm") pool.push("laser", "meteor");
  if (modifierId === "sporeBloom") pool.push("acid", "acid");
  if (modifierId === "voidVeil") pool.push("rift", "rift");
  if (modifierId === "bloodMoon") pool.push("meteor", "laser");
  const type = forcedType && DANGER_EVENTS[forcedType] ? forcedType : weightedPick(pool, (id) => encounterBias(state, "dangerBias", id));
  if (!type) return null;
  const zone = makeDangerZone(state, type);
  if (origin) {
    const angle = Math.random() * Math.PI * 2;
    const radius = type === "laser" ? 18 : 52 + Math.random() * 56;
    zone.x = clamp(origin.x + Math.cos(angle) * radius, 28, WORLD - 28);
    zone.y = clamp(origin.y + Math.sin(angle) * radius, 28, WORLD - 28);
    if (type === "laser") zone.angle = Math.atan2(state.player.y - zone.y, state.player.x - zone.x) + (Math.random() - 0.5) * 0.18;
  }
  state.dangerZones.push(zone);
  state.message = DANGER_EVENTS[type]?.title || "危险区域";
  return zone;
}

function distanceToLaser(zone, point) {
  const dx = Math.cos(zone.angle);
  const dy = Math.sin(zone.angle);
  const px = point.x - zone.x;
  const py = point.y - zone.y;
  const projection = clamp(px * dx + py * dy, -zone.length / 2, zone.length / 2);
  const closest = { x: zone.x + dx * projection, y: zone.y + dy * projection };
  return distance(closest, point);
}

function zoneHitsPlayer(zone, player) {
  if (zone.type === "laser") return distanceToLaser(zone, player) <= zone.radius + player.radius * 0.45;
  return distance(zone, player) <= zone.radius + player.radius;
}

function updateDangerZones(state, dt) {
  const tuning = levelTuning(state.level);
  state.hazardTimer -= dt;
  if (state.hazardTimer <= 0 && !state.choices.length) {
    spawnDangerZone(state);
    state.hazardTimer = tuning.hazardEvery * stageModifierValue(state, "hazard", 1) * (0.72 + Math.random() * 0.56) / stageHazardRate(state);
  }

  for (const zone of state.dangerZones) {
    if (zone.warn > 0) {
      zone.warn -= dt;
      if (zone.warn <= 0) {
        zone.triggered = true;
        if (zone.type === "meteor") {
          for (const enemy of state.enemies) {
            if (enemy.dead || distance(zone, enemy) > zone.radius + enemy.radius) continue;
            damageEnemy(state, enemy, 42 + state.level * 3.5, "meteor");
          }
          addBurst(state.effects, zone.x, zone.y, { count: 34, color: zone.color, secondary: classicArcade.yellow, radius: zone.radius * 0.42 });
          state.shake = Math.max(state.shake, 5);
        }
        if (zone.type === "rift") {
          const count = 4 + Math.min(8, Math.floor(state.level / 2));
          for (let i = 0; i < count; i += 1) {
            const angle = i * Math.PI * 2 / count;
            const point = {
              x: clamp(zone.x + Math.cos(angle) * 24, 24, WORLD - 24),
              y: clamp(zone.y + Math.sin(angle) * 24, 24, WORLD - 24)
            };
            state.enemies.push(makeEnemy(state, state.level >= 11 && i % 4 === 0 ? "charger" : "swarmer", point, false, { empowered: state.level >= 12 && i === 0 }));
          }
          addBurst(state.effects, zone.x, zone.y, { count: 24, color: zone.color, secondary: classicArcade.cyan, radius: 26 });
        }
      }
      continue;
    }

    zone.life -= dt;
    zone.tick -= dt;
    if (zone.tick <= 0 && zoneHitsPlayer(zone, state.player) && state.player.invuln <= 0) {
      const taken = incomingDamage(state, zone.damage);
      state.player.hp -= taken;
      recordDamageSource(state, { kind: "zone", name: dangerTitle(zone.type), sourceType: zone.type, amount: taken, raw: zone.damage });
      state.player.invuln = zone.type === "acid" ? 0.34 : 0.58;
      state.shake = Math.max(state.shake, zone.type === "meteor" ? 7 : 4);
      if (zone.type === "acid") {
        state.player.x = clamp(state.player.x + Math.cos(state.time * 9) * 7, 18, WORLD - 18);
        state.player.y = clamp(state.player.y + Math.sin(state.time * 9) * 7, 18, WORLD - 18);
      }
      triggerHitStop(state, 0.035, 0.42);
      zone.tick = zone.type === "acid" ? 0.42 : 0.68;
    }

    if (zone.type === "rift" && zone.life > 0 && zone.tick <= 0) {
      state.enemies.push(makeEnemy(state, state.level >= 7 ? "bat" : "swarmer", { x: zone.x, y: zone.y }, false));
      zone.tick = 1.15;
    }
  }

  state.dangerZones = state.dangerZones.filter((zone) => zone.warn > 0 || zone.life > 0);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
}

function updatePlayer(state, dt) {
  const c = state.controls;
  let x = c.axisX || 0;
  let y = c.axisY || 0;
  if (!x && !y) {
    x = Number(c.right) - Number(c.left);
    y = Number(c.down) - Number(c.up);
  }
  const length = Math.hypot(x, y) || 1;
  state.player.x = clamp(state.player.x + (x / length) * state.player.speed * dt, 18, WORLD - 18);
  state.player.y = clamp(state.player.y + (y / length) * state.player.speed * dt, 18, WORLD - 18);
  state.player.invuln = Math.max(0, state.player.invuln - dt);
}

function fireWeapons(state, dt) {
  state.attackTimer -= dt;
  if (state.attackTimer <= 0) {
    const target = nearestEnemy(state);
    if (target) {
      const knifeLevel = state.skills.knife || 1;
      const evolved = hasEvolution(state, "crescent");
      const shots = evolved ? Math.min(7, 2 + Math.floor(knifeLevel / 2)) : Math.min(5, 1 + Math.floor(knifeLevel / 2));
      for (let i = 0; i < shots; i += 1) {
        const angle = Math.atan2(target.y - state.player.y, target.x - state.player.x) + (i - (shots - 1) / 2) * (evolved ? 0.24 : 0.16);
        state.projectiles.push({
          type: evolved ? "crescent" : "knife",
          x: state.player.x,
          y: state.player.y,
          vx: Math.cos(angle) * (evolved ? 280 : 320),
          vy: Math.sin(angle) * (evolved ? 280 : 320),
          damage: (evolved ? 24 + knifeLevel * 8 : 16 + knifeLevel * 6) * damageMultiplier(state),
          radius: evolved ? 9 : 5,
          life: evolved ? 1.65 : 1.25,
          pierce: evolved ? 5 + Math.floor(knifeLevel / 2) : Math.floor(knifeLevel / 3),
          spin: evolved ? (i % 2 ? -1 : 1) : 0
        });
      }
    }
    state.attackTimer = Math.max(hasEvolution(state, "crescent") ? 0.18 : 0.22, 0.72 - (state.skills.knife || 1) * (hasEvolution(state, "crescent") ? 0.075 : 0.06)) * cooldownMultiplier(state);
  }
  if (state.skills.lightning) {
    state.lightningTimer -= dt;
    if (state.lightningTimer <= 0) {
      const storm = hasEvolution(state, "stormChain");
      const targets = [...state.enemies].sort((a, b) => distance(state.player, a) - distance(state.player, b)).slice(0, (storm ? 4 : 2) + state.skills.lightning);
      targets.forEach((enemy, index) => {
        if (storm) enemy.slow = Math.max(enemy.slow || 0, 1.2);
        const from = storm && index > 0 ? targets[index - 1] : state.player;
        addBolt(state.effects, from.x, from.y - (from === state.player ? 10 : 0), enemy.x, enemy.y, {
          color: storm ? RARITIES.evolve.color : classicArcade.cyan,
          secondary: classicArcade.white,
          width: storm ? 4 : 3,
          jitter: storm ? 14 : 10,
          segments: storm ? 7 : 5,
          life: storm ? 0.2 : 0.16
        });
        addBurst(state.effects, enemy.x, enemy.y, { count: storm ? 16 : 10, color: classicArcade.cyan, secondary: storm ? RARITIES.evolve.color : classicArcade.white, radius: storm ? 12 : 8 });
        damageEnemy(state, enemy, ((storm ? 34 : 24) + state.skills.lightning * (storm ? 15 : 12)) * damageMultiplier(state), storm ? "storm" : "lightning");
      });
      state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
      state.lightningTimer = Math.max(storm ? 0.62 : 0.85, 3.1 - state.skills.lightning * (storm ? 0.42 : 0.32)) * cooldownMultiplier(state);
    }
  }
  if (state.skills.drone) {
    state.droneTimer -= dt;
    if (state.droneTimer <= 0) {
      const hive = hasEvolution(state, "droneHive");
      const droneLevel = state.skills.drone;
      const targets = [...state.enemies].sort((a, b) => distance(state.player, a) - distance(state.player, b)).slice(0, (hive ? 2 : 1) + Math.floor(droneLevel / 2));
      targets.forEach((enemy, index) => {
        const angle = Math.atan2(enemy.y - state.player.y, enemy.x - state.player.x) + (index - 0.5) * 0.12;
        state.projectiles.push({
          type: hive ? "hive" : "drone",
          x: state.player.x + Math.cos(state.time * 2.4 + index) * 30,
          y: state.player.y + Math.sin(state.time * 2.4 + index) * 30,
          vx: Math.cos(angle) * (hive ? 390 : 350),
          vy: Math.sin(angle) * (hive ? 390 : 350),
          damage: (18 + droneLevel * (hive ? 9 : 7)) * damageMultiplier(state),
          radius: hive ? 5 : 4,
          life: hive ? 1.05 : 0.9,
          pierce: hive ? 2 : 1
        });
      });
      state.droneTimer = Math.max(hive ? 0.28 : 0.48, 1.35 - droneLevel * (hive ? 0.13 : 0.1)) * cooldownMultiplier(state);
    }
  }
  if (state.skills.mine) {
    state.mineTimer -= dt;
    if (state.mineTimer <= 0) {
      const seismic = hasEvolution(state, "seismicMine");
      const mineLevel = state.skills.mine;
      const count = seismic ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const angle = state.time * 2.3 + i * Math.PI;
        state.projectiles.push({
          type: seismic ? "seismicMine" : "mine",
          x: state.player.x - Math.cos(angle) * 22,
          y: state.player.y - Math.sin(angle) * 22,
          vx: 0,
          vy: 0,
          damage: (32 + mineLevel * (seismic ? 12 : 9)) * damageMultiplier(state),
          radius: seismic ? 13 : 10,
          life: seismic ? 8 : 6,
          pierce: 0,
          armed: 0.25,
          blast: seismic ? 68 : 46
        });
      }
      state.mineTimer = Math.max(seismic ? 0.72 : 1.05, 2.35 - mineLevel * 0.18) * cooldownMultiplier(state);
    }
  }
  if (state.skills.frost) {
    state.frostTimer -= dt;
    if (state.frostTimer <= 0) {
      const nova = hasEvolution(state, "iceNova");
      const frostLevel = state.skills.frost;
      const radius = (nova ? 126 : 82) + frostLevel * (nova ? 14 : 10);
      for (const enemy of state.enemies) {
        if (distance(state.player, enemy) > radius + enemy.radius) continue;
        enemy.slow = Math.max(enemy.slow || 0, nova ? 2.4 : 1.5);
        enemy.frozen = Math.max(enemy.frozen || 0, nova ? 1.2 : 0.45);
        enemy.flash = 0.14;
        damageEnemy(state, enemy, (10 + frostLevel * (nova ? 8 : 5)) * damageMultiplier(state), nova ? "iceNova" : "frost");
      }
      addBurst(state.effects, state.player.x, state.player.y, { count: nova ? 32 : 20, color: classicArcade.cyan, secondary: classicArcade.white, radius: radius * 0.42 });
      state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
      state.frostTimer = Math.max(nova ? 1.2 : 1.7, 3.6 - frostLevel * (nova ? 0.34 : 0.25)) * cooldownMultiplier(state);
    }
  }
}

function triggerRangerAbility(state, ability) {
  const target = nearestEnemy(state, 620);
  const baseAngle = target ? Math.atan2(target.y - state.player.y, target.x - state.player.x) : state.time * 0.9;
  const shots = 7 + Math.min(5, Math.floor(state.player.level / 6));
  for (let i = 0; i < shots; i += 1) {
    const angle = baseAngle + (i - (shots - 1) / 2) * 0.18;
    state.projectiles.push({
      type: "shadowVolley",
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(angle) * 390,
      vy: Math.sin(angle) * 390,
      damage: (22 + state.level * 1.4 + state.player.level * 1.8) * damageMultiplier(state),
      radius: 6,
      life: 1.05,
      pierce: 2 + Math.floor(state.player.level / 9)
    });
  }
  state.player.invuln = Math.max(state.player.invuln, 0.42);
  state.message = `${characterSpec(state).title}：${ability.title}`;
  addFloatingText(state.effects, state.player.x, state.player.y - 48, ability.title, { color: ability.color, size: 16 });
  addBurst(state.effects, state.player.x, state.player.y, { count: 22, color: ability.color, secondary: classicArcade.white, radius: 28 });
}

function triggerEngineerAbility(state, ability) {
  const angle = state.time * 1.7;
  const zone = {
    id: `sentry:${state.time.toFixed(2)}:${Math.random().toString(36).slice(2, 7)}`,
    type: "sentry",
    x: clamp(state.player.x - Math.cos(angle) * 34, 28, WORLD - 28),
    y: clamp(state.player.y - Math.sin(angle) * 34, 28, WORLD - 28),
    radius: 52 + relicLevel(state, "fieldCrown") * 3,
    range: 265 + skillLevel(state, "focus") * 18,
    tick: 0.08,
    life: 6.2 + relicLevel(state, "quickCore") * 0.35,
    color: ability.color,
    phase: Math.random() * Math.PI * 2
  };
  state.abilityZones.push(zone);
  state.message = `${characterSpec(state).title}：${ability.title}`;
  addFloatingText(state.effects, zone.x, zone.y - 30, ability.title, { color: ability.color, size: 16 });
  addBurst(state.effects, zone.x, zone.y, { count: 20, color: ability.color, secondary: classicArcade.cyan, radius: 26 });
}

function triggerArcanistAbility(state, ability) {
  const target = nearestEnemy(state, 520);
  const zone = {
    id: `vortex:${state.time.toFixed(2)}:${Math.random().toString(36).slice(2, 7)}`,
    type: "vortex",
    x: target ? target.x : state.player.x,
    y: target ? target.y : state.player.y,
    radius: 84 + skillLevel(state, "aura") * 8 + relicLevel(state, "fieldCrown") * 4,
    tick: 0.12,
    life: 4.4 + relicLevel(state, "stormBattery") * 0.25,
    color: ability.color,
    phase: Math.random() * Math.PI * 2
  };
  state.abilityZones.push(zone);
  state.message = `${characterSpec(state).title}：${ability.title}`;
  addFloatingText(state.effects, zone.x, zone.y - 34, ability.title, { color: ability.color, size: 16 });
  addBurst(state.effects, zone.x, zone.y, { count: 26, color: ability.color, secondary: "#d45cff", radius: 34 });
}

function triggerCharacterAbility(state) {
  const ability = abilitySpec(state);
  if (ability.id === "sentry") triggerEngineerAbility(state, ability);
  else if (ability.id === "vortex") triggerArcanistAbility(state, ability);
  else triggerRangerAbility(state, ability);
}

function updateAbilityZones(state, dt) {
  for (const zone of state.abilityZones) {
    zone.life -= dt;
    zone.tick -= dt;
    zone.phase = (zone.phase || 0) + dt * 3.2;
    if (zone.type === "sentry") {
      if (zone.tick <= 0) {
        const target = nearestEnemyFrom(state, zone, zone.range);
        if (target) {
          const angle = Math.atan2(target.y - zone.y, target.x - zone.x);
          state.projectiles.push({
            type: "sentry",
            x: zone.x,
            y: zone.y,
            vx: Math.cos(angle) * 410,
            vy: Math.sin(angle) * 410,
            damage: (18 + state.level * 1.15 + state.player.level * 1.15) * damageMultiplier(state),
            radius: 5,
            life: 0.82,
            pierce: 1
          });
          zone.tick = Math.max(0.18, 0.42 - skillLevel(state, "focus") * 0.025);
        } else {
          zone.tick = 0.18;
        }
      }
    } else if (zone.type === "vortex") {
      for (const enemy of state.enemies) {
        if (enemy.dead) continue;
        const d = distance(zone, enemy);
        if (d > zone.radius + enemy.radius) continue;
        const angle = Math.atan2(zone.y - enemy.y, zone.x - enemy.x);
        const pull = clamp((zone.radius - d) / zone.radius, 0.2, 1);
        enemy.x = clamp(enemy.x + Math.cos(angle) * (38 + state.level * 0.35) * pull * dt, 24, WORLD - 24);
        enemy.y = clamp(enemy.y + Math.sin(angle) * (38 + state.level * 0.35) * pull * dt, 24, WORLD - 24);
        enemy.slow = Math.max(enemy.slow || 0, 0.38);
        enemy.flash = Math.max(enemy.flash || 0, 0.04);
      }
      if (zone.tick <= 0) {
        for (const enemy of state.enemies) {
          if (enemy.dead || distance(zone, enemy) > zone.radius + enemy.radius) continue;
          damageEnemy(state, enemy, (11 + state.level * 0.82 + state.player.level * 0.7) * damageMultiplier(state), "vortex");
        }
        addBurst(state.effects, zone.x, zone.y, { count: 7, color: zone.color, secondary: "#d45cff", radius: zone.radius * 0.18, speed: 30, life: 0.2 });
        zone.tick = 0.34;
      }
    }
  }
  state.abilityZones = state.abilityZones.filter((zone) => zone.life > 0);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
}

function updateCharacterAbility(state, dt) {
  const current = Number.isFinite(state.abilityTimer) ? state.abilityTimer : abilityCooldown(state);
  state.abilityTimer = Math.max(0, current - dt);
  if (state.abilityTimer > 0) return;
  triggerCharacterAbility(state);
  state.abilityTimer = abilityCooldown(state);
}

function fireEnemyShot(state, enemy, angle, speed, damage, radius = 6) {
  state.enemyShots.push({
    x: enemy.x,
    y: enemy.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    damage,
    sourceName: enemyTitle(enemy),
    sourceType: enemy.type,
    life: 4
  });
}

function fireRadialShots(state, enemy, count, speed, damage, offset = 0) {
  for (let i = 0; i < count; i += 1) {
    const angle = offset + i * Math.PI * 2 / count;
    fireEnemyShot(state, enemy, angle, speed, damage, enemy.phaseIndex >= 2 ? 7 : 6);
  }
}

function fireAimedSpread(state, enemy, angle, count, spread, speed, damage, radius = 6) {
  for (let i = 0; i < count; i += 1) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    fireEnemyShot(state, enemy, angle + offset, speed, damage, radius);
  }
}

function summonNearBoss(state, boss, count, types = null) {
  const pool = types?.length ? types : state.level >= 14 ? ["charger", "spitter", "shield"] : ["crawler", "bat", "brute"];
  for (let i = 0; i < count; i += 1) {
    const angle = i * Math.PI * 2 / count + Math.random() * 0.6;
    const point = {
      x: clamp(boss.x + Math.cos(angle) * 74, 24, WORLD - 24),
      y: clamp(boss.y + Math.sin(angle) * 74, 24, WORLD - 24)
    };
    const type = pool[Math.floor(Math.random() * pool.length)];
    state.enemies.push(makeEnemy(state, type, point, false, { empowered: boss.phaseIndex >= 2 && Math.random() < 0.35 }));
  }
}

function bolsterBossAllies(state, boss, phase) {
  let count = 0;
  for (const ally of state.enemies) {
    if (ally === boss || ally.dead || ally.boss || distance(boss, ally) > 210 + phase * 35) continue;
    ally.hp = Math.min(ally.maxHp, ally.hp + 18 + state.level * 1.4 + phase * 12);
    ally.healPulse = 0.5;
    count += 1;
  }
  if (count) addFloatingText(state.effects, boss.x, boss.y - 42, `护卫回复 x${count}`, { color: "#ffd166", size: 13 });
}

function triggerBossSpecial(state, enemy, spec, angle) {
  const phase = enemy.phaseIndex;
  if (spec.id === "titan") {
    fireRadialShots(state, enemy, 10 + phase * 5, 92 + phase * 22, 14 + phase * 5, state.time * 0.9);
    spawnDangerZone(state, "meteor", enemy);
    if (phase >= 1) {
      enemy.chargeTime = 0.82;
      enemy.chargeAngle = angle;
      addFloatingText(state.effects, enemy.x, enemy.y - 34, "破阵冲锋", { color: spec.color, size: 15 });
    }
    state.message = `${spec.title} 破阵冲锋`;
  } else if (spec.id === "hive") {
    fireRadialShots(state, enemy, 12 + phase * 6, 86 + phase * 18, 10 + phase * 4, state.time * 1.3);
    summonNearBoss(state, enemy, 5 + phase * 3, spec.summon);
    for (let i = 0; i < 1 + phase; i += 1) spawnDangerZone(state, "rift", enemy);
    state.message = `${spec.title} 红线纸嫁`;
  } else if (spec.id === "artillery") {
    fireRadialShots(state, enemy, 8 + phase * 4, 106 + phase * 18, 15 + phase * 5, state.time * 0.7);
    for (let i = 0; i < 2 + phase; i += 1) spawnDangerZone(state, i % 2 && phase >= 1 ? "laser" : "meteor", enemy);
    if (phase >= 1) summonNearBoss(state, enemy, 2 + phase, spec.summon);
    state.message = `${spec.title} 伞影雷雨`;
  } else {
    bolsterBossAllies(state, enemy, phase);
    fireRadialShots(state, enemy, 9 + phase * 4, 74 + phase * 16, 11 + phase * 4, state.time * 1.1);
    summonNearBoss(state, enemy, 3 + phase * 2, spec.summon);
    spawnDangerZone(state, "acid", enemy);
    state.message = `${spec.title} 百目审判`;
  }
  addBurst(state.effects, enemy.x, enemy.y, { count: 24 + phase * 8, color: spec.color, secondary: classicArcade.white, radius: 26 + phase * 8 });
}

function updateBossEnemy(state, enemy, dt, angle) {
  const spec = bossSpec(enemy);
  const hpRatio = clamp(enemy.hp / enemy.maxHp, 0, 1);
  const nextPhase = hpRatio < 0.34 ? 2 : hpRatio < 0.67 ? 1 : 0;
  if (nextPhase !== enemy.phaseIndex) {
    enemy.phaseIndex = nextPhase;
    enemy.special = 0.35;
    state.message = nextPhase === 2 ? `${spec.title} 狂暴` : `${spec.title} 二阶段`;
    addFloatingText(state.effects, enemy.x, enemy.y - 36, state.message, { color: RARITIES.evolve.color, size: 18 });
    addFloatingText(state.effects, enemy.x, enemy.y - 55, spec.hint, { color: classicArcade.white, size: 10, life: 1.45 });
    addBurst(state.effects, enemy.x, enemy.y, { count: 28, color: classicArcade.red, secondary: RARITIES.evolve.color, radius: 30 });
  }

  if (enemy.chargeTime > 0) {
    enemy.chargeTime -= dt;
    enemy.x = clamp(enemy.x + Math.cos(enemy.chargeAngle) * (180 + state.level * 1.5) * dt, 24, WORLD - 24);
    enemy.y = clamp(enemy.y + Math.sin(enemy.chargeAngle) * (180 + state.level * 1.5) * dt, 24, WORLD - 24);
  } else {
    const playerDistance = distance(enemy, state.player);
    const desiredRange = spec.id === "artillery" ? 250 : spec.id === "hive" ? 190 : spec.id === "warden" ? 150 : 0;
    const drift = Math.sin(state.time * 1.7 + enemy.phase) * 0.28;
    let moveAngle = angle + drift;
    if (desiredRange && playerDistance < desiredRange) moveAngle = angle + Math.PI + drift * 1.6;
    else if (desiredRange && playerDistance < desiredRange + 85) moveAngle = angle + Math.PI / 2 * Math.sign(Math.sin(state.time * 1.3 + enemy.phase));
    enemy.x += Math.cos(moveAngle) * enemy.speed * (1 + enemy.phaseIndex * 0.18) * dt;
    enemy.y += Math.sin(moveAngle) * enemy.speed * (1 + enemy.phaseIndex * 0.18) * dt;
  }

  enemy.shoot -= dt;
  if (enemy.shoot <= 0) {
    const phase = enemy.phaseIndex;
    if (spec.id === "titan") fireAimedSpread(state, enemy, angle, phase >= 1 ? 3 : 1, 0.22, 112 + phase * 24, 18 + phase * 5, 7);
    else if (spec.id === "hive") fireAimedSpread(state, enemy, angle, 3 + phase, 0.24, 96 + phase * 20, 10 + phase * 4, 5);
    else if (spec.id === "artillery") {
      fireAimedSpread(state, enemy, angle, phase >= 2 ? 3 : 1, 0.14, 136 + phase * 22, 20 + phase * 6, 8);
      if (phase >= 1 && Math.random() < 0.28) spawnDangerZone(state, "meteor", enemy);
    } else {
      fireAimedSpread(state, enemy, angle, 2 + phase, 0.28, 82 + phase * 14, 12 + phase * 4, 6);
      if (phase >= 1 && Math.random() < 0.34) bolsterBossAllies(state, enemy, phase);
    }
    enemy.shoot = Math.max(0.48, (spec.id === "artillery" ? 1.45 : spec.id === "hive" ? 0.98 : 1.2) - phase * 0.16);
  }

  enemy.special -= dt;
  if (enemy.special <= 0) {
    triggerBossSpecial(state, enemy, spec, angle);
    enemy.special = Math.max(2.05, 4.25 - enemy.phaseIndex * 0.62 - state.level * 0.018);
  }
}

function updateEnemies(state, dt) {
  for (const enemy of state.enemies) {
    const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
    const playerDistance = distance(enemy, state.player);
    enemy.flash = Math.max(0, (enemy.flash || 0) - dt);
    enemy.slow = Math.max(0, (enemy.slow || 0) - dt);
    enemy.frozen = Math.max(0, (enemy.frozen || 0) - dt);
    enemy.healPulse = Math.max(0, (enemy.healPulse || 0) - dt);
    if (enemy.boss) {
      updateBossEnemy(state, enemy, dt, angle);
      continue;
    }

    const slow = enemy.frozen > 0 ? 0.25 : enemy.slow > 0 ? 0.55 : 1;
    if (enemy.chargeTime > 0) {
      enemy.chargeTime -= dt;
      enemy.x += Math.cos(enemy.chargeAngle) * enemy.speed * 2.75 * slow * dt;
      enemy.y += Math.sin(enemy.chargeAngle) * enemy.speed * 2.75 * slow * dt;
      continue;
    }

    if (enemy.type === "bomber") {
      if (!enemy.fuse && (playerDistance < 56 || enemy.hp / enemy.maxHp < 0.28)) {
        enemy.fuse = 0.82;
        addFloatingText(state.effects, enemy.x, enemy.y - 20, "警告", { color: "#ffb84d", size: 12 });
      }
      if (enemy.fuse > 0) {
        enemy.fuse -= dt;
        if (enemy.fuse <= 0) {
          detonateBomber(state, enemy, true);
          continue;
        }
      }
    }

    if (enemy.type === "charger") {
      enemy.special -= dt;
      if (enemy.special <= 0 && playerDistance < 260) {
        enemy.chargeTime = 0.42;
        enemy.chargeAngle = angle;
        enemy.special = 2.4 + Math.random() * 0.8;
        addFloatingText(state.effects, enemy.x, enemy.y - 22, "夜叉冲锋", { color: enemy.color, size: 12 });
      }
    }

    if (enemy.type === "warden") {
      enemy.special -= dt;
      if (enemy.special <= 0) {
        let healed = 0;
        for (const ally of state.enemies) {
          if (ally === enemy || ally.dead || ally.hp >= ally.maxHp || distance(enemy, ally) > 96) continue;
          ally.hp = Math.min(ally.maxHp, ally.hp + 9 + state.level * 0.9);
          ally.healPulse = 0.34;
          healed += 1;
          if (healed >= 5) break;
        }
        if (healed) {
          addBurst(state.effects, enemy.x, enemy.y, { count: 12, color: "#ffd166", secondary: "#8ce8bd", radius: 20 });
          addFloatingText(state.effects, enemy.x, enemy.y - 24, `治疗 x${healed}`, { color: "#ffd166", size: 12 });
        }
        enemy.special = 2.7;
      }
    }

    const wave = Math.sin(state.time * 2.2 + enemy.phase) * (enemy.type === "bat" ? 0.55 : enemy.type === "swarmer" ? 0.72 : 0.2);
    if (enemy.type === "sniper") {
      const strafe = angle + Math.PI / 2 * (Math.sin(enemy.phase) > 0 ? 1 : -1);
      const moveAngle = playerDistance < 176 ? angle + Math.PI : playerDistance > 285 ? angle : strafe;
      const moveSpeed = playerDistance > 176 && playerDistance < 285 ? enemy.speed * 0.72 : enemy.speed;
      enemy.x += Math.cos(moveAngle + wave * 0.3) * moveSpeed * slow * dt;
      enemy.y += Math.sin(moveAngle + wave * 0.3) * moveSpeed * slow * dt;
    } else {
      const fuseSlow = enemy.fuse > 0 ? 0.55 : 1;
      enemy.x += Math.cos(angle + wave) * enemy.speed * slow * fuseSlow * dt;
      enemy.y += Math.sin(angle + wave) * enemy.speed * slow * fuseSlow * dt;
    }
    enemy.shoot -= dt;
    if (enemy.shoot <= 0 && (enemy.type === "spitter" || enemy.type === "sniper")) {
      const sniper = enemy.type === "sniper";
      fireEnemyShot(state, enemy, angle, sniper ? 138 : 86, sniper ? 13 : 10, sniper ? 6 : 5);
      enemy.shoot = sniper ? 1.65 : 2.1;
    }
  }
}

function updateProjectiles(state, dt) {
  for (const projectile of state.projectiles) {
    if (projectile.armed !== undefined) projectile.armed = Math.max(0, projectile.armed - dt);
    if (projectile.pulse) projectile.pulse -= dt;
    if (projectile.type === "crescent" && projectile.spin) {
      const angle = Math.atan2(projectile.vy, projectile.vx) + projectile.spin * dt * 1.25;
      const speed = Math.hypot(projectile.vx, projectile.vy);
      projectile.vx = Math.cos(angle) * speed;
      projectile.vy = Math.sin(angle) * speed;
    }
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
  }
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = state.projectiles[i];
    if (projectile.type === "mine" || projectile.type === "seismicMine") {
      const armed = (projectile.armed || 0) <= 0;
      const trigger = armed && state.enemies.some((enemy) => !enemy.dead && distance(projectile, enemy) <= projectile.blast);
      if (trigger || projectile.life <= 0) {
        const seismic = projectile.type === "seismicMine";
        for (const enemy of state.enemies) {
          const d = distance(projectile, enemy);
          if (d > projectile.blast + enemy.radius) continue;
          const falloff = clamp(1 - d / (projectile.blast + enemy.radius), 0.3, 1);
          if (seismic) enemy.slow = Math.max(enemy.slow || 0, 1.15);
          damageEnemy(state, enemy, projectile.damage * falloff, projectile.type);
        }
        addBurst(state.effects, projectile.x, projectile.y, { count: seismic ? 28 : 18, color: seismic ? RARITIES.evolve.color : classicArcade.red, secondary: classicArcade.yellow, radius: projectile.blast * 0.38 });
        state.projectiles.splice(i, 1);
        continue;
      }
    }
    let hit = false;
    for (const enemy of state.enemies) {
      if (enemy.dead || distance(projectile, enemy) > projectile.radius + enemy.radius) continue;
      hit = true;
      if (damageEnemy(state, enemy, projectile.damage, projectile.type)) {
        // Enemy removal happens below so multiple systems can finish cleanly.
      }
      projectile.pierce -= 1;
      if (projectile.pierce < 0) break;
    }
    if (projectile.pierce >= 0) {
      for (const object of state.objects) {
        if (!object.active || object.type !== "crate" || distance(projectile, object) > projectile.radius + object.radius) continue;
        hit = true;
        damageObject(state, object, projectile.damage * 0.7);
        projectile.pierce -= 1;
        if (projectile.pierce < 0) break;
      }
    }
    if (projectile.life <= 0 || hit && projectile.pierce < 0) state.projectiles.splice(i, 1);
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
  state.objects = state.objects.filter((object) => object.active);
}

function updatePassiveDamage(state, dt) {
  if (state.skills.aura) {
    const plague = hasEvolution(state, "plagueAura");
    const radius = (plague ? 58 : 42) + state.skills.aura * (plague ? 14 : 12);
    for (const enemy of state.enemies) {
      if (distance(state.player, enemy) <= radius + enemy.radius) {
          enemy.hp -= ((plague ? 18 : 10) + state.skills.aura * (plague ? 7 : 4)) * dt * damageMultiplier(state);
        enemy.killSource = plague ? "plague" : "aura";
        enemy.flash = 0.05;
      }
    }
  }
  if (state.skills.orbit) {
    const saw = hasEvolution(state, "sawHalo");
    const count = (saw ? 2 : 1) + Math.floor(state.skills.orbit / (saw ? 1.7 : 2));
    const orbitRadius = saw ? 52 : 42;
    for (let i = 0; i < count; i += 1) {
      const angle = state.time * (saw ? 3.2 : 1.9) + state.skills.orbit * 0.12 + i * Math.PI * 2 / count;
      const orb = { x: state.player.x + Math.cos(angle) * orbitRadius, y: state.player.y + Math.sin(angle) * orbitRadius };
      for (const enemy of state.enemies) {
        if (distance(orb, enemy) <= enemy.radius + (saw ? 12 : 8)) {
          enemy.hp -= ((saw ? 30 : 18) + state.skills.orbit * (saw ? 8 : 5)) * dt * damageMultiplier(state);
          enemy.killSource = saw ? "saw" : "orbit";
          enemy.x += Math.cos(angle) * (saw ? 32 : 18) * dt;
          enemy.y += Math.sin(angle) * (saw ? 32 : 18) * dt;
        }
      }
    }
    if (saw) {
      for (let i = state.enemyShots.length - 1; i >= 0; i -= 1) {
        const shot = state.enemyShots[i];
        if (distance(state.player, shot) <= orbitRadius + 18) {
          addBurst(state.effects, shot.x, shot.y, { count: 8, color: classicArcade.blue, secondary: classicArcade.white, radius: 8 });
          state.enemyShots.splice(i, 1);
        }
      }
    }
  }
  state.enemies.forEach((enemy) => {
    if (enemy.hp <= 0) damageEnemy(state, enemy, 0, enemy.killSource || "aura");
  });
  state.enemies = state.enemies.filter((enemy) => !enemy.dead && enemy.hp > 0);
}

function updateEnemyShots(state, dt) {
  for (const shot of state.enemyShots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
  }
  for (let i = state.enemyShots.length - 1; i >= 0; i -= 1) {
    const shot = state.enemyShots[i];
    if (shot.life <= 0) {
      state.enemyShots.splice(i, 1);
      continue;
    }
    if (distance(shot, state.player) <= shot.radius + state.player.radius && state.player.invuln <= 0) {
      const taken = incomingDamage(state, shot.damage);
      state.player.hp -= taken;
      recordDamageSource(state, { kind: "shot", name: shot.sourceName, sourceType: shot.sourceType, amount: taken, raw: shot.damage });
      state.player.invuln = 0.55;
      state.enemyShots.splice(i, 1);
      state.shake = Math.max(state.shake, 4);
      triggerHitStop(state, 0.035, 0.5);
    }
  }
}

function updatePlayerDamage(state) {
  if (state.player.invuln > 0) return;
  const hit = state.enemies.find((enemy) => distance(enemy, state.player) <= enemy.radius + state.player.radius);
  if (!hit) return;
  const taken = incomingDamage(state, hit.damage);
  state.player.hp -= taken;
  recordDamageSource(state, { kind: "enemy", name: enemyTitle(hit), sourceType: hit.type, amount: taken, raw: hit.damage });
  if (hit.affix === "leecher") {
    hit.hp = Math.min(hit.maxHp, hit.hp + 10 + state.level * 1.5);
    hit.healPulse = 0.42;
    addFloatingText(state.effects, hit.x, hit.y - 22, "吸血", { color: affixSpec(hit.affix)?.color || RARITIES.evolve.color, size: 12 });
  }
  state.player.invuln = 0.62;
  state.shake = Math.max(state.shake, 5);
  addBurst(state.effects, state.player.x, state.player.y, { count: 12, color: classicArcade.red, secondary: classicArcade.white, radius: 8 });
  triggerHitStop(state, 0.045, 0.42);
}

function advanceLevel(state, context) {
  if (state.level >= state.maxLevel) {
    finish(state, true, context);
    return;
  }
  const objectiveDone = Boolean(state.stageObjective?.done);
  if (!objectiveDone) {
    state.objectiveStreak = 0;
    state.pressureDebt = Math.min(5, (state.pressureDebt || 0) + 1);
  }
  state.level += 1;
  state.time = 0;
  state.stageKills = 0;
  state.stageProgress = 0;
  state.progressSources = defaultProgressSources();
  state.timePressureApplied = false;
  state.enemies = [];
  state.dangerZones = [];
  state.abilityZones = [];
  state.projectiles = [];
  state.enemyShots = [];
  state.pickups = [];
  setupStageObjects(state);
  state.spawnTimer = 0.55;
  state.eventTimer = (7 + Math.random() * 3) / stageEventRate(state);
  state.eventChain = 0;
  state.hazardTimer = Math.max(3.4, levelTuning(state.level).hazardEvery * 0.65 / stageHazardRate(state));
  state.activeEvent = null;
  state.droneTimer = 1.2;
  state.mineTimer = 1.6;
  state.frostTimer = 2.2;
  state.abilityTimer = Math.min(state.abilityTimer || abilityCooldown(state), 2.8);
  state.modifierTimer = 2.6 + Math.random() * 1.8;
  state.bossSpawned = false;
  state.bossAlive = false;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + (objectiveDone ? 30 : 16));
  state.player.invuln = 1.2;
  state.message = objectiveDone ? `${stageDisplayName(state.level)}：目标连胜 ${state.objectiveStreak}` : `${stageDisplayName(state.level)}：目标失守，压力上升`;
  addBurst(state.effects, state.player.x, state.player.y, { count: 28, color: classicArcade.green, secondary: classicArcade.yellow, radius: 24 });
  context.playSound?.("win");
}

function finish(state, won, context) {
  if (state.over) return;
  state.over = true;
  state.won = won;
  const detail = won ? "完成全部怪潮" : deathDetail(state);
  state.message = won ? "完成全部怪潮" : detail;
  context.clearSession?.();
  context.reportResult?.({
    outcome: won ? "win" : "loss",
    detail,
    extra: resultExtra(state, won),
    score: state.score,
    moves: Math.round(state.time)
  });
}

function update(state, dt, context) {
  if (state.over || state.choices.length) return;
  ensureStageSetup(state);
  const tuning = levelTuning(state.level);
  state.time += dt;
  state.comboTimer = Math.max(0, (state.comboTimer || 0) - dt);
  if (state.comboTimer <= 0) state.combo = 0;
  state.overdrive = Math.max(0, (state.overdrive || 0) - dt);
  updateWaveDirector(state, dt);
  updateDangerZones(state, dt);
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    const phase = stagePhaseForState(state);
    const burst = Math.max(1, tuning.spawnBurst + (phase.burstBonus || 0) + (state.activeEvent?.burst || 1) - 1);
    for (let i = 0; i < burst; i += 1) spawnEnemy(state);
    state.spawnTimer = tuning.spawnEvery * stageSpawnScale(state) * (state.activeEvent?.spawnScale || 1) * stageModifierValue(state, "spawn", 1);
  }
  const progressReady = (state.stageProgress || 0) >= stageProgressGoal(state.level);
  const bossReady = (state.stageProgress || 0) >= stageBossProgressGoal(state.level);
  if (tuning.bossStage && bossReady) spawnBoss(state);
  if (state.time >= tuning.duration && !state.timePressureApplied && !progressReady) {
    state.timePressureApplied = true;
    state.pressureDebt = Math.min(5, (state.pressureDebt || 0) + 1);
    state.eventTimer = Math.min(state.eventTimer, 0.5);
    state.message = "长夜加深：击破百鬼推进镇夜进度";
    addFloatingText(state.effects, state.player.x, state.player.y - 58, "长夜加深", { color: classicArcade.red, size: 18 });
  }
  updateStageModifier(state, dt);
  updatePlayer(state, dt);
  updateEnemies(state, dt);
  updateCharacterAbility(state, dt);
  updateAbilityZones(state, dt);
  updateProjectiles(state, dt);
  updatePassiveDamage(state, dt);
  updateEnemyShots(state, dt);
  updateObjects(state, dt);
  fireWeapons(state, dt);
  collectPickups(state);
  updatePlayerDamage(state);
  updateEffects(state.effects, dt);
  updateFeedback(state, dt, [state.enemies]);
  state.shake = Math.max(0, state.shake - dt * 18);
  if (state.player.hp <= 0) finish(state, false, context);
  if (progressReady && !state.bossAlive && (!tuning.bossStage || state.bossSpawned)) advanceLevel(state, context);
}

function drawGrid(ctx, camera, state) {
  const modifier = stageModifierSpec(state);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  const bg = ctx.createRadialGradient(camera.x + W * 0.45, camera.y + H * 0.42, 20, camera.x + W * 0.5, camera.y + H * 0.5, 760);
  bg.addColorStop(0, modifier.id === "bloodMoon" ? "#3a1722" : modifier.id === "voidVeil" ? "#24183b" : modifier.id === "sporeBloom" ? "#16392b" : "#183638");
  bg.addColorStop(0.46, modifier.id === "staticStorm" ? "#132c3d" : modifier.id === "supplyTide" ? "#133329" : "#10252b");
  bg.addColorStop(1, "#0a1022");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD, WORLD);
  ctx.strokeStyle = "rgba(123,212,255,.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,209,102,.055)";
  ctx.lineWidth = 2;
  for (let x = -WORLD; x < WORLD * 2; x += 260) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + WORLD * 0.8, WORLD);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(56,210,124,.075)";
  for (let x = 90; x < WORLD; x += 210) {
    for (let y = 120; y < WORLD; y += 240) {
      const wobble = Math.sin(x * 0.03 + y * 0.02) * 18;
      ctx.beginPath();
      ctx.ellipse(x + wobble, y - wobble * 0.5, 34, 16, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "rgba(123,212,255,.04)";
  for (let x = 150; x < WORLD; x += 330) {
    for (let y = 170; y < WORLD; y += 310) {
      ctx.beginPath();
      ctx.arc(x + Math.sin(y) * 20, y + Math.cos(x) * 18, 46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (modifier.id !== "calm") {
    ctx.fillStyle = `${modifier.color}18`;
    const offset = (state.time * 18) % 120;
    for (let x = 40; x < WORLD; x += 170) {
      for (let y = 50; y < WORLD; y += 180) {
        const wobble = Math.sin(state.time * 0.8 + x * 0.02 + y * 0.01);
        ctx.beginPath();
        if (modifier.id === "staticStorm") {
          ctx.rect(x + wobble * 8, y + ((offset + x) % 120) - 60, 3, 18);
        } else {
          ctx.arc(x + wobble * 10, y - wobble * 8, modifier.id === "bloodMoon" ? 5 : 7, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, r) {
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
}

function glowCircle(ctx, x, y, radius, color, alpha = 0.28) {
  const glow = ctx.createRadialGradient(x, y, 1, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function createSprite(key, draw) {
  if (SPRITE_CACHE.has(key)) return SPRITE_CACHE.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const sprite = canvas.getContext("2d");
  sprite.translate(SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  draw(sprite);
  SPRITE_CACHE.set(key, canvas);
  return canvas;
}

function spriteGradient(ctx, color, dark = "#08131d", light = "#f8fbff") {
  const gradient = ctx.createLinearGradient(-30, -34, 30, 34);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.22, color);
  gradient.addColorStop(1, dark);
  return gradient;
}

function drawSpriteImage(ctx, sprite, scale = 1) {
  const size = SPRITE_SIZE * scale;
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
}

function renderEnemySprite(ctx, type, color, affixId, boss = false, bossKind = "titan") {
  const affix = affixSpec(affixId);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = boss ? 18 : affix ? 12 : 7;
  ctx.fillStyle = "rgba(0,0,0,.24)";
  ctx.beginPath();
  ctx.ellipse(0, 25, boss ? 28 : 22, boss ? 10 : 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (boss) {
    if (bossKind === "hive") {
      ctx.fillStyle = "rgba(212,92,255,.22)";
      ctx.beginPath();
      ctx.ellipse(-25, -4, 28, 16, -0.45, 0, Math.PI * 2);
      ctx.ellipse(25, -4, 28, 16, 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = spriteGradient(ctx, color, "#251038", "#f4d6ff");
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const r = i % 2 ? 21 : 35;
        const a = -Math.PI / 2 + i * Math.PI / 4;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (bossKind === "artillery") {
      ctx.fillStyle = "#351305";
      roundedRectPath(ctx, -30, -25, 60, 56, 15);
      ctx.fill();
      ctx.fillStyle = spriteGradient(ctx, color, "#5a1b08", "#ffd7a3");
      ctx.beginPath();
      ctx.moveTo(0, -40);
      ctx.lineTo(34, 18);
      ctx.lineTo(14, 34);
      ctx.lineTo(-14, 34);
      ctx.lineTo(-34, 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f8fbff";
      ctx.fillRect(-7, -50, 14, 38);
    } else if (bossKind === "warden") {
      ctx.fillStyle = "#2f250c";
      ctx.beginPath();
      ctx.moveTo(0, -42);
      ctx.quadraticCurveTo(40, -28, 34, 11);
      ctx.quadraticCurveTo(24, 42, 0, 48);
      ctx.quadraticCurveTo(-24, 42, -34, 11);
      ctx.quadraticCurveTo(-40, -28, 0, -42);
      ctx.fill();
      ctx.fillStyle = spriteGradient(ctx, color, "#6b5314", "#fff3b8");
      ctx.beginPath();
      ctx.arc(0, -4, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#143b2e";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, -29);
      ctx.lineTo(0, 22);
      ctx.moveTo(-21, -2);
      ctx.lineTo(21, -2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#2a0714";
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const r = i % 2 ? 25 : 39;
        const a = -Math.PI / 2 + i * Math.PI / 6;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = spriteGradient(ctx, color, "#3a0d1c", "#ffd166");
      ctx.beginPath();
      ctx.ellipse(0, 2, 27, 33, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff3a3";
    ctx.beginPath();
    ctx.arc(0, -3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (type === "bat") {
    ctx.fillStyle = spriteGradient(ctx, color, "#0b1830", "#d8f7ff");
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-38, -24);
    ctx.quadraticCurveTo(-32, 2, -13, 9);
    ctx.lineTo(0, 25);
    ctx.lineTo(13, 9);
    ctx.quadraticCurveTo(32, 2, 38, -24);
    ctx.lineTo(6, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#081322";
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "swarmer") {
    ctx.fillStyle = spriteGradient(ctx, color, "#073621", "#f8fbff");
    ctx.beginPath();
    ctx.moveTo(0, -29);
    ctx.lineTo(22, 12);
    ctx.lineTo(7, 9);
    ctx.lineTo(0, 27);
    ctx.lineTo(-7, 9);
    ctx.lineTo(-22, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(248,251,255,.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(-31, -13);
    ctx.moveTo(12, -4);
    ctx.lineTo(31, -13);
    ctx.stroke();
  } else if (type === "brute") {
    ctx.fillStyle = "#3c2512";
    roundedRectPath(ctx, -27, -22, 54, 52, 14);
    ctx.fill();
    ctx.fillStyle = spriteGradient(ctx, color, "#5b3317", "#ffe1a8");
    roundedRectPath(ctx, -21, -31, 42, 48, 12);
    ctx.fill();
    ctx.fillStyle = "rgba(60,37,18,.55)";
    ctx.fillRect(-19, 4, 38, 10);
  } else if (type === "spitter") {
    ctx.fillStyle = "#0a2b24";
    ctx.beginPath();
    ctx.ellipse(0, 7, 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spriteGradient(ctx, color, "#0c4235", "#d7ffe9");
    ctx.beginPath();
    ctx.arc(0, -16, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4d5e";
    ctx.beginPath();
    ctx.arc(0, -14, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "bomber") {
    ctx.fillStyle = "#3d0d0a";
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spriteGradient(ctx, color, "#5a140a", "#ffe3a1");
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 ? 18 : 30;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "charger") {
    ctx.fillStyle = spriteGradient(ctx, color, "#2b0921", "#ffd4e6");
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(26, 20);
    ctx.lineTo(7, 12);
    ctx.lineTo(0, 33);
    ctx.lineTo(-7, 12);
    ctx.lineTo(-26, 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(-4, -25, 8, 24);
  } else if (type === "shield") {
    ctx.fillStyle = spriteGradient(ctx, color, "#1e2b33", "#ffffff");
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(31, -24, 29, 4);
    ctx.quadraticCurveTo(21, 31, 0, 40);
    ctx.quadraticCurveTo(-21, 31, -29, 4);
    ctx.quadraticCurveTo(-31, -24, 0, -34);
    ctx.fill();
    ctx.strokeStyle = "#7bd4ff";
    ctx.lineWidth = 4;
    ctx.stroke();
  } else if (type === "warden") {
    ctx.fillStyle = "#2b220f";
    roundedRectPath(ctx, -25, -30, 50, 58, 16);
    ctx.fill();
    ctx.fillStyle = spriteGradient(ctx, color, "#4f3e14", "#fff2b3");
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(30, -2);
    ctx.lineTo(18, 31);
    ctx.lineTo(-18, 31);
    ctx.lineTo(-30, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#143b2e";
    ctx.fillRect(-5, -23, 10, 41);
    ctx.fillRect(-17, -6, 34, 10);
  } else if (type === "sniper") {
    ctx.fillStyle = "#111a37";
    ctx.beginPath();
    ctx.ellipse(0, 5, 23, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spriteGradient(ctx, color, "#1a2856", "#e6edff");
    ctx.beginPath();
    ctx.moveTo(0, -35);
    ctx.lineTo(22, 15);
    ctx.lineTo(0, 30);
    ctx.lineTo(-22, 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#7bd4ff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(0, -45);
    ctx.stroke();
  } else if (type === "elite") {
    ctx.fillStyle = spriteGradient(ctx, color, "#2a1038", "#f1dcff");
    ctx.beginPath();
    for (let i = 0; i < 12; i += 1) {
      const r = i % 2 ? 18 : 34;
      const a = -Math.PI / 2 + i * Math.PI / 6;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#211033";
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = spriteGradient(ctx, color, "#2a1014", "#ffd2d2");
    ctx.beginPath();
    ctx.ellipse(0, 0, 23, 29, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(248,251,255,.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * 15, -8);
      ctx.lineTo(side * 37, -20);
      ctx.moveTo(side * 16, 5);
      ctx.lineTo(side * 38, 17);
      ctx.moveTo(side * 11, 19);
      ctx.lineTo(side * 28, 33);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#050a0f";
  ctx.beginPath();
  ctx.arc(-7, -8, 4, 0, Math.PI * 2);
  ctx.arc(7, -8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(248,251,255,.85)";
  ctx.beginPath();
  ctx.arc(-8, -9, 1.4, 0, Math.PI * 2);
  ctx.arc(6, -9, 1.4, 0, Math.PI * 2);
  ctx.fill();

  if (affix) {
    ctx.strokeStyle = affix.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 39, -Math.PI * 0.82, Math.PI * 0.82);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemySprite(ctx, enemy, scale) {
  const key = `enemy:${enemy.type}:${enemy.color}:${enemy.affix || "none"}:${enemy.boss ? enemy.bossKind || "boss" : "normal"}`;
  const sprite = createSprite(key, (spriteCtx) => renderEnemySprite(spriteCtx, enemy.type, enemy.color, enemy.affix, enemy.boss, enemy.bossKind));
  const sizeScale = scale * (enemy.boss ? 0.92 : 0.58);
  drawSpriteImage(ctx, sprite, sizeScale);
  return true;
}

function renderHeroSprite(ctx, character) {
  const color = character.color;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(0, 27, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  const armor = spriteGradient(ctx, color, "#07131d", "#f8fbff");
  ctx.fillStyle = "#08131d";
  ctx.beginPath();
  ctx.moveTo(0, -43);
  ctx.lineTo(30, 12);
  ctx.lineTo(10, 38);
  ctx.lineTo(0, 22);
  ctx.lineTo(-10, 38);
  ctx.lineTo(-30, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(19, 8);
  ctx.lineTo(0, 31);
  ctx.lineTo(-19, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(248,251,255,.45)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(5,12,18,.88)";
  roundedRectPath(ctx, -12, -20, 24, 26, 8);
  ctx.fill();
  ctx.fillStyle = character.id === "arcanist" ? "#d45cff" : character.id === "engineer" ? "#ffd166" : "#7bd4ff";
  roundedRectPath(ctx, -7, -14, 14, 16, 5);
  ctx.fill();
  ctx.fillStyle = "#f8fbff";
  ctx.beginPath();
  ctx.arc(0, -27, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.lineTo(-42, -9);
  ctx.moveTo(24, 0);
  ctx.lineTo(42, -9);
  ctx.stroke();

  if (character.id === "engineer") {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 2, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    for (let i = 0; i < 6; i += 1) {
      const a = i * Math.PI / 3;
      ctx.fillRect(Math.cos(a) * 33 - 4, Math.sin(a) * 33 - 4, 8, 8);
    }
  } else if (character.id === "arcanist") {
    ctx.strokeStyle = "#7bd4ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -1, 38, Math.PI * 0.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.fillStyle = "#d45cff";
    ctx.beginPath();
    ctx.arc(0, -45, 7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawBlade(ctx, -31, -16, -0.8, 0.9, "#ffd166");
    drawBlade(ctx, 31, -16, 0.8, 0.9, "#ffd166");
  }
  ctx.restore();
}

function drawHeroSprite(ctx, state, character) {
  const key = `hero:${character.id}`;
  const sprite = createSprite(key, (spriteCtx) => renderHeroSprite(spriteCtx, character));
  const bob = Math.sin(state.time * 5) * 1.2;
  ctx.save();
  ctx.translate(0, bob);
  drawSpriteImage(ctx, sprite, 0.62);
  ctx.restore();
}

function drawDroneCompanions(ctx, p, state) {
  if (!state.skills.drone && !hasEvolution(state, "droneHive")) return;
  const count = hasEvolution(state, "droneHive") ? 3 : Math.max(1, Math.floor((state.skills.drone || 0) / 2));
  for (let i = 0; i < count; i += 1) {
    const a = state.time * 2.3 + i * Math.PI * 2 / count;
    const x = p.x + Math.cos(a) * 28;
    const y = p.y + Math.sin(a) * 28;
    glowCircle(ctx, x, y, 14, hasEvolution(state, "droneHive") ? RARITIES.evolve.color : classicArcade.cyan, 0.34);
    ctx.fillStyle = hasEvolution(state, "droneHive") ? RARITIES.evolve.color : classicArcade.cyan;
    roundedRectPath(ctx, x - 5, y - 4, 10, 8, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(248,251,255,.75)";
    ctx.fillRect(x - 2, y - 1, 4, 2);
  }
}

function drawDangerZone(ctx, state, zone) {
  const p = worldToScreen(state, zone.x, zone.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = zone.warn > 0 ? 0.72 : 0.9;
  if (zone.type === "laser") {
    ctx.rotate(zone.angle);
    ctx.fillStyle = zone.warn > 0 ? "rgba(123,212,255,.09)" : "rgba(123,212,255,.24)";
    roundedRectPath(ctx, -zone.length / 2, -zone.radius, zone.length, zone.radius * 2, zone.radius);
    ctx.fill();
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = zone.warn > 0 ? 2 : 4;
    ctx.setLineDash(zone.warn > 0 ? [8, 7] : []);
    ctx.beginPath();
    ctx.moveTo(-zone.length / 2, 0);
    ctx.lineTo(zone.length / 2, 0);
    ctx.stroke();
  } else {
    const pulse = zone.warn > 0 ? 1 + Math.sin(state.time * 14) * 0.06 : 1 + Math.sin(state.time * 4) * 0.03;
    glowCircle(ctx, 0, 0, zone.radius * 1.9, zone.color, zone.warn > 0 ? 0.18 : 0.34);
    ctx.fillStyle = zone.warn > 0 ? "rgba(255,255,255,.035)" : zone.type === "acid" ? "rgba(140,232,189,.18)" : zone.type === "rift" ? "rgba(212,92,255,.18)" : "rgba(255,107,44,.18)";
    ctx.beginPath();
    ctx.arc(0, 0, zone.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = zone.warn > 0 ? 2 : 3;
    ctx.setLineDash(zone.warn > 0 ? [6, 5] : []);
    ctx.beginPath();
    ctx.arc(0, 0, zone.radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (zone.type === "rift" && zone.warn <= 0) {
      ctx.strokeStyle = "rgba(248,251,255,.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, zone.radius * 0.42 + Math.sin(state.time * 6) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawAbilityZone(ctx, state, zone) {
  const p = worldToScreen(state, zone.x, zone.y);
  const lifePulse = clamp(zone.life / 6, 0.18, 1);
  ctx.save();
  ctx.translate(p.x, p.y);
  if (zone.type === "sentry") {
    glowCircle(ctx, 0, 0, zone.radius * 1.75, zone.color, 0.18 * lifePulse);
    ctx.strokeStyle = "rgba(255,209,102,.28)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, zone.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(zone.phase);
    ctx.fillStyle = "rgba(8,19,29,.9)";
    roundedRectPath(ctx, -15, -15, 30, 30, 8);
    ctx.fill();
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = zone.color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, -33);
    ctx.stroke();
  } else if (zone.type === "vortex") {
    glowCircle(ctx, 0, 0, zone.radius * 1.45, zone.color, 0.22 * lifePulse);
    ctx.strokeStyle = "rgba(123,212,255,.24)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, zone.radius, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i += 1) {
      const start = zone.phase + i * Math.PI / 2;
      ctx.strokeStyle = i % 2 ? "rgba(212,92,255,.56)" : "rgba(123,212,255,.64)";
      ctx.lineWidth = 3 - i * 0.28;
      ctx.beginPath();
      ctx.arc(0, 0, zone.radius * (0.28 + i * 0.15), start, start + Math.PI * 1.35);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(248,251,255,.78)";
    ctx.beginPath();
    ctx.arc(0, 0, 5 + Math.sin(state.time * 7) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHealthBar(ctx, p, entity) {
  const hpRatio = clamp(entity.hp / entity.maxHp, 0, 1);
  if (!entity.boss && !entity.empowered && hpRatio >= 0.985) return;
  const width = entity.boss ? 112 : entity.empowered ? entity.radius * 3 : entity.radius * 2.25;
  const y = p.y - entity.radius - (entity.boss ? 20 : 10);
  ctx.fillStyle = "rgba(0,0,0,.62)";
  roundedRectPath(ctx, p.x - width / 2 - 1, y - 1, width + 2, 7, 4);
  ctx.fill();
  ctx.fillStyle = entity.boss ? classicArcade.yellow : entity.empowered ? RARITIES.evolve.color : classicArcade.green;
  roundedRectPath(ctx, p.x - width / 2, y, width * clamp(entity.hp / entity.maxHp, 0, 1), 5, 3);
  ctx.fill();
  if (hpRatio < 0.34) {
    ctx.fillStyle = "rgba(255,77,94,.42)";
    roundedRectPath(ctx, p.x - width / 2, y, width * hpRatio, 5, 3);
    ctx.fill();
  }
  if (entity.boss) {
    ctx.fillStyle = "rgba(248,251,255,.55)";
    for (const mark of [0.34, 0.67]) {
      ctx.fillRect(p.x - width / 2 + width * mark - 1, y - 2, 2, 9);
    }
    ctx.fillStyle = "rgba(255,209,102,.92)";
    ctx.font = "900 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(entity.bossTitle || "鬼王", p.x, y - 5);
  }
}

function drawPickup(ctx, state, pickup) {
  const p = worldToScreen(state, pickup.x, pickup.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  const bob = Math.sin(state.time * 5 + pickup.x * 0.02) * 2;
  ctx.translate(0, bob);
  glowCircle(ctx, 0, 0, pickup.radius * 3.2, pickup.type === "heal" ? classicArcade.green : pickup.type === "bomb" ? classicArcade.red : pickup.type === "chest" ? classicArcade.yellow : classicArcade.cyan, 0.34);
  ctx.shadowColor = "rgba(248,251,255,.28)";
  ctx.shadowBlur = 8;
  if (pickup.type === "xp") {
    const gem = ctx.createLinearGradient(-pickup.radius, -pickup.radius, pickup.radius, pickup.radius);
    gem.addColorStop(0, "#f8fbff");
    gem.addColorStop(0.35, classicArcade.cyan);
    gem.addColorStop(1, "#2377ff");
    ctx.fillStyle = gem;
    ctx.beginPath();
    ctx.moveTo(0, -pickup.radius);
    ctx.lineTo(pickup.radius * 0.82, -1);
    ctx.lineTo(0, pickup.radius);
    ctx.lineTo(-pickup.radius * 0.82, -1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(248,251,255,.6)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (pickup.type === "heal") {
    ctx.fillStyle = "#0e4f3a";
    roundedRectPath(ctx, -pickup.radius - 1, -pickup.radius - 1, pickup.radius * 2 + 2, pickup.radius * 2 + 2, 6);
    ctx.fill();
    ctx.fillStyle = classicArcade.green;
    roundedRectPath(ctx, -pickup.radius + 2, -pickup.radius + 2, pickup.radius * 2 - 4, pickup.radius * 2 - 4, 4);
    ctx.fill();
    ctx.fillStyle = classicArcade.white;
    ctx.fillRect(-2, -7, 4, 14);
    ctx.fillRect(-7, -2, 14, 4);
  } else if (pickup.type === "bomb") {
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.arc(0, 1, pickup.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, -pickup.radius + 1);
    ctx.quadraticCurveTo(8, -pickup.radius - 9, 13, -pickup.radius - 5);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#2d1b12";
    roundedRectPath(ctx, -13, -9, 26, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#9b6228";
    roundedRectPath(ctx, -11, -7, 22, 16, 4);
    ctx.fill();
    ctx.fillStyle = classicArcade.yellow;
    ctx.fillRect(-11, -2, 22, 4);
    ctx.fillRect(-2, -7, 4, 16);
    ctx.strokeStyle = "rgba(248,251,255,.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-9, -5, 18, 12);
  }
  ctx.restore();
}

function drawObject(ctx, state, object) {
  const spec = OBJECT_TYPES[object.type] || OBJECT_TYPES.crate;
  const p = worldToScreen(state, object.x, object.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = object.flash ? 0.7 : 1;
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, object.radius * 0.72, object.radius * 1.05, object.radius * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  if (object.type === "crate") {
    const box = ctx.createLinearGradient(-16, -14, 16, 15);
    box.addColorStop(0, "#c29154");
    box.addColorStop(0.5, "#7a4b25");
    box.addColorStop(1, "#3a2415");
    ctx.fillStyle = "#28170e";
    roundedRectPath(ctx, -17, -15, 34, 30, 6);
    ctx.fill();
    ctx.fillStyle = box;
    roundedRectPath(ctx, -14, -12, 28, 24, 5);
    ctx.fill();
    ctx.strokeStyle = object.flash ? classicArcade.yellow : "#f5d99b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.lineTo(14, -2);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
  } else if (object.type === "crystal") {
    glowCircle(ctx, 0, 0, 34, spec.color, 0.42);
    ctx.fillStyle = spec.color;
    ctx.shadowColor = "rgba(66,242,255,.45)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(12, -3);
    ctx.lineTo(6, 16);
    ctx.lineTo(-7, 16);
    ctx.lineTo(-12, -3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fillRect(-2, -11, 4, 16);
  } else if (object.type === "shrine") {
    glowCircle(ctx, 0, 0, 38, spec.color, 0.34);
    ctx.fillStyle = "rgba(255,209,102,.16)";
    ctx.beginPath();
    ctx.arc(0, 0, 24 + Math.sin(state.time * 4) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = spec.color;
    ctx.font = "900 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("祭", 0, 5);
  } else if (object.type === "beacon") {
    glowCircle(ctx, 0, 0, 46, spec.color, 0.28);
    ctx.strokeStyle = "rgba(56,210,124,.32)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 48 + Math.sin(object.pulse * 3) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#0b261c";
    roundedRectPath(ctx, -14, -24, 28, 42, 9);
    ctx.fill();
    ctx.fillStyle = spec.color;
    ctx.beginPath();
    ctx.moveTo(0, -29);
    ctx.lineTo(14, -5);
    ctx.lineTo(4, 21);
    ctx.lineTo(-4, 21);
    ctx.lineTo(-14, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(248,251,255,.86)";
    ctx.font = "900 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("标", 0, 3);
  } else {
    glowCircle(ctx, 0, 0, 48, spec.color, 0.3);
    ctx.fillStyle = "rgba(212,92,255,.16)";
    ctx.beginPath();
    ctx.arc(0, 0, 27 + Math.sin(object.pulse * 4) * 3, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeStyle = i % 2 ? "rgba(123,212,255,.45)" : "rgba(212,92,255,.62)";
      ctx.lineWidth = 3 - i * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, 10 + i * 7, object.pulse * 1.6 + i, object.pulse * 1.6 + i + Math.PI * 1.35);
      ctx.stroke();
    }
    ctx.fillStyle = spec.color;
    ctx.font = "900 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("隙", 0, 5);
  }
  if (object.charge > 0) {
    const progress = object.type === "shrine" ? object.charge / 1.1
      : object.type === "crystal" ? object.charge / 0.55
        : object.type === "beacon" ? object.charge / 1.8
          : object.type === "riftSeal" ? object.charge / 1.55
            : object.charge / 0.38;
    ctx.strokeStyle = RARITIES.evolve.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, object.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(progress, 0, 1));
    ctx.stroke();
  }
  if (state.stageObjective?.id === spec.objective && !state.stageObjective.done) {
    ctx.fillStyle = RARITIES.evolve.color;
    ctx.beginPath();
    ctx.moveTo(0, -object.radius - 18);
    ctx.lineTo(5, -object.radius - 8);
    ctx.lineTo(-5, -object.radius - 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBlade(ctx, x, y, angle, scale = 1, color = classicArcade.yellow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -10 * scale);
  ctx.lineTo(4 * scale, 3 * scale);
  ctx.lineTo(0, 8 * scale);
  ctx.lineTo(-4 * scale, 3 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.fillRect(-1 * scale, -7 * scale, 2 * scale, 10 * scale);
  ctx.restore();
}

function drawCrescent(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = RARITIES.evolve.color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 11, -Math.PI * 0.78, Math.PI * 0.78);
  ctx.stroke();
  ctx.strokeStyle = "rgba(248,251,255,.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(2, 0, 7, -Math.PI * 0.68, Math.PI * 0.68);
  ctx.stroke();
  ctx.restore();
}

function drawDroneShot(ctx, x, y, angle, hive = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = hive ? RARITIES.evolve.color : classicArcade.cyan;
  roundedRectPath(ctx, -6, -3, 16, 6, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(248,251,255,.78)";
  ctx.fillRect(0, -1, 8, 2);
  ctx.restore();
}

function drawMine(ctx, x, y, armed, seismic = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = seismic ? "rgba(255,209,102,.18)" : "rgba(255,77,94,.16)";
  ctx.beginPath();
  ctx.arc(0, 0, seismic ? 18 : 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = seismic ? RARITIES.evolve.color : classicArcade.red;
  ctx.beginPath();
  ctx.arc(0, 0, seismic ? 8 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = armed ? classicArcade.white : "rgba(248,251,255,.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(10, 0);
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 10);
  ctx.stroke();
  ctx.restore();
}

function drawProjectile(ctx, state, projectile) {
  const p = worldToScreen(state, projectile.x, projectile.y);
  const angle = Math.atan2(projectile.vy, projectile.vx) + Math.PI / 2;
  if (projectile.type === "mine" || projectile.type === "seismicMine") {
    drawMine(ctx, p.x, p.y, (projectile.armed || 0) <= 0, projectile.type === "seismicMine");
    return;
  }
  if (projectile.type === "crescent") {
    drawCrescent(ctx, p.x, p.y, angle + state.time * 5 * (projectile.spin || 1));
    return;
  }
  if (projectile.type === "shadowVolley") {
    drawCrescent(ctx, p.x, p.y, angle + state.time * 8);
    return;
  }
  if (projectile.type === "drone" || projectile.type === "hive") {
    drawDroneShot(ctx, p.x, p.y, Math.atan2(projectile.vy, projectile.vx), projectile.type === "hive");
    return;
  }
  if (projectile.type === "sentry") {
    drawDroneShot(ctx, p.x, p.y, Math.atan2(projectile.vy, projectile.vx), true);
    return;
  }
  drawBlade(ctx, p.x, p.y, angle, 0.72, projectile.type === "knife" ? classicArcade.yellow : classicArcade.cyan);
}

function drawEnemyShot(ctx, state, shot) {
  const p = worldToScreen(state, shot.x, shot.y);
  const angle = Math.atan2(shot.vy, shot.vx);
  const color = shot.sourceType === "spitter" ? "#8ce8bd"
    : shot.sourceType === "sniper" ? "#9fb7ff"
      : shot.sourceType === "shield" ? "#f8fbff"
        : shot.sourceType === "elite" ? "#d45cff"
          : classicArcade.red;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(shot.radius + 4, 0);
  ctx.quadraticCurveTo(0, -shot.radius, -shot.radius - 3, 0);
  ctx.quadraticCurveTo(0, shot.radius, shot.radius + 4, 0);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.beginPath();
  ctx.arc(1, -2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWorldLine(ctx, state, x1, y1, x2, y2, color, options = {}) {
  const a = worldToScreen(state, x1, y1);
  const b = worldToScreen(state, x2, y2);
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 0.72;
  ctx.strokeStyle = color;
  ctx.lineWidth = options.width || 2;
  ctx.lineCap = "round";
  if (options.dash) ctx.setLineDash(options.dash);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (options.dot) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, options.dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemyTelegraph(ctx, state, enemy, p) {
  const playerAngle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
  const playerDistance = distance(state.player, enemy);
  if (enemy.type === "charger" && !enemy.boss) {
    const charging = enemy.chargeTime > 0;
    const preparing = !charging && enemy.special <= 0.55 && playerDistance < 285;
    if (charging || preparing) {
      const angle = charging ? enemy.chargeAngle : playerAngle;
      const length = charging ? 190 : 150;
      drawWorldLine(ctx, state, enemy.x, enemy.y, enemy.x + Math.cos(angle) * length, enemy.y + Math.sin(angle) * length, charging ? classicArcade.red : "#ff9ac6", {
        alpha: charging ? 0.92 : 0.5 + Math.sin(state.time * 18) * 0.16,
        width: charging ? 4 : 2,
        dash: charging ? [] : [8, 7],
        dot: charging ? 5 : 3
      });
    }
  }

  if (enemy.type === "bomber" && enemy.fuse > 0) {
    const pulse = clamp(enemy.fuse / 0.82, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = pulse < 0.35 ? classicArcade.red : "#ffb84d";
    ctx.lineWidth = pulse < 0.35 ? 4 : 2;
    ctx.setLineDash(pulse < 0.35 ? [] : [7, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 46 + (1 - pulse) * 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,107,44,.08)";
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2 * (1 - pulse));
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.restore();
  }

  if ((enemy.type === "spitter" || enemy.type === "sniper") && enemy.shoot <= 0.42 && playerDistance < 430) {
    const color = enemy.type === "sniper" ? "#9fb7ff" : "#8ce8bd";
    drawWorldLine(ctx, state, enemy.x, enemy.y, state.player.x, state.player.y, color, {
      alpha: enemy.type === "sniper" ? 0.62 : 0.42,
      width: enemy.type === "sniper" ? 2.8 : 2,
      dash: enemy.type === "sniper" ? [12, 7] : [6, 6],
      dot: enemy.type === "sniper" ? 4 : 3
    });
  }

  if (enemy.type === "warden" && !enemy.boss && enemy.special <= 0.6) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.48 + Math.sin(state.time * 14) * 0.12;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, 96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (enemy.boss) {
    const spec = bossSpec(enemy);
    const phase = enemy.phaseIndex || 0;
    const urgency = clamp(1 - (enemy.special || 0) / Math.max(0.01, 4.25 - phase * 0.62), 0, 1);
    if (urgency > 0.68 || enemy.chargeTime > 0) {
      if (enemy.chargeTime > 0) {
        drawWorldLine(ctx, state, enemy.x, enemy.y, enemy.x + Math.cos(enemy.chargeAngle) * 220, enemy.y + Math.sin(enemy.chargeAngle) * 220, spec.color, { alpha: 0.75, width: 5, dot: 6 });
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = 0.28 + urgency * 0.44;
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 3 + phase;
      ctx.setLineDash(enemy.chargeTime > 0 ? [] : [10, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 24 + Math.sin(state.time * 8) * 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * urgency);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function drawEnemyBody(ctx, enemy, scale) {
  if (drawEnemySprite(ctx, enemy, scale)) return;
  if (enemy.boss) {
    ctx.fillStyle = "#5a1024";
    ctx.beginPath();
    ctx.moveTo(0, -30 * scale);
    ctx.lineTo(26 * scale, -16 * scale);
    ctx.lineTo(31 * scale, 16 * scale);
    ctx.lineTo(0, 33 * scale);
    ctx.lineTo(-31 * scale, 16 * scale);
    ctx.lineTo(-26 * scale, -16 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.ellipse(0, 2 * scale, 22 * scale, 25 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = classicArcade.yellow;
    ctx.beginPath();
    ctx.arc(0, 2 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = classicArcade.yellow;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(-16 * scale, -22 * scale);
    ctx.lineTo(-25 * scale, -34 * scale);
    ctx.moveTo(16 * scale, -22 * scale);
    ctx.lineTo(25 * scale, -34 * scale);
    ctx.stroke();
    return;
  }

  if (enemy.type === "bat") {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(-4 * scale, -4 * scale);
    ctx.lineTo(-24 * scale, -16 * scale);
    ctx.lineTo(-18 * scale, 6 * scale);
    ctx.lineTo(-5 * scale, 3 * scale);
    ctx.lineTo(0, 12 * scale);
    ctx.lineTo(5 * scale, 3 * scale);
    ctx.lineTo(18 * scale, 6 * scale);
    ctx.lineTo(24 * scale, -16 * scale);
    ctx.lineTo(4 * scale, -4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#12233a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 7 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === "swarmer") {
    ctx.fillStyle = "rgba(166,255,203,.18)";
    ctx.beginPath();
    ctx.arc(0, 0, 15 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, -13 * scale);
    ctx.lineTo(10 * scale, 8 * scale);
    ctx.lineTo(0, 4 * scale);
    ctx.lineTo(-10 * scale, 8 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(248,251,255,.7)";
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(-8 * scale, -2 * scale);
    ctx.lineTo(-17 * scale, -7 * scale);
    ctx.moveTo(8 * scale, -2 * scale);
    ctx.lineTo(17 * scale, -7 * scale);
    ctx.stroke();
  } else if (enemy.type === "brute") {
    ctx.fillStyle = "#60401e";
    roundedRectPath(ctx, -15 * scale, -14 * scale, 30 * scale, 30 * scale, 7 * scale);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    roundedRectPath(ctx, -11 * scale, -18 * scale, 22 * scale, 26 * scale, 6 * scale);
    ctx.fill();
  } else if (enemy.type === "spitter") {
    ctx.fillStyle = "#133a2d";
    ctx.beginPath();
    ctx.ellipse(0, 1 * scale, 15 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(0, -9 * scale, 10 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.arc(0, -8 * scale, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === "bomber") {
    ctx.fillStyle = "#451410";
    ctx.beginPath();
    ctx.ellipse(0, 2 * scale, 14 * scale, 16 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const r = i % 2 ? 9 * scale : 17 * scale;
      const a = -Math.PI / 2 + i * Math.PI / 4;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = classicArcade.yellow;
    ctx.beginPath();
    ctx.arc(0, -1 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === "charger") {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, -18 * scale);
    ctx.lineTo(15 * scale, 12 * scale);
    ctx.lineTo(4 * scale, 8 * scale);
    ctx.lineTo(0, 18 * scale);
    ctx.lineTo(-4 * scale, 8 * scale);
    ctx.lineTo(-15 * scale, 12 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = classicArcade.white;
    ctx.fillRect(-3 * scale, -13 * scale, 6 * scale, 14 * scale);
  } else if (enemy.type === "shield") {
    ctx.fillStyle = "#dfe8ef";
    ctx.beginPath();
    ctx.moveTo(0, -18 * scale);
    ctx.quadraticCurveTo(17 * scale, -13 * scale, 16 * scale, 2 * scale);
    ctx.quadraticCurveTo(12 * scale, 17 * scale, 0, 22 * scale);
    ctx.quadraticCurveTo(-12 * scale, 17 * scale, -16 * scale, 2 * scale);
    ctx.quadraticCurveTo(-17 * scale, -13 * scale, 0, -18 * scale);
    ctx.fill();
    ctx.strokeStyle = classicArcade.cyan;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
  } else if (enemy.type === "warden") {
    ctx.fillStyle = "#3f3217";
    roundedRectPath(ctx, -14 * scale, -17 * scale, 28 * scale, 34 * scale, 8 * scale);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, -22 * scale);
    ctx.lineTo(17 * scale, -4 * scale);
    ctx.lineTo(10 * scale, 18 * scale);
    ctx.lineTo(-10 * scale, 18 * scale);
    ctx.lineTo(-17 * scale, -4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#17382e";
    ctx.fillRect(-3 * scale, -12 * scale, 6 * scale, 24 * scale);
    ctx.fillRect(-10 * scale, -3 * scale, 20 * scale, 6 * scale);
  } else if (enemy.type === "sniper") {
    ctx.fillStyle = "#17213f";
    ctx.beginPath();
    ctx.ellipse(0, 2 * scale, 13 * scale, 16 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, -20 * scale);
    ctx.lineTo(12 * scale, 8 * scale);
    ctx.lineTo(0, 16 * scale);
    ctx.lineTo(-12 * scale, 8 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = classicArcade.cyan;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(0, -18 * scale);
    ctx.lineTo(0, -31 * scale);
    ctx.stroke();
  } else if (enemy.type === "elite") {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 ? 10 * scale : 19 * scale;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#211033";
    ctx.beginPath();
    ctx.arc(0, 0, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const shell = ctx.createLinearGradient(-12 * scale, -16 * scale, 12 * scale, 16 * scale);
    shell.addColorStop(0, "#39151b");
    shell.addColorStop(0.45, enemy.color);
    shell.addColorStop(1, "#160d14");
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 * scale, 16 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(0, -14 * scale);
    ctx.lineTo(0, 13 * scale);
    ctx.moveTo(-9 * scale, -3 * scale);
    ctx.lineTo(9 * scale, -3 * scale);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * 8 * scale, -4 * scale);
      ctx.lineTo(side * 20 * scale, -12 * scale);
      ctx.moveTo(side * 9 * scale, 3 * scale);
      ctx.lineTo(side * 21 * scale, 9 * scale);
      ctx.moveTo(side * 7 * scale, 10 * scale);
      ctx.lineTo(side * 16 * scale, 18 * scale);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,.74)";
  ctx.beginPath();
  ctx.arc(-4 * scale, -4 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.arc(4 * scale, -4 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(248,251,255,.75)";
  ctx.beginPath();
  ctx.arc(-4.5 * scale, -4.6 * scale, 0.8 * scale, 0, Math.PI * 2);
  ctx.arc(3.5 * scale, -4.6 * scale, 0.8 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(ctx, state, enemy) {
  const p = worldToScreen(state, enemy.x, enemy.y);
  const scale = enemy.radius / 12;
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x) + Math.PI / 2;
  drawEnemyTelegraph(ctx, state, enemy, p);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.globalAlpha = enemy.flash ? 0.68 : 1;
  glowCircle(ctx, 0, 0, enemy.radius * (enemy.boss ? 3.4 : enemy.empowered ? 2.7 : 2.15), enemy.color, enemy.boss ? 0.24 : enemy.empowered ? 0.22 : 0.12);
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = enemy.flash ? 16 : enemy.empowered ? 10 : 4;
  ctx.fillStyle = "rgba(0,0,0,.26)";
  ctx.beginPath();
  ctx.ellipse(0, enemy.radius * 0.55, enemy.radius * 0.95, enemy.radius * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  drawEnemyBody(ctx, enemy, scale);
  if (enemy.family && enemy.radius >= 7) {
    ctx.fillStyle = enemy.boss ? "rgba(255,209,102,.92)" : "rgba(10,18,20,.72)";
    ctx.font = `900 ${Math.max(7, enemy.radius * 0.58)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(enemy.boss ? "王" : enemy.family, 0, 1);
    ctx.textBaseline = "alphabetic";
  }
  if (enemy.empowered) {
    const affix = affixSpec(enemy.affix);
    ctx.strokeStyle = affix?.color || RARITIES.evolve.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = affix?.color || RARITIES.evolve.color;
    ctx.font = `${Math.max(7, enemy.radius * 0.45)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(affix?.title?.slice(0, 1) || "精", 0, -enemy.radius - 7);
  }
  if (enemy.mutation) {
    const mutation = mutationSpec(enemy.mutation);
    ctx.strokeStyle = mutation?.color || classicArcade.cyan;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + (enemy.empowered ? 8 : 5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = mutation?.color || classicArcade.cyan;
    ctx.font = `${Math.max(7, enemy.radius * 0.4)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(mutation?.mark || "异", 0, enemy.radius + 12);
  }
  if (enemy.type === "bomber" && enemy.fuse > 0) {
    const pulse = clamp(enemy.fuse / 0.82, 0, 1);
    ctx.strokeStyle = pulse < 0.35 ? classicArcade.red : "#ffb84d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 12 * (1 - pulse), 0, Math.PI * 2);
    ctx.stroke();
  }
  if (enemy.type === "warden") {
    ctx.strokeStyle = enemy.healPulse > 0 ? "rgba(255,209,102,.72)" : "rgba(255,209,102,.28)";
    ctx.lineWidth = enemy.healPulse > 0 ? 3 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30 + Math.sin(state.time * 3 + enemy.phase) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (enemy.frozen > 0) {
    ctx.strokeStyle = classicArcade.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  drawHealthBar(ctx, p, enemy);
}

function drawPlayer(ctx, state) {
  const p = worldToScreen(state, state.player.x, state.player.y);
  const character = characterSpec(state);
  const moving = Math.hypot(state.controls.axisX || 0, state.controls.axisY || 0);
  const angle = moving ? Math.atan2(state.controls.axisY, state.controls.axisX) + Math.PI / 2 : Math.sin(state.time * 2) * 0.05;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  const blink = state.player.invuln > 0 && Math.floor(state.time * 16) % 2;
  ctx.globalAlpha = blink ? 0.58 : 1;
  glowCircle(ctx, 0, 0, 44, character.color, character.id === "arcanist" ? 0.3 : 0.2);
  if (state.overdrive > 0) {
    glowCircle(ctx, 0, 0, 58 + Math.sin(state.time * 9) * 4, RARITIES.evolve.color, 0.32);
    ctx.strokeStyle = "rgba(255,209,102,.82)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 27 + Math.sin(state.time * 8) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawHeroSprite(ctx, state, character);
  ctx.restore();
  drawDroneCompanions(ctx, p, state);
}

function draw(state, ctx) {
  const camera = cameraFor(state);
  const offset = shakeOffset(state.shake);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(offset.x, offset.y);
  drawGrid(ctx, camera, state);
  state.dangerZones.forEach((zone) => drawDangerZone(ctx, state, zone));
  state.abilityZones.forEach((zone) => drawAbilityZone(ctx, state, zone));
  state.objects.forEach((object) => drawObject(ctx, state, object));
  state.pickups.forEach((pickup) => drawPickup(ctx, state, pickup));
  state.projectiles.forEach((projectile) => drawProjectile(ctx, state, projectile));
  state.enemyShots.forEach((shot) => drawEnemyShot(ctx, state, shot));
  state.enemies.forEach((enemy) => drawEnemy(ctx, state, enemy));
  if (state.skills.aura) {
    const plague = hasEvolution(state, "plagueAura");
    const p = worldToScreen(state, state.player.x, state.player.y);
    ctx.strokeStyle = plague ? "rgba(140,232,189,.34)" : "rgba(123,212,255,.28)";
    ctx.lineWidth = plague ? 3 : 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (plague ? 58 : 42) + state.skills.aura * (plague ? 14 : 12), 0, Math.PI * 2);
    ctx.stroke();
    if (plague) {
      ctx.strokeStyle = "rgba(212,92,255,.18)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 36 + Math.sin(state.time * 4) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (state.skills.orbit) {
    const saw = hasEvolution(state, "sawHalo");
    const count = (saw ? 2 : 1) + Math.floor(state.skills.orbit / (saw ? 1.7 : 2));
    const p = worldToScreen(state, state.player.x, state.player.y);
    for (let i = 0; i < count; i += 1) {
      const angle = state.time * (saw ? 3.2 : 1.9) + state.skills.orbit * 0.12 + i * Math.PI * 2 / count;
      const ox = p.x + Math.cos(angle) * (saw ? 52 : 42);
      const oy = p.y + Math.sin(angle) * (saw ? 52 : 42);
      ctx.fillStyle = saw ? RARITIES.evolve.color : classicArcade.blue;
      ctx.beginPath();
      ctx.arc(ox, oy, saw ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.beginPath();
      ctx.arc(ox - 2, oy - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (state.skills.frost) {
    const nova = hasEvolution(state, "iceNova");
    const p = worldToScreen(state, state.player.x, state.player.y);
    const radius = (nova ? 126 : 82) + state.skills.frost * (nova ? 14 : 10);
    ctx.strokeStyle = nova ? "rgba(123,212,255,.34)" : "rgba(123,212,255,.22)";
    ctx.lineWidth = nova ? 3 : 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * (0.58 + Math.sin(state.time * 2.2) * 0.025), 0, Math.PI * 2);
    ctx.stroke();
  }
  drawPlayer(ctx, state);
  drawEffects(ctx, state.effects.map((effect) => ({
    ...effect,
    x: effect.x - camera.x,
    y: effect.y - camera.y,
    x2: Number.isFinite(effect.x2) ? effect.x2 - camera.x : effect.x2,
    y2: Number.isFinite(effect.y2) ? effect.y2 - camera.y : effect.y2
  })));
  ctx.restore();
  drawHud(ctx, state);
}

function drawHud(ctx, state) {
  const tuning = levelTuning(state.level);
  const progress = stageProgressRatio(state);
  const xpProgress = clamp(state.player.xp / state.player.xpNeed, 0, 1);
  const overdriveProgress = state.overdrive > 0 ? clamp(state.overdrive / overdriveDuration(state), 0, 1) : clamp((state.overdriveCharge || 0) / 100, 0, 1);
  const bossEnemy = state.enemies.find((enemy) => enemy.boss);
  const eventText = bossEnemy ? `${bossEnemy.bossTitle || "鬼王"} ${bossEnemy.phaseIndex >= 2 ? "狂暴" : bossEnemy.phaseIndex === 1 ? "二阶段" : "入场"}` : state.activeEvent?.title || "游走";
  const bossHint = bossEnemy ? bossSpec(bossEnemy).hint : "";
  const objectiveText = objectiveLabel(state);
  const character = characterSpec(state);
  const ability = abilitySpec(state);
  const modifier = stageModifierSpec(state);
  const chapter = chapterForLevel(state.level);
  const profile = stageProfileForLevel(state.level);
  const phase = stagePhaseForState(state);
  ctx.fillStyle = "rgba(6,12,16,.74)";
  roundedRectPath(ctx, 10, 10, W - 20, 94, 10);
  ctx.fill();
  ctx.fillStyle = classicArcade.white;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText(`${character.title}  ${chapter.short}·${profile.icon}/${phase.icon} ${state.level}/${MAX_LEVEL}  镇夜 ${stageProgressPercent(state)}%`, 18, 30);
  ctx.textAlign = "right";
  ctx.fillStyle = modifier.color;
  ctx.fillText(`${modifier.icon} ${modifier.title} · ${eventText}`, W - 18, 30);
  ctx.textAlign = "left";
  ctx.fillStyle = classicArcade.white;
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundedRectPath(ctx, 18, 42, W - 36, 8, 4);
  ctx.fill();
  ctx.fillStyle = progress >= 1 ? RARITIES.evolve.color : tuning.bossStage ? classicArcade.red : classicArcade.cyan;
  roundedRectPath(ctx, 18, 42, (W - 36) * progress, 8, 4);
  ctx.fill();
  if (tuning.bossStage) {
    const bossLine = 18 + (W - 36) * clamp(stageBossProgressGoal(state.level) / stageProgressGoal(state.level), 0, 1);
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.fillRect(bossLine - 1, 39, 2, 14);
    ctx.fillStyle = classicArcade.red;
    ctx.beginPath();
    ctx.moveTo(bossLine, 37);
    ctx.lineTo(bossLine - 4, 32);
    ctx.lineTo(bossLine + 4, 32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundedRectPath(ctx, 18, 56, (W - 36) * 0.62, 6, 3);
  ctx.fill();
  ctx.fillStyle = classicArcade.green;
  roundedRectPath(ctx, 18, 56, (W - 36) * 0.62 * clamp(state.player.hp / state.player.maxHp, 0, 1), 6, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundedRectPath(ctx, W - 122, 56, 104, 6, 3);
  ctx.fill();
  ctx.fillStyle = RARITIES.evolve.color;
  roundedRectPath(ctx, W - 122, 56, 104 * xpProgress, 6, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.14)";
  roundedRectPath(ctx, 18, 64, W - 36, 5, 3);
  ctx.fill();
  ctx.fillStyle = state.overdrive > 0 ? RARITIES.evolve.color : "rgba(123,212,255,.75)";
  roundedRectPath(ctx, 18, 64, (W - 36) * overdriveProgress, 5, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(248,251,255,.72)";
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.fillText(`HP ${Math.ceil(state.player.hp)}/${state.player.maxHp}`, 18, 80);
  ctx.textAlign = "right";
  ctx.fillText(state.overdrive > 0 ? `过载 ${state.overdrive.toFixed(1)}s` : `Lv.${state.player.level}`, W - 18, 80);
  ctx.textAlign = "left";
  ctx.fillStyle = state.stageObjective?.done ? RARITIES.evolve.color : "rgba(248,251,255,.76)";
  ctx.font = "800 10px system-ui, sans-serif";
  ctx.fillText(bossHint ? `${phase.short} · 鬼王机制 ${bossHint}` : `${phase.short} · 目标 ${objectiveText} · ${progressBreakdownText(state, 2)}${state.pressureDebt ? ` · 压力 ${state.pressureDebt}` : ""}`, 18, 94);
  ctx.textAlign = "center";
  ctx.fillStyle = (state.abilityTimer || 0) <= 0.1 ? ability.color : "rgba(248,251,255,.72)";
  ctx.fillText(`${ability.icon} ${(state.abilityTimer || 0) > 0.1 ? `${Math.ceil(state.abilityTimer)}s` : "就绪"}`, W / 2, 94);
  ctx.textAlign = "right";
  ctx.fillText(`金币 +${state.coinsEarned || 0}`, W - 18, 94);
  ctx.textAlign = "left";
  const icons = [
    ...state.evolutions.map((id) => EVOLUTION_BY_ID.get(id)).filter(Boolean).map((item) => ({ icon: item.icon, color: RARITIES.evolve.color })),
    ...Object.entries(state.relics || {})
      .map(([id, level]) => ({ relic: RELICS.find((item) => item.id === id), level }))
      .filter((item) => item.relic && item.level > 0)
      .map((item) => ({ icon: item.relic.icon, color: classicArcade.cyan }))
  ].slice(0, 5);
  icons.forEach((item, index) => {
    const x = W - 26 - index * 25;
    ctx.fillStyle = "rgba(255,209,102,.16)";
    roundedRectPath(ctx, x - 9, 108, 19, 19, 5);
    ctx.fill();
    ctx.fillStyle = item.color;
    ctx.font = "800 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(item.icon, x, 122);
  });
  ctx.textAlign = "left";
}

function renderChoices(root, state) {
  let panel = root.querySelector(".survivor-upgrades");
  if (!state.choices.length) {
    panel?.remove();
    return;
  }
  // 同一组 choices 期间避免每帧重建按钮 DOM——否则用户的 pointerdown
  // 和 pointerup 跨过一次 game-loop tick 时，按钮节点被替换，click 不触发
  const signature = `${state.rerolls}|${state.choices.map((c) => `${c.key}:${c.rarity}:${c.levels}:${c.recommended ? 1 : 0}:${c.recommendReason || ""}`).join("|")}`;
  if (panel && panel.dataset.choicesSig === signature) return;
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "survivor-upgrades";
    root.append(panel);
  }
  panel.dataset.choicesSig = signature;
  panel.innerHTML = `
    <div class="survivor-upgrade-title">
      <span>
        <strong>万象魔盒 · 选择符牌</strong>
        <small>长夜回应了你的执念</small>
      </span>
      <button type="button" data-survivor-reroll ${state.rerolls > 0 ? "" : "disabled"}>重铸 ${state.rerolls}</button>
    </div>
    ${state.choices.map((choice) => `
      <button type="button" class="survivor-upgrade-card is-${choice.rarity}" data-survivor-upgrade="${choice.key}">
        <i>${choice.icon}</i>
        <b>${choice.title} ${choice.kind === "evolution" ? "进化" : choice.kind === "relic" ? `Lv.${Math.min(choice.max || 9, (choice.current || 0) + 1)}` : `Lv.${Math.min(UPGRADE_BY_ID.get(choice.id)?.max || 9, skillLevel(state, choice.id) + choice.levels)}`}${choice.recommended ? "<mark>推荐</mark>" : ""}</b>
        <em>${RARITIES[choice.rarity]?.label || "强化"} · ${choice.tag}${choice.school ? ` · ${choice.school}` : ""}</em>
        <span>${choice.desc}</span>
        ${choice.recommendReason ? `<small class="survivor-upgrade-recommend">推荐：${choice.recommendReason}</small>` : ""}
        ${choice.comboHint ? `<small class="survivor-upgrade-flow">${choice.comboHint}</small>` : ""}
        ${choice.evolutionHint ? `<small class="survivor-upgrade-evolution">${choice.evolutionHint}</small>` : ""}
      </button>
    `).join("")}
  `;
}

export function mountSurvivor(root, context) {
  let meta = loadMeta();
  let state = restoreState(context.savedState, meta, context.options || {});
  ensureStageSetup(state);
  let canvas = null;
  let ctx = null;
  let loop = null;
  let cleanupKeys = null;
  let cleanupRestart = null;
  let cleanupPointer = null;
  let statusNode = null;
  let levelNode = null;
  let characterNode = null;
  let playerLevelNode = null;
  let killsNode = null;
  let scoreNode = null;
  let threatNode = null;
  let progressNode = null;
  let campNode = null;
  let campSignature = "";
  let campOpen = false;
  let activePointer = null;
  let finalCleared = false;

  function syncMetaEarned() {
    const delta = Math.max(0, Math.floor((state.coinsEarned || 0) - (state.coinsSynced || 0)));
    if (!delta) return;
    meta = normalizeMeta({
      ...meta,
      coins: meta.coins + delta,
      totalCoins: meta.totalCoins + delta
    });
    state.coinsSynced = (state.coinsSynced || 0) + delta;
    saveMeta(meta);
  }

  function applyTalentToRun(id) {
    state.talents = { ...defaultMeta().talents, ...meta.talents };
    if (id === "vitality") {
      state.player.maxHp += 8;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 8);
    }
    if (id === "stride") state.player.speed += 4;
  }

  function upgradeTalent(id) {
    syncMetaEarned();
    const talent = TALENTS.find((item) => item.id === id);
    if (!talent) return;
    const level = talentLevel(meta, id);
    const cost = talentCost(meta, talent);
    if (level >= talent.max || meta.coins < cost) return;
    meta = normalizeMeta({
      ...meta,
      coins: meta.coins - cost,
      talents: { ...meta.talents, [id]: level + 1 }
    });
    saveMeta(meta);
    applyTalentToRun(id);
    state.message = `${talent.title} 升到 ${level + 1} 级`;
    addFloatingText(state.effects, state.player.x, state.player.y - 52, `${talent.title} +1`, { color: RARITIES.evolve.color, size: 15 });
    campSignature = "";
    refreshDom();
    save();
  }

  function renderCamp() {
    if (!campNode) return;
    campNode.classList.toggle("is-open", campOpen);
    const signature = `${meta.coins}:${state.coinsEarned}:${state.coinsSynced}:${campOpen}:${state.level}:${JSON.stringify(meta.talents)}`;
    if (signature === campSignature) return;
    campSignature = signature;
    campNode.innerHTML = `
      <div class="survivor-camp-head">
        <strong>营地强化</strong>
        <span>金币 ${meta.coins}</span>
        <button type="button" data-survivor-camp-toggle>${campOpen ? "收起" : "营地"}</button>
      </div>
      <div class="survivor-talent-row">
        ${TALENTS.map((talent) => {
          const level = talentLevel(meta, talent.id);
          const cost = talentCost(meta, talent);
          const capped = level >= talent.max;
          const disabled = capped || meta.coins < cost;
          return `
            <button type="button" class="survivor-talent" data-survivor-talent="${talent.id}" ${disabled ? "disabled" : ""}>
              <i>${talent.icon}</i>
              <span>
                <b>${talent.title} Lv.${level}</b>
                <small>${capped ? "已满级" : `${cost} 金币`}</small>
              </span>
            </button>
          `;
        }).join("")}
      </div>
      <div class="survivor-codex-row survivor-chapter-row">
        <span class="survivor-codex-title">章节情报</span>
        ${chapterIntelChips(state).map((entry) => `
          <span class="survivor-codex-chip">
            <i>${entry.icon}</i>
            <b>${entry.title}</b>
            <small>${entry.detail}</small>
          </span>
        `).join("")}
      </div>
      <div class="survivor-codex-row">
        <span class="survivor-codex-title">百鬼录</span>
        ${unlockedEnemyCodex(state.level).map((entry) => `
          <span class="survivor-codex-chip">
            <i>${entry.family}</i>
            <b>${entry.title}</b>
            <small>弱 ${entry.weakness} · 荐 ${entry.skills} · ${entry.tip}</small>
          </span>
        `).join("")}
      </div>
    `;
    campNode.querySelector("[data-survivor-camp-toggle]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      campOpen = !campOpen;
      campSignature = "";
      renderCamp();
    });
    campNode.querySelectorAll("[data-survivor-talent]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        upgradeTalent(button.dataset.survivorTalent);
      });
    });
  }

  function save() {
    syncMetaEarned();
    if (state.over || state.won) {
      if (!finalCleared) {
        finalCleared = true;
        removeState(SAVE_KEY);
        context.clearSession?.();
      }
      return;
    }
    finalCleared = false;
    const snapshot = serializeState(state);
    saveState(SAVE_KEY, snapshot);
    context.saveSession?.(snapshot, sessionMeta(state));
  }

  function restart() {
    syncMetaEarned();
    state = initialState(meta, context.options || {});
    ensureStageSetup(state);
    finalCleared = false;
    removeState(SAVE_KEY);
    context.clearSession?.();
    root.querySelector(".survivor-upgrades")?.remove();
    refreshDom();
    loop?.resetClock();
    save();
  }

  function refreshDom() {
    if (!statusNode) return;
    statusNode.textContent = state.message;
    levelNode.textContent = `${stageDisplayName(state.level)} ${state.level}/${MAX_LEVEL}`;
    if (characterNode) characterNode.textContent = characterSpec(state).title;
    playerLevelNode.textContent = `Lv.${state.player.level}`;
    killsNode.textContent = `击破 ${state.kills}`;
    scoreNode.textContent = `分 ${state.score}`;
    if (threatNode) threatNode.textContent = threatLabel(state);
    if (progressNode) progressNode.textContent = `来源 ${progressBreakdownText(state, 2)}`;
    renderCamp();
  }

  function setAxisFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * W;
    const y = (event.clientY - rect.top) / rect.height * H;
    const player = worldToScreen(state, state.player.x, state.player.y);
    const dx = x - player.x;
    const dy = y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    state.controls.axisX = dx / length;
    state.controls.axisY = dy / length;
  }

  function bindPointer() {
    const down = (event) => {
      event.preventDefault();
      activePointer = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      setAxisFromPointer(event);
    };
    const move = (event) => {
      if (activePointer !== event.pointerId) return;
      event.preventDefault();
      setAxisFromPointer(event);
    };
    const up = (event) => {
      if (activePointer !== event.pointerId) return;
      canvas.releasePointerCapture?.(event.pointerId);
      activePointer = null;
      state.controls.axisX = 0;
      state.controls.axisY = 0;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }

  function renderShell() {
    root.innerHTML = `
      <section class="game-panel game-status survivor-status">
        <div>
          <strong data-survivor-status>${state.message}</strong>
          <p class="game-note">拖动画布移动 · 自动镇鬼 · 升级选择匣术</p>
        </div>
        <div class="mini-stats">
          <span data-survivor-character>${characterSpec(state).title}</span>
          <span data-survivor-level>${stageDisplayName(state.level)} ${state.level}/${MAX_LEVEL}</span>
          <span data-survivor-player-level>Lv.${state.player.level}</span>
          <span data-survivor-kills>击破 ${state.kills}</span>
          <span data-survivor-score>分 ${state.score}</span>
          <span data-survivor-threat>${threatLabel(state)}</span>
          <span data-survivor-progress>来源 ${progressBreakdownText(state, 2)}</span>
        </div>
        <div class="survivor-camp" data-survivor-camp></div>
      </section>
      <div class="arcade-shell survivor-shell" data-visual-style="classic-arcade">
        <div class="arcade-stage"><canvas class="arcade-canvas tall survivor-canvas" width="${W}" height="${H}" aria-label="魔盒幸存者：百鬼夜行"></canvas></div>
      </div>
    `;
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext("2d");
    statusNode = root.querySelector("[data-survivor-status]");
    levelNode = root.querySelector("[data-survivor-level]");
    characterNode = root.querySelector("[data-survivor-character]");
    playerLevelNode = root.querySelector("[data-survivor-player-level]");
    killsNode = root.querySelector("[data-survivor-kills]");
    scoreNode = root.querySelector("[data-survivor-score]");
    threatNode = root.querySelector("[data-survivor-threat]");
    progressNode = root.querySelector("[data-survivor-progress]");
    campNode = root.querySelector("[data-survivor-camp]");
    cleanupKeys?.();
    cleanupKeys = bindDigitalKeys(state.controls, DIRECTION_KEY_MAP);
    cleanupPointer?.();
    cleanupPointer = bindPointer();
    cleanupRestart?.();
    cleanupRestart = bindShellRestart(root, context, restart);
    loop?.stop();
    loop = createArcadeLoop({
      context,
      update: (dt) => {
        update(state, dt, context);
        renderChoices(root, state);
        refreshDom();
        if (state.over) save();
      },
      draw: () => draw(state, ctx),
      save,
      saveEvery: 1.3,
      timeScale: () => state.choices.length ? 0.05 : feedbackTimeScale(state)
    });
    root.querySelector(".survivor-upgrades")?.remove();
    root.onclick = (event) => {
      const talentButton = event.target.closest("[data-survivor-talent]");
      if (talentButton) {
        upgradeTalent(talentButton.dataset.survivorTalent);
        return;
      }
      const campToggle = event.target.closest("[data-survivor-camp-toggle]");
      if (campToggle) {
        campOpen = !campOpen;
        campSignature = "";
        renderCamp();
        return;
      }
      const rerollButton = event.target.closest("[data-survivor-reroll]");
      if (rerollButton) {
        if (rerollChoices(state)) {
          renderChoices(root, state);
          refreshDom();
          save();
        }
        return;
      }
      const button = event.target.closest("[data-survivor-upgrade]");
      if (!button) return;
      applyUpgrade(state, button.dataset.survivorUpgrade);
      renderChoices(root, state);
      refreshDom();
      save();
    };
    loop.start();
  }

  renderShell();

  return () => {
    cleanupPointer?.();
    cleanupKeys?.();
    cleanupRestart?.();
    loop?.stop();
    root.onclick = null;
    syncMetaEarned();
    if (!state.over && !state.won) context.saveSession?.(serializeState(state), sessionMeta(state));
  };
}
