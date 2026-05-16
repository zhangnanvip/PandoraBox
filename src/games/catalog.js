import { defineLocalGame, loadGamePlugin as loadRegisteredGamePlugin } from "../platform/game-plugin.js";

export const categories = [
  { id: "all", title: "全部", shortTitle: "全部" },
  { id: "classic", title: "经典棋局", shortTitle: "棋局" },
  { id: "race", title: "跳跃竞速", shortTitle: "竞速" },
  { id: "puzzle", title: "益智解谜", shortTitle: "解谜" },
  { id: "number", title: "数字休闲", shortTitle: "数字" },
  { id: "quick", title: "快速对弈", shortTitle: "快局" }
];

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
      accent: "ink",
      icon: "./public/skins/guofeng-ink/icons/gomoku.svg",
      rules: [
        "黑方先手，双方轮流在空交点落子。",
        "横、竖、斜任一方向先形成连续五子即获胜。",
        "单人模式下你执黑，AI 执白；魔鬼难度会识别双活三、冲四和多层反击。"
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
      accent: "jade",
      icon: "./public/skins/guofeng-ink/icons/go.svg",
      rules: [
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
      accent: "lotus",
      icon: "./public/skins/guofeng-ink/icons/sudoku.svg",
      rules: [
        "在 9x9 棋盘中填入 1-9。",
        "每一行、每一列、每一个 3x3 宫内数字都不能重复。",
        "可使用提示与检查，错误会被高亮。",
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
      accent: "cinnabar",
      icon: "./public/skins/guofeng-ink/icons/klotski.svg",
      rules: [
        "点击棋子选中，再使用方向按钮移动。",
        "棋子不能重叠，也不能移出棋盘。",
        "把曹操移动到下方出口即完成关卡。",
        "难度对应不同关卡布局，魔鬼难度使用更接近经典横刀立马的堵塞布局。"
      ]
    },
    () => import("./klotski/game.js").then((module) => module.mountKlotski)
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
      accent: "sky",
      icon: "./public/skins/guofeng-ink/icons/2048.svg",
      rules: [
        "上下左右滑动棋盘，相同数字会合并。",
        "每次有效移动后会出现新的 2 或 4。",
        "达到目标数字后可继续挑战最高分。"
      ]
    },
    () => import("./number-2048/game.js").then((module) => module.mount2048)
  )
];

const gameMap = new Map(registrations.map((registration) => [registration.manifest.id, registration]));

export const games = registrations.map((registration) => registration.manifest);

export function findCategory(id) {
  return categories.find((category) => category.id === id) || categories[0];
}

export function findGame(id) {
  return games.find((game) => game.id === id) || games[0];
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
  const registration = gameMap.get(id) || gameMap.get(games[0].id);
  return loadRegisteredGamePlugin(registration);
}
