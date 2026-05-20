# 移动端小游戏扩展调研

更新时间：2026-05-20

## 调研依据

- MAF 2025 移动游戏榜单：https://maf.ad/en/blog/top-mobile-games-2025/
- Gamigion Hybridcasual 2025：https://www.gamigion.com/2025-hybridcasual-market-overview-with-real-data/
- AppMagic Mobile Market Landscape 2026：https://appmagic.rocks/files/view/upload/Reports/EN_MobileMarkeLandscape2026.pdf
- 2025 Mobile Monetization Report：https://files.gameindustrylibrary.com/documents/mobile-monetization-report-2025.pdf

## 结论

PandoraBox 后续不适合继续堆“只有基础规则”的小游戏。更值得做的是混合休闲与轻中度玩法：玩家能 10 秒理解操作，但需要关卡、资源、成长、收集、Boss、每日任务或排行榜来支撑长期复玩。

## 近期更值得扩展的方向

1. 方块拼图 / Block Puzzle
   - 参考：Block Blast、Wood Block、1010 类。
   - 适配原因：离线、竖屏、低操作成本，适合做连击、任务、赛季目标、特殊方块。
   - 建议优先级：S。

2. Tile Match / 麻将纸牌 / 牌面消除
   - 参考：Tile Match、Vita Mahjong、Triple Tile 类。
   - 适配原因：和当前麻将连连看资产与用户心智接近，适合做章节、障碍、道具和每日挑战。
   - 建议优先级：S。

3. Sort Puzzle / 螺丝、颜色、水管、停车排序
   - 参考：Screw Sort、Water Sort、Parking Jam。
   - 适配原因：移动端触控天然适合，关卡扩展成本低，能做限制步数、锁链、颜色、空间阻挡。
   - 建议优先级：A。

4. 合成经营 / Merge Puzzle
   - 参考：Merge Mansion、Travel Town 类。
   - 适配原因：比纯消除更有长期目标，但要控制复杂度，先做离线轻量版本。
   - 建议优先级：A。

5. Roguelite Survivor / 割草生存
   - 参考：Survivor.io、Vampire Survivors 类。
   - 适配原因：能复用现有街机引擎、敌人波次、掉落、技能成长和 Boss 能力。
   - 建议优先级：S。

6. 纸牌/牌组构筑
   - 参考：Solitaire、Balatro、轻量 Roguelike Deckbuilder。
   - 适配原因：离线耐玩、策略深，适合做局内构筑和关卡路线。
   - 建议优先级：A。

7. 轻模拟 / 放置经营
   - 参考：Idle、Mini Mart、农场经营类。
   - 适配原因：适合大厅做长期留存，但需要经济系统和离线收益设计。
   - 建议优先级：B。

## 当前大厅热度排序口径

热度分不是精确下载量，而是综合市场热度、长线留存能力、PandoraBox 现有架构适配度和离线可玩性得到的产品优先级。新增的“热门”tab 会按该分数排序。

当前最高优先级为：宝石消除、麻将连连看、机关塔防、2048、雷霆战机、扫雷、坦克大战、贪吃蛇。

## 下一批开发建议

第一批建议做 4 个，保持每个都复杂化：

1. 方块爆破
   - 10x10 拖拽拼图，连击、炸弹块、冰封块、每日目标、闯关模式。

2. Tile 三消麻将
   - 三张同牌入槽消除，槽位限制、锁牌、冰牌、章节地图、道具。

3. 割草生存
   - 复用街机引擎，自动攻击、经验升级、技能组合、精英怪、Boss、装备掉落。

4. 排序大师
   - 颜色/螺丝/停车三种规则先做一种，关卡化、步数限制、锁位和撤销道具。

第二批再补：Merge 合成经营、纸牌构筑、停车 Jam、轻量农场。
