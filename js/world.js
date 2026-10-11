const { runForestDirector } = require("./forestDirector");
const { buildReserveView } = require("./reserveView");
const { SPECIES_DB, getUnlockedSpecies } = require("./animalWorld");
const { buildSeasonDynamics } = require("./seasonSystem");
const { createGoalState } = require("./goalSystem");
const { defaultRareAnimalState } = require("./rareAnimalSystem");
const { emptyTask: emptyExtinctionClueTask } = require("./extinctionClueTask");
const { emptySpeciesArchiveBox } = require("./speciesArchiveBox");
const regions = [
  { id: "north", name: "北部针叶林", feature: "冷杉与松林，树冠连续", resource: "松果、鸟巢、野兔、树洞", x: 0.25, y: 0.15, mood: "cold", water: 34, food: 58, danger: 42, territory: { ownerId: "npc_crow", ownerName: "黑铃鸦", ownerSpecies: "乌鸦", claim: "树冠观察区", pressure: 38, rule: "高处视野决定消息流向，交换消息比武力更有效" } },
  { id: "center", name: "中央混交林", feature: "阔叶林与灌木层密集", resource: "浆果、鹿群、鼠类、隐蔽庇护", x: 0.36, y: 0.42, mood: "dense", water: 52, food: 74, danger: 66, territory: { ownerId: "npc_wolf", ownerName: "沉牙狼", ownerSpecies: "狼", claim: "狼群猎场", pressure: 74, rule: "穿越、追踪和捕猎都会改变鹿群路线" } },
  { id: "river", name: "东部河岸湿地", feature: "浅滩、芦苇和稳定饮水点", resource: "饮水、鱼类、两栖类、足迹", x: 0.75, y: 0.43, mood: "wet", water: 92, food: 62, danger: 58, territory: { ownerId: "shared", ownerName: "临时停战线", ownerSpecies: "多物种", claim: "公共水源", pressure: 62, rule: "饮水被容忍，伏击会破坏河岸停战" } },
  { id: "meadow", name: "南部林缘草甸", feature: "草地开阔，连接森林边缘", resource: "嫩草、昆虫、野兔、鹿群路线", x: 0.58, y: 0.72, mood: "open", water: 48, food: 82, danger: 38, territory: { ownerId: "npc_deer", ownerName: "晨角鹿", ownerSpecies: "鹿", claim: "迁徙草场", pressure: 46, rule: "群体路线比单点占领更重要" } },
  { id: "rocks", name: "西部岩坡洞域", feature: "岩坡、洞穴和稀疏灌木", resource: "洞穴、鸟巢、矿盐、腐木昆虫", x: 0.29, y: 0.70, mood: "stone", water: 28, food: 45, danger: 54, territory: { ownerId: "npc_bear", ownerName: "厚掌熊", ownerSpecies: "熊", claim: "独行洞域", pressure: 68, rule: "靠近洞穴会被视为冒犯，矿盐会吸引鹿群" } },
  { id: "lake", name: "北部高地湖泊", feature: "高地湖与芦苇浅滩", resource: "饮水、鱼、水鸟、水貂", x: 0.55, y: 0.35, mood: "water", water: 88, food: 54, danger: 40, territory: { ownerId: "npc_mink", ownerName: "霜脊貂", ownerSpecies: "水貂", claim: "湖岸猎场", pressure: 44, rule: "浅滩是水貂的伏击点，饮水者需留退路" } }
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
    cartoonLook: "黑羽亮眼、脖子挂小铃铛，像树冠观察员",
    location: "北部针叶林",
    temperament: "爱交换线索",
    rank: 2,
    title: "树冠信使",
    personality: "好奇、机会主义，擅长把脚印和异响变成线索",
    wisdom: "乌鸦能记住人脸和危险地点，也会利用大型动物留下的食物残余",
    memory: ["记得河岸湿地的脚印数量突然变多"],
    publicState: "在树冠间散播消息",
    intent: { type: "observe", label: "盘旋观察河岸脚印", targetRegionId: "river", certainty: "rumor", stance: "open" },
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
    intent: { type: "observe", label: "从高处观察草原边界尘土", targetRegionId: "north", certainty: "rumor", stance: "open" },
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
    intent: { type: "observe", label: "借上升气流盘旋，盯住河岸和草场边界", targetRegionId: "river", certainty: "confirmed", stance: "open" },
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
    intent: { type: "observe", label: "沿岩坡和草场边缘寻找异常死亡气味", targetRegionId: "rocks", certainty: "rumor", stance: "open" },
    relation: { trust: 42, threat: 28 }
  },
  {
    id: "npc_rhino",
    name: "阔角犀",
    species: "白犀牛",
    shortName: "阔角",
    cartoonLook: "厚皮低头、宽角前伸，像一块会移动的石头",
    location: "南部林缘草甸",
    temperament: "沉稳，边界感极强",
    rank: 5,
    title: "草甸重装守卫",
    personality: "缓慢但极难推动，会优先记住草场宽度、泥地和旧冲撞路线",
    wisdom: "犀牛依赖开阔草地、泥潭和稳定路线；一旦草甸被逼窄，冲突会迅速上升",
    memory: ["记得草场被挤窄后，连低头吃草都要先看三次前方"],
    publicState: "在草甸边缘慢慢巡路",
    intent: { type: "guard", label: "压住草场边界，避免队伍挤成一团", targetRegionId: "meadow", certainty: "confirmed", stance: "closed" },
    relation: { trust: 20, threat: 86 }
  },
  {
    id: "npc_pangolin",
    name: "环鳞甲",
    species: "穿山甲",
    shortName: "环鳞",
    cartoonLook: "层层鳞片像折起来的叶子，缩成一团时几乎看不见",
    location: "西部岩坡洞域",
    temperament: "害羞，夜行，怕被强光照到",
    rank: 2,
    title: "夜间翻土者",
    personality: "安静、谨慎，会沿蚁道和土层缝隙寻找食物",
    wisdom: "穿山甲依赖夜间土壤和蚁群；地表扰动与强光会直接影响它的活动范围",
    memory: ["记得某次白天被灯光追着跑，地面温度把鳞片都烫得发紧"],
    publicState: "蜷在岩坡阴影里等天黑",
    intent: { type: "move", label: "夜里顺着土层边缘找蚁道", targetRegionId: "rocks", certainty: "rumor", stance: "cautious" },
    relation: { trust: 34, threat: 24 }
  },
];
const missingNpcSeeds = {
  hare: { name: "短耳兔", location: "南部林缘草甸", title: "草洞观察员", intentType: "move", targetRegionId: "meadow", stance: "cautious" },
  boar: { name: "九纹猪", location: "中央混交林", title: "林缘翻土者", intentType: "move", targetRegionId: "center", stance: "open" },
  owl: { name: "圆羽鸮", location: "北部针叶林", title: "夜间观察者", intentType: "observe", targetRegionId: "north", stance: "open" },
  fox: { name: "赤尾狐", location: "中央混交林", title: "边缘侦察者", intentType: "observe", targetRegionId: "center", stance: "cautious" },
  tapir: { name: "灰鼻貘", location: "中央混交林", title: "夜路播种者", intentType: "move", targetRegionId: "center", stance: "cautious" },
  fireflyBird: { name: "微光莺", location: "南部林缘草甸", title: "夜路示警者", intentType: "observe", targetRegionId: "meadow", stance: "open" },
  bison: { name: "宽肩牛", location: "南部林缘草甸", title: "迁徙旗舰", intentType: "move", targetRegionId: "meadow", stance: "open" },
  crane: { name: "长鸣鹤", location: "东部河岸湿地", title: "湿地驿使", intentType: "move", targetRegionId: "river", stance: "cautious" }
};
Object.keys(SPECIES_DB).forEach((speciesId) => {
  const species = SPECIES_DB[speciesId];
  const seed = missingNpcSeeds[speciesId] || {
    name: (species && species.representative && species.representative.name) || (species && species.name) || speciesId,
    location: "中央混交林",
    title: `${(species && species.name) || speciesId}观察员`,
    intentType: "observe",
    targetRegionId: "center",
    stance: "cautious"
  };
  if (!species || knownCharacters.some((animal) => animal.species === species.name)) return;
  knownCharacters.push({
    id: `npc_${speciesId}`,
    name: seed.name,
    species: species.name,
    shortName: (species.representative && species.representative.name) || species.name,
    cartoonLook: `${species.name}代表，${species.description}`,
    location: seed.location,
    temperament: species.sensitivity === "safety_sensitive" ? "警觉，关注边界安全" : species.sensitivity === "observer_type" ? "敏锐，擅长发现异常" : "谨慎，跟随生态变化",
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
const NAMED_ANIMAL_DEPTH = Object.freeze({
  狼: { trauma: "幼年时跟随旧狼群穿过公路，只有它和一只跛脚同伴抵达另一侧。", humanStance: "相信人类可以守住边界，但不相信人类有权替狼群决定该捕哪一只鹿。", sameSpeciesSplit: "年轻狼愿意利用巡护线避开偷猎者，老狼认为任何固定人类气味最终都会引来围捕。" },
  乌鸦: { trauma: "曾把同伴引向一处人类留下的食物，后来发现那里藏着毒饵。", humanStance: "愿意用线索交换安全，却拒绝把所有巢位告诉任何守护者。", sameSpeciesSplit: "树冠北侧的乌鸦主张继续向人类示警，南侧小群只把人类当成可以观察的危险动物。" },
  鹿: { trauma: "上一场旱季里，它在过窄水线旁失去一只没有跟上队形的幼鹿。", humanStance: "记得巡护员修过水路，也记得人类车辆曾把队伍冲散；信任永远带着退路。", sameSpeciesSplit: "年轻母鹿愿意靠近修复水点，老雌鹿坚持在每次饮水前先绕行一整圈。" },
  熊: { trauma: "旧洞域曾被旅游者围观，幼崽在逃离时受伤，从此它厌恶洞口聚集的低声说话。", humanStance: "承认巡护能赶走盗猎者，但认为好意的靠近和恶意的靠近都会越过边界。", sameSpeciesSplit: "较年轻个体会翻找人类设施外缘，年长个体宁愿放弃矿盐点也不接近建筑。" },
  水貂: { trauma: "一次突降水位暴露了岸洞，最弱的幼崽没能等到鱼群回来。", humanStance: "相信修水的人，却不相信岸上的承诺能让水永远留下。", sameSpeciesSplit: "上游个体接受人工缓坡，下游个体认为任何河工都会改变鱼影和气味。" },
  狮子: { trauma: "它第一次接管狮群时经历过连续失猎，曾看着幼狮在水线附近衰弱。", humanStance: "容忍守护者驱离持枪者，但拒绝把捕食本身当成人类需要纠正的罪。", sameSpeciesSplit: "育幼雌狮倾向避开巡护灯，年轻雄狮反而利用灯外阴影接近猎物。" },
  豹子: { trauma: "灌丛被清理后，它曾在开阔地失去一次逃离狮群的机会，尾端留有旧伤。", humanStance: "把安静修复视为帮助，却认为摄像机和赞美同样会夺走隐蔽。", sameSpeciesSplit: "核心区个体愿意使用人工恢复灌丛，边界个体会避开所有带人类绳结的遮蔽物。" },
  鳄鱼: { trauma: "幼年河湾干涸时，它被迫穿过岸地，腹甲上仍留着拖行的浅疤。", humanStance: "不区分善意与恶意，只用水位、距离和撤退空间判断人类是否可以容忍。", sameSpeciesSplit: "大个体固守深水，年轻个体主张随季节去新的浅滩，双方经常在河湾交界对峙。" },
  野犬: { trauma: "旧队伍曾被围栏切成两半，回应的叫声持续了一夜，第二天只回来一边。", humanStance: "愿意把巡护员算进协作网络，但对任何封闭通道保持近乎本能的敌意。", sameSpeciesSplit: "有幼犬的家庭群支持沿巡线移动，失去同伴的老犬拒绝穿过任何人工门洞。" },
  斑马: { trauma: "一次惊逃中队形崩散，它最后看见的幼崽条纹被尘土遮住。", humanStance: "认可人类保持距离的守护，不接受为了观察而逼迫队伍重排。", sameSpeciesSplit: "队首愿意使用宽阔人工水道，队尾母兽坚持旧路更容易维持熟悉队形。" },
  羚羊: { trauma: "它曾把风吹动的布误认成安全信号，随后在遮挡后撞见伏击。", humanStance: "会回应真正减少死角的人类行动，但不再相信单一标志或一次安静。", sameSpeciesSplit: "幼群愿意探索修短后的草场，成年群认为低草也会让自己暴露在高空捕食者视野里。" },
  长颈鹿: { trauma: "曾从远处看见火线逼近，却无法让低处队伍及时理解它凝视的方向。", humanStance: "愿意把远方异常交给巡护员解释，但担心人类只看见景观而忽略幼崽逃生距离。", sameSpeciesSplit: "高龄雌兽相信旧树线，年轻个体更愿跟随大象开出的新通道。" },
  大象: { trauma: "记忆中的一口旱季水坑被围栏截断，族群中最年长的母象死在另一侧。", humanStance: "能长久记住修复者，也会同样长久记住阻断路线的人；原谅不等于遗忘。", sameSpeciesSplit: "年轻象希望重走修复后的旧水路，年长母象坚持先验证每一个出口再允许幼象通过。" },
  河马: { trauma: "水位下降时它失去一处白天降温的深槽，皮肤裂伤使它数月不再上岸。", humanStance: "接受保持深水的人类工程，却把靠近河湾的观察者视作另一种领地压力。", sameSpeciesSplit: "主群要求固守深槽，边缘雄性主张扩展到社区水道，冲突会随旱季加重。" },
  火烈鸟: { trauma: "一次岸边灯光使整群夜间起飞，最年轻个体没有在第二天回到浅滩。", humanStance: "对无声远距离监测较宽容，对为了影像靠近水线的人类几乎没有第二次机会。", sameSpeciesSplit: "部分成鸟适应巡护灯的固定节奏，另一群会在第一束反光出现时迁往湖心。" },
  鹰: { trauma: "曾在异常上升气流里掠过山火，翼尖焦羽让它整个季节无法完成俯冲。", humanStance: "相信可预测的巡护路线，却把无人机和突然出现的高空设备视为夺取天空。", sameSpeciesSplit: "河岸个体利用观察塔气流，岩坡个体拒绝靠近任何人造高点。" },
  秃鹫: { trauma: "它曾在毒杀遗骸旁失去同伴，因此面对过于完整的尸体会先长时间盘旋。", humanStance: "愿意让人类移除毒物，却反对为整洁而过早带走自然死亡个体。", sameSpeciesSplit: "年轻个体跟随巡护车寻找异常，老个体只信气味与其他清道夫的盘旋。" },
  白犀牛: { trauma: "它曾在夜里被车灯照着冲出泥地，第二天才发现鼻角上留了旧裂痕。", humanStance: "接受守边的人类工程，但对任何逼近草场中心的移动都保持强烈戒备。", sameSpeciesSplit: "老年个体坚持绕开营地，年轻个体更愿意沿巡线寻找更宽的草场。" },
  穿山甲: { trauma: "曾在白天被手电反复照见，鳞片下的体温和节奏都被打乱。", humanStance: "会利用安静修复后的土层，却对持续暴露和高频噪声极其敏感。", sameSpeciesSplit: "有些个体偏爱旧蚁道，另一些个体会跟着新翻的湿土迁到更远的夜路。" },
  猎豹: { trauma: "一次追击中，它因草场被压短而暴露在太长的视线里，失去过一次几乎到手的猎物。", humanStance: "接受低干扰的开阔草地，却把连续人声和高频车辆当成会切断冲刺的边界。", sameSpeciesSplit: "年轻个体愿意追更远，带幼崽的母兽更依赖固定的伏击坡线。" },
  斑鬣狗: { trauma: "它曾在冲突后被误当作残余清理者驱赶，最后只能在夜里更晚返回。", humanStance: "愿意接手守护者留下的残余，但不接受人类把‘清场’当成彻底驱逐。", sameSpeciesSplit: "部分个体跟随大型捕食者，另一些个体专吃边界遗留，两群的节奏并不一样。" },
  野兔: { trauma: "旧草洞曾被机械压塌，它从另一条透气口逃出，窝里的同伴没有。", humanStance: "不理解守护者身份，只记得哪些脚步会停在洞口、哪些会绕开。", sameSpeciesSplit: "新生个体会使用人工草垄，年长个体宁愿跑远也不进入带工具气味的洞隙。" },
  野猪: { trauma: "一次误食人类垃圾让幼崽病了很久，从此它会先嗅所有容易获得的食物。", humanStance: "欢迎恢复腐木和土壤的人类，但把投喂看作会让族群失去判断的危险。", sameSpeciesSplit: "成年母兽避开营地，年轻雄性仍会试探垃圾气味，族群内部因此反复改变路线。" },
  猫头鹰: { trauma: "连续砍伐让它一夜之间失去三个停靠点，幼鸟第一次练飞时无处落脚。", humanStance: "接受白天修复树冠的人类，却只在夜里验证他们是否真的保持安静。", sameSpeciesSplit: "旧巢个体依赖连续树冠，新迁入个体愿意使用人工巢箱，但对入口方向存在分歧。" },
  狐狸: { trauma: "曾因靠近人类食物被同类排斥，后来那处食物又引来围捕。", humanStance: "会与人类交换线索和余地，却不愿把生存依赖变成长期驯化。", sameSpeciesSplit: "边界狐狸愿利用人类活动留下的空隙，林内个体认为这种做法终会把危险带回族群。" },
  水獭: { trauma: "一次岸边喧闹让幼崽错过洄游鱼群，它从此只在最安静的河湾露面。", humanStance: "欢迎把水路重新连通的人，却拒绝任何挤满河岸的观看。", sameSpeciesSplit: "上游个体接受缓坡护岸，下游个体认为任何河工都会改变鱼影。" },
  鹈鹕: { trauma: "水面被网具切成窄条后，编队再也无法同时落稳，幼鸟掉队再也没回来。", humanStance: "只信任开阔、可预测的水面，不接受为拍摄而逼近编队。", sameSpeciesSplit: "成鸟主张改去更深湖心，年轻个体仍想守住原来的浅滩队形。" },
  猩猩: { trauma: "观景廊道建成后，它一夜之间失去最常用的那条林冠通道。", humanStance: "接受远处、无声的守护，却把任何仰头围观当成对树冠的入侵。", sameSpeciesSplit: "年长个体坚持旧树线，年轻个体愿意试探修复后的新冠层。" },
  巨嘴鸟: { trauma: "果期被持续惊扰后，它把整条传讯路线改到更密的树冠背面。", humanStance: "愿意用叫声交换安全，却不愿把所有取食点告诉任何守护者。", sameSpeciesSplit: "北侧鸟群继续示警，南侧小群只把人类当成可以观察的危险。" },
  貘: { trauma: "夜路被灯带切断后，它踩进陌生泥地，鼻端留下未愈的擦伤。", humanStance: "只要灯暗下来就愿意回来播种，却把持续照明当成驱离。", sameSpeciesSplit: "有的个体改走更远的旧河道，有的个体仍试探营地外的低光缝隙。" },
  夜莺: { trauma: "连续几个无声之夜后，它几乎放弃了原来的停鸣点。", humanStance: "把恢复的夜鸣当作守护有效的证据，却不容许为了聆听而靠近巢位。", sameSpeciesSplit: "部分个体适应固定巡护节奏，另一群会在第一束手电光出现时改道。" },
  野牛: { trauma: "迁徙通道被围栏截成两半时，它看见幼崽停在无法穿过的那一侧。", humanStance: "记得谁重新留出了通道，也记得谁把边界当成墙。", sameSpeciesSplit: "队首愿意使用新开的宽路，队尾母兽坚持旧路更容易维持熟悉队形。" },
  鹤: { trauma: "邻区水位骤降那年，它在中途停歇地等到天亮也没有同伴降落。", humanStance: "把稳定水位看作最大善意，却拒绝为了景观把停歇地改成观鸟台。", sameSpeciesSplit: "有的个体改走更远的备用湿地，有的个体仍守着原来的浅滩驿站。" }
});
knownCharacters.forEach((animal) => {
  const depth = NAMED_ANIMAL_DEPTH[animal.species] || {};
  animal.trauma = depth.trauma || "它记得一段尚未愿意交给人类解释的损失。";
  animal.humanStance = depth.humanStance || "它只根据长期行动判断人类，而不接受口头承诺。";
  animal.sameSpeciesSplit = depth.sameSpeciesSplit || "同一物种的不同个体对人类边界仍有分歧。";
  if (!(animal.memory || []).length) animal.memory = [`记得${animal.trauma.replace(/[。.]$/, "")}`];
});
function syncKnownCharactersForReserve(currentCharacters, reserve) {
  const level = Math.max(1, Math.min(7, Math.round(((reserve && reserve.progression) || {}).level || 1)));
  const current = currentCharacters || [];
  const chapter = Math.max(1, Math.round(((reserve && reserve.progression) || {}).stage || level));
  return getUnlockedSpecies(level, chapter).map((species) => {
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
      trauma: (old && old.trauma) || template.trauma,
      humanStance: (old && old.humanStance) || template.humanStance,
      sameSpeciesSplit: (old && old.sameSpeciesSplit) || template.sameSpeciesSplit,
      insight: (old && old.insight) || "",
      aiMood: (old && old.aiMood) || template.aiMood || null,
      ally: (old && old.ally) || false,
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
    { rank: 3, label: "区域机会者", privilege: "能利用领地之间短暂的空隙", cost: "难以正面夺取领地" },
    { rank: 2, label: "群体/观察节点", privilege: "能提高预警与信任", cost: "不能独自压制强者" },
    { rank: 1, label: "低位生存者", privilege: "更容易隐藏和被群体接纳", cost: "暴露后风险很高" }
  ]
};
const INITIAL_PROTECTION_FUND = 1000;
function createReserveState() {
  return {
    fund: INITIAL_PROTECTION_FUND,
    stability: 66,
    business: 58,
    ecologyScore: 66,
    reputation: 50,
    enforcement: 48,
    poacherPressure: 30,
    // 新保护区先处于“可维持但仍有风险”的状态。安全值需要通过巡护、
    // 边界治理和生态决策逐步提升，避免玩家未经营就直接落在高安全区。
    safety: 58,
    migration: { trend: "stable", delta: 0, reason: "泥岸初醒，动物只把这里当作临时路过点，暂时观望" },
    coreResources: { version: 1, energy: 3, energyMax: 3, fund: INITIAL_PROTECTION_FUND, capacity: 0, population: 0, capacityLoad: 0, community: 47, communityIncome: 0 },
    ecologyChain: { id: "water_food_predator", stage: 0, title: "生态链尚未启动", message: "修复水源后，变化会跨守护日逐步传导。", patrolPressure: 0, observationRequired: false, observationReady: false, history: [] },
    ecologyNarrative: { version: 1, lastDay: 0, serial: 0, lastEvent: null, pendingDecision: null, history: [], artifacts: {}, threads: {} },
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
    weatherPulse: null,
    sandboxTaskRhythm: { lastClosedAt: {}, lastShownAt: {}, visible: {} },
    disasterDrain: { lastTickAt: 0, pausedAt: 0 },
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
      chapterStart: { stage: 1, level: 1, daysManaged: 0, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0, totalVisitors: 0, inheritedVisitors: 0, visitorLedger: { totalVisitors: 0, migratedVisitors: 0, recruitedVisitors: 0, facilityVisitors: 0, taskVisitors: 0, lostVisitors: 0 } },
      stageStart: { stage: 1, level: 1, daysManaged: 0, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0, totalVisitors: 0, inheritedVisitors: 0, visitorLedger: { totalVisitors: 0, migratedVisitors: 0, recruitedVisitors: 0, facilityVisitors: 0, taskVisitors: 0, lostVisitors: 0 } },
      coreBest: { stage: 1, species: 0, animals: 0, visitors: 0 },
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
    resourceAging: { clueIdleActions: 0, pendingAges: {}, recoveryCooldown: 0, highFundActions: 0, exchangeCooldowns: { fieldNote: 0, migrationTrace: 0, forestGift: 0 } },
    highStockProject: { unlocked: false, active: false, cost: 0, durationActions: 8 },
    facilityDiscounts: {},
    economyLedger: null,
    fundLedger: [],
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
      herbivores: { deer: 24, antelope: 1, zebra: 8, boar: 6, hare: 30 },
      birds: { crow: 8 },
      water: 68,
      grass: 56,
      disease: 12
    },
    rareAnimal: defaultRareAnimalState(),
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
    // 独立于巡护补给和工坊物资的章节灭绝线索任务。
    extinctionClueTask: emptyExtinctionClueTask(),
    speciesArchiveBox: emptySpeciesArchiveBox(),
    lastMaterialExploration: null,
    materialExplorationProgress: {},
    wildernessKnowledge: {
      version: 3,
      discoveries: {},
      tradeStock: {},
      history: [],
      lastFind: null,
      tradeHistory: [],
      incomingTradeIds: [],
      incomingHistory: [],
      lastTrade: null
    },
    friendAid: {
      version: 1,
      chapter: 1,
      request: null,
      incoming: null,
      used: false,
      history: []
    },
    friendContract: {
      version: 3,
      day: 1,
      dateKey: "",
      id: "",
      status: "open",
      partner: null,
      objective: null,
      player: { completed: false, action: "", contribution: 0, completedAt: 0 },
      partnerSide: { completed: false, action: "", contribution: 0, completedAt: 0 },
      createdAt: 0,
      fallbackAt: 0,
      completedAt: 0,
      resolution: "",
      slots: [],
      history: []
    },
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
    development: {
      version: 3,
      identity: { animal: 0, visitor: 0, economy: 0 },
      operations: {
        version: 1,
        lastSettlementDay: 0,
        influence: 0,
        totalVisitors: 0,
        visitorLedger: { totalVisitors: 0, migratedVisitors: 0, recruitedVisitors: 0, facilityVisitors: 0, taskVisitors: 0, lostVisitors: 0 },
        totalIncome: 0,
        totalTrouble: 0,
        recruitment: { version: 3, day: 1, freeRemaining: 2, adCredits: 0, adWatchedToday: 0, totalRecruited: 0, publishCount: 0, lastResult: null },
        today: { day: 0, visitors: 0, recruitedVisitors: 0, income: 0, survivalIncome: 0, ecologyScore: 0, safetyScore: 0, speciesCount: 0, animalTotal: 0, tourismScore: 0, tourismRawScore: 0, weather: "", trouble: "尚无明显麻烦" },
        history: [],
        letters: []
      },
      nodes: {
        river_shallows: {
          id: "river_shallows",
          phase: "available",
          planId: "",
          progress: 0,
          memory: [],
          visitorLedger: { lastSettlementDay: 0, todayVisitors: 0, todayIncome: 0, totalVisitors: 0, totalIncome: 0, troubleCount: 0, lastTrouble: "尚无游客麻烦" }
        }
      }
    },
    supplies: {
      dogFood: 4,
      tranquilizer: 2,
      alarm: 1,
      fieldKit: 1,
      medicalKit: 1,
      evidenceTrap: 0
    },
    emergencySupplyAd: { version: 1, lastGuardianDay: 0, claimCount: 0, lastReward: null },
    dailySellFund: { version: 1, lastGuardianDay: 0, lastChapter: 0, soldFund: 0, soldTimes: 0, unlockedBatches: 2, unlockClaimCount: 0, unlockClaimCountToday: 0, lastUnlock: null },
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
      name: "自然保护区",
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
      ],
      broadcasts: []
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
    name: "荒野守望",
    biome: "非洲草原保护区 / 河岸湿地 / 林缘草甸 / 岩坡洞域",
    premise: "你管理一片智能驱动的草原-森林过渡保护区。动物会按天气、食物、水源、领地和人类威胁自主行动。",
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
      animalLetters: [],
      animalLetterDateKey: "",
      animalLetterPromptDateKey: "",
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
  INITIAL_PROTECTION_FUND,
  createReserveState,
  createInitialWorld
};
