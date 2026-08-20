const { runForestDirector } = require("./forestDirector");
const { buildReserveView } = require("./reserveView");
const { SPECIES_DB, getUnlockedSpecies } = require("./animalWorld");
const { buildSeasonDynamics } = require("./seasonSystem");
const { createGoalState } = require("./goalSystem");

const regions = [
  { id: "north", name: "北部针叶林", feature: "冷杉与松林，树冠连续", resource: "松果、鸟巢、野兔、树洞", x: 0.32, y: 0.18, mood: "cold", water: 34, food: 58, danger: 42, territory: { ownerId: "npc_crow", ownerName: "黑铃鸦", ownerSpecies: "乌鸦", claim: "树冠情报区", pressure: 38, rule: "高处视野决定消息流向，交换消息比武力更有效" } },
  { id: "center", name: "中央混交林", feature: "阔叶林与灌木层密集", resource: "浆果、鹿群、鼠类、隐蔽庇护", x: 0.52, y: 0.43, mood: "dense", water: 52, food: 74, danger: 66, territory: { ownerId: "npc_wolf", ownerName: "沉牙狼", ownerSpecies: "狼", claim: "狼群猎场", pressure: 74, rule: "穿越、追踪和捕猎都会改变鹿群路线" } },
  { id: "river", name: "东部河岸湿地", feature: "浅滩、芦苇和稳定饮水点", resource: "饮水、鱼类、两栖类、足迹", x: 0.76, y: 0.34, mood: "wet", water: 92, food: 62, danger: 58, territory: { ownerId: "shared", ownerName: "临时停战线", ownerSpecies: "多物种", claim: "公共水源", pressure: 62, rule: "饮水被容忍，伏击会破坏河岸停战" } },
  { id: "meadow", name: "南部林缘草甸", feature: "草地开阔，连接森林边缘", resource: "嫩草、昆虫、野兔、鹿群路线", x: 0.58, y: 0.74, mood: "open", water: 48, food: 82, danger: 38, territory: { ownerId: "npc_deer", ownerName: "晨角鹿", ownerSpecies: "鹿", claim: "迁徙草场", pressure: 46, rule: "群体路线比单点占领更重要" } },
  { id: "rocks", name: "西部岩坡洞域", feature: "岩坡、洞穴和稀疏灌木", resource: "洞穴、鸟巢、矿盐、腐木昆虫", x: 0.22, y: 0.64, mood: "stone", water: 28, food: 45, danger: 54, territory: { ownerId: "npc_bear", ownerName: "厚掌熊", ownerSpecies: "熊", claim: "独行洞域", pressure: 68, rule: "靠近洞穴会被视为冒犯，矿盐会吸引鹿群" } },
  { id: "lake", name: "北部高地湖泊", feature: "高地湖与芦苇浅滩", resource: "饮水、鱼、水鸟、水貂", x: 0.44, y: 0.26, mood: "water", water: 88, food: 54, danger: 40, territory: { ownerId: "npc_mink", ownerName: "霜脊貂", ownerSpecies: "水貂", claim: "湖岸猎场", pressure: 44, rule: "浅滩是水貂的伏击点，饮水者需留退路" } }
];

const knownCharacters = [
  {
    id: "npc_wolf",
    name: "沉牙狼",
    species: "狼",
    shortName: "沉牙",
    cartoonLook: "银灰围脖、黄眼小狼，尾尖像一撮烟",
    location: "中央混交林",
    temperament: "谨慎，愿意协作",
    rank: 4,
    title: "猎场首领",
    personality: "谨慎的策略型捕食者，会根据猎物密度和水源压力调整路线",
    wisdom: "狼群通常优先追踪虚弱或落单个体，过高捕食压力会让鹿群改变迁移路线",
    memory: ["记得上次草甸安全下降后，鹿群绕开了中央混交林"],
    publicState: "盯着鹿群路线",
    intent: { type: "hunt", label: "压低身形，沿鹿群气味移动", targetRegionId: "center", certainty: "confirmed", stance: "threat" },
    relation: { trust: 34, threat: 76 }
  },
  {
    id: "npc_crow",
    name: "黑铃鸦",
    species: "乌鸦",
    shortName: "黑铃",
    cartoonLook: "黑羽亮眼、脖子挂小铃铛，像树冠情报员",
    location: "北部针叶林",
    temperament: "爱交换情报",
    rank: 2,
    title: "树冠信使",
    personality: "好奇、机会主义，擅长把脚印和异响变成情报",
    wisdom: "乌鸦能记住人脸和危险地点，也会利用大型动物留下的食物残余",
    memory: ["记得河岸湿地的脚印数量突然变多"],
    publicState: "在树冠间散播消息",
    intent: { type: "intel", label: "盘旋观察河岸脚印", targetRegionId: "river", certainty: "rumor", stance: "open" },
    relation: { trust: 58, threat: 22 }
  },
  {
    id: "npc_deer",
    name: "晨角鹿",
    species: "鹿",
    shortName: "晨角",
    cartoonLook: "浅棕大眼、嫩芽小角，耳朵永远先竖起来",
    location: "南部林缘草甸",
    temperament: "警觉，倾向迁移",
    rank: 2,
    title: "迁徙领路者",
    personality: "警觉、保守，会优先选择水源稳定且捕食压力低的路线",
    wisdom: "有蹄类会在繁殖季和旱季改变活动范围，安全水源比单纯草量更关键",
    memory: ["记得水边出现陌生气味时，幼鹿最先变得不安"],
    publicState: "准备带群体换路线",
    intent: { type: "move", label: "试探草甸到河岸的安全线", targetRegionId: "meadow", certainty: "confirmed", stance: "cautious" },
    relation: { trust: 46, threat: 18 }
  },
  {
    id: "npc_bear",
    name: "厚掌熊",
    species: "熊",
    shortName: "厚掌",
    cartoonLook: "圆耳厚掌、胸前浅色月牙，走路像小山",
    location: "西部岩坡洞域",
    temperament: "独行，讨厌冒犯",
    rank: 5,
    title: "洞域支配者",
    personality: "独行、强势，只有资源和边界变化足够明显时才改变判断",
    wisdom: "熊会围绕矿盐、浆果和洞穴形成季节性活动范围，频繁打扰会提高冲突风险",
    memory: ["记得岩坡洞口被靠近后，夜间脚步声明显增多"],
    publicState: "守着岩坡洞口",
    intent: { type: "guard", label: "重标洞域边界", targetRegionId: "rocks", certainty: "confirmed", stance: "closed" },
    relation: { trust: 18, threat: 88 }
  },
  {
    id: "npc_mink",
    name: "霜脊貂",
    species: "水貂",
    shortName: "霜脊",
    cartoonLook: "深褐长身、背上一道浅霜线，贴水滑行",
    location: "北部高地湖泊",
    temperament: "水域伏击者，领地意识强",
    rank: 3,
    title: "浅滩伏击者",
    personality: "敏锐、领地感强，会把水位和鱼群变化看得比排名更重要",
    wisdom: "水岸捕食者依赖浅滩、芦苇和鱼类密度；水位下降会放大冲突",
    memory: ["记得湖岸水位下降后，鱼群退到了更深的位置"],
    publicState: "守在湖泊浅滩",
    intent: { type: "guard", label: "在浅滩伏击点巡视饮水者", targetRegionId: "lake", certainty: "confirmed", stance: "closed" },
    relation: { trust: 30, threat: 60 }
  },
  {
    id: "npc_lion",
    name: "烈鬃狮",
    species: "狮子",
    shortName: "烈鬃",
    cartoonLook: "金色大鬃毛、半眯眼，像晒太阳的草原国王",
    location: "南部林缘草甸",
    temperament: "威严，重视狮群秩序",
    rank: 5,
    title: "草原狮群首领",
    personality: "强势但不盲动，会根据斑马和羚羊密度决定是否扩张领地",
    wisdom: "狮群常在清晨和黄昏捕猎，水源附近的猎物聚集会提高冲突风险",
    memory: ["记得旱季水线变窄时，羚羊和斑马会挤到同一条退路上"],
    publicState: "盯着开阔草原的迁移队形",
    intent: { type: "hunt", label: "伏在草原阴影里观察羚羊队尾", targetRegionId: "meadow", certainty: "confirmed", stance: "threat" },
    relation: { trust: 22, threat: 92 }
  },
  {
    id: "npc_leopard",
    name: "影斑豹",
    species: "豹子",
    shortName: "影斑",
    cartoonLook: "金黄斑点、长尾巴，喜欢把自己藏进树影",
    location: "中央混交林",
    temperament: "安静，独来独往",
    rank: 4,
    title: "树影伏击者",
    personality: "耐心、独行，习惯在灌丛和树影之间等待短暂机会",
    wisdom: "豹子依赖隐蔽和短距离爆发，灌丛退化会让它更难接近猎物",
    memory: ["记得上次草场被踩秃后，斑马提前发现了它的尾巴"],
    publicState: "在灌丛边缘等待短暂机会",
    intent: { type: "hunt", label: "沿灌丛阴影靠近斑马幼崽", targetRegionId: "center", certainty: "rumor", stance: "threat" },
    relation: { trust: 26, threat: 82 }
  },
  {
    id: "npc_crocodile",
    name: "裂吻鳄",
    species: "鳄鱼",
    shortName: "裂吻",
    cartoonLook: "扁宽脑袋、露齿大笑，只有眼睛浮在水面",
    location: "东部河岸湿地",
    temperament: "耐心，几乎不浪费动作",
    rank: 5,
    title: "河岸伏击者",
    personality: "安静、耐等，会把水位和饮水路线当成捕猎时钟",
    wisdom: "鳄鱼常在饮水点伏击，低水位会让动物更集中也更危险",
    memory: ["记得水位下降那天，斑马群不得不从更窄的浅滩过河"],
    publicState: "只露出眼睛守着浅滩",
    intent: { type: "guard", label: "贴着浅滩等饮水队伍靠近", targetRegionId: "river", certainty: "confirmed", stance: "closed" },
    relation: { trust: 12, threat: 94 }
  },
  {
    id: "npc_wilddog",
    name: "花耳犬",
    species: "野犬",
    shortName: "花耳",
    cartoonLook: "一只耳朵黑一只耳朵黄，跑起来像彩色闪电",
    location: "南部林缘草甸",
    temperament: "兴奋，群体协作强",
    rank: 4,
    title: "追逐小队长",
    personality: "活跃、协作，会用群体追逐消耗羚羊体力",
    wisdom: "非洲野犬依靠团队耐力追逐，过度追猎会让食草动物提前迁走",
    memory: ["记得羚羊群变薄后，追逐小队跑了很久也没找到合适目标"],
    publicState: "带小队沿草场边缘试探",
    intent: { type: "hunt", label: "围着羚羊队尾做耐力追逐", targetRegionId: "meadow", certainty: "confirmed", stance: "threat" },
    relation: { trust: 36, threat: 70 }
  },
  {
    id: "npc_zebra",
    name: "条纹斑马",
    species: "斑马",
    shortName: "条纹",
    cartoonLook: "黑白条纹像移动斑马线，眼神很认真",
    location: "南部林缘草甸",
    temperament: "警觉，喜欢群体行动",
    rank: 2,
    title: "草原队列长",
    personality: "谨慎、合群，会用队形和条纹迷惑捕食者",
    wisdom: "斑马群依赖集体警戒，水源距离和捕食压力会直接改变队形",
    memory: ["记得上次狮群靠近时，队尾幼崽差点被冲散"],
    publicState: "调整队形靠近水源",
    intent: { type: "move", label: "带队沿草原边线靠近水源", targetRegionId: "meadow", certainty: "confirmed", stance: "cautious" },
    relation: { trust: 50, threat: 24 }
  },
  {
    id: "npc_antelope",
    name: "跳星羚",
    species: "羚羊",
    shortName: "跳星",
    cartoonLook: "细腿弹跳、眼下有小白点，像随时准备起飞",
    location: "南部林缘草甸",
    temperament: "敏感，反应极快",
    rank: 2,
    title: "草原预警员",
    personality: "胆小但灵敏，会最先感到草场和捕食者压力变化",
    wisdom: "羚羊常用弹跳和急转向躲避追逐，开阔视野对它们很重要",
    memory: ["记得草长太高时，豹子的斑点会突然从影子里冒出来"],
    publicState: "在草场边缘反复试探",
    intent: { type: "move", label: "用短跳试探草场安全边界", targetRegionId: "meadow", certainty: "confirmed", stance: "cautious" },
    relation: { trust: 54, threat: 20 }
  },
  {
    id: "npc_giraffe",
    name: "高枝鹿",
    species: "长颈鹿",
    shortName: "高枝",
    cartoonLook: "长脖子顶着小角，像一座会嚼叶子的望塔",
    location: "北部针叶林",
    temperament: "慢热，视野很远",
    rank: 3,
    title: "树梢瞭望者",
    personality: "温和、迟缓但观察距离远，会提前发现远处的扰动",
    wisdom: "长颈鹿能利用高度发现捕食者，但幼崽仍依赖开阔视野和群体保护",
    memory: ["记得远处尘土变直线时，通常不是羚羊在奔跑"],
    publicState: "从树梢高度观察边界",
    intent: { type: "intel", label: "从高处观察草原边界尘土", targetRegionId: "north", certainty: "rumor", stance: "open" },
    relation: { trust: 62, threat: 16 }
  },
  {
    id: "npc_elephant",
    name: "云耳象",
    species: "大象",
    shortName: "云耳",
    cartoonLook: "大耳朵像两片云，鼻子会轻轻卷起水声",
    location: "东部河岸湿地",
    temperament: "稳重，重视家族路线",
    rank: 5,
    title: "水源记忆者",
    personality: "稳重、记忆强，会记住旱季水源和安全通道",
    wisdom: "象群会长期记忆水源位置，旱季迁徙路线对整个草原都有影响",
    memory: ["记得很久以前干涸的水坑，雨季后又短暂醒过来"],
    publicState: "带幼象检查旧水路",
    intent: { type: "move", label: "沿旧水路带幼象寻找稳定水源", targetRegionId: "river", certainty: "confirmed", stance: "open" },
    relation: { trust: 68, threat: 42 }
  },
  {
    id: "npc_hippo",
    name: "泥泡河马",
    species: "河马",
    shortName: "泥泡",
    cartoonLook: "圆滚紫灰身体、小圆耳、鼻孔像两颗小黑豆，泡在水里很有脾气",
    location: "东部河岸湿地",
    temperament: "看似慢吞吞，水域边界感很强",
    rank: 5,
    title: "河湾守门者",
    personality: "白天泡水降温，夜里上岸吃草；对水道拥挤和陌生脚步非常敏感",
    wisdom: "河马依赖稳定水域降温和避险，水位下降会放大河岸冲突，也会影响草场夜间啃食压力",
    memory: ["记得上次水位下降时，浅滩挤得连泡泡都没地方冒"],
    publicState: "半沉在河湾里观察饮水队伍",
    intent: { type: "guard", label: "守着深水河湾，夜里再上岸吃草", targetRegionId: "river", certainty: "confirmed", stance: "closed" },
    relation: { trust: 28, threat: 84 }
  },
  {
    id: "npc_flamingo",
    name: "粉脚鹤",
    species: "火烈鸟",
    shortName: "粉脚",
    cartoonLook: "粉色长腿、弯弯嘴，站在浅水里像一支会走路的粉笔",
    location: "北部高地湖泊",
    temperament: "爱群聚，怕水质变差",
    rank: 2,
    title: "浅滩滤食者",
    personality: "会根据浅滩水位、藻类和岸边惊扰调整停留位置",
    wisdom: "火烈鸟常在浅水中滤食，水质、藻类和扰动会直接影响它们是否停留",
    memory: ["记得湖边水变浑时，粉色队伍立刻往更浅的地方挪"],
    publicState: "在浅滩边排成松散粉色队列",
    intent: { type: "move", label: "沿浅水线滤食，避开太吵的岸边", targetRegionId: "lake", certainty: "rumor", stance: "open" },
    relation: { trust: 56, threat: 18 }
  },
  {
    id: "npc_eagle",
    name: "高旋鹰",
    species: "鹰",
    shortName: "高旋",
    cartoonLook: "褐金翅膀、白眉小脸，盘旋时像天空里的侦察箭头",
    location: "北部针叶林",
    temperament: "冷静，视野极远",
    rank: 4,
    title: "高空侦察者",
    personality: "会从高空观察草场、河岸和边界尘土，优先发现小型猎物和异常移动",
    wisdom: "猛禽依赖开阔视野和上升气流；边界扰动、火点和异常遗骸会迅速改变盘旋区域",
    memory: ["记得西边岩坡上空热气乱过一次，地面随后出现陌生脚印"],
    publicState: "在河岸上空盘旋观察边界",
    intent: { type: "intel", label: "借上升气流盘旋，盯住河岸和草场边界", targetRegionId: "river", certainty: "confirmed", stance: "open" },
    relation: { trust: 48, threat: 36 }
  },
  {
    id: "npc_vulture",
    name: "白领鹫",
    species: "秃鹫",
    shortName: "白领",
    cartoonLook: "黑褐大翅、白色领圈、圆脑袋，像负责清场的天空巡逻员",
    location: "西部岩坡洞域",
    temperament: "耐心，擅长发现死亡和异常",
    rank: 3,
    title: "天空清道夫",
    personality: "会追踪自然死亡个体、疾病和大型冲突痕迹，是自然清理和风险预警的一部分",
    wisdom: "秃鹫能快速发现自然死亡个体并减少病原扩散；如果秃鹫异常聚集，通常意味着疾病或偷猎风险",
    memory: ["记得某次秃鹫集中盘旋后，草场边发现了异常死亡个体"],
    publicState: "在岩坡上空低低盘旋",
    intent: { type: "intel", label: "沿岩坡和草场边缘寻找异常死亡气味", targetRegionId: "rocks", certainty: "rumor", stance: "open" },
    relation: { trust: 42, threat: 28 }
  }
];

const missingNpcSeeds = {
  hare: { name: "短耳兔", location: "南部林缘草甸", title: "草洞观察员", intentType: "move", targetRegionId: "meadow", stance: "cautious" },
  boar: { name: "九纹猪", location: "中央混交林", title: "林缘翻土者", intentType: "move", targetRegionId: "center", stance: "open" },
  owl: { name: "圆羽鸮", location: "北部针叶林", title: "夜间观察者", intentType: "intel", targetRegionId: "north", stance: "open" },
  fox: { name: "赤尾狐", location: "中央混交林", title: "边缘侦察者", intentType: "intel", targetRegionId: "center", stance: "cautious" }
};

Object.keys(missingNpcSeeds).forEach((speciesId) => {
  const species = SPECIES_DB[speciesId];
  const seed = missingNpcSeeds[speciesId];
  if (!species || knownCharacters.some((animal) => animal.species === species.name)) return;
  knownCharacters.push({
    id: `npc_${speciesId}`,
    name: seed.name,
    species: species.name,
    shortName: (species.representative && species.representative.name) || species.name,
    cartoonLook: `${species.name}代表，${species.description}`,
    location: seed.location,
    temperament: species.sensitivity === "safety_sensitive" ? "警觉，关注边界安全" : species.sensitivity === "intel_type" ? "敏锐，擅长发现异常" : "谨慎，跟随生态变化",
    rank: Math.max(1, Math.min(5, species.tier || 1)),
    title: seed.title,
    personality: species.description,
    wisdom: `${species.name}会根据保护区安全、水草和季节变化调整活动范围。`,
    memory: [],
    publicState: (species.representative && species.representative.quote) || "正在观察保护区变化",
    intent: { type: seed.intentType, label: (species.representative && species.representative.quote) || "观察周边变化", targetRegionId: seed.targetRegionId, certainty: "confirmed", stance: seed.stance },
    relation: { trust: 44, threat: Math.max(12, Math.min(88, (species.tier || 1) * 14)) }
  });
});

function syncKnownCharactersForReserve(currentCharacters, reserve) {
  const level = Math.max(1, Math.min(5, Math.round(((reserve && reserve.progression) || {}).level || 1)));
  const current = currentCharacters || [];
  return getUnlockedSpecies(level).map((species) => {
    const template = knownCharacters.find((animal) => animal.species === species.name);
    const old = current.find((animal) => animal.species === species.name || (template && animal.id === template.id));
    if (!template) return null;
    return Object.assign({}, template, old || {}, {
      id: template.id,
      name: template.name,
      species: template.species,
      shortName: template.shortName,
      cartoonLook: template.cartoonLook,
      title: template.title,
      publicState: (old && old.publicState) || template.publicState,
      intent: Object.assign({}, template.intent || {}, (old && old.intent) || {}),
      relation: Object.assign({}, template.relation || {}, (old && old.relation) || {}),
      personality: (old && old.personality) || template.personality,
      wisdom: (old && old.wisdom) || template.wisdom,
      memory: ((old && old.memory) || template.memory || []).slice(-5),
      insight: (old && old.insight) || "",
      aiMood: (old && old.aiMood) || template.aiMood || null,
      ally: (old && old.ally) || false,
      // Animal health is a real reserve condition, not a UI fallback. Older
      // saves did not persist it, so migrate them to a healthy-but-not-perfect
      // baseline and let water/grass/disease dynamics move it afterwards.
      health: old && Number.isFinite(old.health)
        ? Math.max(0, Math.min(100, Math.round(old.health)))
        : Number.isFinite(template.health)
          ? Math.max(0, Math.min(100, Math.round(template.health)))
          : 84,
      conditionChange: Object.assign({}, (old && old.conditionChange) || {}),
      conditionSummary: (old && old.conditionSummary) || "正在适应保护区的水草与风险"
    });
  }).filter(Boolean);
}

const hierarchy = {
  title: "森林等级不是职业强弱，而是谁更能让别人绕路",
  levels: [
    { rank: 5, label: "支配者", privilege: "可以迫使弱者让路", cost: "食量巨大，几乎没有稳定盟友" },
    { rank: 4, label: "高位捕食者", privilege: "能改变猎物路线", cost: "饥饿和暴露持续上升" },
    { rank: 3, label: "区域机会者", privilege: "能在边界套利", cost: "难以正面夺取领地" },
    { rank: 2, label: "群体/情报节点", privilege: "能提高预警与信任", cost: "不能独自压制强者" },
    { rank: 1, label: "低位生存者", privilege: "更容易隐藏和被群体接纳", cost: "暴露后风险很高" }
  ]
};

function createReserveState() {
  return {
    fund: 900,
    stability: 66,
    business: 58,
    ecologyScore: 66,
    reputation: 50,
    enforcement: 48,
    poacherPressure: 30,
    safety: 68,
    migration: { trend: "stable", delta: 0, reason: "水源与草场暂时稳定" },
    actionPoints: 0,
    intel: 0,
    fieldPermits: 0,
    seasonDay: 1,
    seasonState: { name: "雨季", day: 1, cycleDay: 1, changed: false },
    guardianCycle: {
      version: 1,
      day: 1,
      actionIndex: 0,
      actionsToday: [],
      completedDays: 0,
      totalKeyActions: 0,
      lastNight: null,
      tomorrowPreview: "雨季的第一束光会照到干涸水点。",
      sevenDay: { completed: {}, highlights: [] }
    },
    mastery: {
      version: 1,
      patrol: { xp: 0, level: 1, branches: {}, pendingChoice: null, lastGain: null },
      habitat: { xp: 0, level: 1, branches: {}, pendingChoice: null, lastGain: null },
      relationship: { xp: 0, level: 1, branches: {}, pendingChoice: null, lastGain: null }
    },
    recoveredProcessing: { version: 1, pending: [], history: [], lastSettlement: null },
    seasonDynamics: buildSeasonDynamics({ name: "雨季", day: 1, cycleDay: 1, changed: false }),
    emergency: { active: null, cooldown: 0, history: [], lastOutcome: null },
    guardianRun: {
      title: "7天守护挑战",
      completedDays: 0,
      length: 7,
      targetSafety: 70,
      targetPoacher: 28,
      targetFund: 760,
      score: 55,
      streak: 0,
      lastGrade: "C",
      lastSummary: "守住安全线，压低偷猎，让动物愿意留下。"
    },
    progression: {
      level: 1,
      stage: 1,
      displayChapter: 1,
      daysManaged: 0,
      totalActions: 0,
      totalMeaningfulActions: 0,
      totalStrategicChoices: 0,
      totalMajorStrategicChoices: 0,
      activeSeconds: 0,
      totalFundEarned: 0,
      totalMigratedIn: 0,
      totalRareRecovered: 0,
      totalMysteryRecovered: 0,
      chapterStart: { stage: 1, level: 1, daysManaged: 0, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 },
      stageStart: { stage: 1, level: 1, daysManaged: 0, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 },
      nextDays: 4,
      dayProgress: 0,
      scoreProgress: 0.79,
      title: "临时营地",
      score: 46,
      progress: 0,
      nextScore: 58,
      nextTitle: "稳定保护站",
      benefit: "动物只把这里当作临时路过点；通过有效经营、剧情与里程碑逐步建立信任。"
    },
    balanceVersion: 2,
    actionRepeat: { lastAction: null, count: 0, multiplier: 1 },
    resourceAging: { intelIdleActions: 0, pendingAges: {}, recoveryCooldown: 0, highFundActions: 0, exchangeCooldowns: { fieldNote: 0, migrationTrace: 0, forestGift: 0 } },
    highStockProject: { unlocked: false, active: false, cost: 0, durationActions: 8 },
    facilityDiscounts: {},
    economyLedger: null,
    houndTeam: {
      level: 1,
      xp: 0,
      nextXp: 40,
      totalRuns: 0,
      tracking: 48,
      pursuit: 45,
      guard: 42,
      stamina: 86,
      cohesion: 52,
      lastReward: "猎犬队待命，第一次侦察会建立气味线。",
      title: "新晋猎犬队"
    },
    eventChain: {
      id: "seven_day_guardian",
      title: "保护区阶段事件线",
      step: 0,
      length: 7,
      completed: false,
      lastAdvancedAction: -4,
      advanced: false,
      waitingText: "先完成几次经营操作，让数据真正发生变化。",
      current: { title: "立旗：第一次巡线", summary: "猎犬队建立基础气味线，动物先远远看着。", mood: "观望" },
      next: {
        title: "立旗：第一次巡线",
        prompt: "先派猎犬确认边界气味，让本章剧情真正开始。",
        recommendedAction: "houndScout",
        validActions: ["houndScout", "habitat", "antiPoacher", "intervention", "buySupplies", "salvage", "exploreMaterials"]
      },
      lastResult: "事件链尚未开始，完成一次巡护后推进。"
    },
    ecology: {
      predators: { wolf: 4 },
      herbivores: { deer: 35, antelope: 45, zebra: 40, boar: 15, hare: 50 },
      birds: { crow: 8 },
      water: 68,
      grass: 56,
      disease: 12
    },
    inventory: {
      shedAntlerA: 1,
      shedAntlerB: 0,
      naturalHide: 0,
      recoveredTrap: 0,
      researchSample: 2
    },
    pendingRecovered: {
      shedAntlerA: 0,
      shedAntlerB: 0,
      naturalHide: 0,
      recoveredTrap: 0,
      researchSample: 0
    },
    ecologyEconomy: {
      version: 1,
      fragments: { fieldNote: 0, migrationTrace: 0, forestGift: 0, coGuardShard: 0 },
      mapDrops: [],
      productionMeter: 0,
      rarePity: 0,
      careDebt: 0,
      totalProduced: 0,
      totalCollected: 0,
      lastLedger: null,
      competition: {
        id: "local-season-1",
        title: "区域共护季",
        bracket: 1,
        day: 1,
        length: 12,
        contribution: 0,
        rank: 12,
        poolRemaining: 30,
        claimed: 0,
        lastSettlementDay: 0,
        lastRank: 12,
        lastReward: null,
        rivals: []
      },
      achievements: {
        firstHarvest: false,
        balancedWeek: false,
        firstScarce: false,
        bestRank: 9999,
        personalBestContribution: 0,
        streak: 0
      }
    },
    lastMaterialExploration: null,
    mysteryEvidence: {
      evidence: {},
      discovered: {},
      history: [],
      checksSinceLast: 0,
      failedEligibleChecks: 0,
      lastDiscovery: null
    },
    strategy: {
      routeScores: { enforcement: 0, ecology: 0, research: 0, community: 0 },
      dominantRoute: "balanced",
      recentActions: [],
      totalMeaningfulActions: 0,
      totalChoices: 0,
      totalTacticalChoices: 0,
      totalMajorChoices: 0,
      choiceHistory: [],
      consequences: [],
      pendingDilemma: null,
      pendingSelection: null,
      pendingRoll: null,
      lastDilemmaAction: 0,
      lastTacticalAction: 0,
      lastMajorAction: 0,
      lastChoiceAction: 0,
      dilemmaWait: 0,
      tacticalWait: 0,
      majorWait: 0,
      chainFlags: {},
      lastRhythm: { repeatCount: 0, penalty: 0, varietyBonus: false, meaningful: true }
    },
    guardianPromises: { version: 1, choices: {}, pending: null, history: [], lastPromptAction: 0, lastActionEffects: [] },
    facilityConstruction: { version: 1, sites: {} },
    supplies: {
      dogFood: 8,
      tranquilizer: 5,
      alarm: 2,
      fieldKit: 3,
      medicalKit: 2
    },
    hounds: [
      { id: "hound_ash", name: "砾灰", role: "追踪", level: 1, xp: 0, scent: 82, speed: 62, courage: 68, bond: 54, stamina: 86, injured: false },
      { id: "hound_river", name: "白河", role: "驱赶", level: 1, xp: 0, scent: 55, speed: 78, courage: 72, bond: 49, stamina: 80, injured: false },
      { id: "hound_moss", name: "苔点", role: "警戒", level: 1, xp: 0, scent: 68, speed: 58, courage: 61, bond: 63, stamina: 88, injured: false }
    ],
    market: {
      antler: 86,
      hideSalvage: 124,
      researchSample: 42,
      dogFood: 18,
      tranquilizer: 45,
      alarm: 120
    },
    social: {
      day: 7,
      title: "好友保护区风平浪静",
      actor: "雾谷基地",
      action: "观察",
      marketDelta: 0,
      migrationDelta: 0,
      salvageDelta: 0,
      pressure: 0,
      coop: 40,
      rival: 30,
      priceNote: "项目拨款没有明显波动。",
      migrationNote: "周边保护区没有改变动物迁移方向。",
      salvageNote: "回收物供给正常。",
      log: "好友和世界保护区暂未出现明显联动。"
    },
    base: {
      name: "苔原哨站",
      rating: 1180,
      rank: 10000,
      rareAnimals: 3,
      shield: 42,
      fence: 2,
      watchtower: 1,
      kennel: 1,
      raidTickets: 0,
      protectedAnimals: { deer: 15, antelope: 12, boar: 5 }
    },
    league: {
      season: "雨林杯",
      worldRank: 10000,
      totalRanks: 10000,
      lastRaid: null,
      lastAction: { type: "idle", title: "等待指令", detail: "选择目标后做边界巡查，或加固自己的防护网。", materialDelta: 0, shieldDelta: 0, ratingDelta: 0 },
      rivals: [
        { id: "base_mist", name: "雾谷基地", owner: "林岚", rating: 1260, shield: 58, animals: 42, material: 190, rank: 1, style: "高防护网", scope: "world", simulated: true, source: "system" },
        { id: "base_sun", name: "赤杉基地", owner: "周野", rating: 1215, shield: 38, animals: 35, material: 160, rank: 2, style: "高收益", scope: "world", simulated: true, source: "system" },
        { id: "base_river", name: "河湾基地", owner: "白石", rating: 1140, shield: 24, animals: 28, material: 120, rank: 4, style: "低防快攻", scope: "world", simulated: true, source: "system" },
        { id: "base_rock", name: "岩脊基地", owner: "沉灯", rating: 1088, shield: 66, animals: 31, material: 90, rank: 5, style: "重防守", scope: "world", simulated: true, source: "system" }
      ],
      logs: [
        "雾谷基地的防护网抵消了一次边界巡查。",
        "河湾基地的回收池被分流，排名小幅下滑。"
      ]
    }
  };
}

function createInitialGoals(state = {}) {
  return createGoalState(state);
}

function createInitialWorld() {
  const reserve = createReserveState();
  const world = {
    id: "demo_world",
    name: "野境守护",
    biome: "非洲草原保护区 / 河岸湿地 / 林缘草甸 / 岩坡洞域",
    premise: "你管理一片 AI 驱动的草原-森林过渡保护区。动物会按天气、食物、水源、领地和人类威胁自主行动。",
    day: 7,
    time: { phase: "清晨", hour: 6, moon: "上弦月", seasonDay: 1 },
    season: "雨季",
    weather: "小雨",
    regions,
    knownCharacters: syncKnownCharactersForReserve([], reserve),
    hierarchy,
    mapEvents: [],
    guardianEchoes: [],
    lifeMemory: {
      version: 1,
      individuals: [],
      memories: [],
      rareMoments: [],
      guardianLetters: [],
      lastSeenAt: Date.now(),
      lastLetterKey: ""
    },
    rumors: [
      "中央混交林的鹿群昨夜向南移动。",
      "东部河岸湿地的泥地记录了太多脚印。"
    ],
    natureKnowledge: [
      "雨季会补充水草，但潮湿环境也会抬高疾病与病虫害风险。",
      "小雨会补充浅滩水量，但也会冲淡气味，猎犬侦察需要更多时间。",
      "草场过密取食会降低次日恢复速度，鹿群路线会被草量和捕食压力共同决定。"
    ],
    reserve,
    goals: null
  };
  world.goals = createInitialGoals({ world });
  world.reserveView = buildReserveView(world.reserve, world.reserve, {
    action: "seed",
    day: world.day,
    time: world.time,
    weather: world.weather,
    season: world.season,
    location: "中央混交林",
    regionId: "center"
  });
  world.reserve.reserveView = world.reserveView;
  world.mapEvents = world.reserveView.mapMarkers;
  const directed = runForestDirector({
    world,
    beforeReserve: world.reserve,
    reserve: world.reserve,
    action: "seed",
    location: "中央混交林",
    day: world.day,
    time: world.time,
    weather: world.weather,
    reserveView: world.reserveView,
    knownCharacters: world.knownCharacters,
    regionId: "center"
  });
  world.knownCharacters = directed.knownCharacters;
  world.aiForest = directed.director;
  return world;
}

module.exports = {
  regions,
  knownCharacters,
  syncKnownCharactersForReserve,
  createReserveState,
  createInitialWorld
};
