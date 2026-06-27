import { categories, games, pluginCatalog, precacheAssets, findCategory, findGame, loadGamePlugin as loadCatalogGamePlugin } from "./games/catalog.js";
import { loadGamePlugin as loadRegisteredGamePlugin } from "./platform/game-plugin.js";
import { DEFAULT_PLUGIN_SOURCE_STATE, collectEnabledPluginRegistrations, loadPluginSourceState, summarizePluginSources } from "./platform/plugin-sources.js";
import { configureSound, playResultSound, playSound as playFeedbackSound } from "./platform/sound.js";
import { interfaceThemes, themeOrder } from "./theme/skins.js";
import { escapeAttr, escapeHtml, stableStringify } from "./utils/common.js";
import { trapFocus } from "./utils/focus-trap.js";
import { loadState, saveState } from "./utils/storage.js";
import { icon } from "./views/icons.js";
import { boardPreview } from "./views/previews.js";
import { difficultyLabel, modeLabel, outcomeLabel } from "./views/labels.js";
import {
  cacheStatusFor,
  renderPluginSourceAudit,
  renderPluginSourceList
} from "./views/plugin-sources-view.js";

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
  searchQuery: "",
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
let releaseFocusTrap = null;
let modalScrollY = 0;
let modalScrollLocked = false;
let modalBodyStyle = null;

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

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s·,，.。:：;；|/\\()[\]{}'"“”‘’_-]+/g, "");
}

function gameSearchText(game) {
  const category = findCategory(game.category);
  const secondaryCategories = (game.secondaryCategories || []).map((id) => findCategory(id)).filter(Boolean);
  return [
    game.id,
    game.title,
    game.subtitle,
    game.tag,
    game.complexity,
    category?.title,
    category?.shortTitle,
    ...secondaryCategories.flatMap((item) => [item.title, item.shortTitle]),
    ...(game.modeSupport || []).map((value) => modeLabel[value] || value),
    ...(game.difficultySupport || []).map((value) => difficultyLabel[value] || value),
    game.marketHeat?.label,
    game.marketHeat?.signal,
    ...(game.rules || [])
  ].filter(Boolean).join(" ");
}

function fuzzySearchScore(query, text) {
  const q = normalizeSearchText(query);
  const t = normalizeSearchText(text);
  if (!q || !t) return 0;
  const exactIndex = t.indexOf(q);
  if (exactIndex >= 0) return 1000 - exactIndex + q.length * 8;

  let score = 0;
  let qi = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) continue;
    score += lastMatch === ti - 1 ? 9 : 4;
    if (ti === 0 || t[ti - 1] === "-") score += 2;
    lastMatch = ti;
    qi += 1;
  }
  return qi === q.length ? score + q.length * 3 : 0;
}

function searchGames(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return availableGames()
    .map((game) => ({
      game,
      score: fuzzySearchScore(normalized, gameSearchText(game))
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta) return scoreDelta;
      const heatDelta = marketHeatScore(b.game) - marketHeatScore(a.game);
      if (heatDelta) return heatDelta;
      return a.game.title.localeCompare(b.game.title, "zh-Hans-CN");
    })
    .map((item) => item.game);
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
  lockPageScrollForModal();
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
  return cacheStatusFor(source, state.pluginCacheStatus);
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
    showToast(state.cacheNotice, { kind: "info" });
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
    showToast(state.cacheNotice, { kind: "success" });
    navigator.serviceWorker?.getRegistration?.().then((registration) => registration?.update?.()).catch(() => {});
  } catch (error) {
    state.cacheNotice = `清除缓存失败：${error?.message || "未知错误"}`;
    showToast(state.cacheNotice, { kind: "danger" });
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

function refreshLobbySearchResults() {
  const results = app.querySelector("[data-game-results]");
  if (!results) return;
  results.innerHTML = renderGameSections();
  bindGameStartActions(results);
  bindFavoriteActions(results);
}

function bindLobbySearch() {
  const input = app.querySelector("[data-game-search]");
  const clearButton = app.querySelector("[data-clear-search]");
  if (!input) return;
  const syncClearButton = () => {
    if (clearButton) clearButton.hidden = !normalizeSearchText(state.searchQuery);
  };
  input.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    syncClearButton();
    refreshLobbySearchResults();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.searchQuery) return;
    event.preventDefault();
    state.searchQuery = "";
    input.value = "";
    syncClearButton();
    refreshLobbySearchResults();
  });
  clearButton?.addEventListener("click", () => {
    state.searchQuery = "";
    input.value = "";
    input.focus();
    syncClearButton();
    refreshLobbySearchResults();
  });
  syncClearButton();
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

function option(value, label, selected) {
  return `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`;
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
    const badge = disabled ? "预留" : active ? "当前" : "切换";
    return `
      <button class="skin-tab ${active ? "is-active" : ""}" data-theme="${id}" ${disabled ? "disabled" : ""}>
        <span>${theme.name}</span>
        <small>${badge}</small>
      </button>
    `;
  }).join("");
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

function renderLobbySearch() {
  const query = state.searchQuery || "";
  const hasQuery = normalizeSearchText(query).length > 0;
  return `
    <section class="lobby-search" aria-label="搜索游戏">
      <label class="search-box">
        ${icon("search")}
        <input
          type="search"
          value="${escapeAttr(query)}"
          placeholder="搜索游戏、类型、玩法"
          autocomplete="off"
          data-game-search
        />
      </label>
      <button class="search-clear" type="button" data-clear-search ${hasQuery ? "" : "hidden"} aria-label="清空搜索">${icon("close")}</button>
    </section>
  `;
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
    <article class="card card--compact recent-activity accent-${game.accent}">
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
    <article class="card card--compact recent-activity favorite-activity accent-${game.accent}">
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
    <article class="card card--compact history-row accent-${game.accent}">
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
    <article class="card card--compact history-row favorite-row accent-${game.accent}">
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

function renderHeroCard(game) {
  if (!game) return "";
  const category = findCategory(game.category);
  const heat = game.marketHeat || {};
  const score = marketHeatScore(game);
  const gameTitle = escapeAttr(game.title);
  return `
    <article class="card card--hero accent-${game.accent}" tabindex="0" aria-label="${gameTitle} 热门推荐">
      <div class="hero-card-icon" aria-hidden="true">
        ${boardPreview(game)}
      </div>
      <div class="hero-card-copy">
        <span class="hero-card-eyebrow">热门推荐 · 热度 ${score}</span>
        <h2>${game.title}</h2>
        <p>${heat.signal || game.subtitle}</p>
        <div class="hero-card-tags">
          <span class="meta-pill">${game.tag}</span>
          <span class="meta-pill">${category.shortTitle}</span>
          <span class="meta-pill">🔥 ${score}</span>
        </div>
        <div class="hero-card-actions">
          <button class="primary-button" type="button" data-prepare-game="${escapeAttr(game.id)}" aria-label="开始${gameTitle}">${icon("play")} 立即开始</button>
        </div>
      </div>
    </article>
  `;
}

function pickHeroGame() {
  if (!["all", "hot"].includes(state.activeCategory)) return null;
  const candidates = availableGames().filter((game) => marketHeatScore(game) >= 95);
  if (!candidates.length) return null;
  return sortByMarketHeat(candidates)[0] || null;
}

function renderGameCard(game) {
  const category = findCategory(game.category);
  const favorite = isFavorite(game.id);
  const heatScore = marketHeatScore(game);
  const heatLabel = heatScore
    ? `<span class="meta-pill meta-pill--hot" aria-label="热度 ${heatScore}">🔥 ${heatScore}</span>`
    : "";
  return `
    <article class="card card--standard game-card accent-${game.accent}" tabindex="0">
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
            ${heatLabel}
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
  const query = state.searchQuery || "";
  if (normalizeSearchText(query)) {
    const matches = searchGames(query);
    const escapedQuery = escapeHtml(query.trim());
    return `
      <section class="game-section search-results-section" aria-label="搜索结果">
        <div class="game-section-head">
          <h2>搜索结果</h2>
          <span>${matches.length} 款</span>
        </div>
        ${matches.length ? `
          <div class="game-grid">
            ${matches.map(renderGameCard).join("")}
          </div>
        ` : `<p class="empty-note search-empty">没有找到“${escapedQuery}”，试试游戏名、分类或玩法关键词。</p>`}
      </section>
    `;
  }

  const sections = availableGameSections(state.activeCategory);
  const heroGame = pickHeroGame();
  const heroMarkup = renderHeroCard(heroGame);
  return `${heroMarkup}${sections.map((section) => `
    <section class="game-section" aria-label="${section.title}">
      <div class="game-section-head">
        <h2>${section.title}</h2>
        <span>${section.games.length} 款</span>
      </div>
      <div class="game-grid">
        ${section.games.map(renderGameCard).join("")}
      </div>
    </section>
  `).join("")}`;
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

      ${renderLobbySearch()}

      ${renderLobbyDashboard()}

      <section class="category-tabs" aria-label="游戏分类">
        ${renderCategoryTabs()}
      </section>

      <section class="game-library" aria-label="游戏大厅">
        <div class="game-results" data-game-results>
          ${renderGameSections()}
        </div>
      </section>
    </main>
  `;

  app.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => setState({ activeCategory: button.dataset.category, searchQuery: "" }));
  });
  app.querySelectorAll("[data-open-history]").forEach((button) => {
    button.addEventListener("click", openHistoryPage);
  });
  app.querySelectorAll("[data-open-favorites]").forEach((button) => {
    button.addEventListener("click", openFavoritesPage);
  });
  bindLobbySearch();
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
          <button class="icon-button small" data-open-modal="pause" aria-label="暂停">${icon("pause")}</button>
          ${game.capabilities?.fullscreen ? "" : `<button class="icon-button small" data-open-modal="rules" aria-label="规则">${icon("rules")}</button>`}
        </div>
      </header>

      <section id="game-root" class="game-root" data-game-id="${escapeAttr(game.id)}" data-skin="${escapeAttr(state.theme)}" data-visual-style="${escapeAttr(visualStyle)}"></section>
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
      body: renderPluginSourceAudit(source, state.pluginCacheStatus)
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
            <button class="secondary-button" data-open-modal="rules">${icon("rules")} 查看规则</button>
            <button class="secondary-button" data-open-modal="settings">${icon("settings")} 设置</button>
            <button class="secondary-button" data-open-modal="restart">${icon("restart")} 重开本局</button>
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
          ${result.extra ? `
          <div class="result-highlight">
            <span class="result-highlight-eyebrow">本局亮点</span>
            <strong>${result.extra}</strong>
          </div>` : ""}
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
          ${renderPluginSourceList(state.pluginSources, state.pluginCacheStatus)}
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

function modalVariant(name) {
  if (name === "result") return "full";
  if (["start", "rules", "feedback", "settings"].includes(name)) return "sheet";
  // restart / pause / offline / plugin-source 等紧凑确认场景
  return "dialog";
}

function ensureToastLayer() {
  let layer = document.querySelector(".toast-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "toast-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

function showToast(message, { kind = "info", duration = 3200 } = {}) {
  if (!message) return;
  const layer = ensureToastLayer();
  const el = document.createElement("div");
  el.className = `modal--toast modal--toast--${kind}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  const body = document.createElement("span");
  body.textContent = message;
  el.appendChild(body);
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-active"));
  window.setTimeout(() => {
    el.classList.remove("is-active");
    window.setTimeout(() => el.remove(), 280);
  }, duration);
}

function lockPageScrollForModal() {
  if (modalScrollLocked) return;
  modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  modalBodyStyle = {
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width
  };
  document.documentElement.classList.add("has-modal");
  document.body.classList.add("has-modal");
  document.body.style.position = "fixed";
  document.body.style.top = `-${modalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  modalScrollLocked = true;
}

function unlockPageScrollForModal() {
  if (!modalScrollLocked) return;
  document.documentElement.classList.remove("has-modal");
  document.body.classList.remove("has-modal");
  document.body.style.position = modalBodyStyle?.position || "";
  document.body.style.top = modalBodyStyle?.top || "";
  document.body.style.left = modalBodyStyle?.left || "";
  document.body.style.right = modalBodyStyle?.right || "";
  document.body.style.width = modalBodyStyle?.width || "";
  window.scrollTo(0, modalScrollY);
  modalScrollY = 0;
  modalScrollLocked = false;
  modalBodyStyle = null;
}

function renderModal() {
  if (releaseFocusTrap) {
    releaseFocusTrap();
    releaseFocusTrap = null;
  }
  app.querySelector(".modal-backdrop")?.remove();
  if (!state.modal) {
    unlockPageScrollForModal();
    return;
  }
  lockPageScrollForModal();

  const game = findAvailableGame(state.currentGame || state.pendingGame);
  const content = modalContent();
  const variant = modalVariant(state.modal);
  app.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop" role="presentation" data-close-modal>
      <section class="modal-panel modal--${variant}" role="dialog" aria-modal="true" aria-label="${content.title}">
        <div class="modal-head">
          <h2>${content.title}</h2>
          <button class="icon-button small" data-close-modal aria-label="关闭">${icon("close")}</button>
        </div>
        <div class="modal-body">
          ${content.body}
        </div>
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

  // 焦点陷阱：Tab/Shift+Tab 在面板内循环、ESC 关闭、关闭后焦点回到触发按钮
  const panel = app.querySelector(".modal-panel");
  if (panel) {
    releaseFocusTrap = trapFocus(panel, { onEscape: closeModal });
  }
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
