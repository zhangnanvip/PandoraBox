import { categories, games, findCategory, findGame, getGameSections, loadGamePlugin } from "./games/catalog.js";
import { configureSound, playResultSound, playSound as playFeedbackSound } from "./platform/sound.js";
import { skins, skinOrder } from "./theme/skins.js";
import { loadState, saveState } from "./utils/storage.js";

const app = document.querySelector("#app");

const preferences = loadState("preferences", {
  difficulty: "medium",
  mode: "ai",
  skin: "guofeng",
  sound: true,
  volume: 70,
  gameOptions: {}
});
const savedProgress = loadState("progress", {});

const state = {
  currentGame: "",
  difficulty: preferences.difficulty || "medium",
  mode: preferences.mode || "ai",
  gameOptions: preferences.gameOptions && typeof preferences.gameOptions === "object" ? preferences.gameOptions : {},
  skin: skins[preferences.skin] ? preferences.skin : "guofeng",
  sound: preferences.sound !== false,
  volume: Number.isFinite(preferences.volume) ? preferences.volume : 70,
  modal: "",
  pendingGame: "",
  activeCategory: "all",
  progress: savedProgress && typeof savedProgress === "object" ? savedProgress : {},
  resultSummary: null
};

let cleanupGame = null;
let gameLoadToken = 0;
let installPrompt = null;

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

function syncSoundPreferences() {
  configureSound({ enabled: state.sound, volume: state.volume });
}

function persistPreferences() {
  saveState("preferences", {
    difficulty: state.difficulty,
    mode: state.mode,
    skin: state.skin,
    sound: state.sound,
    volume: state.volume,
    gameOptions: state.gameOptions
  });
  syncSoundPreferences();
}

syncSoundPreferences();

function persistProgress() {
  saveState("progress", state.progress);
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
  state.resultSummary = null;
  render();
}

function collectSetupValuesFromModal(game) {
  const values = {};
  app.querySelectorAll("[data-modal-option]").forEach((field) => {
    const id = field.dataset.modalOption;
    if (id) values[id] = field.value;
  });
  return {
    ...selectedGameOptions(game),
    ...values
  };
}

function startPendingGame(optionsOverride = null) {
  if (!state.pendingGame) return;
  const game = findGame(state.pendingGame);
  const mode = selectedModeFor(game);
  const difficulty = selectedDifficultyFor(game);
  const options = optionsOverride || selectedGameOptions(game);
  state.gameOptions = {
    ...state.gameOptions,
    [game.id]: options
  };
  recordGameStart(game, mode, difficulty);
  playFeedbackSound("start");
  setState({
    currentGame: game.id,
    mode,
    difficulty,
    modal: "",
    pendingGame: ""
  });
}

function icon(name) {
  const paths = {
    settings: '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.16 2.16 0 0 1-3.06 3.06l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.64V21.4a2.16 2.16 0 0 1-4.32 0v-.08a1.8 1.8 0 0 0-1.08-1.64 1.8 1.8 0 0 0-1.98.36l-.04.04a2.16 2.16 0 0 1-3.06-3.06l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.08H2.88a2.16 2.16 0 0 1 0-4.32h.08A1.8 1.8 0 0 0 4.6 8.52a1.8 1.8 0 0 0-.36-1.98l-.04-.04A2.16 2.16 0 0 1 7.26 3.44l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.36 2.2V2.12a2.16 2.16 0 0 1 4.32 0v.08a1.8 1.8 0 0 0 1.08 1.64 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.16 2.16 0 0 1 3.06 3.06l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.64 1.08h.08a2.16 2.16 0 0 1 0 4.32h-.08A1.8 1.8 0 0 0 19.4 15Z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    rules: '<path d="M6 4.5h9.2a2.8 2.8 0 0 1 2.8 2.8v12.2H8.8A2.8 2.8 0 0 1 6 16.7V4.5Z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M8 5v14l11-7L8 5Z"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/>',
    offline: '<path d="M6 19h12a4 4 0 0 0 .6-7.96A6.5 6.5 0 0 0 6 9.2 4.9 4.9 0 0 0 6 19Z"/><path d="m9 14 2.2 2.2L16 11"/>'
  };
  return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
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
  return {
    ...(state.gameOptions[game.id] || {}),
    ...setupOptions,
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

function renderSkinTabs() {
  return skinOrder.map((id) => {
    const skin = skins[id];
    const active = state.skin === id;
    const disabled = skin.status !== "ready";
    return `
      <button class="skin-tab ${active ? "is-active" : ""}" data-skin="${id}" ${disabled ? "disabled" : ""}>
        <span>${skin.name}</span>
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

function renderGameCard(game) {
  const category = findCategory(game.category);
  return `
    <article class="game-card accent-${game.accent}">
      <div class="game-card-top">
        <div>
          <span class="game-tag">${game.tag}</span>
          <h2>${game.title}</h2>
          <p>${game.subtitle}</p>
          <div class="game-meta">
            <span>${category.shortTitle}</span>
          </div>
          ${renderProgressPills(game, true)}
        </div>
        ${boardPreview(game)}
      </div>
      <button class="primary-button" data-prepare-game="${game.id}">${icon("play")} 开始对局</button>
    </article>
  `;
}

function renderGameSections() {
  const sections = getGameSections(state.activeCategory);
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
          <p class="intro">一方宣纸，十一种棋局。</p>
        </div>
        <div class="lobby-status">
          <span>${icon("offline")}可离线</span>
          <span>${games.length} 局游戏</span>
          <span>${skins[state.skin].name}</span>
        </div>
      </section>

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
  bindShellActions();
  renderModal();
}

function renderGame() {
  const game = findGame(state.currentGame);
  const token = gameLoadToken;
  const mode = selectedModeFor(game);
  const difficulty = selectedDifficultyFor(game);
  const options = selectedGameOptions(game);
  app.innerHTML = `
    <main class="app-frame play-frame">
      <header class="play-header">
        <button class="icon-button" id="back-button" aria-label="返回大厅">${icon("back")}</button>
        <div>
          <p class="eyebrow">正在对局</p>
          <h1>${game.title}</h1>
        </div>
        <div class="header-actions">
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

  loadGamePlugin(game.id)
    .then((plugin) => {
      if (token !== gameLoadToken) return;
      cleanupGame = plugin.mount(gameRoot, {
        difficulty,
        mode,
        options,
        labels: { difficulty: difficultyLabel[difficulty], mode: modeLabel[mode] },
        playSound: (name) => playFeedbackSound(name),
        reportResult: (result) => handleGameResult(game, result)
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
  const game = findGame(state.currentGame || state.pendingGame);

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
          <button class="primary-button wide-button" data-start-game>${icon("play")} 开始</button>
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
        </div>
        <ul class="modal-list">
          ${(game.rules || []).map((rule, index) => `<li><b>${index + 1}</b><span>${rule}</span></li>`).join("")}
        </ul>
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

  return {
    title: "设置",
    body: `
      <div class="settings-screen">
        <div>
          <span class="modal-label">皮肤包</span>
          <div class="skin-tabs compact">
            ${renderSkinTabs()}
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
          </div>
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

  const game = findGame(state.currentGame || state.pendingGame);
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
  app.querySelector("[data-result-close]")?.addEventListener("click", () => {
    state.modal = "";
    state.resultSummary = null;
    renderModal();
  });
  app.querySelector("[data-result-lobby]")?.addEventListener("click", () => {
    setState({ currentGame: "", modal: "", pendingGame: "", resultSummary: null });
  });
  app.querySelectorAll(".modal-panel [data-skin]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.disabled) setState({ skin: button.dataset.skin });
    });
  });
}

function render() {
  gameLoadToken += 1;
  if (cleanupGame) {
    cleanupGame();
    cleanupGame = null;
  }

  document.documentElement.dataset.skin = state.skin;
  if (state.currentGame) renderGame();
  else renderLobby();
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("../sw.js", import.meta.url)).catch(() => {});
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
