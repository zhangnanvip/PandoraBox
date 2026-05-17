# PandoraBox 游戏插件开发说明

PandoraBox 的游戏会被当作独立插件加载。内置游戏从 `src/games/catalog.js` 注册，外部游戏从插件源目录的 `catalog.json` 注册。默认外部源只会被发现，不会执行；用户在设置页完成审核并启用后，插件才会进入大厅。

## 目录结构

推荐一个插件源目录维护一个 `catalog.json`，每个游戏放在独立子目录：

```text
public/plugins/local/
  catalog.json
  sample-dodge/
    game.js
    icon.svg
```

`public/plugin-sources.json` 负责声明插件源：

```json
{
  "id": "local-extension",
  "name": "本地扩展包",
  "type": "url",
  "enabled": false,
  "discoverable": true,
  "url": "./plugins/local/catalog.json",
  "trust": "manual-review"
}
```

`enabled: false` 表示默认不加载执行；`discoverable: true` 表示设置页可以读取目录并展示可发现的游戏数量。

## catalog.json

`catalog.json` 至少需要：

```json
{
  "schemaVersion": 1,
  "sourceId": "local-extension",
  "name": "本地扩展示例包",
  "games": [
    {
      "id": "sample-dodge",
      "pluginApiVersion": 1,
      "version": "0.1.0",
      "source": "url",
      "entry": "./sample-dodge/game.js",
      "title": "示例躲避",
      "subtitle": "插件包模板",
      "tag": "插件示例",
      "category": "arcade",
      "modeSupport": ["solo"],
      "difficultySupport": ["easy", "medium", "hard"],
      "icon": "./sample-dodge/icon.svg",
      "assets": ["./sample-dodge/icon.svg"],
      "capabilities": {
        "offline": true,
        "fullscreen": true,
        "touchControls": true,
        "keyboardControls": true
      }
    }
  ]
}
```

路径都相对当前 `catalog.json` 解析。`id` 使用小写字母、数字和连字符，不能和内置游戏重复。

常用 `capabilities`：

- `offline`: 插件声明可离线运行
- `fullscreen`: 游戏更适合全屏游玩
- `sessionSave`: 支持保存未完成进度
- `touchControls`: 支持移动端触控
- `keyboardControls`: 支持键盘操作
- `staged`: 有闯关流程
- `boss`: 有 Boss 关或 Boss 模式

设置页审核插件源时会展示这些能力声明。用户确认启用后，PandoraBox 会尝试把 `entry`、`icon`、`assets` 和 `precacheAssets` 加入浏览器缓存；缓存成功后审核页会显示“资源已缓存”。

## 入口模块

入口模块必须导出 `mount(root, context)`：

```js
export function mount(root, context = {}) {
  root.innerHTML = "<section class=\"game-panel\">Hello game</section>";

  return () => {
    root.innerHTML = "";
  };
}
```

`context` 中会传入难度、模式、主题、音效、结算、存档等能力。插件应返回清理函数，离开游戏或重新渲染时会调用。

常用能力：

- `context.difficulty`: `easy`、`medium`、`hard`、`devil`
- `context.mode`: `solo`、`ai`、`local`
- `context.playSound(name)`: 播放反馈音
- `context.reportResult(result)`: 上报结算
- `context.saveSession(snapshot, meta)`: 保存进度，需 manifest 声明 `sessionSave`
- `context.clearSession()`: 清除进度
- `context.isPaused()`: 判断暂停弹窗是否打开

## 校验

提交前运行：

```bash
node scripts/check-syntax.mjs
node scripts/check-plugins.mjs
```

`check-plugins` 会检查：

- 插件源 catalog 是否存在
- `sourceId` 是否和插件源 id 匹配
- 游戏 id 是否重复或冲突
- entry、icon、assets 文件是否存在
- JS 语法是否有效
- entry 模块是否能导入并导出 `mount`

GitHub Pages 部署前也会自动执行 `npm run check`。
