const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { NATIVE_TEMPLATE_AD_CONFIG, NativeTemplateAdController } = require("../js/adSystem");

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  let createOptions = null;
  let loadHandler = null;
  let resizeHandler = null;
  let errorHandler = null;
  let showCount = 0;
  let hideCount = 0;
  let destroyCount = 0;
  const ad = {
    style: {},
    onLoad(handler) { loadHandler = handler; },
    onResize(handler) { resizeHandler = handler; },
    onError(handler) { errorHandler = handler; },
    show() { showCount += 1; return Promise.resolve(); },
    hide() { hideCount += 1; },
    destroy() { destroyCount += 1; }
  };
  const runtime = {
    getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667 }; },
    createCustomAd(options) {
      createOptions = options;
      ad.style = options.style;
      return ad;
    }
  };
  const controller = new NativeTemplateAdController(runtime);

  assert.strictEqual(createOptions.adUnitId, "adunit-9f2f2442a85b3c2a", "必须使用 lucky2 原生模板广告位");
  assert.strictEqual(createOptions.style.width, 320, "375 宽设备应保留两侧画布滑动通道");
  assert.strictEqual(createOptions.style.left, 28, "模板广告应在保留滑动通道后水平居中");
  assert.strictEqual(showCount, 0, "初始化不得在其他页面抢先展示");

  controller.setVisible(true);
  await flush();
  assert.strictEqual(showCount, 1, "进入物资页应直接展示广告");
  controller.setVisible(true);
  await flush();
  assert.strictEqual(showCount, 1, "连续渲染不得重复调用 show");

  controller.setViewportSlot({ top: 260, viewportWidth: 375, viewportHeight: 667 });
  resizeHandler({ width: 300, height: 90 });
  assert.strictEqual(ad.style.left, 38, "真实广告尺寸返回后仍须居中并保留滑动通道");
  assert.strictEqual(ad.style.top, 260, "广告应跟随页面内广告槽，而不是固定贴在底部导航上方");
  assert.deepStrictEqual(controller.layoutSize(), { width: 300, height: 90 }, "页面应能读取真实广告尺寸并预留内容高度");
  controller.setViewportSlot({ top: 184, viewportWidth: 375, viewportHeight: 667 });
  assert.strictEqual(ad.style.top, 184, "页面滚动时广告应跟随内嵌槽移动");
  resizeHandler({ width: 360, height: 90 });
  assert.strictEqual(ad.style.width, 320, "微信模板回报过宽尺寸时仍不得吞掉两侧滑动通道");
  assert.strictEqual(ad.style.left, 28, "超宽模板收窄后仍须居中");

  controller.setVisible(false);
  assert.strictEqual(hideCount, 1, "离开物资页或打开弹窗时应隐藏广告");
  assert.ok(ad.style.top > 667, "隐藏后的原生广告必须移出屏幕，不能留下透明触控层");
  controller.setVisible(true);
  await flush();
  assert.strictEqual(showCount, 2, "返回物资页应恢复展示");
  assert.strictEqual(ad.style.top, 184, "重新显示广告时必须恢复到最后一个有效页面槽位");

  let resolveDeferredShow = null;
  let deferredShowCount = 0;
  let deferredHideCount = 0;
  const deferredController = new NativeTemplateAdController({
    getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667 }; },
    createCustomAd(options) {
      return {
        style: options.style,
        onLoad() {},
        onResize() {},
        onError() {},
        show() {
          deferredShowCount += 1;
          return new Promise((resolve) => { resolveDeferredShow = resolve; });
        },
        hide() { deferredHideCount += 1; }
      };
    }
  });
  deferredController.setVisible(true);
  deferredController.setVisible(false);
  deferredController.setVisible(true);
  assert.strictEqual(deferredShowCount, 1, "弹窗快速开关时不得并发发起第二次原生广告 show");
  resolveDeferredShow();
  await flush();
  assert.strictEqual(deferredController.requestedVisible, true, "出售弹窗关闭后应保留最新的展示请求");
  assert.strictEqual(deferredController.shown, true, "较早的隐藏请求不得覆盖出售完成后的广告展示");
  assert.strictEqual(deferredHideCount, 1, "快速关闭并恢复时不得由过期 Promise 再次隐藏广告");

  errorHandler({ errMsg: "mock custom ad error" });
  assert.ok(controller.retryAt > Date.now(), "广告错误后应短暂退避，避免每帧重试");
  assert.strictEqual(hideCount, 2, "广告错误后必须主动隐藏原生层，避免透明触控层挡住出售和补给按钮");
  assert.ok(ad.style.top > 667, "广告错误后必须移出屏幕，不能拦截物资页按钮点击");
  assert.strictEqual(typeof loadHandler, "function", "应监听原生模板广告加载事件");

  controller.destroy();
  assert.strictEqual(destroyCount, 1, "销毁控制器时必须释放广告实例");

  const unsupported = new NativeTemplateAdController({
    getSystemInfoSync() { return { windowWidth: 320, windowHeight: 568 }; }
  });
  unsupported.setVisible(true);
  assert.strictEqual(unsupported.instance, null, "不支持 createCustomAd 的环境应静默降级");

  assert.strictEqual(NATIVE_TEMPLATE_AD_CONFIG.placement, "lucky2");
  assert.ok(NATIVE_TEMPLATE_AD_CONFIG.sideInset >= 24 && NATIVE_TEMPLATE_AD_CONFIG.maxWidth <= 320, "原生广告两侧必须保留可滑动画布通道");
  const gameSource = fs.readFileSync(path.resolve(__dirname, "../js/game.js"), "utf8");
  assert.ok(/\["role",\s*"survival"\]\.includes\(this\.screen\)[\s\S]{0,220}!blockingModal/.test(gameSource), "原生模板广告只能跟随物资/生存页且应避开游戏弹窗");
  assert.ok(/drawCurrentScreen\(ctx\)[\s\S]{0,260}syncNativeTemplateAd\(\)/.test(gameSource), "应先计算页面内广告槽，再同步原生广告位置和显隐");
  assert.ok(/drawNativeTemplateAdSlot[\s\S]{0,2200}nativeTemplateAdSlot/.test(gameSource), "物资页必须为原生模板广告预留独立内容槽");
  console.log("custom ad check ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
