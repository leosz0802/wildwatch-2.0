# 荒野守望微信小游戏

Canvas 单入口微信小游戏。当前版本聚焦“自然保护区卫士”：玩家维护保护区安全、水源、草场、补给和动物信任，通过巡护结算、动物对白、沙盘状态和物资运营感知一座会变化的森林。

当前玩法加入了剧情任务引导和保护区社交联动：每日任务会给出动物求助、推荐操作和奖励；好友/世界保护区的加固、回收、告警和水源修复会影响动物迁移、回收物供给与市场价格。

保护区市值统一按“等级基础值 + 实际动物总量”核算。前 200 只每只计 18，201–500 只每只计 12，500 只以上每只计 8；客户端、微信好友榜和世界榜使用同一公式，旧 `rating` 不再直接决定排名。

微信好友榜使用 `scope.WxFriendInteraction` 由用户点击授权，并通过 `open-data/` 开放数据域读取共同玩过本游戏的好友云数据。主域只上传自己的保护区名称、市值、等级和动物总量，不读取好友名单。

好友素材交换另行使用 `scope.interactedUserInfo` 与 `wx.getRelationFriendList`。客户端只把微信返回的加密数据交给服务器解密；服务器不保存原始 OpenID，而是用 HMAC 标识创建真实关系席位。好友尚未登录服务器时仍可先发送交换，回执会保留到对方首次连接；好友榜已有数据但互动关系列表为空时，界面会解释两种关系能力的区别并提供邀请或重新授权入口。

## 音频来源

- `Nature` by chribonn，原始文件 `chribonn-nature-216798.mp3`
- 来源：https://pixabay.com/sound-effects/nature-216798/
- 许可：Pixabay Content License
- 获取日期：2026-08-29
- `bgm-nature-loop.m4a` 为剪辑压缩后的自然氛围循环；五个 `sfx-*.m4a` 混入了同源的低音量滤波纹理。

## 打开方式

1. 打开微信开发者工具。
2. 选择“小游戏”导入本目录。
3. AppID 使用 `wx0ad30effd406ea13`。
4. 编译后从首页点击“接管保护区”。

详细说明见 `WECHAT_DEVTOOL_SETUP.md`。

## 当前结构

- `game.js`：小游戏入口。
- `js/game.js`：Canvas UI、沙盘、弹窗、点击和动画。
- `js/simulator.js`：每日巡护结算与保护区数值变化。
- `js/forestDirector.js`：本地 AI 森林导演，把事实数据转成动物视角。
- `js/world.js`：保护区、动物 NPC、联赛和初始世界。
- `assets/art/core-map-anime-v1.jpg`：首包清新日漫风沙盘地图；使用微信端兼容的基线 JPEG。
- `assets/art/core-sprites-atlas.png`：首包动物与兜底图集。
- `assets/art/ui-v3/icons/`：Manus v3 独立 UI icon，首包运行使用。

## 资源策略

首包必须是完整游戏效果，不使用占位图：

- 首包保留 `core-map-anime-v1.jpg`、`core-sprites-atlas.png` 和 `ui-v3/icons/`。
- 稳定版工程不再保留高清源图、旧大图集和临时交接包。
- 如果后续要接动态高清美术，请从外部 Manus/美术源包重新生成并上传远程资源，不要把源图重新塞回小游戏工程。

高级界面纹理由远程配置中的 `assets.premiumUiAtlas` 下发。图集规格为 `1536×512`：从左到右依次放置 `512×512` 的无缝羊皮纸、深绿皮革、黄铜纹理；建议 JPG/WebP、单图控制在 800KB 内。配置示例：

```json
{
  "assets": {
    "premiumUiAtlas": {
      "url": "https://wild.hubao.tv/assets/premium-ui-v1.jpg",
      "version": "premium-ui-v1"
    }
  }
}
```

客户端会下载并缓存图集；下载失败或离线时自动使用 Canvas 材质，不影响布局、好友榜、滚动和操作。

生存素材的 12 个独立物件使用远程 `assets.wildernessMaterialAtlas`，按 `4×3` 等分裁切。发布时将
`server/wild-api/assets/wilderness-materials-atlas-v1.webp` 复制到
`/var/lib/wild-guard-api/assets/`，并同步部署 `server/wild-api/config/default.json`。该 WebP 不进入小游戏包；
下载失败时客户端会按素材 ID 绘制 12 种不同的轻量兜底图形，不再回退到重复的通用叶子、警报器或水滴。

动物头像图集也通过 `assets.animalPortraitAtlas` 动态缓存，服务器文件为
`server/wild-api/assets/animal-portraits-atlas-v4.jpg`。离线时使用现有 Canvas 卡通动物头像，因此首包不携带这张 100KB+ 图集。

## 回归检查

在项目目录执行：

```bash
node scripts/full-regression-check.js
```

该入口会分组执行语法、UI 遮挡/字号、数值循环、地图动物、AI 对白、社交联赛、素材引用和性能检查。需要定位单项问题时，再单独运行 `scripts/` 下对应检查脚本。
