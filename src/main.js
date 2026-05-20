import { categories, games, pluginCatalog, precacheAssets, findCategory, findGame, loadGamePlugin as loadCatalogGamePlugin } from "./games/catalog.js";
import { loadGamePlugin as loadRegisteredGamePlugin } from "./platform/game-plugin.js";
import { DEFAULT_PLUGIN_SOURCE_STATE, collectEnabledPluginRegistrations, loadPluginSourceState, summarizePluginSources } from "./platform/plugin-sources.js";
import { configureSound, playResultSound, playSound as playFeedbackSound } from "./platform/sound.js";
import { interfaceThemes, themeOrder } from "./theme/skins.js";
import { loadState, saveState } from "./utils/storage.js";

const app = document.querySelector("#app");
const FEEDBACK_REPO_URL = "https://github.com/zhangnanvip/PandoraBox";
const FEEDBACK_ISSUE_URL = `${FEEDBACK_REPO_URL}/issues/new`;

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
  view: "lobby",
  activeCategory: "all",
  progress: savedProgress && typeof savedProgress === "object" ? savedProgress : {},
  sessions: savedSessions && typeof savedSessions === "object" ? savedSessions : {},
  favorites: Array.isArray(savedFavorites) ? savedFavorites.filter(Boolean) : [],
  pluginSources: DEFAULT_PLUGIN_SOURCE_STATE,
  pluginSourceOverrides: preferences.pluginSourceOverrides && typeof preferences.pluginSourceOverrides === "object" ? preferences.pluginSourceOverrides : {},
  pluginCacheStatus: {},
  cacheNotice: "",
  resultSummary: null,
  resumeSession: false
};

let cleanupGame = null;
let gameLoadToken = 0;
let renderedGameId = "";
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
  if (categoryId === "hot") return marketHeatScore(game) >= 68;
  return game.category === categoryId || (game.secondaryCategories || []).includes(categoryId);
}

function marketHeatScore(game) {
  return Number.isFinite(game?.marketHeat?.score) ? game.marketHeat.score : 0;
}

function sortByMarketHeat(games) {
  return [...games].sort((a, b) => {
    const scoreDelta = marketHeatScore(b) - marketHeatScore(a);
    if (scoreDelta) return scoreDelta;
    return a.title.localeCompare(b.title, "zh-Hans-CN");
  });
}

function availableGameSections(categoryId = "all") {
  const allGames = availableGames();
  if (categoryId === "hot") {
    return [{
      ...findCategory("hot"),
      title: "热门推荐",
      games: sortByMarketHeat(allGames.filter((game) => gameMatchesCategory(game, "hot")))
    }];
  }
  const visibleGames = allGames.filter((game) => gameMatchesCategory(game, categoryId));
  const groups = categoryId === "all" ? categories.filter((category) => !["all", "hot"].includes(category.id)) : [findCategory(categoryId)];

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

function uniqueStyleSheets(paths) {
  return [...new Set(paths.filter(Boolean))];
}

function styleSheetHref(path) {
  return new URL(path, document.baseURI).toString();
}

function styleSheetsFor(game, visualStyle) {
  const activeStyle = (game.visualStyles || []).find((style) => style.value === visualStyle);
  return uniqueStyleSheets([
    ...(game.styleSheets || []),
    ...(activeStyle?.styleSheets || [])
  ]);
}

function syncGameStyleSheets(paths = []) {
  const desired = new Set(paths.map(styleSheetHref));
  document.querySelectorAll("link[data-game-style-sheet]").forEach((link) => {
    if (!desired.has(link.href)) link.remove();
  });
  paths.forEach((path) => {
    const href = styleSheetHref(path);
    const exists = [...document.querySelectorAll("link[data-game-style-sheet]")]
      .some((link) => link.href === href);
    if (exists) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.gameStyleSheet = "true";
    document.head.append(link);
  });
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

const capabilityLabel = {
  offline: "离线",
  fullscreen: "全屏",
  sessionSave: "续玩",
  touchControls: "触控",
  keyboardControls: "键盘",
  staged: "闯关",
  boss: "Boss"
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
  if (state.currentGame) renderModal();
  else render();
}

function closeModal() {
  state.modal = "";
  state.pendingGame = "";
  state.pendingPluginSource = "";
  state.resultSummary = null;
  if (state.currentGame) renderModal();
  else render();
}

function dispatchCurrentGameRestart() {
  const gameRoot = app.querySelector("#game-root");
  const event = new CustomEvent("pandora:restart-game", { cancelable: true });
  gameRoot?.dispatchEvent(event);
  if (event.defaultPrevented) return;
  gameRoot?.querySelector("[data-action='restart']")?.dispatchEvent(new Event("click"));
}

function requestCurrentGameRestart() {
  if (!state.currentGame) return;
  openModal("restart");
}

function confirmCurrentGameRestart() {
  state.modal = "";
  state.resultSummary = null;
  renderModal();
  dispatchCurrentGameRestart();
}

async function refreshPluginSources(options = {}) {
  state.pluginSources = await loadPluginSourceState({
    sourceOverrides: state.pluginSourceOverrides
  });
  if (state.currentGame && !availableGames().some((game) => game.id === state.currentGame)) {
    state.currentGame = "";
  }
  if (options.cacheEnabled) {
    await Promise.all((state.pluginSources.sources || [])
      .filter((source) => source.enabled && source.type === "url")
      .map((source) => cachePluginSourceAssets(source.id)));
  }
  render();
}

function pluginAssetUrlsForSource(source) {
  return [...new Set((source?.catalog?.registrations || []).flatMap((registration) => registration.manifest.precacheAssets || []))];
}

function cacheStatusForSource(source) {
  if (!source?.enabled) return { state: "disabled", text: "未启用" };
  const status = state.pluginCacheStatus[source.id];
  if (!status) return { state: "pending", text: "等待缓存" };
  if (status.state === "ready") return { ...status, text: `资源已缓存 ${status.done}/${status.total}` };
  if (status.state === "empty") return { ...status, text: "无额外资源" };
  if (status.state === "unavailable") return { ...status, text: "当前环境不支持缓存" };
  if (status.state === "error") return { ...status, text: `缓存失败 ${status.done || 0}/${status.total || 0}` };
  return { ...status, text: "缓存中" };
}

async function cachePluginSourceAssets(sourceId) {
  const source = pluginSourceById(sourceId);
  const urls = pluginAssetUrlsForSource(source);
  if (!source?.enabled) return;
  if (!urls.length) {
    state.pluginCacheStatus = { ...state.pluginCacheStatus, [sourceId]: { state: "empty", done: 0, total: 0 } };
    return;
  }
  if (!("caches" in window) || !location.protocol.startsWith("http")) {
    state.pluginCacheStatus = { ...state.pluginCacheStatus, [sourceId]: { state: "unavailable", done: 0, total: urls.length } };
    return;
  }

  state.pluginCacheStatus = { ...state.pluginCacheStatus, [sourceId]: { state: "loading", done: 0, total: urls.length } };
  try {
    const cache = await caches.open("pandora-box-plugin-assets-v1");
    await cache.addAll(urls);
    state.pluginCacheStatus = { ...state.pluginCacheStatus, [sourceId]: { state: "ready", done: urls.length, total: urls.length } };
  } catch (error) {
    state.pluginCacheStatus = {
      ...state.pluginCacheStatus,
      [sourceId]: {
        state: "error",
        done: 0,
        total: urls.length,
        error: error?.message || "缓存失败"
      }
    };
  }
}

async function clearOfflineCaches() {
  if (!("caches" in window) || !location.protocol.startsWith("http")) {
    state.cacheNotice = "当前打开方式不支持清除离线缓存，对局记录未受影响。";
    renderModal();
    return;
  }

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    state.pluginCacheStatus = {};
    state.cacheNotice = keys.length
      ? `已清除 ${keys.length} 个离线缓存，刷新后会重新拉取资源；对局记录已保留。`
      : "没有可清除的离线缓存，对局记录已保留。";
    navigator.serviceWorker?.getRegistration?.().then((registration) => registration?.update?.()).catch(() => {});
  } catch (error) {
    state.cacheNotice = `清除缓存失败：${error?.message || "未知错误"}`;
  }
  renderModal();
}

function feedbackContextLines() {
  const currentGame = state.currentGame ? findAvailableGame(state.currentGame) : null;
  return [
    `页面：${location.href}`,
    `入口：${state.currentGame ? `对局中 / ${currentGame?.title || state.currentGame}` : `大厅 / ${state.view}`}`,
    `分类：${state.activeCategory}`,
    `主题：${state.theme}`,
    `设备：${navigator.userAgent}`,
    `时间：${new Date().toISOString()}`
  ];
}

function feedbackPayload(form) {
  const data = new FormData(form);
  const type = String(data.get("type") || "产品建议").trim();
  const content = String(data.get("content") || "").trim();
  const contact = String(data.get("contact") || "").trim();
  const title = `[反馈] ${type}${content ? `：${content.slice(0, 24)}` : ""}`;
  const body = [
    "## 反馈内容",
    content || "（未填写）",
    "",
    "## 类型",
    type,
    "",
    "## 联系方式",
    contact || "未填写",
    "",
    "## 环境信息",
    ...feedbackContextLines().map((line) => `- ${line}`)
  ].join("\n");
  const params = new URLSearchParams({ title, body });
  return {
    content,
    text: body,
    url: `${FEEDBACK_ISSUE_URL}?${params.toString()}`
  };
}

function setFeedbackNotice(message, tone = "normal") {
  const notice = app.querySelector("[data-feedback-notice]");
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.tone = tone;
}

function submitFeedback(form) {
  const payload = feedbackPayload(form);
  if (payload.content.length < 6) {
    setFeedbackNotice("请至少写 6 个字，方便我们判断要改哪里。", "error");
    return;
  }
  const opened = window.open(payload.url, "_blank");
  if (opened) opened.opener = null;
  if (!opened) location.href = payload.url;
  setFeedbackNotice("已打开 GitHub 反馈页，确认后就会提交给项目。", "success");
}

async function copyFeedback(form) {
  const payload = feedbackPayload(form);
  if (payload.content.length < 6) {
    setFeedbackNotice("请先写下具体建议，再复制反馈内容。", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(payload.text);
    setFeedbackNotice("反馈内容已复制，可以手动发给产品或贴到 GitHub Issue。", "success");
  } catch {
    setFeedbackNotice("当前浏览器不允许自动复制，可以长按输入内容手动复制。", "error");
  }
}

async function setPluginSourceEnabled(sourceId, enabled) {
  state.pluginSourceOverrides = {
    ...state.pluginSourceOverrides,
    [sourceId]: { enabled }
  };
  state.pendingPluginSource = sourceId;
  state.modal = "plugin-source";
  if (!enabled) {
    const { [sourceId]: _removed, ...rest } = state.pluginCacheStatus;
    state.pluginCacheStatus = rest;
  }
  persistPreferences();
  await refreshPluginSources({ cacheEnabled: enabled });
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

function sessionItemForGame(game, options = selectedGameOptions(game)) {
  const selectedKey = sessionKeyFor(game, options);
  if (state.sessions[selectedKey]) {
    return { key: selectedKey, session: state.sessions[selectedKey], game, matchesOptions: true };
  }
  const latestItem = sessionsList().find((item) => item.game.id === game.id);
  return latestItem ? { ...latestItem, matchesOptions: false } : null;
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
  clearGameSessionByKey(key);
}

function clearGameSessionByKey(key) {
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
    meta.stage ? meta.stage : "",
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

function favoriteGames(limit = state.favorites.length) {
  return state.favorites
    .slice()
    .reverse()
    .map((gameId) => availableGames().find((item) => item.id === gameId))
    .filter(Boolean)
    .slice(0, limit);
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

function recentActivities(limit = 2) {
  const itemsByGame = new Map();
  for (const { game, progress } of recentGames(availableGames().length)) {
    itemsByGame.set(game.id, {
      game,
      progress,
      sessionItem: null,
      timestamp: progress.lastPlayed || ""
    });
  }

  for (const sessionItem of sessionsList()) {
    const existing = itemsByGame.get(sessionItem.game.id) || {
      game: sessionItem.game,
      progress: progressFor(sessionItem.game.id),
      sessionItem: null,
      timestamp: ""
    };
    const lastPlayed = new Date(existing.timestamp || 0).getTime();
    const savedAt = new Date(sessionItem.session.updatedAt || 0).getTime();
    itemsByGame.set(sessionItem.game.id, {
      ...existing,
      sessionItem,
      timestamp: savedAt > lastPlayed ? sessionItem.session.updatedAt : existing.timestamp
    });
  }

  return [...itemsByGame.values()]
    .filter((item) => item.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
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

function bindRecentActivityActions(root = app) {
  root.querySelectorAll("[data-resume-session]").forEach((button) => {
    button.addEventListener("click", () => resumeSessionByKey(button.dataset.resumeSession));
  });
}

function bindGameStartActions(root = app) {
  root.querySelectorAll("[data-prepare-game]").forEach((button) => {
    button.addEventListener("click", () => {
      openModal("start", { pendingGame: button.dataset.prepareGame });
    });
  });
}

function bindFavoriteActions(root = app) {
  root.querySelectorAll("[data-toggle-favorite]").forEach((button) => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.toggleFavorite));
  });
}

function openHistoryPage() {
  setState({ view: "history", modal: "" });
}

function openFavoritesPage() {
  setState({ view: "favorites", modal: "" });
}

function openAchievementsPage() {
  setState({ view: "achievements", modal: "" });
}

function icon(name) {
  const paths = {
    settings: '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.16 2.16 0 0 1-3.06 3.06l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.64V21.4a2.16 2.16 0 0 1-4.32 0v-.08a1.8 1.8 0 0 0-1.08-1.64 1.8 1.8 0 0 0-1.98.36l-.04.04a2.16 2.16 0 0 1-3.06-3.06l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.08H2.88a2.16 2.16 0 0 1 0-4.32h.08A1.8 1.8 0 0 0 4.6 8.52a1.8 1.8 0 0 0-.36-1.98l-.04-.04A2.16 2.16 0 0 1 7.26 3.44l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.36 2.2V2.12a2.16 2.16 0 0 1 4.32 0v.08a1.8 1.8 0 0 0 1.08 1.64 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.16 2.16 0 0 1 3.06 3.06l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.64 1.08h.08a2.16 2.16 0 0 1 0 4.32h-.08A1.8 1.8 0 0 0 19.4 15Z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    rules: '<path d="M6 4.5h9.2a2.8 2.8 0 0 1 2.8 2.8v12.2H8.8A2.8 2.8 0 0 1 6 16.7V4.5Z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M8 5v14l11-7L8 5Z"/>',
    pause: '<path d="M7 5h3v14H7V5Z"/><path d="M14 5h3v14h-3V5Z"/>',
    restart: '<path d="M3 12a9 9 0 1 0 2.64-6.36"/><path d="M3 5v6h6"/>',
    history: '<path d="M12 8v5l3 2"/><path d="M3.05 11a9 9 0 1 1 2.64 6.36"/><path d="M3 17v-6h6"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/><path d="M9 17h6"/>',
    feedback: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H11l-5 4v-4.2A2.5 2.5 0 0 1 4 12.5v-7Z"/><path d="M8 8h8M8 11h5"/>',
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
  const sessionItem = sessionItemForGame(game);
  if (!sessionItem) {
    return `<button class="primary-button wide-button" data-start-game>${icon("play")} 开始</button>`;
  }

  return `
    <div class="resume-card">
      <div>
        <span class="modal-label">未完成进度</span>
        <strong>${sessionSummary(sessionItem.session) || "已有可继续的进度"}</strong>
        ${sessionItem.matchesOptions ? "" : "<p>继续会恢复上次保存的配置，重开会按当前选择开始。</p>"}
      </div>
      <button class="primary-button" data-resume-start-key="${escapeAttr(sessionItem.key)}">${icon("play")} 继续</button>
      <button class="secondary-button" data-start-game data-restart-session-key="${escapeAttr(sessionItem.key)}">重开</button>
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
  if (modes.length <= 1) return "";
  return renderSelectField({
    label: "对局模式",
    attr: "data-modal-mode",
    value: selectedModeFor(game),
    options: modes
  });
}

function renderDifficultyField(game) {
  const difficulties = (game.difficultySupport || []).map((value) => ({ value, label: difficultyLabel[value] || value }));
  if (difficulties.length <= 1) return "";
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

function renderRecentShortcut({ game, progress, sessionItem }) {
  const hasSession = Boolean(sessionItem);
  const detail = hasSession
    ? sessionSummary(sessionItem.session) || "已有未完成进度"
    : `最近 ${formatTime(progress.lastPlayed)}`;
  const gameTitle = escapeAttr(game.title);
  const continueAttrs = hasSession
    ? `data-resume-session="${escapeAttr(sessionItem.key)}" aria-label="续玩${gameTitle}"`
    : `data-prepare-game="${escapeAttr(game.id)}" aria-label="继续游玩${gameTitle}"`;
  return `
    <article class="recent-activity accent-${game.accent}">
      <div class="recent-activity-copy">
        <span class="game-tag">${hasSession ? "可续玩" : "最近"}</span>
        <h3>${game.title}</h3>
        <p>${detail}</p>
      </div>
      <div class="recent-actions">
        <button class="primary-button mini-action" type="button" ${continueAttrs}>${icon("play")} 继续</button>
      </div>
    </article>
  `;
}

function favoriteDetail(game) {
  const progress = progressFor(game.id);
  if (progress.lastPlayed) return `最近 ${formatTime(progress.lastPlayed)}`;
  return `${findCategory(game.category).shortTitle} · 尚未开局`;
}

function renderFavoriteShortcut(game) {
  return `
    <article class="recent-activity favorite-activity accent-${game.accent}">
      <div class="recent-activity-copy">
        <span class="game-tag">收藏</span>
        <h3>${game.title}</h3>
        <p>${favoriteDetail(game)}</p>
      </div>
      <div class="recent-actions">
        <button class="primary-button mini-action" type="button" data-prepare-game="${escapeAttr(game.id)}" aria-label="开始${game.title}">${icon("play")} 开始</button>
      </div>
    </article>
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

function renderAchievementPage() {
  const achievements = achievementStates();
  const unlocked = achievements.filter((achievement) => achievement.unlocked);
  const stats = totalStats();
  app.innerHTML = `
    <main class="app-frame lobby-frame">
      <header class="app-topbar">
        <div class="brand-lockup">
          <button class="icon-button top-icon" data-view-lobby aria-label="返回大厅">${icon("back")}</button>
          <div>
            <h1>成就中心</h1>
          </div>
        </div>
        <button class="icon-button top-icon" data-open-modal="settings" aria-label="设置">${icon("settings")}</button>
      </header>

      <section class="achievement-page">
        <div class="achievement-hero">
          <div>
            <span class="game-tag">收集进度</span>
            <strong>${unlocked.length}/${achievements.length}</strong>
            <p>记录开局、结算、胜利、收藏和多类型游玩进度。</p>
          </div>
          <div class="quick-stats">
            <span>开局 ${stats.started}</span>
            <span>完成 ${stats.completed}</span>
            <span>胜利 ${stats.wins}</span>
            <span>收藏 ${stats.favorites}</span>
          </div>
        </div>
        ${renderAchievementList()}
      </section>
    </main>
  `;

  app.querySelector("[data-view-lobby]")?.addEventListener("click", () => setState({ view: "lobby", modal: "" }));
  bindShellActions();
  renderModal();
}

function renderHistoryItem({ game, progress, sessionItem }) {
  const category = findCategory(game.category);
  const hasSession = Boolean(sessionItem);
  const summary = hasSession
    ? sessionSummary(sessionItem.session) || "已有未完成进度"
    : `最近 ${formatTime(progress.lastPlayed)}`;
  const resultText = progress.lastResult ? `上次 ${outcomeLabel(progress.lastResult)}` : "暂无结算";
  const gameTitle = escapeAttr(game.title);
  const continueAttrs = hasSession
    ? `data-resume-session="${escapeAttr(sessionItem.key)}" aria-label="续玩${gameTitle}"`
    : `data-prepare-game="${escapeAttr(game.id)}" aria-label="继续游玩${gameTitle}"`;
  return `
    <article class="history-row accent-${game.accent}">
      <div class="game-card-icon history-icon" aria-hidden="true">
        ${boardPreview(game)}
      </div>
      <div class="history-copy">
        <div class="history-title-line">
          <span class="game-tag">${hasSession ? "可续玩" : "最近"}</span>
          <span>${category.shortTitle}</span>
        </div>
        <h2>${game.title}</h2>
        <p>${summary}</p>
        <div class="quick-stats history-stats">
          <span>开局 ${progress.started || 0}</span>
          <span>完成 ${progress.completed || 0}</span>
          <span>${resultText}</span>
        </div>
      </div>
      <div class="history-actions">
        <button class="primary-button mini-action" type="button" ${continueAttrs}>${icon("play")} 继续</button>
      </div>
    </article>
  `;
}

function renderHistoryPage() {
  const activities = recentActivities(availableGames().length);
  const stats = totalStats();
  app.innerHTML = `
    <main class="app-frame lobby-frame">
      <header class="app-topbar">
        <div class="brand-lockup">
          <button class="icon-button top-icon" data-view-lobby aria-label="返回大厅">${icon("back")}</button>
          <div>
            <h1>最近对局</h1>
          </div>
        </div>
        <button class="icon-button top-icon" data-open-modal="settings" aria-label="设置">${icon("settings")}</button>
      </header>

      <section class="history-page">
        <div class="achievement-hero history-hero">
          <div>
            <span class="game-tag">对局历史</span>
            <strong>${activities.length}</strong>
            <p>最近玩过的游戏集中在这里，有未完成进度的可以直接继续。</p>
          </div>
          <div class="quick-stats">
            <span>存档 ${stats.sessions}</span>
            <span>开局 ${stats.started}</span>
            <span>完成 ${stats.completed}</span>
          </div>
        </div>
        <div class="history-list">
          ${activities.length ? activities.map(renderHistoryItem).join("") : "<p class=\"empty-note\">开始一局后会生成最近记录。</p>"}
        </div>
      </section>
    </main>
  `;

  app.querySelector("[data-view-lobby]")?.addEventListener("click", () => setState({ view: "lobby", modal: "" }));
  bindGameStartActions();
  bindRecentActivityActions();
  bindShellActions();
  renderModal();
}

function renderFavoriteItem(game) {
  const category = findCategory(game.category);
  const progress = progressFor(game.id);
  const resultText = progress.lastResult ? `上次 ${outcomeLabel(progress.lastResult)}` : "暂无结算";
  return `
    <article class="history-row favorite-row accent-${game.accent}">
      <div class="game-card-icon history-icon" aria-hidden="true">
        ${boardPreview(game)}
      </div>
      <div class="history-copy">
        <div class="history-title-line">
          <span class="game-tag">收藏</span>
          <span>${category.shortTitle}</span>
        </div>
        <h2>${game.title}</h2>
        <p>${game.subtitle}</p>
        <div class="quick-stats history-stats">
          <span>开局 ${progress.started || 0}</span>
          <span>完成 ${progress.completed || 0}</span>
          <span>${progress.lastPlayed ? `最近 ${formatTime(progress.lastPlayed)}` : resultText}</span>
        </div>
      </div>
      <div class="history-actions">
        <button class="primary-button mini-action" type="button" data-prepare-game="${escapeAttr(game.id)}" aria-label="开始${game.title}">${icon("play")} 开始</button>
        <button class="secondary-button mini-action" type="button" data-toggle-favorite="${escapeAttr(game.id)}" aria-label="取消收藏${game.title}">取消</button>
      </div>
    </article>
  `;
}

function renderFavoritesPage() {
  const favorites = favoriteGames();
  app.innerHTML = `
    <main class="app-frame lobby-frame">
      <header class="app-topbar">
        <div class="brand-lockup">
          <button class="icon-button top-icon" data-view-lobby aria-label="返回大厅">${icon("back")}</button>
          <div>
            <h1>收藏游戏</h1>
          </div>
        </div>
        <button class="icon-button top-icon" data-open-modal="settings" aria-label="设置">${icon("settings")}</button>
      </header>

      <section class="history-page">
        <div class="achievement-hero history-hero">
          <div>
            <span class="game-tag">常玩清单</span>
            <strong>${favorites.length}</strong>
            <p>收藏的游戏集中在这里，首页只显示最近收藏的两款。</p>
          </div>
          <div class="quick-stats">
            <span>棋类 ${favorites.filter((game) => game.category === "classic" || game.secondaryCategories?.includes("classic")).length}</span>
            <span>街机 ${favorites.filter((game) => game.category === "arcade").length}</span>
            <span>可续玩 ${favorites.filter((game) => game.capabilities?.sessionSave).length}</span>
          </div>
        </div>
        <div class="history-list">
          ${favorites.length ? favorites.map(renderFavoriteItem).join("") : "<p class=\"empty-note\">点亮游戏卡片上的星标后会出现在这里。</p>"}
        </div>
      </section>
    </main>
  `;

  app.querySelector("[data-view-lobby]")?.addEventListener("click", () => setState({ view: "lobby", modal: "" }));
  bindGameStartActions();
  bindFavoriteActions();
  bindShellActions();
  renderModal();
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
        <div class="achievement-row plugin-game-preview">
          <div>
            <strong>${game.title}</strong>
            <span>${[
              game.subtitle || game.id,
              game.version ? `v${game.version}` : "",
              game.modeSupport?.length ? game.modeSupport.map((mode) => modeLabel[mode] || mode).join("/") : "",
              game.difficultySupport?.length ? game.difficultySupport.map((difficulty) => difficultyLabel[difficulty] || difficulty).join("/") : "",
              game.assets ? `${game.assets} 个资源` : ""
            ].filter(Boolean).join(" · ")}</span>
            <div class="progress-pills plugin-capability-pills">
              ${Object.entries(game.capabilities || {})
                .filter(([, enabled]) => enabled)
                .map(([key]) => `<span>${capabilityLabel[key] || key}</span>`)
                .join("") || "<span>基础插件</span>"}
            </div>
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
  const cacheStatus = cacheStatusForSource(source);
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
        <span>${cacheStatus.text}</span>
        ${source.enabledByUser ? "<span>本机启用</span>" : ""}
      </div>
      <div class="source-audit-meta">
        <strong>${source.name}</strong>
        <span>${source.url || "内置游戏包"}</span>
        ${catalog.title ? `<span>${catalog.title}</span>` : ""}
        ${catalog.description ? `<span>${catalog.description}</span>` : ""}
        ${catalog.error ? `<span>${catalog.error}</span>` : ""}
        ${catalog.blocked ? `<span>${catalog.blocked}</span>` : ""}
        ${cacheStatus.error ? `<span>${cacheStatus.error}</span>` : ""}
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
              ${source.enabled ? ` · ${cacheStatusForSource(source).text}` : ""}
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
  const recent = recentActivities(2);
  const stats = totalStats();
  const favoriteItems = favoriteGames(2);
  return `
    <section class="lobby-dashboard" aria-label="游戏进度概览">
      <div class="dashboard-panel dashboard-primary compact-dashboard recent-dashboard">
        <div class="dashboard-head">
          <div>
            <span class="game-tag">最近</span>
            <h2>继续游玩</h2>
          </div>
          <div class="dashboard-head-actions">
            <span>${stats.sessions} 存档 · ${stats.started} 开局</span>
            <button class="dashboard-link" type="button" data-open-history>全部</button>
          </div>
        </div>
        <div class="recent-list recent-activity-list">
          ${recent.length ? recent.map(renderRecentShortcut).join("") : "<p class=\"empty-note\">开始一局后会出现在这里。</p>"}
        </div>
      </div>
      <div class="dashboard-panel compact-dashboard">
        <div class="dashboard-head">
          <div>
            <span class="game-tag">收藏</span>
            <h2>常玩</h2>
          </div>
          <div class="dashboard-head-actions">
            <span>${favoriteGames().length} 款</span>
            <button class="dashboard-link" type="button" data-open-favorites>全部</button>
          </div>
        </div>
        <div class="recent-list favorites-strip">
          ${favoriteItems.length ? favoriteItems.map(renderFavoriteShortcut).join("") : "<p class=\"empty-note\">点亮卡片星标后会出现在这里。</p>"}
        </div>
      </div>
    </section>
  `;
}

function renderGameCard(game) {
  const category = findCategory(game.category);
  const favorite = isFavorite(game.id);
  const hotLabel = state.activeCategory === "hot" && game.marketHeat
    ? `<span>热度 ${game.marketHeat.score}</span><span>${game.marketHeat.label}</span>`
    : "";
  return `
    <article class="game-card accent-${game.accent}">
      <button
        class="favorite-button ${favorite ? "is-active" : ""}"
        data-toggle-favorite="${game.id}"
        aria-label="${favorite ? "取消收藏" : "收藏"}${game.title}"
        aria-pressed="${favorite ? "true" : "false"}"
      >${icon("star")}</button>
      <div class="game-card-top">
        <div class="game-card-icon">
          ${boardPreview(game)}
        </div>
        <div class="game-card-copy">
          <h2>${game.title}</h2>
          <p>${game.subtitle}</p>
          <div class="game-meta">
            <span class="tag-chip">${game.tag}</span>
            <span>${category.shortTitle}</span>
            ${hotLabel}
            ${game.capabilities?.sessionSave ? "<span>可续玩</span>" : ""}
          </div>
        </div>
      </div>
      <div class="game-card-actions">
        <button class="primary-button compact-play-button" data-prepare-game="${game.id}" aria-label="开始${game.title}">${icon("play")} 开始</button>
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
        <span>${section.games.length} 款</span>
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
            <h1>潘多拉魔盒</h1>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-button top-icon" data-open-history aria-label="最近对局">${icon("history")}</button>
          <button class="icon-button top-icon" data-open-achievements aria-label="成就">${icon("trophy")}</button>
          <button class="icon-button top-icon" data-open-modal="feedback" aria-label="意见反馈">${icon("feedback")}</button>
          <button class="icon-button top-icon" data-open-modal="settings" aria-label="设置">${icon("settings")}</button>
        </div>
      </header>

      <section class="lobby-hero">
        <div>
          <p class="intro">棋局、解谜、街机与策略，离线也能马上开局。</p>
        </div>
        <div class="lobby-status">
          <span>${icon("offline")}可离线</span>
          <span>${availableGames().length} 款游戏</span>
          <span>移动适配</span>
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
  app.querySelectorAll("[data-open-history]").forEach((button) => {
    button.addEventListener("click", openHistoryPage);
  });
  app.querySelectorAll("[data-open-favorites]").forEach((button) => {
    button.addEventListener("click", openFavoritesPage);
  });
  app.querySelector("[data-open-achievements]")?.addEventListener("click", openAchievementsPage);
  bindGameStartActions();
  bindRecentActivityActions();
  bindFavoriteActions();
  bindShellActions();
  renderModal();
}

function renderGame() {
  const game = findAvailableGame(state.currentGame);
  const token = gameLoadToken;
  const mode = selectedModeFor(game);
  const difficulty = selectedDifficultyFor(game);
  const options = selectedGameOptions(game);
  const visualStyle = selectedVisualStyleFor(game);
  const resumedSession = state.resumeSession ? sessionFor(game, options) : null;
  const canSaveSession = Boolean(game.capabilities?.sessionSave);
  const frameClass = game.capabilities?.fullscreen ? " arcade-play-frame" : "";
  const loadingMeta = [
    (game.modeSupport || []).length > 1 ? modeLabel[mode] : "",
    (game.difficultySupport || []).length > 1 ? difficultyLabel[difficulty] : "",
    "独立游戏插件"
  ].filter(Boolean).join(" · ");
  syncGameStyleSheets(styleSheetsFor(game, visualStyle));
  app.innerHTML = `
    <main class="app-frame play-frame${frameClass}" data-game-id="${escapeAttr(game.id)}" data-category="${escapeAttr(game.category)}" data-visual-style="${escapeAttr(visualStyle)}">
      <header class="play-header">
        <button class="icon-button" id="back-button" aria-label="返回大厅">${icon("back")}</button>
        <div>
          <p class="eyebrow">正在对局</p>
          <h1>${game.title}</h1>
        </div>
        <div class="header-actions">
          <button class="icon-button small restart-top-button" data-restart-current-game aria-label="重开">${icon("restart")}</button>
          <button class="icon-button small" data-open-modal="pause" aria-label="暂停">${icon("pause")}</button>
          <button class="icon-button small" data-open-modal="rules" aria-label="规则">${icon("rules")}</button>
          <button class="icon-button small" data-open-modal="settings" aria-label="设置">${icon("settings")}</button>
        </div>
      </header>

      <section id="game-root" class="game-root"></section>
    </main>
  `;
  window.scrollTo(0, 0);

  app.querySelector("#back-button").addEventListener("click", () => setState({ currentGame: "" }));
  bindShellActions();

  const gameRoot = app.querySelector("#game-root");
  gameRoot.innerHTML = `
    <section class="game-panel game-status">
      <div>
        <strong>正在装载 ${game.title}</strong>
        <p class="game-note">${loadingMeta}</p>
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
        visualStyle,
        labels: {
          difficulty: difficultyLabel[difficulty],
          mode: modeLabel[mode],
          visualStyle: visualStyleLabelFor(game)
        },
        shell: {
          onRestart(handler) {
            const listener = (event) => {
              event.preventDefault();
              handler?.(event);
            };
            gameRoot.addEventListener("pandora:restart-game", listener);
            return () => gameRoot.removeEventListener("pandora:restart-game", listener);
          }
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
  app.querySelector("[data-restart-current-game]")?.addEventListener("click", requestCurrentGameRestart);
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
    const rulesContextItems = [
      (game.modeSupport || []).length > 1 ? modeLabel[selectedModeFor(game)] || "单人挑战" : "",
      (game.difficultySupport || []).length > 1 ? difficultyLabel[selectedDifficultyFor(game)] || "中等" : "",
      visualStyleLabelFor(game)
    ].filter(Boolean);
    return {
      title: `${game.title}规则`,
      body: `
        <div class="rules-context">
          ${rulesContextItems.map((item) => `<span>${item}</span>`).join("")}
        </div>
        <ul class="modal-list">
          ${(game.rules || []).map((rule, index) => `<li><b>${index + 1}</b><span>${rule}</span></li>`).join("")}
        </ul>
      `
    };
  }

  if (state.modal === "restart") {
    const canSaveSession = Boolean(game.capabilities?.sessionSave);
    return {
      title: `重开${game.title}`,
      body: `
        <div class="result-panel">
          <strong>确认重开？</strong>
          <p>${canSaveSession ? "当前未完成进度会被清除，并从本局初始状态重新开始。" : "当前棋局会回到初始状态，已有走法不会保留。"}</p>
          <div class="settings-actions">
            <button class="secondary-button" data-resume-game>取消</button>
            <button class="danger-button" data-confirm-restart>确认重开</button>
          </div>
        </div>
      `
    };
  }

  if (state.modal === "pause") {
    const canSaveSession = Boolean(game.capabilities?.sessionSave);
    return {
      title: `${game.title}已暂停`,
      body: `
        <div class="result-panel">
          <strong>稍作停顿</strong>
          <p>${canSaveSession ? "回到大厅会保存当前进度，之后可在最近对局里继续。" : "当前游戏会保持在原地，关闭暂停层后继续。"}</p>
          <div class="settings-actions">
            <button class="secondary-button" data-open-modal="rules">查看规则</button>
            <button class="secondary-button" data-open-modal="settings">设置</button>
            ${canSaveSession ? "<button class=\"secondary-button\" data-pause-lobby>保存回大厅</button>" : ""}
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

  if (state.modal === "feedback") {
    return {
      title: "意见反馈",
      body: `
        <form class="feedback-form" data-feedback-form>
          <p class="settings-note">提交会打开 GitHub Issue 预填页面，确认后项目维护者就能集中跟进。没有 GitHub 账号时，可以先复制内容。</p>
          <label class="modal-field">
            <span>反馈类型</span>
            <select name="type">
              <option value="产品建议">产品建议</option>
              <option value="体验问题">体验问题</option>
              <option value="游戏内容">游戏内容</option>
              <option value="Bug">Bug</option>
              <option value="新游戏想法">新游戏想法</option>
            </select>
          </label>
          <label class="modal-field">
            <span>想说什么</span>
            <textarea class="feedback-textarea" name="content" rows="6" maxlength="1200" placeholder="比如：哪个游戏哪里不好玩、移动端哪里误触、希望增加什么玩法..."></textarea>
          </label>
          <label class="modal-field">
            <span>联系方式（选填）</span>
            <input class="feedback-input" name="contact" maxlength="120" placeholder="邮箱、微信或 GitHub ID" />
          </label>
          <div class="settings-actions feedback-actions">
            <button class="secondary-button" type="button" data-copy-feedback>复制内容</button>
            <button class="primary-button" type="submit">${icon("feedback")} 提交反馈</button>
          </div>
          <p class="settings-note feedback-notice" data-feedback-notice>会自动附带当前页面、游戏和设备信息，方便定位问题。</p>
        </form>
      `
    };
  }

  if (state.currentGame) {
    return {
      title: "设置",
      body: `
        <div class="settings-screen in-game-settings">
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
        <div class="settings-actions">
          <button class="secondary-button" data-open-modal="offline">${icon("offline")} 离线状态</button>
          <button class="secondary-button" data-open-history>${icon("history")} 最近对局</button>
          <button class="secondary-button" data-open-favorites>${icon("star")} 收藏游戏</button>
          <button class="secondary-button" data-open-achievements>${icon("trophy")} 成就中心</button>
          <button class="secondary-button" data-clear-cache>清除缓存</button>
          <button class="secondary-button" data-install-app ${installPrompt ? "" : "disabled"}>安装到设备</button>
        </div>
        ${state.cacheNotice ? `<p class="settings-note">${state.cacheNotice}</p>` : ""}
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
  app.querySelector("[data-clear-cache]")?.addEventListener("click", clearOfflineCaches);
  app.querySelector("[data-feedback-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitFeedback(event.currentTarget);
  });
  app.querySelector("[data-copy-feedback]")?.addEventListener("click", () => {
    const form = app.querySelector("[data-feedback-form]");
    if (form) copyFeedback(form);
  });
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
  app.querySelectorAll(".modal-panel [data-open-achievements]").forEach((button) => {
    button.addEventListener("click", openAchievementsPage);
  });
  app.querySelectorAll(".modal-panel [data-open-history]").forEach((button) => {
    button.addEventListener("click", openHistoryPage);
  });
  app.querySelectorAll(".modal-panel [data-open-favorites]").forEach((button) => {
    button.addEventListener("click", openFavoritesPage);
  });
  app.querySelectorAll(".modal-panel [data-review-plugin-source]").forEach((button) => {
    button.addEventListener("click", () => openModal("plugin-source", { pendingPluginSource: button.dataset.reviewPluginSource }));
  });
  app.querySelector("[data-enable-plugin-source]")?.addEventListener("click", (event) => {
    setPluginSourceEnabled(event.currentTarget.dataset.enablePluginSource, true).catch(() => render());
  });
  app.querySelector("[data-disable-plugin-source]")?.addEventListener("click", (event) => {
    setPluginSourceEnabled(event.currentTarget.dataset.disablePluginSource, false).catch(() => render());
  });
  app.querySelector(".modal-panel [data-install-app]")?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    render();
  });
  app.querySelectorAll("[data-start-game]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.restartSessionKey) clearGameSessionByKey(button.dataset.restartSessionKey);
      startPendingGame(collectSetupValuesFromModal(game));
    });
  });
  app.querySelector("[data-resume-start-key]")?.addEventListener("click", (event) => {
    resumeSessionByKey(event.currentTarget.dataset.resumeStartKey);
  });
  app.querySelector("[data-result-close]")?.addEventListener("click", () => {
    state.modal = "";
    state.resultSummary = null;
    renderModal();
  });
  app.querySelector("[data-resume-game]")?.addEventListener("click", closeModal);
  app.querySelector("[data-confirm-restart]")?.addEventListener("click", confirmCurrentGameRestart);
  app.querySelector("[data-pause-lobby]")?.addEventListener("click", () => {
    setState({ currentGame: "", modal: "", pendingGame: "", resultSummary: null });
  });
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
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.skin = state.theme;
  const activeGame = state.currentGame ? findAvailableGame(state.currentGame) : null;
  if (activeGame?.capabilities?.fullscreen) {
    document.documentElement.dataset.playMode = "immersive";
  } else {
    delete document.documentElement.dataset.playMode;
  }
  if (state.currentGame) {
    if (renderedGameId !== state.currentGame || !cleanupGame) {
      gameLoadToken += 1;
      if (cleanupGame) cleanupGame();
      cleanupGame = null;
      renderedGameId = state.currentGame;
      renderGame();
    } else {
      renderModal();
    }
    return;
  }

  syncGameStyleSheets([]);
  if (cleanupGame) {
    gameLoadToken += 1;
    cleanupGame();
    cleanupGame = null;
  }
  renderedGameId = "";
  if (state.view === "achievements") renderAchievementPage();
  else if (state.view === "history") renderHistoryPage();
  else if (state.view === "favorites") renderFavoritesPage();
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

refreshPluginSources({ cacheEnabled: true });
