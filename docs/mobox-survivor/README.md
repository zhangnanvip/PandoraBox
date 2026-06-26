# 《魔盒幸存者：百鬼夜行》项目资料包

这个目录用于承接独立项目《魔盒幸存者：百鬼夜行》。目标是把 PandoraBox 中已经验证过的割草生存方向，升级成一款可以单独立项、可发布到微信/抖音小游戏、可长期扩内容的专业移动端游戏。

## 文件索引

- [01-product-prd.md](./01-product-prd.md)：产品 PRD，定义定位、目标用户、核心循环、MVP 范围和商业化边界。
- [02-world-and-content-bible.md](./02-world-and-content-bible.md)：世界观、剧情、角色、百鬼、Boss、章节和文案基调。
- [03-core-gameplay-systems.md](./03-core-gameplay-systems.md)：核心战斗系统，包含移动、自动攻击、怪潮、升级、进化、Boss、关卡目标。
- [04-content-config-and-balance.md](./04-content-config-and-balance.md)：配置表、数值、内容矩阵、关卡曲线和调优指标。
- [05-cocos-technical-solution.md](./05-cocos-technical-solution.md)：Cocos Creator 技术方案、代码架构、性能策略和平台适配。
- [06-art-ui-audio-direction.md](./06-art-ui-audio-direction.md)：美术、UI、音效、动效和资产规格方向。
- [07-mini-game-platform-and-roadmap.md](./07-mini-game-platform-and-roadmap.md)：微信/抖音小游戏发布策略、研发路线、风险和阶段验收。
- [08-reflection-and-next-backlog.md](./08-reflection-and-next-backlog.md)：基于当前 PandoraBox 原型的反思、差距和下一轮任务池。
- [09-enemy-config-draft.md](./09-enemy-config-draft.md)：百鬼配置草案，沉淀弱点、推荐匣术、伤害来源和图鉴字段。
- [10-skill-config-draft.md](./10-skill-config-draft.md)：匣术、符牌、遗物、进化和选择卡片配置草案。

## 当前产品一句话

东方志怪题材的移动端割草生存游戏。玩家作为被万象魔盒选中的“执匣人”，在永不结束的百鬼夜行中收集魂火、进化匣术、击败鬼王、修复魔盒，并揭开人间恶念被封印的真相。

## 当前技术结论

- 最终独立项目建议使用 Cocos Creator 3.8 LTS + TypeScript。
- PandoraBox 当前 Canvas 版本继续作为玩法实验场，不直接作为正式小游戏 runtime。
- 正式项目要采用配置驱动、对象池、空间分桶碰撞、分包资源、平台适配层。
- 先 Web 内测，再微信小游戏，最后抖音小游戏。

## 项目名

中文名：魔盒幸存者：百鬼夜行

英文名建议：Mobox Survivor: Night Parade

更完整但偏长的英文副标题：Night Parade of One Hundred Demons
