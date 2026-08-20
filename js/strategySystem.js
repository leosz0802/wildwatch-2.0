const { BALANCE_V2 } = require("./balanceConfig");
const { addPendingRecovered, consumeProjectPreparation } = require("./resourceLedger");

const STRATEGY_ROUTES = {
  balanced: {
    id: "balanced",
    label: "动态平衡",
    shortLabel: "平衡",
    color: "#8b7355",
    description: "尚未形成单一路线，所有选择仍有较大调整空间。",
    benefit: "没有额外加成，也没有路线代价。"
  },
  enforcement: {
    id: "enforcement",
    label: "边界执法",
    shortLabel: "执法",
    color: "#c45b42",
    description: "优先压低偷猎、建立封锁线和跨区执法能力。",
    benefit: "侦察与驱赶额外降低偷猎；生态建设成本略高。"
  },
  ecology: {
    id: "ecology",
    label: "生态韧性",
    shortLabel: "生态",
    color: "#5cb87a",
    description: "优先恢复水草、降低疾病并保留自然迁徙弹性。",
    benefit: "修复与干预效果更强；强硬执法的即时压制略弱。"
  },
  research: {
    id: "research",
    label: "科研追踪",
    shortLabel: "科研",
    color: "#4ab8d4",
    description: "依靠现场痕迹、样本和证据链提高判断精度。",
    benefit: "侦察更容易发现痕迹，样本移交获得研究支持；不再隐性消耗补给。"
  },
  community: {
    id: "community",
    label: "社区共生",
    shortLabel: "共生",
    color: "#d29b26",
    description: "用补偿、沟通和共享资源换取长期信任。",
    benefit: "行动更容易获得声誉和稳定；代价只在明确的策略选项中结算。"
  }
};

const STRATEGY_ROUTE_IDS = ["enforcement", "ecology", "research", "community"];
const MAX_ROUTE_SCORE = 30;
const STRATEGY_CHAPTER_TARGETS = {
  1: { total: 3, major: 1 },
  2: { total: 4, major: 1 },
  3: { total: 5, major: 2 },
  4: { total: 5, major: 2 },
  5: { total: 4, major: 1 }
};

const LEGACY_MAJOR_DILEMMAS = [
  {
    id: "water_access",
    title: "只剩一条稳定水线",
    story: "旱季迹象把动物和人类活动同时推向水边。开放水点能立刻缓解拥挤，却也会让路线更容易被盯上。",
    minChapter: 1,
    minActions: 6,
    eligible: (reserve) => (((reserve.ecology || {}).water || 0) < 75) || ((reserve.seasonState || {}).name === "旱季"),
    choices: [
      {
        id: "open_water",
        label: "开放集中水点",
        route: "community",
        effects: { water: 12, reputation: 7, fund: 250, poacherPressure: 5 },
        consequence: { id: "visible_waterline", label: "公开水线", remainingActions: 6, modifiers: { fund: 30, poacherPressure: 1 } },
        outcome: "动物立刻回到水边，社区捐助同步进入，但公开路线也开始吸引陌生脚印。"
      },
      {
        id: "hide_springs",
        label: "保护分散暗泉",
        route: "enforcement",
        effects: { water: 3, safety: 3, poacherPressure: -2, fund: -120 },
        consequence: { id: "hidden_springs", label: "暗泉维护", remainingActions: 4, modifiers: { fund: -15, poacherPressure: -1 } },
        outcome: "水量恢复较慢，但动物路线被拆散，偷猎者难以守住单一入口。"
      }
    ]
  },
  {
    id: "informant_or_blockade",
    title: "线人提出了一个价格",
    story: "一名边界线人愿意交出运输时间表。核实线索能提高准确度；立即封锁更快，却可能惊动整条链。",
    minChapter: 1,
    minActions: 7,
    eligible: (reserve) => (reserve.poacherPressure || 0) >= 42,
    choices: [
      {
        id: "pay_informant",
        label: "支付线人费用",
        route: "research",
        effects: { fund: -140, intel: 2, poacherPressure: -5, reputation: 2 },
        consequence: { id: "informant_line", label: "线人情报线", remainingActions: 4, modifiers: { enforcement: 1, fund: -8 } },
        outcome: "运输时间表被验证，后续数次巡护会持续得到线索，但线人维护需要补给。"
      },
      {
        id: "hard_blockade",
        label: "立即封锁边界",
        route: "enforcement",
        effects: { fund: -80, poacherPressure: -16, enforcement: 10, reputation: -3, migrationDelta: -2 },
        consequence: { id: "hard_border", label: "高压封锁", remainingActions: 5, modifiers: { poacherPressure: -1, reputation: -1 } },
        outcome: "偷猎压力快速下降，但动物迁徙和周边社区同时感到边界变硬。"
      }
    ]
  },
  {
    id: "disease_response",
    title: "病弱个体出现在迁徙队尾",
    story: "全面隔离更便宜、更快，却会切断迁徙；分散救治更温和，但会消耗大量基金和医疗资源。",
    minChapter: 1,
    minActions: 8,
    eligible: (reserve) => (((reserve.ecology || {}).disease || 0) >= 20) || ((reserve.seasonState || {}).name === "雨季"),
    choices: [
      {
        id: "strict_quarantine",
        label: "封闭迁徙通道",
        route: "enforcement",
        effects: { disease: -10, migrationDelta: -5, reputation: -2, fund: -60 },
        consequence: { id: "quarantine", label: "严格隔离", remainingActions: 5, modifiers: { disease: -1, stability: -1 } },
        outcome: "疾病被快速压住，但熟悉的迁徙路线暂时沉寂。"
      },
      {
        id: "field_clinics",
        label: "建立分散救治点",
        route: "ecology",
        effects: { disease: -6, reputation: 6, fund: -190, stability: 3 },
        consequence: { id: "field_clinics", label: "野外救治", remainingActions: 5, modifiers: { fund: -20, reputation: 1, disease: -1 } },
        outcome: "恢复更慢、成本更高，但动物没有被迫放弃原来的路线。"
      }
    ]
  },
  {
    id: "rare_route",
    title: "罕见动物留下了清晰脚印",
    story: "公开消息能带来基金和关注，也会把更多镜头与风险带到边界；保密则意味着放弃眼前收益。",
    minChapter: 2,
    minActions: 12,
    minAnimalTrust: 52,
    eligible: (reserve) => (reserve.safety || 0) >= 62,
    choices: [
      {
        id: "publish_route",
        label: "公开保护成果",
        route: "community",
        effects: { fund: 600, business: 10, reputation: 8, poacherPressure: 6 },
        consequence: { id: "public_attention", label: "公众关注", remainingActions: 6, modifiers: { fund: 50, poacherPressure: 1 } },
        outcome: "保护区获得大量关注和收入，但罕见路线不再只属于动物。"
      },
      {
        id: "secret_archive",
        label: "只做秘密档案",
        route: "research",
        effects: { fund: -90, intel: 1, reputation: 4, poacherPressure: -2 },
        consequence: { id: "quiet_monitoring", label: "静默监测", remainingActions: 5, modifiers: { fund: -10, reputation: 1 } },
        outcome: "你放弃即时曝光，把路线交给小范围科研监测。"
      }
    ]
  },
  {
    id: "community_boundary",
    title: "传统放牧线与核心区重叠",
    story: "补偿协商可以保留信任，但价格昂贵；直接加固防护网更有效，却会把压力推向下一段边界。",
    minChapter: 2,
    minActions: 16,
    eligible: (reserve) => (reserve.reputation || 0) >= 40,
    choices: [
      {
        id: "compensate",
        label: "签订共生补偿",
        route: "community",
        effects: { fund: -230, reputation: 6, stability: 3, poacherPressure: -2 },
        consequence: { id: "community_pact", label: "社区共生协议", remainingActions: 7, modifiers: { fund: -15, reputation: 1 } },
        outcome: "边界获得本地人的主动预警，但保护区需要持续履行补偿承诺。"
      },
      {
        id: "build_fence",
        label: "扩建硬质防护网",
        route: "enforcement",
        effects: { fund: -100, safety: 14, enforcement: 12, poacherPressure: -6, migrationDelta: -4, reputation: -4 },
        consequence: { id: "hard_fence", label: "硬质防护网", remainingActions: 6, modifiers: { safety: 1, stability: -1 } },
        outcome: "核心区更安全，但部分动物与社区被迫改走更远的路线。"
      }
    ]
  },
  {
    id: "evidence_destination",
    title: "神秘证物该交给谁",
    story: "联合专案组能立即扩大战果；研究机构则能从证物中还原更长的生态犯罪链。",
    minChapter: 3,
    minActions: 24,
    eligible: (reserve) => Object.keys((((reserve.mysteryEvidence || {}).evidence) || {})).length > 0,
    choices: [
      {
        id: "joint_taskforce",
        label: "移交联合专案组",
        route: "enforcement",
        effects: { fund: 250, enforcement: 10, poacherPressure: -12, intel: -1, reputation: -3 },
        consequence: { id: "joint_taskforce", label: "联合专案", remainingActions: 7, modifiers: { enforcement: 1, fund: -15 } },
        outcome: "案件迅速扩大，边界压力下降，但部分研究线索不再由你掌握。"
      },
      {
        id: "research_chain",
        label: "建立研究证据链",
        route: "research",
        effects: { fund: -120, intel: 2, reputation: 4, enforcement: 2 },
        consequence: { id: "research_chain", label: "证据链研究", remainingActions: 6, modifiers: { fund: -12, enforcement: 1, reputation: 1 } },
        outcome: "即时收益较低，但保护区开始掌握犯罪链的长期模式。"
      }
    ]
  }
];

function choice(id, label, route, effects, consequenceLabel, modifiers, outcome, risk = "safe") {
  return {
    id,
    label,
    route,
    effects,
    risk,
    consequence: {
      id: `${id}_consequence`,
      label: consequenceLabel,
      remainingActions: risk === "risky" ? 6 : risk === "balanced" ? 5 : 4,
      modifiers
    },
    outcome
  };
}

const THIRD_MAJOR_CHOICES = {
  water_access: choice("rotating_water", "轮换开放水线", "ecology", { water: 6, fund: -120, migrationDelta: 2, poacherPressure: 1 }, "轮换水线", { water: 1, fund: -10 }, "水线按动物活动轮换开放，恢复速度适中，也需要持续维护。", "balanced"),
  informant_or_blockade: choice("controlled_sting", "布置可控诱捕", "research", { fund: -120, intel: -1, poacherPressure: -8, enforcement: 4 }, "可控诱捕", { intel: -1, enforcement: 1 }, "你没有立刻收网，而是用有限情报锁定更完整的运输链。", "balanced"),
  disease_response: choice("mobile_screening", "建立移动筛查", "research", { disease: -7, fund: -130, intel: -1, stability: 3 }, "移动筛查", { fund: -12, disease: -1 }, "筛查队沿迁徙路线移动，成本不低，但避免了全面封路。", "balanced"),
  rare_route: choice("limited_release", "限量发布影像", "ecology", { fund: 240, reputation: 5, poacherPressure: 2, intel: -1 }, "限量公开", { fund: 20, poacherPressure: 1 }, "你只公开模糊地点的影像，获得关注，同时保留核心路线。", "balanced"),
  community_boundary: choice("seasonal_corridor", "划定季节通道", "ecology", { fund: -140, water: 3, migrationDelta: 4, reputation: 3, poacherPressure: 2 }, "季节通道", { migrationDelta: 1, fund: -12 }, "动物与社区按季节错峰使用边界，冲突缓解但巡查更复杂。", "balanced"),
  evidence_destination: choice("independent_archive", "建立独立档案", "community", { fund: -90, reputation: 5, enforcement: 3, intel: 1 }, "公共监督档案", { fund: -10, reputation: 1 }, "保护区保留证物副本并接受公共监督，效率较慢但信任更稳。", "balanced")
};

function failureEffectsFor(effects) {
  const failed = {};
  Object.keys(effects || {}).forEach((key) => {
    const value = effects[key];
    const inverseBenefit = (key === "poacherPressure" || key === "disease") && value < 0;
    const directBenefit = !["poacherPressure", "disease"].includes(key) && value > 0;
    failed[key] = inverseBenefit || directBenefit ? Math.round(value * 0.25) : value;
  });
  failed.stability = (failed.stability || 0) - 3;
  return failed;
}

const LEGACY_MAJOR_CHOICE_ORDER = {
  water_access: ["hide_springs", "open_water", "rotating_water"],
  informant_or_blockade: ["pay_informant", "hard_blockade", "controlled_sting"],
  disease_response: ["strict_quarantine", "field_clinics", "mobile_screening"],
  rare_route: ["secret_archive", "publish_route", "limited_release"],
  community_boundary: ["compensate", "build_fence", "seasonal_corridor"],
  evidence_destination: ["research_chain", "joint_taskforce", "independent_archive"]
};

const ENHANCED_MAJOR_DILEMMAS = LEGACY_MAJOR_DILEMMAS.map((item) => {
  const order = LEGACY_MAJOR_CHOICE_ORDER[item.id] || [];
  const choices = item.choices.concat(THIRD_MAJOR_CHOICES[item.id]).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((entry, index) => {
    const risk = index === 1 ? "risky" : index === 2 ? "balanced" : "safe";
    return Object.assign({}, entry, {
      risk,
      consequence: Object.assign({}, entry.consequence || {}, {
        remainingActions: Math.max(4, Math.min(10, ((entry.consequence || {}).remainingActions) || (risk === "risky" ? 7 : 5)))
      }),
      dice: risk === "risky" ? { sides: 6, threshold: 5 } : null,
      failureEffects: risk === "risky" ? failureEffectsFor(entry.effects) : null
    });
  });
  return Object.assign({}, item, { tier: "major", maxOccurrences: 5, maxOccurrencesPerChapter: 1, minChapterRepeatGap: 2, choices });
});

const TACTICAL_DILEMMAS = [
  {
    id: "patrol_split", title: "今晚只有一支巡护队", story: "河岸出现脚印，草场同时传来幼兽叫声。你只能先处理一边。", minChapter: 1, minActions: 3,
    choices: [
      choice("patrol_river", "先查河岸脚印", "enforcement", { poacherPressure: -4, intel: 1, grass: -2 }, "河岸加密巡查", { poacherPressure: -1, fund: -6 }, "边界线索更清楚，但草场维护被推迟。"),
      choice("patrol_meadow", "先找草场幼兽", "ecology", { grass: 4, reputation: 2, poacherPressure: 2 }, "草场救助", { grass: 1, fund: -6 }, "幼兽得到照看，但陌生脚印暂时无人跟进。")
    ]
  },
  {
    id: "water_pump", title: "旧水泵还能撑一晚", story: "继续使用能马上补水，停机检修则会让动物短暂换路。", minChapter: 1, minActions: 4, seasons: ["旱季"],
    choices: [
      choice("pump_now", "继续抽水", "community", { water: 5, fund: -35, disease: 2 }, "临时抽水", { water: 1, disease: 1 }, "今晚有水，但浑浊水线抬高了疾病风险。"),
      choice("pump_repair", "停机检修", "research", { fund: -70, water: -2, stability: 4 }, "水泵检修", { water: 2, fund: -5 }, "动物暂时绕路，之后的水线会更稳定。")
    ]
  },
  {
    id: "injured_herd", title: "迁徙队尾有一只伤鹿", story: "单独救助会打乱群体节奏，继续观察则可能错过治疗窗口。", minChapter: 1, minActions: 5, minAnimalTrust: 38,
    choices: [
      choice("rescue_deer", "立即救助", "ecology", { reputation: 4, stability: 3, fund: -75, migrationDelta: -1 }, "个体救助", { reputation: 1, fund: -8 }, "伤鹿被留下治疗，鹿群先向前移动。"),
      choice("track_deer", "保持距离观察", "research", { intel: 2, migrationDelta: 2, reputation: -2 }, "远距跟踪", { intel: 1, reputation: -1 }, "迁徙没有中断，但你承担了延迟救助的舆论压力。")
    ]
  },
  {
    // 第一章四次抉择必须对所有路线都可达。过去这里要求先形成执法
    // 路线，而雨季又锁住水泵事件，非执法玩家会永久停在 3/4。
    // 缺口是通用保护区事件；路线差异应由选项体现，而非触发前硬锁。
    id: "fence_gap", title: "防护网出现一处缺口", story: "缺口也是动物通道。立即封死更安全，保留通道则需要持续监控。", minChapter: 1, minActions: 5,
    choices: [
      choice("seal_gap", "立即封死", "enforcement", { safety: 5, migrationDelta: -2, fund: -45 }, "封闭缺口", { safety: 1, migrationDelta: -1 }, "边界更安全，但动物失去一条熟悉通道。"),
      choice("monitor_gap", "保留并监控", "research", { intel: 1, migrationDelta: 2, fund: -65 }, "监控通道", { intel: 1, fund: -8 }, "动物继续使用通道，巡护成本随之增加。")
    ]
  },
  {
    id: "sample_request", title: "研究站申请一批新样本", story: "提交样本能换来数据，留在仓库则可以等待更高的项目拨款。", minChapter: 1, minActions: 6, routeRequirement: "research", eligible: (reserve) => (reserve.intel || 0) <= 4,
    choices: [
      choice("share_samples", "交给研究站", "research", { intel: 1, reputation: 3, fund: -40 }, "联合研究", { reputation: 1, fund: -5 }, "研究数据回流保护区，但短期没有现金收益。"),
      choice("hold_samples", "暂存等待合同", "community", { fund: 180, business: 2, intel: -1, reputation: -1 }, "样本暂存", { fund: 8 }, "现金压力缓解，但研究合作降温。")
    ]
  },
  {
    id: "community_tip", title: "牧民提供一条可疑车辙", story: "公开奖励能鼓励更多报告，也可能招来虚假线索。", minChapter: 1, minActions: 6, routeRequirement: "community", minAnimalTrust: 50,
    choices: [
      choice("reward_tip", "公开奖励线索", "community", { reputation: 4, intel: 1, fund: -70 }, "社区线索网", { reputation: 1, fund: -8 }, "更多人愿意报告异常，但维护线索网需要预算。"),
      choice("verify_tip", "秘密核验", "enforcement", { poacherPressure: -3, enforcement: 3, reputation: -2 }, "秘密核验", { poacherPressure: -1, reputation: -1 }, "行动更隐蔽，但社区感受不到参与价值。")
    ]
  },
  {
    id: "feed_shortage", title: "救助点补给只够一处", story: "幼兽区和猎犬队都在等补给，优先顺序会被它们记住。", minChapter: 1, minActions: 7,
    choices: [
      choice("feed_young", "优先幼兽区", "ecology", { stability: 4, reputation: 2, enforcement: -2 }, "幼兽补给", { stability: 1, fund: -6 }, "动物状态稳定，巡护能力暂时下降。"),
      choice("feed_hounds", "优先猎犬队", "enforcement", { enforcement: 4, poacherPressure: -2, reputation: -2 }, "猎犬补给", { enforcement: 1, reputation: -1 }, "边界效率提高，但救助点感到被忽视。")
    ]
  },
  {
    id: "migration_noise", title: "施工声惊动迁徙队伍", story: "叫停施工会损失基金，临时改道则会增加动物压力。", minChapter: 2, minActions: 10,
    choices: [
      choice("stop_work", "叫停施工", "community", { migrationDelta: 3, reputation: 3, fund: -95 }, "施工暂停", { migrationDelta: 1, fund: -10 }, "迁徙路线恢复安静，工程进度和预算受损。"),
      choice("reroute_herd", "引导动物改道", "research", { business: 2, migrationDelta: 2, stability: -1, fund: 150 }, "临时改道", { stability: -1, fund: 10 }, "工程继续推进，动物承担了额外绕行。")
    ]
  },
  {
    id: "wetland_path", title: "湿地木栈道需要更新", story: "关闭栈道利于生态恢复，限流开放则能维持收入。", minChapter: 2, minActions: 11, routeRequirement: "ecology", seasons: ["雨季"],
    choices: [
      choice("close_walkway", "关闭一周", "ecology", { water: 4, disease: -2, fund: -80 }, "湿地休养", { water: 1, fund: -8 }, "湿地恢复更快，经营收入短暂下降。"),
      choice("limit_visitors", "限流开放", "community", { fund: 140, business: 2, reputation: 2, stability: 2, water: -1 }, "限流参访", { fund: 10, water: -1 }, "保护区保住收入，湿地恢复速度变慢。")
    ]
  },
  {
    id: "market_offer", title: "项目提高样本拨款", story: "现在移交能快速获得研究补助，保留样本则可能支持后续研究。", minChapter: 2, minActions: 12, eligible: (reserve) => (reserve.fund || 0) <= 2000 || (reserve.business || 0) <= 55,
    choices: [
      choice("sell_now", "接受专项拨款", "community", { fund: 250, business: 4, intel: -1 }, "样本移交", { fund: 12, reputation: -1 }, "基金迅速回升，但研究材料被提前移交。"),
      choice("reserve_stock", "保留研究库存", "research", { intel: 2, reputation: 3, fund: -55 }, "研究库存", { reputation: 1, fund: -6 }, "你放弃短期拨款，换取持续研究价值。")
    ]
  },
  {
    id: "camera_failure", title: "红外相机同时离线", story: "集中维修一处能快速恢复，分散替换则覆盖更广。", minChapter: 2, minActions: 13,
    choices: [
      choice("repair_core", "先修核心区", "enforcement", { intel: 1, poacherPressure: -3, fund: -65 }, "核心监控", { enforcement: 1, fund: -6 }, "核心区重新可见，外围盲点仍然存在。"),
      choice("replace_edges", "替换外围设备", "research", { enforcement: 3, intel: 1, fund: -105 }, "外围监控", { enforcement: 1, fund: -9 }, "覆盖面扩大，但维修成本更高。")
    ]
  },
  {
    id: "young_predator", title: "年轻捕食者靠近村落", story: "驱离能快速降风险，食物诱导则更温和但成本更高。", minChapter: 3, minActions: 18, minAnimalTrust: 45,
    choices: [
      choice("drive_predator", "强声驱离", "enforcement", { safety: 5, enforcement: 3, reputation: -3, migrationDelta: -1 }, "强声驱离", { safety: 1, reputation: -1 }, "村落迅速安静，捕食者和猎物同时绕开边界。"),
      choice("guide_predator", "食物线诱导", "ecology", { stability: 4, fund: -110, safety: 2 }, "捕食者诱导", { stability: 1, fund: -10 }, "捕食者回到核心区，但需要持续监测。")
    ]
  },
  {
    id: "ranger_fatigue", title: "巡护员出现疲劳", story: "安排轮休会降低覆盖，继续巡护则增加补给压力。", minChapter: 3, minActions: 19,
    choices: [
      choice("short_shift", "安排轮休", "community", { reputation: 3, stability: 2, enforcement: -1, fund: -20 }, "轮休制度", { reputation: 1, enforcement: -1 }, "队伍恢复信任，但边界覆盖暂时变薄。"),
      choice("overtime_pay", "支付轮换补贴", "enforcement", { enforcement: 4, fund: -120, stability: 1 }, "轮换补贴", { enforcement: 1, fund: -12 }, "覆盖保持稳定，基金持续承担人力成本。")
    ]
  },
  {
    id: "disease_trace", title: "水边发现不明病迹", story: "立即封样能控制传播，继续跟踪则可能找到源头。", minChapter: 3, minActions: 20,
    choices: [
      choice("seal_trace", "封锁取样点", "ecology", { disease: -4, safety: 3, water: -2, fund: -55 }, "取样点封锁", { disease: -1, water: -1 }, "传播风险下降，动物失去一处饮水点。"),
      choice("follow_trace", "沿足迹追踪", "research", { intel: 3, disease: 2, fund: -35 }, "病迹追踪", { intel: 1, disease: 1 }, "你得到更多信息，也承担病迹扩散风险。")
    ]
  },
  {
    id: "evidence_storage", title: "证物库接近容量上限", story: "扩建需要基金，转交外部机构则会失去部分控制权。", minChapter: 4, minActions: 27, eligible: (reserve) => Object.keys((((reserve.mysteryEvidence || {}).evidence) || {})).length > 0,
    choices: [
      choice("expand_archive", "扩建证物库", "research", { enforcement: 4, intel: 2, fund: -150 }, "证物库扩建", { enforcement: 1, fund: -12 }, "证据链留在本地，经营成本明显提高。"),
      choice("transfer_evidence", "转交联合机构", "community", { fund: 120, reputation: 3, intel: -1 }, "联合保管", { reputation: 1 }, "外部机构承担成本，你失去部分研究主动权。")
    ]
  },
  {
    id: "dry_season_queue", title: "旱季水点排起长队", story: "优先幼崽能提高存活，按种群比例分配更公平。", minChapter: 4, minActions: 28, seasons: ["旱季"],
    choices: [
      choice("young_first", "幼崽优先", "ecology", { stability: 5, reputation: 2, migrationDelta: -2 }, "幼崽优先水线", { stability: 1, migrationDelta: -1 }, "幼崽得到保护，成年群体开始寻找其他水源。"),
      choice("quota_water", "按种群配额", "community", { reputation: 4, stability: 4, water: -3, fund: -45 }, "水线配额", { reputation: 1, water: -1 }, "分配更公平，但管理损耗降低了有效水量。")
    ]
  },
  {
    id: "final_patrol_budget", title: "本季只剩最后一笔机动预算", story: "投入边界能守住安全，投入生态能提高下一季承载力。", minChapter: 5, minActions: 36, eligible: (reserve) => (reserve.fund || 0) <= 1800,
    choices: [
      choice("budget_border", "投入边界", "enforcement", { safety: 6, poacherPressure: -4, fund: -140 }, "边界预算", { safety: 1, fund: -10 }, "本季边界更稳，生态工程继续等待。"),
      choice("budget_ecology", "投入生态", "ecology", { water: 4, grass: 5, fund: -140, poacherPressure: 2 }, "生态预算", { water: 1, grass: 1 }, "承载力提高，边界风险短暂上升。")
    ]
  }
].map((item) => Object.assign({ tier: "tactical", maxOccurrences: 5, maxOccurrencesPerChapter: 1 }, item));

function majorDecision(id, title, story, minChapter, minActions, parentId, options = {}) {
  return {
    id, title, story, minChapter, minActions, tier: "major", maxOccurrences: 1,
    requiresDilemmaId: parentId || "",
    routeRequirement: options.routeRequirement || "",
    eligible: options.eligible || null,
    choices: options.choices
  };
}

const ADDITIONAL_MAJOR_DILEMMAS = [
  majorDecision("water_governance", "谁来管理长期水线", "临时水线已经稳定，但管理权会决定下一季谁先得到水。", 2, 14, "water_access", { choices: [
    choice("water_committee", "成立社区水委会", "community", { reputation: 7, fund: -180, water: 3 }, "水委会", { reputation: 1, fund: -16 }, "社区参与提高，协调成本长期存在。"),
    choice("water_command", "由保护区统一调度", "enforcement", { safety: 12, water: 10, reputation: -5 }, "统一水令", { safety: 1, reputation: -1 }, "调度效率提高，社区认为权力过于集中。", "risky"),
    choice("water_model", "采用动态水量模型", "research", { intel: -1, water: 5, fund: -100, stability: 5 }, "动态水模", { fund: -10, water: 1 }, "模型减少争执，但依赖持续数据和预算。", "balanced")
  ] }),
  majorDecision("poacher_network", "追到偷猎网络上游", "上一轮行动留下资金和运输线索，现在必须决定如何收网。", 2, 16, "informant_or_blockade", { choices: [
    choice("network_watch", "继续监视", "research", { intel: 2, poacherPressure: -4, fund: -100 }, "网络监视", { enforcement: 1, fund: -10 }, "证据更完整，但部分人员暂时逃离视线。"),
    choice("network_raid", "立即跨区收网", "enforcement", { enforcement: 8, poacherPressure: -12, reputation: -4, fund: -80 }, "跨区收网", { enforcement: 1, reputation: -1 }, "高风险收网可能瓦解网络，也可能打草惊蛇。", "risky"),
    choice("network_freeze", "冻结交易渠道", "community", { business: -4, poacherPressure: -7, reputation: 5, fund: -130 }, "交易冻结", { business: -1, poacherPressure: -1 }, "社区共同切断销赃渠道，合法经营也受到影响。", "balanced")
  ] }),
  majorDecision("disease_corridor", "疫情后的迁徙通道", "疫情得到控制，但旧路线是否重开会影响整个种群。", 3, 23, "disease_response", { choices: [
    choice("corridor_delay", "延后开放", "enforcement", { disease: -6, safety: 5, migrationDelta: -4, reputation: -2 }, "延迟开放", { disease: -1, migrationDelta: -1 }, "疾病风险最低，迁徙代价最大。"),
    choice("corridor_open", "立即全面开放", "community", { migrationDelta: 12, disease: 4, reputation: 6 }, "全面开放", { migrationDelta: 1, disease: 1 }, "动物快速归来，也可能带回新的病迹。", "risky"),
    choice("corridor_zones", "分区逐步开放", "ecology", { migrationDelta: 4, disease: -2, fund: -150, stability: 3 }, "分区开放", { migrationDelta: 1, fund: -12 }, "恢复较慢但风险可控，需要持续巡查。", "balanced")
  ] }),
  majorDecision("rare_guardians", "谁能接近罕见动物", "罕见路线已经被记录，下一步是决定谁有资格接近。", 3, 25, "rare_route", { choices: [
    choice("rare_closed", "核心区完全封闭", "enforcement", { safety: 8, fund: -140, reputation: -3 }, "核心封闭", { safety: 1, fund: -12 }, "风险最低，也失去公众参与和研究机会。"),
    choice("rare_live", "公开限时直播", "community", { fund: 800, reputation: 10, poacherPressure: 6 }, "限时直播", { fund: 40, poacherPressure: 1 }, "关注和基金激增，路线暴露风险同步上升。", "risky"),
    choice("rare_research", "认证研究员进入", "research", { intel: 1, reputation: 4, fund: -100, safety: 2 }, "认证研究", { reputation: 1, fund: -10 }, "获得长期数据，仍需承担人员进入的风险。", "balanced")
  ] }),
  majorDecision("community_charter", "边界协议表决", "临时约定到期，需要确定长期规则。", 4, 31, "community_boundary", { choices: [
    choice("charter_local", "社区共同治理", "community", { reputation: 8, stability: 5, fund: -220 }, "共同治理", { reputation: 1, fund: -18 }, "信任最稳，但保护区持续承担协调成本。"),
    choice("charter_fence", "保护区单方划线", "enforcement", { fund: 100, safety: 12, enforcement: 8, poacherPressure: -8, migrationDelta: -5, reputation: -6 }, "单方边界", { safety: 1, reputation: -1 }, "执行最快，关系和迁徙代价也最明显。", "risky"),
    choice("charter_season", "签署季节协议", "ecology", { migrationDelta: 4, reputation: 4, fund: -140, poacherPressure: 2 }, "季节协议", { migrationDelta: 1, fund: -12 }, "规则更灵活，也需要每季重新协商。", "balanced")
  ] }),
  majorDecision("reserve_funding_crisis", "保护区出现结构性资金缺口", "维护、救助和执法同时需要资金，没有方案能保住全部目标。", 4, 30, "", { eligible: (reserve) => (reserve.fund || 0) < 1100, choices: [
    choice("fund_cut", "全面压缩支出", "enforcement", { fund: 220, stability: -6, reputation: -4 }, "紧缩预算", { fund: 20, stability: -1 }, "账面迅速稳定，前线和社区承受压力。"),
    choice("fund_campaign", "发动公众募资", "community", { fund: 360, reputation: 7, poacherPressure: 7 }, "公众募资", { fund: 30, poacherPressure: 1 }, "资金最充足，保护区位置与故事也更公开。", "risky"),
    choice("fund_contract", "签科研服务合同", "research", { fund: 210, intel: -2, business: 4, reputation: -1 }, "科研合同", { fund: 18, intel: -1 }, "收入更稳定，但科研资源被合同占用。", "balanced")
  ] })
].map((item) => Object.assign({}, item, {
  choices: item.choices.map((entry, index) => Object.assign({}, entry, {
    risk: index === 1 ? "risky" : index === 2 ? "balanced" : "safe",
    dice: index === 1 ? { sides: 6, threshold: 5 } : null,
    failureEffects: index === 1 ? failureEffectsFor(entry.effects) : null,
    consequence: Object.assign({}, entry.consequence, { remainingActions: index === 1 ? 8 : index === 2 ? 6 : 5 })
  }))
}));

const STRATEGY_BALANCE_WEIGHTS = {
  fund: 0.02,
  safety: 1,
  stability: 1,
  reputation: 0.8,
  enforcement: 1,
  poacherPressure: -1,
  intel: 2,
  business: 1,
  water: 1,
  grass: 1,
  disease: -1,
  migrationDelta: 1
};

function strategicEffectValue(effects) {
  return Object.keys(effects || {}).reduce((sum, key) => sum + (STRATEGY_BALANCE_WEIGHTS[key] || 0) * effects[key], 0);
}

function strategicChoiceExpectedValue(entry) {
  const consequence = entry.consequence || {};
  const ongoing = strategicEffectValue(consequence.modifiers) * (consequence.remainingActions || 0) * 0.5;
  const successValue = strategicEffectValue(entry.effects) + ongoing;
  if (entry.risk !== "risky") return Math.round(successValue * 10) / 10;
  const failureValue = strategicEffectValue(entry.failureEffects || failureEffectsFor(entry.effects)) + ongoing;
  return Math.round(((successValue / 3) + (failureValue * 2 / 3)) * 10) / 10;
}

const STRATEGIC_DILEMMAS = TACTICAL_DILEMMAS.filter((item) => item.id !== "feed_shortage").concat(ENHANCED_MAJOR_DILEMMAS, ADDITIONAL_MAJOR_DILEMMAS).map((item) => {
  const values = item.choices.map(strategicChoiceExpectedValue);
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return Object.assign({}, item, {
    choices: item.choices.map((entry, index) => Object.assign({}, entry, {
      expectedValue: values[index],
      balanceScore: Math.round(100 + values[index] - average)
    }))
  });
});

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeStrategyState(saved) {
  const base = saved || {};
  const routeScores = {};
  STRATEGY_ROUTE_IDS.forEach((route) => {
    routeScores[route] = Math.max(0, Math.min(MAX_ROUTE_SCORE, Math.round((((base.routeScores || {})[route]) || 0) * 10) / 10));
  });
  const pendingDefinition = base.pendingDilemma && strategicDilemmaById(base.pendingDilemma.id);
  const pendingDilemma = pendingDefinition
    ? Object.assign({}, base.pendingDilemma, {
      id: pendingDefinition.id,
      tier: pendingDefinition.tier,
      chapter: Math.max(1, Math.min(5, Math.round(base.pendingDilemma.chapter || pendingDefinition.minChapter || 1))),
      actionIndex: Math.max(0, Math.round(base.pendingDilemma.actionIndex || 0))
    })
    : null;
  const selectedChoice = pendingDefinition && base.pendingSelection
    ? pendingDefinition.choices.find((choice) => choice.id === base.pendingSelection.choiceId)
    : null;
  const pendingSelection = pendingDilemma && selectedChoice && base.pendingSelection.dilemmaId === pendingDilemma.id
    ? Object.assign({}, base.pendingSelection, { dilemmaId: pendingDilemma.id, choiceId: selectedChoice.id })
    : null;
  const rolledChoice = pendingDefinition && base.pendingRoll
    ? pendingDefinition.choices.find((choice) => choice.id === base.pendingRoll.choiceId && choice.dice)
    : null;
  const pendingRoll = pendingDilemma && rolledChoice && base.pendingRoll.dilemmaId === pendingDilemma.id
    ? Object.assign({}, base.pendingRoll, {
      dilemmaId: pendingDilemma.id,
      choiceId: rolledChoice.id,
      roll: Math.max(1, Math.min(6, Math.round(base.pendingRoll.roll || 1))),
      routeModifier: Math.max(-6, Math.min(6, Math.round(base.pendingRoll.routeModifier || 0))),
      resourceModifier: Math.max(-6, Math.min(6, Math.round(base.pendingRoll.resourceModifier || 0))),
      phase: "resolved"
    })
    : null;
  return {
    routeScores,
    dominantRoute: dominantRouteFor(routeScores),
    recentActions: (base.recentActions || []).slice(-5),
    totalMeaningfulActions: Math.max(0, Math.round(base.totalMeaningfulActions || 0)),
    totalChoices: Math.max(0, Math.round(base.totalChoices || 0)),
    totalTacticalChoices: Math.max(0, Math.round(base.totalTacticalChoices || 0)),
    totalMajorChoices: Math.max(0, Math.round(base.totalMajorChoices || 0)),
    choiceHistory: (base.choiceHistory || []).slice(-80),
    consequences: (base.consequences || []).map((item) => Object.assign({}, item, { modifiers: Object.assign({}, item.modifiers || {}) })).slice(-16),
    pendingDilemma,
    pendingSelection,
    pendingRoll,
    lastDilemmaAction: Math.max(0, Math.round(base.lastDilemmaAction || 0)),
    lastTacticalAction: Math.max(0, Math.round(base.lastTacticalAction || 0)),
    lastMajorAction: Math.max(0, Math.round(base.lastMajorAction || 0)),
    lastChoiceAction: Math.max(0, Math.round(base.lastChoiceAction || 0)),
    dilemmaWait: Math.max(0, Math.round(base.dilemmaWait || 0)),
    tacticalWait: Math.max(0, Math.round(base.tacticalWait || 0)),
    majorWait: Math.max(0, Math.round(base.majorWait || 0)),
    chainFlags: Object.assign({}, base.chainFlags || {}),
    lastRhythm: Object.assign({ repeatCount: 0, penalty: 0, varietyBonus: false, meaningful: true }, base.lastRhythm || {})
  };
}

function dominantRouteFor(scores) {
  const entries = Object.keys(scores || {}).map((id) => ({ id, score: scores[id] || 0 })).sort((a, b) => b.score - a.score);
  if (!entries.length || entries[0].score < 4) return "balanced";
  if (entries[1] && entries[0].score === entries[1].score) return "balanced";
  return entries[0].id;
}

function strategyRoute(reserve) {
  const state = normalizeStrategyState(reserve && reserve.strategy);
  return STRATEGY_ROUTES[state.dominantRoute] || STRATEGY_ROUTES.balanced;
}

function addMetric(reserve, key, amount) {
  if (!amount) return;
  if (key === "intel") {
    // 情报已退出玩家资源层；保留旧事件字段，但不再改变存档或成功率。
    return;
  }
  if (key === "fund") {
    // 基金只允许通过“回收物入库后移交”获得。旧策略中的拨款先变成待收样本；
    // 旧预算成本改为消耗现有巡护补给，避免隐藏扣款。
    if (amount > 0) {
      addPendingRecovered(reserve, "researchSample", Math.max(1, Math.ceil(amount / 100)));
      return;
    }
    consumeProjectPreparation(reserve, amount);
    return;
  }
  if (["water", "grass", "disease"].includes(key)) {
    reserve.ecology = reserve.ecology || {};
    reserve.ecology[key] = clamp((reserve.ecology[key] || 0) + amount);
    return;
  }
  if (key === "migrationDelta") {
    reserve.migration = Object.assign({}, reserve.migration || {}, {
      delta: Math.round(((reserve.migration || {}).delta || 0) + amount)
    });
    reserve.migration.trend = reserve.migration.delta > 0 ? "in" : reserve.migration.delta < 0 ? "out" : "stable";
    return;
  }
  const max = key === "intel" ? 6 : key === "fund" ? Number.MAX_SAFE_INTEGER : 100;
  reserve[key] = clamp(Math.round((reserve[key] || 0) + amount), 0, max);
}

function applyModifiers(reserve, modifiers) {
  Object.keys(modifiers || {}).forEach((key) => addMetric(reserve, key, modifiers[key]));
}

function recordStrategicAction(reserve, action) {
  const state = normalizeStrategyState(reserve.strategy);
  const previous = state.recentActions.slice();
  let repeatCount = 1;
  for (let index = previous.length - 1; index >= 0 && previous[index] === action; index -= 1) repeatCount += 1;
  const penalty = Math.max(0, repeatCount - 2);
  const meaningful = penalty === 0;
  if (meaningful) state.totalMeaningfulActions += 1;
  state.recentActions = previous.concat(action).slice(-5);
  const lastThree = state.recentActions.slice(-3);
  const varietyBonus = lastThree.length === 3 && new Set(lastThree).size === 3;

  const actionRoutes = {
    antiPoacher: { enforcement: 2 },
    houndScout: { research: 1, enforcement: 1 },
    habitat: { ecology: 2 },
    intervention: { ecology: 1, research: 1 },
    exploreMaterials: { research: 1, community: 1 },
    salvage: { research: 1 },
    buySupplies: { community: 1 }
  }[action] || {};
  if (meaningful) {
    STRATEGY_ROUTE_IDS.forEach((route) => {
      const decay = actionRoutes[route] ? 0 : 1;
      state.routeScores[route] = Math.max(0, Math.round((state.routeScores[route] - decay) * 10) / 10);
    });
    Object.keys(actionRoutes).forEach((route) => {
      state.routeScores[route] = Math.min(MAX_ROUTE_SCORE, Math.round((state.routeScores[route] + actionRoutes[route]) * 10) / 10);
    });
  }
  state.dominantRoute = dominantRouteFor(state.routeScores);

  if (penalty > 0) {
    if (action === "houndScout" || action === "antiPoacher") addMetric(reserve, "poacherPressure", penalty * 2);
    if (action === "houndScout") addMetric(reserve, "intel", -penalty);
    if (action === "habitat") {
      addMetric(reserve, "water", -penalty * 2);
      addMetric(reserve, "grass", -penalty * 2);
    }
    if (action === "intervention") addMetric(reserve, "grass", -penalty * 2);
    // 重复行动已经通过收益衰减结算，不能再暗扣补给或草场。
  }
  if (varietyBonus) {
    addMetric(reserve, "fund", 20);
    addMetric(reserve, "reputation", 2);
  }

  const route = STRATEGY_ROUTES[state.dominantRoute] || STRATEGY_ROUTES.balanced;
  if (meaningful && route.id === "enforcement") {
    if (action === "houndScout" || action === "antiPoacher") addMetric(reserve, "poacherPressure", -2);
    if (action === "antiPoacher") addMetric(reserve, "reputation", -2);
    if (action === "habitat") addMetric(reserve, "grass", -1);
  } else if (meaningful && route.id === "ecology") {
    if (action === "habitat" || action === "intervention") {
      if (((reserve.ecology || {}).water || 0) < 75) addMetric(reserve, "water", 2);
      addMetric(reserve, "grass", 2);
      // “生态韧性”的配置说明包含降低疾病，但旧被动只修水草，导致
      // 生态路线在疾病阶段反而需要比其他路线多做一轮干预。把恢复栖息地
      // 带来的环境减压和直接干预的疾病控制显式结算，保持路线语义一致，
      // 同时只给 1/2 点的小幅收益，避免形成固定最优解。
      addMetric(reserve, "disease", action === "intervention" ? -2 : -1);
    }
    if (action === "habitat") {
      addMetric(reserve, "poacherPressure", -2);
      if ((reserve.safety || 0) < 60) addMetric(reserve, "safety", 2);
      if ((reserve.reputation || 0) < 45) addMetric(reserve, "reputation", 1);
    }
    if (action === "antiPoacher") addMetric(reserve, "poacherPressure", 1);
  } else if (meaningful && route.id === "research") {
    if (action === "houndScout") {
      addMetric(reserve, "intel", 1);
      addMetric(reserve, "poacherPressure", -1);
      if ((reserve.safety || 0) < 60) addMetric(reserve, "safety", 1);
    }
    if (action === "salvage") addPendingRecovered(reserve, "researchSample", 1);
    // 科研路线的核心产出来自现场记录。每两次有效侦察/探索形成一件
    // 可移交样本；健康基金以上不再享受低存量拨款加成，避免无限造钱。
    if ((action === "houndScout" || action === "exploreMaterials")
      && state.totalMeaningfulActions % 2 === 0) {
      addPendingRecovered(reserve, "researchSample", 1);
    }
  } else if (meaningful && route.id === "community") {
    addMetric(reserve, "reputation", 2);
    addMetric(reserve, "stability", 1);
    // 社区路线的采购会同步补充沿线联络点，以持续报告压低边界风险。
    if (action === "buySupplies") addMetric(reserve, "poacherPressure", -3);
    if (action === "intervention") {
      addMetric(reserve, "disease", -3);
    }
    if (action === "exploreMaterials") {
      addMetric(reserve, "poacherPressure", -2);
      if ((reserve.safety || 0) < 60) addMetric(reserve, "safety", 2);
    }
  }

  const consequenceEffects = [];
  state.consequences = state.consequences.map((item) => {
    applyModifiers(reserve, item.modifiers || {});
    consequenceEffects.push(item.label);
    return Object.assign({}, item, { remainingActions: Math.max(0, (item.remainingActions || 0) - 1) });
  }).filter((item) => item.remainingActions > 0);

  state.lastRhythm = {
    action,
    repeatCount,
    penalty,
    meaningful,
    varietyBonus,
    consequenceEffects,
    route: route.id,
    routeLabel: route.label,
    summary: penalty > 0
      ? `连续第${repeatCount}次执行同类行动，边际效果衰减${penalty}级。`
      : varietyBonus
        ? "连续三次采用不同手段，获得协同经营奖励。"
        : `本次计入有效经营；当前方针：${route.label}。`
  };
  reserve.strategy = state;
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    totalMeaningfulActions: state.totalMeaningfulActions,
    totalStrategicChoices: state.totalChoices,
    totalMajorStrategicChoices: state.totalMajorChoices
  });
  return state.lastRhythm;
}

function strategicDilemmaById(id) {
  return STRATEGIC_DILEMMAS.find((item) => item.id === id) || null;
}

function dilemmaOccurrenceCount(state, id, chapter = null) {
  return (state.choiceHistory || []).filter((item) => item.dilemmaId === id && (chapter == null || item.chapter === chapter)).length;
}

function maybePrepareStrategicDilemma(reserve, context = {}, random = Math.random) {
  const state = normalizeStrategyState(reserve.strategy);
  if (state.pendingDilemma) {
    reserve.strategy = state;
    return state.pendingDilemma;
  }
  const totalActions = Math.max(0, context.meaningfulActions == null
    ? state.totalMeaningfulActions
    : context.meaningfulActions);
  const chapter = Math.max(1, ((reserve.progression || {}).level) || 1);
  const animalTrust = Math.max(0, Math.min(100, context.animalTrust == null ? (reserve.reputation || 50) : context.animalTrust));
  const seasonName = ((reserve.seasonState || {}).name) || context.season || "雨季";
  const chapterRecords = (state.choiceHistory || []).filter((record) => record.chapter === chapter);
  const chapterTarget = STRATEGY_CHAPTER_TARGETS[chapter] || STRATEGY_CHAPTER_TARGETS[5];
  const storedChapterChoices = Number.isFinite((reserve.progression || {}).chapterStrategicChoices) ? reserve.progression.chapterStrategicChoices : 0;
  const storedChapterMajorChoices = Number.isFinite((reserve.progression || {}).chapterMajorStrategicChoices) ? reserve.progression.chapterMajorStrategicChoices : 0;
  const chapterChoiceCount = Math.max(storedChapterChoices, chapterRecords.length);
  const chapterMajorChoiceCount = Math.max(storedChapterMajorChoices, chapterRecords.filter((record) => record.tier === "major").length);
  if (totalActions - state.lastDilemmaAction < 2) {
    reserve.strategy = state;
    return null;
  }
  const lastDilemmaId = (state.choiceHistory[state.choiceHistory.length - 1] || {}).dilemmaId;
  const lastChapterFor = (id) => {
    const record = (state.choiceHistory || []).slice().reverse().find((item) => item.dilemmaId === id && Number.isFinite(item.chapter));
    return record ? record.chapter : -99;
  };
  const eligible = STRATEGIC_DILEMMAS.filter((item) => dilemmaOccurrenceCount(state, item.id) < (item.maxOccurrences || (item.tier === "major" ? 1 : 5))
    && dilemmaOccurrenceCount(state, item.id, chapter) < (item.maxOccurrencesPerChapter || Number.MAX_SAFE_INTEGER)
    && chapter - lastChapterFor(item.id) >= (item.minChapterRepeatGap || 0)
    && item.id !== lastDilemmaId
    && chapter >= item.minChapter
    && totalActions >= item.minActions
    && (!item.seasons || item.seasons.includes(seasonName))
    && (item.minAnimalTrust == null || animalTrust >= item.minAnimalTrust)
    && (!item.requiresDilemmaId || (state.choiceHistory || []).some((record) => record.dilemmaId === item.requiresDilemmaId))
    && (!item.routeRequirement || (state.routeScores[item.routeRequirement] || 0) >= 12)
    && (!item.eligible || item.eligible(reserve, context)));
  const tacticalGap = 3 + ((chapter + state.totalTacticalChoices) % 3);
  const majorGap = 10 + ((chapter + state.totalMajorChoices) % 5);
  const tacticalReady = totalActions - state.lastTacticalAction >= tacticalGap;
  const majorReady = totalActions - state.lastMajorAction >= majorGap;
  const majorCandidates = chapterMajorChoiceCount < chapterTarget.major ? eligible.filter((item) => item.tier === "major") : [];
  const tacticalCandidates = chapterChoiceCount < chapterTarget.total ? eligible.filter((item) => item.tier === "tactical") : [];
  const tier = majorReady && majorCandidates.length ? "major" : tacticalReady && tacticalCandidates.length ? "tactical" : "";
  const candidates = tier === "major" ? majorCandidates : tier === "tactical" ? tacticalCandidates : [];
  if (!candidates.length) {
    state.tacticalWait += tacticalCandidates.length ? 1 : 0;
    state.majorWait += majorCandidates.length ? 1 : 0;
    reserve.strategy = state;
    return null;
  }
  const weightedCandidates = candidates.map((item) => {
    const lastChapter = lastChapterFor(item.id);
    const weight = lastChapter < 0 ? 1.4 : lastChapter === chapter - 1 ? 0.35 : 1;
    return { item, weight };
  });
  const totalWeight = weightedCandidates.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999, random())) * totalWeight;
  let selected = weightedCandidates[weightedCandidates.length - 1].item;
  for (let index = 0; index < weightedCandidates.length; index += 1) {
    cursor -= weightedCandidates[index].weight;
    if (cursor < 0) {
      selected = weightedCandidates[index].item;
      break;
    }
  }
  const parentRecord = selected.requiresDilemmaId
    ? (state.choiceHistory || []).slice().reverse().find((record) => record.dilemmaId === selected.requiresDilemmaId)
    : null;
  state.pendingDilemma = {
    id: selected.id,
    tier: selected.tier,
    day: Math.max(1, context.day || 1),
    actionIndex: totalActions,
    chapter,
    guaranteed: true,
    occurrence: dilemmaOccurrenceCount(state, selected.id) + 1,
    sourceChoiceId: parentRecord && parentRecord.choiceId,
    sourceRoute: parentRecord && parentRecord.route
  };
  state.pendingSelection = null;
  state.pendingRoll = null;
  state.dilemmaWait = 0;
  if (tier === "major") state.majorWait = 0;
  else state.tacticalWait = 0;
  reserve.strategy = state;
  return state.pendingDilemma;
}

function metricSnapshot(reserve) {
  const ecology = reserve.ecology || {};
  const supplies = reserve.supplies || {};
  return {
    fund: reserve.fund || 0,
    safety: reserve.safety || 0,
    stability: reserve.stability || 0,
    reputation: reserve.reputation || 0,
    enforcement: reserve.enforcement || 0,
    poacherPressure: reserve.poacherPressure || 0,
    intel: reserve.intel || 0,
    business: reserve.business || 0,
    water: ecology.water || 0,
    grass: ecology.grass || 0,
    disease: ecology.disease || 0,
    migrationDelta: (reserve.migration || {}).delta || 0
    ,researchSamples: ((reserve.pendingRecovered || {}).researchSample) || 0
    ,supplyTotal: Object.keys(supplies).reduce((sum, key) => sum + (supplies[key] || 0), 0)
  };
}

const METRIC_LABELS = {
  fund: "基金",
  safety: "动物安全感",
  stability: "生态稳定",
  reputation: "共护关系",
  enforcement: "边界控制",
  poacherPressure: "偷猎",
  intel: "调查记录",
  business: "协作效率",
  water: "水源",
  grass: "草场",
  disease: "疾病",
  migrationDelta: "迁移"
  ,researchSamples: "待收研究样本"
  ,supplyTotal: "巡护补给"
};

function effectPreview(choice) {
  return Object.keys(choice.effects || {}).filter((key) => key !== "intel").map((key) => {
    const value = choice.effects[key];
    if (key === "fund") {
      const amount = Math.max(1, Math.ceil(Math.abs(value) / 100));
      return value > 0 ? `待收研究样本 +${amount}` : `巡护补给 -${amount}`;
    }
    return `${METRIC_LABELS[key] || key} ${value > 0 ? "+" : ""}${value}`;
  }).join(" / ");
}

function isPositiveEffect(key, value) {
  if (key === "poacherPressure" || key === "disease") return value < 0;
  return value > 0;
}

function adjustedEffectsFor(reserve, dilemma, choice, effects) {
  const state = normalizeStrategyState(reserve.strategy);
  const currentRoute = state.dominantRoute || "balanced";
  const pending = state.pendingDilemma || {};
  const routeAligned = currentRoute !== "balanced" && currentRoute === choice.route;
  const chainAligned = !!pending.sourceRoute && pending.sourceRoute === choice.route;
  const multiplier = routeAligned ? 1.2 : chainAligned ? 1.1 : 1;
  const adjusted = {};
  Object.keys(effects || {}).forEach((key) => {
    const value = effects[key];
    if (multiplier === 1) adjusted[key] = value;
    else if (isPositiveEffect(key, value)) adjusted[key] = Math.round(value * multiplier);
    else if (key === "fund" && value < 0 && routeAligned) adjusted[key] = Math.round(value * 0.9);
    else adjusted[key] = value;
  });
  return { effects: adjusted, routeAligned, chainAligned, multiplier };
}

function strategicResourceShortfall(reserve, effects) {
  return {
    fund: 0,
    intel: 0,
    stabilityPenalty: 0,
    reputationPenalty: 0,
    poacherPenalty: 0
  };
}

function effectsWithShortfallPenalty(reserve, effects) {
  const adjusted = Object.assign({}, effects || {});
  const shortfall = strategicResourceShortfall(reserve, adjusted);
  if (shortfall.stabilityPenalty) adjusted.stability = (adjusted.stability || 0) - shortfall.stabilityPenalty;
  if (shortfall.reputationPenalty) adjusted.reputation = (adjusted.reputation || 0) - shortfall.reputationPenalty;
  if (shortfall.poacherPenalty) adjusted.poacherPressure = (adjusted.poacherPressure || 0) + shortfall.poacherPenalty;
  return { effects: adjusted, shortfall };
}

function strategicDicePreview(reserve, dilemma, choice) {
  const adjusted = adjustedEffectsFor(reserve, dilemma, choice, choice.effects || {});
  const routeModifier = adjusted.routeAligned || adjusted.chainAligned ? 1 : 0;
  const supplies = reserve.supplies || {};
  const ecology = reserve.ecology || {};
  const resourceModifier = Object.keys(supplies).reduce((sum, key) => sum + (supplies[key] || 0), 0) >= 4
    || Math.min(ecology.water || 0, ecology.grass || 0) >= 70 ? 1 : 0;
  return {
    sides: 6,
    threshold: (choice.dice && choice.dice.threshold) || 5,
    routeModifier,
    resourceModifier,
    maxTotal: 6 + routeModifier + resourceModifier
  };
}

function selectStrategicChoice(reserve, dilemmaId, choiceId) {
  const state = normalizeStrategyState(reserve.strategy);
  const dilemma = strategicDilemmaById(dilemmaId || (state.pendingDilemma && state.pendingDilemma.id));
  const selected = dilemma && dilemma.choices.find((item) => item.id === choiceId);
  if (!dilemma || !selected || !state.pendingDilemma || state.pendingDilemma.id !== dilemma.id) return null;
  state.pendingSelection = { dilemmaId: dilemma.id, choiceId: selected.id, selectedAt: state.pendingDilemma.actionIndex || 0 };
  reserve.strategy = state;
  return state.pendingSelection;
}

function setPendingStrategicRoll(reserve, rollState) {
  const state = normalizeStrategyState(reserve.strategy);
  state.pendingRoll = rollState ? Object.assign({}, rollState) : null;
  reserve.strategy = state;
  return state.pendingRoll;
}

function applyStrategicChoice(reserve, dilemmaId, choiceId, diceResult = null) {
  const state = normalizeStrategyState(reserve.strategy);
  const dilemma = strategicDilemmaById(dilemmaId || (state.pendingDilemma && state.pendingDilemma.id));
  const choice = dilemma && dilemma.choices.find((item) => item.id === choiceId);
  if (!dilemma || !choice) return null;
  if (choice.dice && !diceResult) {
    return {
      requiresDice: true,
      dilemma,
      choice,
      dice: strategicDicePreview(reserve, dilemma, choice)
    };
  }
  const before = metricSnapshot(reserve);
  const dice = choice.dice ? strategicDicePreview(reserve, dilemma, choice) : null;
  const diceTotal = diceResult ? Math.max(1, Math.min(6, Math.round(diceResult.roll || 1))) + ((diceResult.routeModifier == null ? dice.routeModifier : diceResult.routeModifier) || 0) + ((diceResult.resourceModifier == null ? dice.resourceModifier : diceResult.resourceModifier) || 0) : 0;
  const diceSuccess = !choice.dice || diceTotal >= dice.threshold;
  const rawEffects = diceSuccess ? (choice.effects || {}) : (choice.failureEffects || failureEffectsFor(choice.effects || {}));
  const adjusted = adjustedEffectsFor(reserve, dilemma, choice, rawEffects);
  if (typeof adjusted.effects.fund === "number") {
    adjusted.effects.fund = Math.round(adjusted.effects.fund * (adjusted.effects.fund >= 0 ? BALANCE_V2.tuning.strategyRewardScale : BALANCE_V2.tuning.strategyCostScale));
  }
  const resourceAdjusted = effectsWithShortfallPenalty(reserve, adjusted.effects);
  applyModifiers(reserve, resourceAdjusted.effects);
  const routeGain = dilemma.tier === "major" ? 4 : 2;
  STRATEGY_ROUTE_IDS.forEach((route) => {
    const transitionCost = route === choice.route ? 0 : (dilemma.tier === "major" ? 3 : 2);
    state.routeScores[route] = Math.max(0, Math.round(((state.routeScores[route] || 0) - transitionCost) * 10) / 10);
  });
  state.routeScores[choice.route] = Math.min(MAX_ROUTE_SCORE, (state.routeScores[choice.route] || 0) + routeGain);
  state.totalChoices += 1;
  if (dilemma.tier === "major") state.totalMajorChoices += 1;
  else state.totalTacticalChoices += 1;
  state.dominantRoute = dominantRouteFor(state.routeScores);
  if (choice.consequence) state.consequences.push(Object.assign({}, choice.consequence, { modifiers: Object.assign({}, choice.consequence.modifiers || {}) }));
  const namedIndividual = state.pendingDilemma && state.pendingDilemma.namedIndividual ? Object.assign({}, state.pendingDilemma.namedIndividual) : null;
  const record = {
    dilemmaId: dilemma.id,
    dilemmaTitle: dilemma.title,
    choiceId: choice.id,
    choiceLabel: choice.label,
    route: choice.route,
    tier: dilemma.tier || "major",
    chapter: (state.pendingDilemma && state.pendingDilemma.chapter) || Math.max(1, ((reserve.progression || {}).level) || 1),
    day: (state.pendingDilemma && state.pendingDilemma.day) || 1,
    occurrence: (state.pendingDilemma && state.pendingDilemma.occurrence) || (dilemmaOccurrenceCount(state, dilemma.id) + 1),
    outcome: diceSuccess ? choice.outcome : `高风险方案未达到目标点数：${choice.outcome}`,
    dice: choice.dice ? { roll: diceResult.roll, total: diceTotal, threshold: dice.threshold, success: diceSuccess } : null,
    namedIndividual
  };
  state.choiceHistory = state.choiceHistory.concat(record).slice(-80);
  state.lastDilemmaAction = (state.pendingDilemma && state.pendingDilemma.actionIndex) || state.lastDilemmaAction;
  state.lastChoiceAction = state.lastDilemmaAction;
  if (dilemma.tier === "major") state.lastMajorAction = state.lastDilemmaAction;
  else state.lastTacticalAction = state.lastDilemmaAction;
  state.chainFlags[dilemma.id] = choice.id;
  state.pendingDilemma = null;
  state.pendingSelection = null;
  state.pendingRoll = null;
  state.dilemmaWait = 0;
  reserve.strategy = state;
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    totalMeaningfulActions: state.totalMeaningfulActions,
    totalStrategicChoices: state.totalChoices,
    totalMajorStrategicChoices: state.totalMajorChoices
  });
  const after = metricSnapshot(reserve);
  const changes = Object.keys(after).map((key) => ({
    key,
    label: METRIC_LABELS[key] || key,
    before: before[key],
    after: after[key],
    delta: after[key] - before[key]
  })).filter((item) => item.delta !== 0);
  return {
    dilemma,
    choice,
    record,
    before,
    after,
    changes,
    route: STRATEGY_ROUTES[state.dominantRoute] || STRATEGY_ROUTES.balanced,
    routeScores: Object.assign({}, state.routeScores),
    namedIndividual,
    routeGain,
    routeAligned: adjusted.routeAligned,
    chainAligned: adjusted.chainAligned,
    resourceShortfall: resourceAdjusted.shortfall,
    consequence: choice.consequence || null,
    dice: choice.dice ? { roll: diceResult.roll, total: diceTotal, threshold: dice.threshold, success: diceSuccess, routeModifier: dice.routeModifier, resourceModifier: dice.resourceModifier } : null
  };
}

module.exports = {
  STRATEGY_ROUTES,
  STRATEGIC_DILEMMAS,
  normalizeStrategyState,
  strategyRoute,
  recordStrategicAction,
  maybePrepareStrategicDilemma,
  strategicDilemmaById,
  effectPreview,
  adjustedEffectsFor,
  strategicResourceShortfall,
  strategicChoiceExpectedValue,
  strategicDicePreview,
  selectStrategicChoice,
  setPendingStrategicRoll,
  applyStrategicChoice,
  metricSnapshot
};
