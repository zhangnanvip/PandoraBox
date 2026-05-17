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

function normalizeSource(source) {
  if (!source || typeof source !== "object") return null;
  if (!source.id || !source.name || !source.type) return null;
  return {
    id: String(source.id),
    name: String(source.name),
    type: source.type === "builtin" ? "builtin" : "url",
    enabled: source.enabled === true,
    discoverable: source.discoverable === true,
    url: source.url || "",
    trust: source.trust || "manual-review",
    catalog: null
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

function canDiscoverSource(source, config) {
  if (source.type !== "url" || !source.url) return false;
  if (source.enabled) return true;
  return source.discoverable === true && config.allowRemote !== true;
}

function normalizeDiscoveredCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") {
    return { loaded: false, games: 0, title: "", error: "插件目录格式无效" };
  }
  return {
    loaded: true,
    games: asArray(catalog.games).length,
    loadableGames: 0,
    title: catalog.name || catalog.sourceId || "插件目录",
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
    assets: asArray(game.assets).map((asset) => resolvedAsset(asset, catalogUrl)),
    precacheAssets: asArray(game.precacheAssets).map((asset) => resolvedAsset(asset, catalogUrl))
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
      return [defineUrlGame(resolveManifestUrls(game, catalogUrl), catalogUrl.toString())];
    } catch (error) {
      loadErrors.push(`${game?.id || "unknown"}：${error?.message || "Manifest 无效"}`);
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

export async function loadPluginSourceState(fetcher = fetch) {
  try {
    const response = await fetcher(PLUGIN_SOURCE_CONFIG_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`插件源配置读取失败：${response.status}`);
    const config = normalizePluginSourceConfig(await response.json());
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
