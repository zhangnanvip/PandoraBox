import { escapeAttr } from "../utils/common.js";
import { DEFAULT_PLUGIN_SOURCE_STATE, summarizePluginSources } from "../platform/plugin-sources.js";
import { capabilityLabel, difficultyLabel, modeLabel } from "./labels.js";

export function cacheStatusFor(source, cacheStatusMap = {}) {
  if (!source?.enabled) return { state: "disabled", text: "未启用" };
  const status = cacheStatusMap[source.id];
  if (!status) return { state: "pending", text: "等待缓存" };
  if (status.state === "ready") return { ...status, text: `资源已缓存 ${status.done}/${status.total}` };
  if (status.state === "empty") return { ...status, text: "无额外资源" };
  if (status.state === "unavailable") return { ...status, text: "当前环境不支持缓存" };
  if (status.state === "error") return { ...status, text: `缓存失败 ${status.done || 0}/${status.total || 0}` };
  return { ...status, text: "缓存中" };
}

export function renderPluginSourceGameList(source) {
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

export function renderPluginSourceAudit(source, cacheStatusMap = {}) {
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
  const cacheStatus = cacheStatusFor(source, cacheStatusMap);
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

export function renderPluginSourceList(pluginSources, cacheStatusMap = {}) {
  const summary = summarizePluginSources(pluginSources);
  const sources = pluginSources.sources || DEFAULT_PLUGIN_SOURCE_STATE.sources;
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
              ${source.enabled ? ` · ${cacheStatusFor(source, cacheStatusMap).text}` : ""}
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
