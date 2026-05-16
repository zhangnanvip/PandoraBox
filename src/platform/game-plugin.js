const DEFAULT_MODES = ["ai", "local"];
const DEFAULT_DIFFICULTIES = ["easy", "medium", "hard"];

function asArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value.filter(Boolean);
}

export function normalizeGameManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError("Game manifest must be an object.");
  }
  if (!manifest.id || !manifest.title) {
    throw new TypeError("Game manifest requires id and title.");
  }

  return {
    pluginApiVersion: 1,
    version: "0.1.0",
    status: "ready",
    category: "classic",
    secondaryCategories: [],
    complexity: "中等",
    modeSupport: DEFAULT_MODES,
    difficultySupport: DEFAULT_DIFFICULTIES,
    progressType: "match",
    assets: [],
    ...manifest,
    secondaryCategories: asArray(manifest.secondaryCategories),
    modeSupport: asArray(manifest.modeSupport, DEFAULT_MODES),
    difficultySupport: asArray(manifest.difficultySupport, DEFAULT_DIFFICULTIES),
    assets: asArray(manifest.assets)
  };
}

export function defineLocalGame(manifest, loadEntry) {
  if (typeof loadEntry !== "function") {
    throw new TypeError("Local game plugin requires a loader function.");
  }

  return {
    source: "local",
    manifest: normalizeGameManifest(manifest),
    loadEntry
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
