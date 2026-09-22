const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");
const { recordFundChange } = require("./fundLedger");
const { recordIncrease } = require("./animalSourceLedger");
const { applyNarrativeBusinessOutcome } = require("./eventEconomy");
const {
  SPECIES_DB,
  SPECIES_RELATIONS,
  speciesPopulation,
  speciesPopulationGroup
} = require("./animalWorld");

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function boundedText(value, max = 180) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function namedSpecies(speciesId) {
  const species = SPECIES_DB[speciesId] || { id: speciesId, name: "动物", representative: { name: "无名个体" } };
  return {
    id: species.id,
    species: species.name,
    name: (species.representative && species.representative.name) || species.name
  };
}

function setPopulation(reserve, speciesId, value) {
  const group = speciesPopulationGroup(speciesId);
  reserve.ecology = reserve.ecology || {};
  reserve.ecology[group] = reserve.ecology[group] || {};
  reserve.ecology[group][speciesId] = Math.max(0, Math.round(Number(value) || 0));
}

function adjustPopulation(reserve, speciesId, delta, source) {
  const before = speciesPopulation(reserve, speciesId);
  setPopulation(reserve, speciesId, before + delta);
  const actual = speciesPopulation(reserve, speciesId) - before;
  if (actual > 0) recordIncrease(reserve, source, actual, { speciesId });
  return actual;
}

function populationTotal(group = {}) {
  return Object.keys(group).reduce((sum, key) => sum + Math.max(0, Number(group[key]) || 0), 0);
}

function normalizeArtifact(value = {}) {
  return {
    id: boundedText(value.id, 80),
    name: boundedText(value.name || "未命名生态物证", 32),
    icon: boundedText(value.icon || "eye", 24),
    reality: boundedText(value.reality, 220),
    story: boundedText(value.story, 220),
    easterEgg: boundedText(value.easterEgg, 220),
    eventId: boundedText(value.eventId, 80),
    day: Math.max(0, Math.round(Number(value.day) || 0)),
    archived: value.archived === true
  };
}

function normalizeNarrativeBeat(value = {}) {
  const threshold = value.threshold && typeof value.threshold === "object"
    ? Object.assign({}, value.threshold)
    : { label: boundedText(value.threshold, 80) };
  return {
    id: boundedText(value.id, 80),
    scene: boundedText(value.scene, 360),
    animalLine: boundedText(value.animalLine, 22),
    dilemma: boundedText(value.dilemma, 220),
    actionId: boundedText(value.actionId, 80),
    threshold,
    immediateConsequence: boundedText(value.immediateConsequence, 280),
    delayedDebt: boundedText(value.delayedDebt, 180),
    nextHook: boundedText(value.nextHook, 120),
    permanence: boundedText(value.permanence || "none", 24)
  };
}

function normalizeEvent(value = {}) {
  const event = {
    id: boundedText(value.id, 80),
    type: boundedText(value.type, 32),
    day: Math.max(0, Math.round(Number(value.day) || 0)),
    title: boundedText(value.title, 48),
    scene: boundedText(value.scene, 360),
    cause: boundedText(value.cause, 220),
    stakes: boundedText(value.stakes, 220),
    actors: (Array.isArray(value.actors) ? value.actors : []).slice(0, 4).map((actor) => ({
      id: boundedText(actor.id, 32), species: boundedText(actor.species, 20), name: boundedText(actor.name, 20), stance: boundedText(actor.stance, 80)
    })),
    dialogues: (Array.isArray(value.dialogues) ? value.dialogues : []).slice(0, 4).map((line) => ({
      actorId: boundedText(line.actorId, 32), speaker: boundedText(line.speaker, 24), text: boundedText(line.text, 220), tone: boundedText(line.tone, 24)
    })),
    populationChanges: Object.assign({}, value.populationChanges || {}),
    environmentalChanges: Object.assign({}, value.environmentalChanges || {}),
    foreshadow: boundedText(value.foreshadow, 240),
    threadId: boundedText(value.threadId, 64),
    artifact: value.artifact ? normalizeArtifact(value.artifact) : null,
    choices: (Array.isArray(value.choices) ? value.choices : []).slice(0, 1).map((choice) => ({
      id: boundedText(choice.id, 32), label: boundedText(choice.label, 20), cost: boundedText(choice.cost, 80), preview: boundedText(choice.preview, 180)
    })),
    resolvedChoiceId: boundedText(value.resolvedChoiceId, 32),
    outcome: boundedText(value.outcome, 280)
  };
  const firstVoice = event.dialogues[0] || {};
  event.narrativeBeat = normalizeNarrativeBeat(value.narrativeBeat || {
    id: event.id,
    scene: event.scene,
    animalLine: firstVoice.text,
    dilemma: event.stakes,
    actionId: event.choices.map((choice) => choice.id).join("|"),
    threshold: { label: event.choices.map((choice) => choice.cost).join(" / ") },
    immediateConsequence: event.outcome || "结果尚未发生；这次行动会留下代价。",
    delayedDebt: event.stakes,
    nextHook: ECOLOGY_NEXT_HOOKS[event.type] || event.foreshadow,
    permanence: event.type === "juvenile_loss" ? "life" : "memory"
  });
  return event;
}

function normalizeEcologyNarrative(value = {}) {
  const artifacts = {};
  Object.keys(value.artifacts || {}).slice(0, 80).forEach((id) => { artifacts[id] = normalizeArtifact(value.artifacts[id]); });
  return {
    version: 1,
    lastDay: Math.max(0, Math.round(Number(value.lastDay) || 0)),
    serial: Math.max(0, Math.round(Number(value.serial) || 0)),
    lastEvent: value.lastEvent ? normalizeEvent(value.lastEvent) : null,
    pendingDecision: value.pendingDecision ? normalizeEvent(value.pendingDecision) : null,
    history: (Array.isArray(value.history) ? value.history : []).map(normalizeEvent).filter((event) => event.id).slice(-24),
    artifacts,
    threads: Object.assign({}, value.threads || {})
  };
}

const ECOLOGY_NEXT_HOOKS = {
  predation: "下一次黄昏，确认捕食者是否绕向育幼地。",
  disease: "天亮后，确认哪一只仍没有回应。",
  overgrazing: "下一轮返青时，查看先退的队伍是否回来。",
  territorial: "入夜后，比较同一树皮上的标记高度。",
  birth: "下一次清晨，寻找幼体留下的新脚印。",
  migration: "清晨再数一次留下与离开的脚印。",
  juvenile_loss: "天亮后，确认更轻的脚印去了哪里。",
  competition: "下一次取食时，确认较弱队伍是否缺席。",
  symbiosis: "第三个物种出现时，再判断合作是否继续。",
  weather: "下一阵异常风来时，确认谁先离开。"
};

const ECOLOGY_DECISION_DEBTS = {
  "predation:rescue": "救下一只猎物，会把饥饿推向捕食者的巢。",
  "predation:observe": "保留自然过程，也要承担没有伸手的记录。",
  "disease:isolate": "传播变慢，病弱个体却被留在群体之外。",
  "disease:disperse": "密度下降，病征可能沿开放路线继续移动。",
  "overgrazing:rest": "根系得到恢复，部分队伍必须暂时离开。",
  "overgrazing:corridor": "取食压力分散，巡护边界因此被拉长。",
  "territorial:buffer": "冲突下降，人类划出的边界会覆盖旧记忆。",
  "territorial:watch": "保留自然边界，也保留下一夜受伤的风险。",
  "birth:quiet_guard": "幼体更安全，亲代会把灯光记成需要绕开的气味。",
  "birth:distance": "不制造依赖，也放弃了及时靠近救助的机会。",
  "migration:corridor_guard": "幼体通过，人类必须守住更长的开放边界。",
  "migration:observe_route": "路线保持自主，群体也可能离开理想水草。",
  "juvenile_loss:emergency_care": "生命被挽回，育幼地对人类的警惕永久增加。",
  "juvenile_loss:keep_distance": "现场保持完整，这次死亡不会被撤销。",
  "competition:seasonal_zones": "新芽恢复，取食顺序开始由人类决定。",
  "competition:natural_shift": "竞争保持自然，较弱种群可能被逐出核心区。",
  "symbiosis:preserve_process": "互利继续，病原与误触风险也被一并保留。",
  "symbiosis:sanitary_clear": "眼前风险下降，自然互利失去发生条件。",
  "weather:open_shelter": "阴凉和水点被打开，动物也会把这里记成下一次热压的集合点。",
  "weather:ride_it_out": "保留自然承压，掉队和病征会在下一阵异常天气里被重新点名。"
};

function ecologyDecisionDebt(eventType = "", choiceId = "", fallback = "") {
  return ECOLOGY_DECISION_DEBTS[`${eventType}:${choiceId}`] || fallback;
}

function ecologyEventIsIrreversible(event) {
  return Object.values((event && event.populationChanges) || {}).some((value) => Number(value) < 0);
}

function irreversibleEventInCycle(state, day) {
  const cycleStart = Math.floor((Math.max(1, day) - 1) / 7) * 7 + 1;
  return (state.history || []).some((event) => event.day >= cycleStart && event.day <= day && ecologyEventIsIrreversible(event));
}

function hasEcologyWarning(state, day) {
  const warningTypes = new Set(["disease", "overgrazing", "migration", "territorial", "competition"]);
  return (state.history || []).some((event) => event.day < day && event.day >= day - 6 && warningTypes.has(event.type));
}

function predatorPreyCandidates(reserve) {
  return Object.keys(SPECIES_RELATIONS).map((key) => {
    const relation = SPECIES_RELATIONS[key];
    if (!relation || relation.type !== "predator_prey") return null;
    const [predatorId, preyId] = key.split(":");
    const predatorPop = speciesPopulation(reserve, predatorId);
    const preyPop = speciesPopulation(reserve, preyId);
    if (predatorPop <= 0 || preyPop <= 0) return null;
    return { predatorId, preyId, predatorPop, preyPop, strength: relation.strength || 1, score: (relation.strength || 1) * 4 + predatorPop * 1.4 - preyPop * 0.08 };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

function territorialCandidates(reserve) {
  return Object.keys(SPECIES_RELATIONS).map((key) => {
    const relation = SPECIES_RELATIONS[key];
    if (!relation || relation.type !== "territorial") return null;
    const [leftId, rightId] = key.split(":");
    const leftPop = speciesPopulation(reserve, leftId);
    const rightPop = speciesPopulation(reserve, rightId);
    if (leftPop <= 0 || rightPop <= 0) return null;
    return { leftId, rightId, leftPop, rightPop, strength: relation.strength || 1, score: (relation.strength || 1) * 5 + Math.min(leftPop, rightPop) };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

function relationCandidates(reserve, type) {
  return Object.keys(SPECIES_RELATIONS).map((key) => {
    const relation = SPECIES_RELATIONS[key];
    if (!relation || relation.type !== type) return null;
    const [leftId, rightId] = key.split(":");
    const leftPop = speciesPopulation(reserve, leftId);
    const rightPop = speciesPopulation(reserve, rightId);
    if (leftPop <= 0 || rightPop <= 0) return null;
    return { leftId, rightId, leftPop, rightPop, strength: relation.strength || 1, score: (relation.strength || 1) * 4 + Math.min(leftPop, rightPop) };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

function eventArtifact(type, eventId, day, actors = []) {
  const names = actors.map((actor) => actor.name).join("与");
  const catalog = {
    predation: {
      name: "断续的饮水线足迹拓片", icon: "trail",
      reality: "足迹间距、方向和边缘清晰度可帮助判断追逐发生的时段与路线，但不能仅凭一组脚印推断全部个体数量。",
      story: `${names}在同一条饮水线上留下了彼此覆盖的痕迹。拓片没有替任何一方辩解，只记录这一夜谁曾饥饿、谁曾逃跑。`,
      easterEgg: "拓片边缘有一枚更小的足印，方向却朝向追逐发生前的灌丛；它可能属于一只尚未被记录的幼体。"
    },
    disease: {
      name: "病群水点沉积样本", icon: "water",
      reality: "沉积物记录动物集中饮水后的有机物与病原压力，只能由具备防护条件的巡护人员封存检测。",
      story: `${names}曾轮流避开这个水点。样本瓶上的日期说明，最早察觉异常的不是人类仪器。`,
      easterEgg: "瓶底夹着一根不属于现场常见物种的细羽，暗示病征可能沿迁徙路线来自更远的湿地。"
    },
    overgrazing: {
      name: "被反复啃食的草根剖面", icon: "leaf",
      reality: "根颈高度和新芽数量能反映连续取食压力；保留剖面比只记录地表绿色更接近草场真实恢复能力。",
      story: `${names}经过后，草面仍是绿色，根部却已没有余力。它提醒守护者：看起来繁盛的种群也可能正在透支明天。`,
      easterEgg: "剖面深处保存着上一场旱季留下的炭屑，说明这片草场曾经靠一次火后更新重新长出。"
    },
    territorial: {
      name: "领地交界气味标记布", icon: "claw",
      reality: "气味标记与擦痕可帮助确认领地重叠范围；采样必须避开繁殖巢穴，防止人为扩大冲突。",
      story: `${names}把同一块树皮当作边界。布样上两种气味没有真正混合，像两封从未寄出的警告。`,
      easterEgg: "标记高度在连续三夜逐渐降低，可能意味着其中一只动物带伤，或更年轻的个体正在接替旧领地。"
    },
    birth: {
      name: "育幼地外缘脱落绒毛", icon: "berry",
      reality: "自然脱落绒毛能确认育幼活动而不接触幼体；发现后应降低照明、噪声和人员停留时间。",
      story: `${names}没有把新生命交给保护区，只是暂时允许它在边界内出生。这个区别必须被记住。`,
      easterEgg: "绒毛旁压着一段旧项圈纤维，像是某个曾离开的个体又沿记忆回到了育幼地。"
    },
    migration: {
      name: "迁徙通道边缘泥线图", icon: "migration",
      reality: "连续泥线、粪迹与取食痕能帮助确认群体通过方向和时间，但迁徙路线会随水草、惊扰和代际经验改变。",
      story: `${names}把保护区当作一段路，而不是终点。图上的空白不是记录失败，是动物仍保有不被人类命名的去处。`,
      easterEgg: "泥线北端出现一组与当前队伍方向相反的旧脚印，某个离开的群体可能正从另一条路返回。"
    },
    juvenile_loss: {
      name: "育幼地外缘静默记录页", icon: "leaf",
      reality: "幼体死亡率受疾病、营养、天气与捕食共同影响；远距离记录能确认结果，不能仅凭缺少脚印判定死亡原因。",
      story: `${names}在天亮前离开了育幼地。记录页没有保存死亡画面，只留下成年个体多停留的那段时间。`,
      easterEgg: "记录页末尾还有一串极轻的新脚印，可能属于同窝中尚未被确认存活的另一只幼体。"
    },
    competition: {
      name: "重叠取食痕分层拓片", icon: "claw",
      reality: "不同齿痕高度、蹄印和取食植物可提示资源竞争范围；短时重叠不等同于长期排斥，需要连续样线调查。",
      story: `${names}在同一片草根上留下不同方向的咬痕。没有谁拥有这片食物，饥饿却会替每一方划出边界。`,
      easterEgg: "拓片下层有第三种更旧齿痕，说明当前冲突可能源于一个已经离开的种群留下的生态空位。"
    },
    symbiosis: {
      name: "共生现场非侵入观察片", icon: "eye",
      reality: "清道、警戒、翻土或共享资源可让不同物种同时获益，但互利通常有条件，也可能在资源短缺时转为竞争。",
      story: `${names}没有彼此承诺，只在这一刻让对方的生存方式变得稍微容易。互助不是温顺，是长期选择留下的缝隙。`,
      easterEgg: "观察片边缘记录到一次中断：第三个物种出现后，原本稳定的互利关系立刻改变了距离。"
    },
    weather: {
      name: "异常天气现场泥线标本", icon: "water",
      reality: "热浪、暴雨、沙尘与寒雾会在短时间内改写饮水窗口、气味线和幼体跟随距离，不能只用单一气温读数解释伤亡。",
      story: `${names}把这场异常天气写成一次必须改道的记忆。标本没有美化忍耐，只留下谁先停步、谁先回头。`,
      easterEgg: "标本边缘有一层不属于当天风向的细沙，说明下一次异常可能从另一侧边界提前抵达。"
    }
  };
  return Object.assign({ id: `eco_artifact_${eventId}`, eventId, day, archived: false }, catalog[type] || catalog.predation);
}

function buildPredationEvent(reserve, beforeReserve, day, serial, candidate) {
  if (!candidate) return null;
  const predator = namedSpecies(candidate.predatorId);
  const prey = namedSpecies(candidate.preyId);
  const eventId = `eco_${day}_${serial}_predation_${predator.id}_${prey.id}`;
  const before = speciesPopulation(reserve, prey.id);
  const alreadyLost = Math.max(0, speciesPopulation(beforeReserve || {}, prey.id) - before);
  const loss = alreadyLost > 0 ? 0 : before > 8 ? 1 : 0;
  if (loss) setPopulation(reserve, prey.id, before - loss);
  const actors = [
    Object.assign({}, prey, { stance: "把幼体围在队伍内侧；它知道捕食者也在养育后代，却无法因此停止恐惧。" }),
    Object.assign({}, predator, { stance: "饥饿迫使它靠近饮水线；它不信任人类会理解捕食者幼体同样需要食物。" })
  ];
  return normalizeEvent({
    id: eventId, type: "predation", day,
    title: `${predator.species}沿饮水线追上了${prey.species}`,
    scene: `黄昏以后，${prey.species}群在变窄的饮水线收紧队形。${predator.species}从风下方逼近。天亮时，泥地少了一串脚步；更远处的育幼地，饥饿也暂时安静。`,
    cause: `${predator.species}${candidate.predatorPop}只、${prey.species}${candidate.preyPop}只；捕食关系强度${candidate.strength}。水源集中让双方路线重叠。`,
    stakes: "救下眼前的猎物会缓冲一次死亡，却可能把饥饿推向捕食者的幼体；完全不介入则意味着承认保护区无法取消自然淘汰。",
    actors,
    dialogues: [
      { actorId: prey.id, speaker: prey.name, tone: "护幼", text: "今晚，幼崽必须走在中间。" },
      { actorId: predator.id, speaker: predator.name, tone: "饥饿", text: "我的巢里，也有饥饿的幼崽。" }
    ],
    populationChanges: { [prey.id]: -loss },
    environmentalChanges: {},
    foreshadow: "饮水线旁还留有一枚方向相反的小足印。下一次迁徙统计可能说明，它属于逃散的幼体，还是另一只尚未登记的捕食者。",
    threadId: `thread_predation_${predator.id}_${prey.id}`,
    artifact: eventArtifact("predation", eventId, day, actors),
    choices: [
      { id: "observe", label: "守住观察线", cost: "不逆转本次种群损失", preview: "减少人为惊扰，记录捕食路线；接受自然法则留下的重量。" },
      { id: "rescue", label: "转移受伤个体", cost: "医疗包×1，草场-1", preview: "救回1只猎物，但捕食者饥饿与路线改变会成为后续伏笔。" }
    ]
  });
}

function buildDiseaseEvent(reserve, day, serial) {
  const eco = reserve.ecology || {};
  const populated = Object.keys(SPECIES_DB).filter((id) => speciesPopulation(reserve, id) > 0).sort((a, b) => speciesPopulation(reserve, b) - speciesPopulation(reserve, a));
  const primary = namedSpecies(populated[0] || "deer");
  const observer = namedSpecies(populated.find((id) => ["vulture", "crow", "owl"].includes(id)) || "crow");
  const eventId = `eco_${day}_${serial}_disease_${primary.id}`;
  const actors = [Object.assign({}, primary, { stance: "把病弱个体留在队伍边缘，却不愿让它们独自面对夜晚。" }), Object.assign({}, observer, { stance: "从气味和沉默中判断扩散方向，不把死亡误认成食物充足。" })];
  return normalizeEvent({
    id: eventId, type: "disease", day, title: `${primary.species}群开始避开旧水点`,
    scene: `清晨，${primary.species}群在旧水点前停住。几只老弱个体没有跟上转向。${observer.species}在上空多绕了一圈，却没有落下。`,
    cause: `疾病压力${clamp(eco.disease)}，水源${clamp(eco.water)}、草场${clamp(eco.grass)}。集中饮水与营养压力正在共同削弱幼体和老弱个体。`,
    stakes: "隔离能减慢传播，却可能拆散依靠群体保护的病弱个体；开放迁移可降低密度，也可能把病征带往下一片栖息地。",
    actors,
    dialogues: [
      { actorId: primary.id, speaker: primary.name, tone: "迟疑", text: "它走得慢，不是愿意被留下。" },
      { actorId: observer.id, speaker: observer.name, tone: "警戒", text: "先记住，谁没有回应。" }
    ],
    foreshadow: "沉积样本里出现一根来自远方湿地的细羽，病征可能并非始于本保护区。",
    threadId: `thread_disease_${primary.id}`,
    artifact: eventArtifact("disease", eventId, day, actors),
    choices: [
      { id: "isolate", label: "隔离旧水点", cost: "医疗包×1，水源-2", preview: "疾病-6，但群体迁移暂时下降。" },
      { id: "disperse", label: "开放分散水线", cost: "野外工具包×1", preview: "水源-1、疾病-3，迁徙路线更开放，也保留跨区扩散风险。" }
    ]
  });
}

function buildOvergrazingEvent(reserve, day, serial) {
  const eco = reserve.ecology || {};
  const herbivores = Object.keys(eco.herbivores || {}).filter((id) => speciesPopulation(reserve, id) > 0).sort((a, b) => speciesPopulation(reserve, b) - speciesPopulation(reserve, a));
  const herd = namedSpecies(herbivores[0] || "deer");
  const eventId = `eco_${day}_${serial}_overgrazing_${herd.id}`;
  const actors = [Object.assign({}, herd, { stance: "需要继续进食，也能察觉草根已经承受不起下一轮取食。" })];
  return normalizeEvent({
    id: eventId, type: "overgrazing", day, title: `${herd.species}群正在透支返青草场`,
    scene: `远看草场仍有绿色，近处的新芽却被反复咬断。${herd.species}群没有停下，因为饥饿不会等待根系恢复。`,
    cause: `食草动物${populationTotal(eco.herbivores || {})}只，草场${clamp(eco.grass)}。短期种群繁盛已经超过草根恢复速度。`,
    stakes: "封闭草场能保护植被，却把觅食压力推向边界；开放迁出会给草留下时间，也意味着承认一些动物必须离开理想庇护地。",
    actors,
    dialogues: [{ actorId: herd.id, speaker: herd.name, tone: "疲惫", text: "幼崽今天也要吃，请留一条退路。" }],
    foreshadow: "草根剖面里夹着旧火场炭屑；下一次雷火可能带来毁坏，也可能带来这片草场无法自行完成的更新。",
    threadId: `thread_grass_${herd.id}`,
    artifact: eventArtifact("overgrazing", eventId, day, actors),
    choices: [
      { id: "rest", label: "轮休核心草场", cost: "迁徙-2", preview: "草场+5，但一部分动物会向保护区外寻找食物。" },
      { id: "corridor", label: "开放外缘取食廊道", cost: "安全-2", preview: "草场+2、迁徙稳定；边界暴露和巡护压力上升。" }
    ]
  });
}

function buildTerritorialEvent(reserve, day, serial, candidate) {
  if (!candidate) return null;
  const left = namedSpecies(candidate.leftId);
  const right = namedSpecies(candidate.rightId);
  const eventId = `eco_${day}_${serial}_territorial_${left.id}_${right.id}`;
  const actors = [Object.assign({}, left, { stance: "把旧巢、幼体和熟悉气味视为不能后退的边界。" }), Object.assign({}, right, { stance: "资源缩窄后扩大活动范围，不认为人类画出的线具有意义。" })];
  return normalizeEvent({
    id: eventId, type: "territorial", day, title: `${left.species}与${right.species}在旧边界相遇`,
    scene: `夜里，同一段树皮先后留下两种气味。没有持续搏斗，只有一次短促追逐和长时间对峙。双方都没有真正离开。`,
    cause: `${left.species}${candidate.leftPop}只、${right.species}${candidate.rightPop}只；领地冲突强度${candidate.strength}。水草和隐蔽点的重叠正在缩短彼此退让的距离。`,
    stakes: "设置缓冲区能减少冲突，却人为切碎其中一方的旧领地；不介入保留自然边界，也可能让带伤个体在后续冲突中失去位置。",
    actors,
    dialogues: [
      { actorId: left.id, speaker: left.name, tone: "固守", text: "新边界不会让旧巢搬家。" },
      { actorId: right.id, speaker: right.name, tone: "戒备", text: "退路窄了，每一步都像入侵。" }
    ],
    foreshadow: "气味标记的高度连续下降，可能有一只带伤个体正在失去领地。下一次对峙未必仍能各自退开。",
    threadId: `thread_territory_${left.id}_${right.id}`,
    artifact: eventArtifact("territorial", eventId, day, actors),
    choices: [
      { id: "buffer", label: "设置静默缓冲区", cost: "基金-60、草场-1", preview: "降低冲突压力，但人为改变双方旧路线。" },
      { id: "watch", label: "不改边界只监测", cost: "稳定-1", preview: "保留自然领地关系，并把带伤个体线索写入长期观察。" }
    ]
  });
}

function buildBirthEvent(reserve, day, serial) {
  const candidates = Object.keys(SPECIES_DB).filter((id) => speciesPopulation(reserve, id) >= 2 && !["vulture", "crow"].includes(id));
  const speciesId = candidates[day % Math.max(1, candidates.length)] || "deer";
  const parent = namedSpecies(speciesId);
  const eventId = `eco_${day}_${serial}_birth_${parent.id}`;
  const actors = [Object.assign({}, parent, { stance: "愿意在保护区育幼，却仍把人类接近视为需要衡量的风险。" })];
  return normalizeEvent({
    id: eventId, type: "birth", day, title: `${parent.species}育幼地传来新的脚步`,
    scene: `巡护线外缘出现一组极轻的脚印。成年个体没有求助，只在你靠近前把幼体带进更深的遮蔽。新生命属于种群，不属于保护区的成绩单。`,
    cause: `水源与草场暂时稳定，疾病压力较低；${parent.species}种群具备一次繁衍窗口。`,
    stakes: "加密守护能降低意外风险，也可能让育幼地依赖人类边界；保持距离尊重野性，却接受幼体仍会面对疾病与捕食。",
    actors,
    dialogues: [{ actorId: parent.id, speaker: parent.name, tone: "护幼", text: "守住远处，别让它先学会依赖。" }],
    foreshadow: "绒毛旁有一段旧项圈纤维；某个曾离开的个体可能沿记忆回到了这里。",
    threadId: `thread_birth_${parent.id}`,
    artifact: eventArtifact("birth", eventId, day, actors),
    choices: [
      { id: "quiet_guard", label: "远距离加密巡护", cost: "基金-40", preview: "幼体存活机会提高，亲代对人类警惕略有上升。" },
      { id: "distance", label: "撤出育幼地", cost: "不提供额外保护", preview: "保持野性与自然选择，接受幼体风险仍然存在。" }
    ]
  });
}

function buildMigrationEvent(reserve, day, serial) {
  const eco = reserve.ecology || {};
  const populated = Object.keys(SPECIES_DB).filter((id) => speciesPopulation(reserve, id) > 0).sort((a, b) => speciesPopulation(reserve, b) - speciesPopulation(reserve, a));
  const traveler = namedSpecies(populated[0] || "deer");
  const witnessId = populated.find((id) => ["crow", "eagle", "giraffe", "elephant"].includes(id) && id !== traveler.id);
  const witness = namedSpecies(witnessId || traveler.id);
  const migration = reserve.migration || {};
  const leaving = Number(migration.delta) < 0 || migration.trend === "out";
  const eventId = `eco_${day}_${serial}_migration_${traveler.id}`;
  const actors = [
    Object.assign({}, traveler, { stance: leaving ? "带幼体离开熟悉水点；它不把离开视为背叛，只把停留视为需要条件的选择。" : "沿新通道进入保护区，却仍保留随时转向的队形。" }),
    Object.assign({}, witness, { stance: "从更远处记录队伍方向，知道一条被人类保护的路也可能变成被人类控制的路。" })
  ];
  return normalizeEvent({
    id: eventId, type: "migration", day, title: `${traveler.species}群在夜里改变了路线`,
    scene: leaving
      ? `入夜后，${traveler.species}群没有回到旧水点。幼体走在队伍中间，最年长的个体最后一次停下闻风，然后把保护区留在身后。`
      : `一条新的${traveler.species}队伍沿外缘进入保护区。它们没有散开取食，只在确认两处退路后让幼体低头。`,
    cause: `迁徙${Number(migration.delta) >= 0 ? "+" : ""}${Number(migration.delta) || 0}；${migration.reason || `水源${clamp(eco.water)}、草场${clamp(eco.grass)}共同改变了路线`}。水源、草场承载量与边界惊扰共同决定群体是否继续停留。`,
    stakes: "加固通道能降低眼前风险，也会让动物逐渐依赖人为路线；只做观察保留自主迁徙，却接受群体可能离开理想庇护地。",
    actors,
    dialogues: [
      { actorId: traveler.id, speaker: traveler.name, tone: leaving ? "离开" : "试探", text: leaving ? "记得这里，也不能替幼崽找到出口。" : "先让幼崽记住两条能离开的路。" },
      { actorId: witness.id, speaker: witness.name, tone: "见证", text: "路线只在继续行走时存在。" }
    ],
    foreshadow: "北端泥线出现方向相反的旧脚印；另一支群体可能沿一条没有登记的路线接近。",
    threadId: `thread_migration_${traveler.id}`,
    artifact: eventArtifact("migration", eventId, day, actors),
    choices: [
      { id: "corridor_guard", label: "守住开放通道", cost: "基金-30、安全-1", preview: "迁徙改善，但开放边界会增加巡护压力。" },
      { id: "observe_route", label: "只记录不引导", cost: "接受群体自主离开", preview: "生态记录+1，不把迁徙路线固化成人类设施。" }
    ]
  });
}

function buildJuvenileLossEvent(reserve, beforeReserve, day, serial) {
  const candidates = Object.keys(SPECIES_DB).filter((id) => speciesPopulation(reserve, id) >= 3 && !["vulture", "crow"].includes(id));
  const speciesId = candidates[(day + serial) % Math.max(1, candidates.length)] || "deer";
  const parent = namedSpecies(speciesId);
  const witnessId = Object.keys(SPECIES_DB).find((id) => ["vulture", "crow", "owl"].includes(id) && speciesPopulation(reserve, id) > 0) || "crow";
  const witness = namedSpecies(witnessId);
  const current = speciesPopulation(reserve, speciesId);
  const alreadyLost = Math.max(0, speciesPopulation(beforeReserve || {}, speciesId) - current);
  const loss = alreadyLost > 0 ? 0 : current > 3 ? 1 : 0;
  if (loss) setPopulation(reserve, speciesId, current - loss);
  const eventId = `eco_${day}_${serial}_juvenile_loss_${parent.id}`;
  const actors = [
    Object.assign({}, parent, { stance: "守在不再回应的幼体旁，也必须在天亮后带其余幼体继续移动。" }),
    Object.assign({}, witness, { stance: "知道死亡会进入分解与清理，却暂时保持距离，不把悲伤误认成可利用的空隙。" })
  ];
  return normalizeEvent({
    id: eventId, type: "juvenile_loss", day, title: `${parent.species}育幼地少了一次回应`,
    scene: `夜间降温后，一只幼体没有再跟上队伍。成年${parent.species}在原地停留很久，随后带着仍活着的幼体离开。${witness.species}落在远处，没有靠近。`,
    cause: `疾病${clamp((reserve.ecology || {}).disease)}、水源${clamp((reserve.ecology || {}).water)}、草场${clamp((reserve.ecology || {}).grass)}；幼体对失温、营养和感染的承受力低于成年个体。`,
    stakes: "紧急救助可能挽回一个个体，也可能把人类气味带进育幼地并消耗有限医疗物资；不介入则承认繁衍从不保证存活。",
    actors,
    dialogues: [
      { actorId: parent.id, speaker: parent.name, tone: "失去", text: "这不是忘记，活着的不能一起停下。" },
      { actorId: witness.id, speaker: witness.name, tone: "克制", text: "今天，最后一段距离留给它们。" }
    ],
    populationChanges: { [parent.id]: -loss },
    foreshadow: "育幼地边缘还有一串更轻的新脚印；同窝另一只幼体可能离群，也可能仍在遮蔽中。",
    threadId: `thread_juvenile_${parent.id}`,
    artifact: eventArtifact("juvenile_loss", eventId, day, actors),
    choices: [
      { id: "emergency_care", label: "尝试紧急救助", cost: "医疗包×1、水源-1", preview: "若本夜尚有挽回空间则恢复1只，但育幼地惊扰与亲代警惕上升。" },
      { id: "keep_distance", label: "保持距离并记录", cost: "不逆转本次死亡", preview: "生态记录+1；保存完整现场，不把死亡变成可领取奖励。" }
    ]
  });
}

function buildCompetitionEvent(reserve, day, serial, candidate) {
  if (!candidate) return null;
  const left = namedSpecies(candidate.leftId);
  const right = namedSpecies(candidate.rightId);
  const eventId = `eco_${day}_${serial}_competition_${left.id}_${right.id}`;
  const actors = [
    Object.assign({}, left, { stance: "把熟悉取食地留给幼体，宁愿用更激烈的驱赶维持短期生存。" }),
    Object.assign({}, right, { stance: "种群增加后必须扩大取食范围，不承认先到者永久拥有公共资源。" })
  ];
  return normalizeEvent({
    id: eventId, type: "competition", day, title: `${left.species}与${right.species}争夺同一片取食地`,
    scene: `清晨前，两支队伍在返青草地相遇。没有持续搏斗，只有反复逼近、退开和被踩断的新芽。幼体被各自围在后方。`,
    cause: `${left.species}${candidate.leftPop}只、${right.species}${candidate.rightPop}只；资源竞争强度${candidate.strength}，草场${clamp((reserve.ecology || {}).grass)}、水源${clamp((reserve.ecology || {}).water)}。`,
    stakes: "分隔取食地能暂时减少冲突，却会把公共资源变成人类划定的份额；不介入保留自然竞争，也可能让较弱种群被逐步排出。",
    actors,
    dialogues: [
      { actorId: left.id, speaker: left.name, tone: "护群", text: "今天退开，幼崽就少下一口。" },
      { actorId: right.id, speaker: right.name, tone: "争取", text: "饥饿不记得谁先来到这里。" }
    ],
    foreshadow: "两层齿痕下还有第三种更旧痕迹；已经离开的种群可能曾维持过这里的取食平衡。",
    threadId: `thread_competition_${left.id}_${right.id}`,
    artifact: eventArtifact("competition", eventId, day, actors),
    choices: [
      { id: "seasonal_zones", label: "设置季节轮换区", cost: "基金-40、迁徙-1", preview: "草场+3、稳定+1，但人类开始分配取食空间。" },
      { id: "natural_shift", label: "允许自然位移", cost: "稳定-2", preview: "保留竞争与自主迁移，观察较弱种群是否退出。" }
    ]
  });
}

function buildSymbiosisEvent(reserve, day, serial, candidate) {
  if (!candidate) return null;
  const left = namedSpecies(candidate.leftId);
  const right = namedSpecies(candidate.rightId);
  const eventId = `eco_${day}_${serial}_symbiosis_${left.id}_${right.id}`;
  const actors = [
    Object.assign({}, left, { stance: "接受对方带来的短期好处，却不会因此放弃自己的领地与食物判断。" }),
    Object.assign({}, right, { stance: "利用对方留下的资源或信息，也随时准备在条件改变时退出。" })
  ];
  return normalizeEvent({
    id: eventId, type: "symbiosis", day, title: `${left.species}与${right.species}短暂共享了生存优势`,
    scene: `一方经过后留下可利用的食物、通道或警戒信息，另一方随即跟上。它们没有靠近到温顺的距离，只把彼此存在变成这一夜更低的代价。`,
    cause: `${left.species}${candidate.leftPop}只、${right.species}${candidate.rightPop}只；互利关系强度${candidate.strength}。水草暂时允许双方不必为同一份资源立即冲突。`,
    stakes: "保护这段关系需要保留残骸、腐木或开放通道，也意味着接受不整洁和新的风险；过度清理更安全，却会切断自然互利。",
    actors,
    dialogues: [
      { actorId: left.id, speaker: left.name, tone: "保留距离", text: "它的动静，让我少走一段险路。" },
      { actorId: right.id, speaker: right.name, tone: "互利", text: "别把这叫成友谊，条件变了仍会争夺。" }
    ],
    foreshadow: "观察在第三个物种出现时中断；下一次相遇，这段互利可能转为竞争或新的食物链关系。",
    threadId: `thread_symbiosis_${left.id}_${right.id}`,
    artifact: eventArtifact("symbiosis", eventId, day, actors),
    choices: [
      { id: "preserve_process", label: "保留自然过程", cost: "安全-1", preview: "草场+1、生态+1，保留残骸/腐木与互利空间。" },
      { id: "sanitary_clear", label: "进行卫生清理", cost: "互利现场中断", preview: "疾病-2、安全+1，但长期共生线索被削弱。" }
    ]
  });
}

function weatherAnomalyKind(reserve = {}, context = {}) {
  const emergency = ((reserve.emergency || {}).active || {}).type || "";
  const pulse = String(((reserve.weatherPulse || {}).type) || "");
  const weather = String(context.weather || (reserve.lastSeasonEffect || {}).weather || (reserve.seasonState || {}).weather || "");
  if (emergency === "sandbox_wildfire" || emergency === "wildfire") return "wildfire";
  if (emergency === "sandbox_flood" || emergency === "flash_flood") return "flash_flood";
  if (["heatwave", "dust_storm", "cold_fog"].includes(emergency)) return emergency;
  if (/heatwave|heat-haze|drought|wildfire/.test(pulse)) return "heatwave";
  if (/dust/.test(pulse)) return "dust_storm";
  if (/fog/.test(pulse)) return "cold_fog";
  if (/storm-rain|flash-flood|sandbox_flood/.test(pulse) || /暴雨|大雨|阴雨/.test(weather)) return "flash_flood";
  if (/热浪|干热/.test(weather)) return "heatwave";
  if (/沙尘/.test(weather)) return "dust_storm";
  if (/寒雾/.test(weather)) return "cold_fog";
  return "";
}

function buildWeatherEvent(reserve, day, serial, kind = "") {
  const eco = reserve.ecology || {};
  const populated = Object.keys(SPECIES_DB).filter((id) => speciesPopulation(reserve, id) > 0)
    .sort((a, b) => speciesPopulation(reserve, b) - speciesPopulation(reserve, a));
  const speaker = namedSpecies(populated[0] || "deer");
  const witnessId = populated.find((id) => ["crow", "eagle", "giraffe", "owl"].includes(id) && id !== speaker.id);
  const witness = namedSpecies(witnessId || populated[1] || speaker.id);
  const anomaly = kind || weatherAnomalyKind(reserve) || ((reserve.seasonState || {}).name === "旱季" ? "heatwave" : "flash_flood");
  const copy = {
    heatwave: {
      title: `${speaker.species}被热浪挤向同一口井`,
      scene: `中午还没过完，浅滩已经失去反光。${speaker.species}把幼体赶到高地阴影下，井边的队伍越排越密，草尖在脚底发烫。`,
      cause: `热浪与旱季叠加；水源${clamp(eco.water)}、草场${clamp(eco.grass)}。蒸发把饮水窗口压缩到少数阴凉点。`,
      stakes: "打开遮阴水点能降低眼前伤亡，也会让下一场热压仍然汇向同一人工点；放任自然则保留野性，却接受掉队。",
      lines: ["井边发烫，幼崽先停。", "热气把气味压在地面。"]
    },
    dust_storm: {
      title: `${speaker.species}在沙尘里找不到旧路口`,
      scene: `北风把干土抬到眼高。${speaker.species}在旧路口绕了两圈，气味线被抹掉，队尾的回应越来越轻。`,
      cause: `沙尘切断迁徙气味；草场${clamp(eco.grass)}。开阔地最先失联。`,
      stakes: "标出避风通道能接回队伍，也会让它们学会等待人类路标；不干预则保留自主，却可能把幼体留在盲区。",
      lines: ["风里全是土，路断了。", "旧路口还在，气味不在。"]
    },
    cold_fog: {
      title: `${speaker.species}在寒雾里听不见队尾`,
      scene: `河岸只剩下呼吸。${speaker.species}停在已知泥岸，雾把队形拆成几段声音，浅滩变成必须摸索的走廊。`,
      cause: `寒雾切断视线与气味；疾病${clamp(eco.disease)}。潮湿让掉队和病征同时上升。`,
      stakes: "点亮低光路标能接回队尾，也会让夜行路线记住灯光；完全黑暗则保留夜的秩序，却接受失联。",
      lines: ["雾里只听见呼吸。", "队尾的声音被雾吃掉。"]
    },
    flash_flood: {
      title: `${speaker.species}被暴雨逼上高地`,
      scene: `上游先传来漂木相撞的声音。${speaker.species}把幼体推向高地，旧浅滩在一次呼吸里变成水道。`,
      cause: `暴雨/山洪抬升水位至${clamp(eco.water)}，草场${clamp(eco.grass)}被冲刷。固定迁移线最先断开。`,
      stakes: "疏导通道能保住低地，也会改写明年的河岸；只撤离则降低伤亡，被淹草场仍要偿还。",
      lines: ["水来得比脚印快。", "高地还有一处能站。"]
    },
    wildfire: {
      title: `${speaker.species}被烟线赶出核心草场`,
      scene: `干草被点燃后，烟比火更先到达。${speaker.species}不再回头吃草，只把幼体推向还没变热的风口。`,
      cause: `雷火与热压叠加；草场${clamp(eco.grass)}、水源${clamp(eco.water)}。核心区正在失去停留条件。`,
      stakes: "开辟隔离带能截断火线，也会烧掉一条熟悉取食带；先救动物则降低伤亡，烧区仍要修复。",
      lines: ["烟先到，草就没了。", "风口那边还能走。"]
    }
  }[anomaly] || {
    title: `${speaker.species}改写了异常天气里的路线`,
    scene: `天气突然变了。${speaker.species}没有等待指令，只按气味和幼体的脚步重新排队。`,
    cause: `异常天气改写饮水与迁徙窗口；水源${clamp(eco.water)}、草场${clamp(eco.grass)}。`,
    stakes: "主动避险能降低眼前损失，也会留下人为集合点；随季忍耐保留野性，却接受掉队。",
    lines: ["今天的风不像昨天。", "先让幼崽找到退路。"]
  };
  const eventId = `eco_${day}_${serial}_weather_${anomaly}_${speaker.id}`;
  const actors = [
    Object.assign({}, speaker, { stance: "把幼体放在队伍内侧，把异常天气当成必须改道的记忆，而不是一次忍耐比赛。" }),
    Object.assign({}, witness, { stance: "从更高处记录谁先停步、哪条路先消失，知道下一阵风可能从另一侧到来。" })
  ];
  return normalizeEvent({
    id: eventId, type: "weather", day, title: copy.title,
    scene: copy.scene, cause: copy.cause, stakes: copy.stakes, actors,
    dialogues: [
      { actorId: speaker.id, speaker: speaker.name, tone: "改道", text: copy.lines[0] },
      { actorId: witness.id, speaker: witness.name, tone: "见证", text: copy.lines[1] }
    ],
    foreshadow: "标本边缘有一层来自另一侧边界的细沙。",
    threadId: `thread_weather_${anomaly}_${speaker.id}`,
    artifact: eventArtifact("weather", eventId, day, actors),
    choices: [
      { id: "open_shelter", label: "打开避险点", cost: "工具包×1", preview: "水源或安全短暂回升，动物会把这里记成下一次异常的集合点。" },
      { id: "ride_it_out", label: "随季忍耐", cost: "接受掉队风险", preview: "生态记录+1，不把异常天气固化成固定设施。" }
    ]
  });
}

function selectEventType(reserve, context, random) {
  if (context.forceType) return context.forceType;
  const eco = reserve.ecology || {};
  if (weatherAnomalyKind(reserve, context) && random() < 0.72) return "weather";
  const disease = clamp(eco.disease);
  const herbivores = populationTotal(eco.herbivores || {});
  const grass = clamp(eco.grass);
  const territorial = territorialCandidates(reserve)[0];
  const predation = predatorPreyCandidates(reserve)[0];
  const competition = relationCandidates(reserve, "competition")[0];
  const symbiosis = relationCandidates(reserve, "symbiotic")[0];
  const migration = reserve.migration || {};
  if (Math.abs(Number(migration.delta) || 0) >= 3 && random() < 0.62) return "migration";
  if ((disease >= ECOLOGY_THRESHOLDS.earlyDisease || grass <= ECOLOGY_THRESHOLDS.criticalGrass) && random() < 0.28) return "juvenile_loss";
  if (disease >= ECOLOGY_THRESHOLDS.earlyDisease && random() < Math.min(0.92, 0.42 + disease / 150)) return "disease";
  if ((grass <= ECOLOGY_THRESHOLDS.lowGrass || herbivores >= 300) && random() < 0.58) return "overgrazing";
  if (competition && (grass <= ECOLOGY_THRESHOLDS.earlyGrass || clamp(eco.water) <= 50) && random() < 0.36) return "competition";
  if (territorial && territorial.score >= 35 && random() < 0.34) return "territorial";
  if (predation && random() < Math.min(0.62, 0.22 + predation.score / 180)) return "predation";
  if (symbiosis && grass >= 52 && disease <= ECOLOGY_THRESHOLDS.earlyDisease && random() < 0.26) return "symbiosis";
  if (clamp(eco.water) >= ECOLOGY_THRESHOLDS.earlyWater && grass >= ECOLOGY_THRESHOLDS.earlyGrass && disease <= ECOLOGY_THRESHOLDS.earlyDisease && random() < 0.32) return "birth";
  return "";
}

function ecologyNarrativeCadence(reserve = {}) {
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage) || 1));
  return chapter >= 3 ? 2 : 2;
}

function lateChapterEventType(reserve = {}) {
  if (weatherAnomalyKind(reserve)) return "weather";
  const eco = reserve.ecology || {};
  if (clamp(eco.disease) >= ECOLOGY_THRESHOLDS.earlyDisease) return "disease";
  if (clamp(eco.grass) <= ECOLOGY_THRESHOLDS.earlyGrass || populationTotal(eco.herbivores || {}) >= 300) return "overgrazing";
  if (Math.abs(Number((reserve.migration || {}).delta) || 0) >= 1) return "migration";
  if (relationCandidates(reserve, "competition")[0]) return "competition";
  if (territorialCandidates(reserve)[0]) return "territorial";
  if (relationCandidates(reserve, "symbiotic")[0]) return "symbiosis";
  return "birth";
}

function resolveEcologyNarrativeEvent(reserve = {}, beforeReserve = {}, context = {}) {
  const state = normalizeEcologyNarrative(reserve.ecologyNarrative || {});
  const day = Math.max(1, Math.round(Number(context.day) || 1));
  if (!context.dayClosed || state.pendingDecision) {
    reserve.ecologyNarrative = state;
    return null;
  }
  if (!context.forceType && state.lastEvent && day - state.lastEvent.day < ecologyNarrativeCadence(reserve)) {
    reserve.ecologyNarrative = state;
    return null;
  }
  const random = typeof context.random === "function" ? context.random : Math.random;
  let type = selectEventType(reserve, context, random);
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage) || 1));
  if (!type && chapter >= 3) type = lateChapterEventType(reserve);
  if (!context.forceType && (type === "birth" || type === "symbiosis")) {
    const fallback = lateChapterEventType(reserve);
    type = fallback === "birth" || fallback === "symbiosis" ? "overgrazing" : fallback;
  }
  if (!type) {
    reserve.ecologyNarrative = state;
    return null;
  }
  if (!context.forceType && (type === "predation" || type === "juvenile_loss")) {
    const hardOutcomeAlreadyUsed = irreversibleEventInCycle(state, day);
    const warned = hasEcologyWarning(state, day);
    if (hardOutcomeAlreadyUsed || !warned) {
      const eco = reserve.ecology || {};
      type = clamp(eco.disease) >= 24 ? "disease"
        : clamp(eco.grass) <= ECOLOGY_THRESHOLDS.lowGrass ? "overgrazing"
          : relationCandidates(reserve, "competition")[0] ? "competition"
            : territorialCandidates(reserve)[0] ? "territorial" : "overgrazing";
    }
  }
  const serial = state.serial + 1;
  let event = null;
  if (type === "disease") event = buildDiseaseEvent(reserve, day, serial);
  else if (type === "overgrazing") event = buildOvergrazingEvent(reserve, day, serial);
  else if (type === "territorial") event = buildTerritorialEvent(reserve, day, serial, territorialCandidates(reserve)[0]);
  else if (type === "birth") event = buildBirthEvent(reserve, day, serial);
  else if (type === "migration") event = buildMigrationEvent(reserve, day, serial);
  else if (type === "juvenile_loss") event = buildJuvenileLossEvent(reserve, beforeReserve, day, serial);
  else if (type === "competition") event = buildCompetitionEvent(reserve, day, serial, relationCandidates(reserve, "competition")[0]);
  else if (type === "symbiosis") event = buildSymbiosisEvent(reserve, day, serial, relationCandidates(reserve, "symbiotic")[0]);
  else if (type === "weather") event = buildWeatherEvent(reserve, day, serial, weatherAnomalyKind(reserve, context));
  else event = buildPredationEvent(reserve, beforeReserve, day, serial, predatorPreyCandidates(reserve)[0]);
  if (!event) {
    reserve.ecologyNarrative = state;
    return null;
  }
  state.serial = serial;
  state.lastDay = day;
  state.lastEvent = event;
  state.pendingDecision = event;
  state.history = state.history.concat(event).slice(-24);
  if (event.artifact) state.artifacts[event.artifact.id] = event.artifact;
  state.threads[event.threadId] = { id: event.threadId, type: event.type, openedDay: day, lastDay: day, status: "open", clue: event.foreshadow, eventIds: ((state.threads[event.threadId] || {}).eventIds || []).concat(event.id).slice(-8) };
  reserve.ecologyNarrative = state;
  return event;
}

function applyEcologyNarrativeDecision(reserve = {}, eventId = "", choiceId = "") {
  const state = normalizeEcologyNarrative(reserve.ecologyNarrative || {});
  const event = state.pendingDecision;
  if (!event || event.id !== eventId || !event.choices.some((choice) => choice.id === choiceId)) return { ok: false, reason: "expired" };
  const fundBefore = Math.max(0, Number(reserve.fund) || 0);
  const eco = reserve.ecology || (reserve.ecology = {});
  const supplies = reserve.supplies || (reserve.supplies = {});
  let outcome = "";
  const changes = [];
  const applyMetric = (key, delta, group = reserve) => {
    const before = Number(group[key]) || 0;
    group[key] = key === "fund" ? Math.max(0, Math.round(before + delta)) : clamp(before + delta);
    changes.push({ key, before, after: group[key], delta: group[key] - before });
  };
  const consume = (key, amount) => {
    if ((supplies[key] || 0) < amount) return false;
    supplies[key] -= amount;
    changes.push({ key, before: supplies[key] + amount, after: supplies[key], delta: -amount });
    return true;
  };
  if (event.type === "predation") {
    const preyId = Object.keys(event.populationChanges || {})[0];
    if (choiceId === "rescue") {
      if (!consume("medicalKit", 1)) return { ok: false, reason: "medicalKit", required: "医疗包×1" };
      adjustPopulation(reserve, preyId, 1, "tasked");
      applyMetric("grass", -1, eco);
      applyMetric("stability", -2);
      outcome = "巡护员转移了受伤个体。它活了下来；捕食者的巢却在夜里更频繁地发出饥饿回应，这条债没有消失。";
    } else {
      applyMetric("ecologyScore", 1);
      applyMetric("reputation", -1);
      outcome = "观察线没有越过追逐现场。保护区得到一份诚实记录，也承担了没有伸手的哀伤。";
    }
  } else if (event.type === "disease") {
    if (choiceId === "isolate") {
      if (!consume("medicalKit", 1)) return { ok: false, reason: "medicalKit", required: "医疗包×1" };
      applyMetric("disease", -6, eco); applyMetric("water", -2, eco);
      reserve.migration = Object.assign({}, reserve.migration || {}, { trend: "out", delta: Math.min(-1, Number((reserve.migration || {}).delta) || 0), reason: "旧水点隔离使群体暂时拆分" });
      outcome = "旧水点被隔离，传播速度下降。几只病弱个体留在围线内，群体在远处等待，却无法理解为什么不能靠近。";
    } else {
      if (!consume("fieldKit", 1)) return { ok: false, reason: "fieldKit", required: "野外工具包×1" };
      applyMetric("disease", -3, eco); applyMetric("water", -1, eco);
      outcome = "分散水线降低了密度，群体得以保持联系；那根远方湿地的细羽也提醒你，病征可能正沿开放路线继续移动。";
    }
  } else if (event.type === "overgrazing") {
    if (choiceId === "rest") {
      applyMetric("grass", 5, eco);
      reserve.migration = Object.assign({}, reserve.migration || {}, { trend: "out", delta: -2, reason: "核心草场轮休迫使部分食草动物外迁" });
      outcome = "核心草场被暂时封闭，根系获得喘息。队伍沿开放口离开时，没有回头责怪你，也没有承诺还会回来。";
    } else {
      applyMetric("grass", 2, eco); applyMetric("safety", -2);
      outcome = "外缘取食廊道分散了压力，也把动物推近更难巡护的边界。理想的开放，在夜里总带着更长的阴影。";
    }
  } else if (event.type === "territorial") {
    if (choiceId === "buffer") {
      if ((reserve.fund || 0) < 60) return { ok: false, reason: "fund", required: "保护基金60" };
      applyMetric("fund", -60); applyMetric("grass", -1, eco); applyMetric("stability", 2);
      outcome = "静默缓冲区压低了当夜冲突。旧气味被新边界截断，其中一方开始沿陌生路线重新标记领地。";
    } else {
      applyMetric("stability", -1); applyMetric("ecologyScore", 1);
      outcome = "人类没有重画边界。两种气味仍留在同一块树皮上，而标记高度下降的线索被列入下一夜重点观察。";
    }
  } else if (event.type === "birth") {
    const speciesId = (event.actors[0] || {}).id;
    if (choiceId === "quiet_guard") {
      if ((reserve.fund || 0) < 40) return { ok: false, reason: "fund", required: "保护基金40" };
      applyMetric("fund", -40); applyMetric("reputation", 1);
      adjustPopulation(reserve, speciesId, 1, "tasked");
      outcome = "巡护线退到育幼地外缘。幼体多活过了一段危险时间，亲代却把每一次灯光都记成需要绕开的东西。";
    } else {
      applyMetric("ecologyScore", 1);
      outcome = "巡护员撤出育幼地。没有人得到一张近距离照片；新脚印是否会延续，只能交给下一次清晨。";
    }
  } else if (event.type === "migration") {
    if (choiceId === "corridor_guard") {
      if ((reserve.fund || 0) < 30) return { ok: false, reason: "fund", required: "保护基金30" };
      applyMetric("fund", -30); applyMetric("safety", -1); applyMetric("stability", 1);
      reserve.migration = Object.assign({}, reserve.migration || {}, { trend: "in", delta: Math.max(1, Number((reserve.migration || {}).delta) || 0), reason: "开放通道降低了迁徙阻力，也扩大了边界巡护范围" });
      outcome = "通道保持开放，队伍没有被引向固定终点。幼体安全通过，人类巡护线却因此向更远边界延伸。";
    } else {
      applyMetric("ecologyScore", 1);
      outcome = "巡护员只记录方向，没有用食物或围栏纠正路线。群体是否留下，仍由下一处水草和它们的记忆决定。";
    }
  } else if (event.type === "juvenile_loss") {
    const speciesId = (event.actors[0] || {}).id;
    if (choiceId === "emergency_care") {
      if (!consume("medicalKit", 1)) return { ok: false, reason: "medicalKit", required: "医疗包×1" };
      if ((event.populationChanges || {})[speciesId] < 0) adjustPopulation(reserve, speciesId, 1, "tasked");
      applyMetric("water", -1, eco); applyMetric("disease", -1, eco); applyMetric("stability", -1);
      outcome = "巡护员在育幼地外缘完成一次救助。幼体恢复了微弱呼吸；亲代也把灯光和气味记成下一次必须先绕开的东西。";
    } else {
      applyMetric("ecologyScore", 1); applyMetric("reputation", -1);
      outcome = "人类没有进入育幼地。成年个体带着其余幼体离开，静默记录保存了死亡，也保存了没有被打断的最后距离。";
    }
  } else if (event.type === "competition") {
    if (choiceId === "seasonal_zones") {
      if ((reserve.fund || 0) < 40) return { ok: false, reason: "fund", required: "保护基金40" };
      applyMetric("fund", -40); applyMetric("grass", 3, eco); applyMetric("stability", 1);
      reserve.migration = Object.assign({}, reserve.migration || {}, { trend: "out", delta: Math.min(-1, Number((reserve.migration || {}).delta) || 0), reason: "季节轮换区让一部分竞争种群暂时外移" });
      outcome = "轮换区让新芽得到恢复，也把两支队伍分到不同时间。冲突下降了；谁能先取食，却开始由人类时表决定。";
    } else {
      applyMetric("stability", -2); applyMetric("ecologyScore", 1);
      outcome = "保护区没有分配草地。较弱队伍先退向外缘，竞争继续塑造路线；这份自主也保留了被排出的真实风险。";
    }
  } else if (event.type === "symbiosis") {
    if (choiceId === "preserve_process") {
      applyMetric("safety", -1); applyMetric("grass", 1, eco); applyMetric("ecologyScore", 1);
      outcome = "残骸、腐木或开放通道被保留，互利关系得以继续。保护区没有变得更整洁，却让自然清理和警戒完成自己的工作。";
    } else {
      applyMetric("disease", -2, eco); applyMetric("safety", 1);
      outcome = "卫生清理降低了眼前病原与误触风险，也带走了另一物种正在利用的条件。互助没有被背叛，只是失去了发生的现场。";
    }
  } else if (event.type === "weather") {
    if (choiceId === "open_shelter") {
      if (!consume("fieldKit", 1)) return { ok: false, reason: "fieldKit", required: "野外工具包×1" };
      applyMetric("water", 3, eco); applyMetric("safety", 2); applyMetric("grass", 1, eco);
      outcome = "避险点被打开。眼前伤亡下降；动物也把这里记成下一次热浪、暴雨或沙尘到来时的集合点。";
    } else {
      applyMetric("ecologyScore", 1); applyMetric("grass", -1, eco); applyMetric("safety", -1);
      outcome = "巡护员没有改写天气。队伍按自己的记忆改道，掉队和病征被如实记下，没有被设施提前接走。";
    }
  }
  const selectedChoice = event.choices.find((choice) => choice.id === choiceId);
  event.narrativeBeat = normalizeNarrativeBeat(Object.assign({}, event.narrativeBeat || {}, {
    id: event.id,
    scene: event.scene,
    animalLine: ((event.dialogues || [])[0] || {}).text,
    dilemma: event.stakes,
    actionId: choiceId,
    threshold: { label: (selectedChoice && selectedChoice.cost) || "接受本次选择的代价" },
    immediateConsequence: outcome,
    delayedDebt: ECOLOGY_DECISION_DEBTS[`${event.type}:${choiceId}`] || event.stakes,
    nextHook: ECOLOGY_NEXT_HOOKS[event.type] || event.foreshadow,
    permanence: event.type === "juvenile_loss"
      ? (choiceId === "keep_distance" ? "life" : "relationship")
      : event.type === "predation" && choiceId === "observe" ? "population" : "memory"
  }));
  event.resolvedChoiceId = choiceId;
  event.outcome = outcome;
  if (event.artifact && state.artifacts[event.artifact.id]) state.artifacts[event.artifact.id].archived = true;
  state.pendingDecision = null;
  state.lastEvent = event;
  state.history = state.history.map((row) => row.id === event.id ? event : row).slice(-24);
  const thread = state.threads[event.threadId] || {};
  state.threads[event.threadId] = Object.assign({}, thread, { lastDay: event.day, lastChoiceId: choiceId, lastOutcome: outcome, status: "watching" });
  reserve.ecologyNarrative = state;
  recordFundChange(reserve, fundBefore, reserve.fund, "自然事件干预", event.day, `${event.title} · ${selectedChoice.label}`);
  const businessChange = applyNarrativeBusinessOutcome(reserve, event, choiceId);
  return { ok: true, event, choice: selectedChoice, changes, artifact: event.artifact, outcome, narrativeBeat: event.narrativeBeat, businessChange };
}

module.exports = {
  normalizeEcologyNarrative,
  resolveEcologyNarrativeEvent,
  applyEcologyNarrativeDecision,
  ecologyNarrativeCadence,
  ecologyDecisionDebt,
  predatorPreyCandidates,
  territorialCandidates,
  relationCandidates
};
