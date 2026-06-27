# 百鬼帧图资源目录

这个目录用于放置 `魔盒幸存者：百鬼夜行` 的敌人序列帧资源。当前游戏仍会在没有帧图时使用 Canvas 占位绘制；当 `src/games/survivor/game.js` 的 `ENEMY_FRAME_SETS` 中配置了 `frames` 路径后，会优先绘制这里的图片。

建议命名：

```text
public/games/survivor/enemies/{enemy-id}/{state}-{index}.png
```

示例：

```text
public/games/survivor/enemies/crawler/move-0.png
public/games/survivor/enemies/crawler/move-1.png
public/games/survivor/enemies/crawler/hit-0.png
public/games/survivor/enemies/crawler/death-0.png
```

当前已接入的 Web 原型 SVG 帧：

| 百鬼 | 状态 |
| --- | --- |
| 游魂 `crawler` | `move` 4 帧，`hit` 2 帧，`death` 5 帧 |
| 灯笼鬼 `bat` | `move` 4 帧，`hit` 2 帧，`death` 5 帧 |
| 纸人 `swarmer` | `move` 4 帧，`hit` 2 帧，`death` 5 帧 |
| 骨奴 `brute` | `move` 6 帧，`hit` 3 帧，`death` 6 帧 |
| 毒灯鬼 `spitter` | `move` 6 帧，`attack` 4 帧，`hit` 2 帧，`death` 5 帧 |
| 红伞妖 `bomber` | `move` 6 帧，`attack` 5 帧，`hit` 2 帧，`death` 7 帧 |
| 夜叉 `charger` | `move` 8 帧，`attack` 4 帧，`hit` 2 帧，`death` 5 帧 |
| 无头将 `shield` | `move` 6 帧，`hit` 3 帧，`death` 6 帧 |
| 缝尸匠 `warden` | `move` 6 帧，`attack` 4 帧，`hit` 2 帧，`death` 6 帧 |
| 戏伶鬼 `sniper` | `move` 6 帧，`attack` 5 帧，`hit` 2 帧，`death` 5 帧 |
| 画皮鬼 `elite` | `move` 8 帧，`attack` 5 帧，`hit` 3 帧，`death` 8 帧 |
| 通用鬼王 `boss` | `move` 8 帧，`attack` 6 帧，`phase` 6 帧，`hit` 3 帧，`death` 10 帧 |
| 尸山鬼王 `boss-titan` | `move` 8 帧，`attack` 6 帧，`phase` 6 帧，`hit` 3 帧，`death` 10 帧 |
| 鬼新娘 `boss-hive` | `move` 8 帧，`attack` 6 帧，`phase` 6 帧，`hit` 3 帧，`death` 10 帧 |
| 黑伞夜君 `boss-artillery` | `move` 8 帧，`attack` 6 帧，`phase` 6 帧，`hit` 3 帧，`death` 10 帧 |
| 百目判官 `boss-warden` | `move` 8 帧，`attack` 6 帧，`phase` 6 帧，`hit` 3 帧，`death` 10 帧 |

规格建议：

- 单帧透明 PNG 或 WebP。
- 推荐 96x96 或 128x128，四周保留 8 到 12 像素透明边。
- 锚点默认按 `ENEMY_FRAME_SETS.{id}.anchor` 处理，角色站位点建议在画面水平居中、垂直 58% 到 68%。
- 移动端第一批优先补 `move / hit / death`，远程、治疗、自爆、冲锋怪再补 `attack`。
- 如果希望首屏离线即可使用新增资源，需要把帧图路径加入 `src/games/catalog.js` 中 survivor 的 `assets` 或 `precacheAssets`。
