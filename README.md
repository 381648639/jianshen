# 训练记录

这是一个本地优先的训练日志 PWA。训练数据保存在手机浏览器的 IndexedDB 里，服务器或静态托管站点不保存训练数据。

## 在电脑上预览

```powershell
node dev-server.js
```

然后打开：

```text
http://127.0.0.1:8766/
```

## 在 iPhone 上长期使用

iOS 的 PWA 需要通过 HTTPS 地址打开，才能添加到主屏幕并使用离线缓存。推荐方式是放到免费静态托管：

1. 把本目录上传到 GitHub 仓库。
2. 在 GitHub 仓库的 `Settings -> Pages` 开启 GitHub Pages。
3. 用 iPhone Safari 打开 GitHub Pages 给出的 HTTPS 地址。
4. 点 Safari 分享按钮，选择“添加到主屏幕”。
5. 以后从主屏幕图标打开，训练数据仍然只存在本机。

可选静态托管还有 Cloudflare Pages、Netlify、Vercel。它们只托管 `index.html`、`app.js`、`styles.css` 这些静态文件，不接收你的训练记录。

## 为什么不是直接把文件丢到 iPhone

直接从“文件”App 打开本地 HTML，不适合这个项目：

- service worker 不能稳定注册，离线 PWA 能力基本用不上。
- 本地文件页面的存储来源不稳定，长期数据安全性差。
- “添加到主屏幕”的体验和 HTTPS PWA 不一样。

如果完全不能使用任何在线静态托管，下一步应该改成原生 iOS App 或微信小程序；其中原生 iOS App 的本地数据可靠性最好。

## 数据备份

应用内“备份”页可以导出 JSON 文件。建议每周导出一次，并保存到 iCloud Drive 或其他你信任的位置。

## 更新 GitHub Pages 上的网页

如果你之前已经把项目传到 GitHub Pages，后续更新只需要覆盖文件。

### 方法一：GitHub 网页上传

1. 打开你的 GitHub 仓库。
2. 点 `Add file -> Upload files`。
3. 把本地改过的文件拖进去，通常是：

```text
index.html
styles.css
app.js
manifest.webmanifest
sw.js
icon.svg
README.md
```

4. 如果 GitHub 提示文件已存在，选择覆盖即可。
5. 页面底部填写提交说明，例如：

```text
update calendar style
```

6. 点 `Commit changes`。
7. 等 1-3 分钟，GitHub Pages 会自动更新。
8. iPhone Safari 打开网页后，如果还是旧样式，刷新页面；主屏幕 PWA 里也可以退出后重新打开。

### 方法二：命令行更新

如果这个目录已经关联了 GitHub 仓库：

```powershell
git status
git add index.html styles.css app.js manifest.webmanifest sw.js icon.svg README.md
git commit -m "update calendar style"
git push
```

推送完成后，GitHub Pages 会自动发布新版。
