# Archived historical implementation notes

These comments were moved out of the main game bundle to retain the package-size safety margin. Runtime code is unchanged by this archive.

## game.js (prior line 138)

// Curated walkable points follow the stone paths, bridges and the visitor
// boardwalk on the shared map. Visitors choose their own next linked point,
// which makes them roam without cutting through the river.

## game.js (prior line 489)

    // A route incident is a one-shot gate.  Keep a local latch so a double tap
    // (or a slow frame in the mini-game simulator) cannot submit the same route
    // repeatedly and reopen the incident indefinitely.

## game.js (prior line 514)

    // The cloud service bootstraps after the first frame. Keep a single
    // capability refresh in flight so an early exchange tap cannot get
    // stuck on the stale default (reciprocalTrade=false) config.

## game.js (prior line 722)

    // Keep display interpolation gradual even when the game loop batches a
    // long interval (for example after returning from another screen). A
    // batched 240ms step must not turn a live stat change into an instant
    // jump, otherwise the HUD appears to skip values or desync from events.

## game.js (prior line 2550)

    // 保护区来信是统一收件箱，但动物信需要保留动物肖像、行动提示和分享入口。
    // 旧路径把它当成普通游客信，导致详情页没有分享按钮，也让“回到沙盘”的操作丢失。

## game.js (prior line 2650)

      // 沙盘默认展示完整地图（等同于“−”的最小缩放）。只有定位动物、建筑、
      // 线索等明确操作会设置 preserveMapZoomOnHome，保留聚焦视图。

## game.js (prior line 3573)

    // syncReserve performs an async login and leaderboard refresh. Calling it
    // from every animation paint created a promise storm during map motion.
    // Re-sync immediately when a tracked value changes, otherwise at most once
    // every 2 seconds while the player is idle.

## game.js (prior line 4134)

    // 巡护行动统一为单步结算。旧存档可能还带有路线规划状态，但不再
    // 让它把玩家带回旧路线规划页；执行时直接使用模拟器的默认路线。

## game.js (prior line 4322)

    // Build the command while the selected route is still present, then close
    // every modal before simulation.  This prevents the old route planner from
    // being restored by a redraw while the result is being calculated.

## game.js (prior line 7269)

    // Keep a quiet, non-consuming navigation rail under the current goal.
    // It is hidden while the player is comparing alternatives so the task
    // cards remain readable on short screens.

## game.js (prior line 8859)

    // 结算卡的第二信息区只保留玩家最容易理解、且会持续波动的两项经营数据。
    // 当本次结算带有前后值时，用基金与游客替代旧的“市场/代价”叙述，
    // 让任务结果和首页顶栏使用同一套反馈语言。

## game.js (prior line 9613)

      // 动物目标不是“去发现页再自己找”，而是直接回沙盘定位到这只命名动物。
      // 这样任务入口和地图上的可操作对象保持同一目标，避免用户看到无效的“请选择”提示。

## game.js (prior line 9635)

  // These are navigation-only suggestions. They deliberately do not consume
  // an action point, advance a goal, or open a patrol task: the player can
  // inspect the reserve at their own pace and decide what to do next.

## game.js (prior line 9741)

    // 结算后的新目标进入同一自动推送节流，不在 3 分钟后连续打断玩家。
    // 三分钟前仍保持即时反馈；进入自由探索阶段后，队列会等待冷却结束。

## game.js (prior line 9876)

    // Routine patrol guidance is intentionally slower than the normal mission
    // cadence. Urgent events, shortages and chapter actions still surface
    // immediately; ordinary patrols leave room for the player to browse the
    // sandbox, fund ledger, visitor channel or survival channel.

## game.js (prior line 11553)

    // 建筑列表始终展示完整的四个治理节点；章节引导通过目标卡和线索入口
    // 聚焦下一步，不能以隐藏建筑的方式制造“建筑变少”的错觉。

## game.js (prior line 12015)

    // Some very old entries have neither `animal` nor `discovery.who`. Keep
    // the guide usable by choosing the first known species attached to the
    // case, rather than leaving the player with a detail page that only closes.

## game.js (prior line 12054)

    // A first-session home push may be queued while the player is in the
    // archive. The animal guide is itself the requested next step, so do not
    // let that secondary prompt cover the highlighted animal.

## game.js (prior line 13867)

      // 绿色章节头部带有 8px 的内阴影和圆角外框，卡片不能直接从
      // headerH 起画，否则第一排会压住表头底边。预留 12px 的明确间距，
      // 同时把它计入分组高度，避免下一等级继续向上顶。

## game.js (prior line 14620)

    // Each sample card is informational.  There is deliberately no per-item
    // sale/transfer hit area: the panel header owns the only sale entry so a
    // user cannot accidentally sell one item while thinking they are opening
    // its details.

## game.js (prior line 15053)

      // Selling is intentionally exposed only by the warehouse header.  An
      // item detail can collect a pending item or start an exploration, but it
      // must not create a second sale/transfer entry.

## game.js (prior line 15369)

    // A saved session can reopen after the short alarm burst has expired.
    // Focus a newly seen wildfire once so the player still lands on the fire
    // zone instead of having to search the whole map.

## game.js (prior line 15489)

    // 剧情标记使用固定的环绕槽位，并对动物/设施做碰撞避让。这样同一地点
    // 同时出现剧情、轨迹和提示时，按钮仍保持独立可读、可点击。

## game.js (prior line 17575)

      // The yellow ring is the node affordance. Keep a generous rectangular
      // target around the ring and its label so a tap on any visible part
      // reliably opens the node details. 游客角色仍有独立命中区进入游客表，
      // 建筑本体始终先展示等级与状态。

## game.js (prior line 18288)

      // 使用沙盘现有角色美术，避免事件区出现与游戏风格不一致的几何人形。
      // 中间是巡护员，两侧是游客，三者共同表达“现场评估方案”。

## game.js (prior line 18342)

        // 事件标记可能因同回合状态排序被裁掉，但事件本身仍必须可进入处理方案。
        // 点击范围覆盖图形和标签，找不到派生 marker 时用 active 现场数据兜底。

## game.js (prior line 21762)

    // 保护区等级是经营质量的长期反馈，不允许新用户仅靠首轮高分瞬间冲到高等级。
    // 每累计约两分钟有效体验才开放一个等级；生态恶化仍可使等级下降。

## game.js (prior line 21952)

        // A neighbor request has one map affordance. Older saves can contain
        // both the active request and its derived reserve-view marker; keep
        // only the active one, or the first pending request when no event is active.

## game.js (prior line 22104)

    // 首页顶栏始终给出玩家最容易理解、也最常变化的两项指标：市值与游客。
    // 两段分别命中，市值看经营详情，游客看游客运营；游客增长也会反映到市值核算。

## game.js (prior line 25590)

    // Keep the settlement line tied to the action even when a generic
    // narrative beat is selected first. This prevents an unrelated ambient
    // sentence from masking the player's patrol outcome.

