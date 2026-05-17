const DEFAULT_MODES = ["ai", "local"];
const DEFAULT_DIFFICULTIES = ["easy", "medium", "hard"];
export const GAME_PLUGIN_API_VERSION = 1;

const DEFAULT_CAPABILITIES = {
  offline: true,
  fullscreen: false,
  sessionSave: false,
  touchControls: true,
  keyboardControls: true,
  staged: false,
  boss: false
};

function asArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value.filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCapabilities(capabilities = {}) {
  if (!capabilities || typeof capabilities !== "object") return DEFAULT_CAPABILITIES;
  return {
    ...DEFAULT_CAPABILITIES,
    ...capabilities
  };
}

export function normalizeGameManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError("Game manifest must be an object.");
  }
  if (!manifest.id || !manifest.title) {
    throw new TypeError("Game manifest requires id and title.");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
    throw new TypeError(`Game manifest id "${manifest.id}" must use lowercase letters, numbers, and hyphens.`);
  }
  if (manifest.pluginApiVersion && manifest.pluginApiVersion > GAME_PLUGIN_API_VERSION) {
    throw new TypeError(`${manifest.title} requires plugin API ${manifest.pluginApiVersion}, current API is ${GAME_PLUGIN_API_VERSION}.`);
  }
  const visualStyles = asArray(manifest.visualStyles)
    .filter((style) => style?.value && style?.label)
    .map((style) => ({
      ...style,
      styleSheets: unique(asArray(style.styleSheets))
    }));
  const styleSheets = unique(asArray(manifest.styleSheets));
  const visualStyleSheets = unique(visualStyles.flatMap((style) => style.styleSheets));
  const assets = unique([
    ...asArray(manifest.assets),
    ...styleSheets,
    ...visualStyleSheets
  ]);
  const precacheAssets = unique([
    manifest.entry,
    manifest.icon,
    ...assets,
    ...asArray(manifest.precacheAssets)
  ]);

  return {
    pluginApiVersion: GAME_PLUGIN_API_VERSION,
    pluginId: `local.${manifest.id}`,
    version: "0.1.0",
    status: "ready",
    source: "local",
    entry: "",
    category: "classic",
    secondaryCategories: [],
    complexity: "中等",
    modeSupport: DEFAULT_MODES,
    difficultySupport: DEFAULT_DIFFICULTIES,
    progressType: "match",
    assets: [],
    styleSheets: [],
    precacheAssets: [],
    capabilities: DEFAULT_CAPABILITIES,
    visualStyles: [],
    defaultVisualStyle: "",
    ...manifest,
    pluginId: manifest.pluginId || `local.${manifest.id}`,
    secondaryCategories: asArray(manifest.secondaryCategories),
    modeSupport: asArray(manifest.modeSupport, DEFAULT_MODES),
    difficultySupport: asArray(manifest.difficultySupport, DEFAULT_DIFFICULTIES),
    capabilities: normalizeCapabilities(manifest.capabilities),
    visualStyles,
    defaultVisualStyle: manifest.defaultVisualStyle || visualStyles[0]?.value || "",
    assets,
    styleSheets,
    precacheAssets
  };
}

export function defineLocalGame(manifest, loadEntry, options = {}) {
  if (typeof loadEntry !== "function") {
    throw new TypeError("Local game plugin requires a loader function.");
  }
  const source = options.source || manifest.source || "local";

  return {
    source,
    manifest: normalizeGameManifest({ source, ...manifest }),
    loadEntry
  };
}

export function defineUrlGame(manifest, baseUrl = globalThis.location?.href || "") {
  const normalized = normalizeGameManifest({ source: "url", ...manifest });
  if (!normalized.entry) {
    throw new TypeError(`${normalized.title} URL plugin requires an entry module.`);
  }

  return {
    source: "url",
    manifest: normalized,
    loadEntry: () => import(new URL(normalized.entry, baseUrl).toString())
  };
}

export function createGameRegistry(registrations) {
  const map = new Map();

  for (const registration of registrations) {
    const id = registration?.manifest?.id;
    if (!id) throw new TypeError("Game registration is missing a manifest id.");
    if (map.has(id)) throw new TypeError(`Duplicate game plugin id: ${id}`);
    map.set(id, registration);
  }

  const games = registrations.map((registration) => registration.manifest);
  const precacheAssets = unique(games.flatMap((game) => game.precacheAssets));

  return {
    games,
    manifests: games.map(({ rules, ...manifest }) => manifest),
    precacheAssets,
    find(id) {
      return games.find((game) => game.id === id) || games[0];
    },
    registrationFor(id) {
      return map.get(id) || map.get(games[0].id);
    },
    load(id) {
      return loadGamePlugin(this.registrationFor(id));
    }
  };
}

export async function loadGamePlugin(registration) {
  if (!registration) throw new Error("Game plugin is not registered.");

  const entry = await registration.loadEntry();
  const mount = typeof entry === "function" ? entry : entry?.mount;

  if (typeof mount !== "function") {
    throw new Error(`${registration.manifest.title} 插件没有导出 mount 方法。`);
  }

  return {
    ...registration.manifest,
    mount
  };
}
