import { defineUrlGame } from "./game-plugin.js";

export const PLUGIN_SOURCE_CONFIG_URL = new URL("../../public/plugin-sources.json", import.meta.url);

export const DEFAULT_PLUGIN_SOURCE_STATE = {
  schemaVersion: 1,
  allowRemote: false,
  sources: [
    {
      id: "builtin",
      name: "内置游戏包",
      type: "builtin",
      enabled: true,
      trust: "bundled"
    }
  ],
  constraints: {
    apiVersion: 1,
    remoteCodeDefault: "disabled",
    allowedProtocols: ["https:", "http:"],
    requireUserEnablement: true,
    requireManualReview: true
  },
  loaded: false,
  error: ""
};

function asArray(value, fallback = []) {
  return Array.isArray(value) ? value.filter(Boolean) : fallback;
}

function escapeText(value, fallback = "") {
  return String(value || fallback)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeSlug(value, fallback = "") {
  const text = String(value || "");
  return /^[a-z0-9][a-z0-9-]*$/.test(text) ? text : fallback;
}

function safeCapabilityKey(value) {
  const text = String(value || "");
  return /^[a-z][a-zA-Z0-9]*$/.test(text) ? text : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeBooleanCapabilities(capabilities = {}) {
  if (!capabilities || typeof capabilities !== "object") return {};
  return Object.fromEntries(
    Object.entries(capabilities)
      .filter(([, value]) => typeof value === "boolean")
      .map(([key, value]) => [safeCapabilityKey(key), value])
      .filter(([key]) => key)
  );
}

function normalizeSource(source) {
  if (!source || typeof source !== "object") return null;
  if (!source.id || !source.name || !source.type) return null;
  return {
    id: String(source.id),
    name: String(source.name),
    type: source.type === "builtin" ? "builtin" : "url",
    baseEnabled: source.enabled === true,
    enabled: source.enabled === true,
    discoverable: source.discoverable === true,
    url: source.url || "",
    trust: source.trust || "manual-review",
    catalog: null
  };
}

function applySourceOverrides(config, sourceOverrides = {}) {
  if (!sourceOverrides || typeof sourceOverrides !== "object") return config;

  return {
    ...config,
    sources: config.sources.map((source) => {
      const override = sourceOverrides[source.id];
      if (!override || source.type === "builtin") return source;
      return {
        ...source,
        enabled: override.enabled === true,
        enabledByUser: override.enabled === true
      };
    })
  };
}

export function normalizePluginSourceConfig(config) {
  if (!config || typeof config !== "object") return DEFAULT_PLUGIN_SOURCE_STATE;
  const sources = asArray(config.sources)
    .map(normalizeSource)
    .filter(Boolean);

  return {
    ...DEFAULT_PLUGIN_SOURCE_STATE,
    schemaVersion: Number(config.schemaVersion) || 1,
    allowRemote: config.allowRemote === true,
    sources: sources.length ? sources : DEFAULT_PLUGIN_SOURCE_STATE.sources,
    constraints: {
      ...DEFAULT_PLUGIN_SOURCE_STATE.constraints,
      ...(config.constraints && typeof config.constraints === "object" ? config.constraints : {})
    },
    loaded: true,
    error: ""
  };
}

function normalizeLoadOptions(input) {
  if (typeof input === "function") {
    return {
      fetcher: input,
      sourceOverrides: {}
    };
  }

  return {
    fetcher: input?.fetcher || fetch,
    sourceOverrides: input?.sourceOverrides || {}
  };
}

function canDiscoverSource(source, config) {
  if (source.type !== "url" || !source.url) return false;
  if (source.enabled) return true;
  return source.discoverable === true && config.allowRemote !== true;
}

function normalizeGamePreview(game) {
  const styleSheets = asArray(game?.styleSheets);
  const visualStyleSheets = asArray(game?.visualStyles).flatMap((style) => asArray(style?.styleSheets));
  return {
    id: safeSlug(game?.id, "unknown"),
    title: escapeText(game?.title, game?.id || "未命名游戏"),
    subtitle: escapeText(game?.subtitle, ""),
    version: escapeText(game?.version, "0.1.0"),
    status: escapeText(game?.status, "preview"),
    category: safeSlug(game?.category, "quick"),
    modeSupport: asArray(game?.modeSupport).map((mode) => safeSlug(mode, "")).filter(Boolean),
    difficultySupport: asArray(game?.difficultySupport).map((difficulty) => safeSlug(difficulty, "")).filter(Boolean),
    capabilities: normalizeBooleanCapabilities(game?.capabilities),
    assets: unique([
      game?.entry,
      game?.icon,
      ...styleSheets,
      ...visualStyleSheets,
      ...asArray(game?.assets),
      ...asArray(game?.precacheAssets)
    ]).length
  };
}

function normalizeDiscoveredCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") {
    return { loaded: false, games: 0, title: "", error: "插件目录格式无效" };
  }
  const games = asArray(catalog.games);
  return {
    loaded: true,
    games: games.length,
    loadableGames: 0,
    title: escapeText(catalog.name || catalog.sourceId || "插件目录"),
    description: escapeText(catalog.description || ""),
    gamePreviews: games.map(normalizeGamePreview),
    error: "",
    blocked: "",
    loadErrors: [],
    registrations: []
  };
}

function resolvedAsset(value, baseUrl) {
  return value ? new URL(value, baseUrl).toString() : value;
}

function resolveManifestUrls(game, catalogUrl) {
  return {
    ...game,
    entry: resolvedAsset(game.entry, catalogUrl),
    icon: resolvedAsset(game.icon, catalogUrl),
    styleSheets: asArray(game.styleSheets).map((asset) => resolvedAsset(asset, catalogUrl)),
    visualStyles: asArray(game.visualStyles).map((style) => ({
      ...style,
      styleSheets: asArray(style?.styleSheets).map((asset) => resolvedAsset(asset, catalogUrl))
    })),
    assets: asArray(game.assets).map((asset) => resolvedAsset(asset, catalogUrl)),
    precacheAssets: asArray(game.precacheAssets).map((asset) => resolvedAsset(asset, catalogUrl))
  };
}

function normalizeVisualStyles(styles) {
  return asArray(styles)
    .map((style) => ({
      value: safeSlug(style?.value, ""),
      label: escapeText(style?.label, ""),
      styleSheets: asArray(style?.styleSheets).map((asset) => String(asset || "")).filter(Boolean)
    }))
    .filter((style) => style.value && style.label);
}

function normalizeSetupFields(fields) {
  return asArray(fields).map((field) => ({
    ...field,
    id: safeSlug(field?.id, ""),
    label: escapeText(field?.label, ""),
    defaultValue: escapeText(field?.defaultValue, ""),
    options: asArray(field?.options)
      .map((option) => ({
        value: escapeText(option?.value, ""),
        label: escapeText(option?.label, "")
      }))
      .filter((option) => option.value && option.label)
  })).filter((field) => field.id && field.label && field.options.length);
}

function normalizeExternalManifest(game, catalogUrl) {
  const manifest = resolveManifestUrls(game, catalogUrl);
  return {
    ...manifest,
    title: escapeText(manifest.title, manifest.id),
    subtitle: escapeText(manifest.subtitle, ""),
    tag: escapeText(manifest.tag, "扩展游戏"),
    category: safeSlug(manifest.category, "quick"),
    secondaryCategories: asArray(manifest.secondaryCategories).map((item) => safeSlug(item, "")).filter(Boolean),
    complexity: escapeText(manifest.complexity, "中等"),
    accent: safeSlug(manifest.accent, "sky"),
    rules: asArray(manifest.rules).map((rule) => escapeText(rule)),
    styleSheets: asArray(manifest.styleSheets).map((asset) => String(asset || "")).filter(Boolean),
    visualStyles: normalizeVisualStyles(manifest.visualStyles),
    defaultVisualStyle: safeSlug(manifest.defaultVisualStyle, ""),
    setupFields: normalizeSetupFields(manifest.setupFields)
  };
}

function canLoadCatalogGames(catalogUrl, source, config) {
  if (!source.enabled) return false;
  const sameOrigin = catalogUrl.origin === PLUGIN_SOURCE_CONFIG_URL.origin;
  if (sameOrigin || catalogUrl.protocol === "file:") return true;

  const allowedProtocols = asArray(config.constraints?.allowedProtocols, DEFAULT_PLUGIN_SOURCE_STATE.constraints.allowedProtocols);
  return config.allowRemote === true && allowedProtocols.includes(catalogUrl.protocol);
}

function normalizeLoadableCatalog(catalog, catalogUrl, source, config) {
  const base = normalizeDiscoveredCatalog(catalog);
  if (!base.loaded) return base;

  const canLoad = canLoadCatalogGames(catalogUrl, source, config);
  if (!canLoad) {
    return {
      ...base,
      blocked: source.enabled ? "扩展源未通过加载策略" : ""
    };
  }

  const loadErrors = [];
  const registrations = asArray(catalog.games).flatMap((game) => {
    try {
      return [defineUrlGame(normalizeExternalManifest(game, catalogUrl), catalogUrl.toString())];
    } catch (error) {
      loadErrors.push(escapeText(`${game?.id || "unknown"}：${error?.message || "Manifest 无效"}`));
      return [];
    }
  });

  return {
    ...base,
    loadableGames: registrations.length,
    loadErrors,
    registrations
  };
}

async function discoverSourceCatalog(source, config, fetcher) {
  if (!canDiscoverSource(source, config)) return source;
  try {
    const catalogUrl = new URL(source.url, PLUGIN_SOURCE_CONFIG_URL);
    const response = await fetcher(catalogUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`目录读取失败：${response.status}`);
    return {
      ...source,
      catalog: normalizeLoadableCatalog(await response.json(), catalogUrl, source, config)
    };
  } catch (error) {
    return {
      ...source,
      catalog: {
        loaded: false,
        games: 0,
        title: "",
        error: error?.message || "目录读取失败"
      }
    };
  }
}

export async function loadPluginSourceState(options = {}) {
  const { fetcher, sourceOverrides } = normalizeLoadOptions(options);
  try {
    const response = await fetcher(PLUGIN_SOURCE_CONFIG_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`插件源配置读取失败：${response.status}`);
    const config = applySourceOverrides(normalizePluginSourceConfig(await response.json()), sourceOverrides);
    return {
      ...config,
      sources: await Promise.all(config.sources.map((source) => discoverSourceCatalog(source, config, fetcher)))
    };
  } catch (error) {
    return {
      ...DEFAULT_PLUGIN_SOURCE_STATE,
      loaded: false,
      error: error?.message || "插件源配置读取失败"
    };
  }
}

export function summarizePluginSources(pluginSources = DEFAULT_PLUGIN_SOURCE_STATE) {
  const sources = asArray(pluginSources.sources, DEFAULT_PLUGIN_SOURCE_STATE.sources);
  return {
    total: sources.length,
    enabled: sources.filter((source) => source.enabled).length,
    discoveredGames: sources.reduce((sum, source) => sum + (source.catalog?.games || 0), 0),
    loadableGames: sources.reduce((sum, source) => sum + (source.catalog?.loadableGames || 0), 0),
    remoteEnabled: pluginSources.allowRemote && sources.some((source) => source.type === "url" && source.enabled),
    remoteAvailable: sources.some((source) => source.type === "url"),
    loaded: pluginSources.loaded === true,
    error: pluginSources.error || ""
  };
}

export function collectEnabledPluginRegistrations(pluginSources = DEFAULT_PLUGIN_SOURCE_STATE) {
  return asArray(pluginSources.sources, DEFAULT_PLUGIN_SOURCE_STATE.sources)
    .flatMap((source) => asArray(source.catalog?.registrations));
}
