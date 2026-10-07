const { facilityByCaseId, normalizeFacilityConstruction } = require("./reserveFacilities");
const { awardMastery } = require("./guardianCycle");
const { addPendingRecovered } = require("./resourceLedger");
const { localDateKey } = require("./firstReturnHook");
const CASES = [
  { id: "case_1", chapter: 1, title: "水边无人认领的脚印", short: "水边脚印", icon: "trail", color: "#817869", actions: ["houndScout", "antiPoacher", "exploreMaterials"], species: ["鹿", "乌鸦"], intro: "旧巡护员究竟离开了，还是沿着一条危险路线继续走了下去？" },
  { id: "case_2", chapter: 2, title: "消失的水路", short: "消失水路", icon: "water", color: "#78969a", actions: ["habitat", "exploreMaterials", "intervention"], species: ["鹿", "大象", "河马"], intro: "水没有凭空消失。一条被改动的旧水路同时牵动动物与社区。" },
  { id: "case_3", chapter: 3, title: "没有名字的运输线", short: "运输暗线", icon: "signal", color: "#b85f55", actions: ["antiPoacher", "houndScout", "exploreMaterials"], species: ["乌鸦", "狼", "鹰"], intro: "零散脚印、货签和车辙背后，藏着一条跨区运输链。" },
  { id: "case_4", chapter: 4, title: "象群记得的路", short: "象群旧路", icon: "migration", color: "#5f8b6f", actions: ["habitat", "intervention", "houndScout"], species: ["大象", "鹿", "长颈鹿"], intro: "地图已经忘记的迁徙路，仍留在象群和命名朋友的记忆里。" },
  { id: "case_5", chapter: 5, title: "谁拥有这片森林", short: "森林归属", icon: "reserve_prosperity", color: "#98763f", actions: ["intervention", "habitat", "antiPoacher", "houndScout"], species: ["大象", "狮子", "水貂"], intro: "保护区成为旗舰之后，安全、开放与共同守护之间仍需要选择。" },
  { id: "hidden", chapter: 1, title: "森林写给守护者", short: "隐藏档案", icon: "eye", color: "#9c98a6", actions: ["houndScout", "habitat", "exploreMaterials", "intervention"], species: ["鹿", "猎犬"], hidden: true, intro: "有些东西不属于案件，只属于动物记得你的那些时刻。" }
];
const RAW_ITEMS = {
  case_1: [
    ["c1_whistle", "旧巡护员铜哨", "signal", "铜哨内侧刻着已经磨平的巡线编号。"],
    ["c1_roster", "半页值班表", "eye", "被水浸开的值班表缺少最后一班巡护记录。"],
    ["c1_footprint", "水边脚印拓模", "trail", "脚印在河边突然改变方向，像是在躲开什么。"],
    ["c1_cloth", "砾灰咬回的布条", "hound_team", "布条带着旧营地和陌生车厢混在一起的气味。"],
    ["c1_letter", "未寄出的接管信", "eye", "信里写着：如果我没回来，请别让动物以为又被抛下。"],
    ["c1_badge", "烧焦的营地徽章", "reserve_level", "徽章边缘的灼痕来自一次没有写进报告的夜间追踪。"],
    ["c1_map", "标错日期的地图", "nav_sandbox", "日期比失踪报告早一天，只有熟悉旧路线的动物能指出错误。", { trust: 50 }],
    ["c1_lamp", "重新点亮的巡护灯", "reserve_level", "真相被选择如何留下之后，旧巡护灯重新亮在营地门口。", { finale: true }]
  ],
  case_2: [
    ["c2_gauge", "干河床断面拓片", "water", "退水后的断面证明这条河湾不是第一次在旱季突然消失。", { season: "旱季" }],
    ["c2_key", "旧井铁钥匙", "signal", "钥匙对应地图上已经被抹去的旱季旧井。", { season: "旱季" }],
    ["c2_salt", "盐地结晶样本", "berry", "盐地上的齿痕挤在一起，说明动物正在少数水点重叠。", { season: "旱季" }],
    ["c2_seed", "改道河汊漂流种荚", "leaf", "种荚来自新出现的雨季河汊，替改道水流留下了来源。", { season: "雨季" }],
    ["c2_mudline", "雨季河道水文拓片", "migration", "泥线记录了河道一夜之间改变的宽度和方向。", { season: "雨季" }],
    ["c2_pump", "临时水文站铭牌", "habitat", "铭牌编号连接着一次追踪雨季改道的临时水文调查。", { season: "雨季" }],
    ["c2_wellpass", "社区水井借用牌", "fund", "它证明动物与社区曾共享同一口井，而不是彼此驱赶。", { reputation: 50 }],
    ["c2_bottle", "重新流动的蓝色水瓶", "water", "水路重新连通后，瓶中水第一次没有沉淀出灰白盐线。", { finale: true }]
  ],
  case_3: [
    ["c3_boot", "陌生靴印拓模", "trail", "鞋底纹路不属于任何登记过的巡护队。"],
    ["c3_snare", "无编号套索", "claw", "没有编号意味着它从未打算进入合法证物流程。"],
    ["c3_tag", "被撕掉的货签", "sell_goods", "货签只剩一个跨区转运站的缩写。"],
    ["c3_seal", "乌鸦衔回的封蜡", "eye", "封蜡上的纹样与边境车辆上的旧标记一致。"],
    ["c3_tracks", "跨区车辙照片", "eye", "三组照片拼在一起，才看出车辆总在动物迁徙时混入。"],
    ["c3_code", "黑市暗号木牌", "signal", "看似普通的木牌，用刻痕标记没有监控的时段。"],
    ["c3_key", "联合执法密钥", "signal", "只有执法能力足够稳定时，邻区才愿意交出这把密钥。", { enforcement: 45 }],
    ["c3_ledger", "被截断的运输账本", "eye", "账本在你的选择下成为证据链、公开警报或联合行动的起点。", { finale: true }]
  ],
  case_4: [
    ["c4_locator", "磨旧的象群定位牌", "migration", "定位牌最后一次信号停在已经荒废的旧桥旁。"],
    ["c4_calfprint", "幼象第一枚泥印", "trail", "幼象愿意踩进湿泥，说明象群终于不再急着离开。"],
    ["c4_bridge", "河床旧桥钉", "habitat", "桥钉的磨损方向证明巨型动物曾长期通过这里。"],
    ["c4_saltstone", "云耳记得的盐石", "berry", "人类找不到的盐石，被云耳从记忆里重新带回。"],
    ["c4_collar", "失效无线电项圈", "signal", "失效设备没有记录归来，但动物自己的记忆记录了。"],
    ["c4_film", "白鹿晨雾底片", "eye", "底片捕捉到白鹿与象群在同一条旧路上短暂停留。"],
    ["c4_bell", "归来铃牌", "signal", "只有一位真正离开又归来的命名朋友，才会把铃牌带回。", { trust: 55 }],
    ["c4_route", "重新接通的迁徙图", "nav_sandbox", "你没有替动物决定终点，只决定这条路应如何被保护。", { finale: true }]
  ],
  case_5: [
    ["c5_ticket", "四区联合会议票", "signal", "保护区第一次不是被评估，而是被邀请共同制定规则。"],
    ["c5_pact", "社区共生契约", "fund", "契约把迁徙、放牧、巡护和补偿写在同一张纸上。"],
    ["c5_film", "静默监测胶片", "eye", "没有公开坐标的影像，证明保护成果不一定需要曝光。"],
    ["c5_knot", "防护网旧绳结", "claw", "剪下的旧绳结提醒你：边界既能保护，也可能阻断。"],
    ["c5_letter", "反对者来信", "eye", "最尖锐的反对意见，也记录着保护区会影响谁。"],
    ["c5_portrait", "命名动物共同影像", "reserve_prosperity", "画面里的动物不是数量，它们都有被你记住的名字。"],
    ["c5_rings", "五章选择年轮板", "reserve_level", "年轮板只有在足够多的重大选择后，才显出完整纹路。", { choices: 8 }],
    ["c5_archive", "森林共同档案", "reserve_prosperity", "最终档案不回答谁拥有森林，而记录谁愿意长期承担守护。", { finale: true }]
  ],
  hidden: [
    ["h_first_photo", "第一次被认出的照片", "eye", "动物第一次没有逃离镜头，因为它已经认得镜头后的人。", { day: 12 }],
    ["h_hound_tag", "砾灰磨损的项圈牌", "hound_team", "每一道磨痕都来自一条一起跑过的巡护线。", { houndRuns: 8 }],
    ["h_return_letter", "守护者回信", "eye", "你回来之后，动物的来信终于有了一封真正的回信。", { returnLetter: true }],
    ["h_day100", "第100日压花页", "leaf", "第一百日的草叶被压进档案：普通的一天也值得留下。", { day: 100 }],
    ["h_names", "动物名字册", "reserve_prosperity", "名字册写满命名朋友，也写下离开、归来与被记住的一生。", { namedMemories: 8 }]
  ]
};
const COLLECTION_REALITY_BY_ICON = Object.freeze({
  signal: "金属氧化、刻痕深浅与附着物只能帮助判断使用环境和相对先后；单件信号器材不能独立证明持有者身份。",
  eye: "纸张纤维、墨迹洇散和折痕可用于比对受潮、保存与书写顺序；文字内容仍需与现场和其他记录交叉核验。",
  trail: "足迹或车辙的边缘、步距与叠压关系能记录方向和相对时间，但天气、土质与后续踩踏都会改变痕迹。",
  hound_team: "犬类可以区分复杂气味层次，气味会随温度、湿度、风和接触迁移而衰减；循迹结果必须由物证复核。",
  reserve_level: "徽章、铭牌与灯具的磨损、热变色和制造编号可建立来源链，但行政物件本身不等同于事件真相。",
  nav_sandbox: "地图的底图版本、手写修订、日期与地貌变化需要相互校对；旧地图尤其容易把已经失效的路线保存成事实。",
  water: "水色、沉积线与溶解盐只能描述采样时的水文状态；判断长期变化需要连续、同点位的规范记录。",
  signal: "钥匙和密钥可通过齿形、工具痕与登记记录核对用途；能打开某处并不等于持有人拥有合法授权。",
  berry: "盐晶、种子或矿物表面的磨损可反映动物利用和水分变化；采样必须保留原位背景，不能只带走漂亮部分。",
  leaf: "种荚和叶片的成熟度、附着物与传播结构能提示来源及搬运方式，但单个植物样本无法还原整条水路。",
  migration: "定位记录与泥线适合重建一段时间内的移动方向；设备失效、遮挡和个体差异会留下不可补齐的空白。",
  habitat: "桥钉、泵站与河工构件的磨损方向能提示长期受力和水流，但修复前必须判断它是否仍承担生态通道功能。",
  fund: "契约、借用牌和会议票证明人类曾经达成某种安排；是否真正执行，需要从水源、迁徙和社区记录中验证。",
  sell_goods: "货签的纸纤维、胶黏剂和批次缩写能连接运输环节；残缺标签只能成为证据链的一环。",
  claw: "绳套、网结和断裂纤维可用于判断受力方向、材料和布设方式；拆除时应先记录位置，避免破坏执法证据。",
  eye: "影像能保存光线、坐标关系与某个瞬间，曝光、裁切和缺失元数据也会制造误读，不能替代连续观察。",
  reserve_prosperity: "群体影像和档案能确认个体曾经共同出现，却无法说明它们为何留下、后来去了哪里，或是否信任拍摄者。"
});
const COLLECTION_EASTER_EGGS = Object.freeze({
  case_1: [
    "哨口残留的红土不属于旧营地，却与第三章运输线旁的土样相同。",
    "最后一班记录的墨水比其余页面新，像是有人在失踪后补写过时间。",
    "脚印转向前有一枚乌鸦趾痕；黑铃可能比所有人更早看见那辆车。",
    "布条夹层里有一根白色动物毛，暂时无法与保护区登记个体对应。",
    "信纸背面压着旧水路编号，说明写信人离开前仍在追查第二章的水源。",
    "灼痕中检出并非营火常见的机油残留，夜间追踪或许靠近过车辆。",
    "被标错的那一天，在另一张水文表上同样出现了人工改写。",
    "灯座下刻着一串未完成的坐标，只差最后一个方向符号。"
  ],
  case_2: [
    "断面最深处夹着一次更早旱季的灰层，旧水路曾被封过不止一次。",
    "钥匙齿槽里有蓝色漆屑，与临时水文站铭牌的底漆一致。",
    "结晶表面留下幼象乳齿的浅痕，象群可能在官方记录前来过这里。",
    "种荚上缠着人工纤维，水流改道处或许曾有一张未登记的拦网。",
    "泥线中断的位置与旧地图上一段被擦掉的社区水渠重合。",
    "铭牌背面刻着旧巡护员姓名首字母，却没有出现在调查名单。",
    "借用牌的归还栏始终空着，那口井也许从未真正停止共享。",
    "瓶底最后一粒盐晶呈黑色，来源仍指向上游一处未公开设施。"
  ],
  case_3: [
    "靴跟缺口与第一章烧焦徽章旁照片中的脚印形状相同。",
    "套索绳芯混入了保护区工程常用纤维，内部物资可能曾经外流。",
    "货签缩写也出现在第五章一位反对者的来信地址中。",
    "封蜡里压着一枚极小羽印，黑铃并不是第一个碰到它的乌鸦。",
    "第三张照片远处有同一头白犀牛；车辆一直在借迁徙遮掩路线。",
    "木牌背面有旧水井编号，运输者曾利用第二章被遗忘的水路。",
    "密钥生成日期早于联合行动，邻区内部有人提前知道证据链。",
    "账本末页只剩一个名字的偏旁，与旧巡护员接管信的收件人有关。"
  ],
  case_4: [
    "定位牌最后一次故障前，记录到一段与当前象群方向相反的移动。",
    "幼象泥印旁有一枚旧项圈压痕，某个成年个体曾贴近保护它。",
    "桥钉上的象牙擦痕来自较矮个体，旧桥在多年以前就允许幼象通过。",
    "盐石背面有人为削平的面，上一代巡护员可能曾把它当作路标。",
    "项圈缓存里残留一秒钟信号，坐标指向保护区边界之外。",
    "晨雾底片右下角还有一个未登记的人影，没有靠近任何动物。",
    "铃牌内侧刻着第二个名字，归来的朋友或许不是独自离开。",
    "迁徙图最北端故意留白，象群的终点仍不该由保护区替它们命名。"
  ],
  case_5: [
    "会议票背面写着一项未进入议程的提案：季节性撤销人类通行权。",
    "契约页脚保留动物迁徙优先条款，却有一方始终没有盖章。",
    "胶片中同一地点连续三夜出现白犀牛，公开坐标可能带来新的危险。",
    "旧绳结里夹着新生树皮，防护网拆除以后，植物才重新包住边界。",
    "来信者提到一口从未公开的水井，反对可能源自被忽略的真实损失。",
    "共同影像边缘少了一位曾经的命名朋友；离开也属于完整档案。",
    "年轮最内层的纹路与第一章地图坐标吻合，五章并非彼此独立。",
    "档案封底没有所有者签名，只有一句：承担责任不等于拥有。"
  ],
  hidden: [
    "照片背面写着动物第一次没有逃走的距离，而不是拍摄者的名字。",
    "项圈牌最深的磨痕来自一条后来被废弃的巡线，砾灰仍会在梦里朝那边转头。",
    "回信纸角留有一次被雨打湿又晾干的痕迹，它曾被带到保护区边界。",
    "压花页下还夹着一粒没有发芽的种子，普通一天也保存了未发生的未来。",
    "名字册最后留出一整页空白，提醒守护者不要只记录留下的生命。"
  ]
});
const ITEMS = [];
Object.keys(RAW_ITEMS).forEach((caseId) => RAW_ITEMS[caseId].forEach((row, index) => ITEMS.push({
  id: row[0], name: row[1], icon: row[2], story: row[3], condition: row[4] || {}, caseId,
  reality: COLLECTION_REALITY_BY_ICON[row[2]] || "这件物证必须结合发现位置、时间与其他记录解释，不能凭单件物品推断完整事件。",
  easterEgg: ((COLLECTION_EASTER_EGGS[caseId] || [])[index]) || "它与另一段尚未完成的保护区记录存在细微对应。",
  slot: index + 1, rarity: row[4] && row[4].finale ? "案件终章" : index === 6 || caseId === "hidden" ? "珍藏" : "调查物"
})));
const DISCOVERY_SEQUENCES = {
  case_1: ["c1_footprint", "c1_cloth", "c1_roster", "c1_whistle", "c1_badge", "c1_letter", "c1_map", "c1_lamp"],
  case_2: ["c2_gauge", "c2_key", "c2_mudline", "c2_salt", "c2_seed", "c2_pump", "c2_wellpass", "c2_bottle"],
  case_3: ["c3_boot", "c3_snare", "c3_tag", "c3_tracks", "c3_code", "c3_seal", "c3_key", "c3_ledger"],
  case_4: ["c4_locator", "c4_bridge", "c4_collar", "c4_calfprint", "c4_saltstone", "c4_film", "c4_bell", "c4_route"],
  case_5: ["c5_ticket", "c5_pact", "c5_knot", "c5_film", "c5_letter", "c5_portrait", "c5_rings", "c5_archive"],
  hidden: ["h_first_photo", "h_hound_tag", "h_return_letter", "h_day100", "h_names"]
};
const DISCOVERY_ACTIONS = {
  case_1: ["habitat", "houndScout", "houndScout", "habitat", "antiPoacher", "habitat", "intervention"],
  case_2: ["habitat", "houndScout", "habitat", "intervention", "habitat", "houndScout", "intervention"],
  case_3: ["houndScout", "antiPoacher", "houndScout", "antiPoacher", "houndScout", "antiPoacher", "intervention"],
  case_4: ["houndScout", "habitat", "intervention", "habitat", "intervention", "houndScout", "habitat"],
  case_5: ["houndScout", "intervention", "antiPoacher", "houndScout", "intervention", "habitat", "intervention"],
  hidden: ["houndScout", "houndScout", "habitat", "intervention", "habitat"]
};
const DISCOVERY_REGIONS = {
  case_1: ["river", "river", "center", "river", "center", "center", "meadow", "center"],
  case_2: ["river", "river", "river", "meadow", "river", "river", "center", "river"],
  case_3: ["meadow", "center", "center", "meadow", "center", "river", "center", "center"],
  case_4: ["meadow", "river", "center", "river", "meadow", "meadow", "center", "meadow"],
  case_5: ["center", "center", "meadow", "center", "center", "meadow", "center", "center"],
  hidden: ["meadow", "center", "center", "meadow", "center"]
};
const DISCOVERY_ACTION_LABELS = {
  houndScout: "派猎犬循迹",
  antiPoacher: "驱赶并搜查",
  habitat: "修复附近环境",
  intervention: "进行生态勘验",
  exploreMaterials: "跟随动物探索"
};
Object.keys(DISCOVERY_SEQUENCES).forEach((caseId) => {
  DISCOVERY_SEQUENCES[caseId].forEach((id, index) => {
    const item = ITEMS.find((entry) => entry.id === id);
    if (!item) return;
    const isFinale = !!(item.condition || {}).finale;
    item.discoveryOrder = index + 1;
    item.discoveryRole = isFinale ? "finale" : index < 3 ? "evidence" : index < 5 ? "ecology" : "memory";
    item.discoveryAction = isFinale ? "caseEnding" : (DISCOVERY_ACTIONS[caseId] || [])[index] || "houndScout";
    item.discoveryRegion = (DISCOVERY_REGIONS[caseId] || [])[index] || "center";
    item.discoveryActionLabel = isFinale ? "决定案件结局" : (DISCOVERY_ACTION_LABELS[item.discoveryAction] || "继续守护");
  });
});
const METHODS = [
  { id: "animal", name: "动物引路", icon: "eye", cost: "关系修正", description: "由本案最信任你的命名朋友带路；信任55/80提供+1/+2。" },
  { id: "field", name: "现场勘验", icon: "eye", cost: "固定 +2", description: "沿现场痕迹仔细勘验，固定+2，风险最低，但没有动物关系加成。" },
  { id: "risky", name: "冒险追踪", icon: "trail", cost: "可能扩大风险", description: "固定+1；骰面1–2会降低安全并提高偷猎，5–6补全额外解释。" }
];
const MAX_COLLECTION_LEADS = 5;
const NEW_USER_CLUE_GRACE_MS = 5 * 60 * 1000;
const CLUE_COOLDOWN_MS = 30 * 1000;
const ENDINGS = {
  case_1: [
    { id: "publish_truth", name: "公开旧巡护员真相", route: "community", effects: { reputation: 5, fund: 100, poacherPressure: 2 }, flag: "old_warden_public", outcome: "失踪不再被解释为抛弃，社区也开始主动补充旧线索。" },
    { id: "follow_secret", name: "沿暗线继续追查", route: "research", effects: { eye: 2, fund: -100, poacherPressure: -3 }, flag: "old_warden_secret", outcome: "你暂不公开全部真相，把旧巡护线接成一条长期研究暗线。" },
    { id: "seal_old_road", name: "立即封闭旧路线", route: "enforcement", effects: { safety: 5, migrationDelta: -2, reputation: -2 }, flag: "old_road_sealed", outcome: "旧路迅速安静，但部分动物不得不重新选择迁徙方向。" }
  ],
  case_2: [
    { id: "restore_wetland", name: "恢复完整湿地", route: "ecology", effects: { water: 8, grass: 5, fund: -180 }, flag: "wetland_restored", outcome: "水重新分散进湿地，动物不必挤在单一水点。" },
    { id: "share_well", name: "签订共享水井协议", route: "community", effects: { reputation: 6, stability: 4, fund: -220 }, flag: "water_shared", outcome: "动物与社区共同承担旱季成本，也共同维护水源。" },
    { id: "guard_springs", name: "保护分散暗泉", route: "enforcement", effects: { safety: 4, poacherPressure: -4, migrationDelta: -1, fund: -100 }, flag: "springs_guarded", outcome: "水源位置被严格保护，安全上升但迁徙路线更谨慎。" }
  ],
  case_3: [
    { id: "taskforce", name: "移交联合专案组", route: "enforcement", effects: { poacherPressure: -10, enforcement: 6, reputation: -2 }, flag: "transport_taskforce", outcome: "运输线被迅速打断，但部分证据不再由保护区掌握。" },
    { id: "evidence_research", name: "建立长期证据链", route: "research", effects: { eye: 3, poacherPressure: -4, fund: -120 }, flag: "transport_researched", outcome: "即时打击较慢，保护区却掌握了犯罪链的长期规律。" },
    { id: "public_warning", name: "向周边社区公开预警", route: "community", effects: { reputation: 6, fund: 200, poacherPressure: 2 }, flag: "transport_public", outcome: "更多人开始识别暗号，曝光也让运输者短期提高警惕。" }
  ],
  case_4: [
    { id: "free_corridor", name: "恢复自由迁徙走廊", route: "ecology", effects: { migrationDelta: 8, safety: -3, grass: 3 }, flag: "corridor_free", outcome: "象群获得完整路线，保护区接受更开放的边界风险。" },
    { id: "escort_corridor", name: "建立护送式迁徙", route: "enforcement", effects: { fund: -180, safety: 6, migrationDelta: 4 }, flag: "corridor_escorted", outcome: "猎犬与巡护员共同护送关键路段，成本高但更可控。" },
    { id: "silent_tracking", name: "只做静默追踪", route: "research", effects: { eye: 2, migrationDelta: 5, reputation: 2 }, flag: "corridor_silent", outcome: "路线不公开，动物用自己的节奏重新连接旧路。" }
  ],
  case_5: [
    { id: "core_sanctuary", name: "建立绝对核心区", route: "enforcement", effects: { safety: 8, migrationDelta: -3, enforcement: 4 }, flag: "forest_core", outcome: "核心区最安全，也意味着部分通道永久关闭。" },
    { id: "open_network", name: "加入开放保护网络", route: "community", effects: { reputation: 8, migrationDelta: 6, poacherPressure: 3 }, flag: "forest_network", outcome: "知识与迁徙路线更开放，关注和风险同时增加。" },
    { id: "adaptive_commons", name: "采用动态共同治理", route: "ecology", effects: { water: 4, grass: 4, stability: 5, fund: -120 }, flag: "forest_commons", outcome: "规则随季节和动物变化，管理更难，却给生命留下调整空间。" }
  ]
};
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const caseById = (id) => CASES.find((item) => item.id === id) || null;
const collectionItemById = (id) => ITEMS.find((item) => item.id === id) || null;
const itemsForCase = (caseId) => ITEMS.filter((item) => item.caseId === caseId);
const collectionDay = (state) => Math.max(1, Math.round((((((state || {}).world || {}).reserve || {}).guardianCycle || {}).day) || (((state || {}).world || {}).day) || 1));
function emptyCase(id, old = {}) {
  return { id, itemIds: Array.from(new Set(old.itemIds || [])), interpretation: Math.max(0, old.interpretation || 0), ending: old.ending ? Object.assign({}, old.ending) : null };
}
function collectionFacilityStage(found, ending) {
  if (ending || found >= 8) return 3;
  if (found >= 6) return 2;
  if (found >= 3) return 1;
  return 0;
}
function syncCollectionFacility(state, caseId) {
  const facility = facilityByCaseId(caseId);
  const collection = ((state || {}).world || {}).collection || {};
  const caseState = (collection.cases || {})[caseId];
  const reserve = ((state || {}).world || {}).reserve;
  if (!facility || !caseState || !reserve) return null;
  const found = Array.from(new Set(caseState.itemIds || [])).length;
  const stage = collectionFacilityStage(found, caseState.ending);
  const construction = normalizeFacilityConstruction(reserve);
  const site = construction.sites[facility.id];
  const before = site.collectionStage || 0;
  site.collectionStage = Math.max(before, stage);
  if (stage > before) {
    collection.lastWorldChange = {
      day: (((reserve.guardianCycle || {}).day) || state.world.day || 1),
      title: stage === 1 ? `${facility.name}开始清理` : stage === 2 ? `${facility.name}恢复功能` : `${facility.name}完成修复`,
      body: stage === 1 ? "沙盘上的废墟出现施工围挡和清理痕迹。" : stage === 2 ? "设施已经能够改变下一次守护行动。" : "案件结局让设施外观永久改变。",
      facilityId: facility.id,
      stage
    };
  }
  return { facilityId: facility.id, found, stage, changed: stage > before };
}
function normalizeCollectionState(state) {
  if (!state || !state.world) return state;
  const old = state.world.collection || {};
  const modern = old.version === 2 || old.version === 3;
  const legacy = modern
    ? Object.assign({ entries: {}, history: [], count: 0 }, old.legacyArchive || {})
    : { entries: Object.assign({}, old.entries || {}), history: (old.history || []).slice(-80), count: Object.keys(old.entries || {}).length, migratedAtDay: collectionDay(state) };
  const collection = modern ? old : {};
  const cases = {};
  CASES.forEach((item) => { cases[item.id] = emptyCase(item.id, (collection.cases || {})[item.id]); });
  const items = {};
  Object.keys(collection.items || {}).forEach((id) => { if (collectionItemById(id)) items[id] = Object.assign({}, collection.items[id]); });
  Object.keys(items).forEach((id) => {
    const item = collectionItemById(id);
    if (item && !cases[item.caseId].itemIds.includes(id)) cases[item.caseId].itemIds.push(id);
  });
  state.world.collection = {
    version: 3,
    cases,
    leads: (collection.leads || []).filter((lead) => caseById(lead.caseId)).slice(0, MAX_COLLECTION_LEADS).map((lead) => Object.assign({}, lead, {
      animal: Object.assign({}, lead.animal || {}, {
        security: (lead.animal || {}).security == null ? ((lead.animal || {}).trust || 40) : (lead.animal || {}).security,
        wildness: (lead.animal || {}).wildness == null ? 70 : (lead.animal || {}).wildness
      })
    })),
    investigation: Object.assign({
      charges: 1,
      chargeProgress: 0,
      actionsSinceLead: 0,
      nextLeadAt: 2,
      animalLeadAttempts: 0,
      animalLeadSeen: {},
      lastLeadAt: 0,
      failedAttempts: 0,
      pending: null,
      totalInvestigations: 0
    }, collection.investigation || {}),
    items,
    discovery: Object.assign({
      version: 1,
      active: null,
      states: {},
      history: [],
      lastStartedDay: 0,
      lastStartedDateKey: "",
      totalLocated: 0,
      totalArchived: 0
    }, collection.discovery || {}),
    history: (collection.history || []).filter((entry) => !entry.itemId || collectionItemById(entry.itemId)).slice(-120),
    lastDiscovery: collection.lastDiscovery ? Object.assign({}, collection.lastDiscovery) : null,
    lastWorldChange: collection.lastWorldChange ? Object.assign({}, collection.lastWorldChange) : null,
    worldFlags: Object.assign({}, collection.worldFlags || {}),
    legacyArchive: legacy
  };
  const inv = state.world.collection.investigation;
  const discovery = state.world.collection.discovery;
  discovery.states = Object.assign({}, discovery.states || {});
  discovery.history = (discovery.history || []).filter((entry) => collectionItemById(entry.itemId)).slice(-120);
  discovery.lastStartedDay = Math.max(0, Math.round(discovery.lastStartedDay || 0));
  discovery.lastStartedDateKey = /^\d{4}-\d{2}-\d{2}$/.test(discovery.lastStartedDateKey || "") ? discovery.lastStartedDateKey : "";
  discovery.totalLocated = Math.max(0, Math.round(discovery.totalLocated || 0));
  discovery.totalArchived = Math.max(Object.keys(items).length, Math.round(discovery.totalArchived || 0));
  Object.keys(items).forEach((id) => {
    discovery.states[id] = Object.assign({}, discovery.states[id] || {}, { status: "archived", archivedDay: items[id].day || items[id].firstDay || collectionDay(state) });
  });
  if (discovery.active && (!collectionItemById(discovery.active.itemId) || items[discovery.active.itemId])) discovery.active = null;
  if (discovery.active) {
    const item = collectionItemById(discovery.active.itemId);
    const status = ["hinted", "located"].includes(discovery.active.status) ? discovery.active.status : "hinted";
    discovery.active = Object.assign({}, discovery.active, {
      status,
      itemId: item.id,
      caseId: item.caseId,
      actionId: item.discoveryAction,
      actionLabel: item.discoveryActionLabel,
      regionId: item.discoveryRegion
    });
    discovery.states[item.id] = Object.assign({}, discovery.states[item.id] || {}, discovery.active);
  }
  inv.charges = clamp(Math.round(inv.charges), 0, 3);
  inv.chargeProgress = clamp(Math.round(inv.chargeProgress), 0, 1);
  inv.actionsSinceLead = Math.max(0, Math.round(inv.actionsSinceLead || 0));
  inv.nextLeadAt = clamp(Math.round(inv.nextLeadAt || 2), 2, 4);
  CASES.forEach((caseDef) => syncCollectionFacility(state, caseDef.id));
  inv.animalLeadAttempts = Math.max(0, Math.round(inv.animalLeadAttempts || 0));
  inv.animalLeadSeen = Object.assign({}, inv.animalLeadSeen || {});
  inv.lastLeadAt = Math.max(0, Math.round(inv.lastLeadAt || 0));
  const recentSeenKeys = Object.keys(inv.animalLeadSeen).sort((a, b) => (inv.animalLeadSeen[b] || 0) - (inv.animalLeadSeen[a] || 0)).slice(0, 24);
  inv.animalLeadSeen = recentSeenKeys.reduce((result, key) => {
    result[key] = inv.animalLeadSeen[key];
    return result;
  }, {});
  inv.failedAttempts = Math.max(0, Math.round(inv.failedAttempts || 0));
  inv.totalInvestigations = Math.max(0, Math.round(inv.totalInvestigations || 0));
  if (inv.pending) {
    const leadValid = state.world.collection.leads.some((lead) => lead.id === inv.pending.leadId);
    const methodValid = METHODS.some((method) => method.id === inv.pending.methodId);
    if (!leadValid || !methodValid) {
      inv.pending = null;
      inv.charges = clamp(inv.charges + 1, 0, 3);
    } else {
      inv.pending = {
        leadId: inv.pending.leadId,
        methodId: inv.pending.methodId,
        startedDay: Math.max(1, Math.round(inv.pending.startedDay || collectionDay(state))),
        itemId: inv.pending.itemId || ""
      };
    }
  }
  return state;
}
function relationForLead(state, caseDef) {
  const named = ((((state.world || {}).lifeMemory || {}).individuals) || []).filter((animal) => caseDef.species.includes(animal.species) && ["active", "independent"].includes(animal.status)).map((animal) => {
    const security = clamp(animal.security == null ? (animal.bond || 40) : animal.security);
    const wildness = clamp(animal.wildness == null ? 76 : animal.wildness);
    return { animal, security, wildness, quality: Math.round(security * .6 + wildness * .4) };
  }).sort((a, b) => b.quality - a.quality);
  if (named.length) {
    const best = named[0];
    return { id: best.animal.id, name: best.animal.name || best.animal.species, species: best.animal.species, trust: best.quality, security: best.security, wildness: best.wildness };
  }
  const animals = ((state.world || {}).knownCharacters || []).filter((animal) => caseDef.species.includes(animal.species));
  const best = animals.sort((a, b) => (((b.relation || {}).trust) || 0) - (((a.relation || {}).trust) || 0))[0] || null;
  return best ? { id: best.id, name: best.shortName || best.name || best.species, species: best.species, trust: clamp((best.relation || {}).trust), security: clamp((best.relation || {}).trust), wildness: 70 } : { id: "forest", name: "附近动物", species: "动物", trust: 40, security: 40, wildness: 70 };
}
function itemEligible(item, state) {
  const condition = item.condition || {};
  const world = state.world || {};
  const reserve = world.reserve || {};
  const memory = world.lifeMemory || {};
  const namedQualities = ((((world.lifeMemory || {}).individuals) || []).map((animal) => {
    const security = clamp(animal.security == null ? (animal.bond || 40) : animal.security);
    const wildness = clamp(animal.wildness == null ? 76 : animal.wildness);
    return Math.round(security * .6 + wildness * .4);
  }));
  const maxTrust = Math.max(0, ...namedQualities, ...((world.knownCharacters || []).map((animal) => ((animal.relation || {}).trust) || 0)));
  if (condition.trust && maxTrust < condition.trust) return false;
  if (condition.reputation && (reserve.reputation || 0) < condition.reputation) return false;
  if (condition.enforcement && (reserve.enforcement || 0) < condition.enforcement) return false;
  if (condition.choices && (((reserve.strategy || {}).totalChoices) || 0) < condition.choices) return false;
  if (condition.day && collectionDay(state) < condition.day) return false;
  if (condition.houndRuns && (((reserve.houndTeam || {}).totalRuns) || 0) < condition.houndRuns) return false;
  if (condition.returnLetter && !((memory.guardianLetters || []).length || (memory.memories || []).some((entry) => entry.type === "return"))) return false;
  if (condition.namedMemories && (memory.memories || []).length < condition.namedMemories) return false;
  if (condition.season && world.season !== condition.season && ((reserve.seasonState || {}).name) !== condition.season) return false;
  return !condition.finale;
}
function collectionDiscoveryActivation(item, state) {
  if (!item) return { active: false, storyReady: false, metricReady: false, conditionReady: false, statusText: "没有待激活发现" };
  const reserve = (((state || {}).world || {}).reserve) || {};
  const eco = reserve.ecology || {};
  const level = clamp(((reserve.progression || {}).level) || 1, 1, 7);
  const chain = reserve.eventChain || {};
  const requiredStep = Math.min(7, Math.max(1, item.discoveryOrder || 1));
  const chainChapter = Math.max(1, Math.round(chain.chapterLevel || level));
  const displayChapter = Math.max(1, Math.round(Number((reserve.progression || {}).displayChapter || (reserve.progression || {}).stage || 0)));
  const caseDef = caseById(item.caseId);
  const caseChapter = caseDef ? Number(caseDef.chapter) || 1 : 1;
  const progressChapter = Math.max(level, chainChapter, displayChapter);
  const storyStep = chainChapter === caseChapter
    ? Math.max(0, Math.round(chain.step || 0))
    : progressChapter > caseChapter ? 7 : 0;
  const storyReady = !!caseDef && (caseDef.hidden || progressChapter > caseChapter || (level === caseChapter && chainChapter === caseChapter && storyStep >= requiredStep));
  const gates = {
    habitat: [{ label: "水源", value: eco.water, target: 52 }, { label: "草场", value: eco.grass, target: 40 }],
    houndScout: [{ label: "安全", value: reserve.safety, target: 50 }],
    antiPoacher: [{ label: "偷猎压力", value: reserve.poacherPressure, target: 50, inverse: true }, { label: "执法", value: reserve.enforcement, target: 45 }],
    intervention: [{ label: "草场", value: eco.grass, target: 40 }, { label: "疾病", value: eco.disease, target: 36, inverse: true }]
  };
  const checks = gates[item.discoveryAction] || [{ label: "安全", value: reserve.safety, target: 50 }];
  const metricReady = checks.every((gate) => gate.inverse ? Number(gate.value) <= gate.target : Number(gate.value) >= gate.target);
  const metricText = checks.map((gate) => `${gate.label}${Math.round(Number(gate.value) || 0)}/${gate.inverse ? "≤" : "≥"}${gate.target}`).join(" · ");
  const conditionReady = itemEligible(item, state);
  const sequence = DISCOVERY_SEQUENCES[item.caseId] || [];
  const itemIndex = sequence.indexOf(item.id);
  const owned = ((((state || {}).world || {}).collection || {}).items) || {};
  const orderReady = itemIndex <= 0 || sequence.slice(0, itemIndex).every((id) => owned[id]);
  const orderText = orderReady ? "前置发现已收录" : `先收录本案第${itemIndex}件发现`;
  let conditionText = "附加条件已满足";
  const condition = item.condition || {};
  if (!conditionReady) {
    if (condition.season) conditionText = `等待${condition.season}`;
    else if (condition.trust) conditionText = `动物关系需达到${condition.trust}`;
    else if (condition.enforcement) conditionText = `执法需达到${condition.enforcement}`;
    else if (condition.reputation) conditionText = `声望需达到${condition.reputation}`;
    else if (condition.choices) conditionText = `需完成${condition.choices}次策略选择`;
    else conditionText = "特殊剧情条件尚未满足";
  }
  const storyText = storyReady ? `第${caseDef ? caseDef.chapter : 1}章剧情 ${Math.min(storyStep, requiredStep)}/${requiredStep}` : `推进第${caseDef ? caseDef.chapter : 1}章剧情至 ${requiredStep}/7`;
  const active = storyReady && orderReady && metricReady && conditionReady;
  return { active, storyReady, orderReady, metricReady, conditionReady, requiredStep, storyStep, storyText, orderText, metricText, conditionText, statusText: !storyReady ? storyText : !orderReady ? orderText : !metricReady ? metricText : !conditionReady ? conditionText : "剧情与保护区数值已激活" };
}
function incompleteItems(caseId, state, includeRare = true) {
  const owned = state.world.collection.items;
  return itemsForCase(caseId).filter((item) => !item.condition.finale && !owned[item.id] && (includeRare || item.slot <= 6) && itemEligible(item, state));
}
function caseAccessible(caseDef, state) {
  const level = clamp((((state.world.reserve || {}).progression || {}).level) || 1, 1, 5);
  if (!caseDef.hidden) return caseDef.chapter <= level && incompleteItems(caseDef.id, state).length > 0;
  return incompleteItems(caseDef.id, state).length > 0;
}
function meaningfulCount(state) {
  const reserve = ((state || {}).world || {}).reserve || {};
  return Math.max((((reserve.strategy || {}).totalMeaningfulActions) || 0), (((reserve.progression || {}).totalMeaningfulActions) || 0));
}
function discoveryStatusLabel(status) {
  return ({ hidden: "未察觉", hinted: "有迹可循", located: "现场发现", archived: "已收录" })[status] || "未察觉";
}
function nextStoryCandidate(state, preferredCaseId = null, animal = null) {
  const collection = state.world.collection;
  const level = clamp(((((state.world.reserve || {}).progression || {}).level) || 1), 1, 5);
  let caseDefs = CASES.filter((entry) => !entry.hidden && entry.chapter <= level);
  if (preferredCaseId) caseDefs = caseDefs.sort((a, b) => (a.id === preferredCaseId ? -1 : b.id === preferredCaseId ? 1 : 0) || b.chapter - a.chapter);
  else if (animal && animal.species) caseDefs = caseDefs.sort((a, b) =>
    (b.chapter - a.chapter)
    || ((b.species.includes(animal.species) ? 1 : 0) - (a.species.includes(animal.species) ? 1 : 0)));
  else caseDefs.sort((a, b) => b.chapter - a.chapter);
  for (let i = 0; i < caseDefs.length; i += 1) {
    const caseDef = caseDefs[i];
    const sequence = DISCOVERY_SEQUENCES[caseDef.id] || [];
    const item = sequence.map(collectionItemById).find((candidate) => candidate
      && !(candidate.condition || {}).finale
      && !collection.items[candidate.id]
      && !["hinted", "located", "archived"].includes(((collection.discovery.states || {})[candidate.id] || {}).status));
    if (item) return item;
  }
  return null;
}
function storyAnimalSnapshot(state, item, animal = null) {
  const related = relationForLead(state, caseById(item.caseId));
  if (!animal) return related;
  const trust = clamp((((animal.relation || {}).trust) == null ? related.trust : (animal.relation || {}).trust));
  return {
    id: animal.id || related.id,
    name: animal.shortName || animal.name || animal.species || related.name,
    species: animal.species || related.species,
    trust,
    security: clamp(animal.security == null ? trust : animal.security),
    wildness: clamp(animal.wildness == null ? related.wildness : animal.wildness)
  };
}
function beginStoryDiscovery(state, animal, context = {}, random = Math.random) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const story = collection.discovery;
  if (story.active) return { state, discovery: story.active, created: false, reason: story.active.status === "located" ? "现场已经有一件物品等待收录" : "先完成当前发现" };
  const day = collectionDay(state);
  const today = localDateKey(Date.now());
  if (!context.guaranteed && story.lastStartedDateKey === today) return { state, discovery: null, created: false, reason: "今天已经开启过一次剧情发现" };
  const candidate = nextStoryCandidate(state, context.caseId || null, animal);
  const activation = collectionDiscoveryActivation(candidate, state);
  const item = activation.active ? candidate : null;
  if (!item) return { state, discovery: null, created: false, activation, candidate, reason: candidate ? activation.statusText : "当前章节的发现已经完成" };
  const caseDef = caseById(item.caseId);
  const sourceAnimal = storyAnimalSnapshot(state, item, animal);
  const precision = sourceAnimal.trust >= 80 ? "它直接把你带到痕迹附近" : sourceAnimal.trust >= 55 ? "它指出了较清楚的方向" : "它只肯在远处反复回望";
  const record = {
    id: `story_${day}_${item.id}`,
    itemId: item.id,
    caseId: item.caseId,
    status: "hinted",
    startedDay: day,
    updatedDay: day,
    actionId: item.discoveryAction,
    actionLabel: item.discoveryActionLabel,
    regionId: item.discoveryRegion,
    animal: sourceAnimal,
    title: `${sourceAnimal.name}发现异常`,
    clue: `${precision}。${caseDef.intro}`,
    sourceAction: context.trigger === "care" ? "animalCare" : "animalListen",
    sourceLabel: `${sourceAnimal.name}${context.trigger === "care" ? "安抚后引路" : "提供线索"}`
  };
  story.active = record;
  story.states[item.id] = Object.assign({}, record);
  story.lastStartedDay = day;
  story.lastStartedDateKey = today;
  story.history.push({ type: "hinted", itemId: item.id, caseId: item.caseId, day, animal: sourceAnimal.name });
  collection.history.push({ type: "story_hint", itemId: item.id, caseId: item.caseId, day, title: record.title });
  return { state, discovery: record, created: true, item, caseDef };
}
function advanceStoryDiscovery(state, context = {}) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const story = collection.discovery;
  const active = story.active;
  if (!active || active.status !== "hinted") return { state, discovery: active || null, advanced: false };
  if (context.actionId !== active.actionId) return { state, discovery: active, advanced: false, expectedAction: active.actionId };
  const item = collectionItemById(active.itemId);
  if (!item) { story.active = null; return { state, discovery: null, advanced: false }; }
  const day = collectionDay(state);
  active.status = "located";
  active.updatedDay = day;
  active.locatedDay = day;
  active.locationText = `${((active.animal || {}).name) || "动物"}的提示与“${context.actionLabel || active.actionLabel}”在${({ river: "河岸", meadow: "草场", center: "营地附近" })[active.regionId] || "保护区"}交汇。`;
  story.states[item.id] = Object.assign({}, active);
  story.totalLocated += 1;
  story.history.push({ type: "located", itemId: item.id, caseId: item.caseId, day, actionId: context.actionId });
  collection.history.push({ type: "story_located", itemId: item.id, caseId: item.caseId, day, title: `现场发现：${item.name}` });
  return { state, discovery: active, advanced: true, item };
}
function collectStoryDiscovery(state, itemId = null) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const story = collection.discovery;
  const active = story.active;
  if (!active || active.status !== "located" || (itemId && active.itemId !== itemId)) return { ok: false, error: "现场还没有可收录的剧情物件", state };
  const item = collectionItemById(active.itemId);
  if (!item) { story.active = null; return { ok: false, error: "物件已经失效", state }; }
  const day = collectionDay(state);
  const lead = {
    sourceAction: active.sourceAction,
    sourceLabel: active.sourceLabel,
    animal: active.animal
  };
  const entry = recordItem(state, item, lead, { id: "story", name: "剧情发现" }, 0, 0, false);
  entry.discovery = {
    where: active.locationText || active.regionId,
    who: (active.animal || {}).name || "附近动物",
    when: `第${day}日`,
    action: active.actionLabel,
    role: item.discoveryRole
  };
  story.states[item.id] = Object.assign({}, active, { status: "archived", archivedDay: day, entry: entry.discovery });
  story.history.push({ type: "archived", itemId: item.id, caseId: item.caseId, day, animal: entry.discovery.who });
  story.totalArchived += 1;
  story.active = null;
  const reserve = state.world.reserve || {};
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    totalMeaningfulActions: Math.max(0, Number((reserve.progression || {}).totalMeaningfulActions) || 0) + 1
  });
  reserve.strategy = Object.assign({}, reserve.strategy || {}, {
    totalMeaningfulActions: Math.max(0, Number((reserve.strategy || {}).totalMeaningfulActions) || 0) + 1
  });
  reserve.storyDiscoveries = Object.assign({}, reserve.storyDiscoveries || {});
  reserve.storyDiscoveries[item.caseId] = Object.assign({ evidence: 0, ecology: 0, memory: 0, total: 0 }, reserve.storyDiscoveries[item.caseId] || {});
  const caseProgress = reserve.storyDiscoveries[item.caseId];
  caseProgress[item.discoveryRole] = (caseProgress[item.discoveryRole] || 0) + 1;
  caseProgress.total = (caseProgress.total || 0) + 1;
  const impactByRole = {
    evidence: { key: "enforcement", label: "执法", delta: 1 },
    ecology: { key: "stability", label: "稳定", delta: 1 },
    memory: { key: "reputation", label: "声望", delta: 1 }
  };
  const impact = impactByRole[item.discoveryRole] || null;
  let reserveImpact = null;
  if (impact) {
    const before = clamp(reserve[impact.key] || 0);
    const after = clamp(before + impact.delta);
    reserve[impact.key] = after;
    reserveImpact = { key: impact.key, label: impact.label, before, after, delta: after - before, summary: `${impact.label} ${before}→${after}` };
    entry.reserveImpact = reserveImpact;
  }
  const endingReady = !caseById(item.caseId).hidden
    && collection.cases[item.caseId].itemIds.filter((id) => !(collectionItemById(id).condition || {}).finale).length >= 7
    && !collection.cases[item.caseId].ending;
  return { ok: true, state, item, entry, endingReady, reserveImpact, facilityMilestone: entry.facilityMilestone || null };
}
function storyDiscoverySummary(state) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const active = collection.discovery.active;
  const item = active ? collectionItemById(active.itemId) : null;
  return {
    active: active ? Object.assign({}, active, { statusLabel: discoveryStatusLabel(active.status), item }) : null,
    totalLocated: collection.discovery.totalLocated || 0,
    totalArchived: collection.discovery.totalArchived || 0,
    states: collection.discovery.states
  };
}
function updateCollectionAfterAction(beforeState, afterState, context = {}, random = Math.random) {
  normalizeCollectionState(beforeState);
  normalizeCollectionState(afterState);
  const beforeCount = meaningfulCount(beforeState);
  const afterCount = meaningfulCount(afterState);
  const delta = Math.max(0, afterCount - beforeCount);
  const collection = afterState.world.collection;
  const inv = collection.investigation;
  let chargeGained = 0;
  if (delta > 0) {
    inv.chargeProgress += delta;
    while (inv.chargeProgress >= 2) {
      inv.chargeProgress -= 2;
      if (inv.charges < 3) { inv.charges += 1; chargeGained += 1; }
      else inv.chargeProgress = 0;
    }
    inv.actionsSinceLead += delta;
  }
  const storyUpdate = advanceStoryDiscovery(afterState, context);
  return { state: afterState, lead: null, chargeGained, discovery: storyUpdate.discovery, discoveryAdvanced: storyUpdate.advanced, discoveryItem: storyUpdate.item || null };
}
function offerAnimalCollectionLead(state, animal, context = {}, random = Math.random) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const inv = collection.investigation;
  if (!animal || !animal.id) {
    return { state, lead: null, discovery: null, attempted: false, reason: "动物无效" };
  }
  const day = collectionDay(state);
  const sourceMode = context.trigger === "care" ? "care" : "listen";
  const now = Date.now();
  const today = localDateKey(now);
  const seenKey = `${today}:${animal.id}:${sourceMode}`;
  const leads = collection.leads || [];
  const focus = ((state.ui || {}).firstSessionFocus) || {};
  const focusAge = Math.max(0, now - Math.max(0, Number(focus.startedAt) || 0));
  const isNewUserWindow = !focus.startedAt || focusAge < NEW_USER_CLUE_GRACE_MS;
  if (leads.length >= MAX_COLLECTION_LEADS) {
    return { state, lead: null, attempted: false, reason: "线索已经有点多了，先处理当前这几条" };
  }
  if (!isNewUserWindow && inv.lastLeadAt && now - inv.lastLeadAt < CLUE_COOLDOWN_MS) {
    return { state, lead: null, attempted: false, reason: "线索出现得太快，先缓一缓" };
  }
  if (inv.animalLeadSeen[seenKey]) {
    return { state, lead: null, attempted: false, reason: sourceMode === "care" ? "今天已经安抚过" : "今天已经倾听" };
  }
  inv.animalLeadSeen[seenKey] = now;
  inv.animalLeadAttempts += 1;
  const storyResult = beginStoryDiscovery(state, animal, Object.assign({}, context, { trigger: sourceMode }), random);
  const discovery = storyResult.discovery;
  const lead = storyResult.created ? Object.assign({}, discovery, {
    id: discovery.id,
    quality: ((discovery.animal || {}).trust || 0) >= 80 ? 2 : ((discovery.animal || {}).trust || 0) >= 55 ? 1 : 0,
    title: discovery.title,
    clue: discovery.clue
  }) : null;
  if (storyResult.created) {
    const currentInv = state.world.collection.investigation;
    currentInv.animalLeadAttempts = 0;
    currentInv.actionsSinceLead = 0;
    currentInv.nextLeadAt = 2;
    currentInv.lastLeadAt = now;
  } else if (storyResult.activation && !storyResult.activation.active && storyResult.candidate) {
    const diceLead = ensureCollectionDiceLead(state, animal);
    if (diceLead) {
      return {
        state,
        lead: diceLead,
        discovery: null,
        attempted: true,
        chance: 1,
        guaranteed: false,
        reason: "数值未达门槛时，改为点数调查"
      };
    }
  }
  return {
    state,
    lead,
    discovery,
    attempted: true,
    chance: storyResult.created ? 1 : 0,
    guaranteed: storyResult.created,
    reason: storyResult.created ? (sourceMode === "care" ? "安抚后，动物带你发现一处异常" : "动物提醒你留意一处异常") : storyResult.reason
  };
}
function startInvestigation(state, leadId, methodId) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const inv = collection.investigation;
  const lead = collection.leads.find((entry) => entry.id === leadId);
  const method = METHODS.find((entry) => entry.id === methodId);
  if (!lead || !method) return { ok: false, error: "线索或调查方法无效", state };
  if (inv.pending) return { ok: false, error: "已有调查等待完成", state };
  if (inv.charges < 1) return { ok: false, error: "调查机会不足", state };
  inv.charges -= 1;
  inv.pending = { leadId, methodId, startedDay: collectionDay(state), itemId: lead.itemId || "" };
  return { ok: true, state, pending: inv.pending };
}
function methodModifiers(state, lead, method) {
  const animal = lead.animal || {};
  const security = clamp(animal.security == null ? (animal.trust || 0) : animal.security);
  const wildness = clamp(animal.wildness == null ? 70 : animal.wildness);
  return {
    method: method.id === "field" ? 2 : method.id === "risky" ? 1 : 0,
    relation: method.id === "animal" ? (security >= 80 && wildness >= 65 ? 2 : security >= 55 && wildness >= 55 ? 1 : 0) : 0
  };
}
function recordItem(state, item, lead, method, roll, total, extraInterpretation = false) {
  const collection = state.world.collection;
  const day = collectionDay(state);
  const entry = { id: item.id, itemId: item.id, firstDay: day, day, sourceAction: lead.sourceAction, sourceLabel: lead.sourceLabel, method: method.id, methodName: method.name, dice: roll, total, animal: lead.animal, story: item.story, extraInterpretation };
  collection.items[item.id] = entry;
  if (!collection.cases[item.caseId].itemIds.includes(item.id)) collection.cases[item.caseId].itemIds.push(item.id);
  if (extraInterpretation) collection.cases[item.caseId].interpretation += 1;
  collection.history.push(Object.assign({ type: "item", caseId: item.caseId }, entry));
  collection.lastDiscovery = { itemId: item.id, name: item.name, caseId: item.caseId, day, icon: item.icon };
  const facilityMilestone = syncCollectionFacility(state, item.caseId);
  if (facilityMilestone && facilityMilestone.changed) entry.facilityMilestone = facilityMilestone;
  return entry;
}
function resolveInvestigation(state, forcedRoll = null, random = Math.random) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const inv = collection.investigation;
  const pending = inv.pending;
  if (!pending) return { ok: false, error: "没有待完成调查", state };
  const lead = collection.leads.find((entry) => entry.id === pending.leadId);
  const method = METHODS.find((entry) => entry.id === pending.methodId);
  if (!lead || !method) { inv.pending = null; return { ok: false, error: "调查状态已失效", state }; }
  const roll = forcedRoll == null ? Math.floor(clamp(random(), 0, .999999) * 6) + 1 : clamp(Math.round(forcedRoll), 1, 6);
  const modifiers = methodModifiers(state, lead, method);
  const total = roll + (lead.quality || 0) + modifiers.method + modifiers.relation;
  const guaranteed = inv.failedAttempts >= 3;
  const reserve = state.world.reserve || {};
  const riskChanges = {};
  if (method.id === "risky" && roll <= 2) {
    const beforeSafety = reserve.safety || 0;
    const beforePoacher = reserve.poacherPressure || 0;
    reserve.safety = clamp(beforeSafety - 2);
    reserve.poacherPressure = clamp(beforePoacher + 2);
    riskChanges.safety = reserve.safety - beforeSafety;
    riskChanges.poacherPressure = reserve.poacherPressure - beforePoacher;
  }
  const eligibilityState = lead.season ? Object.assign({}, state, {
    world: Object.assign({}, state.world, {
      season: lead.season,
      reserve: Object.assign({}, state.world.reserve || {}, {
        seasonState: Object.assign({}, (state.world.reserve || {}).seasonState || {}, { name: lead.season })
      })
    })
  }) : state;
  const normal = incompleteItems(lead.caseId, eligibilityState, false);
  const rare = incompleteItems(lead.caseId, eligibilityState, true).filter((item) => item.slot === 7);
  const pinned = collectionItemById(pending.itemId || lead.itemId);
  let item = null;
  if (guaranteed || total >= 5) {
    if (pinned && !state.world.collection.items[pinned.id] && itemEligible(pinned, eligibilityState)) item = pinned;
    else if (total >= 6 && rare.length) item = rare[0];
    else if (normal.length) item = normal[Math.floor(clamp(random(), 0, .999999) * normal.length)];
    else if (rare.length) item = rare[0];
  }
  inv.pending = null;
  inv.totalInvestigations += 1;
  if (!item) {
    inv.failedAttempts += 1;
    collection.history.push({ type: "note", day: collectionDay(state), caseId: lead.caseId, leadId: lead.id, roll, total, methodId: method.id });
    return { ok: true, success: false, state, lead, roll, total, modifiers, guaranteed, riskChanges, note: "线索还没有指向具体物件，调查笔记已保存；原线索仍可继续追查。" };
  }
  const extraInterpretation = method.id === "risky" && roll >= 5;
  const entry = recordItem(state, item, lead, method, roll, total, extraInterpretation);
  collection.leads = collection.leads.filter((row) => row.id !== lead.id);
  inv.failedAttempts = 0;
  const caseState = collection.cases[item.caseId];
  const endingReady = !caseById(item.caseId).hidden && caseState.itemIds.filter((id) => !(collectionItemById(id).condition || {}).finale).length >= 7 && !caseState.ending;
  if (item.caseId === "hidden" && caseState.itemIds.length >= 5) collection.worldFlags.forest_remembers = true;
  return { ok: true, success: true, state, lead, item, entry, roll, total, modifiers, guaranteed, riskChanges, extraInterpretation, endingReady };
}
function applyEffect(reserve, key, amount) {
  if (key === "eye") {
    return { key: "record", before: 0, after: 0, delta: 0, note: "调查记录已归档" };
  }
  if (key === "fund") {
    if (amount > 0) {
      const before = reserve.pendingRecovered.researchSample || 0;
      const gain = Math.max(1, Math.ceil(amount / 100));
      const accepted = addPendingRecovered(reserve, "researchSample", gain);
      return { key: "researchSample", before, after: before + accepted, delta: accepted, note: "待收研究样本" };
    }
    reserve.supplies = Object.assign({}, reserve.supplies || {});
    const before = Object.keys(reserve.supplies).reduce((sum, id) => sum + (reserve.supplies[id] || 0), 0);
    let units = Math.max(1, Math.min(2, Math.ceil(Math.abs(amount) / 100)));
    ["dogFood", "alarm", "fieldKit", "medicalKit", "tranquilizer"].sort((a, b) => (reserve.supplies[b] || 0) - (reserve.supplies[a] || 0)).forEach((id) => {
      if (units <= 0) return;
      const used = Math.min(units, reserve.supplies[id] || 0);
      reserve.supplies[id] = Math.max(0, (reserve.supplies[id] || 0) - used);
      units -= used;
    });
    if (units > 0) {
      reserve.ecology = reserve.ecology || {};
      reserve.ecology.grass = clamp((reserve.ecology.grass || 0) - units);
    }
    const after = Object.keys(reserve.supplies).reduce((sum, id) => sum + (reserve.supplies[id] || 0), 0);
    return { key: "supplies", before, after, delta: after - before, note: "巡护补给投入" };
  }
  const before = key === "water" || key === "grass" ? ((reserve.ecology || {})[key] || 0) : key === "migrationDelta" ? ((reserve.migration || {}).delta || 0) : (reserve[key] || 0);
  const after = clamp(before + amount);
  if (key === "water" || key === "grass") { reserve.ecology = reserve.ecology || {}; reserve.ecology[key] = after; }
  else if (key === "migrationDelta") { reserve.migration = reserve.migration || {}; reserve.migration.delta = after; }
  else reserve[key] = after;
  return { key, before, after, delta: after - before };
}
function submitCaseEnding(state, caseId, choiceId) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const caseDef = caseById(caseId);
  const caseState = collection.cases[caseId];
  const choice = (ENDINGS[caseId] || []).find((entry) => entry.id === choiceId);
  if (!caseDef || caseDef.hidden || !choice || caseState.ending) return { ok: false, error: "案件结局无效", state };
  const found = caseState.itemIds.filter((id) => !(collectionItemById(id).condition || {}).finale).length;
  if (found < 7) return { ok: false, error: "尚未集齐前7件调查物", state };
  const reserve = state.world.reserve || {};
  const changes = Object.keys(choice.effects).map((key) => applyEffect(reserve, key, choice.effects[key]));
  reserve.strategy = reserve.strategy || { routeScores: {} };
  reserve.strategy.routeScores = Object.assign({}, reserve.strategy.routeScores || {});
  reserve.strategy.routeScores[choice.route] = clamp((reserve.strategy.routeScores[choice.route] || 0) + 4, 0, 30);
  collection.worldFlags[choice.flag] = true;
  const day = collectionDay(state);
  collection.lastWorldChange = { day, title: choice.name, body: choice.outcome, flag: choice.flag };
  state.world.rumors = [{ id: `collection_${choice.flag}`, day, title: `案件结局：${choice.name}`, body: choice.outcome }].concat(state.world.rumors || []).slice(0, 8);
  reserve.eventChain = Object.assign({}, reserve.eventChain || {}, { lastResult: choice.outcome });
  caseState.ending = { choiceId, name: choice.name, route: choice.route, day, outcome: choice.outcome, flag: choice.flag };
  const finale = itemsForCase(caseId).find((item) => item.condition.finale);
  const lead = { sourceAction: "caseEnding", sourceLabel: choice.name, animal: relationForLead(state, caseDef) };
  const itemEntry = recordItem(state, finale, lead, { id: "ending", name: "案件结局" }, 0, 0, true);
  const masteryGain = awardMastery(reserve, "relationship", 60, "重要剧情");
  const animal = (state.world.knownCharacters || []).find((entry) => entry.id === (lead.animal || {}).id);
  if (animal) {
    animal.relation = Object.assign({}, animal.relation || {}, { trust: clamp(((animal.relation || {}).trust || 0) + 2) });
    animal.memory = (animal.memory || []).concat(`第${day}日：你在“${caseDef.title}”中选择了${choice.name}。`).slice(-5);
    animal.publicState = `仍在观察“${choice.name}”带来的长期变化`;
  }
  const named = (((state.world.lifeMemory || {}).individuals) || []).find((entry) => entry.id === (lead.animal || {}).id);
  if (named) {
    named.security = clamp((named.security == null ? (named.bond || 40) : named.security) + 2);
    named.wildness = clamp((named.wildness == null ? 76 : named.wildness) + 1);
    named.bond = named.security;
    lead.animal.security = named.security;
    lead.animal.wildness = named.wildness;
    lead.animal.trust = Math.round(named.security * .6 + named.wildness * .4);
  }
  return { ok: true, state, caseDef, choice, finale, itemEntry, changes, routeDelta: 4, animal: lead.animal, masteryGain };
}
function collectionProgressChapter(state) {
  const reserve = (((state || {}).world || {}).reserve) || {};
  const level = clamp(((reserve.progression || {}).level) || 1, 1, 7);
  const chain = reserve.eventChain || {};
  const chainChapter = Math.max(1, Math.round(chain.chapterLevel || level));
  const displayChapter = Math.max(1, Math.round(Number((reserve.progression || {}).displayChapter || (reserve.progression || {}).stage || 0)));
  return Math.max(level, chainChapter, displayChapter);
}
function nextCollectionDiceItem(state) {
  normalizeCollectionState(state);
  const owned = state.world.collection.items;
  const progressChapter = collectionProgressChapter(state);
  const cases = CASES.filter((entry) => !entry.hidden && entry.chapter <= Math.max(1, Math.min(5, progressChapter)))
    .slice()
    .sort((a, b) => b.chapter - a.chapter);
  for (let i = 0; i < cases.length; i += 1) {
    const caseDef = cases[i];
    const sequence = DISCOVERY_SEQUENCES[caseDef.id] || [];
    const nextId = sequence.find((id) => {
      const item = collectionItemById(id);
      return item && !(item.condition || {}).finale && !owned[id];
    });
    if (!nextId) continue;
    const item = collectionItemById(nextId);
    const activation = collectionDiscoveryActivation(item, state);
    if (activation.storyReady && itemEligible(item, state)) return item;
  }
  const hidden = itemsForCase("hidden").find((item) => !owned[item.id] && itemEligible(item, state));
  return hidden || null;
}
function ensureCollectionDiceLead(state, animal = null) {
  normalizeCollectionState(state);
  const item = nextCollectionDiceItem(state);
  if (!item) return null;
  const collection = state.world.collection;
  if ((collection.leads || []).length >= MAX_COLLECTION_LEADS) return collection.leads[0] || null;
  const active = collection.discovery.active;
  if (active && active.itemId === item.id) return null;
  const existing = (collection.leads || []).find((lead) => lead.itemId === item.id || lead.caseId === item.caseId);
  if (existing) return existing;
  const related = animal && animal.id ? storyAnimalSnapshot(state, item, animal) : relationForLead(state, caseById(item.caseId));
  const lead = {
    id: `dice_${collectionDay(state)}_${item.id}`,
    caseId: item.caseId,
    itemId: item.id,
    day: collectionDay(state),
    quality: (related.trust || 0) >= 80 ? 2 : (related.trust || 0) >= 55 ? 1 : 0,
    sourceAction: "survivalDice",
    sourceLabel: "生存调查",
    animal: related,
    title: `${related.name || "附近动物"}带来调查线索`,
    clue: item.story
  };
  collection.leads = (collection.leads || []).concat(lead).slice(0, MAX_COLLECTION_LEADS);
  return lead;
}
function grantNextCollectionFromExchange(state, context = {}) {
  normalizeCollectionState(state);
  if (state.world.collection.discovery.active) return { ok: false, reason: "busy" };
  const item = nextCollectionDiceItem(state);
  if (!item || (item.condition || {}).finale) return { ok: false, reason: "none" };
  const animal = relationForLead(state, caseById(item.caseId));
  const entry = recordItem(state, item, {
    sourceAction: "friendExchange",
    sourceLabel: context.partnerName || "好友交换",
    animal
  }, { id: "exchange", name: "好友交换" }, 0, 6, false);
  state.world.collection.leads = (state.world.collection.leads || []).filter((lead) => lead.itemId !== item.id);
  return { ok: true, item, entry };
}
function collectionSummary(state) {
  normalizeCollectionState(state);
  const collection = state.world.collection;
  const folders = CASES.map((caseDef) => {
    const found = collection.cases[caseDef.id].itemIds.length;
    const activeDiscovery = collection.discovery.active && collection.discovery.active.caseId === caseDef.id ? collection.discovery.active : null;
    const leads = collection.leads.filter((lead) => lead.caseId === caseDef.id).length + (activeDiscovery ? 1 : 0);
    const nextItem = nextStoryCandidate(state, caseDef.id);
    const nextActivation = nextItem ? collectionDiscoveryActivation(nextItem, state) : null;
    return { id: caseDef.id, title: caseDef.title, short: caseDef.short, chapter: caseDef.chapter, hidden: !!caseDef.hidden, icon: caseDef.icon, color: caseDef.color, found, total: itemsForCase(caseDef.id).length, leads, activeDiscovery, nextItem, nextActivation, ending: collection.cases[caseDef.id].ending };
  });
  return { collected: Object.keys(collection.items).length, total: ITEMS.length, percent: Math.round(Object.keys(collection.items).length / ITEMS.length * 100), latest: collection.lastDiscovery, folders, leads: collection.leads.length + (collection.discovery.active ? 1 : 0), charges: collection.investigation.charges, chargeProgress: collection.investigation.chargeProgress, activeDiscovery: storyDiscoverySummary(state).active, legacyCount: collection.legacyArchive.count || 0, forestRemembers: !!collection.worldFlags.forest_remembers };
}
module.exports = {
  CASES, CATALOG: ITEMS, ITEMS, METHODS, ENDINGS,
  caseById, collectionItemById, itemsForCase, itemEligible, collectionDiscoveryActivation,
  normalizeCollectionState, updateCollectionAfterAction, offerAnimalCollectionLead,
  startInvestigation, resolveInvestigation, submitCaseEnding, collectionSummary,
  beginStoryDiscovery, advanceStoryDiscovery, collectStoryDiscovery, storyDiscoverySummary, discoveryStatusLabel,
  nextCollectionDiceItem, ensureCollectionDiceLead, grantNextCollectionFromExchange
};
