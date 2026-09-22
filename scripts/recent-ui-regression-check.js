const assert = require('assert');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { InterstitialAdController } = require('../js/adSystem');
const { formatTop10Broadcast, compareTop10 } = require('../js/worldLeaderboardBroadcast');

function context() {
  return new Proxy({ font: '14px sans-serif' }, {
    get(target, key) {
      if (key === 'measureText') return text => ({ width: Array.from(String(text)).length * (parseFloat(/([\d.]+)px/.exec(target.font)?.[1]) || 14) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return key in target ? target[key] : () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}
function game() {
  const g = Object.create(Game.prototype);
  g.state = createCharacter(null, '保护区卫士');
  g.hitAreas = [];
  g.render = () => {};
  g.toast = () => {};
  g.roundRect = g.drawPremiumInfoCard = g.drawPremiumLeatherPanel = () => {};
  return g;
}

async function main() {
  const g = game();
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: `long_protection_area_identifier_${i}`, name: `雨林保护区${i}`, rank: i + 1, animals: 20, valuation: 1000 - i }));
  let popups = 0;
  g.toast = () => { popups++; };
  g.updateWorldLeaderboardBroadcast(rows);
  rows[9].animals++;
  g.state.world.reserve.progression.activeSeconds = 179;
  assert.equal(g.updateWorldLeaderboardBroadcast(rows), null);
  assert.equal(popups, 0, '前三分钟不得弹榜单');
  g.state.world.reserve.progression.activeSeconds = 180;
  const first = g.updateWorldLeaderboardBroadcast(rows);
  assert(first && first.body.includes('雨林保护区9') && first.body.includes('#10'), '延迟变化应把最新 Top 10 完整写入当天唯一信件');
  g.state.world.weather = '晴';
  g.state.world.day++;
  popups = 0;
  for (let i = 0; i < 40; i++) { rows[9].animals++; g.updateWorldLeaderboardBroadcast(rows); }
  assert.equal(popups, 0, '世界榜变化只进邮箱，不应弹出屏幕提示');
  assert.equal(g.state.world.reserve.league.broadcasts.length, 1, '跨日后只保留最新一封世界榜信');
  g.state.world.weather = '暴雨';
  g.state.world.day++;
  popups = 0;
  for (let i = 0; i < 10; i++) { rows[9].animals++; g.updateWorldLeaderboardBroadcast(rows); }
  assert.equal(popups, 0, '世界榜变化只进邮箱，不应弹出屏幕提示');
  const leaderboardLetters = g.allIncomingLetters().filter(l => l.sourceKind === 'leaderboard');
  assert.equal(leaderboardLetters.length, 1, '收件箱只展示最近一封世界榜信');
  assert.equal(leaderboardLetters[0].day, g.state.world.day);
  g.state.world.reserve.league.broadcasts = Array.from({ length: 60 }, (_, i) => ({ id: `history_${i}`, day: i, title: '世界榜 Top 10 变化', body: `进榜：保护区${i}`, sourceKind: 'leaderboard', readAt: i < 30 ? 1 : 0 }));
  const history = g.allIncomingLetters().filter(l => l.sourceKind === 'leaderboard');
  assert.equal(history.length, 1, '历史世界榜信在收件箱也只保留最近一封');
  assert.equal(history[0].id, 'history_59');
  assert.equal(history.filter(l => !l.readAt).length, 1, '被隐藏的旧世界榜信不得计入未读');
  const body = formatTop10Broadcast(compareTop10(rows, rows.map((r, i) => ({ ...r, id: `new_${i}` }))));
  assert.equal(body.split('\n').length, 20, '十条进榜和十条出榜各自独立');

  for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
    const r = game(), ctx = context();
    r.width = width; r.height = height; r.scrollY = 0;
    const modal = {};
    const content = Array.from({length: 30}, (_, i) => `第${i + 1}条：保护区来信，游客数量发生了变化。`).join('\n');
    r.drawLetterTextPages(ctx, modal, content, 48, 180, width - 96, 170, 15, 23);
    const expected = modal.renderedLetterText.lines.join('');
    let seen = '';
    const total = modal.renderedLetterText.pageCount;
    for (let page = 0; page < total; page++) {
      modal.letterPage = page;
      r.drawLetterTextPages(ctx, modal, content, 48, 180, width - 96, 170, 15, 23);
      seen += modal.renderedLetterText.visible.join('');
      assert.equal(modal.renderedLetterText.size, 15, '正文不能为了塞入一页而缩小');
    }
    assert.equal(seen, expected, '分页应能读到最后一条，不截断');
    const upgrade = { kind: 'developmentBuildingUpgrade', building: { level: 0, nextUpgradeCost: 220 } };
    const bodyH = Math.min(r.infoDetailModalHeight(upgrade), height - 34) - 240;
    r.drawDevelopmentBuildingModalContent(ctx, upgrade, 20, 150, width - 40, bodyH);
    assert(upgrade.renderedBuildingRows.every(row => row.y + row.h <= 150 + bodyH), '建筑卡片不得压到页脚');
  }

  const ad = new InterstitialAdController({ createInterstitialAd() { return {}; } });
  assert(ad.shouldShow({ settlement: true, guardianDay: 2, actionCount: 5, activeSeconds: 179 }));
  assert(ad.shouldShow({ settlement: true, guardianDay: 2, actionCount: 5, activeSeconds: 180 }));
  const touch = game(); let closed = 0;
  touch.hitAreaAt = () => ({ onTap() { closed++; } });
  touch.interstitialAds = { showing: true };
  touch.handleTap(10, 10); assert.equal(closed, 0);
  touch.interstitialAds = { shouldShow: () => true, show: () => Promise.resolve({ shown: true }) };
  touch.continueAfterSettlement = () => {};
  await touch.maybeShowInterstitialForSettlement({}, 'home');
  touch.handleTap(10, 10); assert.equal(closed, 0, '广告关闭的点击不能穿透到任务');
  touch.adTouchGuardUntil = Date.now() - 1;
  touch.handleTap(10, 10); assert.equal(closed, 1, '保护结束后任务必须仍能操作');
  console.log('recent UI regression ok (notifications, letters, buildings, ad touch protection; 3 viewports)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
