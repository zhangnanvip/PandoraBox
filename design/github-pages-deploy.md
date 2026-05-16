# GitHub Pages 部署说明

这个项目是纯静态网页，可以直接部署到 GitHub Pages。部署后 iPhone 可用 Safari 打开 HTTPS 地址，并通过“分享 -> 添加到主屏幕”安装成主屏幕 Web App。

## 准备仓库

如果当前目录还不是 Git 仓库，先初始化：

```bash
git init
git add .
git commit -m "Prepare GitHub Pages PWA deployment"
git branch -M main
```

在 GitHub 新建一个仓库，例如 `PandoraBox`，然后把本地代码推上去：

```bash
git remote add origin git@github.com:zhangnanvip/PandoraBox.git
git push -u origin main
```

## 开启 GitHub Pages

1. 打开 GitHub 仓库页面。
2. 进入 `Settings -> Pages`。
3. `Build and deployment` 的 `Source` 选择 `GitHub Actions`。
4. 回到 `Actions`，等待 `Deploy to GitHub Pages` 运行完成。

完成后页面地址通常是：

```text
https://<your-name>.github.io/PandoraBox/
```

当前仓库对应的地址会是：

```text
https://zhangnanvip.github.io/PandoraBox/
```

## iPhone 安装

1. 用 iPhone Safari 打开部署后的 HTTPS 地址。
2. 点击分享按钮。
3. 选择“添加到主屏幕”。
4. 从主屏幕图标进入游戏大厅。

首次打开需要联网加载资源；之后 Service Worker 会缓存核心文件，支持离线打开已缓存的游戏大厅。
