import { createGameRegistry, defineLocalGame } from "../platform/game-plugin.js";
import { visualStyleDefinition } from "../theme/game-visuals.js";

export const categories = [
  { id: "all", title: "全部", shortTitle: "全部" },
  { id: "hot", title: "热门", shortTitle: "热门" },
  { id: "classic", title: "经典棋局", shortTitle: "棋局" },
  { id: "race", title: "跳跃竞速", shortTitle: "竞速" },
  { id: "puzzle", title: "益智解谜", shortTitle: "解谜" },
  { id: "number", title: "数字休闲", shortTitle: "数字" },
  { id: "strategy", title: "策略战术", shortTitle: "策略" },
  { id: "arcade", title: "动作街机", shortTitle: "街机" },
  { id: "quick", title: "快速对弈", shortTitle: "快局" }
];

const GAME_ENTRIES = {
  gomoku: "./src/games/gomoku/game.js",
  go: "./src/games/go/game.js",
  xiangqi: "./src/games/xiangqi/game.js",
  reversi: "./src/games/reversi/game.js",
  tictactoe: "./src/games/tictactoe/game.js",
  checkers: "./src/games/checkers/game.js",
  draughts: "./src/games/draughts/game.js",
  flying: "./src/games/flying/game.js",
  sudoku: "./src/games/sudoku/game.js",
  klotski: "./src/games/klotski/game.js",
  "block-blast": "./src/games/block-blast/game.js",
  "tile-match": "./src/games/tile-match/game.js",
  "sort-master": "./src/games/sort-master/game.js",
  "merge-workshop": "./src/games/merge-workshop/game.js",
  minesweeper: "./src/games/minesweeper/game.js",
  match3: "./src/games/match3/game.js",
  "mahjong-connect": "./src/games/mahjong-connect/game.js",
  "2048": "./src/games/number-2048/game.js",
  "tower-defense": "./src/games/tower-defense/game.js",
  "tank-battle": "./src/games/tank-battle/game.js",
  survivor: "./src/games/survivor/game.js",
  "space-shooter": "./src/games/space-shooter/game.js",
  snake: "./src/games/snake/game.js",
  breakout: "./src/games/breakout/game.js",
  tetris: "./src/games/tetris/game.js",
  connect4: "./src/games/connect4/game.js",
  "memory-match": "./src/games/memory-match/game.js",
  fifteen: "./src/games/fifteen/game.js",
  sokoban: "./src/games/sokoban/game.js",
  blackjack: "./src/games/blackjack/game.js",
  solitaire: "./src/games/solitaire/game.js",
  "peg-solitaire": "./src/games/peg-solitaire/game.js",
  nonogram: "./src/games/nonogram/game.js",
  "dots-and-boxes": "./src/games/dots-and-boxes/game.js",
  "snakes-ladders": "./src/games/snakes-ladders/game.js",
  pong: "./src/games/pong/game.js",
  flappy: "./src/games/flappy/game.js",
  "jump-tap": "./src/games/jump-tap/game.js",
  "24point": "./src/games/24point/game.js",
  pipes: "./src/games/pipes/game.js",
  "flood-it": "./src/games/flood-it/game.js",
  simon: "./src/games/simon/game.js",
  nim: "./src/games/nim/game.js",
  whack: "./src/games/whack/game.js",
  bubble: "./src/games/bubble/game.js",
  maze: "./src/games/maze/game.js",
  "lights-out": "./src/games/lights-out/game.js",
  reaction: "./src/games/reaction/game.js",
  doodle: "./src/games/doodle/game.js",
  catcher: "./src/games/catcher/game.js",
  spider: "./src/games/spider/game.js",
  freecell: "./src/games/freecell/game.js",
  yahtzee: "./src/games/yahtzee/game.js",
  mastermind: "./src/games/mastermind/game.js",
  kakuro: "./src/games/kakuro/game.js",
  mancala: "./src/games/mancala/game.js",
  hex: "./src/games/hex/game.js",
  "nine-mens-morris": "./src/games/nine-mens-morris/game.js",
  ataxx: "./src/games/ataxx/game.js",
  "word-search": "./src/games/word-search/game.js"
};

const CAPABILITY_PRESETS = {
  board: { fullscreen: false, sessionSave: false, staged: false, boss: false },
  puzzle: { fullscreen: false, sessionSave: false, staged: false, boss: false },
  number: { fullscreen: false, sessionSave: false, staged: false, boss: false },
  arcade: { fullscreen: true, sessionSave: true, staged: true, boss: false }
};

const SHARED_PRECACHE = {
  arcade: [
    "./src/games/arcade/bosses.js",
    "./src/games/arcade/classic-visuals.js",
    "./src/games/arcade/collision.js",
    "./src/games/arcade/controls.js",
    "./src/games/arcade/effects.js",
    "./src/games/arcade/engine.js",
    "./src/games/arcade/feedback.js",
    "./src/games/arcade/progression.js",
    "./src/games/arcade/rewards.js",
    "./src/games/arcade/stages.js"
  ]
};

function survivorEnemyFrameAsset(id, state, index) {
  return `./public/games/survivor/enemies/${id}/${state}-${index}.svg`;
}

function survivorEnemyFrameAssets(id, states) {
  return Object.entries(states).flatMap(([state, count]) =>
    Array.from({ length: count }, (_, index) => survivorEnemyFrameAsset(id, state, index))
  );
}

function survivorHeroFrameAsset(id, state, index) {
  return `./public/games/survivor/heroes/${id}/${state}-${index}.svg`;
}

function survivorHeroFrameAssets(id, states) {
  return Object.entries(states).flatMap(([state, count]) =>
    Array.from({ length: count }, (_, index) => survivorHeroFrameAsset(id, state, index))
  );
}

const SURVIVOR_ENEMY_FRAME_ASSETS = [
  ...survivorEnemyFrameAssets("crawler", { move: 4, hit: 2, death: 5 }),
  ...survivorEnemyFrameAssets("bat", { move: 4, hit: 2, death: 5 }),
  ...survivorEnemyFrameAssets("swarmer", { move: 4, hit: 2, death: 5 }),
  ...survivorEnemyFrameAssets("brute", { move: 6, hit: 3, death: 6 }),
  ...survivorEnemyFrameAssets("spitter", { move: 6, attack: 4, hit: 2, death: 5 }),
  ...survivorEnemyFrameAssets("bomber", { move: 6, attack: 5, hit: 2, death: 7 }),
  ...survivorEnemyFrameAssets("charger", { move: 8, attack: 4, hit: 2, death: 5 }),
  ...survivorEnemyFrameAssets("shield", { move: 6, hit: 3, death: 6 }),
  ...survivorEnemyFrameAssets("warden", { move: 6, attack: 4, hit: 2, death: 6 }),
  ...survivorEnemyFrameAssets("sniper", { move: 6, attack: 5, hit: 2, death: 5 }),
  ...survivorEnemyFrameAssets("elite", { move: 8, attack: 5, hit: 3, death: 8 }),
  ...survivorEnemyFrameAssets("boss", { move: 8, attack: 6, phase: 6, hit: 3, death: 10 }),
  ...survivorEnemyFrameAssets("boss-titan", { move: 8, attack: 6, phase: 6, hit: 3, death: 10 }),
  ...survivorEnemyFrameAssets("boss-hive", { move: 8, attack: 6, phase: 6, hit: 3, death: 10 }),
  ...survivorEnemyFrameAssets("boss-artillery", { move: 8, attack: 6, phase: 6, hit: 3, death: 10 }),
  ...survivorEnemyFrameAssets("boss-warden", { move: 8, attack: 6, phase: 6, hit: 3, death: 10 })
];

const SURVIVOR_HERO_FRAME_ASSETS = [
  ...survivorHeroFrameAssets("ranger", { idle: 4, move: 6, hit: 3, overdrive: 6 })
];

const MARKET_HEAT = {
  "block-blast": { score: 98, label: "方块爆款", signal: "Block Puzzle 是当前下载热度和长线复玩都很强的混合休闲品类。" },
  "tile-match": { score: 97, label: "Tile热门", signal: "三张入槽消除和麻将纸牌是当前移动端热门且耐玩的解谜方向。" },
  match3: { score: 96, label: "三消长线", signal: "关卡制三消仍是移动端长线留存的核心品类。" },
  survivor: { score: 95, label: "百鬼夜行", signal: "东方志怪割草依靠匣术构筑、百鬼怪潮、章节鬼王和局外成长形成强复玩。" },
  "mahjong-connect": { score: 94, label: "麻将消除", signal: "麻将、Tile 与连连看适合中老年和碎片时间用户。" },
  "sort-master": { score: 93, label: "排序耐玩", signal: "颜色、螺丝、水管和停车排序是移动端长线热度很高的触控解谜方向。" },
  "merge-workshop": { score: 92, label: "合成长线", signal: "Merge 类靠订单、生成器和资源循环形成长期目标，适合离线轻经营。" },
  "tower-defense": { score: 88, label: "策略耐玩", signal: "塔防靠波次、塔组和地图机制形成长期挑战。" },
  "2048": { score: 84, label: "数字常青", signal: "数字合成规则极简，但高分循环和多尺寸玩法耐玩。" },
  "space-shooter": { score: 83, label: "弹幕成长", signal: "竖版射击适合做关卡、技能和 Boss 成长线。" },
  minesweeper: { score: 82, label: "逻辑常青", signal: "经典逻辑游戏适合离线、闯关和限时模式。" },
  "tank-battle": { score: 80, label: "动作怀旧", signal: "坦克战适合关卡地图、道具和基地防守循环。" },
  snake: { score: 78, label: "街机常青", signal: "贪吃蛇适合做任务、障碍和成长变体。" },
  sudoku: { score: 77, label: "数独长线", signal: "数独靠每日题、难度和笔记机制保持复玩。" },
  breakout: { score: 75, label: "物理街机", signal: "打砖块适合道具、Boss 砖和关卡目标扩展。" },
  xiangqi: { score: 74, label: "区域常青", signal: "中国象棋在中文用户中有稳定认知和对弈深度。" },
  gomoku: { score: 72, label: "快局策略", signal: "五子棋上手快，AI 强度和残局题能提高耐玩度。" },
  klotski: { score: 70, label: "滑块解谜", signal: "华容道适合做关卡包、步数目标和排行榜。" },
  reversi: { score: 69, label: "翻转策略", signal: "黑白棋适合短局 AI 训练和残局挑战。" },
  go: { score: 68, label: "深度棋局", signal: "围棋深度高，但移动端完整局时长偏长。" },
  flying: { score: 68, label: "轻桌游", signal: "骰子竞速适合多人和事件卡扩展。" },
  checkers: { score: 64, label: "跳跃棋局", signal: "跳棋类需要任务化和关卡化增强移动端复玩。" },
  draughts: { score: 64, label: "经典跳棋", signal: "国际跳棋依赖 AI 和残局目标提升热度。" },
  tictactoe: { score: 62, label: "超短快局", signal: "井字棋适合作为教学和变体入口，长线较弱。" },
  tetris: { score: 96, label: "方块鼻祖", signal: "俄罗斯方块是全球认知度最高的落子消除街机，长线刷分极强。" },
  connect4: { score: 81, label: "对弈快局", signal: "四子棋上手快、AI 深度可调，适合碎片时间双人或对弈。" },
  "memory-match": { score: 79, label: "记忆翻牌", signal: "翻牌配对适合全年龄段，关卡与限时易扩展。" },
  fifteen: { score: 73, label: "滑块数字", signal: "数字华容道是经典滑块解谜，步数与计时排行耐玩。" },
  sokoban: { score: 71, label: "推箱闯关", signal: "推箱子靠关卡设计形成长线，仓库工是常青解谜。" },
  blackjack: { score: 80, label: "纸牌博弈", signal: "21 点规则简单、决策深度高，单人养成式刷分。" },
  solitaire: { score: 90, label: "纸牌常青", signal: "克朗代克接龙是桌面与移动端长青单人纸牌，复玩极强。" },
  "peg-solitaire": { score: 66, label: "独立钻石", signal: "孔明棋是经典跳棋解谜，残局收尾耐玩。" },
  nonogram: { score: 76, label: "数织绘图", signal: "数织靠逻辑推理与图案揭示，关卡可大量生成。" },
  "dots-and-boxes": { score: 70, label: "圈地对弈", signal: "点格棋上手快、策略链条深，适合人机或双人。" },
  "snakes-ladders": { score: 67, label: "骰子竞速", signal: "蛇梯棋是合家欢运气竞速，适合双人快局。" },
  pong: { score: 72, label: "弹球对战", signal: "乒乓街机鼻祖，单局短、节奏快、难度可调。" },
  flappy: { score: 85, label: "像素飞鸟", signal: "极简点触飞行刷分，难上手强复玩，传播性高。" },
  "jump-tap": { score: 79, label: "蓄力跳跃", signal: "蓄力跳台是抖音爆款节奏，一根手指即可挑战。" },
  "24point": { score: 65, label: "心算挑战", signal: "24 点是经典心算速算，益智又教育。" },
  pipes: { score: 68, label: "管道连通", signal: "水管旋转连通是常青逻辑解谜，关卡可生成。" },
  "flood-it": { score: 67, label: "同色蔓延", signal: "Flood-It 步数最优解谜，色彩明快碎片化。" },
  simon: { score: 64, label: "记忆序列", signal: "西蒙记忆灯是反应记忆经典，越长越紧张。" },
  nim: { score: 60, label: "取石博弈", signal: "取石子是博弈论入门，AI 可达必胜策略。" },
  whack: { score: 74, label: "打地鼠", signal: "打地鼠是全年龄反应街机，限时刷分上头。" },
  bubble: { score: 78, label: "泡泡消除", signal: "泡泡龙是常青瞄准消除，颜色聚类爽快。" },
  maze: { score: 63, label: "迷宫探路", signal: "随机迷宫闯关，越大越难，路径规划解压。" },
  "lights-out": { score: 61, label: "关灯解谜", signal: "关灯是异或逻辑解谜，最少步通关耐玩。" },
  reaction: { score: 62, label: "反应测试", signal: "反应靶测手速，单局极短适合碎片对比。" },
  doodle: { score: 76, label: "弹跳爬升", signal: "弹跳无尽爬升刷高分，倾斜操作经典休闲。" },
  catcher: { score: 65, label: "接物刷分", signal: "接好物躲炸弹，节奏渐快，老少皆宜。" },
  spider: { score: 86, label: "蜘蛛纸牌", signal: "蜘蛛接龙是 Windows 经典，难度可选花色，长线复玩。" },
  freecell: { score: 84, label: "空当接龙", signal: "空当接龙策略性强、几乎必胜，纸牌常青款。" },
  yahtzee: { score: 75, label: "快艇骰子", signal: "快艇骰子组合记分，单人多人皆宜的常青桌游。" },
  mastermind: { score: 66, label: "猜色破译", signal: "猜色逻辑推理，回合短，难度可调。" },
  kakuro: { score: 64, label: "数字填字", signal: "数字填字是数独近亲，加法逻辑解谜耐玩。" },
  mancala: { score: 63, label: "播棋", signal: "播棋是非洲千年策略桌游，撒子捕子深度足。" },
  hex: { score: 60, label: "六贯棋", signal: "六贯棋连接必有胜者，规则极简策略极深。" },
  "nine-mens-morris": { score: 62, label: "九子棋", signal: "九子棋成三吃子，落子+走子双阶段经典。" },
  ataxx: { score: 61, label: "同化棋", signal: "同化棋克隆扩张+翻转，节奏快策略强。" },
  "word-search": { score: 68, label: "成语找词", signal: "成语找词寓教于乐，划线找词全年龄。" }
};

function gameVisualStyle(key) {
  const style = visualStyleDefinition(key);
  return {
    visualStyles: [style],
    defaultVisualStyle: style.value
  };
}

function gamePluginMeta(id, preset, capabilities = {}) {
  return {
    pluginId: `pandora.local.${id}`,
    entry: GAME_ENTRIES[id],
    marketHeat: MARKET_HEAT[id] || { score: 50, label: "小众补充", signal: "作为大厅品类补充。" },
    precacheAssets: SHARED_PRECACHE[preset] || [],
    capabilities: {
      ...(CAPABILITY_PRESETS[preset] || CAPABILITY_PRESETS.board),
      ...capabilities
    }
  };
}

const registrations = [
  defineLocalGame(
    {
      id: "gomoku",
      title: "五子棋",
      subtitle: "15 路连珠，先连五子获胜",
      tag: "策略入门",
      category: "classic",
      secondaryCategories: ["quick"],
      complexity: "简单",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("gomoku", "board"),
      ...gameVisualStyle("guofengBoard"),
      accent: "ink",
      icon: "./public/skins/guofeng-ink/icons/gomoku.svg",
      rules: [
        "黑方先手，双方轮流在空交点落子。",
        "横、竖、斜任一方向先形成连续五子即获胜。",
        "困难难度更重视必杀拦截与强形争夺；魔鬼难度会额外评估双威胁和对手下一手反击。",
        "提示会给出推荐落点和原因，胜负结束后会高亮连成的棋线。"
      ]
    },
    () => import("./gomoku/game.js").then((module) => module.mountGomoku)
  ),
  defineLocalGame(
    {
      id: "go",
      title: "围棋",
      subtitle: "支持 9/13/19 路，提子与停一手",
      tag: "深度棋局",
      category: "classic",
      complexity: "困难",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("go", "board", { sessionSave: true }),
      ...gameVisualStyle("guofengBoard"),
      setupFields: [
        {
          id: "boardSize",
          label: "棋盘规格",
          defaultValue: "9",
          options: [
            { value: "9", label: "9路 入门快局" },
            { value: "13", label: "13路 均衡练习" },
            { value: "19", label: "19路 完整棋局" }
          ]
        }
      ],
      accent: "jade",
      icon: "./public/skins/guofeng-ink/icons/go.svg",
      rules: [
        "开局前可选择 9 路、13 路或 19 路棋盘；9 路适合移动端快局，19 路更接近完整对局。",
        "黑方先手，在棋盘交点落子，不能落在无气且无法提子的点。",
        "包围对方棋串最后一口气即可提子。",
        "双方连续停一手后按首版估分结算；魔鬼难度会更重视断点、逃气、提子和局部反击。"
      ]
    },
    () => import("./go/game.js").then((module) => module.mountGo)
  ),
  defineLocalGame(
    {
      id: "xiangqi",
      title: "象棋",
      subtitle: "红黑对弈，车马炮兵将士象",
      tag: "国粹攻防",
      category: "classic",
      complexity: "困难",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("xiangqi", "board"),
      ...gameVisualStyle("guofengBoard"),
      accent: "cinnabar",
      icon: "./public/skins/guofeng-ink/icons/xiangqi.svg",
      rules: [
        "红方先行，棋子按中国象棋常规走法移动。",
        "将帅不能照面，吃掉对方将/帅即获胜。",
        "魔鬼难度会做小深度搜索，兼顾吃子、兑子、机动性和将帅安全。"
      ]
    },
    () => import("./xiangqi/game.js").then((module) => module.mountXiangqi)
  ),
  defineLocalGame(
    {
      id: "reversi",
      title: "黑白棋",
      subtitle: "夹击翻子，终局多子获胜",
      tag: "翻转攻防",
      category: "classic",
      secondaryCategories: ["quick"],
      complexity: "中等",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("reversi", "board"),
      ...gameVisualStyle("guofengBoard"),
      accent: "ink",
      icon: "./public/skins/guofeng-ink/icons/reversi.svg",
      rules: [
        "黑方先手，落子必须夹住至少一条对方棋子。",
        "被夹住的对方棋子会翻成己方颜色。",
        "无合法落子时自动跳过；棋盘填满或双方都无棋可下后，多子一方获胜。",
        "魔鬼难度会额外推演多层应手，优先抢角、压缩行动力并避开边角陷阱。"
      ]
    },
    () => import("./reversi/game.js").then((module) => module.mountReversi)
  ),
  defineLocalGame(
    {
      id: "tictactoe",
      title: "井字棋",
      subtitle: "三连即胜，困难 AI 不留破绽",
      tag: "快局训练",
      category: "classic",
      secondaryCategories: ["quick"],
      complexity: "简单",
      progressType: "match",
      ...gamePluginMeta("tictactoe", "board", { sessionSave: true }),
      ...gameVisualStyle("guofengBoard"),
      accent: "jade",
      icon: "./public/skins/guofeng-ink/icons/tictactoe.svg",
      rules: [
        "X 先手，双方轮流在 3x3 方格中落子。",
        "横、竖、斜任一方向率先三连即获胜。",
        "困难难度使用完整搜索，适合作为基础攻防练习。"
      ]
    },
    () => import("./tictactoe/game.js").then((module) => module.mountTicTacToe)
  ),
  defineLocalGame(
    {
      id: "checkers",
      title: "中国跳棋",
      subtitle: "星盘跳跃，抢先进驻对营",
      tag: "连跳规划",
      category: "race",
      secondaryCategories: ["classic"],
      complexity: "中等",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("checkers", "board"),
      ...gameVisualStyle("guofengBoard"),
      accent: "lotus",
      icon: "./public/skins/guofeng-ink/icons/checkers.svg",
      rules: [
        "红子从下方营地出发，目标是全部进入上方对营。",
        "每步可移动到相邻空位，也可跨过相邻棋子跳到其后空位。",
        "一次选择可完成远距离连跳，AI 会按难度评估推进和跳跃收益。"
      ]
    },
    () => import("./checkers/game.js").then((module) => module.mountChineseCheckers)
  ),
  defineLocalGame(
    {
      id: "draughts",
      title: "国际跳棋",
      subtitle: "斜行吃子，升王后前后皆可走",
      tag: "强制吃子",
      category: "race",
      secondaryCategories: ["classic"],
      complexity: "中等",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("draughts", "board"),
      ...gameVisualStyle("guofengBoard"),
      accent: "cinnabar",
      icon: "./public/skins/guofeng-ink/icons/draughts.svg",
      rules: [
        "棋子只在深色格上移动，普通子向前斜走一格。",
        "可以吃子时必须吃子；吃子后若仍可继续吃，则继续行动。",
        "普通子抵达底线升王，王可向前或向后斜走一格。",
        "魔鬼难度会推演连续吃子、升王收益和反吃风险。"
      ]
    },
    () => import("./draughts/game.js").then((module) => module.mountDraughts)
  ),
  defineLocalGame(
    {
      id: "flying",
      title: "飞行棋",
      subtitle: "投骰起飞，撞子与冲线",
      tag: "轻松对局",
      category: "race",
      secondaryCategories: ["quick"],
      complexity: "简单",
      progressType: "match",
      ...gamePluginMeta("flying", "board", { sessionSave: true }),
      ...gameVisualStyle("guofengBoard"),
      accent: "sky",
      icon: "./public/skins/guofeng-ink/icons/flying.svg",
      rules: [
        "掷到 6 可让基地内飞机起飞，已起飞飞机按骰点前进。",
        "落到对手所在格可将对手撞回基地。",
        "先让四架飞机全部到达终点的一方获胜；掷到 6 后可继续行动。"
      ]
    },
    () => import("./flying/game.js").then((module) => module.mountFlyingChess)
  ),
  defineLocalGame(
    {
      id: "sudoku",
      title: "数独",
      subtitle: "九宫排布，行列宫内不重复",
      tag: "逻辑填数",
      category: "puzzle",
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "puzzle",
      ...gamePluginMeta("sudoku", "puzzle"),
      ...gameVisualStyle("classicPuzzle"),
      setupFields: [
        {
          id: "assistMode",
          label: "辅助程度",
          defaultValue: "standard",
          options: [
            { value: "guided", label: "引导模式 实时纠错" },
            { value: "standard", label: "标准模式 检查提示" },
            { value: "pure", label: "纯净模式 无提示" }
          ]
        }
      ],
      accent: "lotus",
      icon: "./public/skins/guofeng-ink/icons/sudoku.svg",
      rules: [
        "在 9x9 棋盘中填入 1-9。",
        "每一行、每一列、每一个 3x3 宫内数字都不能重复。",
        "引导模式会实时标出错误，标准模式可主动检查或提示，纯净模式隐藏提示与检查。",
        "魔鬼难度会保留更少初始数字。"
      ]
    },
    () => import("./sudoku/game.js").then((module) => module.mountSudoku)
  ),
  defineLocalGame(
    {
      id: "klotski",
      title: "华容道",
      subtitle: "横刀立马，移动曹操到出口",
      tag: "滑块解谜",
      category: "puzzle",
      complexity: "困难",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "puzzle",
      ...gamePluginMeta("klotski", "puzzle"),
      ...gameVisualStyle("classicPuzzle"),
      setupFields: [
        {
          id: "levelId",
          label: "关卡",
          defaultValue: "easy",
          options: [
            { value: "easy", label: "开门见山 目标 1 步" },
            { value: "medium", label: "短兵相接 目标 24 步" },
            { value: "hard", label: "层层设防 目标 52 步" },
            { value: "devil", label: "横刀立马 目标 81 步" }
          ]
        }
      ],
      accent: "cinnabar",
      icon: "./public/skins/guofeng-ink/icons/klotski.svg",
      rules: [
        "点击棋子选中，再使用方向按钮移动。",
        "棋子不能重叠，也不能移出棋盘。",
        "把曹操移动到下方出口即完成关卡。",
        "开局前可选择关卡；横刀立马更接近经典堵塞布局。"
      ]
    },
    () => import("./klotski/game.js").then((module) => module.mountKlotski)
  ),
  defineLocalGame(
    {
      id: "match3",
      title: "宝石消除",
      subtitle: "交换宝石连线消除，完成关卡目标",
      tag: "三消闯关",
      category: "puzzle",
      secondaryCategories: ["quick", "number"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("match3", "puzzle", { sessionSave: true, staged: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "sky",
      icon: "./public/games/puzzle/icons/match3.svg",
      assets: ["./public/games/puzzle/icons/match3.svg"],
      rules: [
        "点击或滑动交换相邻宝石，形成横向或纵向 3 个及以上相同宝石即可消除。",
        "游戏采用 30 关闯关模式，每关都有目标分数、目标宝石和步数限制。",
        "后续关卡会增加更多宝石颜色和障碍石；障碍石可通过旁边的消除击碎。",
        "提示会标出一组可交换宝石，洗牌会消耗 1 步并重新排列当前棋盘。",
        "难度会影响步数、目标分、目标数量、颜色数量和障碍数量。"
      ]
    },
    () => import("./match3/game.js").then((module) => module.mountMatch3)
  ),
  defineLocalGame(
    {
      id: "block-blast",
      title: "方块爆破",
      subtitle: "10x10 放置方块，连消行列冲击高分",
      tag: "方块爆款",
      category: "puzzle",
      secondaryCategories: ["number", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("block-blast", "puzzle", { sessionSave: true, staged: true }),
      ...gameVisualStyle("classicPuzzle"),
      setupFields: [
        {
          id: "blockMode",
          label: "玩法模式",
          defaultValue: "campaign",
          options: [
            { value: "campaign", label: "闯关任务 60 关递进" },
            { value: "classic", label: "经典高分 单局冲榜" },
            { value: "pressure", label: "炸弹压力 倒计时障碍" }
          ]
        }
      ],
      accent: "sky",
      icon: "./public/games/puzzle/icons/block-blast.svg",
      assets: ["./public/games/puzzle/icons/block-blast.svg"],
      rules: [
        "选择下方方块后点击棋盘落位，填满整行或整列即可爆破得分。",
        "闯关任务包含 60 关，后续会逐步加入冰块、炸弹和更复杂的方块形状。",
        "冰块会占位，需要通过行列爆破或锤子清除；炸弹会随步数倒计时，未及时清除会失败。",
        "旋转、锤子和换组都是有限资源，适合在关键卡点使用。",
        "难度会影响步数、目标分、冰块、炸弹和道具数量。"
      ]
    },
    () => import("./block-blast/game.js").then((module) => module.mountBlockBlast)
  ),
  defineLocalGame(
    {
      id: "tile-match",
      title: "麻将三消",
      subtitle: "点牌入槽，三张相同麻将自动消除",
      tag: "Tile热门",
      category: "puzzle",
      secondaryCategories: ["quick", "classic"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("tile-match", "puzzle", { sessionSave: true, staged: true }),
      ...gameVisualStyle("classicPuzzle"),
      setupFields: [
        {
          id: "tileMode",
          label: "玩法模式",
          defaultValue: "campaign",
          options: [
            { value: "campaign", label: "章节闯关 60 关递进" },
            { value: "classic", label: "经典消除 单局清台" },
            { value: "pressure", label: "槽位压力 更少容错" }
          ]
        }
      ],
      accent: "jade",
      icon: "./public/games/puzzle/icons/tile-match.svg",
      assets: ["./public/games/puzzle/icons/tile-match.svg"],
      rules: [
        "点击可选麻将牌进入下方槽位，三张相同牌会自动消除。",
        "槽位有限，如果槽位被不同牌填满，挑战失败。",
        "章节闯关包含 60 关，后续会逐步增加堆叠深度、冰封牌、封印牌和暗牌。",
        "冰封牌需要先破冰，暗牌需要先翻开，封印牌会在消除三张后逐步解开。",
        "提示、撤回和洗牌次数有限；难度会影响槽位数量、道具数量和特殊牌密度。"
      ]
    },
    () => import("./tile-match/game.js").then((module) => module.mountTileMatch)
  ),
  defineLocalGame(
    {
      id: "sort-master",
      title: "排序大师",
      subtitle: "倒瓶归色，破解锁链与冰封瓶阵",
      tag: "排序耐玩",
      category: "puzzle",
      secondaryCategories: ["quick", "number"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("sort-master", "puzzle", { sessionSave: true, staged: true }),
      ...gameVisualStyle("classicPuzzle"),
      setupFields: [
        {
          id: "sortMode",
          label: "玩法模式",
          defaultValue: "campaign",
          options: [
            { value: "campaign", label: "闯关排序 60 关递进" },
            { value: "chain", label: "锁链挑战 更多障碍瓶" },
            { value: "relaxed", label: "经典单局 更宽松步数" }
          ]
        }
      ],
      accent: "sky",
      icon: "./public/games/puzzle/icons/sort-master.svg",
      assets: ["./public/games/puzzle/icons/sort-master.svg"],
      rules: [
        "点击一个瓶子作为起点，再点击目标瓶，将顶部连续同色液体倒入目标瓶。",
        "目标瓶必须为空，或顶部颜色与倒入颜色一致，且瓶子不能超过 4 格容量。",
        "闯关排序包含 60 关，后续会增加颜色数量、瓶子数量、步数压力、锁链瓶和冰封瓶。",
        "钥匙可解开锁链瓶，破冰可解冻冰封瓶；提示、撤回和洗局次数有限。",
        "把每种颜色都整理成一整瓶即可过关，剩余步数和道具会转化为奖励分。"
      ]
    },
    () => import("./sort-master/game.js").then((module) => module.mountSortMaster)
  ),
  defineLocalGame(
    {
      id: "merge-workshop",
      title: "合成工坊",
      subtitle: "生成材料，合成高阶物品并交付订单",
      tag: "合成长线",
      category: "puzzle",
      secondaryCategories: ["strategy", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("merge-workshop", "puzzle", { sessionSave: true, staged: true }),
      ...gameVisualStyle("classicPuzzle"),
      setupFields: [
        {
          id: "mergeMode",
          label: "玩法模式",
          defaultValue: "campaign",
          options: [
            { value: "campaign", label: "订单闯关 60 关递进" },
            { value: "rush", label: "紧急订单 更紧能量" },
            { value: "relaxed", label: "经典工坊 单局经营" }
          ]
        }
      ],
      accent: "jade",
      icon: "./public/games/puzzle/icons/merge-workshop.svg",
      assets: ["./public/games/puzzle/icons/merge-workshop.svg"],
      rules: [
        "点击生成器消耗能量产出基础材料，两个同系列同等级材料可以合成为更高等级。",
        "订单会要求指定系列和等级的材料，交付后会获得分数、能量和少量道具。",
        "订单闯关包含 60 关，后续会增加材料系列、最高等级、目标订单数量、锁箱和封印材料。",
        "钥匙可打开锁箱，清扫可解除封印；提示、撤回和换单次数有限。",
        "能量耗尽且没有可合成、可交付或可生成操作时挑战失败。"
      ]
    },
    () => import("./merge-workshop/game.js").then((module) => module.mountMergeWorkshop)
  ),
  defineLocalGame(
    {
      id: "minesweeper",
      title: "扫雷",
      subtitle: "数字推理，避开隐藏雷区",
      tag: "经典推理",
      category: "puzzle",
      secondaryCategories: ["quick", "number"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("minesweeper", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      setupFields: [
        {
          id: "mineMode",
          label: "玩法模式",
          defaultValue: "campaign",
          options: [
            { value: "campaign", label: "闯关任务 30 关递进" },
            { value: "classic", label: "经典排雷 单局挑战" },
            { value: "timed", label: "限时拆弹 倒计时压力" }
          ]
        }
      ],
      accent: "cinnabar",
      icon: "./public/games/puzzle/icons/minesweeper.svg",
      assets: ["./public/games/puzzle/icons/minesweeper.svg"],
      rules: [
        "点击格子翻开数字，数字表示周围八格内的地雷数量。",
        "首次点击一定安全；移动端可长按插旗，也可开启标记模式。",
        "闯关任务包含 30 关，后续关卡会增加棋盘尺寸与地雷密度。",
        "扫描可以标出一个安全格，拆雷器可以直接排除一枚隐藏地雷，但次数有限。",
        "限时拆弹会加入倒计时压力；难度会影响棋盘尺寸、地雷数量和资源数量。"
      ]
    },
    () => import("./minesweeper/game.js").then((module) => module.mountMinesweeper)
  ),
  defineLocalGame(
    {
      id: "mahjong-connect",
      title: "麻将连连看",
      subtitle: "两折以内连通相同麻将牌即可消除",
      tag: "麻将消除",
      category: "puzzle",
      secondaryCategories: ["quick", "classic"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("mahjong-connect", "puzzle", { sessionSave: true, staged: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "jade",
      icon: "./public/games/puzzle/icons/mahjong-connect.svg",
      assets: ["./public/games/puzzle/icons/mahjong-connect.svg"],
      rules: [
        "点击两张相同麻将牌，如果连接路径最多转弯两次且中间无遮挡，就会消除。",
        "游戏采用 30 关闯关模式，后续关卡会增加牌数、牌面种类和障碍。",
        "提示会标出一组可消除牌，洗牌会重新排列当前剩余牌。",
        "牌局没有可消除组合时会自动尝试洗牌，保持可继续推进。",
        "难度会影响初始牌数、障碍数量、提示次数和洗牌次数。"
      ]
    },
    () => import("./mahjong-connect/game.js").then((module) => module.mountMahjongConnect)
  ),
  defineLocalGame(
    {
      id: "2048",
      title: "2048",
      subtitle: "滑动合并，冲击更高数字",
      tag: "数字休闲",
      category: "number",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      progressType: "score",
      ...gamePluginMeta("2048", "number", { sessionSave: true }),
      ...gameVisualStyle("classicNumber"),
      setupFields: [
        {
          id: "boardSize",
          label: "棋盘规格",
          defaultValue: "4",
          options: [
            { value: "4", label: "4x4 经典" },
            { value: "5", label: "5x5 舒展" },
            { value: "6", label: "6x6 策略" },
            { value: "8", label: "8x8 沙盒" }
          ]
        }
      ],
      accent: "sky",
      icon: "./public/skins/guofeng-ink/icons/2048.svg",
      rules: [
        "在棋盘区域滑动，相同数字会沿滑动方向合并。",
        "每次有效移动后会出现新的 2 或 4。",
        "4x4 是经典节奏，5x5 更宽松，6x6 更适合长线规划，8x8 偏沙盒挑战。",
        "达到目标数字后可继续挑战最高分。"
      ]
    },
    () => import("./number-2048/game.js").then((module) => module.mount2048)
  ),
  defineLocalGame(
    {
      id: "tower-defense",
      title: "机关塔防",
      subtitle: "布置弩塔、炮塔、冰塔与电塔守住核心",
      tag: "波次防守",
      category: "strategy",
      secondaryCategories: ["arcade"],
      complexity: "困难",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("tower-defense", "arcade", { boss: true }),
      ...gameVisualStyle("classicArcade"),
      accent: "jade",
      icon: "./public/games/arcade/icons/tower-defense.svg",
      assets: ["./public/games/arcade/icons/tower-defense.svg"],
      rules: [
        "点击空地建塔，道路上不能建造；弩塔射速快，炮塔可范围爆炸，冰塔会减速敌人，电塔可连锁。",
        "使用底部按钮选择塔型、升级已选塔，点击出怪开始当前波次。",
        "游戏采用 12 关 48 波防守，4 套路线轮换；每关末波都有守门 Boss。",
        "快怪、重甲、蜂群、分裂怪、护盾怪会随着波次逐步加入，关卡推进时会返还部分塔投入并重新部署。",
        "敌人穿过终点会扣除核心生命；核心归零则失败。",
        "难度会影响初始金币、核心生命、敌人生命、速度和数量。",
        "移动端全屏游玩，桌面端可用 1/2/3 选塔、空格出怪、U 升级、R 重开。"
      ]
    },
    () => import("./tower-defense/game.js").then((module) => module.mountTowerDefense)
  ),
  defineLocalGame(
    {
      id: "tank-battle",
      title: "坦克大战",
      subtitle: "守住基地，击破敌方装甲",
      tag: "基地攻防",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["medium"],
      progressType: "score",
      ...gamePluginMeta("tank-battle", "arcade", { boss: true }),
      ...gameVisualStyle("classicArcade"),
      accent: "cinnabar",
      icon: "./public/games/arcade/icons/tank-battle.svg",
      assets: ["./public/games/arcade/icons/tank-battle.svg"],
      rules: [
        "移动坦克躲避敌火，发射炮弹击破敌方坦克。",
        "游戏采用 24 关单一闯关模式，清空本关敌军后会保留分数和生命进入下一关。",
        "砖墙可被炮弹击毁，钢墙不可击毁。",
        "战场会掉落速射、护盾、维修和冻结补给，移动到补给上即可触发。",
        "后续关卡会逐步加入重装指挥坦克 Boss、复杂地形和更大的战场，每 6 关会出现 Boss 压力点。",
        "关卡会影响敌人数量、速度、开火频率和追击强度。"
      ]
    },
    () => import("./tank-battle/game.js").then((module) => module.mountTankBattle)
  ),
  defineLocalGame(
    {
      id: "survivor",
      title: "魔盒幸存者",
      subtitle: "百鬼夜行，执匣人活到天明",
      tag: "百鬼夜行",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["medium"],
      progressType: "score",
      ...gamePluginMeta("survivor", "arcade", { boss: true }),
      ...gameVisualStyle("classicArcade"),
      accent: "jade",
      icon: "./public/games/arcade/icons/survivor.svg",
      assets: ["./public/games/arcade/icons/survivor.svg", ...SURVIVOR_ENEMY_FRAME_ASSETS, ...SURVIVOR_HERO_FRAME_ASSETS],
      setupFields: [
        {
          id: "character",
          label: "角色职业",
          defaultValue: "ranger",
          options: [
            { value: "ranger", label: "沈灯：镇魂飞刃，均衡灵活" },
            { value: "engineer", label: "陆青岚：机关傀儡，资源收益" },
            { value: "arcanist", label: "白烬：鬼火咒术，爆发更强" }
          ]
        }
      ],
      rules: [
        "在长夜战场中拖动执匣人移动，匣术会自动攻击最近的百鬼。",
        "开局可选择沈灯、陆青岚或白烬，不同执匣人拥有不同初始匣术、属性和成长倾向。",
        "拾取魂火升级后，可从匣术、符牌、稀有卡和进化卡中选择强化。",
        "当前试玩版采用 60 关怪潮推进，每 5 关出现鬼王压力点。",
        "百鬼会逐步解锁疾行、远程、重甲、冲锋、护盾和精英词缀。",
        "地图目标、夜行事件、遗物、角色主动技和鬼王技能会随关卡逐步加入。"
      ]
    },
    () => import("./survivor/game.js").then((module) => module.mountSurvivor)
  ),
  defineLocalGame(
    {
      id: "space-shooter",
      title: "雷霆战机",
      subtitle: "竖版弹幕，穿梭火线",
      tag: "弹幕突击",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["medium"],
      progressType: "score",
      ...gamePluginMeta("space-shooter", "arcade", { boss: true }),
      ...gameVisualStyle("classicArcade"),
      accent: "sky",
      icon: "./public/games/arcade/icons/space-shooter.svg",
      assets: ["./public/games/arcade/icons/space-shooter.svg"],
      rules: [
        "在画布上拖动战机，桌面端也可用方向键移动，战机会自动射击。",
        "游戏采用 160 关长线空域推进，击毁敌机获得积分，积分达到本关目标才会进入下一关。",
        "躲过去的敌机不会计算通关进度，只会继续增加战场压力。",
        "敌机会按关卡逐步解锁高速侦察机、装甲机、散射机、激光机、分裂机、护盾精英和指挥舰。",
        "补给包含散弹、激光、僚机、护盾、维修和清屏脉冲，后期 Boss 关每 10 关出现一次。"
      ]
    },
    () => import("./space-shooter/game.js").then((module) => module.mountSpaceShooter)
  ),
  defineLocalGame(
    {
      id: "snake",
      title: "贪吃蛇",
      subtitle: "游走棋盘，越吃越长",
      tag: "反应练习",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["medium"],
      progressType: "score",
      ...gamePluginMeta("snake", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "jade",
      icon: "./public/games/arcade/icons/snake.svg",
      assets: ["./public/games/arcade/icons/snake.svg"],
      rules: [
        "游戏采用 30 关任务模式，每关吃够指定数量的能量豆后进入下一关。",
        "控制蛇头吃到食物，每吃一个食物身体增长。",
        "后续关卡会出现障碍块，护盾豆可抵消一次障碍碰撞。",
        "能量豆分为普通、加分、慢速和护盾，不同道具会影响节奏。",
        "撞墙、撞到自己或无护盾撞上障碍即结束。",
        "关卡会影响移动速度、目标数量和障碍数量。",
        "移动端在画布上滑动转向，桌面端可用方向键或 WASD。"
      ]
    },
    () => import("./snake/game.js").then((module) => module.mountSnake)
  ),
  defineLocalGame(
    {
      id: "breakout",
      title: "打砖块",
      subtitle: "弹球破阵，清空砖墙",
      tag: "弹射街机",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["medium"],
      progressType: "score",
      ...gamePluginMeta("breakout", "arcade", { boss: true }),
      ...gameVisualStyle("classicArcade"),
      accent: "lotus",
      icon: "./public/games/arcade/icons/breakout.svg",
      assets: ["./public/games/arcade/icons/breakout.svg"],
      rules: [
        "移动挡板反弹小球，击碎上方砖块。",
        "游戏采用 30 关砖阵推进，清空当前砖阵后进入下一关，每 5 关出现 Boss 砖核心。",
        "击碎砖块可能掉落扩展挡板、慢速力场和备用球。",
        "Boss 关会在砖阵清空后出现砖核心，击破后继续推进后续关卡。",
        "关卡会影响小球速度、砖块行数和挡板宽度。",
        "移动端可拖动挡板或按左右键。"
      ]
    },
    () => import("./breakout/game.js").then((module) => module.mountBreakout)
  ),
  defineLocalGame(
    {
      id: "tetris",
      title: "俄罗斯方块",
      subtitle: "落子成行，越堆越快",
      tag: "方块鼻祖",
      category: "arcade",
      secondaryCategories: ["number", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      progressType: "score",
      ...gamePluginMeta("tetris", "number", { sessionSave: true }),
      ...gameVisualStyle("classicArcade"),
      accent: "sky",
      icon: "./public/games/extra/icons/tetris.svg",
      assets: ["./public/games/extra/icons/tetris.svg"],
      rules: [
        "方块自动下落，移动和旋转使其填满整行即可消除得分。",
        "一次消除 1/2/3/4 行分别记 100/300/500/800，并随等级翻倍。",
        "消除行数越多，等级越高、下落越快。",
        "移动端用底部按钮或滑动，桌面端方向键移动、空格瞬降。"
      ]
    },
    () => import("./tetris/game.js").then((module) => module.mountTetris)
  ),
  defineLocalGame(
    {
      id: "connect4",
      title: "四子棋",
      subtitle: "重力落子，先连四子获胜",
      tag: "对弈快局",
      category: "classic",
      secondaryCategories: ["quick", "strategy"],
      complexity: "简单",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("connect4", "board", { sessionSave: true }),
      ...gameVisualStyle("guofengBoard"),
      accent: "cinnabar",
      icon: "./public/games/extra/icons/connect4.svg",
      assets: ["./public/games/extra/icons/connect4.svg"],
      rules: [
        "点击列，棋子受重力落到该列最低空位。",
        "横、竖、斜任一方向先连成四子即获胜。",
        "魔鬼难度做 6 层搜索，兼顾进攻成形和拦截威胁。",
        "可悔棋、重开，支持续玩。"
      ]
    },
    () => import("./connect4/game.js").then((module) => module.mountConnect4)
  ),
  defineLocalGame(
    {
      id: "memory-match",
      title: "记忆翻牌",
      subtitle: "翻牌配对，少步通关",
      tag: "记忆翻牌",
      category: "puzzle",
      secondaryCategories: ["quick", "number"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("memory-match", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "lotus",
      icon: "./public/games/extra/icons/memory-match.svg",
      assets: ["./public/games/extra/icons/memory-match.svg"],
      rules: [
        "每次翻开两张牌，相同则保留，不同则翻回。",
        "记住牌面位置，全部配对即完成。",
        "难度决定卡牌对数：6/8/12/18 对。",
        "步数越少、用时越短，结算分越高。"
      ]
    },
    () => import("./memory-match/game.js").then((module) => module.mountMemoryMatch)
  ),
  defineLocalGame(
    {
      id: "fifteen",
      title: "数字华容道",
      subtitle: "滑动方块，复原 1 到 N",
      tag: "滑块数字",
      category: "puzzle",
      secondaryCategories: ["number", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("fifteen", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicNumber"),
      accent: "jade",
      icon: "./public/games/extra/icons/fifteen.svg",
      assets: ["./public/games/extra/icons/fifteen.svg"],
      rules: [
        "点击空格相邻的方块即可滑入空格。",
        "把数字按顺序排回即为通关。",
        "难度决定棋盘：3x3、4x4、5x5 与重洗 5x5。",
        "步数与用时越少结算分越高。"
      ]
    },
    () => import("./fifteen/game.js").then((module) => module.mountFifteen)
  ),
  defineLocalGame(
    {
      id: "sokoban",
      title: "推箱子",
      subtitle: "把箱子推上目标点",
      tag: "推箱闯关",
      category: "puzzle",
      secondaryCategories: ["strategy", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      progressType: "score",
      ...gamePluginMeta("sokoban", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "cinnabar",
      icon: "./public/games/extra/icons/sokoban.svg",
      assets: ["./public/games/extra/icons/sokoban.svg"],
      rules: [
        "只能推不能拉，把所有箱子推到目标点过关。",
        "9 个内置关卡难度递增，可撤回、重开本关。",
        "移动端用方向键或滑动，桌面端方向键/WASD。",
        "支持续玩，保留当前关卡进度。"
      ]
    },
    () => import("./sokoban/game.js").then((module) => module.mountSokoban)
  ),
  defineLocalGame(
    {
      id: "blackjack",
      title: "21点",
      subtitle: "要牌停牌，比庄家更接近 21",
      tag: "纸牌博弈",
      category: "number",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      progressType: "score",
      ...gamePluginMeta("blackjack", "number", { sessionSave: true }),
      ...gameVisualStyle("classicNumber"),
      accent: "lotus",
      icon: "./public/games/extra/icons/blackjack.svg",
      assets: ["./public/games/extra/icons/blackjack.svg"],
      rules: [
        "下注后要牌或停牌，点数不超 21 且比庄家大即赢。",
        "庄家点数到 17 必须停；黑杰克赔率 3:2。",
        "A 可计 1 或 11，初始 1000 筹码。",
        "筹码用尽结算最高身家，支持续玩保留筹码。"
      ]
    },
    () => import("./blackjack/game.js").then((module) => module.mountBlackjack)
  ),
  defineLocalGame(
    {
      id: "solitaire",
      title: "接龙纸牌",
      subtitle: "克朗代克接龙，按花色归位",
      tag: "纸牌常青",
      category: "puzzle",
      secondaryCategories: ["number", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      progressType: "score",
      ...gamePluginMeta("solitaire", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "cinnabar",
      icon: "./public/games/extra/icons/solitaire.svg",
      assets: ["./public/games/extra/icons/solitaire.svg"],
      rules: [
        "翻牌堆补牌，列内按颜色交替递减叠放。",
        "把四门花色从 A 到 K 收齐到基础堆即获胜。",
        "点选牌再点目标移动，双击送入基础堆。",
        "可撤销、重开，支持续玩。"
      ]
    },
    () => import("./solitaire/game.js").then((module) => module.mountSolitaire)
  ),
  defineLocalGame(
    {
      id: "peg-solitaire",
      title: "孔明棋",
      subtitle: "跳吃棋子，留一子为胜",
      tag: "独立钻石",
      category: "puzzle",
      secondaryCategories: ["classic", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("peg-solitaire", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "jade",
      icon: "./public/games/extra/icons/peg-solitaire.svg",
      assets: ["./public/games/extra/icons/peg-solitaire.svg"],
      rules: [
        "选一枚棋子跨过相邻棋子跳入空位，被跨者移除。",
        "目标是棋盘最终只剩一子。",
        "困难要求最后一子落在中心。",
        "无子可跳即结束，可悔棋、重开。"
      ]
    },
    () => import("./peg-solitaire/game.js").then((module) => module.mountPegSolitaire)
  ),
  defineLocalGame(
    {
      id: "nonogram",
      title: "数织",
      subtitle: "按行列数字涂格成图",
      tag: "数织绘图",
      category: "puzzle",
      secondaryCategories: ["number", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("nonogram", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "sky",
      icon: "./public/games/extra/icons/nonogram.svg",
      assets: ["./public/games/extra/icons/nonogram.svg"],
      rules: [
        "行列数字表示该行/列连续填涂的长度。",
        "点击填涂，标记模式可打叉排除。",
        "正确涂满全部目标格即完成。",
        "难度决定棋盘 5x5、10x10、15x15 与高密度。"
      ]
    },
    () => import("./nonogram/game.js").then((module) => module.mountNonogram)
  ),
  defineLocalGame(
    {
      id: "dots-and-boxes",
      title: "点格棋",
      subtitle: "连线圈地，占格多者胜",
      tag: "圈地对弈",
      category: "strategy",
      secondaryCategories: ["classic", "quick"],
      complexity: "中等",
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "match",
      ...gamePluginMeta("dots-and-boxes", "board", { sessionSave: true }),
      ...gameVisualStyle("guofengBoard"),
      accent: "cinnabar",
      icon: "./public/games/extra/icons/dots-and-boxes.svg",
      assets: ["./public/games/extra/icons/dots-and-boxes.svg"],
      rules: [
        "在两点之间连边，围成一格即占格并加一手。",
        "占格多者获胜；棋盘按难度 4x4 到 6x6。",
        "AI 会贪心吃格并尽量不送格，困难考虑长链。",
        "支持悔局、重开与续玩。"
      ]
    },
    () => import("./dots-and-boxes/game.js").then((module) => module.mountDotsBoxes)
  ),
  defineLocalGame(
    {
      id: "snakes-ladders",
      title: "蛇梯棋",
      subtitle: "掷骰前进，爬梯避蛇",
      tag: "骰子竞速",
      category: "race",
      secondaryCategories: ["quick"],
      complexity: "简单",
      progressType: "match",
      ...gamePluginMeta("snakes-ladders", "board", { sessionSave: true }),
      ...gameVisualStyle("guofengBoard"),
      accent: "lotus",
      icon: "./public/games/extra/icons/snakes-ladders.svg",
      assets: ["./public/games/extra/icons/snakes-ladders.svg"],
      rules: [
        "点击骰子前进，踩到梯底上升、蛇头下滑。",
        "先精确到 100 的一方获胜。",
        "支持人机或本地双人。",
        "可重开，支持续玩。"
      ]
    },
    () => import("./snakes-ladders/game.js").then((module) => module.mountSnakesLadders)
  ),
  defineLocalGame(
    {
      id: "pong",
      title: "弹球对战",
      subtitle: "挡板互拼，先到 7 分",
      tag: "弹球对战",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("pong", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "sky",
      icon: "./public/games/extra/icons/pong.svg",
      assets: ["./public/games/extra/icons/pong.svg"],
      rules: [
        "拖动挡板反弹小球，让对手接不住得分。",
        "先到 7 分获胜，球速逐拍加快。",
        "难度影响 AI 反应与球速。",
        "移动端拖动，桌面端方向键，可重开。"
      ]
    },
    () => import("./pong/game.js").then((module) => module.mountPong)
  ),
  defineLocalGame(
    {
      id: "flappy",
      title: "像素鸟",
      subtitle: "点触飞行，穿越管道",
      tag: "像素飞鸟",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("flappy", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "sky",
      icon: "./public/games/extra/icons/flappy.svg",
      assets: ["./public/games/extra/icons/flappy.svg"],
      rules: [
        "点击或空格让小鸟上扬，松开下落。",
        "穿过一根管道得 1 分，撞到即结束。",
        "难度影响管道间隙与速度。",
        "随时重开冲击最高分。"
      ]
    },
    () => import("./flappy/game.js").then((module) => module.mountFlappy)
  ),
  defineLocalGame(
    {
      id: "jump-tap",
      title: "跳一跳",
      subtitle: "蓄力起跳，稳落下一台",
      tag: "蓄力跳跃",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("jump-tap", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "lotus",
      icon: "./public/games/extra/icons/jump-tap.svg",
      assets: ["./public/games/extra/icons/jump-tap.svg"],
      rules: [
        "按住蓄力，松手起跳，落在下一平台得分。",
        "正中平台中心有额外奖励分。",
        "落空即结束，难度影响平台间距波动。",
        "移动端按住屏幕，桌面端按住空格。"
      ]
    },
    () => import("./jump-tap/game.js").then((module) => module.mountJumpTap)
  ),
  defineLocalGame(
    {
      id: "24point",
      title: "24点",
      subtitle: "四数算出 24",
      tag: "心算挑战",
      category: "number",
      secondaryCategories: ["quick", "puzzle"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("24point", "number"),
      ...gameVisualStyle("classicNumber"),
      accent: "cinnabar",
      icon: "./public/games/extra/icons/24point.svg",
      assets: ["./public/games/extra/icons/24point.svg"],
      rules: [
        "用加减乘除把四个数算成 24。",
        "点数字、点运算符、再点数字合并，化到一个 24 过关。",
        "每副牌保证有解，可提示、撤销、换局。",
        "连过多局结算用时与正确数。"
      ]
    },
    () => import("./24point/game.js").then((module) => module.mount24Point)
  ),
  defineLocalGame(
    {
      id: "pipes",
      title: "水管工",
      subtitle: "旋转管道，接通水流",
      tag: "管道连通",
      category: "puzzle",
      secondaryCategories: ["quick", "strategy"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("pipes", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "sky",
      icon: "./public/games/extra/icons/pipes.svg",
      assets: ["./public/games/extra/icons/pipes.svg"],
      rules: [
        "点击管道格旋转 90 度。",
        "把水从源头接到终点即过关。",
        "难度决定 4x4 到 7x7 的网格大小。",
        "步数越少结算分越高，支持续玩。"
      ]
    },
    () => import("./pipes/game.js").then((module) => module.mountPipes)
  ),
  defineLocalGame(
    {
      id: "flood-it",
      title: "同色消融",
      subtitle: "选色蔓延，染满全盘",
      tag: "同色蔓延",
      category: "puzzle",
      secondaryCategories: ["number", "quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("flood-it", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "jade",
      icon: "./public/games/extra/icons/flood-it.svg",
      assets: ["./public/games/extra/icons/flood-it.svg"],
      rules: [
        "从左上角开始，选一种颜色染色相连区域。",
        "在步数上限内把整盘染成一色即胜。",
        "难度决定棋盘、颜色数与步数限制。",
        "剩余步数越多结算分越高。"
      ]
    },
    () => import("./flood-it/game.js").then((module) => module.mountFloodIt)
  ),
  defineLocalGame(
    {
      id: "simon",
      title: "记忆序列",
      subtitle: "记住灯光，依序重现",
      tag: "记忆序列",
      category: "quick",
      secondaryCategories: ["arcade"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("simon", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "lotus",
      icon: "./public/games/extra/icons/simon.svg",
      assets: ["./public/games/extra/icons/simon.svg"],
      rules: [
        "四个灯块按序亮起，记住后依次点回。",
        "每轮序列加长，复现成功才继续。",
        "出错即结束，最长序列即得分。",
        "难度影响亮灯速度。"
      ]
    },
    () => import("./simon/game.js").then((module) => module.mountSimon)
  ),
  defineLocalGame(
    {
      id: "nim",
      title: "取石子",
      subtitle: "轮流取石，拿到最后输",
      tag: "取石博弈",
      category: "classic",
      secondaryCategories: ["quick", "strategy"],
      complexity: "简单",
      difficultySupport: ["easy", "medium", "hard"],
      progressType: "match",
      ...gamePluginMeta("nim", "board", { sessionSave: true }),
      ...gameVisualStyle("guofengBoard"),
      accent: "ink",
      icon: "./public/games/extra/icons/nim.svg",
      assets: ["./public/games/extra/icons/nim.svg"],
      rules: [
        "每次从任意一行取走若干石子。",
        "拿走最后一颗的一方判负。",
        "困难 AI 走 XOR 必胜策略，先思考再落手。",
        "支持人机或本地双人，可重开。"
      ]
    },
    () => import("./nim/game.js").then((module) => module.mountNim)
  ),
  defineLocalGame(
    {
      id: "whack",
      title: "打地鼠",
      subtitle: "限时敲鼠，躲开炸弹",
      tag: "打地鼠",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("whack", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "cinnabar",
      icon: "./public/games/extra/icons/whack.svg",
      assets: ["./public/games/extra/icons/whack.svg"],
      rules: [
        "地鼠随机冒头，快点它得分。",
        "误敲炸弹会扣分，60 秒内冲高分。",
        "难度影响冒头速度与炸弹比例。",
        "结束按分数结算，可重开。"
      ]
    },
    () => import("./whack/game.js").then((module) => module.mountWhack)
  ),
  defineLocalGame(
    {
      id: "bubble",
      title: "泡泡龙",
      subtitle: "瞄准发射，三连消除",
      tag: "泡泡消除",
      category: "arcade",
      secondaryCategories: ["puzzle", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("bubble", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "sky",
      icon: "./public/games/extra/icons/bubble.svg",
      assets: ["./public/games/extra/icons/bubble.svg"],
      rules: [
        "瞄准角度发射泡泡，三个同色相连即消除。",
        "悬空泡泡会掉落额外加分。",
        "泡泡逐排下压，触底即失败。",
        "难度影响颜色数与下压速度。"
      ]
    },
    () => import("./bubble/game.js").then((module) => module.mountBubble)
  ),
  defineLocalGame(
    {
      id: "maze",
      title: "迷宫",
      subtitle: "穿墙寻路，抵达出口",
      tag: "迷宫探路",
      category: "puzzle",
      secondaryCategories: ["quick", "race"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("maze", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "jade",
      icon: "./public/games/extra/icons/maze.svg",
      assets: ["./public/games/extra/icons/maze.svg"],
      rules: [
        "从起点走到红旗出口。",
        "通关后迷宫逐级变大。",
        "移动端方向键或滑动，桌面端方向键/WASD。",
        "步数与用时影响结算，支持续玩。"
      ]
    },
    () => import("./maze/game.js").then((module) => module.mountMaze)
  ),
  defineLocalGame(
    {
      id: "lights-out",
      title: "关灯",
      subtitle: "切换灯阵，全部熄灭",
      tag: "关灯解谜",
      category: "puzzle",
      secondaryCategories: ["number", "quick"],
      complexity: "中等",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("lights-out", "puzzle", { sessionSave: true }),
      ...gameVisualStyle("classicPuzzle"),
      accent: "sky",
      icon: "./public/games/extra/icons/lights-out.svg",
      assets: ["./public/games/extra/icons/lights-out.svg"],
      rules: [
        "点一盏灯会同时翻转它和上下左右。",
        "把所有灯熄灭即过关。",
        "难度决定 4x4 到 6x6 的灯阵。",
        "步数越少结算分越高。"
      ]
    },
    () => import("./lights-out/game.js").then((module) => module.mountLightsOut)
  ),
  defineLocalGame(
    {
      id: "reaction",
      title: "反应靶",
      subtitle: "出现就点，比拼手速",
      tag: "反应测试",
      category: "quick",
      secondaryCategories: ["arcade"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("reaction", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "cinnabar",
      icon: "./public/games/extra/icons/reaction.svg",
      assets: ["./public/games/extra/icons/reaction.svg"],
      rules: [
        "靶子随机出现，越快点中越高分。",
        "靶子逐渐变小，误点与超时会扣时。",
        "30 个回合后结算平均反应。",
        "难度影响靶子大小与时限。"
      ]
    },
    () => import("./reaction/game.js").then((module) => module.mountReaction)
  ),
  defineLocalGame(
    {
      id: "doodle",
      title: "弹跳",
      subtitle: "踩台爬升，越跳越高",
      tag: "弹跳爬升",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("doodle", "arcade", { sessionSave: true }),
      ...gameVisualStyle("classicArcade"),
      accent: "jade",
      icon: "./public/games/extra/icons/doodle.svg",
      assets: ["./public/games/extra/icons/doodle.svg"],
      rules: [
        "自动弹跳，左右倾斜踩稳平台。",
        "越往上爬分数越高。",
        "活动与破碎平台增加变数，掉出底部即结束。",
        "移动端拖动或点屏两侧，桌面端方向键。"
      ]
    },
    () => import("./doodle/game.js").then((module) => module.mountDoodle)
  ),
  defineLocalGame(
    {
      id: "catcher",
      title: "接福",
      subtitle: "接好物，躲炸弹",
      tag: "接物刷分",
      category: "arcade",
      secondaryCategories: ["quick"],
      complexity: "简单",
      modeSupport: ["solo"],
      difficultySupport: ["easy", "medium", "hard", "devil"],
      progressType: "score",
      ...gamePluginMeta("catcher", "arcade"),
      ...gameVisualStyle("classicArcade"),
      accent: "lotus",
      icon: "./public/games/extra/icons/catcher.svg",
      assets: ["./public/games/extra/icons/catcher.svg"],
      rules: [
        "移动篮子接住下落的好物得分。",
        "炸弹要躲开，碰到扣一条命。",
        "三条命用尽结算，速度逐渐加快。",
        "难度影响下落速度与炸弹比例。"
      ]
    },
    () => import("./catcher/game.js").then((module) => module.mountCatcher)
  ),
  defineLocalGame(
    { id: "spider", title: "蜘蛛纸牌", subtitle: "同花顺收 K 到 A", tag: "蜘蛛纸牌", category: "puzzle", secondaryCategories: ["number", "quick"], complexity: "中等", modeSupport: ["solo"], difficultySupport: ["easy", "medium", "hard"], progressType: "score", ...gamePluginMeta("spider", "puzzle", { sessionSave: true }), ...gameVisualStyle("classicPuzzle"), accent: "cinnabar", icon: "./public/games/extra/icons/spider.svg", assets: ["./public/games/extra/icons/spider.svg"], rules: ["列内同花从 K 到 A 顺连可整组收走。", "牌堆发牌时每列补一张。", "收齐 8 组即胜，难度决定花色数。", "可撤销重开，支持续玩。"] },
    () => import("./spider/game.js").then((m) => m.mountSpider)
  ),
  defineLocalGame(
    { id: "freecell", title: "空当接龙", subtitle: "借空格归位四花色", tag: "空当接龙", category: "puzzle", secondaryCategories: ["number", "quick"], complexity: "中等", modeSupport: ["solo"], progressType: "score", ...gamePluginMeta("freecell", "puzzle", { sessionSave: true }), ...gameVisualStyle("classicPuzzle"), accent: "sky", icon: "./public/games/extra/icons/freecell.svg", assets: ["./public/games/extra/icons/freecell.svg"], rules: ["列内异色递减叠放，4 个空格暂存。", "把四门花色 A 到 K 收齐获胜。", "点选牌再点目标，双击送基础堆。", "可撤销重开，支持续玩。"] },
    () => import("./freecell/game.js").then((m) => m.mountFreecell)
  ),
  defineLocalGame(
    { id: "yahtzee", title: "快艇骰子", subtitle: "三投留骰，组合记分", tag: "快艇骰子", category: "number", secondaryCategories: ["quick"], complexity: "简单", modeSupport: ["solo"], progressType: "score", ...gamePluginMeta("yahtzee", "number", { sessionSave: true }), ...gameVisualStyle("classicNumber"), accent: "jade", icon: "./public/games/extra/icons/yahtzee.svg", assets: ["./public/games/extra/icons/yahtzee.svg"], rules: ["每回合最多投三次，点骰子保留。", "13 个记分项各用一次。", "上区满 63 加 35 分。", "13 回合后结算总分。"] },
    () => import("./yahtzee/game.js").then((m) => m.mountYahtzee)
  ),
  defineLocalGame(
    { id: "mastermind", title: "猜色", subtitle: "十次破译颜色密码", tag: "猜色破译", category: "quick", secondaryCategories: ["puzzle"], complexity: "简单", modeSupport: ["solo"], difficultySupport: ["easy", "medium", "hard", "devil"], progressType: "score", ...gamePluginMeta("mastermind", "arcade"), ...gameVisualStyle("classicArcade"), accent: "lotus", icon: "./public/games/extra/icons/mastermind.svg", assets: ["./public/games/extra/icons/mastermind.svg"], rules: ["选 4 个颜色提交猜测。", "黑钉=位色全对，白钉=色对位错。", "10 次内破译密码获胜。", "难度决定颜色与长度。"] },
    () => import("./mastermind/game.js").then((m) => m.mountMastermind)
  ),
  defineLocalGame(
    { id: "kakuro", title: "数字填字", subtitle: "加法宫格填 1-9", tag: "数字填字", category: "number", secondaryCategories: ["puzzle"], complexity: "困难", modeSupport: ["solo"], difficultySupport: ["easy", "medium", "hard", "devil"], progressType: "score", ...gamePluginMeta("kakuro", "number", { sessionSave: true }), ...gameVisualStyle("classicNumber"), accent: "ink", icon: "./public/games/extra/icons/kakuro.svg", assets: ["./public/games/extra/icons/kakuro.svg"], rules: ["每段填入和为提示数。", "同段数字不可重复，仅 1-9。", "全部填对即过关。", "难度决定棋盘与给定数。"] },
    () => import("./kakuro/game.js").then((m) => m.mountKakuro)
  ),
  defineLocalGame(
    { id: "mancala", title: "播棋", subtitle: "撒子入仓，捕子取胜", tag: "播棋", category: "strategy", secondaryCategories: ["classic"], complexity: "中等", difficultySupport: ["easy", "medium", "hard", "devil"], progressType: "match", ...gamePluginMeta("mancala", "board", { sessionSave: true }), ...gameVisualStyle("guofengBoard"), accent: "jade", icon: "./public/games/extra/icons/mancala.svg", assets: ["./public/games/extra/icons/mancala.svg"], rules: ["点自己一坑撒子，落仓加一手。", "最后一子落空坑可捕对面。", "一方清空后结算多子者胜。", "可重开，支持续玩。"] },
    () => import("./mancala/game.js").then((m) => m.mountMancala)
  ),
  defineLocalGame(
    { id: "hex", title: "六贯棋", subtitle: "连通两边即胜", tag: "六贯棋", category: "strategy", secondaryCategories: ["classic"], complexity: "困难", difficultySupport: ["easy", "medium", "hard", "devil"], progressType: "match", ...gamePluginMeta("hex", "board", { sessionSave: true }), ...gameVisualStyle("guofengBoard"), accent: "cinnabar", icon: "./public/games/extra/icons/hex.svg", assets: ["./public/games/extra/icons/hex.svg"], rules: ["落子连成一线接通对侧两边获胜。", "六边棋盘必有一方胜出。", "可人机或本地双人。", "可重开，支持续玩。"] },
    () => import("./hex/game.js").then((m) => m.mountHex)
  ),
  defineLocalGame(
    { id: "nine-mens-morris", title: "九子棋", subtitle: "成三吃子，逼死对手", tag: "九子棋", category: "classic", secondaryCategories: ["strategy"], complexity: "中等", difficultySupport: ["easy", "medium", "hard", "devil"], progressType: "match", ...gamePluginMeta("nine-mens-morris", "board", { sessionSave: true }), ...gameVisualStyle("guofengBoard"), accent: "ink", icon: "./public/games/extra/icons/nine-mens-morris.svg", assets: ["./public/games/extra/icons/nine-mens-morris.svg"], rules: ["先放子再走子，连成三子吃对方一子。", "对方少于三子或无路可走即负。", "三子时可飞行任意点。", "可重开，支持续玩。"] },
    () => import("./nine-mens-morris/game.js").then((m) => m.mountNineMens)
  ),
  defineLocalGame(
    { id: "ataxx", title: "同化棋", subtitle: "克隆扩张，翻满全盘", tag: "同化棋", category: "strategy", secondaryCategories: ["quick"], complexity: "中等", difficultySupport: ["easy", "medium", "hard", "devil"], progressType: "match", ...gamePluginMeta("ataxx", "board", { sessionSave: true }), ...gameVisualStyle("guofengBoard"), accent: "sky", icon: "./public/games/extra/icons/ataxx.svg", assets: ["./public/games/extra/icons/ataxx.svg"], rules: ["近格克隆、隔格跳，落子翻转相邻敌子。", "棋盘填满多子者胜。", "可人机或本地双人。", "可重开，支持续玩。"] },
    () => import("./ataxx/game.js").then((m) => m.mountAtaxx)
  ),
  defineLocalGame(
    { id: "word-search", title: "成语找词", subtitle: "划线找出隐藏成语", tag: "成语找词", category: "number", secondaryCategories: ["puzzle", "quick"], complexity: "简单", modeSupport: ["solo"], difficultySupport: ["easy", "medium", "hard", "devil"], progressType: "score", ...gamePluginMeta("word-search", "puzzle"), ...gameVisualStyle("classicPuzzle"), accent: "lotus", icon: "./public/games/extra/icons/word-search.svg", assets: ["./public/games/extra/icons/word-search.svg"], rules: ["拖动连成直线选出成语。", "横竖斜均可，找全过关。", "难度决定字阵大小与词数。", "可重开换一局。"] },
    () => import("./word-search/game.js").then((m) => m.mountWordSearch)
  )
];

const registry = createGameRegistry(registrations);

export const games = registry.games;
export const pluginCatalog = registry.manifests;
export const precacheAssets = registry.precacheAssets;

export function findCategory(id) {
  return categories.find((category) => category.id === id) || categories[0];
}

export function findGame(id) {
  return registry.find(id);
}

export function gameMatchesCategory(game, categoryId) {
  if (categoryId === "all") return true;
  return game.category === categoryId || game.secondaryCategories.includes(categoryId);
}

export function getGameSections(categoryId = "all") {
  const visibleGames = games.filter((game) => gameMatchesCategory(game, categoryId));
  const groups = categoryId === "all" ? categories.filter((category) => category.id !== "all") : [findCategory(categoryId)];

  return groups
    .map((category) => ({
      ...category,
      games: visibleGames.filter((game) => {
        if (categoryId === "all") return game.category === category.id;
        return game.category === category.id || game.secondaryCategories.includes(category.id);
      })
    }))
    .filter((section) => section.games.length > 0);
}

export async function loadGamePlugin(id) {
  return registry.load(id);
}
