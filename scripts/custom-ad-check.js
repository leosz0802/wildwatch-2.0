const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { NATIVE_TEMPLATE_AD_CONFIG, NativeTemplateAdController } = require("../js/adSystem");

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeAd() {
  const ad = {
    style: {},
    onLoad(handler) { ad.loadHandler = handler; },
    onResize(handler) { ad.resizeHandler = handler; },
    onError(handler) { ad.errorHandler = handler; },
    show() { ad.showCount = (ad.showCount || 0) + 1; return Promise.resolve(); },
    hide() { ad.hideCount = (ad.hideCount || 0) + 1; },
    destroy() { ad.destroyCount = (ad.destroyCount || 0) + 1; }
  };
  return ad;
}

async function main() {
  let createCount = 0;
  let createOptions = null;
  let lastAd = null;
  const runtime = {
    getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667 }; },
    createCustomAd(options) {
      createCount += 1;
      createOptions = options;
      lastAd = makeAd();
      lastAd.style = options.style;
      return lastAd;
    }
  };
  const controller = new NativeTemplateAdController(runtime);

  assert.strictEqual(createCount, 0, "构造时不得创建原生广告，否则会盖住进入游戏和首页");
  assert.strictEqual(controller.instance, null, "未展示前不得挂原生触控层");
  assert.strictEqual(NATIVE_TEMPLATE_AD_CONFIG.placement, "lucky2");

  controller.setVisible(true);
  await flush();
  assert.strictEqual(createCount, 1, "进入物资页才允许创建原生广告");
  assert.strictEqual(createOptions.adUnitId, "adunit-9f2f2442a85b3c2a", "必须使用 lucky2 原生模板广告位");
  assert.strictEqual(createOptions.style.width, 320, "375 宽设备应保留两侧画布滑动通道");
  assert.strictEqual(createOptions.style.left, 28, "模板广告应在保留滑动通道后水平居中");
  assert.strictEqual(lastAd.showCount, 1, "进入物资页应直接展示广告");
  controller.setVisible(true);
  await flush();
  assert.strictEqual(lastAd.showCount, 1, "连续渲染不得重复调用 show");

  controller.setViewportSlot({ top: 260, viewportWidth: 375, viewportHeight: 667 });
  lastAd.resizeHandler({ width: 300, height: 90 });
  assert.strictEqual(lastAd.style.left, 38, "真实广告尺寸返回后仍须居中并保留滑动通道");
  assert.strictEqual(lastAd.style.top, 260, "广告应跟随页面内广告槽，而不是固定贴在底部导航上方");
  assert.deepStrictEqual(controller.layoutSize(), { width: 300, height: 90 }, "页面应能读取真实广告尺寸并预留内容高度");
  controller.setViewportSlot({ top: 184, viewportWidth: 375, viewportHeight: 667 });
  assert.strictEqual(lastAd.style.top, 184, "页面滚动时广告应跟随内嵌槽移动");
  lastAd.resizeHandler({ width: 360, height: 90 });
  assert.strictEqual(lastAd.style.width, 320, "微信模板回报过宽尺寸时仍不得吞掉两侧滑动通道");
  assert.strictEqual(lastAd.style.left, 28, "超宽模板收窄后仍须居中");

  const shownAd = lastAd;
  controller.setVisible(false);
  assert.strictEqual(shownAd.hideCount, 1, "离开物资页必须隐藏原生层");
  assert.strictEqual(shownAd.destroyCount || 0, 0, "离开物资页不得销毁原生层，避免后台拆控件卡顿");
  assert.ok(controller.instance, "隐藏后应保留已创建实例，返回时不再 getadvert");
  assert.ok(shownAd.style.top > 667, "隐藏后必须移出屏幕，不能留下透明触控层");
  controller.setVisible(true);
  await flush();
  assert.strictEqual(createCount, 1, "返回物资页应复用已有广告");
  assert.strictEqual(lastAd.showCount, 2, "复用实例只需再次 show");
  assert.strictEqual(lastAd.style.top, 184, "重新显示广告时必须恢复到最后一个有效页面槽位");

  let deferredShowCount = 0;
  const deferredResolvers = [];
  const deferredAds = [];
  const deferredController = new NativeTemplateAdController({
    getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667 }; },
    createCustomAd(options) {
      const ad = {
        style: options.style,
        onLoad() {},
        onResize() {},
        onError() {},
        show() {
          deferredShowCount += 1;
          return new Promise((resolve) => { deferredResolvers.push(resolve); });
        },
        hide() { ad.hideCount = (ad.hideCount || 0) + 1; },
        destroy() { ad.destroyCount = (ad.destroyCount || 0) + 1; }
      };
      deferredAds.push(ad);
      return ad;
    }
  });
  deferredController.setVisible(true);
  deferredController.setVisible(false);
  deferredController.setVisible(true);
  assert.strictEqual(deferredShowCount, 2, "隐藏后再展示应再次调用 show");
  assert.strictEqual(deferredAds.length, 1, "快速关闭不得拆掉再新建原生层");
  assert.strictEqual(deferredAds[0].destroyCount || 0, 0, "快速关闭只隐藏，不销毁");
  deferredResolvers[0]();
  await flush();
  assert.strictEqual(deferredController.requestedVisible, true, "出售弹窗关闭后应保留最新的展示请求");
  assert.strictEqual(deferredController.shown, false, "过期的 show Promise 不得把已隐藏实例标成已展示");
  deferredResolvers[1]();
  await flush();
  assert.strictEqual(deferredController.shown, true, "最新一次展示完成后才算真正露出");

  const liveAd = lastAd;
  liveAd.errorHandler({ errMsg: "mock custom ad error" });
  assert.ok(controller.retryAt > Date.now(), "广告错误后应短暂退避，避免每帧重试");
  assert.strictEqual(liveAd.destroyCount, 1, "广告错误后必须拆掉原生层，避免挡住出售和补给按钮");
  assert.strictEqual(controller.instance, null, "广告错误后不得留下透明触控层");
  assert.strictEqual(typeof liveAd.loadHandler, "function", "应监听原生模板广告加载事件");

  controller.destroy();
  assert.strictEqual(controller.instance, null, "销毁控制器时必须释放广告实例");

  const unsupported = new NativeTemplateAdController({
    getSystemInfoSync() { return { windowWidth: 320, windowHeight: 568 }; }
  });
  unsupported.setVisible(true);
  assert.strictEqual(unsupported.instance, null, "不支持 createCustomAd 的环境应静默降级");

  assert.ok(NATIVE_TEMPLATE_AD_CONFIG.sideInset >= 24 && NATIVE_TEMPLATE_AD_CONFIG.maxWidth <= 320, "原生广告两侧必须保留可滑动画布通道");
  const gameSource = fs.readFileSync(path.resolve(__dirname, "../js/game.js"), "utf8");
  assert.ok(/\["role",\s*"survival",\s*"archive"\]\.includes\(this\.screen\)[\s\S]{0,320}!blockingModal/.test(gameSource), "原生模板广告跟随物资、生存、档案和发现页，并避开游戏弹窗");
  assert.ok(/\["visitors",\s*"population"\]\.includes\(this\.discoveryTab\)/.test(gameSource), "发现频道只在种群观察和游客运营显示原生模板广告");
  assert.ok(/drawCurrentScreen\(ctx\)[\s\S]{0,400}syncNativeTemplateAd\(\)/.test(gameSource), "应先计算页面内广告槽，再同步原生广告位置和显隐");
  assert.ok(/drawNativeTemplateAdSlot[\s\S]{0,2200}nativeTemplateAdSlot/.test(gameSource), "物资页必须为原生模板广告预留独立内容槽");
  assert.ok(/林间公告/.test(gameSource) && /field-bulletin-v2/.test(gameSource), "原生广告槽必须使用林间公告栏而不是灰色占位框");
  assert.ok(/if \(this\.screen === "choose"\) return false/.test(gameSource), "序章不得初始化广告 SDK");
  assert.ok(/renderedExtinctionArchive[\s\S]{0,420}placeNativeTemplateAd\(ctx, y\)/.test(gameSource), "物种消失记录最下方要留原生广告");
  assert.ok(/drawSpeciesArchiveBox\(ctx, 12, y, this\.width - 24, reserve\) \+ 14;[\s\S]*?\} else \{\s*y = this\.placeNativeTemplateAd\(ctx, y\);/.test(gameSource), "物种档案盒最下方要留原生广告");
  assert.ok(/renderedSurvivalGroups\.push[\s\S]{0,800}placeNativeTemplateAd\(ctx, y\)/.test(gameSource), "生存频道目录最下方要留原生广告");
  assert.ok(/renderedVisitorTable[\s\S]{0,1600}placeNativeTemplateAd\(ctx, y\)/.test(gameSource), "游客运营最下方要留原生广告");
  assert.ok(/drawSpeciesSelector\(ctx, 12, y[\s\S]{0,160}placeNativeTemplateAd\(ctx, y\)/.test(gameSource), "种群观察最下方要留原生广告");
  console.log("custom ad check ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
