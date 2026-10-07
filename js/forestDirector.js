function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}
function totalAnimals(group) {
  return Object.keys(group || {}).reduce((sum, key) => sum + ((group && group[key]) || 0), 0);
}
function regionNameById(id, world) {
  const region = ((world && world.regions) || []).find((item) => item.id === id);
  return region ? region.name : "保护区";
}
function regionForSpecies(species) {
  return {
    鹿: "meadow",
    狼: "center",
    乌鸦: "north",
    熊: "rocks",
    水貂: "lake",
    河马: "river",
    狮子: "meadow",
    豹子: "center",
    鳄鱼: "river",
    火烈鸟: "lake",
    鹰: "river",
    秃鹫: "rocks",
    野犬: "meadow",
    斑马: "meadow",
    羚羊: "meadow",
    长颈鹿: "north",
    大象: "river",
    狐狸: "center",
    野兔: "meadow",
    野猪: "center",
    猫头鹰: "north",
    刺猬: "rocks"
  }[species] || "center";
}
function pressureLevel(value, high, medium) {
  if ((value || 0) >= high) return "high";
  if ((value || 0) >= medium) return "medium";
  return "low";
}
function buildFacts(input) {
  const world = input.world || {};
  const before = input.beforeReserve || {};
  const reserve = input.reserve || {};
  const eco = reserve.ecology || {};
  const beforeEco = before.ecology || {};
  const predators = totalAnimals(eco.predators || {});
  const herbivores = totalAnimals(eco.herbivores || {});
  const beforeHerbivores = totalAnimals(beforeEco.herbivores || {});
  const migration = reserve.migration || {};
  const deerDelta = ((eco.herbivores || {}).deer || 0) - ((beforeEco.herbivores || {}).deer || 0);
  const waterDelta = (eco.water || 0) - (beforeEco.water || 0);
  const grassDelta = (eco.grass || 0) - (beforeEco.grass || 0);
  const poacherDelta = (reserve.poacherPressure || 0) - (before.poacherPressure || 0);
  const facts = [];
  facts.push({
    id: "time_weather",
    type: "time",
    label: `${world.season || "夏季"} · ${input.time ? input.time.phase : "未知时段"} · ${input.weather || world.weather || "天气未知"}`,
    value: input.weather || world.weather || "",
    regionId: input.regionId || "center",
    severity: input.weather === "晴" ? "medium" : input.weather === "小雨" ? "low" : "info",
    evidence: `第 ${input.day || world.day || 1} 日，森林时间 ${(input.time && input.time.hour) || "--"}:00。`
  });
  facts.push({
    id: "water",
    type: "resource",
    label: "水源",
    value: eco.water || 0,
    delta: waterDelta,
    regionId: (eco.water || 0) < 48 ? "river" : "lake",
    severity: pressureLevel(100 - (eco.water || 0), 55, 35),
    evidence: waterDelta >= 0 ? `水源恢复 ${waterDelta}` : `水源下降 ${Math.abs(waterDelta)}`
  });
  facts.push({
    id: "grass",
    type: "resource",
    label: "草场",
    value: eco.grass || 0,
    delta: grassDelta,
    regionId: "meadow",
    severity: pressureLevel(100 - (eco.grass || 0), 55, 35),
    evidence: grassDelta >= 0 ? `草场恢复 ${grassDelta}` : `草场减少 ${Math.abs(grassDelta)}`
  });
  facts.push({
    id: "poachers",
    type: "human_threat",
    label: "偷猎压力",
    value: reserve.poacherPressure || 0,
    delta: poacherDelta,
    regionId: input.action === "antiPoacher" ? input.regionId : "river",
    severity: pressureLevel(reserve.poacherPressure || 0, 58, 42),
    evidence: poacherDelta >= 0 ? `偷猎压力 +${poacherDelta}` : `偷猎压力 ${poacherDelta}`
  });
  facts.push({
    id: "migration",
    type: "movement",
    label: "迁移",
    value: migration.delta || 0,
    delta: migration.delta || 0,
    regionId: (migration.delta || 0) < 0 ? "meadow" : "river",
    severity: (migration.delta || 0) < 0 ? "high" : (migration.delta || 0) > 0 ? "positive" : "info",
    evidence: migration.reason || "动物保持观望"
  });
  facts.push({
    id: "population",
    type: "population",
    label: "食草动物",
    value: herbivores,
    delta: herbivores - beforeHerbivores,
    regionId: "meadow",
    severity: deerDelta < 0 ? "high" : herbivores > 360 ? "medium" : "info",
    evidence: `鹿群 ${deerDelta >= 0 ? "+" : ""}${deerDelta}，食草总量 ${herbivores}`
  });
  facts.push({
    id: "predator_pressure",
    type: "predator",
    label: "捕食压力",
    value: predators,
    delta: 0,
    regionId: predators * 5 > herbivores ? "center" : "rocks",
    severity: predators * 5 > herbivores ? "high" : "medium",
    evidence: `食肉 ${predators} / 食草 ${herbivores}`
  });
  facts.push({
    id: "disease",
    type: "disease",
    label: "病虫害",
    value: eco.disease || 0,
    delta: (eco.disease || 0) - (beforeEco.disease || 0),
    regionId: "meadow",
    severity: pressureLevel(eco.disease || 0, 30, 18),
    evidence: `病虫害指数 ${eco.disease || 0}`
  });
  return facts;
}
function dominantFactForSpecies(species, facts) {
  const byId = {};
  facts.forEach((fact) => { byId[fact.id] = fact; });
  if (species === "鹿") return byId.migration.severity === "high" ? byId.migration : byId.poachers.severity === "high" ? byId.poachers : byId.water;
  if (species === "狼") return byId.population.delta < 0 ? byId.population : byId.predator_pressure;
  if (species === "乌鸦") return byId.poachers.severity !== "low" ? byId.poachers : byId.migration;
  if (species === "熊") return byId.poachers.severity === "high" ? byId.poachers : byId.disease.severity === "high" ? byId.disease : byId.predator_pressure;
  if (species === "水貂") return byId.water.severity !== "low" ? byId.water : byId.poachers;
  if (species === "河马") return byId.water.severity !== "low" ? byId.water : byId.predator_pressure;
  if (species === "火烈鸟") return byId.water.severity !== "low" ? byId.water : byId.disease;
  if (species === "鹰") return byId.poachers.severity !== "low" ? byId.poachers : byId.migration;
  if (species === "秃鹫") return byId.disease.severity !== "low" ? byId.disease : byId.poachers;
  if (["狮子", "豹子", "野犬"].indexOf(species) >= 0) return byId.population.delta < 0 ? byId.population : byId.predator_pressure;
  if (species === "鳄鱼" || species === "大象") return byId.water.severity !== "low" ? byId.water : byId.poachers;
  if (["斑马", "羚羊", "长颈鹿"].indexOf(species) >= 0) return byId.migration.severity === "high" ? byId.migration : byId.predator_pressure.severity === "high" ? byId.predator_pressure : byId.water;
  return facts.find((fact) => fact.severity === "high") || facts[0];
}
function animalMood(npc, facts, input) {
  const fact = dominantFactForSpecies(npc.species, facts);
  const reserve = input.reserve || {};
  const eco = reserve.ecology || {};
  const migration = reserve.migration || {};
  const regionId = (npc.intent && npc.intent.targetRegionId) || regionForSpecies(npc.species);
  const regionName = regionNameById(regionId, input.world);
  const common = {
    factIds: [fact.id],
    regionId,
    regionName,
    stress: fact.severity === "high" ? 82 : fact.severity === "medium" ? 58 : 34,
    imageCue: "",
    summary: "",
    livedEvent: "",
    concern: "",
    nextMove: (npc.intent && npc.intent.label) || "继续观察保护区变化",
    memory: "",
    tone: "克制"
  };
  if (npc.species === "鹿") {
    common.summary = (migration.delta || 0) < 0 ? "鹿群变薄，正在重新排列逃跑路线" : "鹿群保持警觉，优先确认饮水窗口";
    common.livedEvent = (migration.delta || 0) < 0
      ? `今天少了 ${Math.abs(migration.delta)} 个同伴，幼鹿被带离水边。`
      : (reserve.poacherPressure || 0) > 52
        ? "水线附近出现陌生脚印，鹿群绕开了直线足迹。"
        : `草场 ${eco.grass || 0}，水源 ${eco.water || 0}，鹿群仍在试探安全线。`;
    common.concern = (reserve.poacherPressure || 0) > 52 ? "固定饮水路线可能变成偷猎者的等待点" : "捕食者靠近水源时，幼鹿最容易被冲散";
    common.imageCue = "鹿群远离水线，幼鹿贴近灌木边缘";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "狼") {
    common.summary = "狼群根据鹿味浓淡和饮水线压力重排巡边路线";
    common.livedEvent = fact.id === "population" && (fact.delta || 0) < 0
      ? "鹿味变淡，追太远不划算，狼群减少无效奔跑。"
      : "狼沿着鹿群边缘慢慢压低身形，没有急着冲。";
    common.concern = "鹿群过度流失会让狼群体力消耗变高，冲突也会外溢到边界";
    common.imageCue = "狼在混交林阴影里沿鹿群边缘移动";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "乌鸦") {
    common.summary = "乌鸦把脚印、叫声和边界异响变成树冠线索";
    common.livedEvent = (reserve.poacherPressure || 0) > 52
      ? "树冠下出现直线脚印，乌鸦记住了陌生人的路线。"
      : "树冠上能听见迁移路线变冷，熟悉的叫声少了一些。";
    common.concern = "坏消息如果没有被巡护线接住，会比脚印传播得更快";
    common.imageCue = "乌鸦停在高枝，俯看河岸和林缘足迹";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "熊") {
    common.summary = "熊把洞口安静程度当成保护区秩序的温度计";
    common.livedEvent = (reserve.poacherPressure || 0) > 52
      ? "洞外有陌生金属味，熊退回阴影并重标边界。"
      : "洞域暂时安静，熊检查了矿盐点和洞口脚印。";
    common.concern = "频繁靠近洞口会放大大型动物冲突风险";
    common.imageCue = "岩坡洞口有新的爪痕和矿盐点检查痕迹";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "水貂") {
    common.summary = "水貂用水位、鱼影和芦苇断痕判断湖岸是否还能伏击";
    common.livedEvent = (eco.water || 0) < 48
      ? "浅滩退了半截，鱼往深处去，水貂今天扑空了两次。"
      : "湖岸仍稳，水貂沿浅滩检查鱼影和饮水者脚印。";
    common.concern = "水位下降会把鱼群和饮水者都推向更拥挤的线";
    common.imageCue = "湖岸浅滩变窄，芦苇边留下低伏移动痕迹";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "河马") {
    common.summary = "河马把水位、浅滩拥挤和夜间草场当成领地边界";
    common.livedEvent = (eco.water || 0) < 48
      ? "水线退了，河马露出的背更多，浅滩变得不耐烦。"
      : "河湾深水还够，河马半沉着，只用鼻孔检查岸边动静。";
    common.concern = "水位下降会让河马、鳄鱼和饮水动物挤到同一条线上";
    common.imageCue = "河湾里冒出圆泡和两只小耳朵";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "狮子") {
    common.summary = "狮群用猎物队形和水源拥挤度判断是否扩张";
    common.livedEvent = (migration.delta || 0) < 0 ? "猎物队形变薄，狮群减少白天追逐。" : "狮群伏在草原阴影里，盯着羚羊和斑马队尾。";
    common.concern = "猎物过度流失会让狮群外扩，冲突会推到保护区边界";
    common.imageCue = "狮群卧在草原阴影，视线压向食草动物队尾";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "豹子") {
    common.summary = "豹子用灌丛阴影和风向寻找短距离伏击窗口";
    common.livedEvent = (reserve.poacherPressure || 0) > 52 ? "树影里混进金属味，豹子退到更深的灌丛。" : "豹子沿灌丛移动，没有把斑点暴露在阳光下。";
    common.concern = "灌丛退化会让伏击失败率升高，豹子会更靠近边界";
    common.imageCue = "灌丛边缘有一条低伏斑点影子";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "鳄鱼") {
    common.summary = "鳄鱼把水位和饮水队形当成伏击时钟";
    common.livedEvent = (eco.water || 0) < 48 ? "浅滩变窄，鳄鱼露出的背脊比昨天多。" : "鳄鱼只露出眼睛，贴着饮水线等待。";
    common.concern = "低水位会让饮水动物更集中，河岸冲突会快速升高";
    common.imageCue = "河岸水面只露出一排眼睛和浅浅波纹";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "火烈鸟") {
    common.summary = "火烈鸟用浅滩水质和岸边惊扰决定是否停留";
    common.livedEvent = (eco.water || 0) < 48
      ? "浅水线缩短，粉色队伍往湖心方向挪了几步。"
      : "火烈鸟在浅滩滤食，队形松散但没有起飞。";
    common.concern = "水质变浑或岸边惊扰会让水鸟迁走，湿地会少一层预警";
    common.imageCue = "浅滩边出现一排粉色长腿倒影";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "鹰") {
    common.summary = "鹰从高空读取河岸、草场和边界尘土";
    common.livedEvent = (reserve.poacherPressure || 0) > 52
      ? "边界尘土排得太直，鹰把盘旋圈压低了一层。"
      : "鹰借热气盘旋，把河岸和草场边缘扫了一遍。";
    common.concern = "空中视野能提前发现异常移动，但需要开阔草场和稳定气流";
    common.imageCue = "天空有一圈缓慢收紧的鹰影";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "秃鹫") {
    common.summary = "秃鹫负责发现自然死亡个体、疾病和异常冲突痕迹";
    common.livedEvent = (eco.disease || 0) > 24
      ? "秃鹫在草场边缘多绕了几圈，空气里有不该新鲜的味道。"
      : "秃鹫沿岩坡低飞，没有发现需要集结的坏消息。";
    common.concern = "秃鹫异常聚集通常意味着疾病、生态风险或偷猎残留";
    common.imageCue = "岩坡上方有白领大翅低低滑过";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "野犬") {
    common.summary = "非洲野犬用小队协作追踪羚羊队尾";
    common.livedEvent = (migration.delta || 0) < 0 ? "羚羊队尾散开，小队放弃无效追逐。" : "野犬小队沿草场边线试跑，耳朵一直朝着风。";
    common.concern = "过度追逐会让食草动物提前迁出安全区";
    common.imageCue = "几道彩色小影子沿草场边线拉开距离";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "斑马") {
    common.summary = "斑马用队形、条纹和集体警戒保护幼崽";
    common.livedEvent = (reserve.poacherPressure || 0) > 52 ? "队形散开，幼崽被推到条纹中间。" : "斑马群靠近水线，队尾一直有人回头。";
    common.concern = "水源拥挤时，队尾和幼崽最容易被冲散";
    common.imageCue = "草原上出现一段移动的黑白队形";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "羚羊") {
    common.summary = "羚羊最先把草高、风向和捕食者压力变成预警";
    common.livedEvent = fact.id === "predator_pressure" ? "草里眼神太多，羚羊先短跳试探退路。" : "羚羊在草场边缘反复试跳，确认安全边界。";
    common.concern = "开阔视野下降会让羚羊更早迁移";
    common.imageCue = "草场边缘有几次短跳留下的浅痕";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "长颈鹿") {
    common.summary = "长颈鹿像草原望塔，提前发现远处尘土和边界异动";
    common.livedEvent = (reserve.poacherPressure || 0) > 52 ? "远处尘土排成直线，长颈鹿把消息传给低处动物。" : "长颈鹿从树梢高度观察水线和草场。";
    common.concern = "幼崽需要开阔视野，灌丛和人类干扰都会改变停留点";
    common.imageCue = "树冠上方有一截长颈影子望向边界";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else if (npc.species === "大象") {
    common.summary = "象群用长期记忆寻找旱季水路和安全通道";
    common.livedEvent = (eco.water || 0) < 48 ? "旧水路被重新记起，幼象被带向更稳的水源。" : "象群沿河岸慢慢移动，鼻尖检查水汽。";
    common.concern = "水源下降会改变象群路线，也会带动其他食草动物跟随";
    common.imageCue = "河岸边有宽大的脚印和被卷起的湿泥";
    common.memory = `${input.day}日：${common.livedEvent}`;
  } else {
    common.summary = "动物根据气味、脚印和同类动静调整路线";
    common.livedEvent = `${fact.label}变化影响了它今天的移动。`;
    common.concern = fact.evidence || "环境正在变化";
    common.imageCue = "地图上出现新的活动痕迹";
    common.memory = `${input.day}日：${common.livedEvent}`;
  }
  return common;
}
function visualState(facts, input) {
  const byId = {};
  facts.forEach((fact) => { byId[fact.id] = fact; });
  const dangerFact = facts.find((fact) => fact.severity === "high") || facts.find((fact) => fact.severity === "medium") || byId.time_weather;
  return {
    waterLevel: byId.water.value,
    grassLevel: byId.grass.value,
    dangerRegionId: dangerFact.regionId,
    dangerLabel: dangerFact.label,
    waterCue: byId.water.delta < 0 ? "河岸收窄，浅滩露出泥线" : "雨水补进浅滩，水面更亮",
    grassCue: byId.grass.delta < 0 ? "草甸出现啃食斑块" : "草甸边缘重新泛绿",
    poacherCue: byId.poachers.severity === "high" ? "边界出现红色风险痕迹" : "巡护线保持低亮提示",
    animalFocusRegionIds: ["meadow", "center", "north", "rocks", "lake"]
  };
}
const NARRATIVE_FACT_RULES = {
  water: {
    actionId: "habitat", threshold: { metric: "water", operator: ">=", value: 52, label: "水源恢复至52" },
    dilemma: "先把有限资源留给水线，还是继续追查边界？",
    debt: "水位恢复会让更多动物集中，也会把捕食者带近浅滩。",
    hook: "天亮后，确认逆行脚印是否回到浅滩。"
  },
  grass: {
    actionId: "habitat", threshold: { metric: "grass", operator: ">=", value: 40, label: "草场恢复至40" },
    dilemma: "封闭草场让根系喘息，还是给迁徙队伍留下食物？",
    debt: "草场轮休能保住新芽，也会迫使弱小队伍走向外缘。",
    hook: "下一次风停时，查看队尾是否仍在保护区内。"
  },
  disease: {
    actionId: "intervention", threshold: { metric: "disease", operator: "<=", value: 36, label: "疾病降至36以下" },
    dilemma: "靠近救助病弱个体，还是保留群体最后的距离？",
    debt: "干预能减慢扩散，人类气味却会留在育幼地。",
    hook: "入夜后，确认哪一只没有回应群体呼叫。"
  },
  poachers: {
    actionId: "antiPoacher", threshold: { metric: "poacherPressure", operator: "<=", value: 50, label: "偷猎压力降至50以下" },
    dilemma: "立即封住入口，还是跟着脚印寻找更远的来源？",
    debt: "强力封锁能守住今晚，也会惊动依赖黑暗活动的动物。",
    hook: "下一班巡线时，寻找没有返回的第二串脚印。"
  },
  migration: {
    actionId: "habitat", threshold: { metric: "migrationDelta", operator: ">=", value: 0, label: "迁徙不再流失" },
    dilemma: "加固通道留住队伍，还是让它们自己决定去向？",
    debt: "安全通道能护送幼体，也可能让群体依赖人为路线。",
    hook: "清晨再数一次脚印，确认谁留下、谁继续走。"
  },
  population: {
    actionId: "habitat", threshold: { metric: "grass", operator: ">=", value: 55, label: "草场恢复至55" },
    dilemma: "接住回流的队伍，还是先守住保护区承载力？",
    debt: "动物增加不是纯粹的好消息，每一张嘴都会改变草场。",
    hook: "明天查看新脚印是否挤向同一个水点。"
  },
  predator_pressure: {
    actionId: "houndScout", threshold: { metric: "safety", operator: ">=", value: 64, label: "安全恢复至64" },
    dilemma: "保护眼前的猎物，还是接受捕食者也必须养活幼体？",
    debt: "改变一次追逐，只会把饥饿推向另一条路线。",
    hook: "下一次黄昏，确认捕食者是否绕向育幼地。"
  },
  time_weather: {
    actionId: "houndScout", threshold: { metric: "meaningfulActions", operator: ">=", value: 1, label: "完成一次有效巡线" },
    dilemma: "先确认最安静的异常，还是把补给留给更坏的夜晚？",
    debt: "没有立刻发生的坏事，也可能只是还没有被看见。",
    hook: "风向改变前，确认最边缘的动物还在不在。"
  }
};
function narrativeFact(facts) {
  return facts.find((fact) => fact.severity === "high")
    || facts.find((fact) => fact.severity === "medium" && fact.id !== "time_weather")
    || facts.find((fact) => fact.id === "migration" && fact.delta)
    || facts.find((fact) => fact.id === "water")
    || facts[0];
}
function narrativeSpeaker(fact, characters) {
  const preferred = {
    water: ["水貂", "大象", "鹿", "河马"],
    grass: ["鹿", "羚羊", "斑马"],
    disease: ["秃鹫", "乌鸦", "鹿"],
    poachers: ["乌鸦", "鹿", "熊"],
    migration: ["鹿", "大象", "斑马"],
    population: ["狼", "狮子", "鹿"],
    predator_pressure: ["狼", "狮子", "鹿"]
  }[fact && fact.id] || [];
  return preferred.map((species) => (characters || []).find((animal) => animal.species === species)).find(Boolean)
    || (characters || [])[0]
    || { id: "forest", name: "森林", shortName: "森林", species: "森林" };
}
function narrativeAnimalLine(fact, speaker, input) {
  const lines = {
    water: "幼崽今天还没有喝到水。",
    grass: "队尾已经在啃最后一层草根。",
    disease: "有一只，今夜没有回应。",
    poachers: "那不是兽类留下的直线。",
    migration: "我们要记住两条能离开的路。",
    population: "脚印多了，退路却没有变宽。",
    predator_pressure: "饥饿不会因为边界停下来。",
    time_weather: "风停以后，声音反而更少了。"
  };
  const migrationDelta = Number((((input || {}).reserve || {}).migration || {}).delta) || 0;
  if (fact && fact.id === "migration" && migrationDelta < 0) return "队伍少了，但幼崽还得继续走。";
  return lines[(fact && fact.id) || "time_weather"] || lines.time_weather;
}
function immediateNarrativeConsequence(input, fact) {
  const delta = input.delta || {};
  const action = input.action || "seed";
  if (action === "seed") return "你还没有行动，所有代价仍停在选择之前。";
  if (fact.id === "water" || fact.id === "grass" || fact.id === "disease") {
    const value = (input.reserve && input.reserve.ecology && input.reserve.ecology[fact.id]) || 0;
    return `${fact.label}现在为${value}；这次行动已经改变下一夜的承载力。`;
  }
  if (fact.id === "poachers") return `偷猎压力现在为${(input.reserve && input.reserve.poacherPressure) || 0}；脚印只退到了视线以外。`;
  if (fact.id === "migration") return `迁徙变化${delta.migration >= 0 ? "+" : ""}${delta.migration || 0}；留下与离开都已经发生。`;
  if (delta.safety) return `安全${delta.safety > 0 ? "+" : ""}${delta.safety}；被惊动的路线还没有重新安静。`;
  if (delta.fund) return `基金${delta.fund > 0 ? "+" : ""}${delta.fund}；下一次守护能动用的余地已经改变。`;
  return "行动已经写入保护区，真正的回声要等到下一次巡线。";
}
function buildNarrativeBeat(input = {}, factsInput = null, charactersInput = null) {
  const facts = factsInput || buildFacts(input);
  const fact = narrativeFact(facts);
  const characters = charactersInput || input.knownCharacters || ((input.world || {}).knownCharacters || []);
  const speaker = narrativeSpeaker(fact, characters);
  const rule = NARRATIVE_FACT_RULES[fact.id] || NARRATIVE_FACT_RULES.time_weather;
  const day = Math.max(1, Number(input.day || (input.world || {}).day) || 1);
  const place = regionNameById(fact.regionId, input.world || {});
  const sceneByFact = {
    water: `第${day}日，${place}的浅滩又短了一截，幼体被推到队伍内侧。`,
    grass: `第${day}日，${place}的新芽被反复踩断，队尾开始啃食草根。`,
    disease: `第${day}日，${place}少了一次回应，健康个体正在远离旧水点。`,
    poachers: `第${day}日，${place}出现过于笔直的脚印，动物先于巡护线转向。`,
    migration: `第${day}日，${place}的脚印改变方向，最年幼的个体走在中间。`,
    population: `第${day}日，${place}多了新的脚印，水草与退路却没有一起增加。`,
    predator_pressure: `第${day}日，${place}的追逐线靠近水边，猎物与捕食者都在养育后代。`,
    time_weather: `第${day}日，${place}最熟悉的叫声突然少了一次。`
  };
  return {
    id: `beat_${day}_${input.action || "seed"}_${fact.id}`,
    scene: sceneByFact[fact.id] || sceneByFact.time_weather,
    animalId: speaker.id || "forest",
    animalName: speaker.shortName || speaker.name || speaker.species || "森林",
    animalLine: narrativeAnimalLine(fact, speaker, input),
    dilemma: rule.dilemma,
    actionId: rule.actionId,
    threshold: Object.assign({}, rule.threshold),
    immediateConsequence: immediateNarrativeConsequence(input, fact),
    delayedDebt: rule.debt,
    nextHook: rule.hook,
    permanence: fact.severity === "high" ? "warning" : "none",
    factId: fact.id,
    factValue: fact.value,
    factDelta: fact.delta || 0
  };
}
function runForestDirector(input) {
  const world = input.world || {};
  const reserveView = input.reserveView || (world && world.reserveView) || (input.reserve && input.reserve.reserveView) || null;
  const facts = buildFacts(input);
  const dataSummary = {
    safety: (input.reserve && input.reserve.safety) || 0,
    water: (input.reserve && input.reserve.ecology && input.reserve.ecology.water) || 0,
    grass: (input.reserve && input.reserve.ecology && input.reserve.ecology.grass) || 0,
    disease: (input.reserve && input.reserve.ecology && input.reserve.ecology.disease) || 0,
    poacherPressure: (input.reserve && input.reserve.poacherPressure) || 0,
    predators: totalAnimals((input.reserve && input.reserve.ecology && input.reserve.ecology.predators) || {}),
    herbivores: totalAnimals((input.reserve && input.reserve.ecology && input.reserve.ecology.herbivores) || {}),
    migrationDelta: (input.reserve && input.reserve.migration && input.reserve.migration.delta) || 0
  };
  const animalMoods = {};
  const knownCharacters = (input.knownCharacters || world.knownCharacters || []).map((npc) => {
    const mood = animalMood(npc, facts, input);
    animalMoods[npc.id] = mood;
    return Object.assign({}, npc, {
      aiMood: mood,
      memory: ((npc.memory || []).concat(mood.memory)).slice(-5),
      publicState: mood.summary
    });
  });
  const view = visualState(facts, input);
  const narrativeBeat = buildNarrativeBeat(input, facts, knownCharacters);
  const director = {
    version: "local-forest-director-v2",
    day: input.day || world.day || 1,
    action: input.action || "patrol",
    location: input.location || "保护区",
    timeLabel: `第 ${input.day || world.day || 1} 日 ${(input.time && input.time.phase) || "未知时段"} · ${input.weather || world.weather || "天气未知"}`,
    principle: "数据决定事实，智能系统负责表达",
    facts,
    dataSummary,
    reserveView,
    animalMoods,
    narrativeBeat,
    visualState: view,
    pictureCues: [
      view.waterCue,
      view.grassCue,
      view.poacherCue,
      `${view.dangerLabel}集中在${regionNameById(view.dangerRegionId, world)}`
    ],
    summary: reserveView && reserveView.broadcasts && reserveView.broadcasts[1]
      ? `${reserveView.broadcasts[1].title}：${reserveView.broadcasts[1].body}`
      : `${dataSummary.migrationDelta < 0 ? "动物正在流失" : dataSummary.migrationDelta > 0 ? "动物开始迁入" : "动物保持观望"}，水源 ${dataSummary.water}，偷猎 ${dataSummary.poacherPressure}，安全 ${dataSummary.safety}。`
  };
  return { director, knownCharacters };
}
module.exports = {
  runForestDirector,
  buildNarrativeBeat
};
