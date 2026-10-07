'use strict';

const assert = require('node:assert/strict');

// Android/HarmonyOS WeChat can run the game context without a global Intl
// implementation. This is the exact environment reported by the device log;
// ordinary patrol actions must still settle instead of entering the retry toast.
const originalIntl = global.Intl;
global.Intl = undefined;

try {
  const { createInitialWorld } = require('../js/world');
  const { simulateDay } = require('../js/simulator');
  const { realNatureTriggerType } = require('../js/realNatureEventSystem');

  const reserve = createInitialWorld().reserve;
  reserve.progression.activeSeconds = 60;
  reserve.progression.chapterStart = { activeSeconds: 0 };
  reserve.supplies.dogFood = 8;
  const state = {
    character: { role: 'warden', location: '中央混交林', stamina: 82, health: 92 },
    world: Object.assign({}, createInitialWorld(), { reserve }),
    messages: [],
    reports: []
  };

  const eventType = realNatureTriggerType(reserve, Date.UTC(2026, 0, 2, 16, 30));
  assert.match(eventType, /^real_nature_/, 'Intl-free runtime must still select a dated real-nature event');

  let next = simulateDay('派猎犬侦察', state);
  assert.equal(next.world.reserve.progression.totalActions, 1, 'first hound scout must settle without Intl');
  next = simulateDay('派猎犬侦察', next);
  assert.equal(next.world.reserve.progression.totalActions, 2, 'retrying hound scout must settle a second time');
  assert.equal(next.world.reserve.supplies.dogFood, 6, 'each settled scout must consume exactly one dog food');
} finally {
  global.Intl = originalIntl;
}

console.log('Android Intl fallback check ok: hound scout settles repeatedly without Intl');
