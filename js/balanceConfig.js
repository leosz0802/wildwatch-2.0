const BALANCE_V2=Object.freeze({version:2,tuning:Object.freeze({fundSourceScale:1,fundSinkScale:1,supplyPriceScale:1.08,supplyChapterGrowth:.05,chapterRequirementScale:1,taskTargetScale:1,metricGainScale:1,metricPressureScale:1,populationGrowthScale:1,strategyRewardScale:1,strategyCostScale:1,rareDropScale:1,recoveryScale:1}),caps:Object.freeze({pendingRecovered:6,inventory:10,supplies:Object.freeze({dogFood:10,alarm:6,tranquilizer:10,fieldKit:8,medicalKit:7,evidenceTrap:4})}),chapterEconomy:Object.freeze({1:Object.freeze({baseIncome:105,baseMaintenance:155,habitatCost:90,interventionCost:115,supplyPriceMultiplier:1}),2:Object.freeze({baseIncome:135,baseMaintenance:180,habitatCost:105,interventionCost:130,supplyPriceMultiplier:1.45}),3:Object.freeze({baseIncome:170,baseMaintenance:210,habitatCost:120,interventionCost:145,supplyPriceMultiplier:1.55}),4:Object.freeze({baseIncome:210,baseMaintenance:245,habitatCost:135,interventionCost:160,supplyPriceMultiplier:1.65}),5:Object.freeze({baseIncome:255,baseMaintenance:285,habitatCost:150,interventionCost:175,supplyPriceMultiplier:1.75}),6:Object.freeze({baseIncome:300,baseMaintenance:330,habitatCost:170,interventionCost:195,supplyPriceMultiplier:1.85}),7:Object.freeze({baseIncome:350,baseMaintenance:380,habitatCost:190,interventionCost:220,supplyPriceMultiplier:1.95})}),rankRewards:Object.freeze([Object.freeze({max:.01,value:80}),Object.freeze({max:.1,value:60}),Object.freeze({max:.3,value:45}),Object.freeze({max:.5,value:30}),Object.freeze({max:1,value:20})]),progression:Object.freeze({1:Object.freeze({stage:1,storyLevel:1,nextStage:2,nextLevel:1,expectedMinutes:5,expectedSessions:1,actions:4,strategicChoices:1,majorChoices:0,score:50,storyBeats:2,milestoneNeed:1,population:180,fundEarned:600,migratedIn:4,rareRecovered:1}),2:Object.freeze({stage:2,storyLevel:1,nextStage:3,nextLevel:2,expectedMinutes:20,expectedSessions:2,actions:15,strategicChoices:3,majorChoices:1,score:58,storyBeats:5,milestoneNeed:2,population:260,fundEarned:1200,migratedIn:7,rareRecovered:2}),3:Object.freeze({stage:3,storyLevel:2,nextStage:4,nextLevel:2,expectedMinutes:30,expectedSessions:2,actions:4,strategicChoices:1,majorChoices:0,score:60,storyBeats:2,milestoneNeed:1,population:300,fundEarned:1e3,migratedIn:6,rareRecovered:2}),4:Object.freeze({stage:4,storyLevel:2,nextStage:5,nextLevel:3,expectedMinutes:35,expectedSessions:3,actions:15,strategicChoices:4,majorChoices:1,score:62,storyBeats:5,milestoneNeed:2,population:340,fundEarned:1800,migratedIn:10,rareRecovered:3}),5:Object.freeze({stage:5,storyLevel:3,nextStage:6,nextLevel:3,expectedMinutes:40,expectedSessions:3,actions:4,strategicChoices:1,majorChoices:0,score:65,storyBeats:2,milestoneNeed:1,population:400,fundEarned:1700,migratedIn:9,rareRecovered:3}),6:Object.freeze({stage:6,storyLevel:3,nextStage:7,nextLevel:4,expectedMinutes:45,expectedSessions:4,actions:15,strategicChoices:5,majorChoices:2,score:68,storyBeats:5,milestoneNeed:2,population:470,fundEarned:2800,migratedIn:13,rareRecovered:4}),7:Object.freeze({stage:7,storyLevel:4,nextStage:8,nextLevel:4,expectedMinutes:50,expectedSessions:4,actions:4,strategicChoices:1,majorChoices:0,score:70,storyBeats:2,milestoneNeed:1,population:540,fundEarned:2500,migratedIn:13,rareRecovered:4}),8:Object.freeze({stage:8,storyLevel:4,nextStage:9,nextLevel:5,expectedMinutes:55,expectedSessions:4,actions:15,strategicChoices:5,majorChoices:2,score:73,storyBeats:5,milestoneNeed:2,population:620,fundEarned:4e3,migratedIn:17,rareRecovered:5}),9:Object.freeze({stage:9,storyLevel:5,nextStage:10,nextLevel:5,expectedMinutes:60,expectedSessions:5,actions:4,strategicChoices:1,majorChoices:0,score:76,storyBeats:2,milestoneNeed:1,population:700,fundEarned:3800,migratedIn:17,rareRecovered:5}),10:Object.freeze({stage:10,storyLevel:5,nextStage:11,nextLevel:6,expectedMinutes:60,expectedSessions:5,actions:15,strategicChoices:5,majorChoices:2,score:80,storyBeats:5,milestoneNeed:2,population:780,fundEarned:6e3,migratedIn:22,rareRecovered:7}),11:Object.freeze({stage:11,storyLevel:7,nextStage:11,nextLevel:7,expectedMinutes:120,expectedSessions:10,actions:16,strategicChoices:6,majorChoices:2,score:90,storyBeats:5,milestoneNeed:2,population:1400,fundEarned:12500,migratedIn:40,rareRecovered:14})}),task:Object.freeze({targetByLevel:Object.freeze({1:2,2:3,3:3,4:4,5:4,6:5,7:5}),fundRewardByLevel:Object.freeze({1:20,2:25,3:30,4:35,5:40,6:45,7:50})}),fundHealth:Object.freeze({1:Object.freeze({danger:300,healthyMin:500,healthyMax:1200,high:1600,projectCost:320}),2:Object.freeze({danger:450,healthyMin:700,healthyMax:1600,high:2200,projectCost:450}),3:Object.freeze({danger:650,healthyMin:950,healthyMax:2200,high:3e3,projectCost:600}),4:Object.freeze({danger:900,healthyMin:1300,healthyMax:2900,high:3900,projectCost:780}),5:Object.freeze({danger:1200,healthyMin:1700,healthyMax:3700,high:5e3,projectCost:980}),6:Object.freeze({danger:1500,healthyMin:2100,healthyMax:4500,high:6100,projectCost:1180}),7:Object.freeze({danger:1850,healthyMin:2500,healthyMax:5400,high:7300,projectCost:1400})}),supplyCaps:Object.freeze({dogFood:10,alarm:6,tranquilizer:10,fieldKit:8,medicalKit:7,evidenceTrap:4}),supplyBasePrices:Object.freeze({dogFood:75,alarm:115,tranquilizer:135,fieldKit:95,medicalKit:105,evidenceTrap:125}),supplyPricePressure:Object.freeze({guardianDayStep:.015,guardianDayCap:.3,stockStep:.045,stockCap:.18,highFundThreshold:2500,highFundStep:.04,highFundCap:.2}),repeatMultipliers:Object.freeze([1,.85,.7,.55]),metricDiminishing:Object.freeze([Object.freeze({min:95,multiplier:.25}),Object.freeze({min:85,multiplier:.5}),Object.freeze({min:75,multiplier:.7}),Object.freeze({min:0,multiplier:1})]),poacherDiminishing:Object.freeze([Object.freeze({max:9,multiplier:.3}),Object.freeze({max:24,multiplier:.55}),Object.freeze({max:40,multiplier:.8}),Object.freeze({max:100,multiplier:1})]),resourceAging:Object.freeze({pendingLifetimeActions:6,recoveryCooldownActions:8}),fragmentExchange:Object.freeze({fieldNote:Object.freeze({amount:6,fund:60,cooldown:3}),migrationTrace:Object.freeze({amount:5,fund:120,cooldown:5}),forestGift:Object.freeze({amount:3,cooldown:6}),coGuardShard:Object.freeze({amount:8,fund:200,discount:.2})}),highStockProject:Object.freeze({triggerActions:3,durationActions:8}),population:Object.freeze({maxGrowthPerAction:3,nearCapacityRatio:.9,nearCapacityGrowthMultiplier:.3,carryingCapacity:Object.freeze({1:260,2:360,3:500,4:680,5:880,6:980,7:1150})}),rarity:Object.freeze({baseChance:.03,trustBonus:.02,ecologyBonus:.02,seasonBonus:.01,maxChance:.08,pity:10})});const ECOLOGY_THRESHOLDS=Object.freeze({
  criticalWater:35, lowWater:50, recoveryWater:62,
  criticalGrass:35, lowGrass:48, recoveryGrass:58,
  earlyDisease:24, warningDisease:40, criticalDisease:45, recoveryDisease:30,
  earlyWater:60, earlyGrass:55
});
const SPECIES_VITALS={
  deer:{birthRate:.032,naturalMortality:.010,diseaseMortality:.018,migrationSensitivity:.72,waterUse:1.25,grassUse:1.35,diseaseSusceptibility:1.05},
  antelope:{birthRate:.030,naturalMortality:.010,diseaseMortality:.017,migrationSensitivity:.68,waterUse:1.20,grassUse:1.30,diseaseSusceptibility:.95},
  zebra:{birthRate:.026,naturalMortality:.011,diseaseMortality:.016,migrationSensitivity:.62,waterUse:1.35,grassUse:1.45,diseaseSusceptibility:.90},
  hare:{birthRate:.080,naturalMortality:.030,diseaseMortality:.028,migrationSensitivity:.46,waterUse:.35,grassUse:.48,diseaseSusceptibility:1.20},
  boar:{birthRate:.052,naturalMortality:.018,diseaseMortality:.022,migrationSensitivity:.50,waterUse:.62,grassUse:.58,diseaseSusceptibility:1.08},
  wolf:{birthRate:.018,naturalMortality:.012,diseaseMortality:.020,migrationSensitivity:.84,waterUse:.70,grassUse:.10,diseaseSusceptibility:.82},
  lion:{birthRate:.014,naturalMortality:.014,diseaseMortality:.018,migrationSensitivity:.88,waterUse:.85,grassUse:.08,diseaseSusceptibility:.78},
  leopard:{birthRate:.016,naturalMortality:.014,diseaseMortality:.021,migrationSensitivity:.82,waterUse:.62,grassUse:.06,diseaseSusceptibility:.90},
  crocodile:{birthRate:.012,naturalMortality:.012,diseaseMortality:.016,migrationSensitivity:.92,waterUse:1.10,grassUse:0,diseaseSusceptibility:1.10},
  flamingo:{birthRate:.040,naturalMortality:.018,diseaseMortality:.026,migrationSensitivity:.94,waterUse:1.00,grassUse:.12,diseaseSusceptibility:1.16},
  hippo:{birthRate:.020,naturalMortality:.012,diseaseMortality:.020,migrationSensitivity:.90,waterUse:1.55,grassUse:1.10,diseaseSusceptibility:1.06},
  elephant:{birthRate:.012,naturalMortality:.009,diseaseMortality:.014,migrationSensitivity:.58,waterUse:2.20,grassUse:1.85,diseaseSusceptibility:.76},
  giraffe:{birthRate:.018,naturalMortality:.010,diseaseMortality:.016,migrationSensitivity:.58,waterUse:1.15,grassUse:.72,diseaseSusceptibility:.82},
  bear:{birthRate:.014,naturalMortality:.013,diseaseMortality:.018,migrationSensitivity:.70,waterUse:.72,grassUse:.18,diseaseSusceptibility:.88},
  eagle:{birthRate:.026,naturalMortality:.022,diseaseMortality:.022,migrationSensitivity:.76,waterUse:.22,grassUse:.02,diseaseSusceptibility:.86},
  owl:{birthRate:.032,naturalMortality:.024,diseaseMortality:.024,migrationSensitivity:.68,waterUse:.18,grassUse:.02,diseaseSusceptibility:.94},
  crow:{birthRate:.060,naturalMortality:.035,diseaseMortality:.030,migrationSensitivity:.42,waterUse:.12,grassUse:.01,diseaseSusceptibility:1.10},
  vulture:{birthRate:.024,naturalMortality:.024,diseaseMortality:.025,migrationSensitivity:.55,waterUse:.20,grassUse:.02,diseaseSusceptibility:1.00},
  wildDog:{birthRate:.022,naturalMortality:.014,diseaseMortality:.021,migrationSensitivity:.76,waterUse:.72,grassUse:.08,diseaseSusceptibility:.88},
  mink:{birthRate:.034,naturalMortality:.020,diseaseMortality:.025,migrationSensitivity:.88,waterUse:.78,grassUse:.10,diseaseSusceptibility:1.12},
  fox:{birthRate:.045,naturalMortality:.026,diseaseMortality:.026,migrationSensitivity:.60,waterUse:.32,grassUse:.06,diseaseSusceptibility:1.04},
  rhino:{birthRate:.010,naturalMortality:.008,diseaseMortality:.013,migrationSensitivity:.56,waterUse:2.00,grassUse:1.70,diseaseSusceptibility:.72},
  pangolin:{birthRate:.028,naturalMortality:.020,diseaseMortality:.023,migrationSensitivity:.70,waterUse:.28,grassUse:.12,diseaseSusceptibility:1.08},
  
  
  
  
  
  
  tapir:{birthRate:.024,naturalMortality:.014,diseaseMortality:.020,migrationSensitivity:.66,waterUse:.92,grassUse:.82,diseaseSusceptibility:.92},
  fireflyBird:{birthRate:.050,naturalMortality:.032,diseaseMortality:.028,migrationSensitivity:.52,waterUse:.12,grassUse:.02,diseaseSusceptibility:1.05},
  bison:{birthRate:.018,naturalMortality:.010,diseaseMortality:.016,migrationSensitivity:.60,waterUse:1.70,grassUse:1.55,diseaseSusceptibility:.84},
  crane:{birthRate:.030,naturalMortality:.018,diseaseMortality:.022,migrationSensitivity:.86,waterUse:.60,grassUse:.04,diseaseSusceptibility:1.08}
};
function speciesVitalFor(id){
  const roleDefaults={birthRate:.028,naturalMortality:.015,diseaseMortality:.020,migrationSensitivity:.65,waterUse:.45,grassUse:.35,diseaseSusceptibility:1};
  return Object.assign({},roleDefaults,SPECIES_VITALS[id]||{});
}
function levelOf(e){return Math.max(1,Math.min(7,Math.round(((e||{}).progression||{}).level||1)))}function chapterEconomy(e){const t="number"==typeof e?e:levelOf(e);return BALANCE_V2.chapterEconomy[Math.max(1,Math.min(7,Math.round(t||1)))]}const CHAPTER_ACTION_TARGETS=Object.freeze({3:9,5:10,7:12,9:13});function progressionGate(e){const t=Math.max(1,Math.min(11,Math.round(e||1))),i=BALANCE_V2.progression[t];return CHAPTER_ACTION_TARGETS[t]?Object.assign({},i,{actions:CHAPTER_ACTION_TARGETS[t]}):i}function roundToFive(e){return Math.max(0,5*Math.round(Number(e||0)/5))}function supplyChapter(e){const t=e&&"object"==typeof e?(e.progression||{}):null,a="number"==typeof e?e:Number((t||{}).displayChapter||(t||{}).stage||(t||{}).level||1);return Math.max(1,Math.min(11,Math.round(a||1)))}function supplyPrice(e,t){const r=supplyChapter(t),a=BALANCE_V2.supplyPricePressure,i=t&&"object"==typeof t?t:null,n=Math.max(1,Math.round(Number(((i||{}).guardianCycle||{}).day||1))),o=Math.max(0,Math.round(Number(((i||{}).supplies||{})[e]||0))),s=Math.max(0,Math.round(Number((i||{}).fund||0))),c=1+Math.min(a.guardianDayCap,Math.max(0,n-1)*a.guardianDayStep),l=1+Math.min(a.stockCap,o*a.stockStep),d=1+Math.min(a.highFundCap,Math.floor(Math.max(0,s-a.highFundThreshold)/1e3)*a.highFundStep),u=Math.pow(1+BALANCE_V2.tuning.supplyChapterGrowth,r-1);return roundToFive((BALANCE_V2.supplyBasePrices[e]||0)*u*BALANCE_V2.tuning.supplyPriceScale*c*l*d)}function fundHealth(e){return BALANCE_V2.fundHealth[Math.max(1,Math.min(7,Math.round(e||1)))]}function metricGainMultiplier(e){const t=BALANCE_V2.metricDiminishing.find(t=>Number(e||0)>=t.min);return(t?t.multiplier:1)*BALANCE_V2.tuning.metricGainScale}function poacherReductionMultiplier(e){const t=BALANCE_V2.poacherDiminishing.find(t=>Number(e||0)<=t.max);return(t?t.multiplier:1)*BALANCE_V2.tuning.metricPressureScale}
function habitatRecoveryMultiplier(current) {
  const value = Math.max(0, Math.min(100, Number(current) || 0));
  if (value < 25) return 1.8;
  if (value < 30) return 1.8 - (value / 30) * 0.5;
  if (value <= 50) return 1.3 - ((value - 30) / 20) * 0.3;
  return Math.max(0.4, 1 - ((value - 50) / 50) * 0.6);
}
function habitatRecoveryGain(current, amount) {
  const base = Math.max(0, Number(amount) || 0);
  if (base <= 0) return 0;
  return Math.max(1, Math.round(base * habitatRecoveryMultiplier(current)));
}
function habitatCrisisLevel(current) {
  const value = Math.max(0, Number(current) || 0);
  if (value < 25) return "collapse";
  if (value < ECOLOGY_THRESHOLDS.criticalWater) return "critical";
  return "";
}
const SUPPLY_CAP_AFTER_FIRST_PURCHASE = 2;
const SUPPLY_CAP_LATE_CHAPTER = 10;
const SUPPLY_CAP_LATE_MULTIPLIER = 3;
// These three supplies use a fixed warehouse limit across chapters. Keeping
// the override here makes the UI, purchase planner, rewards and ledger share
// one source of truth instead of applying chapter multipliers accidentally.
const SUPPLY_CAP_OVERRIDES = Object.freeze({ dogFood: 10, tranquilizer: 10, fieldKit: 8 });
function supplyCapUnlocked(reserve) {
  if (!reserve || typeof reserve !== "object") return false;
  const stage = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter) || 1));
  return stage >= 2;
}
function supplyCapMultiplier(reserve) {
  if (!reserve || typeof reserve !== "object") return 1;
  const stage = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter) || 1));
  if (stage >= SUPPLY_CAP_LATE_CHAPTER) return SUPPLY_CAP_LATE_MULTIPLIER;
  return supplyCapUnlocked(reserve) ? SUPPLY_CAP_AFTER_FIRST_PURCHASE : 1;
}
function supplyCapFor(id, reserve) {
  if (Object.prototype.hasOwnProperty.call(SUPPLY_CAP_OVERRIDES, id)) {
    return SUPPLY_CAP_OVERRIDES[id];
  }
  const base = Math.max(0, Math.round(Number((BALANCE_V2.supplyCaps || {})[id]) || 0));
  return base * supplyCapMultiplier(reserve);
}
const PACE_ECONOMY = Object.freeze({
  fundAdPerChapter: 200,
  fundAdMinReward: 1000,
  fundAdDailyCap: 3,
  fundAdFirstGuardianDay: 2,
  visitorFreeRecruits: 2,
  visitorAdGrant: 2,
  visitorAdDailyCap: 8,
  visitorRecruitmentScale: 0.9,
  visitorRestoreSeconds: 360,
  animalAdChapterCap: 4,
  animalAdMinPercent: 5,
  animalAdMaxPercent: 10,
  animalAdRewardScale: 0.9,
  visitorReceptionMaxUses: 4,
  buildingStoryRewardScale: 1.05,
  facilityRewardScaleById: Object.freeze({ evidence_room: 1.05 }),
  stationUseLimit: 3,
  stationAdUseGrant: 3,
  stationChapterTax: 1.75,
  stationFundById: Object.freeze({
    old_patrol_post: 20,
    hydrology_station: 15,
    evidence_room: 15,
    migration_watch: 15,
    governance_hall: 40,
    guardian_memorial: 15
  }),
  sellFundFreeCapBase: 150,
  sellFundFreeCapPerChapter: 100 / 3,
  sellFundFreeBatches: 2,
  sellUnlockAdDailyCap: 0,
  sellUnlockAdFirstGuardianDay: 1
});
function paceChapter(reserve = {}) {
  const progression = (reserve && reserve.progression) || {};
  return Math.max(1, Math.round(Number(progression.displayChapter || progression.stage || 1)));
}
function paceFundAdReward(chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  const scaled = Math.max(0, Math.round(PACE_ECONOMY.fundAdPerChapter * n));
  return Math.max(Math.round(Number(PACE_ECONOMY.fundAdMinReward) || 0), scaled);
}
function paceInflationChapter(chapter = 1) {
  return Math.max(1, Math.min(11, Math.round(Number(chapter) || 1)));
}
const PACE_OPERATING_INFLATION = Object.freeze({
  1: 1, 2: 1, 3: 1.06, 4: 1.12, 5: 1.18, 6: 1.26, 7: 1.28, 8: 1.28, 9: 1.24, 10: 1.26, 11: 1.12
});
const PACE_RUSH_INFLATION = Object.freeze({
  1: 4, 2: 3.2, 3: 2.2, 4: 1.5, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1
});
function paceOperatingInflation(chapter = 1) {
  return PACE_OPERATING_INFLATION[paceInflationChapter(chapter)];
}
function paceRushInflation(chapter = 1) {
  return PACE_RUSH_INFLATION[paceInflationChapter(chapter)];
}
function paceStationInflation(facilityId, chapter = 1) {
  return facilityId === "old_patrol_post" ? paceOperatingInflation(chapter) : paceRushInflation(chapter);
}
function paceEcologyFundCost(reserve, action) {
  const economy = chapterEconomy(reserve);
  const base = action === "intervention" ? economy.interventionCost : economy.habitatCost;
  const chapter = paceChapter(reserve);
  const inflated = Math.max(0, Math.round((Number(base) || 0) * paceOperatingInflation(chapter)));
  // Archive sales stop after chapter 8. Habitat work from chapter 10 has to
  // stay expensive enough that a careful day still finishes short.
  if (action === "intervention" || chapter < 10) return inflated;
  return inflated + Math.round(6 * paceOperatingInflation(chapter));
}
function paceStationChapterTax(chapter = 1) {
  return Math.max(1, Math.round(Number(chapter) || 1)) >= 2 ? PACE_ECONOMY.stationChapterTax : 1;
}
function paceStationFund(facilityId, chapter = 1) {
  const base = Math.max(0, Math.round(Number(PACE_ECONOMY.stationFundById[facilityId]) || 0));
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  return Math.round(base * n * paceStationChapterTax(n));
}
function paceRushStationFund(chapter = 1) {
  return Object.keys(PACE_ECONOMY.stationFundById).reduce((sum, id) => (
    sum + paceStationFund(id, chapter) * PACE_ECONOMY.stationUseLimit
  ), 0);
}
function paceSellFundFreeBatches() {
  return Math.max(1, Math.round(Number(PACE_ECONOMY.sellFundFreeBatches) || 2));
}
function paceSellFundFreeCap(chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  return Math.max(0, Math.round(PACE_ECONOMY.sellFundFreeCapBase + (n - 1) * PACE_ECONOMY.sellFundFreeCapPerChapter));
}
function paceSlowDayFund(reserve = {}) {
  const chapter = paceChapter(reserve);
  const economy = chapterEconomy(reserve);
  return paceEcologyFundCost(reserve, "habitat")
    + supplyPrice("dogFood", reserve)
    + paceStationFund("old_patrol_post", chapter);
}
const MAX_STORY_CHAPTER=18;
const CHAPTER_ECOLOGY_BALANCE=Object.freeze({1:{eventInterval:3,conflictRate:.18,waterTarget:68,grassTarget:70,safetyTarget:56,visitorPressure:.02},2:{eventInterval:3,conflictRate:.24,waterTarget:70,grassTarget:68,safetyTarget:58,visitorPressure:.03},3:{eventInterval:4,conflictRate:.28,waterTarget:68,grassTarget:66,safetyTarget:60,visitorPressure:.04},4:{eventInterval:4,conflictRate:.36,waterTarget:66,grassTarget:64,safetyTarget:60,visitorPressure:.05},5:{eventInterval:4,conflictRate:.40,waterTarget:64,grassTarget:62,safetyTarget:62,visitorPressure:.06},6:{eventInterval:4,conflictRate:.48,waterTarget:62,grassTarget:60,safetyTarget:64,visitorPressure:.07},7:{eventInterval:5,conflictRate:.52,waterTarget:64,grassTarget:58,safetyTarget:66,visitorPressure:.08},8:{eventInterval:5,conflictRate:.60,waterTarget:62,grassTarget:56,safetyTarget:66,visitorPressure:.09},9:{eventInterval:5,conflictRate:.64,waterTarget:60,grassTarget:54,safetyTarget:68,visitorPressure:.10},10:{eventInterval:6,conflictRate:.72,waterTarget:58,grassTarget:52,safetyTarget:70,visitorPressure:.11},11:{eventInterval:6,conflictRate:.78,waterTarget:60,grassTarget:50,safetyTarget:70,visitorPressure:.12}});
function chapterEcologyBalance(chapter=1){return CHAPTER_ECOLOGY_BALANCE[Math.max(1,Math.min(11,Math.round(Number(chapter)||1)))]||CHAPTER_ECOLOGY_BALANCE[1];}
module.exports={BALANCE_V2:BALANCE_V2,MAX_STORY_CHAPTER:MAX_STORY_CHAPTER,PACE_ECONOMY:PACE_ECONOMY,paceChapter:paceChapter,paceFundAdReward:paceFundAdReward,paceOperatingInflation:paceOperatingInflation,paceRushInflation:paceRushInflation,paceStationInflation:paceStationInflation,paceEcologyFundCost:paceEcologyFundCost,paceStationChapterTax:paceStationChapterTax,paceStationFund:paceStationFund,paceRushStationFund:paceRushStationFund,paceSlowDayFund:paceSlowDayFund,paceSellFundFreeBatches:paceSellFundFreeBatches,paceSellFundFreeCap:paceSellFundFreeCap,ECOLOGY_THRESHOLDS:ECOLOGY_THRESHOLDS,SPECIES_VITALS:SPECIES_VITALS,speciesVitalFor:speciesVitalFor,levelOf:levelOf,chapterEconomy:chapterEconomy,progressionGate:progressionGate,supplyPrice:supplyPrice,fundHealth:fundHealth,metricGainMultiplier:metricGainMultiplier,poacherReductionMultiplier:poacherReductionMultiplier,habitatRecoveryMultiplier:habitatRecoveryMultiplier,habitatRecoveryGain:habitatRecoveryGain,habitatCrisisLevel:habitatCrisisLevel,roundToFive:roundToFive,supplyCapUnlocked:supplyCapUnlocked,supplyCapMultiplier:supplyCapMultiplier,supplyCapFor:supplyCapFor,SUPPLY_CAP_OVERRIDES:SUPPLY_CAP_OVERRIDES,SUPPLY_CAP_AFTER_FIRST_PURCHASE:SUPPLY_CAP_AFTER_FIRST_PURCHASE,SUPPLY_CAP_LATE_CHAPTER:SUPPLY_CAP_LATE_CHAPTER,SUPPLY_CAP_LATE_MULTIPLIER:SUPPLY_CAP_LATE_MULTIPLIER,CHAPTER_ECOLOGY_BALANCE:CHAPTER_ECOLOGY_BALANCE,chapterEcologyBalance:chapterEcologyBalance};
