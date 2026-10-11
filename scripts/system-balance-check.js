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

const { createInitialWorld } = require("../js/world");
const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const {
  simulateDay,
  reserveProgressionFor,
  animalTrustTierFor,
  animalCareLevelFor
} = require("../js/simulator");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
}

function wardenState() {
  return createCharacter(null, "保护区卫士");
}

function run(command, state, random = 0.9) {
  return withRandom(random, () => simulateDay(command, state));
}

function nonNegativeObject(group, label) {
  Object.keys(group || {}).forEach((key) => {
    if (key === "rescueItems" && group[key] && typeof group[key] === "object") {
      return nonNegativeObject(group[key], `${label}.${key}`);
    }
    assert((group[key] || 0) >= 0, `${label}.${key} should be non-negative`);
  });
}

function inRange(value, min, max, label) {
  assert(typeof value === "number" && value >= min && value <= max, `${label} should be ${min}-${max}, got ${value}`);
}

const world = createInitialWorld();
const reserve = world.reserve;
const game = new Game();
game.stopLoop();
game.render = () => {};
game.toast = () => {};
game.state = wardenState();

const actionIds = game.reserveActionOptions().map((item) => item.id);
["houndScout", "antiPoacher", "habitat", "salvage", "intervention", "buySupplies"].forEach((id) => {
  assert(actionIds.indexOf(id) >= 0, `missing reserve action ${id}`);
  const status = game.actionResourceStatus(id, reserve);
  assert(status && Array.isArray(status.costs), `${id} should expose resource costs`);
});

const missingDogFoodReserve = clone(reserve);
missingDogFoodReserve.supplies.dogFood = 0;
assert(!game.actionResourceStatus("houndScout", missingDogFoodReserve).canRun, "hound scout should require dog food");

const missingFundReserve = clone(reserve);
missingFundReserve.fund = 40;
missingFundReserve.supplies.fieldKit = 0;
assert(!game.actionResourceStatus("habitat", missingFundReserve).canRun, "habitat should require a field kit");
assert(!game.actionResourceStatus("buySupplies", missingFundReserve).canRun, "buy supplies should require enough fund");

["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(reserve, key), `retired abstract resource ${key} must not exist`));
["fund", "stability", "reputation", "enforcement", "poacherPressure", "safety"].forEach((key) => {
  assert(typeof reserve[key] === "number", `reserve.${key} should be numeric`);
});
nonNegativeObject(reserve.supplies, "supplies");
nonNegativeObject(reserve.inventory, "inventory");
nonNegativeObject(reserve.market, "market");
nonNegativeObject(reserve.ecology.predators, "predators");
nonNegativeObject(reserve.ecology.herbivores, "herbivores");
nonNegativeObject(reserve.ecology.birds, "birds");

const protectedAnimalCount = Object.keys((reserve.base || {}).protectedAnimals || {})
  .reduce((sum, key) => sum + (((reserve.base || {}).protectedAnimals || {})[key] || 0), 0);
assert(reserve.safety === 58, `converged initial safety should be 58, got ${reserve.safety}`);
assert(reserve.stability === 66, `converged initial ecology/stability should be 66, got ${reserve.stability}`);
assert(reserve.business === 58, `converged initial business should be 58, got ${reserve.business}`);
assert(reserve.fund === 1000, `新玩家初始星币应为1000，实际 ${reserve.fund}`);
assert(protectedAnimalCount === 32, `converged protected animal count should be 32, got ${protectedAnimalCount}`);
assert((reserve.base || {}).rareAnimals === 3, `converged rare animal count should be 3, got ${(reserve.base || {}).rareAnimals}`);
assert(reserve.reputation === 50, `converged reputation should be 50, got ${reserve.reputation}`);
assert((reserve.social || {}).coop === 40, `converged coop should be 40, got ${(reserve.social || {}).coop}`);
assert((reserve.social || {}).rival === 30, `converged rival should be 30, got ${(reserve.social || {}).rival}`);
assert((reserve.league || {}).worldRank === 10000, `converged world rank should be 10000, got ${(reserve.league || {}).worldRank}`);

["safety", "stability", "reputation", "enforcement", "poacherPressure"].forEach((key) => inRange(reserve[key], 0, 100, key));
["water", "grass", "disease"].forEach((key) => inRange(reserve.ecology[key], 0, 100, `ecology.${key}`));
const progression = reserveProgressionFor(reserve);
inRange(progression.score, 0, 100, "reserve progression score");
inRange(progression.level, 1, 5, "reserve progression level");

const speciesCategory = {
  狼: "食肉", 乌鸦: "空中", 鹿: "食草", 熊: "杂食", 水貂: "水岸",
  狮子: "食肉", 豹子: "食肉", 鳄鱼: "水生", 野犬: "食肉",
  斑马: "食草", 羚羊: "食草", 长颈鹿: "食草", 大象: "食草",
  河马: "水生", 火烈鸟: "水鸟", 鹰: "空中", 秃鹫: "空中", 野兔: "食草", 野猪: "杂食", 猫头鹰: "空中", 狐狸: "食肉"
};

assert(world.knownCharacters.length === 7, "level 1 reserve should expose exactly seven unlocked animal NPCs");
world.knownCharacters.forEach((animal) => {
  assert(animal.id && animal.name && animal.species && animal.title, `animal ${animal.id || animal.name} should have identity fields`);
  assert(speciesCategory[animal.species], `${animal.name} should map to a gameplay category`);
  inRange(animal.rank, 1, 5, `${animal.name} ecology rank`);
  const trust = (animal.relation || {}).trust;
  const threat = (animal.relation || {}).threat;
  inRange(trust, 0, 100, `${animal.name} trust`);
  inRange(threat, 0, 100, `${animal.name} threat`);
  const tier = animalTrustTierFor(trust);
  assert(tier.title && tier.progress >= 0 && tier.progress <= 1, `${animal.name} trust tier should be valid`);
  inRange(animalCareLevelFor(animal, reserve), 1, 100, `${animal.name} care level`);
});

let state = wardenState();
state.world.reserve.supplies.dogFood = 3;
let before = clone(state.world.reserve);
let result = run("猎犬侦察：让砾灰去中央混交林搜寻陌生气味", state, 0.1);
assert(result.world.reserve.supplies.dogFood === before.supplies.dogFood - 1, "hound scout should consume dog food");
assert(!Object.prototype.hasOwnProperty.call(result.world.reserve, "intel"), "hound scout must not restore retired resource fields");
assert(result.world.reserve.poacherPressure < before.poacherPressure, "hound scout should reduce poacher pressure");
assert(result.visual.dailyEconomy.net === 0, `ordinary patrol must not mint hidden fund; fund comes from explicit sample transfer, got ${result.visual.dailyEconomy.net}`);
assert(result.visual.actionOutcome.successChance >= 30 && result.visual.actionOutcome.successChance <= 92, `success chance should stay bounded, got ${result.visual.actionOutcome.successChance}`);
assert(Math.abs(result.world.reserve.guardianRun.rankDelta) <= 700, `daily rank movement should be capped, got ${result.world.reserve.guardianRun.rankDelta}`);

const weak = wardenState();
weak.world.reserve.poacherPressure = 70;
weak.world.reserve.supplies.alarm = 2;
const strong = clone(weak);
strong.world.reserve.__legacyClue = 2;
const weakResult = run("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", weak);
const strongResult = run("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", strong);
assert(strongResult.world.reserve.poacherPressure === weakResult.world.reserve.poacherPressure, "retired resource data must not secretly strengthen anti-poacher action");

state = wardenState();
state.world.reserve.fund = 620;
before = clone(state.world.reserve);
result = run("修复水源和草场：去东部河岸湿地修复水源", state);
const expectedHabitatCost = require("../js/balanceConfig").chapterEconomy(before).habitatCost;
const habitatTaskFund = ((result.visual.goalResult && result.visual.goalResult.rewards) || [])
  .filter((item) => item && item.type === "fund")
  .reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.amount) || 0)), 0);
assert(result.visual.actionFundCost.cost === expectedHabitatCost, "habitat cost must match chapter configuration");
assert(result.world.reserve.fund === before.fund - expectedHabitatCost + habitatTaskFund, "habitat must settle action cost once, then add any daily task fund reward");
assert(!habitatTaskFund || habitatTaskFund === 8, "daily ecology completion should grant exactly 8 fund");
game.state = wardenState();
game.ctx = createFakeContext();
game.width = 375;
game.height = 667;
const habitatSettlement = game.buildPatrolSettlement(before, result.world.reserve, result, "修复水源和草场：去东部河岸湿地修复水源");
const habitatRewardText = `${(habitatSettlement.rewards || []).join(" ")} ${(game.settlementRewardDisplayLines(habitatSettlement) || []).join(" ")}`;
assert(/行动成本 -90/.test(habitatRewardText), "settlement copy must show the habitat action cost separately");
if (habitatTaskFund) assert(/任务奖励 \+8|基金 \+8/.test(habitatRewardText), "settlement copy must show the daily task fund reward separately");
assert(result.world.reserve.ecology.water >= before.ecology.water, "habitat should not reduce water");
assert(result.world.reserve.ecology.grass > before.ecology.grass, "habitat should improve grass");

state = wardenState();
state.world.reserve.inventory.shedAntlerA = 1;
state.world.reserve.inventory.researchSample = 2;
before = clone(state.world.reserve);
result = run("出售仓库里的脱落岩角和研究样本", state);
assert(result.world.reserve.fund > before.fund, "salvage should increase fund");
assert(result.world.reserve.inventory.shedAntlerA < before.inventory.shedAntlerA, "salvage should consume recovered goods");

state = wardenState();
state.world.reserve.fund = 620;
before = clone(state.world.reserve);
result = run("采购狗粮包", state);
assert(result.world.reserve.fund < before.fund, "buy supplies should spend fund");
assert(result.world.reserve.supplies.dogFood > before.supplies.dogFood, "buy supplies should add dog food");
assert(result.world.reserve.supplies.fieldKit === before.supplies.fieldKit, "buy supplies should not add unrelated field kits");

state = wardenState();
state.world.reserve.supplies.tranquilizer = 2;
before = clone(state.world.reserve);
result = run("执行许可内生态干预：阻滞转移过度靠近水源的鹿", state);
assert(result.world.reserve.supplies.tranquilizer === before.supplies.tranquilizer - 1, "intervention should consume tranquilizer");
assert(!Object.prototype.hasOwnProperty.call(result.world.reserve, "intel"), "intervention must not restore retired resource fields");
assert(result.world.reserve.ecology.grass > before.ecology.grass, "intervention should improve grass");

const animalGame = new Game();
animalGame.stopLoop();
animalGame.render = () => {};
animalGame.toast = () => {};
animalGame.state = wardenState();
const animal = animalGame.state.world.knownCharacters.find((item) => item.species === "鹿");
animalGame.speakingAnimalId = animal.id;
const animalBefore = clone(animalGame.state.world.reserve);
const relationBefore = clone(animal.relation);
animalGame.performAnimalAction(animal, "calmObserve");
const animalAfter = animalGame.state.world.knownCharacters.find((item) => item.id === animal.id);
assert(!Object.prototype.hasOwnProperty.call(animalGame.state.world.reserve, "actionPoints"), "light animal care should not restore retired action field");
assert(animalAfter.relation.trust > relationBefore.trust, "light animal care should improve trust");
assert(!animalGame.animalActionStatus("calmObserve", animal).canRun, "same animal care should be once per day");

const leagueGame = new Game();
leagueGame.stopLoop();
leagueGame.render = () => {};
leagueGame.toast = () => {};
leagueGame.state = wardenState();
leagueGame.state.world.reserve.base.raidTickets = 1;
leagueGame.state.world.reserve.supplies.dogFood = 1;
leagueGame.selectedRivalId = "base_sun";
withRandom(0, () => leagueGame.raidRival());
assert(!Object.prototype.hasOwnProperty.call(leagueGame.state.world.reserve, "fieldPermits"), "removed border patrol must not restore retired permit fields");
assert(leagueGame.state.world.reserve.supplies.dogFood === 1, "removed border patrol must not consume dog food");
assert(!((leagueGame.state.world.reserve.social || {}).migrationDelta > 0), "removed border patrol must not influence migration");

leagueGame.state.world.reserve.fund = 1000;
leagueGame.state.world.reserve.inventory.recoveredTrap = 1;
const shieldBefore = leagueGame.state.world.reserve.base.shield;
leagueGame.upgradeShield();
assert(leagueGame.state.world.reserve.base.shield === shieldBefore, "removed fortify must not increase shield");
assert(leagueGame.state.world.reserve.inventory.recoveredTrap === 1, "removed fortify must not consume trap evidence");

const longState = wardenState();
[
  "猎犬侦察：让砾灰沿中央混交林闻一圈",
  "驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影",
  "修复水源和草场：去东部河岸湿地修复水源",
  "出售仓库里的脱落岩角和研究样本",
  "采购狗粮包"
].forEach((command) => {
  const step = run(command, longState);
  longState.world = step.world;
  longState.character = step.character;
});

const finalReserve = longState.world.reserve;
assert(finalReserve.fund >= 0, "fund should not become negative in loop");
nonNegativeObject(finalReserve.supplies, "final supplies");
nonNegativeObject(finalReserve.inventory, "final inventory");
["safety", "stability", "reputation", "enforcement", "poacherPressure"].forEach((key) => inRange(finalReserve[key], 0, 100, `final ${key}`));
["water", "grass", "disease"].forEach((key) => inRange(finalReserve.ecology[key], 0, 100, `final ecology.${key}`));
inRange(reserveProgressionFor(finalReserve).level, 1, 5, "final progression level");

console.log("system balance check ok");
