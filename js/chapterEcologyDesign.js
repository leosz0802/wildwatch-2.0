/* Chapter-specific ecology design.  This is deliberately data-first so the
 * simulator, map markers and narrative systems share the same reserve logic. */
const { chapterEcologyBalance } = require("./balanceConfig");
const story = (id, chapter, title, species, regionId, scene, hint, conditions, choices, auto) => ({
  id, chapter, category: "章节生态", title, species, regionId, scene, hint, conditions, choices, auto
});
const has = (group, id, min = 1) => (e) => Number((((e.ecology || {})[group] || {})[id] || 0)) >= min;
const CHAPTER_ECOLOGY_DESIGN = Object.freeze({
  1: { theme: "先让水线和幼崽安全共存", focus: ["deer", "hare", "wolf"], cadenceDays: 3, risk: 18, preferredTypes: ["water", "predation"], stories: ["ch1_wolf_hare_waterline"] },
  2: { theme: "浅滩拥挤，食草动物共享草场", focus: ["zebra", "boar", "deer"], cadenceDays: 3, risk: 24, preferredTypes: ["water", "competition"], stories: ["ch2_zebra_antelope_queue", "ch2_boar_deer_forage"] },
  3: { theme: "观察期：鸟类警戒与疾病早发现", focus: ["eagle", "flamingo", "hare"], cadenceDays: 4, risk: 28, preferredTypes: ["disease", "predation"], stories: ["ch3_eagle_hare_nest", "ch3_flamingo_shallow", "ch3_eagle_water_warning"] },
  4: { theme: "捕食者进入游客游线，恢复隐蔽带", focus: ["lion", "leopard", "antelope"], cadenceDays: 4, risk: 36, preferredTypes: ["predation", "territorial"], stories: ["ch4_leopard_antelope_cubs", "ch4_lion_wolf_corridor"] },
  5: { theme: "清道者、长颈鹿与草场信号", focus: ["crow", "giraffe", "wolf"], cadenceDays: 4, risk: 40, preferredTypes: ["symbiosis", "competition"], stories: ["ch5_crow_wolf_warning", "ch5_giraffe_crow_canopy", "ch5_giraffe_wolf_shadow"] },
  6: { theme: "旱季回路：熊、秃鹫和鹿的食物压力", focus: ["bear", "vulture", "deer"], cadenceDays: 4, risk: 48, preferredTypes: ["predation", "disease", "symbiosis"], stories: ["ch6_bear_deer_den", "ch6_crow_vulture_carrion"] },
  7: { theme: "大型动物改道，水源必须分层使用", focus: ["elephant", "hippo", "deer"], cadenceDays: 5, risk: 52, preferredTypes: ["water", "territorial"], stories: ["ch7_elephant_hippo_water", "ch7_elephant_deer_route", "ch7_hippo_night_grass"] },
  8: { theme: "核心庇护：鳄鱼、野犬与斑马保持距离", focus: ["crocodile", "wilddog", "zebra"], cadenceDays: 5, risk: 60, preferredTypes: ["predation", "territorial"], stories: ["ch8_wilddog_zebra_chase", "ch8_crocodile_zebra_shallows"] },
  9: { theme: "迁徙连线：小型捕食者跟随鸟类迁徙", focus: ["mink", "fox", "flamingo", "hare"], cadenceDays: 5, risk: 64, preferredTypes: ["migration", "predation"], stories: ["ch9_fox_hare_migration", "ch9_mink_flamingo_wetland", "ch9_flamingo_rest_stop"] },
  10: { theme: "传奇边界：大型动物通道与幼崽避让", focus: ["rhino", "pangolin", "fox"], cadenceDays: 6, risk: 72, preferredTypes: ["territorial", "predation"], stories: ["ch10_rhino_pangolin_trail", "ch10_fox_pangolin_nest"] },
  11: { theme: "无限守望：湿地、草原和迁徙物种共同承担压力", focus: ["bison", "crane", "tapir", "fireflyBird"], cadenceDays: 6, risk: 78, preferredTypes: ["weather", "migration", "disease"], stories: ["ch11_crane_bison_wetland", "ch11_tapir_firefly_night"] }
});
const chapterStories = {
  ch1_wolf_hare_waterline: story("ch1_wolf_hare_waterline", 1, "狼群转向追兔，鹿群暂时保住水线", "狼 × 兔", "river", "旱季第一周，狼群从鹿群退到兔子常走的灌草带，兔群幼崽暴露在开阔地。", "给兔子留灌草退路，减少狼群反复冲击水线。", e => (e.ecology.water || 0) < 70 && has("predators", "wolf")(e) && has("herbivores", "hare", 4)(e), [{ id: "brush_escape", label: "补一条灌草退路", summary: "让兔群先撤入低矮灌木", effects: { grass: 3, safety: 3, stability: 2, hare: 2 }, sentiment: .04 }, { id: "observe_predation", label: "记录自然捕食", summary: "保留狼群的季节性替代猎物", effects: { safety: 0, stability: 1, hare: -1, wolf: 1 }, sentiment: 0 }], { label: "兔群幼崽失散", summary: "狼群在水线附近找到新的追逐路线。", effects: { safety: -4, stability: -3, hare: -3 } }),
  ch2_zebra_antelope_queue: story("ch2_zebra_antelope_queue", 2, "斑马和羚羊排队通过浅滩", "斑马 × 羚羊", "river", "斑马先下水，羚羊被迫聚在下游，队尾幼崽没有足够的回旋空间。", "把下水点拆成两条，动物和游客都能看到退路。", e => (e.ecology.water || 0) < 75 && has("herbivores", "zebra", 6)(e) && has("herbivores", "antelope", 6)(e), [{ id: "split_crossing", label: "拆分下水点", summary: "分开两群食草动物", effects: { water: 3, safety: 3, stability: 2, zebra: 1, antelope: 1 }, sentiment: .04 }, { id: "quiet_window", label: "安排安静时段", summary: "不改地形，只错开时间", effects: { safety: 2, stability: 1 }, sentiment: .02 }], { label: "浅滩堵塞", summary: "两群动物挤在同一条水线，幼崽被迫回撤。", effects: { water: -3, safety: -4, stability: -3, zebra: -2, antelope: -2 } }),
  ch2_boar_deer_forage: story("ch2_boar_deer_forage", 2, "野猪翻土后，鹿群找不到嫩草", "野猪 × 鹿", "meadow", "野猪翻出的根块吸引了鹿群，草场边缘很快出现重复踩踏。", "用轮换草场留出恢复期。", e => (e.ecology.grass || 0) < 72 && has("herbivores", "boar", 4)(e) && has("herbivores", "deer", 6)(e), [{ id: "rotate_forage", label: "轮换觅食区", summary: "给被翻开的草地恢复时间", effects: { grass: 4, stability: 2, deer: 1, boar: 1 }, sentiment: .04 }, { id: "mark_trail", label: "只标记路线", summary: "观察自然恢复速度", effects: { grass: 1, stability: 1 }, sentiment: .01 }], { label: "草场被翻薄", summary: "鹿群和野猪重复利用同一片边缘。", effects: { grass: -5, stability: -3, deer: -2 } })
};
// Extend the pool with compact templates for later chapters. Each remains a real
// choice with a resource trade-off; the generic event system handles follow-up risk.
const later = [
  ["ch3_eagle_hare_nest", 3, "鹰在兔巢上方盘旋", "鹰 × 兔", "center", "鹰把巢位移到游客可见的岩台，兔群开始改变出洞时间。", "保留低矮遮蔽物，减少幼崽暴露。", e => has("birds", "eagle")(e) && has("herbivores", "hare", 4)(e)],
  ["ch3_flamingo_shallow", 3, "火烈鸟和浅滩疾病线", "火烈鸟 × 水域", "river", "低水位把火烈鸟聚到一块泥滩，水质变化开始沿岸扩散。", "先处理水质，再移动观鸟路线。", e => has("birds", "flamingo")(e) && (e.ecology.water || 0) < 72],
  ["ch3_eagle_water_warning", 3, "鹰发现水线上的异常泡沫", "鹰 × 水源", "river", "鹰在高空发现水面泡沫，兔群和火烈鸟同时改变了饮水时间。", "封存一段水线并采样，确认风险再开放。", e => has("birds", "eagle")(e) && (e.ecology.water || 0) < 66],
  ["ch4_leopard_antelope_cubs", 4, "豹子盯上羚羊幼崽的回程线", "豹子 × 羚羊", "center", "灌丛变薄后，豹子把追逐带到幼崽回程线。", "恢复隐蔽带，给幼崽一条不经过游客线的回程。", e => has("predators", "leopard")(e) && has("herbivores", "antelope", 5)(e)],
  ["ch4_lion_wolf_corridor", 4, "狮群和狼群争一条猎道", "狮 × 狼", "meadow", "两种捕食者在同一条猎道留下气味，食草动物开始绕远。", "开一道缓冲廊道，避免正面冲突。", e => has("predators", "lion")(e) && has("predators", "wolf")(e)],
  ["ch5_crow_wolf_warning", 5, "乌鸦把狼群动静传到鹿群", "乌鸦 × 狼", "north", "乌鸦的警戒叫声让鹿群提前撤离，狼群连续两次扑空。", "保护乌鸦的高枝观察点，维持预警链。", e => has("birds", "crow")(e) && has("predators", "wolf")(e)],
  ["ch5_giraffe_crow_canopy", 5, "长颈鹿踩塌乌鸦的树下巢位", "长颈鹿 × 乌鸦", "meadow", "长颈鹿取食低枝时踩塌树下巢位，乌鸦开始迁往游客区。", "修复一块高枝巢区，避免鸟群贴近游客。", e => has("herbivores", "giraffe")(e) && has("birds", "crow")(e)],
  ["ch5_giraffe_wolf_shadow", 5, "长颈鹿的警戒影子遮住狼群猎线", "长颈鹿 × 狼", "meadow", "长颈鹿持续发出高处警报，狼群放弃追鹿，转向更靠近游客的林缘。", "保留高处视野，同时给狼群一条远离游线的猎道。", e => has("herbivores", "giraffe")(e) && has("predators", "wolf")(e)],
  ["ch6_bear_deer_den", 6, "熊靠近鹿群的夜间卧地", "熊 × 鹿", "north", "熊在缺食夜里靠近鹿群卧地，鹿群把幼崽藏到更远的水边。", "补充自然食源并保留夜间退路。", e => has("predators", "bear")(e) && has("herbivores", "deer", 5)(e)],
  ["ch6_crow_vulture_carrion", 6, "乌鸦和秃鹫争一处腐食", "乌鸦 × 秃鹫", "north", "腐食停在林缘，乌鸦先发现它，秃鹫从高处落下，清道顺序被打乱。", "分开清道区，降低疾病风险。", e => has("birds", "crow")(e) && has("birds", "vulture")(e) && (e.ecology.disease || 0) > 15],
  ["ch7_elephant_hippo_water", 7, "象群改道挤进河马水湾", "大象 × 河马", "river", "象群的饮水路线切过河马浅湾，泥岸被踩出两条深槽。", "设置分层水线，让大型动物错峰。", e => has("herbivores", "elephant")(e) && has("herbivores", "hippo")(e)],
  ["ch7_elephant_deer_route", 7, "象群脚印切断鹿群通道", "大象 × 鹿", "meadow", "象群夜间经过后，鹿群不再走原来的安全通道。", "恢复一条低扰动绕行线。", e => has("herbivores", "elephant")(e) && has("herbivores", "deer", 5)(e)],
  ["ch7_hippo_night_grass", 7, "河马夜间上岸压住鹿群草场", "河马 × 鹿", "meadow", "河马夜里离开水湾，反复经过鹿群的嫩草带，清晨草场留下深泥脚印。", "把夜间取食区和鹿群育幼草带错开。", e => has("herbivores", "hippo")(e) && has("herbivores", "deer", 5)(e)],
  ["ch8_wilddog_zebra_chase", 8, "野犬追逐斑马队尾", "野犬 × 斑马", "meadow", "野犬用耐力追逐斑马，队尾幼崽几次脱离队形。", "打开连续视野带，让斑马保持队形。", e => has("predators", "wilddog")(e) && has("herbivores", "zebra", 6)(e)],
  ["ch8_crocodile_zebra_shallows", 8, "鳄鱼和斑马共享浅滩", "鳄鱼 × 斑马", "river", "低水位让斑马只能从鳄鱼常伏击的浅滩通过。", "拓宽浅滩退路，保留自然伏击距离。", e => has("predators", "crocodile")(e) && has("herbivores", "zebra", 6)(e)],
  ["ch9_fox_hare_migration", 9, "狐狸跟着兔群迁徙边缘移动", "狐狸 × 兔", "center", "迁徙通道缩窄，狐狸把追逐带到兔群育幼地。", "保留灌木跳石，降低幼崽暴露。", e => has("predators", "fox")(e) && has("herbivores", "hare", 5)(e)],
  ["ch9_mink_flamingo_wetland", 9, "水貂逼近火烈鸟停歇地", "水貂 × 火烈鸟", "river", "夜间水貂沿湿地边缘靠近火烈鸟停歇地，鸟群提前离开。", "留出安静停歇岛，减少夜间惊扰。", e => has("predators", "mink")(e) && has("birds", "flamingo")(e)],
  ["ch9_flamingo_rest_stop", 9, "迁徙火烈鸟找不到第二个停歇点", "火烈鸟 × 迁徙线", "river", "第一处浅滩被游客和捕食者共同惊扰，迁徙队伍没有备用停歇点。", "恢复一处备用湿地，减少单点拥堵。", e => has("birds", "flamingo", 8)(e) && (e.ecology.water || 0) < 70],
  ["ch10_rhino_pangolin_trail", 10, "犀牛脚步压过穿山甲洞口", "犀牛 × 穿山甲", "north", "犀牛夜间经过，穿山甲洞口塌了一侧，游客也开始靠近查看。", "设低扰动隔离带，给洞口留恢复时间。", e => has("herbivores", "rhino")(e) && has("herbivores", "pangolin")(e)],
  ["ch10_fox_pangolin_nest", 10, "狐狸发现穿山甲幼崽气味", "狐狸 × 穿山甲", "center", "狐狸在雨后循着气味靠近洞口，穿山甲亲兽把幼崽往深处搬。", "只保留观察距离，不围堵洞口。", e => has("predators", "fox")(e) && has("herbivores", "pangolin")(e)],
  ["ch11_crane_bison_wetland", 11, "鹤群和野牛共享退水湿地", "鹤 × 野牛", "river", "野牛踩踏退水湿地，鹤群的浅水觅食点只剩一半。", "划出分层湿地，让两种动物都保留季节路线。", e => has("birds", "crane")(e) && has("herbivores", "bison")(e)],
  ["ch11_tapir_firefly_night", 11, "貘群惊动萤火鸟夜间繁殖地", "貘 × 萤火鸟", "north", "夜间貘群穿过低林，萤火鸟的求偶光点被连续打断。", "设置暗夜缓冲带，保留完整夜间节律。", e => has("herbivores", "tapir")(e) && has("birds", "fireflyBird")(e)]
];
for (const [id, chapter, title, species, regionId, scene, hint, condition] of later) {
  chapterStories[id] = story(id, chapter, title, species, regionId, scene, hint, condition,
    [{ id: "protect_route", label: "划出缓冲带", summary: "把冲突移出育幼或觅食线", effects: { safety: 3, stability: 2, grass: 2 }, sentiment: .04 },
      { id: "observe_cycle", label: "记录一个周期", summary: "保留自然变化并减少打扰", effects: { safety: 1, stability: 1 }, sentiment: .01 }],
    { label: "幼崽路线受阻", summary: "冲突扩大，动物暂时离开原来的活动区。", effects: { safety: -4, stability: -3, grass: -2 } });
}
function chapterEcologyPlan(chapter = 1) {
  const key = Math.max(1, Math.min(11, Math.round(Number(chapter) || 1)));
  const base = CHAPTER_ECOLOGY_DESIGN[key] || CHAPTER_ECOLOGY_DESIGN[1];
  const balance = chapterEcologyBalance(key);
  return Object.assign({}, base, { balance, cadenceDays: balance.eventInterval, risk: Math.round(balance.conflictRate * 100) });
}
function chapterStoriesFor(chapter = 1) { const plan = chapterEcologyPlan(chapter); return plan.stories.map(id => chapterStories[id]).filter(Boolean); }
function allChapterStories() { return Object.values(chapterStories); }
module.exports = { CHAPTER_ECOLOGY_DESIGN, chapterEcologyPlan, chapterStoriesFor, allChapterStories };
