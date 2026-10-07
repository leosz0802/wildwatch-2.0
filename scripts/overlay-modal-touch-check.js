'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const handlers = {};
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', system: 'HarmonyOS 4.2', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  createCanvas: () => ({ width: 750, height: 1334, getContext: () => fakeContext() }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel(handler) { handlers.cancel = handler; },
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1, canvas: { width: 750, height: 1334 } }, {
    get(target, property) {
      if (property === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, '弹层触摸回归');
  game.screen = 'home';
  game.ctx = fakeContext();
  game.width = 375;
  game.height = 667;
  const reserve = game.state.world.reserve;
  reserve.fund = 20000;
  reserve.supplies = Object.assign({
    dogFood: 10, alarm: 10, fieldKit: 10, tranquilizer: 10, medicalKit: 10, evidenceTrap: 2
  }, reserve.supplies || {});
  game.render = function paintOverlays() {
    this.hitAreas = [];
    this.drawBottomNav();
    if (this.chapterStoryModal) this.drawChapterStoryModal();
    if (this.patrolTaskModal) this.drawPatrolTaskModal();
    if (this.infoDetailModal) this.drawInfoDetailModal();
    if (this.settlementModal) this.drawSettlementModal();
  };
  game.requestRender = () => {};
  game.toast = () => {};
  game.maybeShowInterstitialForSettlement = () => {};
  game.collectTaskCompletionFeedback = () => {};
  game.taskCompletionFeedback = { pending: [] };
  game.shareForestPostcard = () => false;
  game.openVisitorRecruitment = () => { game.infoDetailModal = { kind: 'visitorRecruitment' }; };
  return game;
}

function overlayOpen(game) {
  return !!(game.settlementModal || game.patrolTaskModal || game.infoDetailModal || game.chapterStoryModal);
}

function modalChromeHits(game) {
  const floor = game.modalHitFloorIndex();
  return game.hitAreas
    .map((hit, index) => ({ hit, index }))
    .filter(({ hit, index }) => index > floor && hit.hud && !game.isFullScreenBackdropHit(hit))
    .map(({ hit }) => hit)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function footerHits(game) {
  const chrome = modalChromeHits(game).filter((hit) => hit.w >= 80);
  const maxY = chrome.reduce((max, hit) => Math.max(max, hit.y), 0);
  return chrome.filter((hit) => hit.y >= maxY - 12).sort((a, b) => a.x - b.x);
}

function dismissHit(game) {
  const chrome = modalChromeHits(game);
  const closeX = chrome.find((hit) => hit.w < 80 && hit.h < 80 && hit.y < 160);
  return closeX || footerHits(game)[0] || chrome[0];
}

function actionHit(game) {
  return footerHits(game)[1] || null;
}

function tap(hit, space) {
  const x = hit.x + hit.w / 2;
  const y = hit.y + hit.h / 2;
  const point = space === 'physical'
    ? { clientX: x * 2, clientY: y * 2 }
    : { clientX: x, clientY: y };
  handlers.start({ changedTouches: [point] });
  handlers.end({ touches: [], changedTouches: [point] });
}

function assertOverlayContract(game, name) {
  assert.equal(game.blockingOverlayOpen(), true, `${name} 必须挡住沙盘`);
  const backdrop = game.hitAreas.find((hit) => game.isFullScreenBackdropHit(hit));
  assert(backdrop && backdrop.hud, `${name} 全屏遮罩必须是 HUD`);
  assert.ok(game.hitAreas.some((hit) => game.isFullScreenBackdropHit(hit)), `${name} 必须盖住底栏命中区`);
  assert.ok(modalChromeHits(game).length >= 1, `${name} 必须有可点的 HUD 按钮`);
}

function assertNavDoesNotSteal(game, name) {
  const screenBefore = game.screen;
  game.touchCoordinateSpace = 'physical';
  handlers.start({
    changedTouches: [{ clientX: 24, clientY: (game.height - 16) * 2 }]
  });
  handlers.end({
    touches: [],
    changedTouches: [{ clientX: 24, clientY: (game.height - 16) * 2 }]
  });
  assert.ok(!['survival', 'collection', 'role'].includes(game.screen), `${name} 底栏不能切到其他页`);
  assert.ok(game.screen === 'home' || game.screen === screenBefore, `${name} 打开时不能被底栏带走`);
}

function regularSettlement() {
  return {
    title: '驱赶偷猎者 · 西部岩坡洞域',
    summary: '偷猎压力下降。',
    grade: 'S',
    guardianScore: 91,
    scoreDelta: 36,
    speech: '今晚幼崽敢靠近水边。',
    speaker: '沉牙狼',
    returnScreen: 'home',
    goalDone: true,
    stats: [{ label: '安全指数', before: 62, after: 80, delta: 18 }],
    fundBefore: 900,
    fundAfter: 940
  };
}

function crisisSettlement(kind, title, action) {
  return Object.assign(regularSettlement(), {
    title,
    goalDone: false,
    breakthrough: { kind, kicker: '突发事件', title, body: title },
    causality: { reasons: [{ label: title, action }] }
  });
}

function runDismissCase(name, setup, extra) {
  const game = makeGame();
  setup(game);
  game.render();
  assertOverlayContract(game, name);
  assertNavDoesNotSteal(game, name);
  if (!overlayOpen(game)) {
    setup(game);
    game.render();
  }
  game.touchCoordinateSpace = '';
  const first = dismissHit(game);
  assert(first, `${name} 缺少关闭键`);
  tap(first, 'logical');
  assert.equal(overlayOpen(game), false, `${name} 逻辑坐标必须关掉弹层`);

  setup(game);
  game.render();
  game.touchCoordinateSpace = 'physical';
  tap(dismissHit(game), 'physical');
  assert.equal(overlayOpen(game), false, `${name} 物理像素必须关掉弹层`);

  if (typeof extra === 'function') extra(game);
}

const cases = [];

runDismissCase('普通结算', (game) => {
  game.settlementModal = regularSettlement();
});
cases.push('普通结算');

runDismissCase('突发事件·猎犬', (game) => {
  game.settlementModal = crisisSettlement('emergency_started', '现场发现·砾灰咬回的布条', 'houndScout');
}, (game) => {
  let routed = '';
  game.openReserveViewAction = (id) => { routed = id; };
  game.settlementModal = crisisSettlement('emergency_started', '现场发现·砾灰咬回的布条', 'houndScout');
  game.render();
  const scout = actionHit(game);
  assert(scout, '突发事件必须有去猎犬侦察');
  tap(scout, 'logical');
  assert.equal(routed, 'houndScout', '去猎犬侦察必须路由');
  assert.equal(overlayOpen(game), false, '去猎犬侦察后结算必须关');
});
cases.push('突发事件·猎犬');

runDismissCase('突发事件·偷猎', (game) => {
  game.settlementModal = crisisSettlement('emergency_failed', '偷猎团伙突破边界', 'antiPoacher');
});
cases.push('突发事件·偷猎');

runDismissCase('样本移交结算', (game) => {
  game.settlementModal = Object.assign(regularSettlement(), {
    title: '样本移交完成 · 研究补助 +230',
    commerce: { count: 2, description: 'A级岩角×1', fundingLabel: '研究补助' },
    fundBefore: 1000,
    fundAfter: 1230
  });
});
cases.push('样本移交结算');

['visitors', 'animals', 'species'].forEach((metric) => {
  const label = metric === 'visitors' ? '游客详情' : metric === 'animals' ? '动物总数详情' : '种群数量详情';
  runDismissCase(label, (game) => {
    assert.equal(game.openCoreMetricDetail(metric), true, `${label} 必须能打开`);
  });
  cases.push(label);
});

runDismissCase('游客接待', (game) => {
  assert.equal(game.openVisitorReception(), true, '游客接待必须能打开');
});
cases.push('游客接待');

runDismissCase('水源详情', (game) => {
  game.infoDetailModal = game.buildReserveMetricDetail('water');
});
cases.push('水源详情');

runDismissCase('草场详情', (game) => {
  game.infoDetailModal = game.buildReserveMetricDetail('grass');
});
cases.push('草场详情');

runDismissCase('修复饮水点', (game) => {
  assert.equal(game.openMetricImprovementTask('water'), true, '饮水点任务必须能打开');
});
cases.push('修复饮水点');

runDismissCase('恢复草场', (game) => {
  assert.equal(game.openMetricImprovementTask('grass'), true, '草场任务必须能打开');
});
cases.push('恢复草场');

runDismissCase('猎犬侦察任务', (game) => {
  const option = game.reserveActionOptions().find((item) => item.id === 'houndScout');
  assert(option, '必须有猎犬侦察任务');
  game.openPatrolTaskModal(option);
});
cases.push('猎犬侦察任务');

runDismissCase('采购数量', (game) => {
  game.openSupplyQuantityPicker('dogFood');
  assert(game.infoDetailModal && game.infoDetailModal.kind === 'supplyQuantity', '采购数量必须打开');
});
cases.push('采购数量');

runDismissCase('章节过场', (game) => {
  game.chapterStoryModal = { level: 1, phase: 'start', buttonLabel: '进入森林' };
});
cases.push('章节过场');

runDismissCase('建筑运营·安排讲解', (game) => {
  game.info = Object.assign({}, game.info || {}, { platform: 'ios', system: 'iOS 17.5' });
  game.interstitialAds = {
    showing: true,
    state: { lastShownAt: Date.now() - 20000 },
    finishPending() { this.showing = false; }
  };
  game.nativeTemplateAds = { visible: true, setVisible(value) { this.visible = !!value; } };
  game.gameClub = { visible: true, setVisible(value) { this.visible = !!value; } };
  let parks = 0;
  game.wechatFriends = {
    presentedThisFrame: true,
    overlayParked: false,
    parkOverlay() {
      parks += 1;
      this.presentedThisFrame = false;
      this.overlayParked = true;
      return true;
    }
  };
  game.openDevelopmentBuildingStory('meadow_edge');
  assert.equal(game.infoDetailModal && game.infoDetailModal.kind, 'developmentBuildingStory', '建筑运营弹窗必须打开');
  assert.equal(game.nativeTemplateAds.visible, false, '建筑运营打开时必须藏起原生模板广告');
  assert.equal(game.gameClub.visible, false, '建筑运营打开时必须藏起游戏圈按钮');
  assert.ok(parks > 0, '建筑运营打开时必须收起开放数据原生层');
  assert.equal(game.interstitialAds.showing, false, '卡住的插屏标记不得挡住建筑运营按钮');
}, (game) => {
  game.info = Object.assign({}, game.info || {}, { platform: 'ios', system: 'iOS 17.5' });
  game.openDevelopmentBuildingStory('meadow_edge');
  game.render();
  const primary = actionHit(game);
  assert(primary, '建筑运营必须有安排讲解主按钮');
  assert.equal(primary.modalAction, true, '安排讲解必须是弹层主按钮');
  let tapped = false;
  const original = primary.onTap;
  primary.onTap = () => {
    tapped = true;
    if (typeof original === 'function') original();
  };
  tap(primary, 'physical');
  assert.equal(tapped, true, 'iOS 物理像素必须点到安排讲解，不能被原生层吞掉');
});
cases.push('建筑运营·安排讲解');

const visitorGame = makeGame();
assert.equal(visitorGame.openCoreMetricDetail('visitors'), true);
visitorGame.render();
let recruited = false;
visitorGame.openVisitorRecruitment = () => {
  recruited = true;
  visitorGame.infoDetailModal = { kind: 'visitorRecruitment' };
};
const recruit = actionHit(visitorGame);
assert(recruit, '游客详情必须有去招募');
tap(recruit, 'logical');
assert.equal(recruited, true, '游客详情去招募必须进入招募');

const receptionGame = makeGame();
receptionGame.openVisitorReception();
receptionGame.render();
if (actionHit(receptionGame)) {
  tap(actionHit(receptionGame), 'physical');
  assert(
    receptionGame.infoDetailModal
    && (receptionGame.infoDetailModal.kind === 'visitorReception' || receptionGame.infoDetailModal.kind === 'visitorRoutine'),
    '接待主按钮必须有响应，不能冻在原页'
  );
}

const archeryGame = makeGame();
archeryGame.info = { platform: 'android', system: 'Android 14', windowWidth: 375, windowHeight: 667, pixelRatio: 3 };
let archeryFired = false;
archeryGame.infoDetailModal = {
  kind: 'visitorIncidentDice',
  kicker: '游客现场 · 调节',
  title: '现场需要调节',
  phase: 'ready',
  actionLabel: '射箭判定',
  threshold: 3,
  items: [{ tag: '发生', title: '游客与动物路线冲突', body: '需要射箭判定。' }],
  footer: '射箭判定 · 3点及以上正向',
  action: () => { archeryFired = true; }
};
archeryGame.interstitialAds = { showing: true, state: { lastShownAt: Date.now() } };
archeryGame.afterRewardedVideoClose({
  hideNativeSurface() { assert.fail('Android 关片后不得 hide 激励视频'); },
  dismissLeftoverSurface() { assert.fail('Android 关片后不得拆激励视频'); }
});
archeryGame.adTouchGuardUntil = 0;
archeryGame.render();
assertOverlayContract(archeryGame, '游客现场射箭');
const archeryHit = archeryGame.infoDetailModal.renderedArcheryFireButton
  ? archeryGame.hitAreas.find((hit) => {
    const button = archeryGame.infoDetailModal.renderedArcheryFireButton;
    return hit.x === button.x && Math.abs(hit.y - button.y) < 24 && hit.w === button.w;
  }) || actionHit(archeryGame)
  : actionHit(archeryGame);
assert(archeryHit, '游客现场射箭判定必须有可点按钮');
assert.equal(!!archeryGame.interstitialAds.showing, false, '射箭弹窗不得被插屏 showing 锁死');
tap(archeryHit, 'logical');
assert.equal(archeryFired, true, 'Android 看完广告后仍必须能点射箭判定');
let aimingNativeHides = 0;
archeryGame.nativeTemplateAds = { setVisible() { aimingNativeHides += 1; } };
archeryGame.gameClub = { setVisible() { aimingNativeHides += 1; } };
archeryGame.drawInfoDetailModal();
archeryGame.drawInfoDetailModal();
assert.equal(aimingNativeHides, 0, '游客现场瞄准不得每帧再藏原生广告层');
cases.push('游客现场射箭');

const idleStutterGame = makeGame();
let idleNativeHides = 0;
let idleParks = 0;
idleStutterGame.nativeTemplateAds = { setVisible() { idleNativeHides += 1; } };
idleStutterGame.gameClub = { setVisible() { idleNativeHides += 1; } };
idleStutterGame.parkIdleOpenDataOverlay = () => { idleParks += 1; return true; };
idleStutterGame.drawInfoDetailModal();
idleStutterGame.drawPatrolTaskModal();
idleStutterGame.drawSettlementModal();
assert.equal(idleNativeHides, 0, '空闲沙盘不得每帧藏原生广告层');
assert.equal(idleParks, 0, '空闲沙盘不得每帧收缩开放数据画布');
cases.push('空闲沙盘不刷原生层');

const source = fs.readFileSync(require.resolve('../js/game.js'), 'utf8');
assert.match(source, /flushBlockingNativeOverlays\(/, 'info modals must park native overlays before drawing buttons');
assert.match(source, /abandonStuckInterstitialOverlay\(/, 'a leftover interstitial flag must not freeze building-operation buttons');
assert.doesNotMatch(source, /dismissLeftoverSurface\(/, 'iOS rewarded close must not destroy the video ad');
assert.doesNotMatch(source, /hideNativeSurface\(/, 'modal flush must not hide rewarded video on Android');

console.log(`overlay modal touch check ok: ${cases.join('、')}`);
