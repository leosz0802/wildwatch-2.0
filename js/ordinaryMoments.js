const { facilityStates } = require("./reserveFacilities");

const SPECIES_LINES = {
  鹿: ["低头吃了很久的草，抬头确认你还在。", "把最嫩的一小片草让给了幼鹿。", "走到水边，又退半步等同伴先喝。"],
  乌鸦: ["把一根亮亮的草茎藏进了树杈。", "学着巡护哨叫了一声，然后自己吓了一跳。", "站在高处认真点评今天的脚印。"],
  狼: ["远远绕过营地灯光，没有惊动鹿群。", "在背风处趴下，尾巴只扫了两下地。", "闻了闻猎犬留下的路线，又安静走开。"],
  水貂: ["在浅水里追了一阵自己的倒影。", "叼起一片叶子，又嫌它不够像鱼。", "趴在石头上，把尾巴晒得很直。"],
  大象: ["用鼻尖把幼象从泥坑边轻轻拨了回来。", "在旧路口停了一会儿，像是在认方向。", "卷起一小束草，慢慢分给身边的同伴。"],
  鹰: ["借着热气流盘旋了三圈，没有发出警报。", "落在最高的枝头，安静看完整片草场。", "把翅膀收得很紧，像一枚停住的叶子。"],
  斑马: ["队伍挤成一排，最后一只又悄悄插了队。", "在尘土里滚了一圈，黑白纹都变成了灰色。", "跟着熟悉的脚印走，今天没有急着赶路。"],
  羚羊: ["跳过一小段水沟，回头等最慢的同伴。", "耳朵轮流朝两个方向转，身体却很放松。", "在草坡上站了一会儿，像是在替大家望风。"],
  长颈鹿: ["低头喝水时张开前腿，姿势还是有点笨拙。", "从最高的树枝上挑走了最后一片嫩叶。", "远远看见你，慢慢眨了一次眼。"],
  河马: ["在水里只露出两只耳朵，假装自己不在。", "把水面顶出一串泡泡，又沉了回去。", "挪出一小块浅滩，让幼崽先躺下。"],
  鳄鱼: ["在岸边晒得一动不动，只有眼睛跟着云走。", "滑进水里，没有溅起一点声音。", "换了块更暖的石头继续发呆。"],
  火烈鸟: ["单脚站累了，悄悄换脚却假装没动。", "把水面踩出一圈细小的波纹。", "挤进队伍中间，羽毛被夕光照亮。"],
  野兔: ["从草丛里探出耳朵，确认巡护脚步已经走远。", "飞快啃完一片嫩叶，又把位置让给幼兔。", "沿着你修过的矮篱绕了一圈，没有急着逃。"],
  野猪: ["用鼻子拱开湿土，翻出一小截藏着的根。", "带着幼崽横穿草坡，队伍挤得歪歪扭扭。", "在泥坑里滚了一圈，满意地甩了甩耳朵。"],
  熊: ["靠在背阴的树干上挠了挠背，树叶落了一身。", "闻到巡护站的灯油味，停下看了一会儿。", "把蜂巢旁的断枝拨开，没有靠近巡护路线。"],
  秃鹫: ["落在岩坡最高处，把翅膀晾成一面安静的旗。", "绕着自然死亡样本盘旋，等巡护员完成记录。", "追着上升气流滑了很远，今天没有发出警报。"],
  狮子: ["在草甸边缘卧下，给迁徙队伍留出一段距离。", "抬头看了一眼猎物队形，又把下巴放回前爪。", "沿旧领地线慢慢走过，没有越过新设的缓冲带。"],
  豹子: ["把尾巴垂在树枝下，安静观察恢复中的草场。", "从岩影里换到另一处阴凉，脚步没有惊动鹿群。", "闻到监测设备的气味，绕半圈后继续潜行。"],
  猫头鹰: ["在观测杆上转过半圈，正好面对巡护灯。", "把夜里的细小动静听完，才慢慢合上眼睛。", "低低掠过草场，羽毛没有惊动一片叶子。"],
  野犬: ["队伍跑散后又在旧路口重新集合，一只也没落下。", "沿巡护车辙追了一段，确认不是陌生车辆。", "把最暖的休息位置留给了队里受伤的同伴。"],
  狐狸: ["在边界牌后藏起半块果子，转身就忘了位置。", "踩着干净的巡护路走了一小段，又钻回草里。", "远远观察回收点，确认没有食物残渣才离开。"],
  猎犬: ["巡完一圈，把鼻子搭在门槛上休息。", "认真检查空饭盆，仿佛它会自己变满。", "追着自己的尾巴转半圈，想起还在值班。"]
};

const FACILITY_LINES = {
  old_patrol_post: ["在重新点亮的巡护灯下趴了一会儿。", "从巡护站门口经过，脚步没有加快。"],
  hydrology_station: ["在水尺旁停下，看了一会儿自己的倒影。", "沿着重新流动的浅水线慢慢走远。"],
  intel_room: ["把一根羽毛落在情报室窗台，像是新的线索。", "经过亮着灯的情报室，抬头听了听。"],
  migration_watch: ["从观测站下走过，沿旧路留下新脚印。", "在观测站视野里停留片刻，又继续赶路。"],
  governance_hall: ["在治理厅外的阴影里睡了一个短觉。", "绕着治理厅走了一圈，像在检查新邻居。"],
  guardian_memorial: ["在名字墙前安静停下，风翻动了纪念页。", "靠近纪念墙闻了闻，然后坐在你名字旁边。"]
};

function hash(text) {
  let value = 2166136261;
  String(text || "").split("").forEach((char) => { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); });
  return Math.abs(value >>> 0);
}

function momentAnimal(world, seed) {
  const animals = (world.knownCharacters || []).filter((animal) => animal && animal.species && animal.status !== "dead" && animal.status !== "departed");
  if (!animals.length) return { id: "forest_animal", name: "附近动物", species: "鹿" };
  return animals[seed % animals.length];
}

function recordOrdinaryMoment(state, context = {}) {
  if (!state || !state.world) return { state, moment: null };
  const world = state.world;
  const previous = (world.ordinaryMoments || []).slice(-24);
  const actionCount = (((world.reserve || {}).progression || {}).totalActions) || previous.length + 1;
  const seed = hash(`${world.day || 1}|${actionCount}|${context.actionId || "action"}|${world.weather || ""}|${world.season || ""}`);
  const animal = momentAnimal(world, seed);
  const repaired = facilityStates(state).filter((facility) => facility.repaired && facility.buildStage >= 2);
  const useFacility = repaired.length && seed % 3 === 0;
  const facility = useFacility ? repaired[seed % repaired.length] : null;
  const lines = facility ? FACILITY_LINES[facility.id] : (SPECIES_LINES[animal.species] || ["在熟悉的路边停了一会儿，今天没有发生大事。", "慢慢走过草地，把这一天过得很普通。"]);
  let text = lines[seed % lines.length];
  const last = previous[previous.length - 1];
  if (last && last.text === text && lines.length > 1) text = lines[(seed + 1) % lines.length];
  const moment = {
    id: `ordinary_${world.day || 1}_${actionCount}_${seed % 10000}`,
    day: world.day || 1,
    actionCount,
    actionId: context.actionId || "action",
    animalId: animal.id || "forest_animal",
    animalName: animal.shortName || animal.name || animal.species || "附近动物",
    species: animal.species || "动物",
    facilityId: facility ? facility.id : "",
    text,
    kind: "ordinary"
  };
  world.ordinaryMoments = previous.concat(moment).slice(-24);
  world.latestOrdinaryMoment = moment;
  return { state, moment };
}

function latestOrdinaryMoment(state) {
  const world = (state && state.world) || {};
  return world.latestOrdinaryMoment || (world.ordinaryMoments || []).slice(-1)[0] || null;
}

module.exports = { SPECIES_LINES, FACILITY_LINES, recordOrdinaryMoment, latestOrdinaryMoment };
