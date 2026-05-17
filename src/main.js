import { categories, games, pluginCatalog, precacheAssets, findCategory, findGame, loadGamePlugin as loadCatalogGamePlugin } from "./games/catalog.js";
import { loadGamePlugin as loadRegisteredGamePlugin } from "./platform/game-plugin.js";
import { DEFAULT_PLUGIN_SOURCE_STATE, collectEnabledPluginRegistrations, loadPluginSourceState, summarizePluginSources } from "./platform/plugin-sources.js";
import { configureSound, playResultSound, playSound as playFeedbackSound } from "./platform/sound.js";
import { interfaceThemes, themeOrder } from "./theme/skins.js";
import { loadState, saveState } from "./utils/storage.js";

const app = document.querySelector("#app");

const preferences = loadState("preferences", {
  difficulty: "medium",
  mode: "ai",
  theme: "guofeng",
  sound: true,
  volume: 70,
  gameOptions: {},
  pluginSourceOverrides: {}
});
const savedProgress = loadState("progress", {});
const savedSessions = loadState("sessions", {});
const savedFavorites = loadState("favorites", []);
const preferredTheme = preferences.theme || preferences.skin || "guofeng";

const state = {
  currentGame: "",
  difficulty: preferences.difficulty || "medium",
  mode: preferences.mode || "ai",
  gameOptions: preferences.gameOptions && typeof preferences.gameOptions === "object" ? preferences.gameOptions : {},
  theme: interfaceThemes[preferredTheme] ? preferredTheme : "guofeng",
  sound: preferences.sound !== false,
  volume: Number.isFinite(preferences.volume) ? preferences.volume : 70,
  modal: "",
  pendingGame: "",
  pendingPluginSource: "",
  activeCategory: "all",
  progress: savedProgress && typeof savedProgress === "object" ? savedProgress : {},
  sessions: savedSessions && typeof savedSessions === "object" ? savedSessions : {},
  favorites: Array.isArray(savedFavorites) ? savedFavorites.filter(Boolean) : [],
  pluginSources: DEFAULT_PLUGIN_SOURCE_STATE,
  pluginSourceOverrides: preferences.pluginSourceOverrides && typeof preferences.pluginSourceOverrides === "object" ? preferences.pluginSourceOverrides : {},
  resultSummary: null,
  resumeSession: false
};

let cleanupGame = null;
let gameLoadToken = 0;
let installPrompt = null;

function externalGameRegistrations() {
  const seen = new Set(games.map((game) => game.id));
  return collectEnabledPluginRegistrations(state.pluginSources).filter((registration) => {
    const id = registration?.manifest?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function availableGames() {
  return [
    ...games,
    ...externalGameRegistrations().map((registration) => registration.manifest)
  ];
}

function availablePluginCatalog() {
  return [
    ...pluginCatalog,
    ...externalGameRegistrations().map((registration) => registration.manifest)
  ];
}

function findAvailableGame(id) {
  return availableGames().find((game) => game.id === id) || findGame(id);
}

function gameMatchesCategory(game, categoryId) {
  if (categoryId === "all") return true;
  return game.category === categoryId || (game.secondaryCategories || []).includes(categoryId);
}

function availableGameSections(categoryId = "all") {
  const allGames = availableGames();
  const visibleGames = allGames.filter((game) => gameMatchesCategory(game, categoryId));
  const groups = categoryId === "all" ? categories.filter((category) => category.id !== "all") : [findCategory(categoryId)];

  return groups
    .map((category) => ({
      ...category,
      games: visibleGames.filter((game) => {
        if (categoryId === "all") return game.category === category.id;
        return gameMatchesCategory(game, category.id);
      })
    }))
    .filter((section) => section.games.length > 0);
}

function loadAvailableGamePlugin(id) {
  const externalRegistration = externalGameRegistrations().find((registration) => registration.manifest.id === id);
  return externalRegistration ? loadRegisteredGamePlugin(externalRegistration) : loadCatalogGamePlugin(id);
}

const difficultyLabel = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
  expert: "专家",
  devil: "魔鬼"
};

const modeLabel = {
  ai: "单人对弈",
  local: "本地双人",
  solo: "单人挑战"
};

const ACHIEVEMENTS = [
  {
    id: "first_play",
    title: "开盒第一局",
    desc: "开始任意一局游戏",
    unlocked: (stats) => stats.started >= 1
  },
  {
    id: "first_finish",
    title: "首个结算",
    desc: "完成任意一局游戏",
    unlocked: (stats) => stats.completed >= 1
  },
  {
    id: "first_win",
    title: "旗开得胜",
    desc: "赢下一局对局或挑战",
    unlocked: (stats) => stats.wins >= 1
  },
  {
    id: "arcade_ready",
    title: "街机上手",
    desc: "游玩任意动作街机游戏",
    unlocked: (stats) => stats.arcadeStarted >= 1
  },
  {
    id: "collector",
    title: "收纳师",
    desc: "收藏 3 款游戏",
    unlocked: (stats) => stats.favorites >= 3
  },
  {
    id: "explorer",
    title: "多面手",
    desc: "游玩 5 款不同游戏",
    unlocked: (stats) => stats.distinctStarted >= 5
  }
];

function syncSoundPreferences() {
  configureSound({ enabled: state.sound, volume: state.volume });
}

function persistPreferences() {
  saveState("preferences", {
    difficulty: state.difficulty,
    mode: state.mode,
    theme: state.theme,
    skin: state.theme,
    sound: state.sound,
    volume: state.volume,
    gameOptions: state.gameOptions,
    pluginSourceOverrides: state.pluginSourceOverrides
  });
  syncSoundPreferences();
}

syncSoundPreferences();

function persistProgress() {
  saveState("progress", state.progress);
}

function persistSessions() {
  saveState("sessions", state.sessions);
}

function persistFavorites() {
  saveState("favorites", state.favorites);
}

function setState(patch) {
  Object.assign(state, patch);
  persistPreferences();
  render();
}

function openModal(name, patch = {}) {
  Object.assign(state, patch);
  state.modal = name;
  render();
}

function closeModal() {
  state.modal = "";
  state.pendingGame = "";
  state.pendingPluginSource = "";
  state.resultSummary = null;
  render();
}

async function refreshPluginSources() {
  state.pluginSources = await loadPluginSourceState({
    sourceOverrides: state.pluginSourceOverrides
  });
  if (state.currentGame && !availableGames().some((game) => game.id === state.currentGame)) {
    state.currentGame = "";
  }
  render();
}

function setPluginSourceEnabled(sourceId, enabled) {
  state.pluginSourceOverrides = {
    ...state.pluginSourceOverrides,
    [sourceId]: { enabled }
  };
  state.pendingPluginSource = sourceId;
  state.modal = "plugin-source";
  persistPreferences();
  refreshPluginSources();
}

function collectSetupValuesFromModal(game) {
  const values = {};
  app.querySelectorAll("[data-modal-option]").forEach((field) => {
    const id = field.dataset.modalOption;
    if (id) values[id] = field.value;
  });
  const visualStyle = app.querySelector("[data-modal-visual-style]")?.value;
  if (visualStyle) values.visualStyle = visualStyle;
  return {
    ...selectedGameOptions(game),
    ...values
  };
}

function stableStringify(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function sessionOptionsFor(options = {}) {
  const { visualStyle, ...gameplayOptions } = options;
  return gameplayOptions;
}

function sessionKeyFor(game, options = selectedGameOptions(game)) {
  return `${game.id}:${stableStringify(sessionOptionsFor(options))}`;
}

function sessionFor(game, options = selectedGameOptions(game)) {
  return state.sessions[sessionKeyFor(game, options)] || null;
}

function saveGameSession(game, options, snapshot, meta = {}) {
  if (!snapshot || typeof snapshot !== "object") return;
  const key = sessionKeyFor(game, options);
  state.sessions = {
    ...state.sessions,
    [key]: {
      gameId: game.id,
      options: sessionOptionsFor(options),
      snapshot,
      meta,
      updatedAt: new Date().toISOString()
    }
  };
  persistSessions();
}

function clearGameSession(game, options = selectedGameOptions(game)) {
  const key = sessionKeyFor(game, options);
  if (!state.sessions[key]) return;
  const { [key]: _removed, ...rest } = state.sessions;
  state.sessions = rest;
  persistSessions();
}

function sessionSummary(session) {
  if (!session) return "";
  const meta = session.meta || {};
  return [
    meta.level ? `关卡 ${meta.level}` : "",
    Number.isFinite(meta.score) ? `分数 ${meta.score}` : "",
    session.updatedAt ? `保存 ${formatTime(session.updatedAt)}` : ""
  ].filter(Boolean).join(" · ");
}

function isFavorite(gameId) {
  return state.favorites.includes(gameId);
}

function toggleFavorite(gameId) {
  const next = isFavorite(gameId)
    ? state.favorites.filter((id) => id !== gameId)
    : [...state.favorites, gameId];
  state.favorites = next;
  persistFavorites();
  render();
}

function sessionsList() {
  return Object.entries(state.sessions)
    .map(([key, session]) => ({ key, session, game: availableGames().find((item) => item.id === session.gameId) }))
    .filter((item) => item.game)
    .sort((a, b) => new Date(b.session.updatedAt || 0) - new Date(a.session.updatedAt || 0));
}

function recentGames(limit = 4) {
  return availableGames()
    .map((game) => ({ game, progress: progressFor(game.id) }))
    .filter((item) => item.progress.lastPlayed)
    .sort((a, b) => new Date(b.progress.lastPlayed) - new Date(a.progress.lastPlayed))
    .slice(0, limit);
}

function totalStats() {
  const progressItems = Object.values(state.progress);
  const allGames = availableGames();
  const started = progressItems.reduce((sum, item) => sum + (item.started || 0), 0);
  const completed = progressItems.reduce((sum, item) => sum + (item.completed || 0), 0);
  const wins = progressItems.reduce((sum, item) => sum + (item.wins || 0), 0);
  const bestScore = progressItems.reduce((best, item) => Math.max(best, item.bestScore || 0), 0);
  const distinctStarted = allGames.filter((game) => progressFor(game.id).started > 0).length;
  const arcadeStarted = allGames.filter((game) => game.category === "arcade" && progressFor(game.id).started > 0).length;
  return {
    started,
    completed,
    wins,
    bestScore,
    distinctStarted,
    arcadeStarted,
    favorites: state.favorites.length,
    sessions: sessionsList().length
  };
}

function achievementStates() {
  const stats = totalStats();
  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlocked: achievement.unlocked(stats)
  }));
}

function unlockedAchievementCount() {
  return achievementStates().filter((achievement) => achievement.unlocked).length;
}

function launchGame(game, options, resume = false) {
  const mode = supportedValue(options.mode || state.mode, game.modeSupport || ["ai", "local"], "local");
  const difficulty = supportedValue(options.difficulty || state.difficulty, game.difficultySupport || ["easy", "medium", "hard"], "medium");
  state.gameOptions = {
    ...state.gameOptions,
    [game.id]: options
  };
  if (!resume) {
    clearGameSession(game, options);
    recordGameStart(game, mode, difficulty);
  }
  playFeedbackSound("start");
  setState({
    currentGame: game.id,
    mode,
    difficulty,
    modal: "",
    pendingGame: "",
    resumeSession: resume
  });
}

function startPendingGame(optionsOverride = null, resume = false) {
  if (!state.pendingGame) return;
  const game = findAvailableGame(state.pendingGame);
  const options = optionsOverride || selectedGameOptions(game);
  launchGame(game, options, resume);
}

function resumeSessionByKey(key) {
  const session = state.sessions[key];
  if (!session) return;
  const game = availableGames().find((item) => item.id === session.gameId);
  if (!game) return;
  const options = {
    ...selectedGameOptions(game),
    ...(session.options || {})
  };
  launchGame(game, options, true);
}

function icon(name) {
  const paths = {
    settings: '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.16 2.16 0 0 1-3.06 3.06l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.64V21.4a2.16 2.16 0 0 1-4.32 0v-.08a1.8 1.8 0 0 0-1.08-1.64 1.8 1.8 0 0 0-1.98.36l-.04.04a2.16 2.16 0 0 1-3.06-3.06l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.08H2.88a2.16 2.16 0 0 1 0-4.32h.08A1.8 1.8 0 0 0 4.6 8.52a1.8 1.8 0 0 0-.36-1.98l-.04-.04A2.16 2.16 0 0 1 7.26 3.44l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.36 2.2V2.12a2.16 2.16 0 0 1 4.32 0v.08a1.8 1.8 0 0 0 1.08 1.64 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.16 2.16 0 0 1 3.06 3.06l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.64 1.08h.08a2.16 2.16 0 0 1 0 4.32h-.08A1.8 1.8 0 0 0 19.4 15Z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    rules: '<path d="M6 4.5h9.2a2.8 2.8 0 0 1 2.8 2.8v12.2H8.8A2.8 2.8 0 0 1 6 16.7V4.5Z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M8 5v14l11-7L8 5Z"/>',
    pause: '<path d="M7 5h3v14H7V5Z"/><path d="M14 5h3v14h-3V5Z"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/>',
    offline: '<path d="M6 19h12a4 4 0 0 0 .6-7.96A6.5 6.5 0 0 0 6 9.2 4.9 4.9 0 0 0 6 19Z"/><path d="m9 14 2.2 2.2L16 11"/>'
  };
  return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function option(value, label, selected) {
  return `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;");
}

function supportedValue(current, supported, fallback) {
  return supported.includes(current) ? current : supported[0] || fallback;
}

function selectedModeFor(game) {
  return supportedValue(state.gameOptions[game.id]?.mode || state.mode, game.modeSupport || ["ai", "local"], "local");
}

function selectedDifficultyFor(game) {
  return supportedValue(state.gameOptions[game.id]?.difficulty || state.difficulty, game.difficultySupport || ["easy", "medium", "hard"], "medium");
}

function selectedSetupValue(game, field) {
  const stored = state.gameOptions[game.id]?.[field.id];
  const supported = field.options.map((item) => item.value);
  return supportedValue(stored || field.defaultValue, supported, supported[0]);
}

function selectedVisualStyleFor(game) {
  const styles = game.visualStyles || [];
  if (!styles.length) return "";
  const supported = styles.map((item) => item.value);
  return supportedValue(state.gameOptions[game.id]?.visualStyle || game.defaultVisualStyle, supported, supported[0]);
}

function visualStyleLabelFor(game) {
  const value = selectedVisualStyleFor(game);
  return (game.visualStyles || []).find((style) => style.value === value)?.label || "";
}

function updateGameOption(game, patch) {
  state.gameOptions = {
    ...state.gameOptions,
    [game.id]: { ...(state.gameOptions[game.id] || {}), ...patch }
  };
  if (patch.mode) state.mode = patch.mode;
  if (patch.difficulty) state.difficulty = patch.difficulty;
  persistPreferences();
  render();
}

function renderSetupFields(game) {
  return (game.setupFields || []).map((field) => renderSelectField({
    label: field.label,
    attr: `data-modal-option="${field.id}"`,
    value: selectedSetupValue(game, field),
    options: field.options
  })).join("");
}

function renderVisualStyleField(game) {
  const styles = game.visualStyles || [];
  if (!styles.length) return "";
  return renderSelectField({
    label: "游戏样式",
    attr: "data-modal-visual-style",
    value: selectedVisualStyleFor(game),
    options: styles
  });
}

function renderStartActions(game) {
  const session = sessionFor(game);
  if (!session) {
    return `<button class="primary-button wide-button" data-start-game>${icon("play")} 开始</button>`;
  }

  return `
    <div class="resume-card">
      <div>
        <span class="modal-label">未完成进度</span>
        <strong>${sessionSummary(session) || "已有可继续的进度"}</strong>
      </div>
      <button class="primary-button" data-resume-start>${icon("play")} 继续</button>
      <button class="secondary-button" data-start-game>新开一局</button>
    </div>
  `;
}

function progressFor(gameId) {
  return state.progress[gameId] || {
    started: 0,
    completed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    bestScore: 0,
    lastPlayed: "",
    lastResult: ""
  };
}

function saveProgressFor(gameId, progress) {
  state.progress = { ...state.progress, [gameId]: progress };
  persistProgress();
}

function recordGameStart(game, mode, difficulty) {
  const progress = progressFor(game.id);
  saveProgressFor(game.id, {
    ...progress,
    started: progress.started + 1,
    lastPlayed: new Date().toISOString(),
    lastMode: mode,
    lastDifficulty: difficulty
  });
}

function selectedGameOptions(game) {
  const setupOptions = Object.fromEntries((game.setupFields || []).map((field) => [field.id, selectedSetupValue(game, field)]));
  const visualStyle = selectedVisualStyleFor(game);
  return {
    ...(state.gameOptions[game.id] || {}),
    ...setupOptions,
    ...(visualStyle ? { visualStyle } : {}),
    mode: selectedModeFor(game),
    difficulty: selectedDifficultyFor(game)
  };
}

function outcomeLabel(outcome) {
  const labels = {
    win: "胜利",
    loss: "失利",
    draw: "平局",
    complete: "完成",
    score: "结算"
  };
  return labels[outcome] || "完成";
}

function formatTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function progressSummary(game) {
  const progress = progressFor(game.id);
  const decided = progress.wins + progress.losses + progress.draws;
  return {
    ...progress,
    winRate: decided ? Math.round((progress.wins / decided) * 100) : 0
  };
}

function renderProgressPills(game, compact = false) {
  const progress = progressSummary(game);
  if (!progress.started && compact) return "";
  const items = compact
    ? [`已玩 ${progress.started}`, progress.completed ? `完成 ${progress.completed}` : ""].filter(Boolean)
    : [
      `开局 ${progress.started}`,
      `完成 ${progress.completed}`,
      `胜 ${progress.wins}`,
      `负 ${progress.losses}`,
      `平 ${progress.draws}`,
      progress.bestScore ? `最高 ${progress.bestScore}` : "",
      `最近 ${formatTime(progress.lastPlayed)}`
    ].filter(Boolean);
  return `
    <div class="progress-pills">
      ${items.map((item) => `<span>${item}</span>`).join("")}
    </div>
  `;
}

function normalizeResult(game, result = {}) {
  const outcome = result.outcome || "complete";
  const score = Number.isFinite(result.score) ? result.score : 0;
  const progress = progressFor(game.id);
  const next = {
    ...progress,
    completed: progress.completed + 1,
    wins: progress.wins + Number(outcome === "win"),
    losses: progress.losses + Number(outcome === "loss"),
    draws: progress.draws + Number(outcome === "draw"),
    bestScore: Math.max(progress.bestScore || 0, score || 0),
    lastPlayed: new Date().toISOString(),
    lastResult: outcome
  };
  saveProgressFor(game.id, next);
  return {
    gameTitle: game.title,
    outcome,
    score,
    detail: result.detail || result.message || "",
    extra: result.extra || "",
    moves: result.moves,
    progress: next
  };
}

function handleGameResult(game, result) {
  state.resultSummary = normalizeResult(game, result);
  state.modal = "result";
  playResultSound(state.resultSummary.outcome);
  renderModal();
}

function renderSelectField({ label, attr, value, options }) {
  if (!options.length) return "";
  if (options.length === 1) {
    return `
      <div class="modal-field readonly-field">
        <span>${label}</span>
        <b>${options[0].label}</b>
      </div>
    `;
  }

  return `
    <label class="modal-field">
      <span>${label}</span>
      <select ${attr}>
        ${options.map((item) => option(item.value, item.label, value)).join("")}
      </select>
    </label>
  `;
}

function renderModeField(game) {
  const modes = (game.modeSupport || []).map((value) => ({ value, label: modeLabel[value] || value }));
  return renderSelectField({
    label: "对局模式",
    attr: "data-modal-mode",
    value: selectedModeFor(game),
    options: modes
  });
}

function renderDifficultyField(game) {
  const difficulties = (game.difficultySupport || []).map((value) => ({ value, label: difficultyLabel[value] || value }));
  return renderSelectField({
    label: "难度",
    attr: "data-modal-difficulty",
    value: selectedDifficultyFor(game),
    options: difficulties
  });
}

function renderThemeTabs() {
  return themeOrder.map((id) => {
    const theme = interfaceThemes[id];
    const active = state.theme === id;
    const disabled = theme.status !== "ready";
    return `
      <button class="skin-tab ${active ? "is-active" : ""}" data-theme="${id}" ${disabled ? "disabled" : ""}>
        <span>${theme.name}</span>
        ${disabled ? "<small>预留</small>" : "<small>当前</small>"}
      </button>
    `;
  }).join("");
}

function boardPreview(game) {
  if (game.icon) {
    return `
      <div class="game-art accent-${game.accent}">
        <img src="${game.icon}" alt="" loading="lazy" />
      </div>
    `;
  }

  if (game.id === "gomoku") {
    return `
      <div class="preview-board preview-grid">
        ${Array.from({ length: 25 }, (_, index) => {
          const stone = [6, 12, 18].includes(index) ? "black" : [7, 13].includes(index) ? "white" : "";
          return `<span class="${stone ? `preview-stone ${stone}` : ""}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "go") {
    return `
      <div class="preview-board preview-grid go-preview">
        ${Array.from({ length: 25 }, (_, index) => {
          const stone = [8, 11, 16].includes(index) ? "black" : [7, 12, 17].includes(index) ? "white" : "";
          return `<span class="${stone ? `preview-stone ${stone}` : ""}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "xiangqi") {
    return `
      <div class="preview-xiangqi" aria-hidden="true">
        <b>車</b><b>馬</b><b>相</b><b>帥</b><b>炮</b>
      </div>
    `;
  }

  if (game.id === "checkers") {
    return `
      <div class="preview-checkers" aria-hidden="true">
        ${["#c64234", "#e4a72f", "#1f8d67", "#3277b7", "#7a5bb7", "#d65f8d"].map((color) =>
          `<span style="background:${color}"></span>`
        ).join("")}
      </div>
    `;
  }

  if (game.id === "reversi") {
    return `
      <div class="preview-board preview-grid reversi-preview" aria-hidden="true">
        ${Array.from({ length: 25 }, (_, index) => {
          const stone = [7, 13].includes(index) ? "black" : [11, 17].includes(index) ? "white" : "";
          return `<span class="${stone ? `preview-stone ${stone}` : ""}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "draughts") {
    return `
      <div class="preview-draughts" aria-hidden="true">
        ${Array.from({ length: 16 }, (_, index) => {
          const row = Math.floor(index / 4);
          const piece = row < 2 ? "black" : row > 1 ? "red" : "";
          return `<span class="${piece}"></span>`;
        }).join("")}
      </div>
    `;
  }

  if (game.id === "sudoku") {
    return `
      <div class="preview-sudoku" aria-hidden="true">
        ${["5", "", "4", "", "7", "", "9", "", "2"].map((value) => `<span>${value}</span>`).join("")}
      </div>
    `;
  }

  if (game.id === "klotski") {
    return `
      <div class="preview-klotski" aria-hidden="true">
        <span class="cao">曹</span><span>将</span><span>关</span><span>卒</span>
      </div>
    `;
  }

  if (game.id === "2048") {
    return `
      <div class="preview-2048" aria-hidden="true">
        <span>2</span><span>4</span><span>8</span><span>16</span>
      </div>
    `;
  }

  if (game.id === "tictactoe") {
    return `
      <div class="preview-tictactoe" aria-hidden="true">
        ${["X", "", "O", "", "X", "", "O", "", "X"].map((value) => `<span>${value}</span>`).join("")}
      </div>
    `;
  }

  return `
    <div class="preview-flying" aria-hidden="true">
      <span>1</span><span>2</span><span>3</span><span>4</span>
    </div>
  `;
}

function renderCategoryTabs() {
  return categories.map((category) => `
    <button
      class="category-tab ${state.activeCategory === category.id ? "is-active" : ""}"
      data-category="${category.id}"
      aria-pressed="${state.activeCategory === category.id ? "true" : "false"}"
    >
      <span>${category.title}</span>
    </button>
  `).join("");
}

function renderSessionShortcut({ key, session, game }) {
  return `
    <article class="shortcut-card accent-${game.accent}">
      <div>
        <span class="game-tag">继续游戏</span>
        <h3>${game.title}</h3>
        <p>${sessionSummary(session) || "已有未完成进度"}</p>
      </div>
      <button class="primary-button" data-resume-session="${escapeAttr(key)}">${icon("play")} 继续</button>
    </article>
  `;
}

function renderRecentShortcut({ game, progress }) {
  return `
    <button class="recent-chip" data-prepare-game="${game.id}">
      <span>${game.title}</span>
      <small>${formatTime(progress.lastPlayed)}</small>
    </button>
  `;
}

function renderFavoriteShortcut(gameId) {
  const game = availableGames().find((item) => item.id === gameId);
  if (!game) return "";
  return `
    <button class="recent-chip favorite-chip" data-prepare-game="${game.id}">
      <span>${game.title}</span>
      <small>${findCategory(game.category).shortTitle}</small>
    </button>
  `;
}

function renderAchievementSummary() {
  const achievements = achievementStates();
  const unlocked = achievements.filter((achievement) => achievement.unlocked);
  const next = achievements.find((achievement) => !achievement.unlocked);
  return `
    <div class="achievement-summary">
      <strong>${unlocked.length}/${achievements.length}</strong>
      <span>${next ? `下个目标：${next.title}` : "全部基础成就已解锁"}</span>
    </div>
  `;
}

function renderAchievementList() {
  return `
    <div class="achievement-list">
      ${achievementStates().map((achievement) => `
        <div class="achievement-row ${achievement.unlocked ? "is-unlocked" : ""}">
          <div>
            <strong>${achievement.title}</strong>
            <span>${achievement.desc}</span>
          </div>
          <b>${achievement.unlocked ? "已解锁" : "未达成"}</b>
        </div>
      `).join("")}
    </div>
  `;
}

function pluginSourceById(sourceId) {
  const sources = state.pluginSources.sources || DEFAULT_PLUGIN_SOURCE_STATE.sources;
  return sources.find((source) => source.id === sourceId) || null;
}

function renderPluginSourceGameList(source) {
  const gamesPreview = source?.catalog?.gamePreviews || [];
  if (!gamesPreview.length) return "<p class=\"empty-note\">这个扩展目录暂时没有可展示的游戏。</p>";

  return `
    <div class="achievement-list">
      ${gamesPreview.map((game) => `
        <div class="achievement-row">
          <div>
            <strong>${game.title}</strong>
            <span>${game.subtitle || `${game.id} · ${game.version}`}</span>
          </div>
          <b>${game.status}</b>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPluginSourceAudit(source) {
  if (!source) {
    return `
      <div class="source-audit-panel">
        <p>这个插件源已经不存在，可能是配置被更新了。</p>
        <div class="settings-actions">
          <button class="primary-button" data-open-modal="settings">返回设置</button>
        </div>
      </div>
    `;
  }

  const catalog = source.catalog || {};
  const canToggle = source.type === "url" && catalog.loaded && !catalog.error;
  const status = source.enabled ? "已启用" : "未启用";
  const action = source.enabled
    ? `<button class="danger-button" data-disable-plugin-source="${escapeAttr(source.id)}">停用扩展包</button>`
    : `<button class="primary-button" data-enable-plugin-source="${escapeAttr(source.id)}" ${canToggle ? "" : "disabled"}>确认启用</button>`;

  return `
    <div class="source-audit-panel">
      <p>启用后，这个目录内通过 Manifest 校验的游戏会加入大厅，并作为独立插件模块加载。远程源仍受应用的远程加载策略限制。</p>
      <div class="progress-pills">
        <span>${status}</span>
        <span>${source.trust}</span>
        <span>可发现 ${catalog.games || 0}</span>
        <span>可接入 ${catalog.loadableGames || 0}</span>
        ${source.enabledByUser ? "<span>本机启用</span>" : ""}
      </div>
      <div class="source-audit-meta">
        <strong>${source.name}</strong>
        <span>${source.url || "内置游戏包"}</span>
        ${catalog.title ? `<span>${catalog.title}</span>` : ""}
        ${catalog.description ? `<span>${catalog.description}</span>` : ""}
        ${catalog.error ? `<span>${catalog.error}</span>` : ""}
        ${catalog.blocked ? `<span>${catalog.blocked}</span>` : ""}
      </div>
      ${renderPluginSourceGameList(source)}
      ${catalog.loadErrors?.length ? `
        <ul class="modal-list">
          ${catalog.loadErrors.map((error, index) => `<li><b>${index + 1}</b><span>${error}</span></li>`).join("")}
        </ul>
      ` : ""}
      <div class="settings-actions">
        <button class="secondary-button" data-open-modal="settings">返回设置</button>
        ${action}
      </div>
    </div>
  `;
}

function renderPluginSourceList() {
  const summary = summarizePluginSources(state.pluginSources);
  const sources = state.pluginSources.sources || DEFAULT_PLUGIN_SOURCE_STATE.sources;
  return `
    <div class="plugin-source-list">
      ${sources.map((source) => `
        <div class="plugin-source-row ${source.enabled ? "is-enabled" : ""}">
          <div>
            <strong>${source.name}</strong>
            <span>
              ${source.type === "builtin" ? "随应用离线打包" : source.url || "扩展源预留"}
              ${source.catalog?.loaded ? ` · 可发现 ${source.catalog.games} 个游戏` : ""}
              ${source.catalog?.loadableGames ? ` · 已接入 ${source.catalog.loadableGames} 个游戏` : ""}
              ${source.catalog?.blocked ? ` · ${source.catalog.blocked}` : ""}
              ${source.catalog?.loadErrors?.length ? ` · ${source.catalog.loadErrors.length} 个 Manifest 异常` : ""}
              ${source.catalog?.error ? ` · ${source.catalog.error}` : ""}
            </span>
          </div>
          <div class="plugin-source-actions">
            <b>${source.enabled ? "启用" : "禁用"}</b>
            ${source.type === "url" ? `<button class="secondary-button" data-review-plugin-source="${escapeAttr(source.id)}">详情</button>` : ""}
          </div>
        </div>
      `).join("")}
      <p class="empty-note">
        ${summary.remoteEnabled ? "远程扩展源已启用。" : "远程扩展源默认禁用，后续只会在用户明确开启并完成审核后加载。"}
      </p>
      ${summary.error ? `<p class="empty-note">${summary.error}</p>` : ""}
    </div>
  `;
}

function renderLobbyDashboard() {
  const sessions = sessionsList().slice(0, 2);
  const recent = recentGames(4);
  const stats = totalStats();
  const favoriteGames = state.favorites.slice(0, 4);
  return `
    <section class="lobby-dashboard" aria-label="游戏进度概览">
      <div class="dashboard-panel dashboard-primary">
        <div class="dashboard-head">
          <div>
            <span class="game-tag">续玩</span>
            <h2>接着上次玩</h2>
          </div>
          <span>${stats.sessions} 个存档</span>
        </div>
        <div class="shortcut-list">
          ${sessions.length ? sessions.map(renderSessionShortcut).join("") : "<p class=\"empty-note\">暂无未完成游戏。</p>"}
        </div>
      </div>
      <div class="dashboard-panel">
        <div class="dashboard-head">
          <div>
            <span class="game-tag">记录</span>
            <h2>最近与收藏</h2>
          </div>
          <span>${stats.started} 次开局</span>
        </div>
        <div class="quick-stats">
          <span>完成 ${stats.completed}</span>
          <span>胜利 ${stats.wins}</span>
          ${stats.bestScore ? `<span>最高 ${stats.bestScore}</span>` : ""}
        </div>
        <div class="recent-list">
          ${recent.length ? recent.map(renderRecentShortcut).join("") : "<p class=\"empty-note\">开始一局后会出现在这里。</p>"}
        </div>
        ${favoriteGames.length ? `<div class="recent-list favorites-strip">${favoriteGames.map(renderFavoriteShortcut).join("")}</div>` : ""}
        ${renderAchievementSummary()}
      </div>
    </section>
  `;
}

function renderGameCard(game) {
  const category = findCategory(game.category);
  const favorite = isFavorite(game.id);
  return `
    <article class="game-card accent-${game.accent}">
      <button
        class="favorite-button ${favorite ? "is-active" : ""}"
        data-toggle-favorite="${game.id}"
        aria-label="${favorite ? "取消收藏" : "收藏"}${game.title}"
        aria-pressed="${favorite ? "true" : "false"}"
      >${icon("star")}</button>
      <div class="game-card-top">
        <div>
          <span class="game-tag">${game.tag}</span>
          <h2>${game.title}</h2>
          <p>${game.subtitle}</p>
          <div class="game-meta">
            <span>${category.shortTitle}</span>
            ${game.capabilities?.fullscreen ? "<span>全屏</span>" : ""}
            ${game.capabilities?.sessionSave ? "<span>可续玩</span>" : ""}
          </div>
          ${renderProgressPills(game, true)}
        </div>
        ${boardPreview(game)}
      </div>
      <div class="game-card-actions">
        <button class="primary-button" data-prepare-game="${game.id}">${icon("play")} 开始对局</button>
      </div>
    </article>
  `;
}

function renderGameSections() {
  const sections = availableGameSections(state.activeCategory);
  return sections.map((section) => `
    <section class="game-section" aria-label="${section.title}">
      <div class="game-section-head">
        <h2>${section.title}</h2>
        <span>${section.games.length} 局</span>
      </div>
      <div class="game-grid">
        ${section.games.map(renderGameCard).join("")}
      </div>
    </section>
  `).join("");
}

function renderLobby() {
  app.innerHTML = `
    <main class="app-frame lobby-frame">
      <header class="app-topbar">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">弈</span>
          <div>
            <h1>潘多拉魔盒游戏大厅</h1>
          </div>
        </div>
        <button class="icon-button top-icon" data-open-modal="settings" aria-label="设置">${icon("settings")}</button>
      </header>

      <section class="lobby-hero">
        <div>
          <p class="intro">一方宣纸，棋局、解谜与街机同盒。</p>
        </div>
        <div class="lobby-status">
          <span>${icon("offline")}可离线</span>
          <span>${availableGames().length} 局游戏</span>
          <span>${interfaceThemes[state.theme]?.name || "国风界面"}</span>
        </div>
      </section>

      ${renderLobbyDashboard()}

      <section class="category-tabs" aria-label="游戏分类">
        ${renderCategoryTabs()}
      </section>

      <section class="game-library" aria-label="游戏大厅">
        ${renderGameSections()}
      </section>
    </main>
  `;

  app.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => setState({ activeCategory: button.dataset.category }));
  });
  app.querySelectorAll("[data-prepare-game]").forEach((button) => {
    button.addEventListener("click", () => {
      openModal("start", { pendingGame: button.dataset.prepareGame });
    });
  });
  app.querySelectorAll("[data-resume-session]").forEach((button) => {
    button.addEventListener("click", () => resumeSessionByKey(button.dataset.resumeSession));
  });
  app.querySelectorAll("[data-toggle-favorite]").forEach((button) => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.toggleFavorite));
  });
  bindShellActions();
  renderModal();
}

function renderGame() {
  const game = findAvailableGame(state.currentGame);
  const token = gameLoadToken;
  const mode = selectedModeFor(game);
  const difficulty = selectedDifficultyFor(game);
  const options = selectedGameOptions(game);
  const resumedSession = state.resumeSession ? sessionFor(game, options) : null;
  const canSaveSession = Boolean(game.capabilities?.sessionSave);
  const frameClass = game.capabilities?.fullscreen ? " arcade-play-frame" : "";
  app.innerHTML = `
    <main class="app-frame play-frame${frameClass}">
      <header class="play-header">
        <button class="icon-button" id="back-button" aria-label="返回大厅">${icon("back")}</button>
        <div>
          <p class="eyebrow">正在对局</p>
          <h1>${game.title}</h1>
        </div>
        <div class="header-actions">
          <button class="icon-button small" data-open-modal="pause" aria-label="暂停">${icon("pause")}</button>
          <button class="icon-button small" data-open-modal="rules" aria-label="规则">${icon("rules")}</button>
          <button class="icon-button small" data-open-modal="settings" aria-label="设置">${icon("settings")}</button>
        </div>
      </header>

      <section id="game-root" class="game-root"></section>
    </main>
  `;

  app.querySelector("#back-button").addEventListener("click", () => setState({ currentGame: "" }));
  bindShellActions();

  const gameRoot = app.querySelector("#game-root");
  gameRoot.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong>正在装载 ${game.title}</strong>
        <p class="game-note">${modeLabel[mode]} · ${difficultyLabel[difficulty]} · 独立游戏插件</p>
      </div>
    </section>
  `;

  loadAvailableGamePlugin(game.id)
    .then((plugin) => {
      if (token !== gameLoadToken) return;
      cleanupGame = plugin.mount(gameRoot, {
        difficulty,
        mode,
        options,
        theme: state.theme,
        visualStyle: selectedVisualStyleFor(game),
        labels: {
          difficulty: difficultyLabel[difficulty],
          mode: modeLabel[mode],
          visualStyle: visualStyleLabelFor(game)
        },
        playSound: (name) => playFeedbackSound(name),
        isPaused: () => Boolean(state.modal && state.modal !== "result"),
        savedState: canSaveSession ? resumedSession?.snapshot || null : null,
        saveSession: canSaveSession ? (snapshot, meta) => saveGameSession(game, options, snapshot, meta) : null,
        clearSession: canSaveSession ? () => clearGameSession(game, options) : null,
        reportResult: (result) => {
          if (canSaveSession) clearGameSession(game, options);
          handleGameResult(game, result);
        }
      });
    })
    .catch((error) => {
      if (token !== gameLoadToken) return;
      gameRoot.innerHTML = `
        <section class="game-panel game-status">
          <div>
            <strong>${game.title} 加载失败</strong>
            <p class="game-note">${error?.message || "游戏插件暂时无法打开。"}</p>
          </div>
          <button class="secondary-button" data-retry-game>重试</button>
        </section>
      `;
      gameRoot.querySelector("[data-retry-game]")?.addEventListener("click", render);
    });
  renderModal();
}

function bindShellActions() {
  app.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openModal));
  });
  app.querySelector("[data-install-app]")?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    render();
  });
}

function modalContent() {
  const game = findAvailableGame(state.currentGame || state.pendingGame);

  if (state.modal === "plugin-source") {
    const source = pluginSourceById(state.pendingPluginSource);
    return {
      title: source ? `${source.name}审核` : "插件源审核",
      body: renderPluginSourceAudit(source)
    };
  }

  if (state.modal === "start") {
    return {
      title: `${game.title}开局`,
      body: `
        <div class="start-sheet">
          <div class="start-preview accent-${game.accent}">
            ${boardPreview(game)}
            <div>
              <span class="game-tag">${game.tag}</span>
              <h3>${game.title}</h3>
              <p>${game.subtitle}</p>
            </div>
          </div>
          ${renderProgressPills(game)}
          ${renderModeField(game)}
          ${renderDifficultyField(game)}
          ${renderSetupFields(game)}
          ${renderVisualStyleField(game)}
          ${renderStartActions(game)}
        </div>
      `
    };
  }

  if (state.modal === "rules") {
    return {
      title: `${game.title}规则`,
      body: `
        <div class="rules-context">
          <span>${modeLabel[selectedModeFor(game)] || "单人挑战"}</span>
          <span>${difficultyLabel[selectedDifficultyFor(game)] || "中等"}</span>
          ${visualStyleLabelFor(game) ? `<span>${visualStyleLabelFor(game)}</span>` : ""}
        </div>
        <ul class="modal-list">
          ${(game.rules || []).map((rule, index) => `<li><b>${index + 1}</b><span>${rule}</span></li>`).join("")}
        </ul>
      `
    };
  }

  if (state.modal === "pause") {
    return {
      title: `${game.title}已暂停`,
      body: `
        <div class="result-panel">
          <strong>稍作停顿</strong>
          <p>当前游戏会保持在原地，关闭暂停层后继续。</p>
          <div class="settings-actions">
            <button class="secondary-button" data-open-modal="rules">查看规则</button>
            <button class="secondary-button" data-open-modal="settings">设置</button>
            <button class="primary-button" data-resume-game>${icon("play")} 继续</button>
          </div>
        </div>
      `
    };
  }

  if (state.modal === "result" && state.resultSummary) {
    const result = state.resultSummary;
    return {
      title: `${result.gameTitle}结束`,
      body: `
        <div class="result-panel">
          <strong>${outcomeLabel(result.outcome)}</strong>
          ${result.detail ? `<p>${result.detail}</p>` : ""}
          <div class="progress-pills">
            <span>完成 ${result.progress.completed}</span>
            <span>胜 ${result.progress.wins}</span>
            <span>负 ${result.progress.losses}</span>
            <span>平 ${result.progress.draws}</span>
            ${result.score ? `<span>分数 ${result.score}</span>` : ""}
            ${result.progress.bestScore ? `<span>最高 ${result.progress.bestScore}</span>` : ""}
          </div>
          <div class="settings-actions">
            <button class="secondary-button" data-result-close>继续查看</button>
            <button class="primary-button" data-result-lobby>返回大厅</button>
          </div>
        </div>
      `
    };
  }

  if (state.modal === "offline") {
    const protocolReady = location.protocol.startsWith("http");
    return {
      title: "离线状态",
      body: `
        <div class="modal-stack">
          <p>${protocolReady ? "当前由本地服务打开，可缓存离线资源。" : "当前由文件直接打开，可以游玩，但安装和离线缓存需要本地服务地址。"}</p>
          <p>对局进度会保存在本机浏览器中。</p>
        </div>
      `
    };
  }

  const pluginSourceSummary = summarizePluginSources(state.pluginSources);

  return {
    title: "设置",
    body: `
      <div class="settings-screen">
        <div>
          <span class="modal-label">界面主题</span>
          <div class="skin-tabs compact">
            ${renderThemeTabs()}
          </div>
        </div>
        <label class="toggle-row">
          <span>${icon("sound")} 音效</span>
          <input type="checkbox" data-modal-sound ${state.sound ? "checked" : ""} />
        </label>
        <label class="modal-field">
          <span>音量 ${state.volume}%</span>
          <input type="range" min="0" max="100" step="5" value="${state.volume}" data-modal-volume />
        </label>
        <div>
          <span class="modal-label">对局记录</span>
          <div class="progress-pills">
            <span>开局 ${Object.values(state.progress).reduce((sum, item) => sum + (item.started || 0), 0)}</span>
            <span>完成 ${Object.values(state.progress).reduce((sum, item) => sum + (item.completed || 0), 0)}</span>
            <span>收藏 ${state.favorites.length}</span>
            <span>成就 ${unlockedAchievementCount()}/${ACHIEVEMENTS.length}</span>
            <span>插件 ${availablePluginCatalog().length}</span>
            <span>预缓存 ${precacheAssets.length}</span>
            <span>插件源 ${pluginSourceSummary.enabled}/${pluginSourceSummary.total}</span>
            <span>可发现 ${pluginSourceSummary.discoveredGames}</span>
            <span>已接入 ${pluginSourceSummary.loadableGames}</span>
          </div>
        </div>
        <div>
          <span class="modal-label">插件源</span>
          ${renderPluginSourceList()}
        </div>
        <div>
          <span class="modal-label">基础成就</span>
          ${renderAchievementList()}
        </div>
        <div class="settings-actions">
          <button class="secondary-button" data-open-modal="offline">${icon("offline")} 离线状态</button>
          <button class="secondary-button" data-install-app ${installPrompt ? "" : "disabled"}>安装到设备</button>
        </div>
      </div>
    `
  };
}

function renderModal() {
  app.querySelector(".modal-backdrop")?.remove();
  if (!state.modal) return;

  const game = findAvailableGame(state.currentGame || state.pendingGame);
  const content = modalContent();
  app.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop" role="presentation" data-close-modal>
      <section class="modal-panel" role="dialog" aria-modal="true" aria-label="${content.title}">
        <div class="modal-head">
          <h2>${content.title}</h2>
          <button class="icon-button small" data-close-modal aria-label="关闭">${icon("close")}</button>
        </div>
        ${content.body}
      </section>
    </div>
  `);

  const backdrop = app.querySelector(".modal-backdrop");
  backdrop.addEventListener("click", (event) => {
    const closeButton = event.target.closest("button[data-close-modal]");
    if (event.target === backdrop || closeButton) closeModal();
  });
  app.querySelector("[data-modal-mode]")?.addEventListener("change", (event) => updateGameOption(game, { mode: event.target.value }));
  app.querySelector("[data-modal-difficulty]")?.addEventListener("change", (event) => updateGameOption(game, { difficulty: event.target.value }));
  app.querySelectorAll("[data-modal-option]").forEach((field) => {
    field.addEventListener("change", (event) => updateGameOption(game, { [event.target.dataset.modalOption]: event.target.value }));
  });
  app.querySelector("[data-modal-visual-style]")?.addEventListener("change", (event) => updateGameOption(game, { visualStyle: event.target.value }));
  app.querySelector("[data-modal-sound]")?.addEventListener("change", (event) => {
    const sound = event.target.checked;
    setState({ sound });
    if (sound) playFeedbackSound("start");
  });
  const volumeInput = app.querySelector("[data-modal-volume]");
  volumeInput?.addEventListener("input", (event) => {
    state.volume = Number(event.target.value);
    event.target.closest(".modal-field")?.querySelector("span")?.replaceChildren(`音量 ${state.volume}%`);
    persistPreferences();
  });
  volumeInput?.addEventListener("change", () => playFeedbackSound("tap"));
  app.querySelectorAll(".modal-panel [data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openModal));
  });
  app.querySelectorAll(".modal-panel [data-review-plugin-source]").forEach((button) => {
    button.addEventListener("click", () => openModal("plugin-source", { pendingPluginSource: button.dataset.reviewPluginSource }));
  });
  app.querySelector("[data-enable-plugin-source]")?.addEventListener("click", (event) => {
    setPluginSourceEnabled(event.currentTarget.dataset.enablePluginSource, true);
  });
  app.querySelector("[data-disable-plugin-source]")?.addEventListener("click", (event) => {
    setPluginSourceEnabled(event.currentTarget.dataset.disablePluginSource, false);
  });
  app.querySelector(".modal-panel [data-install-app]")?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    render();
  });
  app.querySelector("[data-start-game]")?.addEventListener("click", () => {
    startPendingGame(collectSetupValuesFromModal(game));
  });
  app.querySelector("[data-resume-start]")?.addEventListener("click", () => {
    startPendingGame(collectSetupValuesFromModal(game), true);
  });
  app.querySelector("[data-result-close]")?.addEventListener("click", () => {
    state.modal = "";
    state.resultSummary = null;
    renderModal();
  });
  app.querySelector("[data-resume-game]")?.addEventListener("click", closeModal);
  app.querySelector("[data-result-lobby]")?.addEventListener("click", () => {
    setState({ currentGame: "", modal: "", pendingGame: "", resultSummary: null });
  });
  app.querySelectorAll(".modal-panel [data-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.disabled) setState({ theme: button.dataset.theme });
    });
  });
}

function render() {
  gameLoadToken += 1;
  if (cleanupGame) {
    cleanupGame();
    cleanupGame = null;
  }

  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.skin = state.theme;
  if (state.currentGame) renderGame();
  else renderLobby();
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), { type: "module" }).catch(() => {});
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  render();
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled || !app.contains(button) || button.hasAttribute("data-start-game")) return;
  const action = button.dataset.action;
  if (action === "undo") playFeedbackSound("undo");
  else if (action === "hint") playFeedbackSound("hint");
  else if (action === "restart" || button.classList.contains("danger-button")) playFeedbackSound("restart");
  else playFeedbackSound("tap");
});

render();

refreshPluginSources();
