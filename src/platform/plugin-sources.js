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
    url: source.url || "",
    trust: source.trust || "manual-review"
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

export async function loadPluginSourceState(fetcher = fetch) {
  try {
    const response = await fetcher(PLUGIN_SOURCE_CONFIG_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`插件源配置读取失败：${response.status}`);
    return normalizePluginSourceConfig(await response.json());
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
    remoteEnabled: pluginSources.allowRemote && sources.some((source) => source.type === "url" && source.enabled),
    remoteAvailable: sources.some((source) => source.type === "url"),
    loaded: pluginSources.loaded === true,
    error: pluginSources.error || ""
  };
}
