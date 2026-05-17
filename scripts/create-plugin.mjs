import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const catalogUrl = new URL("../public/plugins/local/catalog.json", import.meta.url);

function usage() {
  console.log("Usage: node scripts/create-plugin.mjs <id> <title> [category]");
  console.log("Example: node scripts/create-plugin.mjs maze-runner 迷宫逃脱 puzzle");
}

function titleCase(text) {
  return text
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function assertPluginId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error("插件 id 只能使用小写字母、数字和连字符，并且必须以字母或数字开头。");
  }
}

function gameTemplate(id, title) {
  const componentName = `mount${titleCase(id)}`;
  return `const GAME_TITLE = ${JSON.stringify(title)};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function ${componentName}(root, context = {}) {
  let score = 0;

  function finish() {
    context.playSound?.("win");
    context.reportResult?.({
      outcome: "complete",
      score,
      detail: \`\${GAME_TITLE} 插件模板已完成。\`
    });
  }

  function render() {
    root.innerHTML = \`
      <section class="game-panel game-status">
        <div>
          <strong>\${escapeHtml(GAME_TITLE)}</strong>
          <p class="game-note">插件模板 · \${context.labels?.difficulty || "中等"}</p>
        </div>
        <button class="primary-button" data-plugin-score>得分 \${score}</button>
      </section>
      <section class="game-panel">
        <p class="game-note">把这里替换成你的游戏画布、棋盘或交互界面。</p>
        <div class="settings-actions">
          <button class="secondary-button" data-plugin-add>加分</button>
          <button class="primary-button" data-plugin-finish>完成</button>
        </div>
      </section>
    \`;
    root.querySelector("[data-plugin-add]")?.addEventListener("click", () => {
      score += 10;
      context.playSound?.("tap");
      render();
    });
    root.querySelector("[data-plugin-finish]")?.addEventListener("click", finish);
  }

  render();

  return () => {
    root.innerHTML = "";
  };
}

export { ${componentName} as mount };
`;
}

function iconTemplate(title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${escapeXml(title)}">
  <rect x="10" y="10" width="76" height="76" rx="18" fill="#e8f3ef" stroke="#1f5f4a" stroke-width="5"/>
  <path d="M30 52h36M48 30v36" stroke="#1f5f4a" stroke-width="7" stroke-linecap="round"/>
  <circle cx="48" cy="48" r="26" fill="none" stroke="#d79d38" stroke-width="4" stroke-dasharray="8 7"/>
</svg>
`;
}

const [id, title = "", category = "quick"] = process.argv.slice(2);

if (!id || id === "--help" || id === "-h") {
  usage();
  process.exit(id ? 0 : 1);
}

assertPluginId(id);
if (!title.trim()) throw new Error("请提供插件游戏标题。");

const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
const games = Array.isArray(catalog.games) ? catalog.games : [];
if (games.some((game) => game.id === id)) throw new Error(`catalog 中已存在插件游戏：${id}`);

const pluginDirUrl = new URL(`../public/plugins/local/${id}/`, import.meta.url);
if (existsSync(pluginDirUrl)) throw new Error(`插件目录已存在：${pluginDirUrl.pathname}`);

await mkdir(pluginDirUrl, { recursive: true });
await writeFile(new URL("game.js", pluginDirUrl), gameTemplate(id, title), "utf8");
await writeFile(new URL("icon.svg", pluginDirUrl), iconTemplate(title), "utf8");

catalog.games = [
  ...games,
  {
    id,
    pluginId: `pandora.external.${id}`,
    pluginApiVersion: 1,
    version: "0.1.0",
    status: "preview",
    source: "url",
    entry: `./${id}/game.js`,
    title,
    subtitle: "新插件模板",
    tag: "插件游戏",
    category,
    secondaryCategories: ["quick"],
    complexity: "中等",
    modeSupport: ["solo"],
    difficultySupport: ["easy", "medium", "hard"],
    progressType: "score",
    visualStyles: [{ value: "classic-arcade", label: "经典街机" }],
    defaultVisualStyle: "classic-arcade",
    accent: "sky",
    icon: `./${id}/icon.svg`,
    assets: [`./${id}/icon.svg`],
    capabilities: {
      offline: true,
      fullscreen: false,
      sessionSave: false,
      touchControls: true,
      keyboardControls: true,
      staged: false,
      boss: false
    },
    rules: [
      "这是脚手架生成的插件模板。",
      "实现游戏逻辑后，请运行 node scripts/check-plugins.mjs 校验。"
    ]
  }
];

await writeFile(catalogUrl, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

console.log(`Created plugin ${id}`);
console.log(`- ${new URL("game.js", pluginDirUrl).pathname}`);
console.log(`- ${new URL("icon.svg", pluginDirUrl).pathname}`);
