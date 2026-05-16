# PandoraBox 游戏插件架构

## 目标

每个游戏独立交付：大厅只读取游戏清单，用户点击游戏后才加载对应入口。首版入口来自本地 ES module，后续可以扩展到远程 manifest + 动态下载。

## 当前落地

```text
src/platform/game-plugin.js    插件协议、manifest 标准化、入口加载
src/games/catalog.js           游戏注册表，只暴露元信息和异步 loader
src/games/<game>/game.js       独立游戏实现，导出 mount(root, context)
```

大厅使用 `games` 元信息渲染分类与卡片；进入游戏页时调用 `loadGamePlugin(id)`，动态导入对应游戏模块，再执行 `mount`。

## Manifest 协议

```js
{
  pluginApiVersion: 1,
  id: "reversi",
  title: "黑白棋",
  version: "0.1.0",
  status: "ready",
  category: "classic",
  secondaryCategories: ["quick"],
  modeSupport: ["ai", "local"],
  difficultySupport: ["easy", "medium", "hard"],
  progressType: "match",
  complexity: "中等",
  accent: "ink",
  icon: "./public/skins/guofeng-ink/icons/reversi.svg",
  assets: [],
  rules: []
}
```

## Game Entry 协议

游戏模块只需要暴露一个挂载函数：

```js
export function mount(root, context) {
  root.innerHTML = "...";
  return () => {
    // 清理计时器、事件、动画等资源
  };
}
```

`context` 首版包含：

```js
{
  mode: "ai",
  difficulty: "medium",
  labels: {
    mode: "单人对弈",
    difficulty: "中等"
  }
}
```

## 后续远程插件扩展

远程插件建议拆成两步：

1. 下载 `manifest.json`，校验 `pluginApiVersion`、`id`、`version`、`integrity`、`permissions`。
2. 用户确认后缓存入口模块与 `offlineAssets`，再把 manifest 写入本地插件索引。

远程 manifest 可扩展字段：

```js
{
  source: "remote",
  entry: "https://example.com/pandora-games/reversi/index.js",
  integrity: "sha256-...",
  permissions: ["storage"],
  offlineAssets: [
    "https://example.com/pandora-games/reversi/icon.svg"
  ]
}
```

安全边界：

- 插件只能通过 `mount(root, context)` 操作自己的根节点。
- 首版不开放网络、设备传感器、剪贴板等能力。
- 远程插件必须有版本号和完整性校验。
- 离线资源进入 Service Worker Cache 前需要成功下载并校验。

## 新游戏接入步骤

1. 新建 `src/games/<id>/game.js`，导出挂载函数。
2. 在 `src/games/catalog.js` 里用 `defineLocalGame(manifest, loader)` 注册。
3. 把图标、纹理等静态资源加入 `manifest.assets` 和 `sw.js` 缓存列表。
4. 确认移动端尺寸、离线缓存、返回大厅时 cleanup 正常。
