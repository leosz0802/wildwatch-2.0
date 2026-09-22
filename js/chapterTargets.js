// species, animals, visitors. Animal totals count rescued herds, so each
// gate sits above a single chapter rescue (ch1: antelope 45 → ~125 live).
// Chapter 10 stays under the typical level-5 water/grass cap (~814).
// From chapter 3, species gates match the live count after that chapter's required rescues.
// From chapter 10, both newly introduced species are required unlocks (not one free + one rescue).
const { livingAnimalTotal, chapterCaptiveSpeciesSet } = require("./chapterRescueSystem");

const TARGETS = Object.freeze([
  // 第1–2章保持开局节奏。第3章起拉高动物/游客门槛，拉长通关时间。
  // 游客关卡合同不变：两次免费招募即使生态很好也不过关；本章特别任务
  // 加上两次免费招募仍不过关。建筑/日常任务只作补差。
  [7, 180, 95], [7, 220, 145], [9, 320, 315], [11, 390, 405], [12, 470, 495],
  [14, 555, 595], [16, 630, 695], [18, 700, 795], [20, 745, 900], [22, 820, 1000],
  [24, 845, 1100], [24, 870, 1200], [25, 895, 1310], [25, 920, 1410], [25, 945, 1510],
  [27, 970, 1610], [29, 995, 1710], [31, 1020, 1810], [33, 1045, 1910], [33, 1070, 2010]
]);

const CHAPTER_VISITOR_CARRYOVER_RATIO = 0.1;
const LATE_CHAPTER_VISITOR_CARRYOVER_RATIO = CHAPTER_VISITOR_CARRYOVER_RATIO;
// 产品口径：所有章节只把上一章结束游客总数的 10% 带入，避免跨章游客
// 直接完成当前门槛；剩余进度来自本章招募、设施到访、剧情和任务。
// 游客门槛是本章 HUD（继承 + 本章招募/到访/任务），不是生涯累计。
// 快玩靠广告把 6 分钟恢复压缩成当场第三次/第四次招募；慢玩只靠时长恢复和经营。
const LATE_CHAPTER_VISITOR_CARRYOVER_STAGE = 14;
const VISITOR_SOURCE_BUCKETS = Object.freeze({
  recruit: "recruitedVisitors",
  migrate: "migratedVisitors",
  visit: "facilityVisitors",
  task: "taskVisitors",
  share: "shareVisitors"
});

// 每章游客账目自持：本章总数 = 继承（上一章结束总数 ×10%）+ 本章各来源 − 本章流失。
// 记录保存在 development.operations 上，而不是 progression.chapterStart：
// reserveProgressionFor 在章节推进时会整体重建 chapterStart，新对象不带任何游客
// 字段，旧的“生涯总数 − 章节基线”推导会因此先把继承和本章招募清零，再被下一次
// 任务重新推高，表现为反复横跳；两条口径不同步时还会多出“待分类”。
const CHAPTER_VISITOR_GAIN_BUCKETS = Object.freeze([
  "recruitedVisitors", "migratedVisitors", "facilityVisitors", "taskVisitors", "shareVisitors"
]);

function emptyChapterVisitorRecord(stage = 1) {
  return {
    stage: Math.max(1, Math.round(Number(stage) || 1)),
    inherited: 0,
    legacySeed: 0,
    start: emptyVisitorLedgerSnapshot(),
    startLifetime: 0
  };
}

function normalizeChapterVisitorRecord(saved = {}, stage = 1) {
  return {
    stage: Math.max(1, Math.round(Number(saved.stage || stage) || 1)),
    inherited: wholeVisitors(saved.inherited),
    legacySeed: wholeVisitors(saved.legacySeed),
    start: normalizeVisitorFlowLedger(saved.start || {}),
    startLifetime: wholeVisitors(saved.startLifetime)
  };
}

function persistChapterVisitorRecord(reserve, record) {
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  operations.chapterVisitors = record;
  writeChapterVisitorCheckpoint(reserve, {
    stage: record.stage,
    inheritedVisitors: record.inherited
  });
  return record;
}

// 本章各来源 = 当前账本 − 本章起点账本快照。总数由同一组桶相加得到，
// 因此“继承 + 各来源 − 流失”必然等于总数，结构上不可能再出现“待分类”。
function chapterVisitorGains(reserve = {}, record = {}) {
  const live = normalizeVisitorFlowLedger((((reserve.development || {}).operations || {}).visitorLedger) || {});
  const start = normalizeVisitorFlowLedger(record.start || {});
  const gained = (key) => Math.max(0, wholeVisitors(live[key]) - wholeVisitors(start[key]));
  const gains = {};
  CHAPTER_VISITOR_GAIN_BUCKETS.concat(["lostVisitors"]).forEach((key) => { gains[key] = gained(key); });
  // 有些存档和外部写入只更新了生涯总数，没有分来源账本。此时按来源相加会得到
  // 0，游客看起来凭空消失，所以退回“生涯总数 − 本章起点生涯数”，统一记作到访。
  // 只在账本一条本章流水都没有时兜底：账本一旦有数据就以账本为准，否则会把
  // 上一章的人数重新带进本章。
  const hasFlow = CHAPTER_VISITOR_GAIN_BUCKETS.some((key) => gains[key] > 0) || gains.lostVisitors > 0;
  if (!hasFlow) {
    const legacyGain = Math.max(0, reserveLifetimeVisitors(reserve) - wholeVisitors(record.startLifetime));
    if (legacyGain > 0) gains.facilityVisitors = legacyGain;
  }
  return gains;
}

function chapterVisitorRecordTotal(reserve = {}, record = {}) {
  const gains = chapterVisitorGains(reserve, record);
  const earned = CHAPTER_VISITOR_GAIN_BUCKETS.reduce((sum, key) => sum + gains[key], 0);
  return Math.max(0, wholeVisitors(record.inherited) + wholeVisitors(record.legacySeed) + earned - gains.lostVisitors);
}

function legacyChapterVisitorInherit(stage = 1) {
  const current = Math.max(1, Math.round(Number(stage) || 1));
  if (current <= 1) return 0;
  return chapterVisitorCarryover(chapterTargets(current - 1).visitors, current);
}

function legacyChapterVisitorSeedTotal(reserve = {}, stage = 1) {
  const current = Math.max(1, Math.round(Number(stage) || 1));
  const inherit = legacyChapterVisitorInherit(current);
  if (current <= 1) return 0;
  const lifetime = reserveLifetimeVisitors(reserve);
  const target = chapterTargets(current).visitors;
  // 第5章以后的老档，旧版游客 HUD 往往是生涯累计。已经够本章门槛的，
  // 本章至少补到过关，但不能把几万生涯人数写进本章数字。
  if (current >= 5 && lifetime >= target) return target;
  return inherit;
}

function recoverLegacyInheritedVisitors(reserve = {}, record = {}, stage = 1) {
  const current = Math.max(1, Math.round(Number(stage) || 1));
  if (current <= 1) return 0;
  if (wholeVisitors(record.inherited) > 0) return wholeVisitors(record.inherited);
  const startLifetime = wholeVisitors(record.startLifetime);
  const carryover = chapterVisitorCarryover(startLifetime, current);
  if (carryover > 0) {
    const gains = chapterVisitorGains(reserve, record);
    const earned = CHAPTER_VISITOR_GAIN_BUCKETS.reduce((sum, key) => sum + gains[key], 0);
    const lifetimeGain = reserveLifetimeVisitors(reserve) - startLifetime;
    if (lifetimeGain - (earned - gains.lostVisitors) === carryover) return carryover;
  }
  return legacyChapterVisitorInherit(current);
}

function repairLegacyChapterVisitorRecord(reserve, record, stage) {
  const current = Math.max(1, Math.round(Number(stage) || 1));
  if (current <= 1 || wholeVisitors(record.inherited) > 0) return record;
  record.inherited = recoverLegacyInheritedVisitors(reserve, record, current);
  const seeded = legacyChapterVisitorSeedTotal(reserve, current);
  const currentTotal = chapterVisitorRecordTotal(reserve, record);
  if (seeded > currentTotal) {
    record.legacySeed = wholeVisitors(record.legacySeed) + (seeded - currentTotal);
  }
  return record;
}

function chapterExpectedMinutes(chapter = 1) {
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  if (n <= 1) return 4;
  if (n === 2) return 9;
  if (n <= 5) return 14;
  if (n <= 10) return 16;
  if (n <= 15) return 18;
  return 22;
}

function chapterTargets(chapter = 1) {
  const index = Math.max(0, Math.min(TARGETS.length - 1, Math.round(Number(chapter) || 1) - 1));
  const [species, animals, visitors] = TARGETS[index];
  return { species, animals, visitors, expectedMinutes: chapterExpectedMinutes(index + 1) };
}

function visitorOperationsPresent(reserve = {}) {
  const operations = ((reserve.development || {}).operations) || {};
  const visitorLedger = operations.visitorLedger || {};
  return Number.isFinite(Number(operations.totalVisitors))
    || Number.isFinite(Number(visitorLedger.totalVisitors));
}

function reserveLifetimeVisitors(reserve = {}) {
  const operations = ((reserve.development || {}).operations || {});
  const visitorLedger = operations.visitorLedger || {};
  const developmentLedger = ((reserve.development || {}).visitorLedger) || {};
  const nodeTotal = Object.values(((reserve.development || {}).nodes) || {}).reduce((sum, node) => (
    sum + wholeVisitors(((node || {}).visitorLedger || {}).totalVisitors)
  ), 0);
  const values = [Number(operations.totalVisitors), Number(visitorLedger.totalVisitors), Number(developmentLedger.totalVisitors), nodeTotal]
    .filter((value) => Number.isFinite(value) && Number(value) > 0);
  if (values.length) return Math.max(0, Math.round(Math.max(...values)));
  // Incomplete snapshots omit the visitor ledger. Treat lifetime as unchanged
  // so inherited + (lifetime - baseline) does not go negative and flash 0.
  const start = ((reserve.progression || {}).chapterStart)
    || ((reserve.progression || {}).stageStart)
    || {};
  const baseline = Number(start.totalVisitors);
  return Number.isFinite(baseline) && baseline > 0 ? Math.round(baseline) : 0;
}

function chapterVisitorCarryoverRatio(nextStage = 1) {
  return CHAPTER_VISITOR_CARRYOVER_RATIO;
}

function chapterVisitorCarryover(previousChapterTotal = 0, nextStage = 1) {
  return Math.max(0, Math.round((Number(previousChapterTotal) || 0) * chapterVisitorCarryoverRatio(nextStage)));
}

function liveChapterStage(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(progression.stage || progression.displayChapter || 1)));
}

function emptyVisitorLedgerSnapshot() {
  return {
    totalVisitors: 0,
    migratedVisitors: 0,
    recruitedVisitors: 0,
    facilityVisitors: 0,
    taskVisitors: 0,
    shareVisitors: 0,
    lostVisitors: 0
  };
}

function wholeVisitors(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeVisitorFlowLedger(saved = {}) {
  return {
    totalVisitors: wholeVisitors(saved.totalVisitors),
    migratedVisitors: wholeVisitors(saved.migratedVisitors),
    recruitedVisitors: wholeVisitors(saved.recruitedVisitors),
    facilityVisitors: wholeVisitors(saved.facilityVisitors),
    taskVisitors: wholeVisitors(saved.taskVisitors),
    shareVisitors: wholeVisitors(saved.shareVisitors),
    lostVisitors: wholeVisitors(saved.lostVisitors)
  };
}

function snapshotVisitorLedger(reserve = {}) {
  const ledger = normalizeVisitorFlowLedger((((reserve.development || {}).operations || {}).visitorLedger) || {});
  return Object.assign({}, ledger, {
    totalVisitors: reserveLifetimeVisitors(reserve)
  });
}

function rawChapterVisitorTotal(reserve = {}) {
  const lifetime = reserveLifetimeVisitors(reserve);
  const start = ((reserve.progression || {}).chapterStart)
    || ((reserve.progression || {}).stageStart)
    || {};
  const inherited = Math.max(0, Math.round(Number(start.inheritedVisitors) || 0));
  const baseline = Math.max(0, Math.round(Number(start.totalVisitors) || 0));
  return Math.max(0, Math.round(inherited + (lifetime - baseline)));
}

function writeChapterVisitorCheckpoint(reserve, fields = {}) {
  const progression = reserve.progression || (reserve.progression = {});
  const stage = Math.max(1, Math.round(Number(fields.stage || liveChapterStage(reserve))));
  const start = Object.assign({}, progression.chapterStart || {}, fields);
  if (fields.baselineLocked === true) start.baselineLocked = true;
  if (!start.visitorLedger) {
    start.visitorLedger = stage <= 1 ? emptyVisitorLedgerSnapshot() : snapshotVisitorLedger(reserve);
  }
  progression.chapterStart = start;
  progression.stageStart = Object.assign({}, progression.stageStart || {}, {
    stage: start.stage,
    totalVisitors: start.totalVisitors,
    inheritedVisitors: start.inheritedVisitors,
    baselineLocked: start.baselineLocked === true,
    visitorLedger: start.visitorLedger
  });
  return start;
}

function beginChapterVisitorCheckpoint(reserve = {}, nextStage, previousChapterTotal) {
  const stage = Math.max(1, Math.round(Number(nextStage) || liveChapterStage(reserve)));
  // 本章自持记录是唯一权威：只带入上一章结束总数的 10%，其余来源全部清零。
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const record = emptyChapterVisitorRecord(stage);
  record.inherited = stage <= 1 ? 0 : chapterVisitorCarryover(previousChapterTotal, stage);
  record.start = normalizeVisitorFlowLedger(operations.visitorLedger || {});
  record.startLifetime = reserveLifetimeVisitors(reserve);
  operations.chapterVisitors = record;
  if (operations.today && typeof operations.today === "object") {
    operations.today.hostedVisitors = 0;
    operations.today.hostedChapter = stage;
  }
  return writeChapterVisitorCheckpoint(reserve, {
    stage,
    totalVisitors: reserveLifetimeVisitors(reserve),
    inheritedVisitors: stage <= 1 ? 0 : chapterVisitorCarryover(previousChapterTotal, stage),
    visitorLedger: snapshotVisitorLedger(reserve),
    baselineLocked: true
  });
}

// A legacy save can contain a lifetime visitor total but no trustworthy
// checkpoint for the chapter that is currently displayed.  The old repair
// path inferred progress from the chapter target (target × 1.5), which made
// every visitor recruited in earlier chapters appear in the new chapter.  We
// cannot recover the missing historical boundary, so start this chapter at
// the current lifetime total and let new deltas be the only progress.
function resetLegacyChapterVisitorCheckpoint(reserve, stage) {
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const record = emptyChapterVisitorRecord(stage);
  record.start = normalizeVisitorFlowLedger(operations.visitorLedger || {});
  record.startLifetime = reserveLifetimeVisitors(reserve);
  repairLegacyChapterVisitorRecord(reserve, record, stage);
  operations.chapterVisitors = record;
  if (operations.today && typeof operations.today === "object") {
    operations.today.hostedVisitors = 0;
    operations.today.hostedChapter = stage;
  }
  return writeChapterVisitorCheckpoint(reserve, {
    stage,
    totalVisitors: record.startLifetime,
    inheritedVisitors: record.inherited,
    visitorLedger: snapshotVisitorLedger(reserve),
    baselineLocked: true
  });
}

function ensureChapterVisitorCheckpoint(reserve = {}) {
  if (!reserve || typeof reserve !== "object") {
    return { stage: 1, totalVisitors: 0, inheritedVisitors: 0, visitorLedger: emptyVisitorLedgerSnapshot() };
  }
  const progression = reserve.progression || (reserve.progression = {});
  const stage = liveChapterStage(reserve);
  const existing = ((reserve.development || {}).operations || {}).chapterVisitors;
  if (existing && Math.round(Number(existing.stage) || 0) === stage) {
    return writeChapterVisitorCheckpoint(reserve, {
      stage,
      totalVisitors: wholeVisitors(existing.startLifetime),
      inheritedVisitors: wholeVisitors(existing.inherited),
      visitorLedger: existing.start || snapshotVisitorLedger(reserve),
      baselineLocked: true
    });
  }
  const start = progression.chapterStart || progression.stageStart || {};
  const startStage = Math.max(1, Math.round(Number(start.stage) || 1));
  const lifetime = reserveLifetimeVisitors(reserve);
  const hasInherited = Object.prototype.hasOwnProperty.call(start, "inheritedVisitors");
  const hasLifetime = Object.prototype.hasOwnProperty.call(start, "totalVisitors");

  if (startStage !== stage) {
    if (stage <= 1) {
      return writeChapterVisitorCheckpoint(reserve, {
        stage: 1,
        totalVisitors: 0,
        inheritedVisitors: 0,
        visitorLedger: emptyVisitorLedgerSnapshot()
      });
    }
    // If the saved checkpoint is still the stage-1 default (baseline 0), the
    // current lifetime total belongs to earlier play and cannot be carried
    // into this chapter.  Reset it before calculating any 10% carryover.
    if (!hasLifetime || Math.max(0, Math.round(Number(start.totalVisitors) || 0)) === 0) {
      return resetLegacyChapterVisitorCheckpoint(reserve, stage);
    }
    const previousTotal = rawChapterVisitorTotal(reserve);
    return beginChapterVisitorCheckpoint(reserve, stage, previousTotal);
  }

  if (!hasInherited) {
    if (stage <= 1) {
      return writeChapterVisitorCheckpoint(reserve, {
        stage,
        totalVisitors: hasLifetime ? Math.max(0, Math.round(Number(start.totalVisitors) || 0)) : 0,
        inheritedVisitors: 0,
        visitorLedger: start.visitorLedger || emptyVisitorLedgerSnapshot()
      });
    }
    // A chapter with no inherited field is from an older save format.  Keep a
    // known lifetime baseline when it exists; when it is zero/absent, use the
    // current lifetime as the baseline.  Neither case can justify inventing a
    // 10% carryover, because the previous chapter total is unknown.
    if (!hasLifetime || Math.max(0, Math.round(Number(start.totalVisitors) || 0)) === 0) {
      return resetLegacyChapterVisitorCheckpoint(reserve, stage);
    }
    return writeChapterVisitorCheckpoint(reserve, {
      stage,
      totalVisitors: Math.max(0, Math.round(Number(start.totalVisitors) || 0)),
      inheritedVisitors: legacyChapterVisitorInherit(stage),
      visitorLedger: start.visitorLedger || snapshotVisitorLedger(reserve)
    });
  }

  if (!hasLifetime) {
    if (lifetime <= 0 && !visitorOperationsPresent(reserve)) return start;
    return writeChapterVisitorCheckpoint(reserve, {
      stage,
      totalVisitors: 0,
      inheritedVisitors: Math.max(0, Math.round(Number(start.inheritedVisitors) || 0)),
      visitorLedger: start.visitorLedger || emptyVisitorLedgerSnapshot()
    });
  }

  // A same-stage legacy snapshot can still carry the default zero baseline
  // and inherited field.  Treat it exactly like the stage-mismatch case: the
  // chapter starts at zero and no prior lifetime visitors are reclassified.
  if (stage > 1
    && lifetime > 0
    && Math.max(0, Math.round(Number(start.totalVisitors) || 0)) === 0
    && !start.baselineLocked
    && (Math.max(0, Math.round(Number(start.inheritedVisitors) || 0)) === 0
      || wholeVisitors(start.visitorLedger && start.visitorLedger.totalVisitors) > 0)) {
    return resetLegacyChapterVisitorCheckpoint(reserve, stage);
  }

  if (!start.visitorLedger) {
    return writeChapterVisitorCheckpoint(reserve, {
      // Preserve the chapter boundary even when a legacy save omitted only
      // the per-source ledger.  Starting from the current snapshot prevents
      // old recruitment buckets from being shown as this chapter's activity.
      visitorLedger: snapshotVisitorLedger(reserve)
    });
  }

  return start;
}

// 旧存档没有自持记录，只能从“章节起点账本 → 当前账本”的差值还原本章各来源。
// 这里刻意用各来源之和，而不是生涯总数差值：后者会把上一章残留的人数一起算进
// 本章（界面上就是那一条“待分类”），前者天然只包含本章真正发生过的流水。
// 旧存档没有自持记录：先跑一遍既有的检查点修复，再用修复后的基线做本章起点。
// 旧档里“章节起点缺失 / 仍是第1章默认值”这类形态必须继续判为本章 0 进度，
// 不能把更早章节的人数算成本章成绩。
function legacyChapterVisitorRecord(reserve = {}, stage = 1) {
  const checkpoint = ensureChapterVisitorCheckpoint(reserve) || {};
  const existing = ((reserve.development || {}).operations || {}).chapterVisitors;
  if (existing && Math.round(Number(existing.stage) || 0) === stage) {
    return repairLegacyChapterVisitorRecord(reserve, normalizeChapterVisitorRecord(existing, stage), stage);
  }
  const record = emptyChapterVisitorRecord(stage);
  record.inherited = stage > 1 ? wholeVisitors(checkpoint.inheritedVisitors) : 0;
  record.start = normalizeVisitorFlowLedger(checkpoint.visitorLedger || {});
  record.startLifetime = wholeVisitors(checkpoint.totalVisitors);
  return repairLegacyChapterVisitorRecord(reserve, record, stage);
}

function ensureChapterVisitorRecord(reserve = {}) {
  if (!reserve || typeof reserve !== "object") return emptyChapterVisitorRecord(1);
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const stage = liveChapterStage(reserve);
  ensureChapterVisitorCheckpoint(reserve);
  const saved = operations.chapterVisitors;
  if (saved && typeof saved === "object") {
    const record = normalizeChapterVisitorRecord(saved, stage);
    if (record.stage === stage) {
      return persistChapterVisitorRecord(reserve, repairLegacyChapterVisitorRecord(reserve, record, stage));
    }
  }
  return persistChapterVisitorRecord(reserve, legacyChapterVisitorRecord(reserve, stage));
}

function chapterVisitorTotal(reserve = {}) {
  return chapterVisitorRecordTotal(reserve, ensureChapterVisitorRecord(reserve));
}

// 当日客流里真正被计入本章总数的人数。事件/剧情的负向变化只能在这个范围内
// 生效——它们影响的是“今天来的人”，不该动本章此前攒下的存量。
// 返回 null 表示这份数据从未跟踪过当日贡献（旧存档，或外部直接写了 today）。
// 调用方遇到 null 时退回旧口径按当日客流计算，避免旧档的事件反馈整个失效。
function todayChapterContribution(reserve = {}) {
  const today = (((reserve.development || {}).operations) || {}).today || {};
  if (today.chapterGained === undefined || today.chapterGained === null) return null;
  return wholeVisitors(today.chapterGained);
}

// 当日客流有可能是别的模块直接写进 today 的（结算、事件脚本、旧存档），
// 从没经过账本。这些人必须先按来源登记进本章，之后才谈得上被事件扣减；
// 否则“当日贡献”是 0，负向反馈会整个失效。这里同时写生涯总数和来源桶——
// 早先的实现只写了生涯总数，差额就变成界面上的“待分类 N 人”。
function registerUntrackedTodayCrowd(reserve, operations, today, record) {
  if (today.chapterGained !== undefined && today.chapterGained !== null) return;
  const walked = wholeVisitors(today.visitors);
  const recruited = wholeVisitors(today.recruitedVisitors);
  const crowd = walked + recruited;
  today.chapterGained = crowd;
  if (!crowd) return;
  // 这批人可能已经部分记在账本或生涯总数里，两边各自只补自己的缺口，
  // 否则会重复计数。
  const gains = chapterVisitorGains(reserve, record);
  const booked = CHAPTER_VISITOR_GAIN_BUCKETS.reduce((sum, key) => sum + gains[key], 0);
  const bucketShortfall = Math.max(0, crowd - booked);
  if (bucketShortfall > 0) {
    const ledger = operations.visitorLedger = normalizeVisitorFlowLedger(operations.visitorLedger || {});
    const asRecruited = Math.min(bucketShortfall, recruited);
    ledger.recruitedVisitors = wholeVisitors(ledger.recruitedVisitors) + asRecruited;
    ledger.facilityVisitors = wholeVisitors(ledger.facilityVisitors) + (bucketShortfall - asRecruited);
    ledger.totalVisitors = Math.max(wholeVisitors(ledger.totalVisitors), reserveLifetimeVisitors(reserve));
  }
  const lifetimeShortfall = Math.max(0, crowd - Math.max(0, reserveLifetimeVisitors(reserve) - wholeVisitors(record.startLifetime)));
  if (lifetimeShortfall > 0) {
    operations.totalVisitors = wholeVisitors(operations.totalVisitors) + lifetimeShortfall;
    const ledger = operations.visitorLedger = normalizeVisitorFlowLedger(operations.visitorLedger || {});
    ledger.totalVisitors = wholeVisitors(ledger.totalVisitors) + lifetimeShortfall;
  }
}

function applyChapterVisitorDelta(reserve = {}, delta = 0, source = "visit", options = {}) {
  if (!reserve || typeof reserve !== "object") return { before: 0, after: 0, delta: 0, source };
  ensureChapterVisitorCheckpoint(reserve);
  const development = reserve.development || (reserve.development = {});
  const operations = development.operations || (development.operations = {});
  const today = operations.today || (operations.today = {});
  const skipToday = options.skipToday === true;
  const record = ensureChapterVisitorRecord(reserve);
  if (!skipToday) registerUntrackedTodayCrowd(reserve, operations, today, record);
  const before = chapterVisitorRecordTotal(reserve, record);
  const wanted = Math.round(Number(delta) || 0);
  if (!wanted) return { before, after: before, delta: 0, source, applied: 0 };

  const ledger = operations.visitorLedger = normalizeVisitorFlowLedger(operations.visitorLedger || {});
  let applied = wanted;

  if (wanted > 0) {
    // 记录“当日客流对本章的实际贡献”。事件和剧情的负向影响以它为上限，
    // 否则按当日客流算出的百分比会反复啃食本章的累计存量：当日客流每天
    // 重新计数，本章总数却只减不回，几个守护日就会被清空。
    today.chapterGained = wholeVisitors(today.chapterGained) + wanted;
    operations.totalVisitors = wholeVisitors(operations.totalVisitors) + wanted;
    ledger.totalVisitors = wholeVisitors(ledger.totalVisitors) + wanted;
    const bucket = VISITOR_SOURCE_BUCKETS[source] || VISITOR_SOURCE_BUCKETS.visit;
    ledger[bucket] = wholeVisitors(ledger[bucket]) + wanted;
    if (!skipToday) {
      if (source === "recruit") {
        today.recruitedVisitors = wholeVisitors(today.recruitedVisitors) + wanted;
      } else {
        today.visitors = wholeVisitors(today.visitors) + wanted;
      }
    }
  } else {
    // 流失只能吃掉本章现有的人数，不会穿透到上一章。
    const need = Math.min(Math.abs(wanted), before);
    applied = -need;
    today.chapterGained = Math.max(0, wholeVisitors(today.chapterGained) - need);
    operations.totalVisitors = Math.max(0, wholeVisitors(operations.totalVisitors) - need);
    ledger.totalVisitors = Math.max(0, wholeVisitors(ledger.totalVisitors) - need);
    ledger.lostVisitors = wholeVisitors(ledger.lostVisitors) + need;
    if (!skipToday) {
      let left = need;
      const fromWalk = Math.min(wholeVisitors(today.visitors), left);
      today.visitors = wholeVisitors(today.visitors) - fromWalk;
      left -= fromWalk;
      today.recruitedVisitors = Math.max(0, wholeVisitors(today.recruitedVisitors) - left);
    }
  }

  operations.chapterVisitors = record;
  const after = chapterVisitorRecordTotal(reserve, record);
  return { before, after, delta: after - before, source, applied };
}

function chapterVisitorDailyAttrition(reserve = {}, snapshot = {}) {
  const stage = Math.max(1, Math.round(Number((reserve.progression || {}).stage || 1)));
  if (stage < 3) return 0;
  const total = chapterVisitorTotal(reserve);
  if (total <= 8) return 0;
  const tourism = snapshot.tourism || {};
  const retention = Math.max(0, Math.min(100,
    Number(tourism.retention)
    || Number(snapshot.retention)
    || 62
  ));
  const leakRate = 0.022 + Math.max(0, (70 - retention) / 100) * 0.055;
  const lost = Math.max(1, Math.round(total * Math.min(0.08, leakRate)));
  return Math.min(lost, Math.max(0, total - 4));
}

function applyChapterVisitorDailyAttrition(reserve = {}, snapshot = {}) {
  const lost = chapterVisitorDailyAttrition(reserve, snapshot);
  if (lost <= 0) return { applied: 0, lost: 0 };
  return Object.assign({ lost }, applyChapterVisitorDelta(reserve, -lost, "loss", { skipToday: true }));
}

// 构成直接读本章自持记录，所以“继承 + 各来源 − 流失”必然等于总数，
// untracked 恒为 0；它只是为了兼容既有界面字段而保留。
function chapterVisitorBreakdown(reserve = {}) {
  const record = ensureChapterVisitorRecord(reserve);
  const gains = chapterVisitorGains(reserve, record);
  return {
    inherited: wholeVisitors(record.inherited),
    migrated: gains.migratedVisitors,
    recruited: gains.recruitedVisitors,
    facility: gains.facilityVisitors + wholeVisitors(record.legacySeed),
    task: gains.taskVisitors,
    share: gains.shareVisitors,
    lost: gains.lostVisitors,
    untracked: 0,
    total: chapterVisitorRecordTotal(reserve, record)
  };
}

function chapterSpeciesCount(reserve = {}) {
  const ecology = reserve.ecology || {};
  const captive = chapterCaptiveSpeciesSet(reserve);
  const species = new Set();
  [ecology.predators, ecology.herbivores, ecology.birds].forEach((group) => {
    Object.keys(group || {}).forEach((id) => {
      if (Number(group[id]) > 0 && !captive.has(id)) species.add(id);
    });
  });
  return species.size;
}

function chapterCoreLiveSnapshot(reserve = {}, chapter = 1) {
  const target = chapterTargets(chapter);
  const species = chapterSpeciesCount(reserve);
  const animals = Math.round(livingAnimalTotal(reserve));
  const visitors = chapterVisitorTotal(reserve);
  return {
    species,
    animals,
    visitors,
    target,
    complete: species >= target.species && animals >= target.animals && visitors >= target.visitors
  };
}

function chapterCoreLiveComplete(reserve = {}, chapter = 1) {
  return chapterCoreLiveSnapshot(reserve, chapter).complete;
}

module.exports = {
  chapterTargets,
  chapterExpectedMinutes,
  chapterVisitorDailyAttrition,
  applyChapterVisitorDailyAttrition,
  CHAPTER_TARGETS: TARGETS,
  CHAPTER_VISITOR_CARRYOVER_RATIO,
  LATE_CHAPTER_VISITOR_CARRYOVER_RATIO,
  LATE_CHAPTER_VISITOR_CARRYOVER_STAGE,
  VISITOR_SOURCE_BUCKETS,
  reserveLifetimeVisitors,
  chapterVisitorCarryoverRatio,
  chapterVisitorCarryover,
  rawChapterVisitorTotal,
  beginChapterVisitorCheckpoint,
  ensureChapterVisitorCheckpoint,
  ensureChapterVisitorRecord,
  emptyChapterVisitorRecord,
  normalizeChapterVisitorRecord,
  chapterVisitorRecordTotal,
  chapterVisitorTotal,
  todayChapterContribution,
  chapterVisitorBreakdown,
  applyChapterVisitorDelta,
  normalizeVisitorFlowLedger,
  emptyVisitorLedgerSnapshot,
  chapterSpeciesCount,
  chapterCoreLiveSnapshot,
  chapterCoreLiveComplete
};
