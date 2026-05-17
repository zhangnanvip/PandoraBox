# PandoraBox 游戏插件架构

## 目标

每个游戏独立交付：大厅只读取游戏清单，用户点击游戏后才加载对应入口。首版入口来自本地 ES module，后续可以扩展到远程 manifest + 动态下载。

视觉系统分成两层：

- `interfaceThemes` 只负责大厅、设置页、弹窗、按钮等平台外壳。
- `visualStyles` 由每个游戏在 manifest 中声明，负责棋盘、角色、弹幕、砖块等玩法内元素。

这样动作街机可以保持经典像素/街机风，棋类可以继续使用国风棋盘，新增游戏也不需要被全局皮肤包强行改造。

## 当前落地

```text
src/platform/game-plugin.js    插件协议、manifest 标准化、入口加载
src/games/catalog.js           游戏注册表，只暴露元信息和异步 loader
src/games/<game>/game.js       独立游戏实现，导出 mount(root, context)
src/games/arcade/*.js          动作街机类共享视觉/输入辅助，不属于全局界面主题
public/games/<type>/...        游戏自己的图标与素材目录
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
  visualStyles: [
    { value: "guofeng-board", label: "国风棋盘", styleSheets: ["./src/styles/game-skins/guofeng-board.css"] }
  ],
  defaultVisualStyle: "guofeng-board",
  icon: "./public/skins/guofeng-ink/icons/reversi.svg",
  assets: [],
  styleSheets: [],
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
  theme: "guofeng",
  visualStyle: "guofeng-board",
  options: {
    boardSize: "4",
    visualStyle: "guofeng-board"
  },
  labels: {
    mode: "单人对弈",
    difficulty: "中等",
    visualStyle: "国风棋盘"
  },
  playSound: (name) => {},
  reportResult: (result) => {}
}
```

`options` 来自开局弹窗里的游戏自定义字段；`theme` 只表示当前界面主题；`visualStyle` 表示当前游戏内视觉样式。`playSound` 统一走平台音效和音量设置；`reportResult` 用来把胜负、完成、分数等结果写入大厅进度统计。

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
2. 在 `src/games/catalog.js` 里用 `defineLocalGame(manifest, loader)` 注册，并声明适合自己的 `visualStyles`。
3. 把图标、纹理等静态资源加入 `manifest.assets`；把游戏级 CSS 放进 `styleSheets` 或 `visualStyles[].styleSheets`。
4. 确认移动端尺寸、离线缓存、返回大厅时 cleanup 正常。
