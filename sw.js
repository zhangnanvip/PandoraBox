import { precacheAssets } from "./src/games/catalog.js";

const CACHE_NAME = "pandora-box-v86";
const SCOPE_URL = new URL(self.registration.scope);

const CORE_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./public/plugin-sources.json",
  "./public/plugins/local/catalog.json",
  "./public/plugins/local/sample-dodge/icon.svg",
  "./public/plugins/local/sample-dodge/game.js",
  "./public/plugins/local/sample-dodge/skin.css",
  "./public/icon.svg",
  "./public/icon-180.png",
  "./public/icon-512.png",
  "./public/brand/pandora-sci-fi-mark.svg",
  "./src/styles.css",
  "./src/main.js",
  "./src/platform/game-plugin.js",
  "./src/platform/plugin-sources.js",
  "./src/platform/sound.js",
  "./src/theme/skins.js",
  "./src/theme/game-visuals.js",
  "./src/utils/storage.js",
  "./src/utils/random.js",
  "./src/games/catalog.js",
  "./src/games/arcade/bosses.js",
  "./src/games/arcade/collision.js",
  "./src/games/arcade/effects.js",
  "./src/games/arcade/feedback.js",
  "./src/games/arcade/progression.js",
  "./src/games/arcade/rewards.js",
  "./src/games/arcade/stages.js",
  "./public/skins/guofeng/textures/paper.svg",
  "./public/skins/guofeng/textures/wood.svg",
  "./public/skins/guofeng/ornaments/cloud-corner.svg",
  "./public/skins/guofeng/ornaments/seal.svg",
  "./public/skins/guofeng/icons/gomoku.svg",
  "./public/skins/guofeng/icons/go.svg",
  "./public/skins/guofeng/icons/xiangqi.svg",
  "./public/skins/guofeng/icons/checkers.svg",
  "./public/skins/guofeng/icons/flying.svg",
  "./public/skins/guofeng-ink/textures/xuan-paper.svg",
  "./public/skins/guofeng-ink/textures/ink-wash.svg",
  "./public/skins/guofeng-ink/ornaments/red-seal.svg",
  "./public/skins/guofeng-ink/ornaments/jade-ring.svg",
  "./public/skins/guofeng-ink/icons/gomoku.svg",
  "./public/skins/guofeng-ink/icons/go.svg",
  "./public/skins/guofeng-ink/icons/xiangqi.svg",
  "./public/skins/guofeng-ink/icons/reversi.svg",
  "./public/skins/guofeng-ink/icons/tictactoe.svg",
  "./public/skins/guofeng-ink/icons/checkers.svg",
  "./public/skins/guofeng-ink/icons/draughts.svg",
  "./public/skins/guofeng-ink/icons/flying.svg",
  "./public/skins/guofeng-ink/icons/sudoku.svg",
  "./public/skins/guofeng-ink/icons/klotski.svg",
  "./public/skins/guofeng-ink/icons/2048.svg",
];
const APP_SHELL = [...new Set([...CORE_SHELL, ...precacheAssets])];
const APP_SHELL_URLS = APP_SHELL.map((path) => new URL(path, SCOPE_URL).toString());
const INDEX_URL = new URL("./index.html", SCOPE_URL).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || caches.match(INDEX_URL))
      )
  );
});
