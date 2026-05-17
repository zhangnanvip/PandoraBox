const CACHE_NAME = "pandora-box-v31";
const SCOPE_URL = new URL(self.registration.scope);

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./public/icon.svg",
  "./public/icon-180.png",
  "./public/icon-512.png",
  "./src/styles.css",
  "./src/main.js",
  "./src/platform/game-plugin.js",
  "./src/platform/sound.js",
  "./src/theme/skins.js",
  "./src/utils/storage.js",
  "./src/utils/random.js",
  "./src/games/catalog.js",
  "./src/games/gomoku/game.js",
  "./src/games/go/game.js",
  "./src/games/xiangqi/game.js",
  "./src/games/reversi/game.js",
  "./src/games/tictactoe/game.js",
  "./src/games/checkers/game.js",
  "./src/games/draughts/game.js",
  "./src/games/flying/game.js",
  "./src/games/sudoku/game.js",
  "./src/games/klotski/game.js",
  "./src/games/number-2048/game.js",
  "./src/games/arcade/classic-visuals.js",
  "./src/games/arcade/controls.js",
  "./src/games/tank-battle/game.js",
  "./src/games/space-shooter/game.js",
  "./src/games/snake/game.js",
  "./src/games/breakout/game.js",
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
  "./public/games/arcade/icons/tank-battle.svg",
  "./public/games/arcade/icons/space-shooter.svg",
  "./public/games/arcade/icons/snake.svg",
  "./public/games/arcade/icons/breakout.svg"
];
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
