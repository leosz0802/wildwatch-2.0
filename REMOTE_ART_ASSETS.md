# 可选动态美术资源接入说明

当前稳定版工程已经精简为“首包完整可玩核心美术”。首包不是占位图，玩家第一次打开就能看到正式地图、动物和 UI icon。

动态下载能力仍保留在代码里，但稳定版项目内不再携带高清源图、旧大图集或图集生成脚本。后续如果要接远程高清美术，请从外部 Manus/美术源包重新生成资源，并上传到 HTTPS 资源域名。

## 首包包含

- `assets/art/core-map-anime-v1.jpg`
  - 约 241KB
  - 首页沙盘直接使用的清新日漫风保护区地图，保留六块清晰活动区和克制光影
- `assets/art/core-sprites-atlas.png`
  - 约 1MB
- `assets/art/ui-v3/icons/`
  - 当前运行版 UI 独立图标
- `assets/art/prologue/prologue-fog-v1.jpg`
  - 首次登录序章图
- `assets/art/animal-map-sprites-atlas-v2.png`
  - 沙盘动物图集，登录后立刻画在沙盘上

进入游戏后再下载（不进 4MiB 主包）：

- 设施图集 `facility-sprites-atlas-v4.png`
- 收藏物图集 `collection-items-atlas.png`

沙盘动物图集 `animal-map-sprites-atlas-v2.png` 留在主包，登录后立刻画在沙盘上。设施和收藏物部署在 `https://wild.hubao.tv/assets/`，登录页不请求；进入家园后走现有 `wx.downloadFile` 队列并缓存到用户目录。

## 稳定版不包含

- 旧高清一体图集
- 高清源图
- 旧 UI v2 图集
- Manus 交接 zip 或临时 handoff 目录
- 图集构建脚本

## 后续接入步骤

1. 在外部美术工程中生成远程高清图集，例如：

```text
forest-kingdom-art-atlas.png
```

2. 在微信公众平台/小游戏后台配置 `downloadFile` 合法域名。

3. 把远程地址填到：

```text
js/game.js
```

位置：

```js
const ART_ATLAS = {
  remote: {
    url: "https://你的域名/forest-kingdom/forest-kingdom-art-atlas.png"
  }
}
```

4. 如果更新美术但 URL 不变，修改同一段里的版本号：

```js
version: "savanna-v3-20260707"
```

版本变化后，玩家客户端会重新下载并覆盖缓存。

## 运行逻辑

- 游戏启动：先加载微信端兼容的 `core-map-anime-v1.jpg` + `core-sprites-atlas.png`，首屏就是正式美术效果。
- 检查缓存：如果本地已有同版本高清图集，直接切换。
- 没有缓存：使用 `wx.downloadFile` 下载远程图集。
- 下载成功：使用文件系统保存到用户目录，并记录到本地存储。
- 下载失败：继续使用首包核心美术，不阻塞游戏体验。

## 本地检查

```bash
node scripts/art-atlas-check.js
node scripts/remote-art-check.js
```
