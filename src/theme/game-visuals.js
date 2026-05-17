export const gameVisualStyles = {
  guofengBoard: {
    value: "guofeng-board",
    label: "国风棋盘",
    styleSheets: ["./src/styles/game-skins/guofeng-board.css"]
  },
  classicPuzzle: {
    value: "classic-puzzle",
    label: "经典解谜",
    styleSheets: ["./src/styles/game-skins/classic-puzzle.css"]
  },
  classicNumber: {
    value: "classic-number",
    label: "经典数字",
    styleSheets: ["./src/styles/game-skins/classic-number.css"]
  },
  classicArcade: {
    value: "classic-arcade",
    label: "经典街机",
    styleSheets: ["./src/styles/game-skins/classic-arcade.css"]
  }
};

export function visualStyleDefinition(key) {
  return gameVisualStyles[key] || gameVisualStyles.guofengBoard;
}
