import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pluginCatalog } from "../src/games/catalog.js";
import { normalizeGameManifest } from "../src/platform/game-plugin.js";
import { normalizePluginSourceConfig } from "../src/platform/plugin-sources.js";

const sourceConfigUrl = new URL("../public/plugin-sources.json", import.meta.url);

function readJson(url) {
  return readFile(url, "utf8").then((text) => JSON.parse(text));
}

function resolveCatalogAsset(catalogUrl, path) {
  return new URL(path, catalogUrl);
}

function assertFile(url, label, failures) {
  if (url.protocol !== "file:") return;
  if (!existsSync(url)) failures.push(`${label} 不存在：${fileURLToPath(url)}`);
}

function checkJavaScript(url, failures) {
  if (url.protocol !== "file:" || !url.pathname.endsWith(".js")) return;
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(url)], { stdio: "inherit" });
  if (result.status !== 0) failures.push(`JS 语法检查失败：${fileURLToPath(url)}`);
}

const failures = [];
const sourceConfig = normalizePluginSourceConfig(await readJson(sourceConfigUrl));
const knownIds = new Set(pluginCatalog.map((game) => game.id));
const externalIds = new Set();
let catalogs = 0;
let externalGames = 0;

for (const source of sourceConfig.sources) {
  if (source.type !== "url" || !source.url) continue;
  const catalogUrl = new URL(source.url, sourceConfigUrl);
  assertFile(catalogUrl, `${source.name} catalog`, failures);
  if (!existsSync(catalogUrl)) continue;

  catalogs += 1;
  const catalog = await readJson(catalogUrl);
  const games = Array.isArray(catalog.games) ? catalog.games : [];
  externalGames += games.length;

  for (const game of games) {
    let manifest;
    try {
      manifest = normalizeGameManifest({ source: "url", ...game });
    } catch (error) {
      failures.push(`${source.name} manifest 无效：${error.message}`);
      continue;
    }

    if (knownIds.has(manifest.id)) failures.push(`外部插件 id 与内置游戏冲突：${manifest.id}`);
    if (externalIds.has(manifest.id)) failures.push(`外部插件 id 重复：${manifest.id}`);
    externalIds.add(manifest.id);

    for (const asset of manifest.precacheAssets) {
      const assetUrl = resolveCatalogAsset(catalogUrl, asset);
      assertFile(assetUrl, `${manifest.id} asset`, failures);
      checkJavaScript(assetUrl, failures);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Plugin catalogs OK: ${catalogs} catalog(s), ${externalGames} external game(s)`);
