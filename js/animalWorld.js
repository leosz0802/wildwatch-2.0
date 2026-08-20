// 动物世界数据模型 v3
// 核心设计：玩家操作 → 宏观指标(安全/生态/经营) → 微观影响每种动物 → 动物通过数据+对话反馈
// 物种分阶段解锁：起步7种 → 保护区Lv.5解锁至21+种
// 与主剧情融合：5个章节对应5个保护区等级

// ============================================================
// 零、主剧情章节框架
// ============================================================

const CHAPTERS = [
  {
    chapter: 1,
    level: 1,
    title: "初来乍到",
    subtitle: "临时营地",
    story: "你刚接手这片保护区。猎犬队只有砾灰，动物们远远看着你——上一个巡护员也说要保护它们，后来再没回来。先让猎犬跑一圈，让动物知道：新巡护员来了。",
    unlockDesc: "基础物种开始试探这片土地",
    newSpecies: ["deer", "antelope", "hare", "crow", "wolf", "zebra", "boar"],
    newSpeciesLabel: "鹿、羚羊、野兔、乌鸦、狼、斑马、野猪",
    keyAnimal: "crow",
    keyAnimalQuote: "黑铃鸦：我在树冠上看着你。上一个也说要保护我们。",
    color: "#8b7355",
    bgGradient: ["#0d1f16", "#1c3325"],
  },
  {
    chapter: 2,
    level: 2,
    title: "站稳脚跟",
    subtitle: "稳定保护站",
    story: "猎犬队跑出了气味线，胆小的动物开始记住你的脚步。乌鸦少叫了两声，鹿群把幼崽带近了一点。天空中的鹰开始盘旋——它们只在值得停留的地方盘旋。",
    unlockDesc: "天空和浅滩的动物开始关注这里",
    newSpecies: ["eagle", "flamingo", "bear", "vulture"],
    newSpeciesLabel: "鹰、火烈鸟、熊、秃鹫",
    keyAnimal: "bear",
    keyAnimalQuote: "厚掌熊：洞口还行。你比上一个安静。",
    color: "#d35400",
    bgGradient: ["#1a2a1a", "#2d4a28"],
  },
  {
    chapter: 3,
    level: 3,
    title: "赢得信任",
    subtitle: "可信保护区",
    story: "食草动物开始迁入，鸟类更早报警。草原的象征——狮子——出现在草甸边缘，它没有靠近，但也没有离开。它说：'猎物队形还稳，我暂时不急着扩张。'",
    unlockDesc: "捕食者和草原望塔回归",
    newSpecies: ["lion", "leopard", "giraffe", "owl"],
    newSpeciesLabel: "狮子、豹子、长颈鹿、猫头鹰",
    keyAnimal: "lion",
    keyAnimalQuote: "烈鬃狮：猎物队形还稳。我暂时不急着扩张。",
    color: "#c0392b",
    bgGradient: ["#1a2218", "#2a3a20"],
  },
  {
    chapter: 4,
    level: 4,
    title: "成为庇护所",
    subtitle: "核心庇护地",
    story: "幼兽和弱势动物更愿意靠近核心区。大象带着幼象回来了——它说旧水路在记忆里亮了一下。河马重新泡进河湾，鳄鱼只露出眼睛。这里开始像一个真正的庇护地。",
    unlockDesc: "巨型动物和完整生态链成型",
    newSpecies: ["elephant", "hippo", "crocodile", "wildDog"],
    newSpeciesLabel: "大象、河马、鳄鱼、野犬",
    keyAnimal: "elephant",
    keyAnimalQuote: "云耳象：旧水路在记忆里亮了一下。幼象需要先喝到水。",
    color: "#27ae60",
    bgGradient: ["#142818", "#1e3a20"],
  },
  {
    chapter: 5,
    level: 5,
    title: "传奇之地",
    subtitle: "旗舰保护区",
    story: "动物用迁移路线投票，这里成为区域样板。水貂溜进浅滩，狐狸在边缘套利。保护区不再只是'安全'——它是'繁荣'。其他保护区开始把你的名字写进他们的迁移报告里。",
    unlockDesc: "稀有物种和边缘生态位补全",
    newSpecies: ["mink", "fox"],
    newSpeciesLabel: "水貂、狐狸",
    keyAnimal: "mink",
    keyAnimalQuote: "霜脊貂：浅滩还在线。鱼影还在。伏击点营业。",
    color: "#2980b9",
    bgGradient: ["#0e1a22", "#1a2e38"],
    // 未来：犀牛、穿山甲、猎豹...
    futureHint: "更多稀有物种将在后续更新中加入..."
  },
];
// 一、宏观指标 → 物种影响链路
// ============================================================

// 每物种对三大宏观指标的敏感度（0-100%）
// 决定了该指标变化时，物种受多大影响
const MACRO_SENSITIVITY = {
  // 安全敏感型：偷猎、边界安全直接影响
  safety_sensitive:   { safety: 0.75, ecology: 0.15, business: 0.10, label: "安全敏感型", desc: "对偷猎压力和边界安全极度敏感，安全等级下降时最先逃离" },
  // 生态敏感型：水源、草场、病虫害直接影响
  ecology_sensitive:  { safety: 0.20, ecology: 0.65, business: 0.15, label: "生态敏感型", desc: "依赖水源、草场和病虫害水平，生态恶化时种群首先波动" },
  // 平衡型：三方面差不多
  balanced:           { safety: 0.35, ecology: 0.35, business: 0.30, label: "平衡型", desc: "对安全、生态和经营三方面都有响应，但单一指标变化不会剧烈波动" },
  // 经营敏感型：基金、补给、巡护能力直接影响
  business_sensitive: { safety: 0.15, ecology: 0.15, business: 0.70, label: "经营敏感型", desc: "对保护基金、补给和巡护能力敏感，经营差时生存资源不足" },
  // 情报型：主要受安全影响，但也能从经营中获益
  intel_type:         { safety: 0.50, ecology: 0.20, business: 0.30, label: "情报型", desc: "充当保护区的'眼睛和耳朵'，安全恶化时情报价值升高，经营好时信息网络更广" },
};

// ============================================================
// 二、物种数据库（按解锁阶段排列）
// ============================================================

const SPECIES_DB = {

  // ── 第一阶段：保护区 Lv.1「临时营地」· 基础物种 7 种 ──

  deer: {
    id: "deer", name: "鹿", unlockLevel: 1,
    sensitivity: "safety_sensitive",
    ecoRole: "herbivore_large", tier: 2,
    initialPop: 35, maxPop: 120,
    strengths: ["奔跑", "警觉", "寻找草场"],
    weakness: "正面对抗弱，易被伏击，偷猎高压下最先逃离",
    description: "迁徙食草者。优先选择水源稳定且捕食压力低的路线。幼鹿安全感是保护区健康的关键指标。",
    // 宏观影响 → 微观反应（不同状态下的对话）
    dialogues: {
      safety_low:  ["边境不安全，我把幼鹿推进灌木里了", "少了几对蹄声，我不敢回头数", "今晚想搬家，隔壁听起来更安静"],
      safety_ok:   ["草还够嚼，我只想低头过个普通早晨", "今天不硬刚，低头吃草，安静就好"],
      ecology_low: ["水边要排队，两口就撤", "草少省着吃，别啃秃了"],
      ecology_ok:  ["水草还行，幼鹿今天多吃了两口"],
      threat:      ["别踩直线脚印，先躲进灌木", "风里有狼味，水边先等等"],
      calm:        ["新邻居来了，草场更热闹", "幼鹿敢多低头吃两口了"],
    },
    representative: { name: "晨角", quote: "草尖湿着，我的耳朵先上班。" }
  },

  antelope: {
    id: "antelope", name: "羚羊", unlockLevel: 1,
    sensitivity: "safety_sensitive",
    ecoRole: "herbivore_large", tier: 2,
    initialPop: 45, maxPop: 150,
    strengths: ["弹跳躲避", "极快反应", "草场预警"],
    weakness: "胆小，开阔视野下降会提前迁移",
    description: "草原预警员。最先感到草场和捕食者压力变化。它们的行为是保护区安全的'前置雷达'。",
    dialogues: {
      safety_low:  ["先跳再想，草高不妙", "眼角报警，腿已预热"],
      safety_ok:   ["腿已预热，风有点尖，我先试跳"],
      ecology_low: ["草场发虚，今天多跑几步"],
      ecology_ok:  ["草够嫩，今天不用跑太远"],
      threat:      ["草里眼神太多，先弹开再说"],
      calm:        ["跳一下试试安全感，跳完再决定"],
    },
    representative: { name: "跳星", quote: "腿已预热，风有点尖，我先试跳。" }
  },

  hare: {
    id: "hare", name: "野兔", unlockLevel: 1,
    sensitivity: "ecology_sensitive",
    ecoRole: "herbivore_small", tier: 1,
    initialPop: 50, maxPop: 200,
    strengths: ["躲藏", "逃跑", "发现危险"],
    weakness: "几乎不能战斗，暴露后风险极高",
    description: "低位生存者。数量庞大，是中层捕食者的主要食物来源。种群波动是生态健康的'晴雨表'。",
    dialogues: {
      safety_low:  ["洞还在，先躲一会儿", "上面太吵，我钻回去了"],
      safety_ok:   ["洞还在，透气口也通"],
      ecology_low: ["草少了，我得跑更远找吃的"],
      ecology_ok:  ["草籽够多，今天不愁吃"],
      threat:      ["有动静，先钻洞"],
      calm:        ["草地安静，出来透透气"],
    },
    representative: { name: "短耳", quote: "洞还在，先躲一会儿。" }
  },

  crow: {
    id: "crow", name: "乌鸦", unlockLevel: 1,
    sensitivity: "intel_type",
    ecoRole: "scavenger_intel", tier: 2,
    initialPop: 8, maxPop: 30,
    strengths: ["传信", "发现异常", "记忆力"],
    weakness: "正面冲突弱，谎言会反噬",
    description: "树冠信使。把脚印、叫声和边界异响变成情报。坏消息如果没被接住，会比脚印传播得更快。",
    dialogues: {
      safety_low:  ["坏消息上树，我先喊一声", "树下有直线脚印，动物可没这么自信"],
      safety_ok:   ["树冠有八卦，风向变了", "下面还没懂，风向已经换台了"],
      ecology_low: ["少了几声回应，树冠突然空了一块"],
      ecology_ok:  ["树冠还挺热闹，消息够传一圈"],
      threat:      ["这味道不对，直线脚印，坏消息上树"],
      calm:        ["今天树冠安静，我少叫两声"],
    },
    representative: { name: "黑铃", quote: "坏消息上树，我先喊一声。" }
  },

  wolf: {
    id: "wolf", name: "狼", unlockLevel: 1,
    sensitivity: "balanced",
    ecoRole: "mesopredator", tier: 4,
    initialPop: 4, maxPop: 20,
    strengths: ["追踪", "围猎", "群体协作"],
    weakness: "单独行动时风险高，依赖猎物密度",
    description: "狼群追踪鹿群气味移动。猎物稀少时分散觅食，猎物充足时扩大猎场。狼群稳定=猎物充足=生态平衡。",
    dialogues: {
      safety_low:  ["边界脚步多了，我追鹿前要多绕三圈", "坏脚印太多，猎场被记住了"],
      safety_ok:   ["鹿没乱跑，风向还行，先压低身形"],
      ecology_low: ["鹿味断了，晚饭计划需要重写", "猎物散了，少跑冤枉路"],
      ecology_ok:  ["鹿味还浓，猎场今天能营业"],
      threat:      ["猎场别内卷，脚印太多，水线太挤"],
      calm:        ["先闻再追，风比我快，别急着扑"],
    },
    representative: { name: "沉牙", quote: "鹿味断了，晚饭计划需要重写。" }
  },

  zebra: {
    id: "zebra", name: "斑马", unlockLevel: 1,
    sensitivity: "safety_sensitive",
    ecoRole: "herbivore_large", tier: 2,
    initialPop: 40, maxPop: 120,
    strengths: ["群体警戒", "条纹迷惑", "耐力迁移"],
    weakness: "个体弱小，依赖队形保护，幼崽易被冲散",
    description: "草原队列长。依赖集体警戒，水源距离和捕食压力直接改变队形。队形散了=保护区出了问题。",
    dialogues: {
      safety_low:  ["条纹不能排太直，幼崽先进队伍中间", "队形散开，今天不走直线"],
      safety_ok:   ["条纹开会，队尾看紧，水边排队"],
      ecology_low: ["水边队伍变窄，蹄子都不敢太响"],
      ecology_ok:  ["水边还行，排队喝一轮"],
      threat:      ["队形散开，幼崽靠中间"],
      calm:        ["条纹交给阳光打乱，暂时安全"],
    },
    representative: { name: "条纹", quote: "条纹开会，队尾看紧，水边排队。" }
  },

  boar: {
    id: "boar", name: "野猪", unlockLevel: 1,
    sensitivity: "ecology_sensitive",
    ecoRole: "omnivore_engineer", tier: 2,
    initialPop: 15, maxPop: 60,
    strengths: ["杂食", "翻土", "繁殖快"],
    weakness: "幼崽易被捕食，依赖遮蔽",
    description: "林缘杂食者。翻土寻找根茎和昆虫，同时帮助土壤更新。它们的存在意味着林缘生态健康。",
    dialogues: {
      safety_low:  ["土里有吃的，但上面太吵"],
      safety_ok:   ["土里有吃的，先拱一会儿"],
      ecology_low: ["虫子少了，翻土要多花力气"],
      ecology_ok:  ["土肥虫多，今天收获不错"],
      threat:      ["有动静，先躲灌木"],
      calm:        ["土松虫多，多拱一会儿"],
    },
    representative: { name: "九纹", quote: "土里有吃的，先拱一会儿。" }
  },

  // ── 第二阶段：保护区 Lv.2「稳定保护站」· +4 种 ──

  eagle: {
    id: "eagle", name: "鹰", unlockLevel: 2,
    sensitivity: "intel_type",
    ecoRole: "mesopredator", tier: 3,
    initialPop: 2, maxPop: 10,
    strengths: ["高空侦察", "远距离视野", "快速俯冲"],
    weakness: "依赖开阔视野和上升气流",
    description: "高空侦察者。从高空读取河岸、草场和边界尘土。保护区等级提升后，鹰开始把这里当作可靠盘旋区。",
    dialogues: {
      safety_low:  ["边界尘土排得太直，我把盘旋圈压低了一层"],
      safety_ok:   ["借热气盘旋，把河岸和草场边缘扫了一遍"],
      ecology_low: ["草场边缘发虚，从上面看得很清楚"],
      ecology_ok:  ["视野开阔，今天没什么异常"],
      threat:      ["远处尘土太直，不是动物在跑"],
      calm:        ["天空归我，下面先安静一会儿"],
    },
    representative: { name: "高旋", quote: "远处尘土排得太直，不是动物在跑。" }
  },

  flamingo: {
    id: "flamingo", name: "火烈鸟", unlockLevel: 2,
    sensitivity: "ecology_sensitive",
    ecoRole: "water_guardian", tier: 2,
    initialPop: 20, maxPop: 80,
    strengths: ["群聚", "滤食", "浅滩适应"],
    weakness: "怕水质变差，岸边惊扰会迁走",
    description: "浅滩滤食者。水质、藻类和扰动直接影响是否停留。它们来了=水源健康，它们走了=湿地出问题。",
    dialogues: {
      safety_low:  ["岸边太吵，粉色队伍往湖心挪了"],
      safety_ok:   ["浅滩还行，排队滤一轮"],
      ecology_low: ["水有点浑，粉色队伍往湖心挪了"],
      ecology_ok:  ["水质干净，粉色队伍今天很满意"],
      threat:      ["岸边有动静，先飞一圈看看"],
      calm:        ["浅滩安静，多滤一会儿"],
    },
    representative: { name: "粉脚", quote: "水有点浑，粉色队伍往湖心挪了。" }
  },

  bear: {
    id: "bear", name: "熊", unlockLevel: 2,
    sensitivity: "balanced",
    ecoRole: "omnivore_engineer", tier: 4,
    initialPop: 1, maxPop: 5,
    strengths: ["战斗", "威慑", "翻找食物"],
    weakness: "行动慢，食物需求高，独行无盟友",
    description: "独行的重型杂食者。守护洞域和矿盐点。它愿意留下=保护区足够安静和安全。它的出现是保护区成熟的标志。",
    dialogues: {
      safety_low:  ["洞外有人，金属味来了，先别出洞"],
      safety_ok:   ["洞口还行，矿盐点正常，别吵我"],
      ecology_low: ["矿盐点被炸了，我不展示体型优势"],
      ecology_ok:  ["地盘还算安静，我批准这片安静继续存在"],
      threat:      ["洞口别开会，外面太吵，少来洞边"],
      calm:        ["别吵我，洞口还行，矿盐点正常"],
    },
    representative: { name: "厚掌", quote: "洞口还行，矿盐点正常。别吵我。" }
  },

  vulture: {
    id: "vulture", name: "秃鹫", unlockLevel: 2,
    sensitivity: "intel_type",
    ecoRole: "scavenger_intel", tier: 3,
    initialPop: 4, maxPop: 20,
    strengths: ["发现异常遗骸", "清理病原", "远距离飞行"],
    weakness: "依赖上升气流，需要开阔视野",
    description: "天空清道夫。追踪自然死亡个体、疾病和冲突痕迹。异常聚集通常意味着疾病或生态风险。",
    dialogues: {
      safety_low:  ["空气里有不该新鲜的味道", "秃鹫在草场边缘多绕了几圈"],
      safety_ok:   ["沿岩坡低飞，没发现需要集结的坏消息"],
      ecology_low: ["病味扩散了，我先绕几圈确认"],
      ecology_ok:  ["天空干净，今天不用集结"],
      threat:      ["下面有不该有的味道，我先记下来"],
      calm:        ["天空干净，不用集结"],
    },
    representative: { name: "白领", quote: "空气里有不该新鲜的味道。" }
  },

  // ── 第三阶段：保护区 Lv.3「可信保护区」· +4 种 ──

  lion: {
    id: "lion", name: "狮子", unlockLevel: 3,
    sensitivity: "balanced",
    ecoRole: "apex_predator", tier: 5,
    initialPop: 3, maxPop: 12,
    strengths: ["群体协作", "伏击", "领地控制"],
    weakness: "食量大，猎物稀少时狮群内耗严重",
    description: "草原的象征。狮群由雌狮主导狩猎，雄狮守护领地。狮群稳定=保护区生态链完整，是保护区最高成就之一。",
    dialogues: {
      safety_low:  ["草里有人味，鬃毛都不想张扬", "猎物队形薄了，狮群今天不能乱花力气"],
      safety_ok:   ["太阳归我，先眯一会儿，队尾有动静"],
      ecology_low: ["猎物队薄了，别白跑，黄昏再看"],
      ecology_ok:  ["队尾有点慢，黄昏会告诉我答案"],
      threat:      ["鬃毛不爱枪味，草里有人味，狮群先卧倒"],
      calm:        ["太阳归我，先眯一会儿"],
    },
    representative: { name: "烈鬃", quote: "太阳归我，先眯一会儿，队尾有动静。" }
  },

  leopard: {
    id: "leopard", name: "豹子", unlockLevel: 3,
    sensitivity: "safety_sensitive",
    ecoRole: "mesopredator", tier: 4,
    initialPop: 2, maxPop: 10,
    strengths: ["伏击", "爬树", "隐蔽"],
    weakness: "正面冲突弱，依赖灌丛隐蔽",
    description: "独行伏击者。依赖灌丛和树影提供隐蔽。它愿意留在核心区=灌丛健康、安全感足够。",
    dialogues: {
      safety_low:  ["树影里混进金属味，我把尾巴收得更紧"],
      safety_ok:   ["斑点在线，等风停，别看我尾巴"],
      ecology_low: ["灌丛变薄了，我的斑点藏不住"],
      ecology_ok:  ["灌丛还够密，我的斑点暂时很满意"],
      threat:      ["树影不干净，尾巴先收好，别踩干枝"],
      calm:        ["斑点藏进树影里，尾巴先稳住"],
    },
    representative: { name: "影斑", quote: "斑点藏进树影里，尾巴先稳住。" }
  },

  giraffe: {
    id: "giraffe", name: "长颈鹿", unlockLevel: 3,
    sensitivity: "ecology_sensitive",
    ecoRole: "herbivore_large", tier: 2,
    initialPop: 10, maxPop: 40,
    strengths: ["高处视野", "远距离预警", "温和"],
    weakness: "幼崽需要开阔视野，灌丛和人类干扰改变停留点",
    description: "草原望塔。从树梢高度发现远处尘土和边界异动。它来了=树冠层健康、视野开阔。",
    dialogues: {
      safety_low:  ["远处尘土排得太直，我不喜欢这种人类速度"],
      safety_ok:   ["树梢上的叶子还安静，我先当一会儿望塔"],
      ecology_low: ["树梢叶子少了，视野倒更远"],
      ecology_ok:  ["树梢叶子还密，我多瞭一会儿"],
      threat:      ["远处尘土太直，我把消息传给低处动物"],
      calm:        ["我看得远，树梢有消息，尘土很直"],
    },
    representative: { name: "高枝", quote: "树梢上的叶子还安静，我先当一会儿望塔。" }
  },

  owl: {
    id: "owl", name: "猫头鹰", unlockLevel: 3,
    sensitivity: "intel_type",
    ecoRole: "mesopredator", tier: 3,
    initialPop: 3, maxPop: 15,
    strengths: ["夜视", "无声飞行", "发现踪迹"],
    weakness: "白天行动弱，草甸开阔地缺少停靠点",
    description: "夜间树冠观察者。揭示白天看不到的风险。它的出现=树冠层足够连续、夜间生态健康。",
    dialogues: {
      safety_low:  ["夜里比白天热闹，我在树冠上听得一清二楚"],
      safety_ok:   ["夜里还算安静，树冠上没什么异常"],
      ecology_low: ["树冠变薄了，停靠点少了好几个"],
      ecology_ok:  ["树冠连续，今晚多巡几圈"],
      threat:      ["夜里有人声，我先记下方位"],
      calm:        ["夜风安静，多听一会儿"],
    },
    representative: { name: "圆羽", quote: "夜里比白天热闹，我在树冠上听得一清二楚。" }
  },

  // ── 第四阶段：保护区 Lv.4「核心庇护地」· +4 种 ──

  elephant: {
    id: "elephant", name: "大象", unlockLevel: 4,
    sensitivity: "ecology_sensitive",
    ecoRole: "herbivore_large", tier: 2,
    initialPop: 5, maxPop: 20,
    strengths: ["记忆水源", "改造地形", "家族纽带"],
    weakness: "需要大量水和食物，幼象脆弱",
    description: "水源记忆者。用长期记忆寻找旱季水路和安全通道。幼象敢在这里出生=保护区真正成为庇护地。",
    dialogues: {
      safety_low:  ["旧水路在记忆里暗了一下，幼象先别走远"],
      safety_ok:   ["鼻尖卷到水汽，旧水路在记忆里亮了一下"],
      ecology_low: ["旧水路醒了吗？幼象先喝，记忆带路"],
      ecology_ok:  ["水汽还在，我带幼象慢慢走，不急但不乱"],
      threat:      ["幼象跟紧，今天换条路"],
      calm:        ["慢点也稳，我记得水，幼象跟紧"],
    },
    representative: { name: "云耳", quote: "旧水路在记忆里亮了一下，幼象需要先喝到水。" }
  },

  hippo: {
    id: "hippo", name: "河马", unlockLevel: 4,
    sensitivity: "ecology_sensitive",
    ecoRole: "water_guardian", tier: 2,
    initialPop: 6, maxPop: 25,
    strengths: ["水域统治", "体型威慑", "夜行觅食"],
    weakness: "白天离不开水域，皮肤敏感怕晒",
    description: "河湾守门者。白天泡水降温，夜里上岸吃草。河马群稳定=水域健康、水位充足。",
    dialogues: {
      safety_low:  ["水线退了，我露出的背更多，浅滩变得不耐烦"],
      safety_ok:   ["河湾深水还够，半沉着，只用鼻孔检查岸边动静"],
      ecology_low: ["水位下降，泡泡都没地方冒"],
      ecology_ok:  ["水够深，泡得舒服"],
      threat:      ["有陌生脚步靠近河湾"],
      calm:        ["泡着，不急"],
    },
    representative: { name: "泥泡", quote: "水位一退，泡泡都没地方冒。" }
  },

  crocodile: {
    id: "crocodile", name: "鳄鱼", unlockLevel: 4,
    sensitivity: "ecology_sensitive",
    ecoRole: "apex_predator", tier: 5,
    initialPop: 5, maxPop: 18,
    strengths: ["伏击", "耐心", "水域统治"],
    weakness: "离开水域后行动迟缓，体温依赖环境",
    description: "河岸的沉默猎手。鳄鱼种群稳定=水域生态链完整，鱼群和饮水动物数量在健康范围内。",
    dialogues: {
      safety_low:  ["水浅了，我露出的笑容有点太多"],
      safety_ok:   ["只露眼睛，我不急，水面很懂我"],
      ecology_low: ["水浅了，露出的背脊比昨天多"],
      ecology_ok:  ["饮水线还在，水会替我等"],
      threat:      ["水面有我不喜欢的波纹"],
      calm:        ["只露眼睛，不急"],
    },
    representative: { name: "裂吻", quote: "我不急。水会替我等。" }
  },

  wildDog: {
    id: "wildDog", name: "野犬", unlockLevel: 4,
    sensitivity: "balanced",
    ecoRole: "mesopredator", tier: 4,
    initialPop: 6, maxPop: 25,
    strengths: ["耐力追逐", "群体协作", "高效捕猎"],
    weakness: "个体弱小，需要团队配合",
    description: "追逐小队长。依靠团队耐力追逐羚羊。野犬群的出现=羚羊数量充足+草场开阔。",
    dialogues: {
      safety_low:  ["小队集合，但今天先不急，边界有点吵"],
      safety_ok:   ["小队集合，耳朵开跑，追风不追空"],
      ecology_low: ["队尾散了，今天少跑冤枉路"],
      ecology_ok:  ["风线不错，耳朵和脚都想开工"],
      threat:      ["小队散开，别让脚印排成线"],
      calm:        ["小队集合，耳朵开跑"],
    },
    representative: { name: "花耳", quote: "小队集合，耳朵开跑，追风不追空。" }
  },

  // ── 第五阶段：保护区 Lv.5「旗舰保护区」· +2 种 ──

  mink: {
    id: "mink", name: "水貂", unlockLevel: 5,
    sensitivity: "ecology_sensitive",
    ecoRole: "mesopredator", tier: 3,
    initialPop: 4, maxPop: 15,
    strengths: ["泅水", "浅滩伏击", "夜行"],
    weakness: "干燥开阔地耐力差，离开水域后衰弱",
    description: "水岸伏击者。它的出现=浅滩生态完整、鱼群稳定。只出现在水源健康的高等级保护区。",
    dialogues: {
      safety_low:  ["芦苇有脚印，岸边不对，贴水线躲"],
      safety_ok:   ["鱼影还在，伏击点今天能营业"],
      ecology_low: ["鱼退到深处，我很专业地扑空了两次"],
      ecology_ok:  ["浅滩还在线，鱼影还在，伏击点营业"],
      threat:      ["芦苇断得太重，我贴水线溜了"],
      calm:        ["胡须碰到水面，浅滩比刚才短了点"],
    },
    representative: { name: "霜脊", quote: "鱼退到深处，我很专业地扑空了两次。" }
  },

  fox: {
    id: "fox", name: "狐狸", unlockLevel: 5,
    sensitivity: "balanced",
    ecoRole: "mesopredator", tier: 3,
    initialPop: 3, maxPop: 12,
    strengths: ["潜行", "偷取", "侦察"],
    weakness: "正面对抗弱，过度欺骗失去信任",
    description: "边缘套利者。在多方势力间寻找机会窗口。它的出现=保护区生态足够复杂，有'灰色地带'可供生存。",
    dialogues: {
      safety_low:  ["机会窗口变窄了，今天先不冒险"],
      safety_ok:   ["机会窗口很短，但够我吃饱"],
      ecology_low: ["资源变少，套利空间也小了"],
      ecology_ok:  ["多方互不信任，机会窗口变多"],
      threat:      ["先躲一阵，等风头过去"],
      calm:        ["机会窗口开着，多看一眼"],
    },
    representative: { name: "赤尾", quote: "机会窗口很短，但够我吃饱。" }
  },

  // 未来可扩展更多...
  // 例如：犀牛、穿山甲、猎豹、鬣狗、鸵鸟、蜜獾、蛇鹫、羚牛 等
};

// ============================================================
// 三、生态角色
// ============================================================

const ECO_ROLES = {
  apex_predator:    { id: "apex_predator",    label: "顶级捕食者", icon: "claw",  color: "#c0392b", bg: "rgba(192,57,43,0.12)",  desc: "食物链顶端，控制猎物数量，维持生态平衡" },
  mesopredator:     { id: "mesopredator",     label: "中层捕食者", icon: "eye",   color: "#d35400", bg: "rgba(211,84,0,0.12)",   desc: "捕食小型猎物，承上启下，生态弹性关键" },
  herbivore_large:  { id: "herbivore_large",  label: "大型食草动物", icon: "leaf", color: "#27ae60", bg: "rgba(39,174,96,0.12)", desc: "草原园丁——啃食促更新，粪便养土壤，迁徙辟通道" },
  herbivore_small:  { id: "herbivore_small",  label: "小型食草动物", icon: "berry",color: "#2ecc71", bg: "rgba(46,204,113,0.12)", desc: "食物链基础，数量庞大，种群波动迅速传导全生态" },
  scavenger_intel:  { id: "scavenger_intel",  label: "清道夫/情报者", icon: "signal",color: "#8e44ad", bg: "rgba(142,68,173,0.12)",desc: "清理死亡、传播消息、预警风险——免疫系统+通讯网络" },
  water_guardian:   { id: "water_guardian",   label: "水域守护者", icon: "water", color: "#2980b9", bg: "rgba(41,128,185,0.12)", desc: "水源健康直接指标，守护饮水点，水源危机第一报警器" },
  omnivore_engineer:{ id: "omnivore_engineer",label: "杂食/生态工程师", icon: "berry", color: "#9a6b32", bg: "rgba(154,107,50,0.12)", desc: "食性灵活，通过翻土、取食和搬运改变局部环境" },
};

// ============================================================
// 四、关系类型
// ============================================================

const RELATION_TYPES = {
  predator_prey: { id: "predator_prey", label: "捕食",  color: "#c0392b", desc: "捕食者 → 猎物" },
  competition:   { id: "competition",   label: "竞争",  color: "#e67e22", desc: "争夺相同资源" },
  territorial:   { id: "territorial",   label: "领地",  color: "#d35400", desc: "领地重叠引发冲突" },
  intel_share:   { id: "intel_share",   label: "情报",  color: "#8e44ad", desc: "信息共享" },
  water_share:   { id: "water_share",   label: "水源",  color: "#2980b9", desc: "共享饮水点" },
  symbiotic:     { id: "symbiotic",     label: "互利",  color: "#27ae60", desc: "双方受益" },
};

// 物种关系（简化矩阵，按需查询）
const SPECIES_RELATIONS = {
  "lion:zebra":       { type: "predator_prey", strength: 9, desc: "狮群主要猎物" },
  "lion:antelope":    { type: "predator_prey", strength: 8, desc: "狮群常规猎物" },
  "wolf:deer":        { type: "predator_prey", strength: 9, desc: "狼群主要猎物" },
  "wolf:antelope":    { type: "predator_prey", strength: 7, desc: "狼群次要猎物" },
  "wolf:hare":        { type: "predator_prey", strength: 4, desc: "独狼补充食物" },
  "crocodile:zebra":  { type: "predator_prey", strength: 8, desc: "斑马涉水时被伏击" },
  "crocodile:antelope":{ type: "predator_prey", strength: 6, desc: "羚羊浅滩被伏击" },
  "leopard:antelope": { type: "predator_prey", strength: 7, desc: "豹子伏击羚羊" },
  "leopard:hare":     { type: "predator_prey", strength: 5, desc: "补充猎物" },
  "wildDog:antelope": { type: "predator_prey", strength: 8, desc: "耐力追逐羚羊" },
  "eagle:hare":       { type: "predator_prey", strength: 6, desc: "鹰捕食野兔" },
  "mink:flamingo":    { type: "predator_prey", strength: 5, desc: "水貂伏击火烈鸟" },
  "fox:hare":         { type: "predator_prey", strength: 5, desc: "狐狸捕食野兔" },
  "owl:hare":         { type: "predator_prey", strength: 4, desc: "猫头鹰夜间捕兔" },
  "bear:deer":        { type: "predator_prey", strength: 5, desc: "熊偶尔捕鹿" },

  "lion:wolf":        { type: "competition", strength: 5, desc: "草甸边缘争夺猎物" },
  "wolf:leopard":     { type: "competition", strength: 5, desc: "混交林竞争猎物" },
  "deer:antelope":    { type: "competition", strength: 3, desc: "共享草场" },
  "zebra:antelope":   { type: "competition", strength: 4, desc: "草场和水源竞争" },

  "bear:wolf":        { type: "territorial", strength: 6, desc: "洞域与猎场交界紧张" },
  "hippo:crocodile":  { type: "territorial", strength: 8, desc: "河湾激烈竞争" },

  "crow:deer":        { type: "intel_share", strength: 7, desc: "乌鸦发现危险提醒鹿群" },
  "crow:eagle":       { type: "intel_share", strength: 6, desc: "共享高空视野" },
  "crow:giraffe":     { type: "intel_share", strength: 5, desc: "树冠瞭望网" },
  "eagle:vulture":    { type: "intel_share", strength: 8, desc: "发现异常→跟进确认" },

  "elephant:hippo":   { type: "water_share", strength: 7, desc: "大象挖水路，河马守河湾" },
  "elephant:deer":    { type: "water_share", strength: 6, desc: "大象水源被鹿群跟随" },
  "deer:zebra":       { type: "water_share", strength: 6, desc: "饮水点共享警戒" },

  "vulture:lion":     { type: "symbiotic", strength: 6, desc: "秃鹫清理狮群猎物残骸" },
  "vulture:wolf":     { type: "symbiotic", strength: 5, desc: "秃鹫跟随狼群清残骸" },
  "crow:wolf":        { type: "symbiotic", strength: 4, desc: "乌鸦跟狼群，食残骸供情报" },
  "elephant:giraffe": { type: "symbiotic", strength: 5, desc: "大象推树供长颈鹿取食" },
  "boar:deer":        { type: "symbiotic", strength: 3, desc: "野猪翻土助草场更新" },
};

// ============================================================
// 五、查询函数
// ============================================================

function getSpeciesById(id) { return SPECIES_DB[id] || null; }

function getUnlockedSpecies(reserveLevel) {
  return Object.values(SPECIES_DB).filter(sp => sp.unlockLevel <= reserveLevel);
}

const BIRD_SPECIES = new Set(["crow", "eagle", "flamingo", "vulture", "owl"]);
const PREDATOR_SPECIES = new Set(["wolf", "bear", "lion", "leopard", "crocodile", "wildDog", "mink", "fox"]);

function speciesPopulationGroup(speciesId) {
  if (BIRD_SPECIES.has(speciesId)) return "birds";
  if (PREDATOR_SPECIES.has(speciesId)) return "predators";
  return "herbivores";
}

function reconcileSpeciesPopulations(reserve, options = {}) {
  if (!reserve) return reserve;
  const level = Math.max(1, Math.min(5, Math.round(((reserve.progression || {}).level) || 1)));
  const eco = reserve.ecology || (reserve.ecology = {});
  ["predators", "herbivores", "birds"].forEach((group) => {
    if (!eco[group]) eco[group] = {};
  });
  Object.values(SPECIES_DB).forEach((sp) => {
    const group = speciesPopulationGroup(sp.id);
    ["predators", "herbivores", "birds"].forEach((other) => {
      if (other !== group && Object.prototype.hasOwnProperty.call(eco[other], sp.id)) delete eco[other][sp.id];
    });
    if (sp.unlockLevel > level) {
      if (options.removeLocked !== false) delete eco[group][sp.id];
      return;
    }
    const current = eco[group][sp.id];
    if ((!Number.isFinite(current) || current <= 0) && options.initializeUnlocked !== false) {
      eco[group][sp.id] = Math.max(1, Math.min(sp.maxPop, sp.initialPop));
    } else if (Number.isFinite(current)) {
      eco[group][sp.id] = Math.max(0, Math.min(sp.maxPop, Math.round(current)));
    }
  });
  return reserve;
}

function speciesPopulation(reserve, speciesId) {
  const eco = (reserve && reserve.ecology) || {};
  const all = Object.assign({}, eco.predators || {}, eco.herbivores || {}, eco.birds || {});
  return all[speciesId] || 0;
}

function speciesStatus(reserve, speciesId) {
  const sp = SPECIES_DB[speciesId];
  if (!sp) return { status: "未知", trend: "→", desc: "" };
  const pop = speciesPopulation(reserve, speciesId);
  const safety = (reserve && reserve.safety) || 50;
  const poachers = (reserve && reserve.poacherPressure) || 30;
  const eco = (reserve && reserve.ecology) || {};
  const water = eco.water || 60;
  const grass = eco.grass || 60;
  const disease = eco.disease || 10;
  const sens = MACRO_SENSITIVITY[sp.sensitivity] || MACRO_SENSITIVITY.balanced;

  // 综合敏感度计算影响
  const safetyImpact = (50 - safety) * sens.safety / 100;
  const ecologyImpact = ((100 - water) + (100 - grass) + disease) / 3 * sens.ecology / 100;
  const totalImpact = Math.round(safetyImpact + ecologyImpact);

  let status = "稳定", trend = "→", desc = "种群数量稳定，暂无明显异常。";

  if (totalImpact > 18) {
    status = "受威胁"; trend = "↓";
    desc = sens.safety > 0.5 ? "安全压力大，该物种活动范围缩小，部分个体可能离开。" :
           sens.ecology > 0.5 ? "生态恶化，水源或草场不足，种群受到直接影响。" :
           "综合压力较高，种群出现波动。";
  } else if (totalImpact > 10) {
    status = "警惕"; trend = "⚠";
    desc = "环境压力正在积累，该物种表现出谨慎行为。";
  } else if (totalImpact < -5) {
    status = "繁荣"; trend = "↑";
    desc = "环境条件良好，种群有增长趋势。";
  }

  // 特殊情况
  if (poachers > 55 && sens.safety > 0.4) { status = "逃离中"; trend = "↓"; desc = "偷猎高压下，该物种正在减少活动或离开。"; }
  if (water < 45 && ["hippo", "elephant", "flamingo", "mink", "crocodile"].includes(speciesId)) { status = "水源紧张"; trend = "⚠"; desc = "水源下降直接影响该物种的生存。"; }
  if (pop === 0 && sp.unlockLevel <= (reserve.progression && reserve.progression.level || 1)) { status = "消失"; trend = "↓"; desc = "该物种已在保护区消失，需要改善环境才可能回归。"; }

  const actualDelta = reserve && reserve.speciesChanges && Number.isFinite(reserve.speciesChanges[speciesId])
    ? reserve.speciesChanges[speciesId]
    : null;
  if (actualDelta !== null) {
    if (actualDelta > 0) { trend = "↑"; status = "增长"; }
    else if (actualDelta < 0) { trend = "↓"; status = "减少"; }
    else if (trend !== "⚠") { trend = "→"; status = pop > 0 ? "稳定" : status; }
  }

  return { status, trend, desc, population: pop, totalImpact, delta: actualDelta };
}

function speciesImportance(speciesId, reserve) {
  const sp = SPECIES_DB[speciesId];
  if (!sp) return { score: 20, level: "关注", reasons: [] };
  const poachers = (reserve && reserve.poacherPressure) || 0;
  const eco = (reserve && reserve.ecology) || {};
  const water = eco.water || 60;
  const migration = (reserve && reserve.migration) || {};
  let score = sp.tier * 8;
  const reasons = [];
  if (sp.sensitivity === "safety_sensitive" && poachers > 50) { score += 15; reasons.push("偷猎高压下，该安全敏感型物种是保护区边界的'哨兵'"); }
  if (sp.sensitivity === "ecology_sensitive" && water < 50) { score += 15; reasons.push("水源紧张，该生态敏感型物种是水危机的直接反映"); }
  if (sp.sensitivity === "intel_type" && poachers > 50) { score += 12; reasons.push("偷猎高压下，情报型物种是保护区的'眼睛和耳朵'"); }
  if (sp.tier >= 5) { score += 10; reasons.push("顶级物种，其存在标志着生态链完整"); }
  return { score: Math.min(100, score), level: score >= 70 ? "极高" : score >= 50 ? "重要" : score >= 30 ? "关注" : "稳定", reasons };
}

function getSpeciesRelation(fromId, toId) {
  const key = fromId + ":" + toId;
  const revKey = toId + ":" + fromId;
  const rel = SPECIES_RELATIONS[key] || SPECIES_RELATIONS[revKey];
  if (!rel) return { type: "neutral", strength: 1, desc: "暂未观察到明显互动", typeDef: { label: "共存", color: "#7f8c8d" } };
  const typeDef = RELATION_TYPES[rel.type] || { label: "共存", color: "#7f8c8d" };
  return Object.assign({}, rel, { typeDef });
}

function getSpeciesRelations(speciesId) {
  return Object.keys(SPECIES_DB)
    .filter(id => id !== speciesId)
    .map(id => {
      const rel = getSpeciesRelation(speciesId, id);
      const sp = SPECIES_DB[id];
      return Object.assign({}, rel, { targetId: id, targetName: sp ? sp.name : id });
    })
    .sort((a, b) => b.strength - a.strength);
}

function speciesDialogue(speciesId, reserve) {
  const sp = SPECIES_DB[speciesId];
  if (!sp || !sp.dialogues) return "";
  const safety = (reserve && reserve.safety) || 50;
  const eco = (reserve && reserve.ecology) || {};
  const water = eco.water || 60;
  const grass = eco.grass || 60;
  const poachers = (reserve && reserve.poacherPressure) || 30;
  const d = sp.dialogues;
  let pool;
  if (poachers > 55) pool = d.threat;
  else if (safety < 45) pool = d.safety_low;
  else if (water < 48 || grass < 48) pool = d.ecology_low;
  else if (safety > 70 && water > 55 && grass > 55) pool = d.calm;
  else pool = d.safety_ok;
  return (pool && pool.length) ? pool[Math.floor(Math.random() * pool.length)] : "";
}

function foodChainTiers() {
  return [
    { tier: 5, label: "顶级捕食者", color: "#c0392b", desc: "食物链顶端，控制下层数量，维持生态平衡" },
    { tier: 4, label: "高位捕食/大型杂食", color: "#e74c3c", desc: "捕食大型猎物，或以杂食方式占据高位生态位" },
    { tier: 3, label: "中层捕食/机会者", color: "#e67e22", desc: "捕食小型猎物，连接多个生态层级" },
    { tier: 2, label: "大型植食/水域", color: "#27ae60", desc: "大型消费者、生态工程师或水域指示物种" },
    { tier: 1, label: "小型食草/底层", color: "#2ecc71", desc: "数量庞大，生态健康的晴雨表" },
  ];
}

// ============================================================
// 六、章节辅助函数
// ============================================================

function getChapterByLevel(level) {
  return CHAPTERS.find(c => c.level === level) || CHAPTERS[0];
}

function getCurrentChapter(reserve) {
  const level = (reserve && reserve.progression && reserve.progression.level) || 1;
  return getChapterByLevel(level);
}

function getNextChapter(reserve) {
  const level = (reserve && reserve.progression && reserve.progression.level) || 1;
  return CHAPTERS.find(c => c.level > level) || null;
}

function getChapterProgress(reserve) {
  const progression = (reserve && reserve.progression) || {};
  return {
    current: progression.score || 0,
    next: progression.nextScore || 64,
    progress: progression.progress || 0,
    level: progression.level || 1,
    title: progression.title || "临时营地",
  };
}

// ============================================================
// 七、导出
// ============================================================

module.exports = {
  CHAPTERS,
  MACRO_SENSITIVITY,
  SPECIES_DB,
  ECO_ROLES,
  RELATION_TYPES,
  getCurrentChapter,
  getNextChapter,
  getChapterProgress,
  getSpeciesById,
  getUnlockedSpecies,
  speciesPopulationGroup,
  reconcileSpeciesPopulations,
  speciesPopulation,
  speciesStatus,
  speciesImportance,
  getSpeciesRelations,
  speciesDialogue,
  foodChainTiers,
};
