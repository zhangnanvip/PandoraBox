# 执匣人帧图资源目录

这个目录用于放置 `魔盒幸存者：百鬼夜行` 的主角序列帧资源。当前 Web 原型会优先绘制这里的帧图；图片加载中或加载失败时，会回退到 Canvas 程序绘制。

建议命名：

```text
public/games/survivor/heroes/{hero-id}/{state}-{index}.png
```

当前已接入的 Web 原型 SVG 帧：

| 角色 | 状态 |
| --- | --- |
| 沈灯 `ranger` | `idle` 4 帧，`move` 6 帧，`hit` 3 帧，`overdrive` 6 帧 |

状态约定：

- `idle`：无移动输入时的待机呼吸。
- `move`：拖动画布、键盘或虚拟方向输入时的移动。
- `hit`：短受击无敌窗口，用于明确“刚被打到”。
- `overdrive`：镇夜过载状态，优先级高于移动和受击。

新增角色如需首屏离线可用，需要把帧图路径加入 `src/games/catalog.js` 中 survivor 的 `assets`。
