# Cocos Creator 技术方案

## 1. 技术选型

推荐：Cocos Creator 3.8 LTS + TypeScript。

理由：

- 适合 2D 竖屏移动端游戏。
- 对微信小游戏、抖音小游戏和 Web 都有成熟发布链路。
- 支持场景、预制体、动画、粒子、图集、资源管理和分包。
- TypeScript 适合配置驱动和长期维护。
- 比继续使用原生 Canvas 更适合专业化内容生产。
- 比 Unity 更轻量，小游戏启动和包体压力更可控。

当前 PandoraBox 的 `src/games/survivor/game.js` 应作为玩法验证参考，不建议直接迁移为正式 runtime。

## 2. 项目分层

```text
GameApp
  Bootstrap
  SceneRouter
  PlatformAdapter
  AssetService
  SaveService
  AudioService
  AnalyticsService

BattleRuntime
  GameWorld
  EntityManager
  ObjectPool
  MovementSystem
  CollisionSystem
  CombatSystem
  SkillSystem
  SpawnSystem
  DropSystem
  ObjectiveSystem
  BossSystem
  EffectSystem
  CameraSystem
  HudSystem

MetaGame
  CharacterService
  TalentService
  ChapterService
  CodexService
  StoryService
  AchievementService
  ShopService

Config
  CharacterConfig
  SkillConfig
  EnemyConfig
  BossConfig
  StageConfig
  DropConfig
  TalentConfig
```

## 3. 场景规划

- BootScene：启动、平台初始化、基础配置加载。
- LoadingScene：分包和章节资源加载。
- HomeScene：主界面。
- CharacterScene：角色选择和养成。
- ChapterScene：章节与关卡选择。
- GameScene：核心战斗。
- ResultScene：结算。
- CodexScene：百鬼图鉴。
- StoryScene：剧情残页。
- ShopScene：鬼市/商店。

## 4. Entity 设计

不建议用深继承树。建议轻量实体 + 组件数据 + 系统处理。

```ts
type Entity = {
  id: number;
  kind: EntityKind;
  active: boolean;
  transform: TransformData;
  movement?: MovementData;
  combat?: CombatData;
  enemy?: EnemyData;
  projectile?: ProjectileData;
  pickup?: PickupData;
  effect?: EffectData;
  render?: RenderData;
};
```

实体类型：

- Player
- Enemy
- Boss
- Projectile
- AreaEffect
- Summon
- Pickup
- ObjectiveObject
- DamageText

## 5. 对象池

必须池化：

- Enemy
- Projectile
- AreaEffect
- Pickup
- DamageText
- HitEffect
- ParticleNode
- FloatingLabel

原则：

- 战斗中尽量不 `instantiate/destroy` 高频节点。
- 创建时预热，峰值不足时扩容。
- 单局结束统一回收。
- 对象池记录峰值，辅助调优。

## 6. 碰撞系统

目标：

- 单屏 150 到 250 敌人稳定。
- 峰值 300 到 600 敌人可降级运行。

方案：

- 空间分桶。
- Circle 和 AABB 优先。
- Projectile 只检测附近 bucket。
- Aura/Field 用半径查询。
- Boss 单独处理。

避免：

- 全对象两两检测。
- 每帧为每个技能分配大量临时数组。
- 每次命中都创建新节点。

## 7. 技能执行器

```ts
interface SkillExecutor {
  setup?(ctx: SkillContext): void;
  canCast(ctx: SkillContext): boolean;
  cast(ctx: SkillContext): void;
  update?(ctx: SkillContext, dt: number): void;
  cleanup?(ctx: SkillContext): void;
}
```

执行器类型：

- ProjectileSkillExecutor
- AuraSkillExecutor
- OrbitSkillExecutor
- SummonSkillExecutor
- StrikeSkillExecutor
- ChainSkillExecutor
- FieldSkillExecutor
- PassiveSkillExecutor

好处：

- 技能配置负责数值。
- 执行器负责行为。
- 新技能优先复用执行器。
- 特殊技能再单独扩展。

## 8. 刷怪系统

输入：

- 当前关卡配置。
- 当前进度。
- 玩家位置。
- 玩家强度估算。
- 当前事件。
- 当前怪物数量。

输出：

- 怪物类型。
- 数量。
- 位置。
- 队形。
- 精英词缀。

刷怪位置：

- 屏幕外环形。
- 前方压迫。
- 背后偷袭。
- 地图目标附近。
- Boss 护卫。

## 9. 存档系统

存档需要版本号和迁移。

```ts
type SaveData = {
  version: number;
  coins: number;
  premium?: number;
  characters: Record<string, CharacterSave>;
  talents: Record<string, number>;
  chapters: Record<string, ChapterSave>;
  codex: Record<string, CodexSave>;
  story: Record<string, boolean>;
  achievements: Record<string, AchievementSave>;
  settings: SettingsSave;
};
```

MVP：

- 本地存档。
- 支持版本迁移。
- 支持清除缓存。

正式运营：

- 平台登录。
- 云存档或自建后端。
- 关键数据服务端校验。

## 10. 性能策略

渲染：

- 图集减少 draw call。
- 同类特效复用材质。
- 低端机粒子降级。
- 远处敌人动画降帧。

逻辑：

- 怪物 AI 分帧更新。
- 空间分桶复用数组。
- 命中检测限频。
- 掉落物合并。
- 伤害数字合并。

内存：

- 章节资源分包。
- 不把后续章节 Boss 和地图放首包。
- 结算后释放未使用资源。

## 11. 平台适配层

```ts
interface PlatformAdapter {
  name: "web" | "wechat" | "douyin";
  login(): Promise<LoginResult>;
  showRewardedAd(placement: string): Promise<boolean>;
  share(payload: SharePayload): Promise<void>;
  saveLocal(key: string, value: string): void;
  loadLocal(key: string): string | null;
  reportEvent(name: string, data?: Record<string, unknown>): void;
}
```

平台能力不要散落在游戏逻辑中，必须通过适配层调用。

## 12. 工程目录建议

```text
assets/
  scenes/
  prefabs/
    battle/
    ui/
    enemies/
    skills/
  textures/
    characters/
    enemies/
    maps/
    skills/
    ui/
  particles/
  audio/
  configs/

scripts/
  app/
  platform/
  services/
  battle/
    core/
    systems/
    skills/
    enemies/
    bosses/
    objectives/
  meta/
  ui/
  configs/
  utils/
```

## 13. 验收命令建议

正式项目需要至少有：

- TypeScript 编译检查。
- 配置 schema 校验。
- 资源引用校验。
- 核心系统单元测试。
- Web 构建。
- 微信小游戏构建。
- 抖音小游戏构建。

PandoraBox 内当前可用检查：

```bash
node scripts/check-syntax.mjs
node scripts/check-plugins.mjs
```

