export const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
  expert: "专家",
  devil: "魔鬼"
};

export const modeLabel = {
  ai: "单人对弈",
  local: "本地双人",
  solo: "单人挑战"
};

export const capabilityLabel = {
  offline: "离线",
  fullscreen: "全屏",
  sessionSave: "续玩",
  touchControls: "触控",
  keyboardControls: "键盘",
  staged: "闯关",
  boss: "Boss"
};

export function outcomeLabel(outcome) {
  const labels = {
    win: "胜利",
    loss: "失利",
    draw: "平局",
    complete: "完成",
    score: "结算"
  };
  return labels[outcome] || "完成";
}
