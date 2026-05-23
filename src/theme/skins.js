export const interfaceThemes = {
  guofeng: {
    id: "guofeng",
    name: "国风界面",
    status: "ready",
    summary: "米纸、竹木、玉色与朱砂点缀，负责大厅、弹窗和通用控件。"
  },
  "ink-dark": {
    id: "ink-dark",
    name: "水墨夜",
    status: "ready",
    summary: "深靛底配玉色与暖金提示，适合夜间和长时间游玩。"
  }
};

export const themeOrder = ["guofeng", "ink-dark"];

// Backward compatibility for older imports and saved preferences.
export const skins = interfaceThemes;
export const skinOrder = themeOrder;
