const { animalStoryLetter } = require("./speciesStoryLetters");
const PERSONA_NAMES = {
  狼: "沉牙",
  鹿: "晨角",
  乌鸦: "黑铃",
  熊: "厚掌",
  水貂: "霜脊",
  狮子: "烈鬃",
  豹子: "影斑",
  鳄鱼: "裂吻",
  野犬: "花耳",
  斑马: "条纹",
  羚羊: "跳星",
  长颈鹿: "高枝",
  大象: "云耳",
  野兔: "短耳",
  野猪: "拱泥",
  鹰: "长翼",
  火烈鸟: "粉羽",
  猫头鹰: "夜瞳",
  河马: "深吻",
  狐狸: "红尾"
};

const SPECIES_SENSE = {
  鹿: "我把幼崽推到队伍内侧",
  斑马: "我们把最小的孩子围在中间",
  羚羊: "我的耳朵一直朝着风来的方向",
  乌鸦: "我从最高的树枝上看见了变化",
  水貂: "我的胡须记得昨天的水线",
  狼: "我闻了很久，风里有陌生的味道",
  大象: "我还记得旧水道在地下的声音",
  长颈鹿: "我在高处看见远处的草色变了",
  野兔: "我把脚步放得很轻",
  熊: "我在洞口停了很久"
};

function hash(text) {
  let value = 2166136261;
  String(text || "").split("").forEach((char) => {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  });
  return Math.abs(value >>> 0);
}

function dateKey(now = Date.now()) {
  const d = now instanceof Date ? now : new Date(now);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function normalizeAnimalLetterState(lifeMemory = {}) {
  const letters = Array.isArray(lifeMemory.animalLetters)
    ? lifeMemory.animalLetters.filter((letter) => letter && letter.id && letter.dateKey)
      .map((letter) => Object.assign({ readAt: 0, sharedAt: 0 }, letter))
    : [];
  return Object.assign({}, lifeMemory, {
    animalLetters: letters,
    animalLetterDateKey: String(lifeMemory.animalLetterDateKey || ""),
    animalLetterPromptDateKey: String(lifeMemory.animalLetterPromptDateKey || "")
  });
}

function animalName(animal = {}) {
  const raw = String(animal.shortName || animal.name || "").replace(new RegExp(`${animal.species || ""}$`), "");
  return raw || PERSONA_NAMES[animal.species] || animal.species || "森林居民";
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
}

function contextSnapshot(world = {}) {
  const reserve = world.reserve || {};
  const ecology = reserve.ecology || {};
  const migration = reserve.migration || {};
  const operations = ((reserve.development || {}).operations) || {};
  const today = operations.today || reserve.today || {};
  const progression = reserve.progression || {};
  const chain = reserve.eventChain || {};
  const last = reserve.lastActionOutcome || reserve.lastAction || {};
  const action = typeof last === "string" ? last : (last.action || last.id || "");
  return {
    water: number(ecology.water, 50),
    grass: number(ecology.grass, 50),
    disease: number(ecology.disease, 0),
    safety: number(reserve.safety == null ? reserve.stability : reserve.safety, 50),
    poacher: number(reserve.poacherPressure, 0),
    migration: number(migration.delta, 0),
    visitors: number(today.visitors == null ? reserve.visitors : today.visitors, 0),
    season: String((reserve.seasonState || {}).name || world.season || "雨季"),
    weather: String((reserve.seasonState || {}).weather || reserve.weather || world.weather || ""),
    stage: Math.max(1, number(progression.stage || progression.storyChapter, 1)),
    chapter: Math.max(1, number(progression.storyChapter || progression.chapter, 1)),
    eventStep: Math.max(0, number(chain.step, 0)),
    action: String(action || "")
  };
}

function contextKey(context = {}) {
  return [
    context.water, context.grass, context.disease, context.safety,
    context.poacher, context.migration, context.visitors,
    context.season, context.weather, context.stage, context.chapter,
    context.eventStep, context.action
  ].join("|");
}

function contextParagraph(concern, context, variant) {
  const weather = context.weather ? `，${context.weather}把气味压在地面` : "";
  const stage = `第${context.chapter}章·第${context.stage}阶段`;
  switch (concern.id) {
    case "water":
      return `${stage}：水源${context.water}，${context.season}${weather}；${variant ? "先看浅滩脚印。" : "修复水线，我们就能回到岸边。"}`;
    case "grass":
      return `${stage}：草场${context.grass}，${context.season}把嫩叶压到低地；${variant ? "我们先避开最薄的一块。" : "给草根一点时间，幼崽就不用走远。"}`;
    case "disease":
      return `${stage}：疾病风险${context.disease}，${context.weather || context.season}让队尾呼吸更明显；请把异常个体分开观察。`;
    case "poacher":
      return `${stage}：边界压力${context.poacher}，最近行动${context.action || "巡护"}；每道新脚印都值得记录。`;
    case "migration":
      return `${stage}：迁徙变化${context.migration}，${context.season}${weather}改了旧路线；请确认下一处落脚点。`;
    case "safety":
      return `${stage}：安全${context.safety}，${context.weather || context.season}让林缘显得${context.safety < 60 ? "太近" : "安静"}；请做一次确认。`;
    default:
      return `${stage}：水源${context.water}、草场${context.grass}、安全${context.safety}；今天游客${context.visitors}人。谢谢你留出选择的距离。`;
  }
}

function rotationLine(rotation = 0) {
  return [
    "我把这件事记在今天的风里，等你下次经过时再告诉你变化。",
    "如果你先处理别处，也没关系；我们会把路线和同伴照看好。",
    "这不是一声求救，而是一份希望你看见现场的记录。",
    "等边界再次安静下来，我们会用脚印告诉你结果。",
    "我把最后一段路留给自己走，也把新的线索留在原地。"
  ][Math.abs(Number(rotation) || 0) % 5];
}

function concernCatalog(world = {}) {
  const reserve = world.reserve || {};
  const ecology = reserve.ecology || {};
  const migration = reserve.migration || {};
  const values = {
    water: number(ecology.water, 50),
    grass: number(ecology.grass, 50),
    disease: number(ecology.disease, 0),
    safety: number(reserve.safety == null ? reserve.stability : reserve.safety, 50),
    poacher: number(reserve.poacherPressure, 0),
    migration: number(migration.delta, 0)
  };
  const concerns = [
    {
      id: "water", score: Math.max(8, 70 - values.water), species: ["水貂", "大象", "鹿", "河马", "鳄鱼", "火烈鸟"],
      title: "水边的一封信", factLabel: "水源", factValue: values.water, target: Math.max(52, values.water + 8), actionId: "habitat", actionLabel: "去修复水源",
      body: ["今早的浅滩又退了一小截。我能多走一段，可幼崽还学不会把渴藏起来。", "泥岸上露出了昨天没见过的白石。我们还在等水，也在等你看见这件事。"]
    },
    {
      id: "grass", score: Math.max(7, 68 - values.grass), species: ["鹿", "斑马", "羚羊", "长颈鹿", "野兔", "大象"],
      title: "草叶变轻了", factLabel: "草场", factValue: values.grass, target: Math.max(55, values.grass + 7), actionId: "habitat", actionLabel: "去恢复草场",
      body: ["晨雾散后，草尖没有托住我的脚步。我们可以让出这片地，只是幼崽会走得更远。", "我吃得很慢，因为每一口都比昨天更难找。如果我们离开，不是不记得这里。"]
    },
    {
      id: "disease", score: values.disease >= 20 ? values.disease + 25 : 4, species: ["鹿", "羚羊", "斑马", "野兔", "狼"],
      title: "队尾的呼吸", factLabel: "疾病风险", factValue: values.disease, target: Math.max(0, values.disease - 8), actionId: "intervention", actionLabel: "去查看病情",
      body: ["队尾的呼吸声变重了。我们不会说痛，只会慢慢落在风后面。", "有一只小家伙今天没有跟上。我想留在它身边，又怕大家都停下来。"]
    },
    {
      id: "poacher", score: values.poacher >= 35 ? values.poacher + 22 : 3, species: ["狼", "乌鸦", "鹿", "野犬", "羚羊"],
      title: "风里的陌生味道", factLabel: "偷猎压力", factValue: values.poacher, target: Math.max(0, values.poacher - 8), actionId: "antiPoacher", actionLabel: "去巡查边界",
      body: ["夜里的风带来了金属和陌生人的味道。我没有叫，只把孩子往更深的草里赶。", "旧路旁多了一道笔直的脚印。野兽不会这样走路，所以我们今夜没有睡。"]
    },
    {
      id: "migration", score: values.migration < 0 ? 52 + Math.abs(values.migration) * 4 : 10, species: ["大象", "斑马", "鹿", "羚羊", "长颈鹿"],
      title: "队伍正在掉头", factLabel: "迁徙变化", factValue: values.migration, target: 0, actionId: "houndScout", actionLabel: "去追踪路线",
      body: ["前方的气味让队伍停了下来。我还记得回去的路，可年轻的脚步还在等一个方向。", "我们在旧路口绕了两圈。离开并不可怕，可这次我们不知道要去哪里。"]
    },
    {
      id: "safety", score: Math.max(6, 67 - values.safety), species: ["野兔", "鹿", "羚羊", "乌鸦", "熊"],
      title: "今夜还不能放松", factLabel: "安全", factValue: values.safety, target: Math.max(60, values.safety + 6), actionId: "houndScout", actionLabel: "去确认足迹",
      body: ["我的耳朵整夜都没有放下。那道声音也许很远，可幼崽还不会分辨。", "太安静的林缘不一定安全。我们还在这里，只是今夜睡得很浅。"]
    },
    {
      id: "steady", score: 5, species: ["乌鸦", "大象", "鹿", "水貂", "长颈鹿"],
      title: "今早，我们没有离开", factLabel: "保护区稳定", factValue: values.safety, target: values.safety, actionId: "calmObserve", actionLabel: "去听它的声音",
      body: ["今早的风没有带来危险。我们还在这里，不是因为忘了离开，而是这里今天值得留下。", "我记得你上次停下脚步的地方。那里没有命令，只有一段让我自己选择的距离。"]
    }
  ];
  return concerns.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function chooseAnimal(animals, concern, usedIds, seed) {
  const unused = animals.filter((animal) => !usedIds.has(animal.id || animal.species));
  const preferred = unused.filter((animal) => concern.species.includes(animal.species));
  const pool = preferred.length ? preferred : unused.length ? unused : animals;
  return pool.length ? pool[seed % pool.length] : { id: "forest", species: "动物", name: "森林居民" };
}

function buildLetter(world, key, index, concern, animals, usedIds, createdAt, recentContentKeys = new Set()) {
  const context = contextSnapshot(world);
  const signature = contextKey(context);
  const serial = ((world.reserve || {}).base || {}).serial || world.id || "reserve";
  const seed = hash(`${key}|${concern.id}|${index}|${serial}|${signature}`);
  const animal = chooseAnimal(animals, concern, usedIds, seed);
  usedIds.add(animal.id || animal.species);
  const name = animalName(animal);
  const sense = SPECIES_SENSE[animal.species] || "我记得今早风里的味道";
  let variant = seed % concern.body.length;
  const animalKey = animal.id || animal.species || "forest";
  const rotation = hash(`${key}|${concern.id}|${index}|${serial}`) % 5;
  let contentKey = `${concern.id}|${animalKey}|${variant}|${rotation}|${signature}`;
  for (let offset = 0; offset < concern.body.length; offset += 1) {
    const candidate = (variant + offset) % concern.body.length;
    const candidateKey = `${concern.id}|${animalKey}|${candidate}|${rotation}|${signature}`;
    if (!recentContentKeys.has(candidateKey) || offset === concern.body.length - 1) {
      variant = candidate;
      contentKey = candidateKey;
      break;
    }
  }
  const paragraph = concern.body[variant];
  const contextLine = `${contextParagraph(concern, context, variant)} ${rotationLine(rotation)}`;
  return {
    id: `animal_letter_${key}_${index + 1}_${String(animal.id || animal.species || "forest").replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "")}`,
    dateKey: key,
    day: Math.max(1, number(world.day, 1)),
    createdAt,
    animalId: animal.id || "",
    animalName: name,
    species: animal.species || "动物",
    title: concern.title,
    salutation: "写给今天回到保护区的你：",
    // 保持旧版两段式布局，避免窄屏换行溢出；第二段包含现场上下文与动物自己的观察。
    paragraphs: [`${sense}。`, `${contextLine} ${paragraph}`],
    signoff: `—— ${name}`,
    factLabel: concern.factLabel,
    factValue: concern.factValue,
    target: concern.target,
    actionId: concern.actionId,
    actionLabel: concern.actionLabel,
    contextKey: signature,
    contentKey,
    variant,
    rotation,
    readAt: 0,
    sharedAt: 0
  };
}

function ensureDailyAnimalLetters(world = {}, now = Date.now()) {
  const key = dateKey(now);
  const state = normalizeAnimalLetterState(world.lifeMemory || {});
  const todayLetters = state.animalLetters.filter((letter) => letter.dateKey === key);
  if (state.animalLetterDateKey === key) {
    return { state, created: [], todayLetters, changed: false, dateKey: key };
  }
  const animals = (Array.isArray(world.knownCharacters) ? world.knownCharacters : []).filter((animal) => animal && animal.species);
  const count = 2 + (hash(`${key}|${((world.reserve || {}).base || {}).serial || world.id || "reserve"}`) % 2);
  const concerns = concernCatalog(world);
  const usedIds = new Set();
  const recentContentKeys = new Set(state.animalLetters.slice(-24).map((letter) => letter && letter.contentKey).filter(Boolean));
  const createdAt = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const created = Array.from({ length: count }, (_, index) => {
    const letter = buildLetter(world, key, index, concerns[index % concerns.length], animals, usedIds, createdAt + index, recentContentKeys);
    recentContentKeys.add(letter.contentKey);
    return animalStoryLetter(world.reserve || {}, letter, state.animalLetters);
  }).filter(Boolean);
  state.animalLetters = state.animalLetters.concat(created);
  state.animalLetterDateKey = key;
  return { state, created, todayLetters: created, changed: true, dateKey: key };
}

function animalLetterInbox(lifeMemory = {}) {
  return normalizeAnimalLetterState(lifeMemory).animalLetters.slice().sort((a, b) => {
    return String(b.dateKey).localeCompare(String(a.dateKey)) || number(b.createdAt) - number(a.createdAt) || String(a.id).localeCompare(String(b.id));
  });
}

function markAnimalLetterRead(lifeMemory, letterId, now = Date.now()) {
  const state = normalizeAnimalLetterState(lifeMemory);
  state.animalLetters = state.animalLetters.map((letter) => letter.id === letterId && !letter.readAt ? Object.assign({}, letter, { readAt: Number(now) || Date.now() }) : letter);
  return state;
}

function markAnimalLetterShared(lifeMemory, letterId, now = Date.now()) {
  const state = normalizeAnimalLetterState(lifeMemory);
  state.animalLetters = state.animalLetters.map((letter) => letter.id === letterId ? Object.assign({}, letter, { sharedAt: Number(now) || Date.now() }) : letter);
  return state;
}

function markAnimalLetterPrompted(lifeMemory, key = dateKey()) {
  const state = normalizeAnimalLetterState(lifeMemory);
  state.animalLetterPromptDateKey = key;
  return state;
}

module.exports = {
  dateKey,
  normalizeAnimalLetterState,
  ensureDailyAnimalLetters,
  animalLetterInbox,
  markAnimalLetterRead,
  markAnimalLetterShared,
  markAnimalLetterPrompted
};
