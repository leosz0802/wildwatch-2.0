'use strict';
const assert = require('assert');
const handlers = {};
const ctx = new Proxy({}, { get(t,p){ if (p==='measureText') return () => ({width: 10}); if (p==='createLinearGradient'||p==='createRadialGradient') return () => ({addColorStop(){}}); if (!t[p]) t[p]=()=>{}; return t[p]; }, set(t,p,v){t[p]=v;return true;} });
global.wx = { getSystemInfoSync:()=>({windowWidth:375,windowHeight:667,pixelRatio:1}), createCanvas:()=>({width:375,height:667,getContext:()=>ctx}), createImage:()=>({loaded:true}), getStorageSync:()=>null,setStorageSync(){},onTouchStart:f=>handlers.start=f,onTouchMove:f=>handlers.move=f,onTouchEnd:f=>handlers.end=f,onTouchCancel:f=>handlers.cancel=f,onKeyboardConfirm(){},onAppHide(){},onAppShow(){},showToast(){} };
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const game = new Game(); game.stopLoop(); game.render = () => {}; game.state = createCharacter(null, '任务间隔'); game.screen = 'home';
game.state.world.goals = { daily: { title: '今日巡护', story: '边界有变化', recommendedAction: 'houndScout', cycle: 1 }, active: { primary: { id: 'goal:1', kind: 'daily', recommendedAction: 'houndScout' } } };
game.currentGoalView = () => ({ primary: { id: 'goal:2', kind: 'daily', recommendedAction: 'houndScout', buttonLabel: '去处理' }, alternatives: [], daily: { complete: 0, required: 1 } });
let opened = 0; game.openGoalCenter = () => { opened += 1; return true; };
const realNow = Date.now; let now = 1_000_000; Date.now = () => now;
try {
  const gapMs = 82 * 1000;
  game.markUserTaskTrigger();
  assert.strictEqual(game.maybeOpenMissionPush('settlement', { force: true }), false, '系统任务必须等待用户任务结束后的全局间隔');
  now += gapMs;
  assert.strictEqual(game.maybeOpenMissionPush('settlement', { force: true }), false, '恰好到达间隔仍不能触发，必须超过间隔');
  now += 1;
  assert.strictEqual(game.maybeOpenMissionPush('settlement', { force: true }), true, '超过全局间隔后系统任务应可触发');
  assert.strictEqual(opened, 1);
  game.currentGoalView = () => ({ primary: { id: 'goal:3', kind: 'story', recommendedAction: 'habitat', buttonLabel: '去处理' }, alternatives: [], daily: { complete: 1, required: 1 } });
  game.markUserTaskTrigger();
  now += gapMs - 1;
  assert.strictEqual(game.maybeOpenMissionPush('settlement', { force: true }), false, '用户任务再次触发后仍需等待全局间隔');
  now += 2;
  assert(game.maybeOpenMissionPush('settlement', { force: true }), '超过间隔后后续系统任务可以继续按既有任务键策略判断');
} finally { Date.now = realNow; }
console.log('system task cooldown check ok: user/system triggers keep an 82-second automatic gap');
