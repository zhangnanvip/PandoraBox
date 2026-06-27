# 百鬼配置草案

这个文件把 PandoraBox 试玩版中已经验证的百鬼谱系、弱点、推荐匣术和伤害来源统计整理成独立项目可用的配置草案。正式 Cocos 项目可以把这里拆成 `enemy.json`、`enemyBehavior.json`、`damageSource.json` 和图鉴文本表。

## 1. 配置目标

每一种百鬼都必须同时服务四件事：

- 战斗行为：它怎么移动、怎么攻击、怎么给玩家压力。
- 视觉辨识：它在小屏幕上靠什么轮廓、颜色、印记被认出来。
- 策略提示：它怕什么，玩家应该拿什么匣术应对。
- 数据分析：它造成了多少伤害，玩家为什么死。

## 2. EnemyConfig 建议

```ts
type EnemyConfig = {
  id: string;
  title: string;
  family: string;
  codexTitle: string;
  codexText: string;
  weakness: string;
  counterTip: string;
  recommendedSkills: string[];
  behavior: EnemyBehaviorId[];
  unlockLevel: number;
  baseStats: {
    hp: number;
    speed: number;
    damage: number;
    xp: number;
    score: number;
    radius: number;
    weight: number;
  };
  visual: {
    color: string;
    mark: string;
    silhouette: string;
    deathEffect: string;
    telegraph?: string;
    frameSet: EnemyFrameSetConfig;
  };
  damageSource: {
    type: "contact" | "shot" | "zone" | "blast";
    label: string;
  };
};
```

## 3. 首批百鬼配置

| ID | 名称 | 谱系 | 弱点 | 推荐匣术 | 行为定位 |
| --- | --- | --- | --- | --- | --- |
| crawler | 游魂 | 魂 | 灵 | 朱砂符阵、护身铜轮 | 基础追击，数量压力 |
| bat | 灯笼鬼 | 火 | 雷 | 惊雷符、青灯寒咒 | 快速接近，扰乱走位 |
| swarmer | 纸人 | 纸 | 火 | 朱砂符阵、地煞雷符 | 小体型成群包围 |
| brute | 骨奴 | 骨 | 破甲 | 镇魂飞刃进化、惊雷符 | 高血量肉盾 |
| spitter | 毒灯鬼 | 咒 | 雷 | 镇魂飞刃、纸人傀儡 | 中距离弹幕 |
| bomber | 红伞妖 | 爆 | 远程 | 青灯寒咒、远程飞刃 | 接近后爆裂 |
| charger | 夜叉 | 突 | 减速 | 青灯寒咒、护身铜轮 | 预警冲锋 |
| shield | 无头将 | 甲 | 背袭 | 惊雷符、地煞雷符 | 重甲推进 |
| warden | 缝尸匠 | 愈 | 集火 | 镇魂飞刃、过载爆发 | 治疗与续航 |
| sniper | 戏伶鬼 | 音 | 贴近 | 纸人傀儡、镇魂飞刃 | 远程点射 |
| elite | 画皮鬼 | 异 | 爆发 | 进化匣术、过载 | 高压精英 |

## 3.1 预警视觉字段

有高风险行为的百鬼必须配置 `telegraph`，用于驱动战斗预警：

| 行为 | 预警视觉 | 当前原型示例 |
| --- | --- | --- |
| 冲锋 | 方向虚线，发动后变为粗实线 | 夜叉、尸山鬼王 |
| 自爆 | 爆炸范围圈，倒计时扇形 | 红伞妖 |
| 远程点射 | 指向玩家的瞄准线 | 毒灯鬼、戏伶鬼 |
| 治疗 | 治疗范围圈 | 缝尸匠、百目判官 |
| Boss 大招 | Boss 周身倒计时弧线 | 四类鬼王 |

预警视觉必须满足：

- 颜色与伤害类型一致。
- 出现时间足够玩家做一次侧向移动。
- 不被命中特效、掉落物和场景装饰盖住。
- 低端机降级时保留线/圈，优先去掉粒子。

## 3.2 动态识别与死亡反馈字段

试玩版已把 `visual` 从“颜色 + 谱系字”扩展为轻量动态层：

```ts
type EnemyVisualConfig = {
  color: string;
  mark: string;
  silhouette: string;
  motionCue: string;
  deathText: string;
  deathColor: string;
  spawnPatternBadges?: Record<string, string>;
  motionProfile: {
    rate: number;
    bob: number;
    sway: number;
    squash: number;
    lean: number;
    jitter?: number;
    stomp?: number;
    alphaPulse?: number;
  };
  frameSet: EnemyFrameSetConfig;
};

type EnemyFrameSetConfig = {
  asset: string;
  anchor: { x: number; y: number };
  frames?: Partial<Record<"idle" | "move" | "attack" | "hit" | "death" | "phase", string[]>>;
  states: {
    idle: { frames: number; fps: number };
    move: { frames: number; fps: number };
    hit: { frames: number; fps: number };
    death: { frames: number; fps: number };
    attack?: { frames: number; fps: number };
    phase?: { frames: number; fps: number };
  };
};
```

当前验证结果：

- 同类怪物可以共用静态 sprite，但必须叠加动态识别层。
- 不同百鬼必须使用不同运动 profile：轻怪靠高频，重怪靠低频，冲锋怪靠前倾，精英靠呼吸光圈。
- 受击需要短暂 squash / stretch，不能只闪白。
- 百鬼帧态先统一为 `idle / move / hit / death`，远程、治疗、自爆、冲锋怪补 `attack`，Boss 额外保留 `phase` 扩展位。
- 当前 PandoraBox Web 原型已接入 344 张百鬼 SVG 帧资源：普通怪覆盖 `move / hit / death`，高风险怪补 `attack`，通用鬼王和四类专属鬼王补 `phase`；这些路径已加入 survivor manifest，可作为离线缓存和 Cocos 图集拆分的过渡资产。
- Boss 帧资源按 `boss-{bossKind}` 优先选择，找不到专属资源时回退到通用 `boss`，正式项目可以沿用这个规则做 Boss 分包和渐进替换。
- 主角帧资源按 `heroes/{heroId}` 管理，当前沈灯 `ranger` 已接入 `idle / move / hit / overdrive`，正式项目建议拆成 `HeroConfig` 与 `HeroFrameSetConfig`，和敌人、Boss 资源使用同样的 manifest/分包规则。
- 危险行为的预警线/圈优先级高于装饰动态。
- 死亡反馈不只显示分数，高风险怪和特殊怪要显示死亡短语。
- 死亡时保留 0.4 到 0.8 秒残影，播放 `death` 帧，不直接从敌人数组消失。
- `frames` 是显式资源映射，没有配置路径时必须回退到程序占位绘制，避免移动端反复请求不存在的图片。
- 护卫、裂隙、背刺等刷怪阵型需要额外局内标记，帮助玩家理解“这批怪为什么这么进场”。

## 4. DamageSource 建议

试玩版已经开始记录：

- 近身伤害：来自具体百鬼。
- 弹幕伤害：来自发射者。
- 危险区伤害：陨火、腐蚀、裂隙、扫射光束。
- 爆裂伤害：红伞妖等自爆单位。

正式项目建议在结算页展示：

- 最后击倒来源。
- 本局主要伤害来源。
- 本局承伤次数。
- 推荐应对匣术。
- 推荐局外养成。

## 5. 图鉴条目模板

```ts
type CodexEntry = {
  enemyId: string;
  title: string;
  family: string;
  shortText: string;
  longText: string;
  weakness: string;
  recommendedSkills: string[];
  firstSeenChapter: string;
  origin: string;
  drops: string[];
};
```

示例：

```json
{
  "enemyId": "charger",
  "title": "夜叉",
  "family": "突",
  "shortText": "从夜门裂隙中冲出的恶鬼，冲锋前会短暂停顿。",
  "longText": "夜叉不怕正面硬碰，它真正危险的是蓄力后的直线突进。看见红色预警时要侧向移动，青灯寒咒和护身铜轮都能降低它的威胁。",
  "weakness": "减速",
  "recommendedSkills": ["青灯寒咒", "护身铜轮"],
  "firstSeenChapter": "雨夜戏台",
  "origin": "夜门裂道",
  "drops": ["魂火", "铜钱", "夜叉残角"]
}
```

## 6. 下一步

- 把每种百鬼的行为参数从代码中拆成配置。
- 给每种百鬼补图鉴长文案。
- 给 Boss 单独做 `BossConfig` 和 `BossCodexEntry`。
- 将伤害统计事件接入埋点，验证哪些敌人造成最高流失。
