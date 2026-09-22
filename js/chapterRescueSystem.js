'use strict';
const { CHAPTERS, getSpeciesById, speciesPopulationGroup } = require('./animalWorld');
const RESCUE_VERSION = 7;
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
function rescueStoryFor(record={}){const name=record.speciesName||record.speciesId||'这只动物';return {title:`${name}的回家路`,paragraphs:[`地图边缘发现了${name}留下的求救痕迹。它不是自然迁徙，而是被旧围栏和人类遗留物困住。`,`你收集齐${(record.requiredItems||[]).map(id=>(rescueItemById(id)||{}).label||id).join('、')}后，才能在不惊扰它的情况下打开出口。`,`解救完成后，${name}会回到保护区，并在后续日结算中影响水源、草场与游客观察记录。`]};}
function targetCount(chapter){return chapter>=10?2:1;}
function chapterDefinition(chapterNumber=1){
  const n=Number(chapterNumber)||1;
  const chapter=CHAPTERS.find(x=>x.chapter===n)||CHAPTERS[0];
  const current=Array.isArray(chapter.newSpecies)?chapter.newSpecies.slice():[];
  const opening=new Set(["deer","antelope","hare","crow","wolf","zebra","boar"]);
  const novel=current.filter((id)=>!opening.has(id));
  // 第10章起：本章新出现的种群全部是必须解救对象，不再送一只自由解锁。
  if (n>=10) {
    const targets=novel.slice();
    const starter=current.filter((id)=>!targets.includes(id));
    return {chapter:chapter.chapter,title:chapter.title,starter,targets,captive:targets.slice()};
  }
  if (n>=3 && novel.length===1) {
    const targets=novel.slice();
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
  const add = (record, fallbackId) => {
    const id = (record && record.speciesId) || fallbackId;
    if (id && (!record || record.status !== "rescued")) ids.add(id);
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
  // Poached animals are already deducted from ecology while trapped, so they
  // must not be added back here. Rescue restores the deducted count.
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
    // Keep a one-animal placeholder in the live HUD while the rescue card is
    // open. The map layer filters captive aliases out separately, so this
    // placeholder cannot leak into free-roaming motion. Full save
    // reconciliation removes the placeholder and relies on the rescue ledger
    // for the pending count.
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
      // New incidents first exist as a story card. They enter the task area
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
function normalizeChapterRescue(reserve={},chapterNumber=1,options={}){const chapter=chapterDefinition(chapterNumber),existing=reserve.chapterRescue&&typeof reserve.chapterRescue==='object'?reserve.chapterRescue:{},fresh=options.fresh===true;if(!fresh&&existing.version===RESCUE_VERSION&&existing._normalizedChapter===chapter.chapter)return existing;const old=existing.animals&&typeof existing.animals==='object'?existing.animals:{},completedTargets=existing.completedTargets&&typeof existing.completedTargets==='object'?existing.completedTargets:{},records={};chapter.targets.forEach((speciesId,index)=>{const targetId=`chapter:${chapter.chapter}:rescue:${index+1}`,prior=Object.assign({},old[targetId]||old[speciesId]||{}),species=getSpeciesById(speciesId);if(!species)return;const completed=completedTargets[targetId]||completedTargets[speciesId];if(completed&&Number(completed.rescuedAt)>0){prior.status='rescued';prior.rescuedAt=Number(completed.rescuedAt);prior.completionSource=completed.source||prior.completionSource||'chapter-rescue-ledger';}const fabricated=Number(existing.version||0)<3&&prior.status==='rescued'&&!prior.rescuedAt;if(fabricated)prior.status='captive';const resident=Number(((reserve.ecology||{})[speciesPopulationGroup(speciesId)]||{})[speciesId])||0,required=requiredItemsFor(speciesId,chapter.chapter,index);const requiredItem=(Array.isArray(prior.requiredItems)&&prior.requiredItems[0])||required[0];const pointTarget=CHAPTER_RESCUE_TARGET_SCORE;const pointProgress=Object.assign({},prior.pointProgress||{});if(Object.prototype.hasOwnProperty.call(pointProgress,requiredItem))pointProgress[requiredItem]=Math.min(pointTarget,Math.max(0,Math.round(Number(pointProgress[requiredItem])||0)));records[targetId]=Object.assign({targetId,speciesId,speciesName:species.name,chapter:chapter.chapter,status:'captive',preserveResidentPopulation: !fresh && resident > 1,requiredItems:required,pointTarget:CHAPTER_RESCUE_TARGET_SCORE,pointProgress:{},collectedItems:{},itemFailures:{},itemAttempts:{},rescuedAt:0,letterIssued:false,storyId:`chapter_${chapter.chapter}_rescue_${index+1}_${speciesId}`,sourceExploration:(rescueItemById(required[0])||{}).source||'浅滩探索',map:chapterRescueMapSlot(index)},prior,{targetId,speciesId,requiredItems:[requiredItem],pointTarget,pointProgress});});chapter.targets.forEach((speciesId,index)=>{const targetId=`chapter:${chapter.chapter}:rescue:${index+1}`;if(records[targetId]&&!records[speciesId])records[speciesId]=records[targetId];});chapter.captive.forEach(speciesId=>{if(!records[speciesId]){const sp=getSpeciesById(speciesId);const required=requiredItemsFor(speciesId,chapter.chapter,0);records[speciesId]={targetId:`legacy:${chapter.chapter}:${speciesId}`,speciesId,speciesName:sp?sp.name:speciesId,chapter:chapter.chapter,status:'captive',requiredItems:required,pointTarget:CHAPTER_RESCUE_TARGET_SCORE,pointProgress:{},collectedItems:{},itemFailures:{},itemAttempts:{},legacyOnly:true};}});Object.values(records).forEach(record=>{if(record&&record.status!=='rescued'){const group=speciesPopulationGroup(record.speciesId);if(reserve.ecology&&reserve.ecology[group]){const current=Math.max(0,Number(reserve.ecology[group][record.speciesId])||0);if(!(record.preserveResidentPopulation&&current>1))reserve.ecology[group][record.speciesId]=1;}}});reserve.chapterRescue=Object.assign({},existing,{version:RESCUE_VERSION,chapter:chapter.chapter,title:chapter.title,enforceCompletion: existing.chapter && Number(existing.chapter) !== chapter.chapter ? true : existing.enforceCompletion !== false, legacyGateBypass: existing.chapter && Number(existing.chapter) !== chapter.chapter ? false : existing.legacyGateBypass === true,starter:chapter.starter.slice(),captive:chapter.captive.slice(),targets:chapter.targets.map((speciesId,index)=>records[`chapter:${chapter.chapter}:rescue:${index+1}`]).filter(Boolean),animals:records,itemFailures:Object.assign({},existing.itemFailures||{}),itemAttempts:Object.assign({},existing.itemAttempts||{}),completedTargets:Object.assign({},completedTargets),lastTaskId:existing.lastTaskId||'',lastCompletedAt:Number(existing.lastCompletedAt)||0,flow:existing.flow&&typeof existing.flow==='object'?existing.flow:{state:'idle',targetId:''}});Object.defineProperty(reserve.chapterRescue,'_normalizedChapter',{value:chapter.chapter,enumerable:false,writable:true});return reserve.chapterRescue;}
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
function rescuePoacherAnimalUntracked(reserve={},animalId){const state=poacherRescueState(reserve),record=findPoacherRescue(reserve,animalId);if(!record||record.status==='rescued')return {ok:false,record:record||null};const missing=(record.requiredItems||[]).filter(id=>rescueItemCountFor(reserve,record,id)<1);if(missing.length)return {ok:false,record,missing};reserve.inventory=reserve.inventory||{};reserve.inventory.rescueItems=reserve.inventory.rescueItems||{};record.requiredItems.forEach(id=>{reserve.inventory.rescueItems[id]=Math.max(0,rescueItemCount(reserve,id)-1);if(!reserve.inventory.rescueItems[id]){reserve.materialExplorationProgress=Object.assign({},reserve.materialExplorationProgress,{[id]:0});}});record.status='rescued';record.rescuedAt=Date.now();const group=speciesPopulationGroup(record.speciesId);reserve.ecology=reserve.ecology||{};reserve.ecology[group]=reserve.ecology[group]||{};const released=Math.max(1,Math.round(Number(record.capturedCount)||1));reserve.ecology[group][record.speciesId]=Math.max(0,Number(reserve.ecology[group][record.speciesId])||0)+released;state.active=state.active.filter(item=>item.targetId!==record.targetId);state.history.push(record);state.pendingEvent=null;state.cooldownChapter=Number(record.chapter)||0;state.cooldownUntilDay=Math.max(Number(state.cooldownUntilDay)||0,Number(record.createdDay||0)+2);return {ok:true,record};}
function chapterRescueSummary(reserve={},chapterNumber=1){const state=normalizeChapterRescue(reserve,chapterNumber),animals=state.targets||[],rescued=animals.filter(x=>x.status==='rescued').length;return {chapter:state.chapter,total:animals.length,rescued,remaining:Math.max(0,animals.length-rescued),complete:rescued>=animals.length,animals};}
module.exports={isChapterRescueSpecies,chapterCaptiveSpeciesSet,captiveSpeciesSet,livingAnimalTotal,clampChapterCaptivePopulations,rescueTargetScore,rescuePointTarget,rescueItemCountFor,RESCUE_VERSION,CHAPTER_RESCUE_TARGET_SCORE,POACHER_RESCUE_TARGET_SCORE,CHAPTER_RESCUE_MAP_SLOTS,POACHER_RESCUE_MAP_SLOTS,chapterRescueMapSlot,poacherRescueMapSlot,RESCUE_ITEM_CATALOG,rescueItemById,chapterDefinition,normalizeChapterRescue,rescueAnimalsForChapter,nextRescueTask,addRescueItem,rescueItemCount,collectRescueItem,canRescueAnimal,rescueAnimal,rescuePoacherAnimal,poacherRescueState,nextPoacherRescue,createPoacherRescue,findPoacherRescue,chapterRescueSummary,rescueStoryFor,recordRescueExploration,rescueGuaranteeReady,findRecord,targetCount};
