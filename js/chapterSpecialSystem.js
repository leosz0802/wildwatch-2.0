"use strict";

const { recordFundChange } = require("./fundLedger");
const { recordIncrease, recordDecrease } = require("./animalSourceLedger");
const { livingAnimalTotal, chapterCaptiveSpeciesSet } = require("./chapterRescueSystem");
const { applyChapterVisitorDelta } = require("./chapterTargets");
const { getChapterSandboxSpecies, speciesPopulationGroup, SPECIES_DB } = require("./animalWorld");

const UNLOCK_DELAY_MS = 60000;
const ARCHERY_SUCCESS = 3;
const DICE_SUCCESS = 4;

const METRIC_LABELS = Object.freeze({
  visitors: "游客",
  animals: "动物数量",
  water: "水源",
  grass: "草地",
  fund: "保护基金"
});

function n(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function chapterOf(reserve = {}) {
  const progression = reserve.progression || {};
  return clamp(progression.stage || progression.displayChapter || 1, 1, 20);
}

function spec(chapter, story, task, storyBody, taskBody, mode, metrics, success, fail, skipCards) {
  return Object.freeze({
    chapter,
    storyTitle: story,
    taskTitle: task,
    storyBody,
    taskBody,
    mode,
    metrics: Object.freeze(metrics.slice(0, 2)),
    success: Object.freeze(Object.assign({}, success)),
    fail: Object.freeze(Object.assign({}, fail)),
    skipCards: Object.freeze(skipCards.slice())
  });
}

const CATALOG = Object.freeze([
  spec(1, "退潮脚印", "浅滩第一标", "晨角带着鹿群试泥岸，野兔先缩洞。乌鸦已经记住人留下的气味。", "把警戒标钉在鹿群敢靠近、又不封死野兔洞口的位置。", "archery", ["animals", "water"], { animals: 8, water: 3 }, { animals: -5, water: -2 }, ["lion_antelope_truce", "crocodile_zebra_shallows"]),
  spec(2, "排队还是拱泥", "错峰水线", "斑马要列队喝水，野猪拱开浅滩，两条习性叠在同一条水线上。", "把错峰标射到浅滩外侧，决定今夜谁先用水线。", "archery", ["water", "grass"], { water: 5, grass: 4 }, { water: -4, grass: -3 }, ["leopard_antelope_shadow", "crow_vulture_carrion"]),
  spec(3, "天空接管线索", "高旋分流", "火烈鸟挤满水边，鹰看见拥堵，幼鸟开始互相踩踏。", "按鹰指出的空档把观鸟线拉开。", "archery", ["visitors", "water"], { visitors: 18, water: 3 }, { visitors: -12, water: -3 }, ["boar_deer_grassland", "wilddog_zebra_chase"]),
  spec(4, "草场开始说话", "巡界让路", "狮群要公开巡界，豹子要沿灌木独行，两条捕食路线压在草场上限上。", "把让路标射到巡界线外，给豹子留下灌木廊。", "archery", ["animals", "grass"], { animals: 8, grass: 6 }, { animals: -8, grass: -5 }, ["hippo_egret_shore", "crow_vulture_carrion"]),
  spec(5, "消息比脚印快", "长颈视线", "黑铃把安静的消息传开，长颈鹿把脖子伸进游客相机里。", "把相机线从长颈鹿咽喉高度压下去。", "archery", ["visitors", "fund"], { visitors: 18, fund: 60 }, { visitors: -12, fund: -40 }, ["deer_wolf_waterline", "boar_deer_grassland"]),
  spec(6, "回路中央的尸体", "厚掌清场", "熊要清场进食，秃鹫要等它离开。草甸第一次自己产生秩序。", "把退后标射到清场线外，让熊看见空出的距离。", "archery", ["animals", "grass"], { animals: 12, grass: 5 }, { animals: -10, grass: -4 }, ["lion_antelope_truce", "leopard_antelope_shadow"]),
  spec(7, "被忘掉的水路", "旧河开口", "云耳记得旧河道，河马占住新塘。幼象挤不进身体墙。", "把拦水残桩精确打断，给幼象留一条侧槽。", "archery", ["animals", "water"], { animals: 14, water: 7 }, { animals: -8, water: -6 }, ["crow_vulture_carrion", "deer_wolf_waterline"]),
  spec(8, "谁来定核心区", "岸线休战", "鳄鱼宣布水在我就在，野犬要沿岸带幼崽。核心区第一次有了否决权。", "把借岸标射到安全水线，给野犬幼崽留下通道。", "archery", ["water", "fund"], { water: 4, fund: 80 }, { water: -5, fund: -50 }, ["boar_deer_grassland", "lion_antelope_truce"]),
  spec(9, "浅滩连上外面", "气味封口", "霜脊把路探出去，狐狸把游客气味当成新领地。", "把狐狸标在迁徙口外的气味桩射偏拆掉。", "archery", ["visitors", "animals"], { visitors: 18, animals: 10 }, { visitors: -12, animals: -8 }, ["hippo_egret_shore", "crow_vulture_carrion"]),
  spec(10, "样板背后的角", "夜盗偏角", "阔盾愿意留下，夜盗冲着角来；穿山甲把洞挖在步道下面。", "对空示警，把盗猎灯驱离犀牛背侧。", "archery", ["animals", "fund"], { animals: 16, fund: 120 }, { animals: -12, fund: -80 }, ["deer_wolf_waterline", "boar_deer_grassland"]),
  spec(11, "夜里也要能跑", "留一条夜廊", "风点需要一条不被探照灯切开的夜跑廊。联防越严，猎豹越看不见路。", "把关灯标射到夜廊入口，让联防留出一段黑暗。", "archery", ["visitors", "animals"], { visitors: 18, animals: 14 }, { visitors: -12, animals: -10 }, ["crocodile_zebra_shallows", "hippo_egret_shore"]),
  spec(12, "网要留缝", "网眼借路", "鬣影带队清理残骸，却被新围栏堵在网眼里。", "射断一处多余锁扣，给鬣狗留缝。", "archery", ["visitors", "grass"], { visitors: 18, grass: 4 }, { visitors: -12, grass: -6 }, ["lion_antelope_truce", "deer_wolf_waterline"]),
  spec(13, "少一点声音", "静栖抽签", "夜羽要求巡护队把脚步放慢。你越解释，猫头鹰越不降落。", "把静栖标射到林冠线外，提醒巡护队今夜退场。", "archery", ["visitors", "fund"], { visitors: 18, fund: 90 }, { visitors: -12, fund: -50 }, ["wilddog_zebra_chase", "boar_deer_grassland"]),
  spec(14, "沉牙归位", "边界目视", "狼群回来不是来被管理，而是来看系统还在不在。", "把归位标射到边界旧路，让沉牙看清入口仍在。", "archery", ["grass", "fund"], { grass: 4, fund: 100 }, { grass: -3, fund: -60 }, ["crocodile_zebra_shallows", "hippo_egret_shore"]),
  spec(15, "守护者离开之后", "空岗一夜", "没有新物种，只有旧路会不会自己走完。", "把空岗信标射到巡线终点，检验共同体能否接力。", "archery", ["visitors", "grass"], { visitors: 18, grass: 3 }, { visitors: -12, grass: -5 }, ["leopard_antelope_shadow", "crow_vulture_carrion"]),
  spec(16, "涨落改了风景", "潮窗开口", "浮须要岸边留空，鹈鹕要涨潮时落满浅洲。游客跟着水鸟走。", "在落潮窗口把游线桩射到洲外。", "archery", ["visitors", "water"], { visitors: 18, water: 6 }, { visitors: -12, water: -5 }, ["lion_antelope_truce", "boar_deer_grassland"]),
  spec(17, "先学会不惊动树", "抬高视线", "长臂在你看见它之前就已经看见你。巨嘴鸟把果实交换叠在拍照枝上。", "把低处观景铃射到林冠走道。", "archery", ["grass", "fund"], { grass: 5, fund: 140 }, { grass: -4, fund: -90 }, ["deer_wolf_waterline", "wilddog_zebra_chase"]),
  spec(18, "灯暗一点", "低光窗口", "灰鼻要低光，夜莺要一段不被手电切开的歌声。", "把低光标射到观察线外，让游客关灯十分钟。", "archery", ["water", "grass"], { water: 5, grass: 3 }, { water: -4, grass: -4 }, ["crocodile_zebra_shallows", "lion_antelope_truce"]),
  spec(19, "边界不是墙", "错峰过界", "宽肩要一条能一起走的路，鹤要浅沼不被牛群踏浑。", "把过界旗射到鹤沼外侧的牛道。", "archery", ["water", "fund"], { water: 6, fund: 150 }, { water: -6, fund: -90 }, ["boar_deer_grassland", "crow_vulture_carrion"]),
  spec(20, "下一轮从谁开始", "旗舰点名", "没有终点物种，只有你选哪一种旗舰领下一轮。", "把点名标射向轮换池，确认本轮旗舰停留方向。", "archery", ["animals", "fund"], { animals: 24, fund: 180 }, { animals: -16, fund: -100 }, ["hippo_egret_shore", "leopard_antelope_shadow"])
]);

function chapterSpecialDef(chapter = 1) {
  const index = clamp(chapter, 1, 20) - 1;
  return CATALOG[index] || CATALOG[0];
}

function skippedCardStories(chapter = 1) {
  return (chapterSpecialDef(chapter).skipCards || []).slice(0, 2);
}

function eventChainStoryBeatsForStage(stage = 1) {
  const chapter = clamp(stage, 1, 20);
  if (chapter % 2 === 1 && chapter < 15) return 2;
  return 5;
}

function emptyState(chapter, now) {
  return {
    version: 1,
    chapter: clamp(chapter, 1, 20),
    enteredAt: Number(now) || Date.now(),
    unlocked: false,
    offered: false,
    completed: false,
    success: null,
    roll: 0,
    changes: []
  };
}

function normalizeChapterSpecial(reserve = {}, now = Date.now()) {
  const chapter = chapterOf(reserve);
  const previous = reserve.chapterSpecial || {};
  const sameChapter = clamp(previous.chapter || 0, 0, 20) === chapter;
  const state = sameChapter
    ? Object.assign(emptyState(chapter, previous.enteredAt || now), previous, { chapter })
    : emptyState(chapter, now);
  reserve.chapterSpecial = state;
  return state;
}

function chapterSpecialStatus(reserve = {}, now = Date.now()) {
  const state = normalizeChapterSpecial(reserve, now);
  const def = chapterSpecialDef(state.chapter);
  const elapsed = Math.max(0, (Number(now) || Date.now()) - (Number(state.enteredAt) || now));
  const ready = elapsed >= UNLOCK_DELAY_MS;
  if (ready && !state.unlocked) state.unlocked = true;
  return {
    def,
    state,
    elapsed,
    ready,
    available: !!(state.unlocked && !state.completed),
    remainingMs: Math.max(0, UNLOCK_DELAY_MS - elapsed)
  };
}

function livingCandidates(reserve = {}) {
  const chapter = chapterOf(reserve);
  const captive = chapterCaptiveSpeciesSet(reserve);
  const ecology = reserve.ecology || {};
  const list = [];
  getChapterSandboxSpecies(chapter).forEach((species) => {
    const id = species && species.id ? species.id : species;
    if (!id || captive.has(id)) return;
    const group = speciesPopulationGroup(id);
    const pop = n((ecology[group] || {})[id]);
    if (pop <= 0) return;
    const maxPop = Math.max(1, n((SPECIES_DB[id] || {}).maxPop) || 999);
    list.push({ id, group, pop, maxPop });
  });
  return list.sort((a, b) => b.pop - a.pop);
}

function applyAnimalDelta(reserve, delta) {
  const before = n(livingAnimalTotal(reserve));
  const ecology = reserve.ecology || (reserve.ecology = {});
  const wanted = Math.round(Number(delta) || 0);
  if (!wanted) return { before, after: before, delta: 0 };
  if (wanted > 0) {
    const candidates = livingCandidates(reserve);
    let added = 0;
    for (let index = 0; index < wanted; index += 1) {
      const open = candidates.filter((item) => item.pop < item.maxPop);
      if (!open.length) break;
      const pick = open[added % open.length];
      const bucket = ecology[pick.group] || (ecology[pick.group] = {});
      pick.pop += 1;
      bucket[pick.id] = pick.pop;
      added += 1;
    }
    if (added) recordIncrease(reserve, "tasked", added);
    const after = n(livingAnimalTotal(reserve));
    return { before, after, delta: after - before };
  }
  const candidates = livingCandidates(reserve).filter((item) => item.pop > 1);
  let removed = 0;
  const need = Math.abs(wanted);
  for (let index = 0; index < need; index += 1) {
    const open = candidates.filter((item) => item.pop > 1);
    if (!open.length) break;
    const pick = open[removed % open.length];
    const bucket = ecology[pick.group] || (ecology[pick.group] = {});
    pick.pop -= 1;
    bucket[pick.id] = pick.pop;
    removed += 1;
  }
  if (removed) recordDecrease(reserve, "emigrated", removed);
  const after = n(livingAnimalTotal(reserve));
  return { before, after, delta: after - before };
}

function applyVisitorDelta(reserve, delta) {
  const wanted = Math.round(Number(delta) || 0);
  const applied = applyChapterVisitorDelta(reserve, wanted, wanted >= 0 ? "task" : "loss");
  return { before: applied.before, after: applied.after, delta: applied.delta };
}

function applyFundDelta(reserve, delta) {
  const before = n(reserve.fund);
  const next = Math.max(0, before + Math.round(Number(delta) || 0));
  reserve.fund = next;
  recordFundChange(reserve, before, next, "本章特别任务", ((reserve.guardianCycle || {}).day) || 0, "特别任务结算");
  return { before, after: next, delta: next - before };
}

function applyHabitatDelta(reserve, key, delta) {
  const ecology = reserve.ecology || (reserve.ecology = {});
  const before = clamp(ecology[key] || 0, 0, 100);
  const after = clamp(before + Math.round(Number(delta) || 0), 0, 100);
  ecology[key] = after;
  return { before, after, delta: after - before };
}

function applySpecialMetric(reserve, metric, delta) {
  if (metric === "animals") return Object.assign({ metric, unit: "只" }, applyAnimalDelta(reserve, delta));
  if (metric === "visitors") return Object.assign({ metric, unit: "人" }, applyVisitorDelta(reserve, delta));
  if (metric === "fund") return Object.assign({ metric, unit: "星币" }, applyFundDelta(reserve, delta));
  if (metric === "water" || metric === "grass") return Object.assign({ metric, unit: "" }, applyHabitatDelta(reserve, metric, delta));
  return { metric, before: 0, after: 0, delta: 0, unit: "" };
}

function rollSuccess(def, roll) {
  const value = clamp(roll, 1, 6);
  return def.mode === "archery" ? value >= ARCHERY_SUCCESS : value >= DICE_SUCCESS;
}

function applyChapterSpecialReward(reserve = {}, roll = 4, now = Date.now()) {
  const status = chapterSpecialStatus(reserve, now);
  if (!status.available) return { ok: false, reason: status.state.completed ? "completed" : "locked", status };
  const def = status.def;
  const success = rollSuccess(def, roll);
  const table = success ? def.success : def.fail;
  const changes = def.metrics.map((metric) => applySpecialMetric(reserve, metric, table[metric] || 0));
  const state = status.state;
  state.completed = true;
  state.success = success;
  state.roll = clamp(roll, 1, 6);
  state.changes = changes;
  reserve.chapterSpecial = state;
  return { ok: true, success, roll: state.roll, def, changes, status: chapterSpecialStatus(reserve, now) };
}

function markChapterSpecialOffered(reserve = {}, now = Date.now()) {
  const status = chapterSpecialStatus(reserve, now);
  if (status.available && !status.state.offered) status.state.offered = true;
  return status;
}

function changeSummary(changes = []) {
  return (changes || []).map((item) => {
    const label = METRIC_LABELS[item.metric] || item.metric;
    const sign = item.delta > 0 ? "+" : "";
    return `${label} ${sign}${item.delta}${item.unit || ""}`;
  }).join(" · ");
}

module.exports = {
  UNLOCK_DELAY_MS,
  ARCHERY_SUCCESS,
  DICE_SUCCESS,
  METRIC_LABELS,
  CATALOG,
  chapterSpecialDef,
  skippedCardStories,
  eventChainStoryBeatsForStage,
  normalizeChapterSpecial,
  chapterSpecialStatus,
  applySpecialMetric,
  applyChapterSpecialReward,
  markChapterSpecialOffered,
  changeSummary,
  rollSuccess
};
