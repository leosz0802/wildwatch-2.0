const { recordFundChange } = require("./fundLedger");

const RAW_WILDERNESS_FIND_CATALOG = Object.freeze([
  Object.freeze({ id: "resin_tinder", label: "松脂火绒片", icon: "berry", rarity: "常见", minLevel: 1, minQuality: 5, region: "北部针叶林", material: "自然脱落、带松脂的枯木薄片", knowledge: "松脂能帮助薄木片在潮湿环境中较稳定地点燃，但真正维持火焰仍需要逐级加入细枝和干柴。", use: "潮湿天气的引火教学样本", safety: "只取落地枯木，不剥活树；仅在允许用火且具备灭火条件的区域使用。", tradeValue: 1, storyHook: "营地取暖与雨季失温事件的环境旁证", reserveEffect: { key: "safety", label: "安全", delta: 1 } }),
  Object.freeze({ id: "reed_cord", label: "芦苇纤维束", icon: "trail", rarity: "常见", minLevel: 1, minQuality: 5, region: "东部河岸湿地", material: "自然倒伏后仍有韧性的长纤维", knowledge: "数股短纤维同向搓紧，再反向合股，会因为彼此回弹而不容易散开。", use: "捆扎路标、固定轻量遮挡物", safety: "不能用于攀爬、吊挂人员或承受救援重量。", tradeValue: 1, storyHook: "失踪巡护员与临时路线标记的调查旁证", reserveEffect: { key: "safety", label: "安全", delta: 1 } }),
  Object.freeze({ id: "feather_wind_tag", label: "落羽风向签", icon: "signal", rarity: "常见", minLevel: 1, minQuality: 5, region: "中央混交林", material: "自然脱落的轻羽与细草茎", knowledge: "轻羽对微弱气流很敏感，观察连续几次偏转，比只看一次更能判断近地风向。", use: "布置无声风向提示", safety: "只收集自然落羽，不追逐或拔取活鸟羽毛。", tradeValue: 1, storyHook: "偷猎者气味扩散方向与动物避让路线的旁证", reserveEffect: { key: "poacherPressure", label: "偷猎压力", delta: -1, inverse: true } }),
  Object.freeze({ id: "track_cast", label: "兽道泥印板", icon: "eye", rarity: "常见", minLevel: 1, minQuality: 6, region: "中央混交林", material: "已完成记录、不会破坏兽道的足迹拓片", knowledge: "足迹边缘越清楚通常越新，但雨、风、土质都会改变它；单个脚印不能准确推算动物数量。", use: "辨认行进方向与新旧程度", safety: "记录后恢复现场，不用食物诱导动物留下脚印。", tradeValue: 1, storyHook: "兽道异常、套索与偷猎路线案件的关键环境旁证", reserveEffect: { key: "poacherPressure", label: "偷猎压力", delta: -2, inverse: true } }),
  Object.freeze({ id: "pinecone_humidity", label: "松果湿度标", icon: "leaf", rarity: "优良", minLevel: 2, minQuality: 7, region: "北部针叶林", material: "自然落下、鳞片完整的松果", knowledge: "一些松果的鳞片在干燥时张开、潮湿时收拢，可做有趣的湿度变化观察，但不能替代天气预报。", use: "营地湿度变化提示", safety: "只把它当趋势观察，不据此独自判断暴雨或山洪。", tradeValue: 2, storyHook: "旱情、山洪与水源修复剧情的早期观测记录", reserveEffect: { key: "water", label: "水源", delta: 2 } }),
  Object.freeze({ id: "seedpod_alarm", label: "荚果风铃警戒器", icon: "signal", rarity: "优良", minLevel: 2, minQuality: 7, region: "南部草甸", material: "干燥空荚、落枝和纤维绳", knowledge: "不同重量的空荚在轻微牵动时会互相碰撞，可把看不见的风或触碰变成声音。", use: "夜间营地边缘的低技术提示", safety: "它只能提示动静，不能替代巡护、照明或正规的报警设备。", tradeValue: 2, storyHook: "夜间越界与偷猎警戒剧情的低技术预警线索", reserveEffect: { key: "poacherPressure", label: "偷猎压力", delta: -2, inverse: true } }),
  Object.freeze({ id: "wax_seal", label: "旧巢蜂蜡防水块", icon: "water", rarity: "优良", minLevel: 2, minQuality: 8, region: "南部草甸", material: "废弃旧巢中少量洁净蜂蜡", knowledge: "蜂蜡受热后能填入纤维缝隙，让绳结或布边更不容易吸水，但它并不会让整件装备完全防水。", use: "处理地图袋与绳端的小面积缝隙", safety: "确认蜂巢完全废弃，不接近或破坏活跃蜂群。", tradeValue: 2, storyHook: "雨季档案、巡护地图与水文证据保存的剧情支点", reserveEffect: { key: "water", label: "水源", delta: 2 } }),
  Object.freeze({ id: "quartz_signal", label: "石英反光信号片", icon: "sun", rarity: "优良", minLevel: 3, minQuality: 8, region: "西部岩地区", material: "边缘已磨钝的浅色石英薄片", knowledge: "明亮反光可以在开阔地远距离传递位置，短促、规律的闪光比持续乱晃更容易被识别。", use: "白天的定位与救援信号演示", safety: "不要近距离照射人眼、道路车辆或飞行器。", tradeValue: 2, storyHook: "失联队伍救援与岩地观察哨剧情的定位证据", reserveEffect: { key: "safety", label: "安全", delta: 2 } }),
  Object.freeze({ id: "gourd_container", label: "干葫芦样本壶", icon: "water", rarity: "罕见", minLevel: 3, minQuality: 9, region: "东部河岸湿地", material: "自然干燥、完成清理的硬壳果实", knowledge: "成熟硬壳果实经过彻底清理和干燥后可以成为轻量容器，但容器本身不会把野外水变安全。", use: "装载已经净化的水或干燥种子", safety: "未知野外水仍需可靠净化；不使用有霉斑、异味或来源不明的果壳。", tradeValue: 3, storyHook: "枯水期补给、种子迁移与湿地恢复剧情的记录容器", reserveEffect: { key: "water", label: "水源", delta: 3 } }),
  Object.freeze({ id: "down_insulation", label: "种绒保温包", icon: "moon", rarity: "罕见", minLevel: 3, minQuality: 9, region: "南部草甸", material: "完全干燥的自然种绒与透气外袋", knowledge: "静止空气是保温的关键，蓬松材料通过困住空气减慢热量流失；一旦受潮，效果会明显下降。", use: "教学用的小型保温填充包", safety: "远离火源；不采集会刺激皮肤或无法确认来源的植物纤维。", tradeValue: 3, storyHook: "寒潮救助、幼兽安置与夜间巡护剧情的保障物资", reserveEffect: { key: "safety", label: "安全", delta: 2 } }),
  Object.freeze({ id: "reed_whistle", label: "芦管定位哨", icon: "signal", rarity: "罕见", minLevel: 4, minQuality: 9, region: "东部河岸湿地", material: "清洁、干燥的空心芦段", knowledge: "空心管的长度和开口会改变音高，规律的三声短哨比连续吹奏更适合表达求援位置。", use: "低能见度环境的队伍定位", safety: "不把来源不明的空心植物当吸管，也不在动物繁殖区反复鸣哨。", tradeValue: 3, storyHook: "大雾搜救与边界联合巡护剧情的声音暗号", reserveEffect: { key: "poacherPressure", label: "偷猎压力", delta: -2, inverse: true } }),
  Object.freeze({ id: "bark_route_tag", label: "落皮路线牌", icon: "trail", rarity: "罕见", minLevel: 4, minQuality: 10, region: "中央混交林", material: "自然脱落树皮、炭笔和可回收挂绳", knowledge: "清晰路标应记录方向、时间和队伍标记；只画箭头而没有时间，很容易把后来者引向已经失效的路线。", use: "临时撤离路线的信息标记", safety: "不刻伤活树；离开时回收路牌，避免长期污染或误导他人。", tradeValue: 3, storyHook: "山火、洪水与兽群迁徙剧情中的撤离路线档案", reserveEffect: { key: "safety", label: "安全", delta: 2 } })
]);

const WILDERNESS_NARRATIVE_LAYERS = Object.freeze({
  resin_tinder: {
    acquisition: "只在巡护路面收取一小片自然落地枯木，不剥取活树树皮或新鲜树脂。",
    ecologicalCost: "带走的含脂枯木本可成为昆虫和真菌的微小栖息地；每次探索最多收取一份，其余留在原位。",
    easterEgg: "火绒片背面有一道旧刀痕，宽度与失踪巡护员铜哨旁工具留下的痕迹相近。"
  },
  reed_cord: {
    acquisition: "只利用洪水或动物踩倒后已经脱离根系的长纤维，避开仍在固定河岸的活芦苇。",
    ecologicalCost: "倒伏芦苇也会遮蔽鱼苗和昆虫；过量清理会让浅滩失去庇护，因此只取外缘松散部分。",
    easterEgg: "纤维里缠着一小片灰布，气味与砾灰从旧营地咬回的布条相同。"
  },
  feather_wind_tag: {
    acquisition: "沿自然换羽地收取一枚完整落羽，不追逐、围堵或接触正在育幼的鸟。",
    ecologicalCost: "落羽会被巢材利用，也会进入分解循环；连续发现地必须轮休，避免人类脚步反复靠近巢区。",
    easterEgg: "羽轴上的细灰来自北部以外的湿地，和生态病群样本里的迁徙羽痕可能同源。"
  },
  track_cast: {
    acquisition: "只对兽道边缘已完成测量的足迹制作轻量拓片，结束后恢复泥面，不诱导动物重复踩踏。",
    ecologicalCost: "人在兽道停留会改变气味和通过时间；采样会短暂抬高该点惊扰，必须换点观察。",
    easterEgg: "泥印边缘还有一枚更小、方向相反的足迹，像是幼体在追逐发生前躲入灌丛。"
  },
  pinecone_humidity: {
    acquisition: "只收取自然落下且没有被啃食、筑巢或真菌明显利用的完整松果。",
    ecologicalCost: "松果承载种子也是小动物食物；取走一枚意味着少一份传播机会，因此同一区域只保留一个观察样本。",
    easterEgg: "一枚鳞片内卡着旧火场炭屑，说明这片针叶林曾在未记载的年份经历过火。"
  },
  seedpod_alarm: {
    acquisition: "收取已经开裂、种子散尽的空荚和落枝，在营地外缘组装，离开时全部回收。",
    ecologicalCost: "持续响声会惊扰夜行动物；警戒器只在高风险时段短时启用，并避开迁徙通道和繁殖地。",
    easterEgg: "最轻的空荚只在无风夜响过一次，触碰高度接近穿山甲，而不是人类。"
  },
  wax_seal: {
    acquisition: "确认蜂群已完全废弃后，仅刮取脱落旧巢的一角，不拆毁仍可被其他昆虫利用的结构。",
    ecologicalCost: "旧巢也会成为微生物和小型无脊椎动物的基质；采集会减少这部分空间，必须保留主体。",
    easterEgg: "蜂蜡里封着一粒来自改道河汊的花粉，把它与第二章消失水路连接起来。"
  },
  quartz_signal: {
    acquisition: "只选择自然剥落、边缘已风化的浅色石英片，不敲击岩壁或扩大动物洞隙。",
    ecologicalCost: "翻动石块会破坏爬行动物和昆虫遮蔽；找到后必须复原周围石面，只带走已暴露薄片。",
    easterEgg: "反光片一侧有人为磨平，可能曾被更早的观察哨当作固定方向信号。"
  },
  gourd_container: {
    acquisition: "只取自然成熟脱落、没有啃食痕和霉变的硬壳果实，清理过程在营地完成。",
    ecologicalCost: "果实原本会为动物提供食物或种子传播；采集必须避开缺食季，并同步补播同源种子。",
    easterEgg: "壶内发现一粒不属于本河岸的种子，可能沿象群旧路从保护区外被带来。"
  },
  down_insulation: {
    acquisition: "仅收集植物自然散落的干燥种绒，确认物种安全后装入透气外袋，不采活株。",
    ecologicalCost: "种绒承担传播功能；收取会减少局部繁殖机会，因此每次只取不足一把并分散点位。",
    easterEgg: "种绒间夹着一根极细项圈纤维，和曾离开又归来的命名动物有关。"
  },
  reed_whistle: {
    acquisition: "在维护水道时，从已经折断且干燥的空心芦段中挑一段制作，不割取繁殖区活茎。",
    ecologicalCost: "鸣哨会改变鸟类和哺乳动物的警戒行为；只用于真实定位，不以反复吹奏吸引动物。",
    easterEgg: "芦管内壁刻着三短一长的旧记号，与接管信背面的巡线暗号一致。"
  },
  bark_route_tag: {
    acquisition: "使用自然脱落树皮和可回收挂绳制作，记录方向、日期与队伍标记，撤离结束即回收。",
    ecologicalCost: "错误或遗留路牌会误导人和动物，也形成垃圾；每放置一块都必须登记回收责任人。",
    easterEgg: "炭笔箭头下还有一层更旧方向，指向迁徙图故意留白的北端。"
  }
});

const WILDERNESS_TRADE_KINDS = Object.freeze({
  basic: Object.freeze({ id: "basic", label: "生存物资", description: "补足日常巡护与照料缺口" }),
  rare: Object.freeze({ id: "rare", label: "稀有素材", description: "换取本区不易取得的高阶素材" }),
  clue: Object.freeze({ id: "clue", label: "线索", description: "用已验证迹象降低探索风险" })
});

const WILDERNESS_TRADE_KIND_BY_ID = Object.freeze({
  resin_tinder: "basic",
  reed_cord: "basic",
  wax_seal: "basic",
  gourd_container: "basic",
  down_insulation: "basic",
  quartz_signal: "rare",
  reed_whistle: "rare",
  bark_route_tag: "rare",
  seedpod_alarm: "rare",
  feather_wind_tag: "clue",
  track_cast: "clue",
  pinecone_humidity: "clue"
});

const WILDERNESS_TRADE_DAILY_LIMIT = 3;

const WILDERNESS_FIND_CATALOG = Object.freeze(RAW_WILDERNESS_FIND_CATALOG.map((item) => {
  const layer = WILDERNESS_NARRATIVE_LAYERS[item.id] || {};
  const tradeKind = WILDERNESS_TRADE_KIND_BY_ID[item.id] || "basic";
  return Object.freeze(Object.assign({}, item, {
    tradeKind,
    tradeKindLabel: WILDERNESS_TRADE_KINDS[tradeKind].label,
    reality: item.knowledge,
    story: item.storyHook,
    acquisition: layer.acquisition || item.safety,
    ecologicalCost: layer.ecologicalCost || "采集会改变原位生态记录，因此只取最小样本并保留现场。",
    easterEgg: layer.easterEgg || "样本上仍有一处无法由当前记录解释的痕迹。"
  }));
}));

const WILDERNESS_TRADE_CHANNELS = Object.freeze({
  friends: Object.freeze({ id: "friends", label: "微信好友", multiplier: 1, focus: "好友托管池" }),
  world: Object.freeze({ id: "world", label: "世界玩家", multiplier: 1, focus: "世界托管池" })
});

function clampMetric(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function boundedCount(value, max = 999) {
  return Math.min(max, Math.max(0, Math.round(Number(value) || 0)));
}

function metricValue(reserve = {}, key = "") {
  if (key === "water" || key === "grass" || key === "disease") return clampMetric(((reserve.ecology || {})[key]));
  return clampMetric(reserve[key]);
}

function metricAfter(value, delta) {
  return clampMetric(value + delta);
}

function normalizeTradeRecord(entry = {}) {
  const channel = (entry.channel || entry.scope) === "friends" ? "friends" : "world";
  return {
    tradeId: String(entry.tradeId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    clientTradeId: String(entry.clientTradeId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    itemId: String(entry.itemId || "").slice(0, 40),
    label: String(entry.label || entry.itemLabel || "生存素材").slice(0, 24),
    wantedItemId: String(entry.wantedItemId || entry.requestedItemId || "").slice(0, 40),
    wantedItemLabel: String(entry.wantedItemLabel || entry.requestedItemLabel || "").slice(0, 24),
    tradeKind: WILDERNESS_TRADE_KINDS[entry.tradeKind] ? entry.tradeKind : "basic",
    motive: String(entry.motive || "补足当前短板").slice(0, 24),
    purpose: String(entry.purpose || "用于后续生存行动").slice(0, 48),
    status: ["open", "matched", "claimed", "cancelled"].includes(entry.status) ? entry.status : "matched",
    escrow: entry.escrow === true || entry.mode === "barter_v1",
    channel,
    partnerId: String(entry.partnerId || "").slice(0, 64),
    partnerName: String(entry.partnerName || "远方保护区").slice(0, 24),
    day: boundedCount(entry.day, 99999),
    fundDelta: Math.max(0, Math.round(Number(entry.fundDelta) || 0)),
    metricKey: String(entry.metricKey || "").slice(0, 24),
    metricLabel: String(entry.metricLabel || "保护区").slice(0, 16),
    metricDelta: Math.max(-100, Math.min(100, Math.round(Number(entry.metricDelta) || 0))),
    partnerCredit: boundedCount(entry.partnerCredit, 99),
    receivedAmount: boundedCount(entry.receivedAmount, 99),
    rewardLabel: String(entry.rewardLabel || "").slice(0, 64),
    paymentLabel: String(entry.paymentLabel || "").slice(0, 64),
    createdAt: Math.max(0, Math.round(Number(entry.createdAt) || 0)),
    claimedAt: Math.max(0, Math.round(Number(entry.claimedAt) || 0)),
    claimed: entry.claimed === true || Number(entry.claimedAt) > 0
  };
}

function normalizeStoryLink(value = null) {
  if (!value || typeof value !== "object") return null;
  const title = String(value.title || "").slice(0, 40);
  if (!title) return null;
  return {
    type: value.type === "active" ? "active" : "chapter",
    title,
    caseId: String(value.caseId || "").slice(0, 40),
    itemId: String(value.itemId || "").slice(0, 40),
    status: String(value.status || "").slice(0, 20),
    chapter: Math.max(1, Math.min(7, Math.round(Number(value.chapter) || 1)))
  };
}

function applyWildernessReserveEffect(reserve = {}, item = null) {
  const effect = item && item.reserveEffect;
  if (!effect) return null;
  reserve.ecology = Object.assign({}, reserve.ecology || {});
  let before = 0;
  let after = 0;
  if (effect.key === "water" || effect.key === "grass") {
    before = clampMetric(reserve.ecology[effect.key]);
    after = clampMetric(before + effect.delta);
    reserve.ecology[effect.key] = after;
  } else {
    before = clampMetric(reserve[effect.key]);
    after = clampMetric(before + effect.delta);
    reserve[effect.key] = after;
  }
  return {
    key: effect.key,
    label: effect.label,
    before,
    after,
    delta: after - before,
    inverse: !!effect.inverse,
    summary: `${effect.label} ${before}→${after}（${after - before >= 0 ? "+" : ""}${after - before}）`
  };
}

function normalizeWildernessKnowledge(value = {}) {
  const discoveries = {};
  Object.keys(value.discoveries || {}).forEach((id) => {
    if (!WILDERNESS_FIND_CATALOG.some((item) => item.id === id)) return;
    const row = value.discoveries[id] || {};
    discoveries[id] = {
      count: Math.min(999, Math.max(0, Math.round(Number(row.count) || 0))),
      firstDay: Math.max(0, Math.round(Number(row.firstDay) || 0)),
      lastDay: Math.max(0, Math.round(Number(row.lastDay) || 0)),
      storyLink: normalizeStoryLink(row.storyLink),
      impact: row.impact && typeof row.impact === "object" ? Object.assign({}, row.impact) : null
    };
  });
  const tradeStock = {};
  Object.keys(value.tradeStock || {}).forEach((id) => {
    if (WILDERNESS_FIND_CATALOG.some((item) => item.id === id)) tradeStock[id] = Math.min(99, Math.max(0, Math.round(Number(value.tradeStock[id]) || 0)));
  });
  return {
    version: 3,
    discoveries,
    tradeStock,
    history: (Array.isArray(value.history) ? value.history : []).filter((entry) => entry && WILDERNESS_FIND_CATALOG.some((item) => item.id === entry.id)).slice(-24),
    lastFind: value.lastFind && WILDERNESS_FIND_CATALOG.some((item) => item.id === value.lastFind.id) ? Object.assign({}, value.lastFind) : null,
    tradeHistory: (Array.isArray(value.tradeHistory) ? value.tradeHistory : []).map(normalizeTradeRecord).filter((entry) => entry.tradeId || entry.clientTradeId).slice(-24),
    incomingTradeIds: (Array.isArray(value.incomingTradeIds) ? value.incomingTradeIds : []).map((id) => String(id || "").slice(0, 80)).filter(Boolean).slice(-80),
    incomingHistory: (Array.isArray(value.incomingHistory) ? value.incomingHistory : []).map((entry) => normalizeTradeRecord(Object.assign({ claimed: true }, entry))).filter((entry) => entry.tradeId).slice(-24),
    lastTrade: value.lastTrade ? normalizeTradeRecord(value.lastTrade) : null
  };
}

function wildernessFindById(id) {
  return WILDERNESS_FIND_CATALOG.find((item) => item.id === id) || null;
}

function wildernessActivation(item, reserve = {}, context = {}) {
  if (!item) return { active: false, storyReady: false, metricReady: false, statusText: "没有待激活素材" };
  const level = Math.max(1, Math.min(7, Math.round(Number(((reserve.progression || {}).level)) || 1)));
  const chain = context.eventChain || reserve.eventChain || {};
  const requiredStep = Math.min(7, Math.max(1, (Number(item.tradeValue) || 1) * 2 - 1));
  const chainChapter = Math.max(1, Math.round(Number(chain.chapterLevel) || level));
  const storyStep = chainChapter === item.minLevel ? Math.max(0, Math.round(Number(chain.step) || 0)) : 0;
  const storyReady = level > item.minLevel || (level === item.minLevel && chainChapter === item.minLevel && storyStep >= requiredStep);
  const effect = item.reserveEffect || {};
  const metric = effect.key === "water"
    ? { label: "水源", value: metricValue(reserve, "water"), target: 52 }
    : effect.key === "poacherPressure"
      ? { label: "偷猎压力", value: metricValue(reserve, "poacherPressure"), target: 50, inverse: true }
      : { label: "安全", value: metricValue(reserve, "safety"), target: 52 };
  const metricReady = metric.inverse ? metric.value <= metric.target : metric.value >= metric.target;
  const storyText = storyReady ? `第${item.minLevel}章剧情已推进` : `第${item.minLevel}章剧情需达到 ${requiredStep}/7`;
  const metricText = `${metric.label}${metric.value}/${metric.inverse ? "≤" : "≥"}${metric.target}`;
  const active = storyReady && metricReady;
  return { active, storyReady, metricReady, requiredStep, storyStep, storyText, metricText, statusText: !storyReady ? storyText : !metricReady ? metricText : "剧情与保护区数值已激活" };
}

function survivalFindForExploration(preview = {}, roll = 1, targetId = "", context = {}) {
  const qualityScore = Math.max(0, Number(preview.qualityScore) || (Number(roll) || 0));
  if (!preview.success) return null;
  const level = Math.max(1, Math.min(7, Math.round(Number(preview.level) || 1)));
  const reserve = context.reserve || {};
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const action = (((context.storyDiscovery || {}).actionId) || "");
  const preferredKeys = ({ habitat: ["water"], antiPoacher: ["poacherPressure"], houndScout: ["poacherPressure", "safety"], intervention: ["safety", "water"] })[action] || [];
  const eligible = WILDERNESS_FIND_CATALOG.filter((item) => item.minLevel <= level && item.minQuality <= qualityScore && wildernessActivation(item, reserve, context).active)
    .sort((a, b) => {
      const aPreferred = preferredKeys.includes((a.reserveEffect || {}).key) ? 1 : 0;
      const bPreferred = preferredKeys.includes((b.reserveEffect || {}).key) ? 1 : 0;
      const aCount = ((state.discoveries[a.id] || {}).count) || 0;
      const bCount = ((state.discoveries[b.id] || {}).count) || 0;
      return bPreferred - aPreferred || aCount - bCount || WILDERNESS_FIND_CATALOG.indexOf(a) - WILDERNESS_FIND_CATALOG.indexOf(b);
    });
  if (!eligible.length) return null;
  const selected = eligible[0];
  return Object.assign({}, selected, { activation: wildernessActivation(selected, reserve, context) });
}

function recordWildernessFind(reserve = {}, find = null, day = 0, context = {}) {
  if (!find || !wildernessFindById(find.id)) return null;
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const previous = state.discoveries[find.id] || { count: 0, firstDay: day, lastDay: day };
  const isNew = previous.count <= 0;
  const count = Math.min(999, previous.count + 1);
  const activeStory = context.storyDiscovery || null;
  const storyLink = normalizeStoryLink(activeStory ? {
    type: "active",
    title: activeStory.title || `正在调查的${find.storyHook}`,
    caseId: activeStory.caseId,
    itemId: activeStory.itemId,
    status: activeStory.status,
    chapter: context.chapter
  } : {
    type: "chapter",
    title: `第${Math.max(1, Math.round(Number(context.chapter) || find.minLevel))}章生态旁证`,
    chapter: context.chapter || find.minLevel
  });
  const impact = isNew ? applyWildernessReserveEffect(reserve, find) : null;
  state.discoveries[find.id] = {
    count,
    firstDay: isNew ? Math.max(0, Math.round(Number(day) || 0)) : previous.firstDay,
    lastDay: Math.max(0, Math.round(Number(day) || 0)),
    storyLink: isNew ? storyLink : (previous.storyLink || storyLink),
    impact: isNew ? impact : (previous.impact || null)
  };
  state.tradeStock[find.id] = Math.min(99, Math.max(0, Number(state.tradeStock[find.id]) || 0) + 1);
  const record = Object.assign({}, find, {
    isNew,
    count,
    tradeStock: state.tradeStock[find.id],
    day: Math.max(0, Math.round(Number(day) || 0)),
    storyLink: state.discoveries[find.id].storyLink,
    impact: isNew ? impact : null,
    firstImpact: state.discoveries[find.id].impact
  });
  state.lastFind = record;
  state.history = state.history.concat({ id: find.id, day: record.day, isNew }).slice(-24);
  reserve.wildernessKnowledge = state;
  return record;
}

function wildernessKnowledgeSummary(reserve = {}) {
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const unlocked = Object.keys(state.discoveries).filter((id) => (state.discoveries[id] || {}).count > 0);
  const tradeCount = Object.values(state.tradeStock).reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0);
  const recent = state.history.slice().reverse().map((entry) => wildernessFindById(entry.id)).filter(Boolean);
  return { total: WILDERNESS_FIND_CATALOG.length, unlocked: unlocked.length, tradeCount, recent, state, readiness: wildernessStockReadiness(reserve, state) };
}

function wildernessTradeOffer(reserve = {}, id = "", amount = 1) {
  const item = wildernessFindById(id);
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const requested = Math.max(1, Math.round(Number(amount) || 1));
  const available = Math.max(0, Number(state.tradeStock[id]) || 0);
  return {
    version: 1,
    type: "wilderness_material",
    itemId: id,
    label: item ? item.label : "未知生存素材",
    amount: Math.min(requested, available),
    available,
    ready: !!item && available >= requested
  };
}

function wildernessTradePurpose(reserve = {}, item = null) {
  if (!item) return "用于后续生存行动";
  const effect = item.reserveEffect || {};
  const current = metricValue(reserve, effect.key);
  if (effect.key === "water") return current < 52 ? "补足当前水源短板" : "为枯水事件准备物资";
  if (effect.key === "poacherPressure") return current > 38 ? "降低下一次探索风险" : "为边界巡查准备线索";
  if (effect.key === "safety") return current < 52 ? "补足当前安全短板" : "减少高风险行动消耗";
  return "用于后续生存行动";
}

function wildernessTradeMotive(reserve = {}, offeredItem = null, wantedItem = null) {
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  if (offeredItem && boundedCount(state.tradeStock[offeredItem.id], 99) > 1) return "消化溢出库存";
  if (wantedItem && Number(wantedItem.tradeValue) > Number((offeredItem || {}).tradeValue)) return "获取稀有素材";
  const purpose = wildernessTradePurpose(reserve, wantedItem);
  if (/风险|巡查/.test(purpose)) return "降低探索风险";
  return "补足当前短板";
}

function wildernessTradeMotiveId(motive = "") {
  if (/溢出/.test(motive)) return "surplus";
  if (/稀有/.test(motive)) return "rare";
  if (/风险/.test(motive)) return "risk";
  if (/时间/.test(motive)) return "time";
  return "shortfall";
}

function wildernessTradeRecommendations(reserve = {}, offeredId = "") {
  const offered = wildernessFindById(offeredId);
  if (!offered) return [];
  const candidates = WILDERNESS_FIND_CATALOG.filter((item) => item.id !== offered.id && Math.abs(Number(item.tradeValue) - Number(offered.tradeValue)) <= 1);
  const kinds = ["basic", "rare", "clue"];
  const selected = kinds.map((kind) => candidates.filter((item) => item.tradeKind === kind)
    .sort((a, b) => {
      const aNeed = /当前/.test(wildernessTradePurpose(reserve, a)) ? 1 : 0;
      const bNeed = /当前/.test(wildernessTradePurpose(reserve, b)) ? 1 : 0;
      return bNeed - aNeed || Math.abs(a.tradeValue - offered.tradeValue) - Math.abs(b.tradeValue - offered.tradeValue);
    })[0]).filter(Boolean);
  if (selected.length < 3) {
    candidates.forEach((item) => {
      if (selected.length < 3 && !selected.some((entry) => entry.id === item.id)) selected.push(item);
    });
  }
  return selected.slice(0, 3);
}

function wildernessTradeDailyUsage(reserve = {}, day = 1) {
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const today = Math.max(1, Math.round(Number(day) || 1));
  const used = state.tradeHistory.filter((entry) => Number(entry.day) === today && entry.escrow).length;
  return { used, remaining: Math.max(0, WILDERNESS_TRADE_DAILY_LIMIT - used), limit: WILDERNESS_TRADE_DAILY_LIMIT };
}

function wildernessStockReadiness(reserve = {}, normalizedState = null) {
  const state = normalizedState || normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const weightedStock = WILDERNESS_FIND_CATALOG.reduce((sum, item) => {
    return sum + boundedCount(state.tradeStock[item.id], 99) * Math.max(1, Number(item.tradeValue) || 1);
  }, 0);
  const categories = new Set(WILDERNESS_FIND_CATALOG.filter((item) => boundedCount(state.tradeStock[item.id], 99) > 0).map((item) => (item.reserveEffect || {}).key).filter(Boolean));
  const support = Math.min(8, Math.ceil((weightedStock + categories.size) / 3));
  return {
    weightedStock,
    categories: categories.size,
    support,
    careRelief: Math.min(12, support * 2),
    label: support >= 6 ? "保障充足" : support >= 3 ? "可应急" : support > 0 ? "保障偏薄" : "暂无保障"
  };
}

function bestWildernessTradeItem(reserve = {}) {
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  return WILDERNESS_FIND_CATALOG.filter((item) => boundedCount(state.tradeStock[item.id], 99) > 0)
    .sort((a, b) => (b.tradeValue || 0) - (a.tradeValue || 0) || boundedCount(state.tradeStock[b.id], 99) - boundedCount(state.tradeStock[a.id], 99))[0] || null;
}

function wildernessTradePreview(reserve = {}, id = "", channelId = "friends", partner = {}, wantedId = "") {
  const item = wildernessFindById(id);
  const wantedItem = wildernessFindById(wantedId);
  const channel = WILDERNESS_TRADE_CHANNELS[channelId] || WILDERNESS_TRADE_CHANNELS.friends;
  const offer = wildernessTradeOffer(reserve, id, 1);
  if (wantedItem) {
    const partnerId = String(partner.id || "matching_pool");
    const partnerName = String(partner.name || partner.owner || "等待真实玩家匹配").slice(0, 24);
    const fairValue = !!item && Math.abs(Number(item.tradeValue) - Number(wantedItem.tradeValue)) <= 1;
    const purpose = wildernessTradePurpose(reserve, wantedItem);
    const motive = wildernessTradeMotive(reserve, item, wantedItem);
    return {
      version: 2,
      mode: "barter_v1",
      ready: !!item && offer.ready && fairValue,
      item,
      wantedItem,
      offer,
      channel,
      partnerId,
      partnerName,
      tradeKind: wantedItem.tradeKind,
      motive,
      motiveId: wildernessTradeMotiveId(motive),
      purpose,
      fundDelta: 0,
      metricDelta: 0,
      reputationDelta: 0,
      cooperationDelta: 0,
      partnerCredit: 0,
      valueText: `${wantedItem.label} ×1`
    };
  }
  const effect = (item && item.reserveEffect) || { key: "safety", label: "安全", delta: 1 };
  const baseMagnitude = Math.max(1, Math.abs(Math.round(Number(effect.delta) || 1)));
  const direction = Number(effect.delta) < 0 ? -1 : 1;
  const requestedMetricDelta = direction * (channel.id === "friends" ? baseMagnitude + 1 : baseMagnitude);
  const before = metricValue(reserve, effect.key);
  const after = metricAfter(before, requestedMetricDelta);
  const fundDelta = channel.id === "world" && item ? 36 + Math.max(1, item.tradeValue || 1) * 24 : 0;
  const partnerId = String(partner.id || "");
  const partnerName = String(partner.name || partner.owner || (channel.id === "friends" ? "微信好友保护区" : "世界保护区")).slice(0, 24);
  return {
    version: 1,
    ready: !!item && offer.ready && !!partnerId,
    item,
    offer,
    channel,
    partnerId,
    partnerName,
    metricKey: effect.key,
    metricLabel: effect.label || "保护区",
    before,
    after,
    metricDelta: after - before,
    requestedMetricDelta,
    fundDelta,
    reputationDelta: channel.id === "friends" ? 2 : 1,
    cooperationDelta: channel.id === "friends" ? 8 : 3,
    partnerCredit: Math.max(1, Math.round((item ? item.tradeValue : 1) * (channel.id === "friends" ? 2 : 1))),
    valueText: channel.id === "friends"
      ? `${effect.label || "保护区"}${after - before >= 0 ? "+" : ""}${after - before} · 共护+8`
      : `基金+${fundDelta} · ${effect.label || "保护区"}${after - before >= 0 ? "+" : ""}${after - before}`
  };
}

function applyTradeMetric(reserve = {}, key = "", value = 0) {
  if (key === "water" || key === "grass" || key === "disease") {
    reserve.ecology = Object.assign({}, reserve.ecology || {}, { [key]: clampMetric(value) });
  } else {
    reserve[key] = clampMetric(value);
  }
}

function settleWildernessTrade(reserve = {}, preview = null, receipt = {}) {
  if (!preview || !preview.ready || !preview.item) return { ok: false, reason: "not_ready" };
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const tradeId = String(receipt.tradeId || preview.clientTradeId || "").slice(0, 80);
  if (tradeId && state.tradeHistory.some((entry) => entry.tradeId === tradeId)) return { ok: false, reason: "duplicate" };
  if (boundedCount(state.tradeStock[preview.item.id], 99) < 1) return { ok: false, reason: "out_of_stock" };
  state.tradeStock[preview.item.id] = boundedCount(state.tradeStock[preview.item.id], 99) - 1;
  if (preview.version >= 2 && preview.wantedItem) {
    const status = receipt.status === "matched" ? "matched" : "open";
    const record = normalizeTradeRecord({
      tradeId,
      clientTradeId: receipt.clientTradeId,
      itemId: preview.item.id,
      label: preview.item.label,
      wantedItemId: preview.wantedItem.id,
      wantedItemLabel: preview.wantedItem.label,
      tradeKind: preview.tradeKind,
      motive: preview.motive,
      purpose: preview.purpose,
      status,
      escrow: true,
      channel: preview.channel.id,
      partnerId: receipt.partnerId || "",
      partnerName: receipt.partnerName || (status === "matched" ? "真实玩家" : "等待匹配"),
      day: receipt.day,
      rewardLabel: status === "matched" ? `${preview.wantedItem.label} ×1` : `等待 ${preview.wantedItem.label} ×1`,
      paymentLabel: `${preview.item.label} ×1（已托管）`,
      createdAt: receipt.createdAt
    });
    state.tradeHistory = state.tradeHistory.concat(record).slice(-24);
    state.lastTrade = record;
    reserve.wildernessKnowledge = state;
    return {
      ok: true,
      record,
      stockAfter: state.tradeStock[preview.item.id],
      readiness: wildernessStockReadiness(reserve, state),
      pending: status === "open",
      summary: `${preview.item.label} -1 · 托管换取 ${preview.wantedItem.label} ×1`
    };
  }
  const metricBefore = metricValue(reserve, preview.metricKey);
  const metricAfterValue = metricAfter(metricBefore, preview.requestedMetricDelta);
  applyTradeMetric(reserve, preview.metricKey, metricAfterValue);
  const fundBefore = Math.max(0, Math.round(Number(reserve.fund) || 0));
  reserve.fund = Math.max(0, fundBefore + preview.fundDelta);
  recordFundChange(reserve, fundBefore, reserve.fund, preview.fundDelta >= 0 ? "生存素材交换收入" : "生存素材交换", receipt.day, "交换回执");
  reserve.reputation = clampMetric((reserve.reputation || 0) + preview.reputationDelta);
  const social = Object.assign({}, reserve.social || {});
  social.coop = clampMetric((social.coop || 40) + preview.cooperationDelta);
  social.action = "生存素材交换";
  social.actor = preview.partnerName;
  social.actorScope = preview.channel.id;
  reserve.social = social;
  const record = normalizeTradeRecord({
    tradeId,
    clientTradeId: receipt.clientTradeId,
    itemId: preview.item.id,
    label: preview.item.label,
    channel: preview.channel.id,
    partnerId: preview.partnerId,
    partnerName: preview.partnerName,
    day: receipt.day,
    fundDelta: preview.fundDelta,
    metricKey: preview.metricKey,
    metricLabel: preview.metricLabel,
    metricDelta: metricAfterValue - metricBefore,
    partnerCredit: preview.partnerCredit,
    rewardLabel: preview.valueText,
    paymentLabel: `${preview.item.label} ×1`,
    createdAt: receipt.createdAt
  });
  state.tradeHistory = state.tradeHistory.concat(record).slice(-24);
  state.lastTrade = record;
  reserve.wildernessKnowledge = state;
  return {
    ok: true,
    record,
    stockAfter: state.tradeStock[preview.item.id],
    readiness: wildernessStockReadiness(reserve, state),
    summary: `${preview.item.label} -1 · ${preview.channel.label} · ${preview.valueText}`
  };
}

function applyWildernessTradeInbox(reserve = {}, receipts = []) {
  const state = normalizeWildernessKnowledge(reserve.wildernessKnowledge || {});
  const seen = new Set(state.incomingTradeIds);
  const applied = [];
  (receipts || []).forEach((receipt) => {
    const tradeId = String(receipt.tradeId || "").slice(0, 80);
    if (!tradeId || seen.has(tradeId)) return;
    const barter = receipt.mode === "barter_v1" || !!receipt.requestedItemId || !!receipt.wantedItemId;
    const partnerCredit = barter ? 0 : boundedCount(receipt.partnerCredit, 99);
    const fundDelta = barter ? 0 : partnerCredit * 18;
    const item = wildernessFindById(receipt.itemId);
    const receivedAmount = item ? 1 : 0;
    if (item) state.tradeStock[item.id] = Math.min(99, boundedCount(state.tradeStock[item.id], 99) + receivedAmount);
    const fundBefore = Math.max(0, Math.round(Number(reserve.fund) || 0));
    reserve.fund = Math.max(0, fundBefore + fundDelta);
    recordFundChange(reserve, fundBefore, reserve.fund, "跨区交换收入", receipt.day, "领取跨区交换回执");
    if (!barter) reserve.reputation = clampMetric((reserve.reputation || 0) + 1);
    const record = normalizeTradeRecord(Object.assign({}, receipt, {
      label: item ? item.label : receipt.itemLabel,
      fundDelta,
      receivedAmount,
      status: "claimed",
      escrow: barter,
      rewardLabel: barter ? "交换素材已入库" : (fundDelta > 0 ? `回执奖励：基金 +${fundDelta}` : "交换素材已入库"),
      paymentLabel: receipt.paymentLabel || (barter ? `${receipt.requestedItemLabel || "约定素材"} ×1（已托管）` : "无需额外物资（对方主动发起）"),
      claimed: true,
      claimedAt: Math.max(1, Number(receipt.claimedAt) || Date.now())
    }));
    seen.add(tradeId);
    applied.push(record);
  });
  if (applied.length) {
    state.incomingTradeIds = Array.from(seen).slice(-80);
    state.incomingHistory = state.incomingHistory.concat(applied).slice(-24);
    reserve.wildernessKnowledge = state;
  }
  return {
    applied,
    fundDelta: applied.reduce((sum, entry) => sum + entry.fundDelta, 0),
    receivedAmount: applied.reduce((sum, entry) => sum + entry.receivedAmount, 0)
  };
}

module.exports = {
  WILDERNESS_FIND_CATALOG,
  WILDERNESS_TRADE_KINDS,
  WILDERNESS_TRADE_DAILY_LIMIT,
  normalizeWildernessKnowledge,
  wildernessFindById,
  wildernessActivation,
  applyWildernessReserveEffect,
  survivalFindForExploration,
  recordWildernessFind,
  wildernessKnowledgeSummary,
  wildernessTradeOffer,
  wildernessTradePurpose,
  wildernessTradeMotive,
  wildernessTradeRecommendations,
  wildernessTradeDailyUsage,
  WILDERNESS_TRADE_CHANNELS,
  wildernessStockReadiness,
  bestWildernessTradeItem,
  wildernessTradePreview,
  settleWildernessTrade,
  applyWildernessTradeInbox
};
