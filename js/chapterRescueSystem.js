'use strict';
const { CHAPTERS, getSpeciesById, speciesPopulationGroup, getUnlockedSpecies } = require('./animalWorld');
const RESCUE_VERSION = 3;
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
function targetCount(chapter){return chapter<=5?1:chapter<=12?2:3;}
function candidateSpecies(chapterNumber){const n=Number(chapterNumber)||1,out=[];const add=id=>{if(id&&getSpeciesById(id)&&!out.includes(id))out.push(id);};const cur=CHAPTERS.find(c=>c.chapter===n)||CHAPTERS[0];(cur.newSpecies||[]).forEach(add);for(let c=n-1;c>=1&&out.length<12;c--){const item=CHAPTERS.find(x=>x.chapter===c);(item&&item.newSpecies||[]).forEach(add);}return out;}
function chapterDefinition(chapterNumber=1){const n=Number(chapterNumber)||1,chapter=CHAPTERS.find(x=>x.chapter===n)||CHAPTERS[0],current=Array.isArray(chapter.newSpecies)?chapter.newSpecies.slice():[],starter=current.length?[current[0]]:(chapter.keyAnimal?[chapter.keyAnimal]:[]),targets=candidateSpecies(n).filter(id=>!starter.includes(id)).slice(0,targetCount(n));return {chapter:chapter.chapter,title:chapter.title,starter,targets,captive:current.filter(id=>!starter.includes(id))};}
function requiredItemsFor(speciesId,chapterNumber=1,index=0){const first=RESCUE_ITEM_CATALOG[(Number(chapterNumber)+index)%RESCUE_ITEM_CATALOG.length],later=RESCUE_ITEM_CATALOG[(Number(chapterNumber)+index+2)%RESCUE_ITEM_CATALOG.length],count=Number(chapterNumber)>=6?2:((Number(chapterNumber)+index)%3===0?2:1);return [first.id].concat(count>1?[later.id]:[]);}
function findRecord(state,id){const animals=state.animals||{};if(animals[id])return animals[id];return Object.values(animals).find(r=>r&&(r.targetId===id||r.speciesId===id))||null;}
function isChapterRescueSpecies(speciesId, chapterNumber = 1) {
  return chapterDefinition(chapterNumber).targets.includes(speciesId);
}
function poacherRescueState(reserve = {}) {
  const state = reserve.poacherRescue && typeof reserve.poacherRescue === 'object' ? reserve.poacherRescue : {};
  state.version = 1;
  state.active = Array.isArray(state.active) ? state.active : [];
  state.history = Array.isArray(state.history) ? state.history.slice(-24) : [];
  state.cooldownUntilDay = Math.max(0, Number(state.cooldownUntilDay) || 0);
  state.pendingEvent = state.pendingEvent && typeof state.pendingEvent === 'object' ? state.pendingEvent : null;
  // If an old duplicate was rescued first, honor that confirmed rescue instead
  // of asking the player to rescue the same chapter animal a second time.
  // Partial points or a status without a completion timestamp are not proof.
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
  // Older builds could choose the chapter's rescue animal again for poaching.
  // Remove only those invalid duplicate events; do not reset the real chapter
  // record or transfer points/items between the two tasks.
  state.active = state.active.filter(record => {
    if (!record || record.status === 'rescued' || !Number(record.chapter)
      || !isChapterRescueSpecies(record.speciesId, record.chapter)) return true;
    const chapter = reserve.chapterRescue || {};
    const chapterRecord = Number(chapter.chapter) === Number(record.chapter)
      ? findRecord(chapter, record.speciesId) : null;
    // Creation deducted one resident. Restore it only when the chapter no
    // longer holds that species captive. Removal makes the migration idempotent.
    if (chapterRecord && chapterRecord.status === 'rescued'
      || Number(chapter.chapter) > Number(record.chapter)) {
      const group = speciesPopulationGroup(record.speciesId);
      reserve.ecology = reserve.ecology || {};
      const bucket = reserve.ecology[group] = reserve.ecology[group] || {};
      bucket[record.speciesId] = Math.max(0, Number(bucket[record.speciesId]) || 0) + 1;
    }
    if (state.pendingEvent && state.pendingEvent.targetId === record.targetId) state.pendingEvent = null;
    // Retain the obsolete record for save recovery; it is neither an active
    // task nor a completed rescue and cannot grant rewards or count as an event.
    state.superseded = (Array.isArray(state.superseded) ? state.superseded : [])
      .concat(Object.assign({}, record, { status: 'superseded', reason: 'chapter-rescue-species' })).slice(-24);
    return false;
  });
  reserve.poacherRescue = state;
  return state;
}
function nextPoacherRescue(reserve={}){return poacherRescueState(reserve).active.find(record=>record&&record.status!=='rescued')||null;}
function createPoacherRescue(reserve={},speciesId,chapterNumber=1,day=1){if(isChapterRescueSpecies(speciesId,chapterNumber))return null;const state=poacherRescueState(reserve);const currentDay=Math.max(0,Number(day)||0);if(state.cooldownChapter===Number(chapterNumber)&&state.cooldownUntilDay>currentDay||state.active.some(record=>record&&record.status!=='rescued'))return null;if(state.active.filter(record=>record&&record.status!=='rescued').length>=3||state.history.filter(record=>record&&Number(record.chapter)===Number(chapterNumber)).length>=3)return null;const species=getSpeciesById(speciesId);if(!species)return null;const targetId=`poacher:${day}:${speciesId}:${state.history.length+state.active.length+1}`;const required=requiredItemsFor(speciesId,chapterNumber,state.active.length);const record={targetId,id:targetId,speciesId,speciesName:species.name,chapter:chapterNumber,status:'captive',createdDay:currentDay,requiredItems:required,collectedItems:{},itemFailures:{},itemAttempts:{},rescuedAt:0,letterIssued:false,recurring:true,sourceExploration:(rescueItemById(required[0])||{}).source||'巡护回收',map:{x:.22+(.19*(state.active.length%3)),y:.28+(.16*(Number(day)%3))}};state.active.push(record);state.pendingEvent={targetId:record.targetId,speciesId:record.speciesId,speciesName:record.speciesName,day:currentDay};const group=speciesPopulationGroup(speciesId);const bucket=((reserve.ecology||{})[group]||{});bucket[speciesId]=Math.max(0,(Number(bucket[speciesId])||0)-1);return record;}
function findPoacherRescue(reserve={},id){const state=poacherRescueState(reserve);return state.active.find(record=>record&&(record.targetId===id||record.id===id||record.speciesId===id))||null;}
function normalizeChapterRescue(reserve={},chapterNumber=1,options={}){const chapter=chapterDefinition(chapterNumber),existing=reserve.chapterRescue&&typeof reserve.chapterRescue==='object'?reserve.chapterRescue:{},fresh=options.fresh===true;if(!fresh&&existing.version===RESCUE_VERSION&&existing._normalizedChapter===chapter.chapter)return existing;const old=existing.animals&&typeof existing.animals==='object'?existing.animals:{},completedTargets=existing.completedTargets&&typeof existing.completedTargets==='object'?existing.completedTargets:{},records={};chapter.targets.forEach((speciesId,index)=>{const targetId=`chapter:${chapter.chapter}:rescue:${index+1}`,prior=Object.assign({},old[targetId]||old[speciesId]||{}),species=getSpeciesById(speciesId);if(!species)return;const completed=completedTargets[targetId]||completedTargets[speciesId];if(completed&&Number(completed.rescuedAt)>0){prior.status='rescued';prior.rescuedAt=Number(completed.rescuedAt);prior.completionSource=completed.source||prior.completionSource||'chapter-rescue-ledger';}const fabricated=Number(existing.version||0)<3&&prior.status==='rescued'&&!prior.rescuedAt;if(fabricated)prior.status='captive';const resident=Number(((reserve.ecology||{})[speciesPopulationGroup(speciesId)]||{})[speciesId])||0,required=requiredItemsFor(speciesId,chapter.chapter,index);records[targetId]=Object.assign({targetId,speciesId,speciesName:species.name,chapter:chapter.chapter,status:'captive',preserveResidentPopulation: !fresh && resident > 0,requiredItems:required,collectedItems:{},itemFailures:{},itemAttempts:{},rescuedAt:0,letterIssued:false,storyId:`chapter_${chapter.chapter}_rescue_${index+1}_${speciesId}`,sourceExploration:(rescueItemById(required[0])||{}).source||'浅滩探索',map:{x:.18+index*.27,y:.32+(chapter.chapter%3)*.16}},prior,{targetId,speciesId,requiredItems:Array.isArray(prior.requiredItems)&&prior.requiredItems.length?prior.requiredItems:required});});chapter.targets.forEach((speciesId,index)=>{const targetId=`chapter:${chapter.chapter}:rescue:${index+1}`;if(records[targetId]&&!records[speciesId])records[speciesId]=records[targetId];});chapter.captive.forEach(speciesId=>{if(!records[speciesId]){const sp=getSpeciesById(speciesId);records[speciesId]={targetId:`legacy:${chapter.chapter}:${speciesId}`,speciesId,speciesName:sp?sp.name:speciesId,chapter:chapter.chapter,status:'captive',requiredItems:requiredItemsFor(speciesId,chapter.chapter,0),collectedItems:{},itemFailures:{},itemAttempts:{},legacyOnly:true};}});Object.values(records).forEach(record=>{if(record&&record.status!=='rescued'){const group=speciesPopulationGroup(record.speciesId);if(reserve.ecology&&reserve.ecology[group])reserve.ecology[group][record.speciesId]=0;}});reserve.chapterRescue=Object.assign({},existing,{version:RESCUE_VERSION,chapter:chapter.chapter,title:chapter.title,enforceCompletion: existing.chapter && Number(existing.chapter) !== chapter.chapter ? true : existing.enforceCompletion !== false, legacyGateBypass: existing.chapter && Number(existing.chapter) !== chapter.chapter ? false : existing.legacyGateBypass === true,starter:chapter.starter.slice(),captive:chapter.captive.slice(),targets:chapter.targets.map((speciesId,index)=>records[`chapter:${chapter.chapter}:rescue:${index+1}`]).filter(Boolean),animals:records,itemFailures:Object.assign({},existing.itemFailures||{}),itemAttempts:Object.assign({},existing.itemAttempts||{}),completedTargets:Object.assign({},completedTargets),lastTaskId:existing.lastTaskId||'',lastCompletedAt:Number(existing.lastCompletedAt)||0,flow:existing.flow&&typeof existing.flow==='object'?existing.flow:{state:'idle',targetId:''}});Object.defineProperty(reserve.chapterRescue,'_normalizedChapter',{value:chapter.chapter,enumerable:false,writable:true});return reserve.chapterRescue;}
function rescueAnimalsForChapter(reserve={},chapterNumber=1){return normalizeChapterRescue(reserve,chapterNumber).targets||[];}
function nextRescueTask(reserve={},chapterNumber=1){return rescueAnimalsForChapter(reserve,chapterNumber).find(x=>x.status!=='rescued')||null;}
function invalidateRescueCache(reserve={}){
  // The non-enumerable cache marker is writable but non-configurable, including
  // on objects created by older builds. Reset its value instead of deleting it:
  // delete throws in the strict-mode WeChat bundle (and silently fails otherwise).
  if(reserve.chapterRescue)reserve.chapterRescue._normalizedChapter=undefined;
}
function addRescueItem(reserve={},itemId,amount=1){if(!rescueItemById(itemId))return 0;invalidateRescueCache(reserve);reserve.inventory=reserve.inventory||{};reserve.inventory.rescueItems=reserve.inventory.rescueItems||{};reserve.inventory.rescueItems[itemId]=Math.max(0,Math.round(Number(reserve.inventory.rescueItems[itemId])||0))+Math.max(0,Math.round(Number(amount)||0));return reserve.inventory.rescueItems[itemId];}
function rescueItemCount(reserve={},itemId){return Math.max(0,Math.round(Number((((reserve.inventory||{}).rescueItems||{})[itemId]))||0));}
function rescueTargetScore(itemId, recurring = false) {
  if (!rescueItemById(itemId)) return 0;
  // Chapter rescue items use one clear cumulative target across every chapter.
  // Recurring poacher rescues remain shorter and keep their own record.
  return recurring ? 10 : 20;
}
function ownsRescueItem(record, itemId) {
  if (!record || record.status === 'rescued' || !(record.requiredItems || []).includes(itemId)) return false;
  // Completed per-task points are also proof of ownership in saves from the
  // build that kept only a shared inventory. This recovers already-stuck tasks.
  return !!((record.collectedItems || {})[itemId])
    || Number((record.pointProgress || {})[itemId]) >= rescueTargetScore(itemId, record.recurring);
}
function rescueItemCountFor(reserve = {}, record, itemId) {
  if (!record || record.status === 'rescued') return 0;
  if (ownsRescueItem(record, itemId)) return 1;
  const records = Object.values((reserve.chapterRescue || {}).animals || {})
    .concat(((reserve.poacherRescue || {}).active) || []);
  const owners = new Set(records.filter(other => ownsRescueItem(other, itemId))
    .map(other => other.targetId || other.speciesId));
  // Unassigned items from legacy saves remain usable, but a different task
  // cannot spend an item already earned by another animal's rescue.
  return Math.max(0, rescueItemCount(reserve, itemId) - owners.size);
}
function collectRescueItem(reserve={},animalId,itemId,amount=1){const record=findRecord(reserve.chapterRescue||{},animalId);if(!record||record.status==='rescued'||!record.requiredItems.includes(itemId))return false;addRescueItem(reserve,itemId,amount);record.collectedItems=Object.assign({},record.collectedItems||{},{[itemId]:true});return true;}
function canRescueAnimal(reserve={},animalId){const record=findRecord(reserve.chapterRescue||{},animalId);return !!record&&record.status!=='rescued'&&Array.isArray(record.requiredItems)&&record.requiredItems.every(id=>rescueItemCountFor(reserve,record,id)>0);}
function recordRescueExploration(reserve={},targetId,itemId,success){invalidateRescueCache(reserve);const record=findRecord(reserve.chapterRescue||{},targetId)||findPoacherRescue(reserve,targetId);if(!record||!record.requiredItems.includes(itemId))return null;record.itemAttempts[itemId]=Math.max(0,Number(record.itemAttempts[itemId])||0)+1;record.itemFailures[itemId]=success?0:Math.max(0,Number(record.itemFailures[itemId])||0)+1;if(success)addRescueItem(reserve,itemId,1);return record;}
function rescueGuaranteeReady(reserve={},targetId,itemId){const r=findRecord(reserve.chapterRescue||{},targetId);return !!r&&(Number(r.itemFailures[itemId])||0)>=3;}
function rescueAnimal(reserve={},animalId){invalidateRescueCache(reserve);const state=reserve.chapterRescue||{},record=findRecord(state,animalId);if(!record||record.status==='rescued')return {ok:false,record:record||null};reserve.inventory=reserve.inventory||{};reserve.inventory.rescueItems=reserve.inventory.rescueItems||{};const missing=(record.requiredItems||[]).filter(id=>rescueItemCountFor(reserve,record,id)<1);if(missing.length)return {ok:false,record,missing};record.requiredItems.forEach(id=>{reserve.inventory.rescueItems[id]=Math.max(0,rescueItemCount(reserve,id)-1);if(!reserve.inventory.rescueItems[id]){reserve.materialExplorationProgress=Object.assign({},reserve.materialExplorationProgress,{[id]:0});}});record.status='rescued';record.rescuedAt=Date.now();state.completedTargets=Object.assign({},state.completedTargets||{}, {[record.targetId]:{rescuedAt:record.rescuedAt,speciesId:record.speciesId,source:'chapter-rescue'}});const group=speciesPopulationGroup(record.speciesId);reserve.ecology=reserve.ecology||{};reserve.ecology[group]=reserve.ecology[group]||{};const species=getSpeciesById(record.speciesId),existing=Number(reserve.ecology[group][record.speciesId])||0;reserve.ecology[group][record.speciesId]=record.preserveResidentPopulation||existing>0?existing+1:Math.max(1,Number((species||{}).initialPop)||1);state.lastTaskId=`rescue:${state.chapter}:${record.targetId}`;state.lastCompletedAt=Date.now();state.flow={state:'rescueResult',targetId:record.targetId};return {ok:true,record};}
function rescuePoacherAnimal(reserve={},animalId){const state=poacherRescueState(reserve),record=findPoacherRescue(reserve,animalId);if(!record||record.status==='rescued')return {ok:false,record:record||null};const missing=(record.requiredItems||[]).filter(id=>rescueItemCountFor(reserve,record,id)<1);if(missing.length)return {ok:false,record,missing};reserve.inventory=reserve.inventory||{};reserve.inventory.rescueItems=reserve.inventory.rescueItems||{};record.requiredItems.forEach(id=>{reserve.inventory.rescueItems[id]=Math.max(0,rescueItemCount(reserve,id)-1);if(!reserve.inventory.rescueItems[id]){reserve.materialExplorationProgress=Object.assign({},reserve.materialExplorationProgress,{[id]:0});}});record.status='rescued';record.rescuedAt=Date.now();const group=speciesPopulationGroup(record.speciesId);reserve.ecology=reserve.ecology||{};reserve.ecology[group]=reserve.ecology[group]||{};reserve.ecology[group][record.speciesId]=Math.max(0,Number(reserve.ecology[group][record.speciesId])||0)+1;state.active=state.active.filter(item=>item.targetId!==record.targetId);state.history.push(record);state.pendingEvent=null;state.cooldownChapter=Number(record.chapter)||0;state.cooldownUntilDay=Math.max(Number(state.cooldownUntilDay)||0,Number(record.createdDay||0)+2);return {ok:true,record};}
function chapterRescueSummary(reserve={},chapterNumber=1){const state=normalizeChapterRescue(reserve,chapterNumber),animals=state.targets||[],rescued=animals.filter(x=>x.status==='rescued').length;return {chapter:state.chapter,total:animals.length,rescued,remaining:Math.max(0,animals.length-rescued),complete:rescued>=animals.length,animals};}
module.exports={isChapterRescueSpecies,rescueTargetScore,rescueItemCountFor,RESCUE_VERSION,RESCUE_ITEM_CATALOG,rescueItemById,chapterDefinition,normalizeChapterRescue,rescueAnimalsForChapter,nextRescueTask,addRescueItem,rescueItemCount,collectRescueItem,canRescueAnimal,rescueAnimal,rescuePoacherAnimal,poacherRescueState,nextPoacherRescue,createPoacherRescue,findPoacherRescue,chapterRescueSummary,rescueStoryFor,recordRescueExploration,rescueGuaranteeReady,findRecord,targetCount};
