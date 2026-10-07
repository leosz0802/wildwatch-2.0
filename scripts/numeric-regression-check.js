function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
  },
  createCanvas() {
    return {
      width: 375,
      height: 667,
      getContext() {
        return createFakeContext();
      }
    };
  },
  createImage() {
    return {
      loaded: true,
      set src(value) {
        this._src = value;
        this.loaded = true;
        if (this.onload) this.onload();
      },
      get src() {
        return this._src;
      }
    };
  },
  getStorageSync() {
    return null;
  },
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { createCharacter, normalizeReserve } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { simulateDay, reserveProgressionFor } = require("../js/simulator");
const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function inRange(value, min, max, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} should be finite number, got ${value}`);
  assert(value >= min && value <= max, `${label} should be ${min}-${max}, got ${value}`);
}

function nonNegativeObject(group, label) {
  Object.keys(group || {}).forEach((key) => {
    assert(Number.isFinite(group[key]), `${label}.${key} should be finite`);
    assert(group[key] >= 0, `${label}.${key} should not be negative, got ${group[key]}`);
    assert(group[key] <= 999, `${label}.${key} exploded above 999, got ${group[key]}`);
  });
}

function withRandomSequence(values, fn) {
  const old = Math.random;
  let index = 0;
  Math.random = () => values[index++ % values.length];
  try {
    return fn();
  } finally {
    Math.random = old;
  }
}

function checkReserve(reserve, label) {
  assert(!Object.prototype.hasOwnProperty.call(reserve, "starCoins"), `${label}.starCoins不应作为独立资源存在`);
  assert(!Object.prototype.hasOwnProperty.call(reserve, "actionPoints"), `${label}.actionPoints旧资源不得重新生效`);
  assert(!Object.prototype.hasOwnProperty.call(reserve, "intel"), `${label}.intel旧资源不得重新生效`);
  assert(!Object.prototype.hasOwnProperty.call(reserve, "fieldPermits"), `${label}.fieldPermits旧资源不得重新生效`);
  inRange(reserve.fund, 0, 5000, `${label}.fund`);
  ["safety", "stability", "reputation", "enforcement", "poacherPressure"].forEach((key) => {
    inRange(reserve[key], 0, 100, `${label}.${key}`);
  });
  ["water", "grass", "disease"].forEach((key) => {
    inRange(reserve.ecology[key], 0, 100, `${label}.ecology.${key}`);
  });
  nonNegativeObject(reserve.supplies, `${label}.supplies`);
  nonNegativeObject(reserve.inventory, `${label}.inventory`);
  nonNegativeObject(reserve.ecology.predators, `${label}.predators`);
  nonNegativeObject(reserve.ecology.herbivores, `${label}.herbivores`);
  nonNegativeObject(reserve.ecology.birds, `${label}.birds`);
  inRange(reserve.market.antler, 45, 150, `${label}.market.antler`);
  inRange(reserve.market.hideSalvage, 70, 220, `${label}.market.hideSalvage`);
  inRange(reserve.market.researchSample, 24, 96, `${label}.market.researchSample`);
  const progression = reserveProgressionFor(reserve);
  inRange(progression.level, 1, 5, `${label}.progression.level`);
  inRange(progression.score, 0, 100, `${label}.progression.score`);
}

const legacyCurrency = normalizeReserve({ fund: 520, starCoins: 35 }, createReserveState());
assert(legacyCurrency.fund === 555 && legacyCurrency.coreResources.fund === 555, "旧星币数值应一次性并入保护基金");
assert(!Object.prototype.hasOwnProperty.call(legacyCurrency, "starCoins"), "迁移后不得保留独立星币字段");

let state = createCharacter(null, "保护区卫士");
state.world.reserve.supplies.dogFood = Math.max(state.world.reserve.supplies.dogFood, 8);
state.world.reserve.supplies.alarm = Math.max(state.world.reserve.supplies.alarm, 3);
state.world.reserve.supplies.tranquilizer = Math.max(state.world.reserve.supplies.tranquilizer, 4);
state.world.reserve.inventory.shedAntlerA = 2;
state.world.reserve.inventory.researchSample = 3;

const commands = [
  "派猎犬侦察：让砾灰去中央混交林搜寻陷阱和陌生气味",
  "驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影",
  "修复水源和草场：去东部河岸湿地修复水源",
  "出售仓库里的脱落岩角和研究样本",
  "采购狗粮包",
  "执行许可内生态干预：阻滞转移过度靠近水源的鹿",
  "派猎犬侦察：沿南部林缘草甸找脚印",
  "采购警报器",
  "驱赶偷猎者：夜里封锁东部河岸湿地入口",
  "修复水源和草场：修补草甸水线",
  "出售回收物：处理仓库里的自然样本",
  "采购阻滞弹",
  "派猎犬侦察：检查边界直线脚印",
  "修复栖息地：补水草和隐蔽带"
];

const start = JSON.parse(JSON.stringify(state.world.reserve));
withRandomSequence([0.12, 0.88, 0.44, 0.72, 0.25, 0.96, 0.58], () => {
  commands.forEach((command, index) => {
    const result = simulateDay(command, state);
    state = {
      world: result.world,
      character: result.character,
      reports: (state.reports || []).concat(result.reports || []).slice(-12),
      messages: []
    };
    checkReserve(state.world.reserve, `day${index + 1}`);
  });
});

const finalReserve = state.world.reserve;

// 0 是合法的生态极端值，关键行动复制状态时不能用默认值将它偷偷恢复。
const zeroState = createCharacter(null, "零值边界测试");
zeroState.world.reserve.ecology.water = 0;
zeroState.world.reserve.ecology.grass = 0;
zeroState.world.reserve.ecology.disease = 0;
zeroState.world.reserve.poacherPressure = 0;
zeroState.world.reserve.supplies.dogFood = 1;
const zeroResult = withRandomSequence([0.2, 0.4, 0.6], () => simulateDay("派猎犬侦察：确认零值边界", zeroState));
assert(zeroResult.world.reserve.ecology.water < 20, `水源0不应无原因跳到${zeroResult.world.reserve.ecology.water}`);
assert(zeroResult.world.reserve.ecology.grass < 20, `草场0不应无原因跳到${zeroResult.world.reserve.ecology.grass}`);
assert(zeroResult.world.reserve.poacherPressure < 20, `偷猎0不应无原因跳到${zeroResult.world.reserve.poacherPressure}`);
const game = Object.create(Game.prototype);
game.state = state;
const startProsperity = game.reserveProsperitySummary(start, { knownCharacters: state.world.knownCharacters });
const finalProsperity = game.reserveProsperitySummary(finalReserve, state.world);
assert(finalProsperity.value >= Math.max(1, Math.round(startProsperity.value * 0.62)), "reserve value collapsed too far after normal play loop");
assert(finalReserve.houndTeam.level >= start.houndTeam.level, "hound team level should not regress");
assert((finalReserve.houndTeam.totalRuns || 0) >= 6, "hound team should record repeated operations");

console.log("numeric regression check ok");
