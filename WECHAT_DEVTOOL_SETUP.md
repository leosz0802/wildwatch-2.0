# 微信开发者工具配置说明

## 1. 导入项目

在微信开发者工具中：

1. 选择“小游戏”
2. 选择“导入项目”
3. 项目目录选择：

```text
/Users/edy/Documents/Codex/2026-07-10/z/outputs/forest-kingdom-ui-polish-v1
```

4. AppID 已配置为 `wx0ad30effd406ea13`
5. 编译模式选择普通编译即可

## 2. 已配置文件

- `project.config.json`：微信开发者工具项目配置
- `game.json`：小游戏基础配置，竖屏运行
- `game.js`：小游戏入口
- `js/game.js`：Canvas UI 和交互
- `js/storage.js`：本地存储
- `js/simulator.js`：本地每日结算

## 3. 推荐开发者工具设置

- 项目类型：小游戏
- 设备方向：竖屏
- URL 校验：开启
- ES6 转换：开启
- 云服务：暂不启用
- 分包：开启，章节插画位于 `chapter-assets`

## 4. 首包核心美术与动态资源

当前首包保留正式可玩的核心美术：

- `assets/art/core-map.jpg`
- `assets/art/core-sprites-atlas.png`

稳定版工程已经移除旧高清图集和高清源图，只保留运行必需资源。后续如果需要动态高清美术，请从外部 Manus/美术源包生成远程资源后再接入；首包本身已经是完整可玩的正式效果。

配置方式见：

```text
REMOTE_ART_ASSETS.md
```

## 5. 常见问题

### 提示 AppID 不合法

把 `project.config.json` 中的：

```json
"appid": "wx0ad30effd406ea13"
```

替换为你的微信小游戏 AppID，或确认当前 AppID 已加入你的微信开发者工具账号。

### 画面空白

先确认根目录选的是小游戏项目目录，不是上一层 `outputs`。

再执行本地检查：

```bash
node scripts/smoke-test.js
```

如果本地检查通过，但开发者工具空白，优先看开发者工具控制台是否有 `wx.createCanvas` 或 AppID 相关报错。

### 玩家输入策略

当前版本不提供玩家自由文本入口。巡护使用预设行动和图形路线，种群观察由系统自动生成并只读展示；请勿重新接入键盘、昵称、聊天或其他用户生成内容入口。

## 6. 游戏深度保护

项目已增加微信官方深度保护配置：

```text
code.fortify.config.json
```

- 30 个运行时 JS 全部纳入分级混淆。
- 数值、剧情、策略、收藏和动物系统使用高等级保护。
- 主渲染与模拟器使用中等级保护，兼顾帧率和体积。
- 入口、音效和运行时适配使用低等级保护。
- 12 个大于 20KB 的核心文件增加代码水印。
- `.js.map` 随加固结果保留，用于线上错误定位。

CLI 工具位于小游戏工程外：

```text
/Users/edy/Documents/Codex/2026-07-10/z/tools/wechat-code-fortify
```

先在公众平台配置代码上传公钥，再把对应私钥写入该目录的 `id_rsa.conf`。私钥禁止放进小游戏目录。

执行：

```bash
cd /Users/edy/Documents/Codex/2026-07-10/z/tools/wechat-code-fortify
npm run check
npm run fortify
```

成功后只从独立目录 `output/forest-kingdom-protected` 做开发者工具与真机回归，再上传审核。不要直接覆盖源码目录。

## 7. 下一步接真实 AI

替换点在：

```text
js/simulator.js
```

当前入口：

```js
simulateDay(command, state)
```

后续可替换为服务端接口：

```js
resolveDayViaAI(command, state)
```
