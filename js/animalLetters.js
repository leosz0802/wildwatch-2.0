const { animalStoryLetter } = require("./speciesStoryLetters");
const { getCurrentChapter } = require("./animalWorld");
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
  熊: "我在洞口停了很久",
  狮子: "我把鬃毛压低，先听草里的热气",
  豹子: "我把斑点收进树影",
  鳄鱼: "我只把眼睛留在水面",
  野犬: "我把耳朵转向同一阵风",
  野猪: "我把鼻子埋进还没变硬的土",
  鹰: "我把盘旋压低了一层",
  火烈鸟: "我把队伍往还能站住的浅水挪",
  猫头鹰: "我在树冠上把夜听成一条路",
  河马: "我把背脊沉回还够深的水",
  狐狸: "我把机会窗口收得更短",
  秃鹫: "我把不该新鲜的味道记在风里",
  白犀牛: "我把幼犀收到身后",
  穿山甲: "我把鳞片收紧再伸鼻子",
  猎豹: "我在加速前先看跑道有没有断",
  斑鬣狗: "我把夜班的笑声先停住",
  水獭: "我先潜下去再看岸边",
  鹈鹕: "我把队伍抬离拥挤的水面",
  猩猩: "我换到更安静的一层",
  巨嘴鸟: "我先听树冠再决定往哪飞",
  貘: "我绕开所有还亮着的灯",
  夜莺: "我把歌停在噪声盖过来之前",
  野牛: "我让队伍在边界前先聚拢",
  鹤: "我把落脚点改到水位还稳的一侧"
};

function pick(list, seed) {
  const items = Array.isArray(list) && list.length ? list : [""];
  return items[Math.abs(Number(seed) || 0) % items.length];
}

function weatherAnomalyLabel(context = {}) {
  const weather = String(context.weather || "");
  const pulse = String(context.pulse || "");
  const eventType = String(context.eventType || "");
  if (["heatwave", "wildfire"].includes(eventType) || /热浪|干热/.test(weather) || /drought|wildfire|heat/.test(pulse)) return "热浪";
  if (eventType === "flash_flood" || /暴雨|大雨/.test(weather) || /storm-rain|flash-flood/.test(pulse)) return "暴雨";
  if (eventType === "dust_storm" || /沙尘/.test(weather) || /dust/.test(pulse)) return "沙尘";
  if (eventType === "cold_fog" || /寒雾/.test(weather) || /fog/.test(pulse)) return "寒雾";
  if (/雾/.test(weather)) return "雾";
  return "";
}

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
  const emergency = (reserve.emergency || {}).active || {};
  const pulse = reserve.weatherPulse || {};
  const chapter = getCurrentChapter(reserve) || {};
  const chapterNumber = Math.max(1, number(progression.storyChapter || progression.displayChapter || progression.stage || chapter.chapter, 1));
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
    pulse: String(pulse.type || pulse.label || ""),
    eventType: String(emergency.type || ""),
    eventTitle: String(emergency.title || ""),
    stage: Math.max(1, number(progression.stage || progression.storyChapter, 1)),
    chapter: chapterNumber,
    chapterTitle: String(chapter.title || `第${chapterNumber}章`),
    chapterDebt: String(chapter.unpaidDebt || chapter.openQuestion || ""),
    eventStep: Math.max(0, number(chain.step, 0)),
    action: String(action || "")
  };
}

function contextKey(context = {}) {
  return [
    context.water, context.grass, context.disease, context.safety,
    context.poacher, context.migration, context.visitors,
    context.season, context.weather, context.pulse, context.eventType,
    context.stage, context.chapter, context.eventStep, context.action
  ].join("|");
}

function contextParagraph(concern, context, variant, animal = {}) {
  const anomaly = weatherAnomalyLabel(context);
  const weather = anomaly || context.weather || context.season;
  const chapterLine = `第${context.chapter}章《${context.chapterTitle}》`;
  const eventLine = context.eventTitle ? `现场「${context.eventTitle}」` : (context.eventStep ? `事件第${context.eventStep}步` : `${context.season}还没有把旧路改完`);
  const debt = context.chapterDebt ? context.chapterDebt : "这一章仍有未还的债";
  const species = animal.species || "我们";
  const lines = {
    water: [
      `${chapterLine}：水源${context.water}，${weather}把浅滩又往回收了一截；${species}先看泥里有没有新脚印。`,
      `${chapterLine}：${weather}下的水源是${context.water}，${debt}；${eventLine}，请把能喝的岸留住。`
    ],
    grass: [
      `${chapterLine}：草场${context.grass}，${weather}把嫩叶压到低地；${species}会先让出最薄的一块。`,
      `${chapterLine}：草场${context.grass}，${seasonOr(context)}里草尖托不住脚步；${eventLine}，幼崽会走得更远。`
    ],
    disease: [
      `${chapterLine}：疾病${context.disease}，${weather}让队尾呼吸更重；${species}不会说痛，只会落在风后面。`,
      `${chapterLine}：疾病${context.disease}。潮湿和拥挤叠在一起，${eventLine}；请把异常个体分开观察。`
    ],
    poacher: [
      `${chapterLine}：边界压力${context.poacher}，最近行动${context.action || "巡护"}；${weather}也盖不住金属味。`,
      `${chapterLine}：边界仍不安静。${debt}。${species}把孩子赶进更深的草，请把直线脚印记下来。`
    ],
    migration: [
      `${chapterLine}：迁徙${context.migration}，${weather}改了旧路口；${eventLine}。`,
      `${chapterLine}：迁徙变化${context.migration}。${species}还记得回去的路，年轻的脚步却在等一个方向。`
    ],
    safety: [
      `${chapterLine}：安全${context.safety}，${weather}让林缘显得${context.safety < 60 ? "太近" : "安静"}；请做一次确认。`,
      `${chapterLine}：太安静不一定安全。${eventLine}，今夜睡得很浅。`
    ],
    weather: [
      `${chapterLine}：${anomaly || weather}改写了今天的气味；水源${context.water}、草场${context.grass}，${eventLine}。`,
      `${chapterLine}：天气${anomaly || weather}。${debt}。${species}先给幼崽找退路，而不是等风自己停。`
    ],
    steady: [
      `${chapterLine}：水源${context.water}、草场${context.grass}、安全${context.safety}；今天游客${context.visitors}人。`,
      `${chapterLine}：水源${context.water}，${weather}没有把我们赶走。谢谢你留出选择的距离。`
    ]
  };
  return pick(lines[concern.id] || lines.steady, variant);
}

function seasonOr(context) {
  return context.season || "这一季";
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
  const context = contextSnapshot(world);
  const anomaly = weatherAnomalyLabel(context);
  const values = {
    water: number(ecology.water, 50),
    grass: number(ecology.grass, 50),
    disease: number(ecology.disease, 0),
    safety: number(reserve.safety == null ? reserve.stability : reserve.safety, 50),
    poacher: number(reserve.poacherPressure, 0),
    migration: number(migration.delta, 0)
  };
  const weatherBodies = {
    热浪: ["地面发烫，浅滩中午就失去反光。我们把幼崽赶到阴凉，请把还能喝的井打开。", "热气把气味压在地面。队伍挤向同一口井，不是因为忘记离开，是因为别处更烫。"],
    暴雨: ["上游先传来漂木相撞的声音。旧浅滩在一次呼吸里变成水道，请给幼崽留高地。", "雨把气味打散，也把退路改了。我们还能走，只是不能再走昨天那条。"],
    沙尘: ["北风把干土抬到眼高。旧路口还在，气味不在，队尾的回应越来越轻。", "沙把鼻子堵住以后，迁徙就变成原地打转。请标出一条避风的低洼。"],
    寒雾: ["河岸只剩下呼吸。雾把队形拆成几段声音，浅滩变成必须摸索的走廊。", "我听得见队首，听不见队尾。请点一盏不会吓走夜的灯。"],
    雾: ["雾把边界抹掉了。我们还在，只是不敢离队太远。", "闻得到看不见。请先确认脚印，再让游客靠近。"]
  };
  const concerns = [
    {
      id: "weather", score: anomaly ? 120 : 0, species: ["乌鸦", "鹿", "大象", "斑马", "鹰", "野兔", "水貂"],
      title: anomaly ? `${anomaly}里的一封信` : "天气把路改了", factLabel: "天气", factValue: anomaly || context.weather || context.season,
      target: values.water, actionId: "habitat", actionLabel: "去处理天气现场",
      body: weatherBodies[anomaly] || weatherBodies.雾
    },
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
  return concerns.filter((item) => item.id !== "weather" || item.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function chooseAnimal(animals, concern, usedIds, seed) {
  const unused = animals.filter((animal) => !usedIds.has(animal.id || animal.species));
  const preferred = unused.filter((animal) => concern.species.includes(animal.species));
  const pool = preferred.length ? preferred : unused.length ? unused : animals;
  return pool.length ? pool[seed % pool.length] : { id: "forest", species: "动物", name: "森林居民" };
}

function buildLetter(world, key, index, concern, animals, usedIds, createdAt) {
  const context = contextSnapshot(world);
  const signature = contextKey(context);
  const serial = ((world.reserve || {}).base || {}).serial || world.id || "reserve";
  const seed = hash(`${key}|${concern.id}|${index}|${serial}|${signature}`);
  const animal = chooseAnimal(animals, concern, usedIds, seed);
  usedIds.add(animal.id || animal.species);
  const name = animalName(animal);
  const sense = SPECIES_SENSE[animal.species] || "我记得今早风里的味道";
  const animalKey = animal.id || animal.species || "forest";
  const rotation = hash(`${key}|${animalKey}|${concern.id}|${index}|${serial}`) % 5;
  const variant = hash(`${key}|${animalKey}|${concern.id}|${context.chapter}|${context.weather}|${context.eventType}|${index}`) % Math.max(1, concern.body.length);
  const contentKey = `${key}|${animalKey}|${concern.id}|${context.chapter}|${context.weather}|${context.eventType}|${variant}|${rotation}`;
  const paragraph = concern.body[variant];
  const contextLine = `${contextParagraph(concern, context, variant + rotation, animal)} ${rotationLine(rotation)}`;
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
