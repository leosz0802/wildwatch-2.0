// 验证 Step 3 昼夜/天气影响：weatherMod 方向、nextWeather 闭合、applyAction 接入、simulateDay 报告
const { weatherMod, nextWeather, WEATHER_CYCLE, applyAction, simulateDay } = require("../js/simulator");
const { createInitialWorld } = require("../js/world");
const { animals } = require("../js/animals");

// 1. weatherMod 数值方向
if (weatherMod("小雨").drinkBonus <= 0) throw new Error("雨天 drinkBonus 应为正");
if (weatherMod("小雨").staminaCost <= 0) throw new Error("雨天 staminaCost 应为正");
if (weatherMod("雾").scoutStamina <= 0) throw new Error("雾天 scoutStamina 应为正（更累）");
if (weatherMod("雾").hideStamina <= 0) throw new Error("雾天 hideStamina 应为正（更省）");
if (weatherMod("晴").scoutStamina >= 0) throw new Error("晴天 scoutStamina 应为负（更省）");
if (weatherMod("晴").huntHealthRisk <= 0) throw new Error("晴天 huntHealthRisk 应为正（暴露）");
if (weatherMod("阴").staminaCost !== 0) throw new Error("阴天应无修正");
if (weatherMod("未知").staminaCost !== 0) throw new Error("未知天气应无修正");

// 2. nextWeather 闭合 + 覆盖全 4 态（链式：输出作下一轮输入）
const seen = new Set();
let cur = "小雨";
for (let i = 0; i < 300; i += 1) {
  cur = nextWeather(cur);
  if (!WEATHER_CYCLE.includes(cur)) throw new Error(`nextWeather 返回了非法天气：${cur}`);
  seen.add(cur);
}
if (seen.size !== 4) throw new Error(`300 次链式应覆盖全 4 态，实际 ${seen.size}`);

// 3. applyAction 天气效果（同一起点、同一动作、仅天气不同）
function baseChar(species, tier) {
  return {
    species, tier,
    hunger: 50, thirst: 50, stamina: 80, health: 80,
    rule: { hungerRate: 12, thirstRate: 16, staminaCost: 8 }
  };
}
const loc = "东部河岸湿地";

const rainDrink = applyAction(baseChar("鹿", "prey"), "drink", loc, null, weatherMod("小雨"));
const overcastDrink = applyAction(baseChar("鹿", "prey"), "drink", loc, null, weatherMod("阴"));
if (rainDrink.thirst >= overcastDrink.thirst) {
  throw new Error(`雨天饮水应更解渴：雨 ${rainDrink.thirst} vs 阴 ${overcastDrink.thirst}`);
}

const fogScout = applyAction(baseChar("狼", "apex"), "scout", loc, null, weatherMod("雾"));
const clearScout = applyAction(baseChar("狼", "apex"), "scout", loc, null, weatherMod("晴"));
if (fogScout.stamina >= clearScout.stamina) {
  throw new Error(`雾天侦察应更累：雾 ${fogScout.stamina} vs 晴 ${clearScout.stamina}`);
}

const fogHide = applyAction(baseChar("兔子", "prey"), "hide", loc, null, weatherMod("雾"));
const overcastHide = applyAction(baseChar("兔子", "prey"), "hide", loc, null, weatherMod("阴"));
if (fogHide.stamina <= overcastHide.stamina) {
  throw new Error(`雾天躲藏应更省力：雾 ${fogHide.stamina} vs 阴 ${overcastHide.stamina}`);
}

const clearHunt = applyAction(baseChar("狼", "apex"), "hunt", loc, null, weatherMod("晴"));
const overcastHunt = applyAction(baseChar("狼", "apex"), "hunt", loc, null, weatherMod("阴"));
if (clearHunt.health >= overcastHunt.health) {
  throw new Error(`晴天狩猎暴露应掉血：晴 ${clearHunt.health} vs 阴 ${overcastHunt.health}`);
}

// 4. simulateDay 产出合法天气 + 个人报告含天气提示
const animal = animals[0];
const state = {
  world: createInitialWorld(),
  character: Object.assign(baseChar(animal.species, animal.tier), {
    animalId: animal.id,
    animalName: animal.defaultName,
    location: animal.startLocation,
    rank: 4
  }),
  reports: [],
  messages: []
};
const result = simulateDay("去东部河岸喝水，但尽量避开狼", state);
if (!WEATHER_CYCLE.includes(result.world.weather)) {
  throw new Error(`simulateDay 产出的天气非法：${result.world.weather}`);
}
const priv = result.reports.find((r) => r.type === "private");
if (!priv || !priv.body.includes("天气：")) {
  throw new Error("个人报告应包含天气提示");
}

console.log("weather effect check ok");
