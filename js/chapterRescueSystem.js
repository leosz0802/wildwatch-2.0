'use strict';
const { CHAPTERS, getSpeciesById, speciesPopulationGroup } = require('./animalWorld');
const RESCUE_VERSION = 10;
const CHAPTER_RESCUE_TARGET_SCORE = 12;
const POACHER_RESCUE_TARGET_SCORE = 10;
const CHAPTER_RESCUE_MAP_SLOTS = Object.freeze([
  [0.40, 0.46], [0.62, 0.60], [0.32, 0.62], [0.66, 0.40], [0.30, 0.52], [0.54, 0.66]
]);
const POACHER_RESCUE_MAP_SLOTS = Object.freeze([
  [0.76, 0.30], [0.78, 0.52], [0.48, 0.24], [0.24, 0.74]
]);
function chapterRescueMapSlot(index = 0) {
  const slot = CHAPTER_RESCUE_MAP_SLOTS[Math.max(0, Number(index) || 0) % CHAPTER_RESCUE_MAP_SLOTS.length];
  return { x: slot[0], y: slot[1] };
}
function poacherRescueMapSlot(index = 0) {
  const slot = POACHER_RESCUE_MAP_SLOTS[Math.max(0, Number(index) || 0) % POACHER_RESCUE_MAP_SLOTS.length];
  return { x: slot[0], y: slot[1] };
}
const RESCUE_ITEM_CATALOG = Object.freeze([
 {id:'rescue_reed_cord',label:'芦苇绳',icon:'leaf',source:'浅滩探索',story:'柔韧的芦苇绳可以固定笼门，又不会割伤动物。'},
 {id:'rescue_quiet_water_tag',label:'安静水标',icon:'water',source:'水源观察',story:'安静水标能让巡护队避开动物幼崽藏身的水线。'},
 {id:'rescue_field_key',label:'旧锁钥片',icon:'key',source:'巡护回收',story:'钥片来自旧围栏，拼回它才能打开安全出口。'},
 {id:'rescue_night_lamp',label:'低光引路灯',icon:'eye',source:'夜间探索',story:'低光不会惊扰夜行动物，却能照亮解救路线。'},
 {id:'rescue_scent_cloth',label:'熟悉气味布',icon:'paw',source:'动物互动',story:'熟悉的气味能让受惊动物相信出口外没有追捕者。'},
 {id:'rescue_leaf_seal',label:'叶纹通行牌',icon:'leaf',source:'线索室',story:'叶纹通行牌证明这次解救已经获得保护区许可。'}
]);
function rescueItemById(id){return RESCUE_ITEM_CATALOG.find(x=>x.id===id)||null;}
function rescueStoryFor(record={}){const name=record.speciesName||record.speciesId||'这只动物';const items=(record.requiredItems||[]).map(id=>(rescueItemById(id)||{}).label||id).filter(Boolean).join('、')||'所需物品';return {title:`${name}的回家路`,paragraphs:[`${name}被旧围栏困在地图边缘，不是自然迁徙。`,`收齐${items}后，就可以不惊扰地打开出口。`,`${name}回到保护区，并记入水源、草场和游客观察。`]};}
function targetCount(chapter){return chapter>=10?2:1;}
function chapterDefinition(chapterNumber=1){
  const n=Number(chapterNumber)||1;
  const chapter=CHAPTERS.find(x=>x.chapter===n)||CHAPTERS[0];
  const current=Array.isArray(chapter.newSpecies)?chapter.newSpecies.slice():[];
  const opening=new Set(["deer","antelope","hare","crow","wolf","zebra","boar"]);
  const novel=current.filter((id)=>!opening.has(id));
  // Every species first introduced by a chapter must have a deterministic
  // unlock path. Earlier chapters used to make only one of two new species
  // captive and silently seed the other one, which could leave saves short of
  // actionable chapter unlocks. Preserve the legacy first-task order in
  // chapters 3–9, but append the former starter as an additional required
  // unlock.
  if (novel.length) {
    const targets = n < 10 && novel.length > 1
      ? novel.slice(1).concat(novel.slice(0, 1))
      : novel.slice();
    const starter=current.filter((id)=>!targets.includes(id));
    return {chapter:chapter.chapter,title:chapter.title,starter,targets,captive:targets.slice()};
  }
  const primary=current.length?[current[0]]:(chapter.keyAnimal?[chapter.keyAnimal]:[]);
  const rest=current.filter(id=>!primary.includes(id));
  const targets=rest.slice(0,targetCount(n));
  const starter=primary.concat(rest.filter(id=>!targets.includes(id)));
  const captive=targets.slice();
  return {chapter:chapter.chapter,title:chapter.title,starter,targets,captive};
}
function requiredItemsFor(speciesId,chapterNumber=1,index=0){const first=RESCUE_ITEM_CATALOG[(Number(chapterNumber)+index)%RESCUE_ITEM_CATALOG.length];return [first.id];}
function rescuePointTarget(record={}, itemId="") {
  if (!record || !(record.requiredItems || []).includes(itemId)) return 0;
  const explicit = Number(record.pointTarget);
  return Math.max(1, Math.round(Number.isFinite(explicit) && explicit > 0
    ? explicit
    : (record.recurring ? POACHER_RESCUE_TARGET_SCORE : CHAPTER_RESCUE_TARGET_SCORE)));
}
function findRecord(state,id){const animals=state.animals||{};if(animals[id])return animals[id];return Object.values(animals).find(r=>r&&(r.targetId===id||r.speciesId===id))||null;}
function isChapterRescueSpecies(speciesId, chapterNumber = 1) {
  return chapterDefinition(chapterNumber).targets.includes(speciesId);
}
function chapterCaptiveSpeciesSet(reserve = {}) {
  const ids = new Set();
  const state = reserve.chapterRescue || {};
  if (state.enforceCompletion === false || state.legacyGateBypass === true) return ids;
  // The target id changed across rescue revisions.  A rescued animal can
  // therefore have a valid completion entry even when a rebuilt task record
  // still says "captive".  Treat the completion ledger as authoritative so
  // an already released species is never deducted from the species counter.
  const completed = state.completedTargets || {};
  const completedSpecies = new Set(Object.values(completed)
    .filter((entry) => entry && entry.speciesId && Number(entry.rescuedAt) > 0)
    .map((entry) => entry.speciesId));
  Object.entries(completed).forEach(([key, entry]) => {
    if (!entry || Number(entry.rescuedAt) <= 0) return;
    const match = String(key).match(/^chapter:(\d+):rescue:(\d+)$/);
    if (!match) return;
    const targets = chapterDefinition(Number(match[1])).targets;
    const speciesId = targets[Math.max(0, Number(match[2]) - 1)];
    if (speciesId) completedSpecies.add(speciesId);
  });
  const add = (record, fallbackId) => {
    const id = (record && record.speciesId) || fallbackId;
    const targetId = record && record.targetId;
    const completedRecord = (targetId && completed[targetId]) || (id && completed[id]);
    if (id && (!record || record.status !== "rescued")
      && !completedRecord && !completedSpecies.has(id)) ids.add(id);
  };
  Object.values(state.animals || {}).forEach((record) => add(record));
  (state.targets || []).forEach((record) => add(record));
  const hasRecords = Object.keys(state.animals || {}).length > 0 || (state.targets || []).length > 0;
  if (!hasRecords) {
    const chapter = Math.max(1, Math.round(Number(state.chapter || (reserve.progression || {}).stage || (reserve.progression || {}).displayChapter || 1)));
    chapterDefinition(chapter).captive.forEach((id) => add(null, id));
  }
  return ids;
}
function captiveSpeciesSet(reserve = {}) {
  const ids = chapterCaptiveSpeciesSet(reserve);
  const add = (record) => {
    if (record && record.speciesId && record.status !== "rescued") ids.add(record.speciesId);
  };
  (((reserve.poacherRescue || {}).active) || []).forEach(add);
  return ids;
}
function chapterCaptiveRecord(reserve = {}, speciesId) {
  const state = reserve.chapterRescue || {};
  return findRecord(state, speciesId)
    || (state.targets || []).find((record) => record && record.speciesId === speciesId)
    || null;
}
function chapterCaptiveDisplayCount(reserve, speciesId, value) {
  const pop = Math.max(0, Number(value) || 0);
  const record = chapterCaptiveRecord(reserve, speciesId);
  if (record && record.preserveResidentPopulation && pop > 1) return pop;
  return 1;
}
function livingAnimalTotal(reserve = {}) {
  const ecology = reserve.ecology || {};
  const chapterCaptive = chapterCaptiveSpeciesSet(reserve);
  const animals = [ecology.predators, ecology.herbivores, ecology.birds].reduce((sum, group) => (
    sum + Object.entries(group || {}).reduce((n, [id, value]) => {
      if (chapterCaptive.has(id)) return n + chapterCaptiveDisplayCount(reserve, id, value);
      return n + Math.max(0, Number(value) || 0);
    }, 0)
  ), 0);
  const missingCaptives = [...chapterCaptive].reduce((n, id) => {
    const group = speciesPopulationGroup(id);
    return n + (Object.prototype.hasOwnProperty.call((ecology[group] || {}), id) ? 0 : 1);
  }, 0);
  return animals + missingCaptives;
}
function clampChapterCaptivePopulations(reserve = {}) {
  const ecology = reserve.ecology || (reserve.ecology = {});
  chapterCaptiveSpeciesSet(reserve).forEach((id) => {
    const group = speciesPopulationGroup(id);
    const bucket = ecology[group] = ecology[group] || {};
    const record = chapterCaptiveRecord(reserve, id);
    const current = Math.max(0, Number(bucket[id]) || 0);
    if (record && record.preserveResidentPopulation && current > 1) return;
    bucket[id] = 1;
  });
  return reserve;
}
function poacherRescueState(reserve = {}) {
  const state = reserve.poacherRescue && typeof reserve.poacherRescue === 'object' ? reserve.poacherRescue : {};
  state.version = 1;
  state.active = Array.isArray(state.active) ? state.active : [];
  state.history = Array.isArray(state.history) ? state.history.slice(-24) : [];
  state.cooldownUntilDay = Math.max(0, Number(state.cooldownUntilDay) || 0);
  state.pendingEvent = state.pendingEvent && typeof state.pendingEvent === 'object' ? state.pendingEvent : null;
  state.active.forEach(record => {
    if (!record) return;
    if (Array.isArray(record.requiredItems) && record.requiredItems.length > 1) record.requiredItems = [record.requiredItems[0]];
    if (Array.isArray(record.requiredItems) && record.requiredItems.length) {
      if (typeof record.taskVisible !== 'boolean') record.taskVisible = true;
      record.pointTarget = 10;
      record.pointProgress = Object.assign({}, record.pointProgress || {});
      const itemId = record.requiredItems[0];
      record.pointProgress[itemId] = Math.min(10, Math.max(0, Math.round(Number(record.pointProgress[itemId]) || 0)));
    }
  });
  const chapterState = reserve.chapterRescue || {};
  state.history.forEach(event => {
    if (!event || event.status !== 'rescued' || !(Number(event.rescuedAt) > 0)
      || Number(event.chapter) !== Number(chapterState.chapter)
      || !isChapterRescueSpecies(event.speciesId, event.chapter)) return;
    Object.values(chapterState.animals || {}).concat(chapterState.targets || []).forEach(record => {
      if (!record || record.legacyOnly || record.speciesId !== event.speciesId
        || Number(record.chapter) !== Number(event.chapter) || record.status === 'rescued') return;
      record.status = 'rescued';
      record.rescuedAt = Number(event.rescuedAt);
      record.completionSource = event.targetId;
      invalidateRescueCache(reserve);
    });
  });
  state.active = state.active.filter(record => {
    if (!record || record.status === 'rescued' || !Number(record.chapter)
      || !isChapterRescueSpecies(record.speciesId, record.chapter)) return true;
    const chapter = reserve.chapterRescue || {};
    const chapterRecord = Number(chapter.chapter) === Number(record.chapter)
      ? findRecord(chapter, record.speciesId) : null;
    if (chapterRecord && chapterRecord.status === 'rescued'
      || Number(chapter.chapter) > Number(record.chapter)) {
      const group = speciesPopulationGroup(record.speciesId);
      reserve.ecology = reserve.ecology || {};
      const bucket = reserve.ecology[group] = reserve.ecology[group] || {};
      bucket[record.speciesId] = Math.max(0, Number(bucket[record.speciesId]) || 0) + Math.max(1, Math.round(Number(record.capturedCount) || 1));
    }
    if (state.pendingEvent && state.pendingEvent.targetId === record.targetId) state.pendingEvent = null;
    state.superseded = (Array.isArray(state.superseded) ? state.superseded : [])
      .concat(Object.assign({}, record, { status: 'superseded', reason: 'chapter-rescue-species' })).slice(-24);
    return false;
  });
  reserve.poacherRescue = state;
  return state;
}
function nextPoacherRescue(reserve={}){return poacherRescueState(reserve).active.find(record=>record&&record.status!=='rescued'&&record.taskVisible!==false)||null;}
function createPoacherRescue(reserve={},speciesId,chapterNumber=1,day=1){if(isChapterRescueSpecies(speciesId,chapterNumber))return null;const state=poacherRescueState(reserve);const currentDay=Math.max(0,Number(day)||0);if(state.cooldownChapter===Number(chapterNumber)&&state.cooldownUntilDay>currentDay||state.active.some(record=>record&&record.status!=='rescued'))return null;if(state.active.filter(record=>record&&record.status!=='rescued').length>=3||state.history.filter(record=>record&&Number(record.chapter)===Number(chapterNumber)).length>=3)return null;const species=getSpeciesById(speciesId);if(!species)return null;const targetId=`poacher:${day}:${speciesId}:${state.history.length+state.active.length+1}`;const required=requiredItemsFor(speciesId,chapterNumber,state.active.length);reserve.ecology=reserve.ecology||{};const group=speciesPopulationGroup(speciesId);const bucket=reserve.ecology[group]=reserve.ecology[group]||{};const current=Math.max(0,Math.round(Number(bucket[speciesId])||0));if(current<1)return null;const capturedCount=1;bucket[speciesId]=current-capturedCount;const record={targetId,id:targetId,speciesId,speciesName:species.name,chapter:chapterNumber,status:'captive',createdDay:currentDay,requiredItems:required,pointTarget:10,pointProgress:{},taskVisible:false,collectedItems:{},itemFailures:{},itemAttempts:{},rescuedAt:0,letterIssued:false,recurring:true,capturedCount,sourceExploration:(rescueItemById(required[0])||{}).source||'巡护回收',map:poacherRescueMapSlot(state.active.length)};state.active.push(record);state.pendingEvent={targetId:record.targetId,speciesId:record.speciesId,speciesName:record.speciesName,day:currentDay};return record;}
function findPoacherRescue(reserve={},id){const state=poacherRescueState(reserve);return state.active.find(record=>record&&(record.targetId===id||record.id===id||record.speciesId===id))||null;}
function buildChapterRescueRecord(reserve = {}, speciesId = "", chapterNumber = 1, index = 0, prior = {}, options = {}) {
  const species = getSpeciesById(speciesId);
  if (!species) return null;
  const chapter = chapterDefinition(chapterNumber);
  const existing = prior && typeof prior === "object" ? prior : {};
  const targetId = existing.targetId || `chapter:${chapterNumber}:rescue:${index + 1}`;
  const resident = Number((((reserve.ecology || {})[speciesPopulationGroup(speciesId)] || {})[speciesId])) || 0;
  const required = requiredItemsFor(speciesId, chapterNumber, index);
  const requiredItem = (Array.isArray(existing.requiredItems) && existing.requiredItems[0]) || required[0];
  const pointProgress = Object.assign({}, existing.pointProgress || {});
  if (Object.prototype.hasOwnProperty.call(pointProgress, requiredItem)) {
    pointProgress[requiredItem] = Math.min(
      CHAPTER_RESCUE_TARGET_SCORE,
      Math.max(0, Math.round(Number(pointProgress[requiredItem]) || 0))
    );
  }
  const record = Object.assign({
    targetId,
    speciesId,
    speciesName: species.name,
    chapter: chapterNumber,
    status: "captive",
    // Preserve an explicit hidden/queued state from legacy saves. The map
    // renderer uses this flag to avoid painting a rescue card before its
    // story entry has been presented.
    taskVisible: existing.taskVisible !== false,
    preserveResidentPopulation: options.fresh !== true && resident > 1,
    requiredItems: required,
    pointTarget: CHAPTER_RESCUE_TARGET_SCORE,
    pointProgress: {},
    collectedItems: {},
    itemFailures: {},
    itemAttempts: {},
    rescuedAt: 0,
    letterIssued: false,
    storyId: `chapter_${chapterNumber}_rescue_${index + 1}_${speciesId}`,
    sourceExploration: (rescueItemById(required[0]) || {}).source || "浅滩探索",
    map: chapterRescueMapSlot(index)
  }, existing, {
    targetId,
    speciesId,
    speciesName: species.name,
    chapter: chapterNumber,
    requiredItems: [requiredItem],
    pointTarget: CHAPTER_RESCUE_TARGET_SCORE,
    pointProgress
  });
  return record;
}

function normalizeChapterRescue(reserve = {}, chapterNumber = 1, options = {}) {
  const chapter = chapterDefinition(chapterNumber);
  const existing = reserve.chapterRescue && typeof reserve.chapterRescue === "object"
    ? reserve.chapterRescue
    : {};
  const fresh = options.fresh === true;
  if (!fresh && existing.version === RESCUE_VERSION && existing._normalizedChapter === chapter.chapter) return existing;

  const old = existing.animals && typeof existing.animals === "object" ? existing.animals : {};
  const completedTargets = existing.completedTargets && typeof existing.completedTargets === "object"
    ? existing.completedTargets
    : {};
  const completedBySpecies = new Map();
  Object.values(completedTargets).forEach((entry) => {
    if (entry && entry.speciesId && Number(entry.rescuedAt) > 0) completedBySpecies.set(entry.speciesId, entry);
  });
  // Some early saves wrote only the target id (without speciesId). Recover
  // those completions from the deterministic chapter target position so a
  // rebuilt task cannot ask the player to rescue the same animal again.
  Object.entries(completedTargets).forEach(([key, entry]) => {
    if (!entry || Number(entry.rescuedAt) <= 0) return;
    const match = String(key).match(/^chapter:(\d+):rescue:(\d+)$/);
    if (!match) return;
    const oldChapter = chapterDefinition(Number(match[1]));
    const speciesId = oldChapter.targets[Math.max(0, Number(match[2]) - 1)];
    if (speciesId && !completedBySpecies.has(speciesId)) completedBySpecies.set(speciesId, entry);
  });
  const records = {};
  const targetRecords = [];
  const seenSpecies = new Set();
  const recoveringTransition = !fresh
    && (Number(existing.chapter || 0) !== chapter.chapter || Number(existing.version || 0) < RESCUE_VERSION);
  const hasRescueHistory = recoveringTransition
    && (Object.keys(old).length > 0
      || Object.keys(completedTargets).length > 0
      || (Array.isArray(existing.targets) && existing.targets.length > 0)
      || !!existing.lastTaskId);
  const oldBySpecies = new Map();
  Object.values(old).forEach((record) => {
    if (!record || !record.speciesId) return;
    const key = String(record.speciesId);
    const current = oldBySpecies.get(key);
    if (!current || String(record.targetId || "").length > String(current.targetId || "").length) {
      oldBySpecies.set(key, record);
    }
  });

  const addRecord = (record, includeInTargets = true) => {
    if (!record || !record.speciesId || seenSpecies.has(record.speciesId)) return null;
    seenSpecies.add(record.speciesId);
    records[record.targetId || record.speciesId] = record;
    if (!records[record.speciesId]) records[record.speciesId] = record;
    if (includeInTargets) targetRecords.push(record);
    return record;
  };

  // Keep the current chapter's planned unlocks in their normal order.
  chapter.targets.forEach((speciesId, index) => {
    const targetId = `chapter:${chapter.chapter}:rescue:${index + 1}`;
    const prior = Object.assign({}, old[targetId] || old[speciesId] || oldBySpecies.get(speciesId) || {});
    const completed = completedTargets[targetId] || completedTargets[speciesId] || completedBySpecies.get(speciesId);
    if (completed && Number(completed.rescuedAt) > 0) {
      prior.status = "rescued";
      prior.rescuedAt = Number(completed.rescuedAt);
      prior.completionSource = completed.source || prior.completionSource || "chapter-rescue-ledger";
    }
    const fabricated = Number(existing.version || 0) < 3 && prior.status === "rescued" && !prior.rescuedAt;
    if (fabricated) prior.status = "captive";
    const record = buildChapterRescueRecord(reserve, speciesId, chapter.chapter, index, prior, options);
    if (record) addRecord(record);
  });

  // A chapter transition must not strand an unfinished species from an older chapter.
  // Recover both records that were saved and records lost by older builds by rebuilding
  // the deterministic target for every earlier chapter species that is still absent.
  const previousChapter = chapter.chapter - 1;
  if (hasRescueHistory && previousChapter >= 1) {
    // Recover every chapter skipped by a legacy save, while always checking
    // the immediately previous chapter even when the old save was already
    // normalized at the jumped-to chapter.
    const savedChapter = Math.max(0, Math.round(Number(existing.chapter) || 0));
    const recoveryFloor = savedChapter > 0 && savedChapter < chapter.chapter
      ? Math.min(previousChapter, savedChapter + 1)
      : previousChapter;
    for (let carryChapter = previousChapter; carryChapter >= recoveryFloor; carryChapter -= 1) {
      const previous = chapterDefinition(carryChapter);
      previous.targets.forEach((speciesId, index) => {
        if (seenSpecies.has(speciesId)) return;
        const targetId = `chapter:${carryChapter}:rescue:${index + 1}`;
        const prior = Object.assign({}, old[targetId] || old[speciesId] || oldBySpecies.get(speciesId) || {});
        const completed = completedTargets[targetId] || completedTargets[speciesId] || completedBySpecies.get(speciesId);
        if ((completed && Number(completed.rescuedAt) > 0) || prior.status === "rescued") return;
        const group = speciesPopulationGroup(speciesId);
        const population = Number((((reserve.ecology || {})[group] || {})[speciesId])) || 0;
        // A positive population with no pending record is already an unlocked species.
        if (!Object.keys(prior).length && population > 0) return;
        const record = buildChapterRescueRecord(reserve, speciesId, carryChapter, index, prior, options);
        if (record) {
          record.carryover = true;
          record.carryoverFromChapter = carryChapter;
          addRecord(record);
        }
      });
    }
  }

  // Keep legacy captive entries for the current chapter when no target record exists.
  chapter.captive.forEach((speciesId, index) => {
    if (seenSpecies.has(speciesId)) return;
    const record = buildChapterRescueRecord(reserve, speciesId, chapter.chapter, index, {
      targetId: `legacy:${chapter.chapter}:${speciesId}`,
      legacyOnly: true
    }, options);
    if (record) addRecord(record);
  });

  Object.values(records).forEach((record) => {
    if (!record || record.status === "rescued") return;
    const group = speciesPopulationGroup(record.speciesId);
    if (reserve.ecology && reserve.ecology[group]) {
      const current = Math.max(0, Number(reserve.ecology[group][record.speciesId]) || 0);
      if (!(record.preserveResidentPopulation && current > 1)) reserve.ecology[group][record.speciesId] = 1;
    }
  });

  const carryoverSpecies = targetRecords.filter((record) => record.carryover).map((record) => record.speciesId);
  reserve.chapterRescue = Object.assign({}, existing, {
    version: RESCUE_VERSION,
    chapter: chapter.chapter,
    title: chapter.title,
    enforceCompletion: existing.chapter && Number(existing.chapter) !== chapter.chapter
      ? true
      : existing.enforceCompletion !== false,
    legacyGateBypass: existing.chapter && Number(existing.chapter) !== chapter.chapter
      ? false
      : existing.legacyGateBypass === true,
    starter: chapter.starter.slice(),
    captive: Array.from(new Set(chapter.captive.concat(carryoverSpecies))),
    targets: targetRecords,
    animals: records,
    itemFailures: Object.assign({}, existing.itemFailures || {}),
    itemAttempts: Object.assign({}, existing.itemAttempts || {}),
    completedTargets: Object.assign({}, completedTargets),
    lastTaskId: existing.lastTaskId || "",
    lastCompletedAt: Number(existing.lastCompletedAt) || 0,
    flow: existing.flow && typeof existing.flow === "object"
      ? existing.flow
      : { state: "idle", targetId: "" }
  });
  Object.defineProperty(reserve.chapterRescue, "_normalizedChapter", {
    value: chapter.chapter,
    enumerable: false,
    writable: true
  });
  return reserve.chapterRescue;
}
const normalizeChapterRescueWithoutCarryover = normalizeChapterRescue;
normalizeChapterRescue = function preserveChapterPopulation(reserve = {}, chapterNumber = 1, options = {}) {
  const state = normalizeChapterRescueWithoutCarryover(reserve, chapterNumber, options);
  clampChapterCaptivePopulations(reserve);
  return state;
};
function rescueAnimalsForChapter(reserve={},chapterNumber=1){return normalizeChapterRescue(reserve,chapterNumber).targets||[];}
function nextRescueTask(reserve={},chapterNumber=1){return rescueAnimalsForChapter(reserve,chapterNumber).find(x=>x.status!=='rescued')||null;}
function invalidateRescueCache(reserve={}){
  if(reserve.chapterRescue)reserve.chapterRescue._normalizedChapter=undefined;
}
function addRescueItem(reserve={},itemId,amount=1){if(!rescueItemById(itemId))return 0;invalidateRescueCache(reserve);reserve.inventory=reserve.inventory||{};reserve.inventory.rescueItems=reserve.inventory.rescueItems||{};reserve.inventory.rescueItems[itemId]=Math.max(0,Math.round(Number(reserve.inventory.rescueItems[itemId])||0))+Math.max(0,Math.round(Number(amount)||0));return reserve.inventory.rescueItems[itemId];}
function rescueItemCount(reserve={},itemId){return Math.max(0,Math.round(Number((((reserve.inventory||{}).rescueItems||{})[itemId]))||0));}
function rescueTargetScore(itemId, recurring = false) {
  if (!rescueItemById(itemId)) return 0;
  return recurring ? POACHER_RESCUE_TARGET_SCORE : CHAPTER_RESCUE_TARGET_SCORE;
}
function ownsRescueItem(record, itemId) {
  if (!record || record.status === 'rescued' || !(record.requiredItems || []).includes(itemId)) return false;
  return !!((record.collectedItems || {})[itemId])
    || Number((record.pointProgress || {})[itemId]) >= rescuePointTarget(record, itemId);
}
function rescueItemCountFor(reserve = {}, record, itemId) {
  if (!record || record.status === 'rescued') return 0;
  if (ownsRescueItem(record, itemId)) return 1;
  const records = Object.values((reserve.chapterRescue || {}).animals || {})
    .concat(((reserve.poacherRescue || {}).active) || []);
  const owners = new Set(records.filter(other => ownsRescueItem(other, itemId))
    .map(other => other.targetId || other.speciesId));
  return Math.max(0, rescueItemCount(reserve, itemId) - owners.size);
}
function collectRescueItem(reserve={},animalId,itemId,amount=1){const record=findRecord(reserve.chapterRescue||{},animalId);if(!record||record.status==='rescued'||!record.requiredItems.includes(itemId))return false;addRescueItem(reserve,itemId,amount);record.collectedItems=Object.assign({},record.collectedItems||{},{[itemId]:true});return true;}
function canRescueAnimal(reserve={},animalId){const record=findRecord(reserve.chapterRescue||{},animalId);return !!record&&record.status!=='rescued'&&Array.isArray(record.requiredItems)&&record.requiredItems.every(id=>rescueItemCountFor(reserve,record,id)>0);}
function recordRescueExploration(reserve={},targetId,itemId,success){invalidateRescueCache(reserve);const record=findRecord(reserve.chapterRescue||{},targetId)||findPoacherRescue(reserve,targetId);if(!record||!record.requiredItems.includes(itemId))return null;record.itemAttempts[itemId]=Math.max(0,Number(record.itemAttempts[itemId])||0)+1;record.itemFailures[itemId]=success?0:Math.max(0,Number(record.itemFailures[itemId])||0)+1;if(success)addRescueItem(reserve,itemId,1);return record;}
function rescueGuaranteeReady(reserve={},targetId,itemId){const r=findRecord(reserve.chapterRescue||{},targetId);return !!r&&(Number(r.itemFailures[itemId])||0)>=3;}
function rescueAnimal(reserve={},animalId) {
  const before = livingAnimalTotal(reserve);
  const result = rescueAnimalUntracked(reserve, animalId);
  if (result && result.ok) {
    require("./animalSourceLedger").recordIncrease(reserve, "rescued", Math.max(0, livingAnimalTotal(reserve) - before));
  }
  return result;
}
function rescueAnimalUntracked(reserve={},animalId){invalidateRescueCache(reserve);const state=reserve.chapterRescue||{},record=findRecord(state,animalId);if(!record||record.status==='rescued')return {ok:false,record:record||null};reserve.inventory=reserve.inventory||{};reserve.inventory.rescueItems=reserve.inventory.rescueItems||{};const missing=(record.requiredItems||[]).filter(id=>rescueItemCountFor(reserve,record,id)<1);if(missing.length)return {ok:false,record,missing};record.requiredItems.forEach(id=>{reserve.inventory.rescueItems[id]=Math.max(0,rescueItemCount(reserve,id)-1);if(!reserve.inventory.rescueItems[id]){reserve.materialExplorationProgress=Object.assign({},reserve.materialExplorationProgress,{[id]:0});}});record.status='rescued';record.rescuedAt=Date.now();state.completedTargets=Object.assign({},state.completedTargets||{}, {[record.targetId]:{rescuedAt:record.rescuedAt,speciesId:record.speciesId,source:'chapter-rescue'}});const group=speciesPopulationGroup(record.speciesId);reserve.ecology=reserve.ecology||{};reserve.ecology[group]=reserve.ecology[group]||{};const species=getSpeciesById(record.speciesId),existing=Math.max(0,Number(reserve.ecology[group][record.speciesId])||0),released=Math.max(1,Math.round(Number(species&&species.initialPop)||1));reserve.ecology[group][record.speciesId]=Math.max(existing,released);state.lastTaskId=`rescue:${state.chapter}:${record.targetId}`;state.lastCompletedAt=Date.now();state.flow={state:'rescueResult',targetId:record.targetId};return {ok:true,record};}
function rescuePoacherAnimal(...args) { return require("./animalSourceLedger").trackPopulationChange(args[0], "rescued", () => rescuePoacherAnimalUntracked(...args)); }
function addPoacherRescueBonus(reserve, speciesId) {
  const before = livingAnimalTotal(reserve);
  const bonus = Math.max(1, Math.round(before * 0.03));
  let remaining = bonus;
  const { SPECIES_DB } = require("./animalWorld");
  const order = [speciesId].concat(Object.keys(SPECIES_DB).filter((id) => id !== speciesId));
  order.forEach((id) => {
    if (remaining <= 0 || !SPECIES_DB[id]) return;
    const group = speciesPopulationGroup(id);
    const bucket = reserve.ecology[group] = reserve.ecology[group] || {};
    const current = Math.max(0, Math.round(Number(bucket[id]) || 0));
    if (current <= 0 && id !== speciesId) return;
    const max = Math.max(current, Math.round(Number(SPECIES_DB[id].maxPop) || current));
    const room = Math.max(0, max - current);
    if (room <= 0) return;
    const added = Math.min(room, remaining);
    bucket[id] = current + added;
    remaining -= added;
  });
  return bonus - remaining;
}
function rescuePoacherAnimalUntracked(reserve={},animalId){const state=poacherRescueState(reserve),record=findPoacherRescue(reserve,animalId);if(!record||record.status==='rescued')return {ok:false,record:record||null};const missing=(record.requiredItems||[]).filter(id=>rescueItemCountFor(reserve,record,id)<1);if(missing.length)return {ok:false,record,missing};reserve.inventory=reserve.inventory||{};reserve.inventory.rescueItems=reserve.inventory.rescueItems||{};record.requiredItems.forEach(id=>{reserve.inventory.rescueItems[id]=Math.max(0,rescueItemCount(reserve,id)-1);if(!reserve.inventory.rescueItems[id]){reserve.materialExplorationProgress=Object.assign({},reserve.materialExplorationProgress,{[id]:0});}});record.status='rescued';record.rescuedAt=Date.now();const group=speciesPopulationGroup(record.speciesId);reserve.ecology=reserve.ecology||{};reserve.ecology[group]=reserve.ecology[group]||{};const released=Math.max(1,Math.round(Number(record.capturedCount)||1));reserve.ecology[group][record.speciesId]=Math.max(0,Number(reserve.ecology[group][record.speciesId])||0)+released;const bonus=addPoacherRescueBonus(reserve, record.speciesId);state.active=state.active.filter(item=>item.targetId!==record.targetId);state.history.push(record);state.pendingEvent=null;state.cooldownChapter=Number(record.chapter)||0;state.cooldownUntilDay=Math.max(Number(state.cooldownUntilDay)||0,Number(record.createdDay||0)+2);return {ok:true,record,bonus};}
function rescueShotMatchesRecord(shot={},record={},itemId=""){
  if(!shot||!record||!itemId)return false;
  const shotTarget=String(shot.rescueTargetId||"");
  const recordTarget=String(record.targetId||record.speciesId||"");
  const shotItem=String(shot.itemId||shot.rescueItemId||shot.targetId||"");
  if(shotItem!==String(itemId))return false;
  if(!shotTarget)return false;
  return !!recordTarget && (shotTarget===recordTarget||shotTarget===String(record.speciesId||""));
}
function reconcileRescueArcheryLedger(reserve={}){
  const shots=[];
  const history=Array.isArray(reserve.archeryHistory)?reserve.archeryHistory:[];
  history.forEach(shot=>shots.push(shot));
  if(reserve.lastArcheryShot)shots.push(reserve.lastArcheryShot);
  if(reserve.lastRescueShot)shots.push(reserve.lastRescueShot);
  if(!shots.length)return false;
  const states=[];
  const chapterState=reserve.chapterRescue||{};
  Object.values(chapterState.animals||{}).forEach(record=>{if(record&&!states.some(item=>item===record))states.push(record);});
  const poacherState=reserve.poacherRescue||{};
  (poacherState.active||[]).concat(poacherState.history||[]).forEach(record=>{if(record&&!states.some(item=>item===record))states.push(record);});
  const ownersByItem={};
  states.forEach(record=>{
    if(!record||record.status==='rescued')return;
    (record.requiredItems||[]).forEach(itemId=>{
      const key=String(itemId||"");
      if(!key)return;
      ownersByItem[key]=ownersByItem[key]||[];
      const target=String(record.targetId||record.speciesId||"");
      if(target&&!ownersByItem[key].some(item=>String(item.targetId||item.speciesId||"")===target))ownersByItem[key].push(record);
    });
  });
  let changed=false;
  states.forEach(record=>{
    if(!Array.isArray(record.requiredItems)||!record.requiredItems.length)return;
    record.pointProgress=Object.assign({},record.pointProgress||{});
    record.requiredItems.forEach(itemId=>{
      let best=Math.max(0,Number(record.pointProgress[itemId])||0);
      shots.forEach(shot=>{
        let matches=rescueShotMatchesRecord(shot,record,itemId);
        if(!matches&&!String(shot.rescueTargetId||"")){
          const owners=ownersByItem[String(itemId)]||[];
          matches=owners.length===1&&owners[0]===record
            && String(shot.itemId||shot.rescueItemId||shot.targetId||"")===String(itemId);
        }
        if(!matches)return;
        const total=Math.max(0,Math.round(Number(shot.totalScore)||0));
        if(total>best)best=total;
      });
      const target=rescuePointTarget(record,itemId);
      best=Math.min(target||best,best);
      if(best>Math.max(0,Number(record.pointProgress[itemId])||0)){
        record.pointProgress[itemId]=best;
        changed=true;
      }
      if(best>0){
        reserve.materialExplorationProgress=reserve.materialExplorationProgress||{};
        if(best>Math.max(0,Number(reserve.materialExplorationProgress[itemId])||0)){
          reserve.materialExplorationProgress[itemId]=best;
          changed=true;
        }
      }
    });
  });
  return changed;
}
function chapterRescueSummary(reserve={},chapterNumber=1){const state=normalizeChapterRescue(reserve,chapterNumber),animals=state.targets||[],rescued=animals.filter(x=>x.status==='rescued').length;return {chapter:state.chapter,total:animals.length,rescued,remaining:Math.max(0,animals.length-rescued),complete:rescued>=animals.length,animals};}
module.exports={isChapterRescueSpecies,chapterCaptiveSpeciesSet,captiveSpeciesSet,livingAnimalTotal,clampChapterCaptivePopulations,rescueTargetScore,rescuePointTarget,rescueItemCountFor,RESCUE_VERSION,CHAPTER_RESCUE_TARGET_SCORE,POACHER_RESCUE_TARGET_SCORE,CHAPTER_RESCUE_MAP_SLOTS,POACHER_RESCUE_MAP_SLOTS,chapterRescueMapSlot,poacherRescueMapSlot,RESCUE_ITEM_CATALOG,rescueItemById,chapterDefinition,normalizeChapterRescue,rescueAnimalsForChapter,nextRescueTask,addRescueItem,rescueItemCount,collectRescueItem,canRescueAnimal,rescueAnimal,rescuePoacherAnimal,poacherRescueState,nextPoacherRescue,createPoacherRescue,findPoacherRescue,chapterRescueSummary,reconcileRescueArcheryLedger,rescueStoryFor,recordRescueExploration,rescueGuaranteeReady,findRecord,targetCount};
