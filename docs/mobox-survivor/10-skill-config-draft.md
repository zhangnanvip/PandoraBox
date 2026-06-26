# 技能配置草案

本文档承接当前 PandoraBox 原型里的“万象魔盒 · 选择符牌”系统，用于后续独立项目《魔盒幸存者：百鬼夜行》的 Cocos 配置化落地。

目标不是只记录技能名字，而是让每张升级卡都告诉玩家三个问题：

- 它属于什么流派。
- 它主要解决什么战斗问题。
- 它离进化还差什么条件。

## 1. 配置目标

当前原型已经把技能拆成四类：

- 匣术：主动输出技能，例如镇魂飞刃、朱砂符阵、护身铜轮。
- 符牌：成长与生存被动，例如疾步符、护命符、镇念诀。
- 终式：满足条件后的进化技能，例如千刃镇魂阵、血月护身咒。
- 遗物：Boss 掉落的长期构筑强化，例如鬼王印、青铜冠、护命玉。

正式项目需要把这些内容做成配置表，避免技能数值、推荐文本和 UI 文案散落在代码里。

## 2. SkillConfig 草案

```ts
type SkillKind = "active" | "passive" | "evolution" | "relic";
type DamageSchool = "spirit" | "fire" | "metal" | "thunder" | "paper" | "earth" | "frost" | "survival" | "economy";

interface SkillConfig {
  id: string;
  kind: SkillKind;
  title: string;
  icon: string;
  school: string;
  damageSchool?: DamageSchool;
  role: string;
  counters: string[];
  recommendedAgainst: string[];
  desc: string;
  maxLevel: number;
  rarityPool: string[];
  tags: string[];
  growth: SkillGrowth[];
  evolution?: EvolutionLink;
  choicePresentation: ChoicePresentation;
}

interface SkillGrowth {
  level: number;
  damageMultiplier?: number;
  cooldownMultiplier?: number;
  projectileDelta?: number;
  radiusDelta?: number;
  durationDelta?: number;
  special?: Record<string, number | string | boolean>;
}

interface EvolutionLink {
  targetId: string;
  requiredBaseLevel: number;
  requiredSkills: Record<string, number>;
  requiredRelics?: Record<string, number>;
}

interface ChoicePresentation {
  titlePrefix?: string;
  flowHint: string;
  counterHint: string;
  evolutionHintTemplate: string;
  recommendationHintTemplate: string;
  cardTone: "vermilion" | "cyan" | "gold" | "purple" | "green";
}
```

## 3. 当前首批技能表

| id | 名称 | 类型 | 流派 | 作用 | 克制目标 | 进化 |
| --- | --- | --- | --- | --- | --- | --- |
| knife | 镇魂飞刃 | 匣术 | 飞刃流 | 穿透点杀 | 戏伶鬼、缝尸匠 | 千刃镇魂阵 |
| aura | 朱砂符阵 | 匣术 | 符阵流 | 近身清潮 | 游魂、纸人 | 血月护身咒 |
| orbit | 护身铜轮 | 匣术 | 护身流 | 贴身防线 | 夜叉、灯笼鬼 | 百鬼切轮 |
| lightning | 惊雷符 | 匣术 | 雷法流 | 点名控场 | 灯笼鬼、无头将 | 天罚雷箓 |
| drone | 纸人傀儡 | 匣术 | 傀儡流 | 多线补刀 | 毒灯鬼、戏伶鬼 | 百纸夜军 |
| mine | 地煞雷符 | 匣术 | 地煞流 | 陷阱爆发 | 纸人、裂隙增援 | 地煞镇魂阵 |
| frost | 青灯寒咒 | 匣术 | 青灯流 | 减速保命 | 夜叉、红伞妖 | 青灯冰狱 |
| speed | 疾步符 | 符牌 | 身法 | 走位容错 | 陨火、扫射 | 辅助条件 |
| vitality | 护命符 | 符牌 | 生存 | 血量续航 | 爆裂、Boss | 辅助条件 |
| magnet | 招魂幡 | 符牌 | 招魂 | 经验成型 | 快节奏关卡 | 辅助条件 |
| focus | 镇念诀 | 符牌 | 镇念 | 伤害冷却 | 鬼王、精英 | 辅助条件 |
| armor | 护身甲符 | 符牌 | 护身 | 承伤减免 | 腐蚀、近身 | 辅助条件 |
| greed | 铜钱袋 | 符牌 | 鬼市 | 局外收益 | 长期养成 | 无 |

## 4. 进化配置草案

| 终式 | 基础匣术 | 条件 | 战斗定位 |
| --- | --- | --- | --- |
| 千刃镇魂阵 | 镇魂飞刃满级 | 招魂幡 2 级 | 高穿透、高点杀，适合处理精英和后排妖鬼 |
| 血月护身咒 | 朱砂符阵满级 | 护命符 2 级 | 近身燃烧和击杀扩散，适合被怪潮围住的局面 |
| 百鬼切轮 | 护身铜轮满级 | 疾步符 2 级 | 贴身防线和击退，适合夜叉冲锋、灯笼鬼贴脸 |
| 天罚雷箓 | 惊雷符满级 | 镇念诀 2 级 | 高爆发点名，适合 Boss、精英和远程威胁 |
| 百纸夜军 | 纸人傀儡满级 | 铜钱袋 2 级 | 多方向补刀，适合复杂怪潮和毒灯鬼 |
| 地煞镇魂阵 | 地煞雷符满级 | 护身甲符 2 级 | 路径封锁，适合裂隙增援和高密度怪潮 |
| 青灯冰狱 | 青灯寒咒满级 | 疾步符 2 级 | 大范围减速，适合高速怪和追击压力 |

## 5. 选择卡片展示规则

选择卡片必须包含：

- 标题：技能名 + 下一等级 / 进化 / 遗物等级。
- 稀有度：普通、稀有、史诗、终式。
- 类型：匣术、符牌、Boss 遗物、进化。
- 流派：飞刃流、符阵流、雷法流等。
- 主作用：穿透点杀、近身清潮、点名控场等。
- 克制对象：显示 1-3 个当前玩家能理解的敌人或机制。
- 进化提示：显示可进化、已满足条件，或距离目标还差多少。
- 重铸入口：每局有限次数，默认 2 次，局外幸运训练可以增加次数。

示例文案：

```text
镇魂飞刃 Lv.4
稀有 · 匣术 · 飞刃流
提高飞刃数量与镇魂伤害，本次直接提升 2 级
穿透点杀 · 克 戏伶鬼 / 缝尸匠
进化预览：千刃镇魂阵 · 镇魂飞刃4/6，招魂幡1/2
```

## 6. 威胁驱动推荐

当前 PandoraBox 原型已经接入轻量推荐规则。正式项目建议继续配置化，而不是把逻辑写死在 UI 层。

推荐来源包括：

- 主要伤害来源：本局累计伤害最高的敌人、弹幕、爆裂或危险区。
- 最近受伤来源：短时间内刚刚命中玩家的威胁。
- 场上高压敌人：Boss、精英、远程怪、冲锋怪、近身怪按距离和危险程度累计压力。
- 危险区：陨火、腐蚀、裂隙、扫射等地图机制。
- 怪潮事件：百鬼合围、红伞爆潮、夜叉猎杀等阶段事件。
- 战场词缀：静电风暴、孢子温床、虚空薄幕、赤月压境等。
- 当前目标：搜刮补给、采集魂火晶、点亮祭坛、护送引魂灯、封印裂隙。
- 低血量状态：提高护命符、护身甲符、疾步符和防御遗物推荐权重。

推荐结果不应该强制替换全部候选，而是影响候选权重，并在卡片上显示原因：

```text
推荐：主要威胁：夜叉
推荐：事件：百鬼合围
推荐：目标：封印夜门裂隙 1/2
```

正式配置可增加一张 `RecommendationRuleConfig`：

```ts
interface RecommendationRuleConfig {
  sourceType: "enemy" | "damage" | "danger" | "event" | "modifier" | "objective" | "playerState";
  sourceId: string;
  skillIds: string[];
  relicIds?: string[];
  baseWeight: number;
  reasonTemplate: string;
}
```

## 7. 重铸规则

重铸的目的不是让玩家无成本刷完美构筑，而是降低坏三选一带来的挫败感。

当前原型规则：

- 每局默认 2 次重铸。
- 幸运训练每 3 级额外增加 1 次。
- 普通升级和鬼王宝箱都可以重铸。
- 重铸只刷新当前候选，不额外消耗金币。
- 重铸不会暂停局外养成，也不会修改已获得技能。

正式项目可增加：

- “鬼市香灰”作为局内重铸消耗。
- 看广告获得 1 次额外重铸，但每天限次。
- 首局新手保护：第一次升级如果三张都不是输出，自动保底一张基础匣术。
- 构筑锁定：玩家可以锁定其中一张，只重铸另外两张。

## 8. 与百鬼图鉴联动

技能推荐不应该只靠固定文案，后续要和 `EnemyConfig` 建立双向关系：

- 敌人配置中写 `recommendedSkills`。
- 技能配置中写 `recommendedAgainst`。
- 关卡生成器根据当前高威胁敌人、事件和目标提高相关技能权重。
- 死亡结算根据 `damageSource` 和 `topEnemyThreat` 推荐 2-3 个技能。
- 百鬼图鉴页面展示“推荐匣术”和“推荐符牌”。

## 9. 后续任务

- 做 12 个基础技能的完整数值成长表。
- 做 6-8 个终式技能的视觉和机制差异表。
- 给每个技能补一个 16x16、64x64、256x256 三档图标资产规格。
- 继续调参选择卡片的推荐权重，例如本关夜叉多时提高青灯寒咒、护身铜轮、疾步符权重。
- 评估是否增加“锁定一张后重铸”能力，不让玩家被三张不相关的卡卡死构筑。
