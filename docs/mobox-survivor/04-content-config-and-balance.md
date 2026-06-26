# 内容配置与数值设计

## 1. 配置化原则

代码负责机制，配置负责内容。

必须配置化：

- 角色
- 技能
- 技能等级
- 技能进化
- 怪物
- 精英词缀
- Boss
- 章节
- 关卡
- 刷怪波次
- 掉落
- 遗物
- 天赋
- 成就
- 剧情

建议流程：

1. 策划在表格中编辑内容。
2. 构建脚本导出 JSON。
3. 启动时做 schema 校验。
4. 运行时只读取 JSON。
5. 关键配置支持热更新或远程覆盖，后置。

## 2. 角色配置

```ts
type CharacterConfig = {
  id: string;
  name: string;
  title: string;
  role: "balanced" | "berserker" | "summoner" | "support" | "burst";
  unlock: UnlockCondition;
  baseStats: {
    hp: number;
    moveSpeed: number;
    damageRate: number;
    cooldownRate: number;
    pickupRange: number;
    critRate: number;
    armor: number;
  };
  startSkillId: string;
  activeAbilityId: string;
  passiveIds: string[];
  storyIds: string[];
  asset: AssetRefSet;
};
```

首批角色定位：

- 沈灯：均衡，新手默认。
- 白烬：低血高伤，风险爆发。
- 陆青岚：召唤机关，阵地压制。
- 阿照：控制治疗，守护灵协同。
- 无名判官：隐藏角色，高爆发收割。

## 3. 技能配置

```ts
type SkillConfig = {
  id: string;
  name: string;
  school: "talisman" | "ghostfire" | "thunder" | "machine" | "paper" | "judge" | "support";
  type: "projectile" | "aura" | "orbit" | "summon" | "strike" | "chain" | "field" | "passive";
  maxLevel: number;
  tags: string[];
  icon: string;
  description: string;
  levels: SkillLevelConfig[];
  evolution?: EvolutionCondition;
};
```

首批技能池：

- soul-blade：镇魂飞刃。
- cinnabar-field：朱砂符阵。
- ghostfire-lamp：鬼火灯。
- soul-chain：锁魂链。
- coin-dart：铜钱镖。
- paper-puppet：纸人傀儡。
- thunder-talisman：惊雷符。
- judge-brush：判官笔。
- green-lamp-ward：青灯结界。
- soul-banner：招魂幡。
- bronze-beast：铜兽机关。
- blood-curse：血咒。

## 4. 怪物配置

```ts
type EnemyConfig = {
  id: string;
  name: string;
  family: "soul" | "hunger" | "paper" | "lantern" | "bone" | "shadow" | "opera" | "yaksha";
  rank: "normal" | "elite" | "boss";
  behavior: EnemyBehaviorId[];
  baseStats: {
    hp: number;
    speed: number;
    damage: number;
    armor: number;
    xp: number;
    coin: number;
  };
  resistances: Partial<Record<DamageSchool, number>>;
  weaknesses: DamageSchool[];
  spawnWeight: number;
  tags: string[];
  asset: AssetRefSet;
};
```

## 5. 关卡配置

PandoraBox 原型已先把 60 关拆成 6 个章节，每章 10 关：

| 章节 | 关卡 | 主题 | 代表内容 |
| --- | --- | --- | --- |
| 雨夜戏台 | 1-10 | 纸伞、旧戏腔和雨夜招魂 | 游魂、纸人、骨奴、尸山鬼王 |
| 纸人长巷 | 11-20 | 纸扎铺、夜叉巡街和白纸伏兵 | 夜叉、无头将、鬼新娘 |
| 鬼市高架 | 21-30 | 高架桥、鬼市摊位和缝尸匠 | 缝尸匠、毒灯鬼、黑伞夜君 |
| 地铁夜门 | 31-40 | 末班地铁、扫射光束和夜门精英 | 戏伶鬼、画皮鬼、百目判官 |
| 百目写字楼 | 41-50 | 写字楼、镜面鬼眼和审判符阵 | 高阶精英、百目审判 |
| 魔盒深层 | 51-60 | 万象魔盒、恶念回潮和终夜封印 | 复合怪潮、终夜封印 |

正式配置建议单独拆 `ChapterConfig`：

```ts
type ChapterConfig = {
  id: string;
  title: string;
  shortTitle: string;
  startStage: number;
  endStage: number;
  motif: string;
  stageNames: string[];
  enemyBias: Record<string, number>;
  eventBias: Record<string, number>;
  dangerBias: Record<string, number>;
  modifierBias: Record<string, number>;
  skillBias: string[];
  environmentAsset: AssetRefSet;
  musicId: string;
  unlockCondition?: UnlockCondition;
};
```

当前原型已经把章节偏好接入以下系统：

- 普通刷怪权重。
- 补给伏击怪物池。
- 怪潮事件选择。
- 危险区类型选择。
- 战场词缀选择。
- 三选一符牌推荐。
- 营地章节情报展示。

设计约束：

- 章节偏好只能影响权重，不能彻底禁用全局系统，避免内容池过窄。
- 新怪首次出现的章节权重不要过高，要给玩家学习窗口。
- 章节推荐匣术权重应低于“当前高压威胁”和“最近伤害来源”，避免推荐脱离战场实际。
- Boss 关可额外叠加 Boss 机制推荐。
- 章节情报只展示 2-3 个主敌/事件/危险区，避免剧透整章全部内容。

同一章节内还需要 `StageProfileConfig` 控制 10 关节奏循环。PandoraBox 原型已接入：

| 位置 | Profile | 作用 |
| --- | --- | --- |
| 1 | 开卷 | 缓启动，补给/采集更多，事件和危险区较少 |
| 2 | 合围 | 普通怪和小怪潮压迫 |
| 3 | 伏击 | 伏击、冲锋和快速怪倾向上升 |
| 4 | 镇物 | 地图目标压力上升 |
| 5 | 鬼王 | 第一个 Boss 节点 |
| 6 | 整备 | 补给和成长窗口 |
| 7 | 混潮 | 远程、爆裂、治疗等组合怪潮 |
| 8 | 裂隙 | 裂隙目标和裂隙危险区倾向上升 |
| 9 | 压境 | Boss 前高压波，精英和事件更密 |
| 10 | 封夜 | 章节终局 Boss 节点 |

```ts
type StageProfileConfig = {
  id: string;
  title: string;
  icon: string;
  objectiveBias: Record<string, number>;
  enemyBias?: Record<string, number>;
  eventBias?: Record<string, number>;
  dangerBias?: Record<string, number>;
  eventRate: number;
  hazardRate: number;
  eliteBonus?: number;
  spawn: number;
  progress: number;
  reward: number;
  skillBias: string[];
  boss?: boolean;
};
```

`StageProfile` 之下还需要 `StagePhaseConfig`，用于控制单关内部进度变化。PandoraBox 原型已接入 5 个阶段：

| 进度 | Phase | 作用 |
| --- | --- | --- |
| 0%-30% | 初段试探 | 降低事件和危险区频率，偏普通怪和成型推荐 |
| 30%-70% | 混战展开 | 引入混合怪、远程、爆裂和控制需求 |
| 70%-100% | 终段压迫 | 刷怪更密，精英、变异、危险区和高压事件上升 |
| Boss 阈值后 | 鬼王临门 | Boss 关进入预热，保留过载、清精英、补生存 |
| Boss 存活时 | 鬼王交锋 | 降低普通事件，围绕 Boss 机制和生存推荐 |

```ts
type StagePhaseConfig = {
  id: string;
  title: string;
  short: string;
  icon: string;
  threshold?: number;
  spawn: number;
  eventRate: number;
  hazardRate: number;
  eliteBonus?: number;
  mutationBonus?: number;
  burstBonus?: number;
  enemyBias?: Record<string, number>;
  eventBias?: Record<string, number>;
  dangerBias?: Record<string, number>;
  skillBias: string[];
  bossPreview?: boolean;
  bossFight?: boolean;
};
```

Profile 与 Chapter 的关系：

- Chapter 决定“这一章主要是什么内容”。
- StageProfile 决定“这一关在章节内承担什么节奏”。
- StagePhase 决定“当前进度段怎么压迫玩家”。
- 最终权重 = 章节权重 x 关卡节奏权重 x 当前阶段权重。
- 推荐符牌先看当前威胁，再看当前阶段、本关节奏和章节主题。

```ts
type StageConfig = {
  id: string;
  chapterId: string;
  index: number;
  name: string;
  targetPower: number;
  progressGoal: number;
  expectedDurationSec: number;
  objectives: StageObjectiveConfig[];
  spawnPlan: SpawnPlanConfig;
  events: StageEventConfig[];
  bossId?: string;
  modifiers: string[];
  rewards: RewardConfig[];
};
```

关卡目标类型：

- kill-count：击杀。
- collect：收集。
- defend：守护。
- escort：护送。
- purify：净化。
- boss：击败 Boss。
- survive-pressure：在压力波中存活，同时仍需获得击杀积分。

## 6. 刷怪波次配置

```ts
type SpawnWaveConfig = {
  startProgress: number;
  endProgress: number;
  enemyPool: WeightedEnemy[];
  interval: number;
  count: number;
  pattern: "circle" | "front" | "ambush" | "line" | "burst" | "boss-escort";
  eliteChance?: number;
  mutationPool?: string[];
};
```

波次设计原则：

- 每关前 20% 不要突然压死玩家。
- 每 20% 进度至少有一次明显节奏变化。
- Boss 前 10% 必须有压迫波。
- 新怪第一次出现时数量少，第二次开始组合。
- 精英怪要有提示，不要突然贴脸秒杀。

## 7. 数值曲线

基础建议：

- 玩家每分钟升级 2 到 4 次。
- 早期每局可进化 0 到 1 个技能。
- 中期每局可进化 1 到 3 个技能。
- 后期每局可进化 3 到 5 个技能。
- Boss 战时长早期 30 到 60 秒，中期 60 到 120 秒，后期 90 到 180 秒。

怪物强度：

- 血量随章节增长快于伤害。
- 移速增长要谨慎，避免低操作空间。
- 怪物数量和行为复杂度比单体秒杀更重要。

玩家成长：

- 单局成长提供爆发爽感。
- 局外成长提供容错和目标感。
- 不让局外成长完全替代操作和构筑。

## 8. 内容矩阵

MVP 30 关建议：

| 章节 | 关卡 | 核心机制 | 新怪 | Boss |
| --- | --- | --- | --- | --- |
| 旧巷开夜 | 1-10 | 基础移动、魂火、升级、精英 | 游魂、饿鬼、纸人、灯笼鬼 | 鬼新娘简化版 |
| 鬼市无灯 | 11-20 | 铜钱鬼、鬼商、诅咒遗物、画皮 | 铜钱鬼、画皮、缝尸匠 | 百目判官 |
| 雨夜戏台 | 21-30 | 红线、雨夜、突进、音波 | 伞妖、戏伶鬼、夜叉 | 鬼新娘完整版 |

第二阶段 100+ 关：

- 旧巷开夜：1-15。
- 鬼市无灯：16-30。
- 雨夜戏台：31-45。
- 废寺尸潮：46-60。
- 地铁黄泉线：61-75。
- 镜城魇梦：76-90。
- 夜门之前：91-110。

## 9. 掉落设计

掉落类型：

- 魂火：经验。
- 铜钱：局外货币。
- 补给：回血。
- 魂灯：临时照亮或吸附。
- 宝箱：技能升级、遗物、进化。
- 残页：剧情。
- 碎片：章节推进。

掉落节奏：

- 普通怪主要掉魂火。
- 铜钱鬼掉铜钱。
- 精英怪掉宝箱或高品质魂火。
- Boss 掉进化宝箱、碎片和剧情。

## 10. 调优指标

每关需要记录：

- 平均通关时间。
- 平均失败时间。
- 平均击杀数。
- 平均升级次数。
- 技能选择分布。
- Boss 剩余血量分布。
- 死亡来源。
- 帧率低点。

调优判断：

- 如果大量玩家 30 秒内死亡，前期压迫过强或教学不清。
- 如果玩家只靠绕圈过关，通关进度没有绑定击杀和目标。
- 如果一个技能选择率过高，可能数值过强或其他技能反馈太弱。
- 如果 Boss 击杀时间差异过大，可能存在克制过强或机制不可读。
- 如果玩家升级太慢，魂火掉落或磁吸体验需要优化。
