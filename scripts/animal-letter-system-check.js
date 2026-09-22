function createFakeContext(width = 375, height = 667) {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 6 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width, height };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

let nativeShare = null;
global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onKeyboardConfirm() {},
  onAppHide() {}, onAppShow() {}, showToast() {}, showShareMenu() {}, onShareAppMessage() {},
  shareAppMessage(payload) { nativeShare = payload; }
};

const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const {
  dateKey,
  ensureDailyAnimalLetters,
  animalLetterInbox,
  markAnimalLetterRead,
  markAnimalLetterPrompted
} = require("../js/animalLetters");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const state = createCharacter(null, "保护区卫士");
state.world.reserve.ecology.water = 26;
state.world.reserve.ecology.grass = 78;
state.world.reserve.ecology.disease = 4;
state.world.reserve.poacherPressure = 12;
state.world.reserve.safety = 72;
state.world.lifeMemory.animalLetters = [];
state.world.lifeMemory.animalLetterDateKey = "";
state.world.lifeMemory.animalLetterPromptDateKey = "";

const firstDate = new Date(2026, 8, 3, 9, 0, 0);
const first = ensureDailyAnimalLetters(state.world, firstDate);
state.world.lifeMemory = first.state;
assert(first.created.length >= 2 && first.created.length <= 3, "a login day must create exactly two or three letters");
assert(first.created[0].factLabel === "水源" && first.created[0].factValue === 26, "the leading letter must reflect the real low-water state at generation time");
assert(first.created.every((letter) => letter.paragraphs.length === 2 && letter.animalName && letter.species && letter.actionId && letter.contextKey && letter.contentKey), "letters must preserve animal voice, identity, context and a state-linked action");
assert(first.created.every((letter) => letter.paragraphs.join(" ").includes("第") && /水源|草场|迁徙|疾病|边界|安全|天气|热浪|暴雨|沙尘|寒雾|雾/.test(letter.paragraphs.join(" "))), "letters must explain the current reserve context instead of repeating a generic line");
assert(first.created.every((letter) => /第\d+章/.test(letter.paragraphs.join(" "))), "letters must name the current chapter");
assert(new Set(first.created.map((letter) => letter.species)).size === first.created.length, "the same login day must not send two letters from the same animal");

const sameDay = ensureDailyAnimalLetters(state.world, new Date(2026, 8, 3, 22, 0, 0));
assert(!sameDay.changed && sameDay.created.length === 0 && sameDay.todayLetters.length === first.created.length, "reopening on the same day must not duplicate or rewrite letters");
assert(sameDay.todayLetters.every((letter, index) => letter.id === first.created[index].id
  && letter.title === first.created[index].title
  && letter.paragraphs.join("|") === first.created[index].paragraphs.join("|")), "same-day letter wording must be stable across redraws and reloads");

const skippedDays = ensureDailyAnimalLetters(Object.assign({}, state.world, { lifeMemory: sameDay.state }), new Date(2026, 8, 7, 10, 0, 0));
assert(skippedDays.created.length >= 2 && skippedDays.created.length <= 3, "returning after missed days must create only today's two or three letters");
assert(skippedDays.state.animalLetters.length === first.created.length + skippedDays.created.length, "missed login days must not accumulate backfilled mail");
assert(new Set(first.created.concat(skippedDays.created).map((letter) => letter.contentKey)).size === first.created.length + skippedDays.created.length, "recent letter content keys must not repeat across login days");

const readId = skippedDays.created[0].id;
const readState = markAnimalLetterRead(skippedDays.state, readId, 12345);
assert(readState.animalLetters.find((letter) => letter.id === readId).readAt === 12345, "opening a letter must persist its read state");
const prompted = markAnimalLetterPrompted(readState, dateKey(firstDate));
assert(prompted.animalLetterPromptDateKey === "2026-09-03", "daily proactive prompt state must be persisted by date");
assert(animalLetterInbox(prompted).length === skippedDays.state.animalLetters.length, "the inbox must expose all saved history rather than a six-row slice");

const archiveWorld = createCharacter(null, "保护区卫士").world;
archiveWorld.lifeMemory.animalLetters = [];
archiveWorld.lifeMemory.animalLetterDateKey = "";
for (let index = 0; index < 30; index += 1) {
  const visit = ensureDailyAnimalLetters(archiveWorld, new Date(2026, 6, 1 + index, 8, 0, 0));
  archiveWorld.lifeMemory = visit.state;
}
assert(animalLetterInbox(archiveWorld.lifeMemory).length >= 60, "a month of login-day letters must remain available in full history");
assert(new Set(animalLetterInbox(archiveWorld.lifeMemory).map((letter) => letter.contentKey)).size === animalLetterInbox(archiveWorld.lifeMemory).length, "each animal letter in a month of logins must keep a unique daily content key");

const stormWorld = createCharacter(null, "保护区卫士").world;
stormWorld.weather = "暴雨";
stormWorld.reserve.seasonState = Object.assign({}, stormWorld.reserve.seasonState || {}, { name: "雨季", weather: "暴雨" });
stormWorld.reserve.emergency = { active: { type: "flash_flood", title: "雨季山洪突发" } };
stormWorld.lifeMemory.animalLetters = [];
stormWorld.lifeMemory.animalLetterDateKey = "";
const stormLetters = ensureDailyAnimalLetters(stormWorld, new Date(2026, 8, 8, 9, 0, 0));
assert(stormLetters.created[0].factLabel === "天气", "abnormal weather must take the first daily letter");
assert(/暴雨|山洪/.test(stormLetters.created.map((letter) => letter.paragraphs.join(" ")).join(" ")), "weather letters must mention the current storm");
assert(/第\d+章《/.test(stormLetters.created[0].paragraphs.join(" ")), "weather letters must still keep the current chapter");

const heatWorld = createCharacter(null, "保护区卫士").world;
heatWorld.weather = "热浪";
heatWorld.reserve.seasonState = Object.assign({}, heatWorld.reserve.seasonState || {}, { name: "旱季", weather: "热浪" });
heatWorld.reserve.emergency = { active: { type: "heatwave", title: "旱季热浪压境" } };
heatWorld.reserve.progression = Object.assign({}, heatWorld.reserve.progression || {}, { stage: 4, displayChapter: 4 });
heatWorld.lifeMemory.animalLetters = [];
heatWorld.lifeMemory.animalLetterDateKey = "";
const heatLetters = ensureDailyAnimalLetters(heatWorld, new Date(2026, 8, 9, 9, 0, 0));
assert(/热浪|发烫|阴凉/.test(heatLetters.created.map((letter) => letter.paragraphs.join(" ")).join(" ")), "heatwave letters must describe heat, not reuse a water template");
assert(/第4章/.test(heatLetters.created[0].paragraphs.join(" ")), "letters must follow the current chapter number");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.state.world.lifeMemory.animalLetters = [];
game.state.world.lifeMemory.animalLetterDateKey = "";
game.state.world.lifeMemory.animalLetterPromptDateKey = "";
const daily = game.ensureAnimalLettersForToday();
const latest = daily.todayLetters[0];
game.screen = "home";
game.pendingAnimalLetterId = latest.id;
assert(game.openAnimalLetterPrompt() && game.infoDetailModal.kind === "animalLetterPrompt" && /给你写了信/.test(game.infoDetailModal.title), "home login should expose one proactive named-letter prompt");

game.openAnimalLetterInbox();
const inbox = game.infoDetailModal;
game.hitAreas = [];
game.drawInfoDetailModal();
assert(inbox.kind === "animalLetterInbox" && inbox.renderedLetterInbox.showsAllHistory && inbox.renderedLetterItems.length > 0, "inbox must render saved animal portraits and the full scrollable archive");
assert(inbox.renderedInfoFrame && inbox.renderedInfoFrame.style === "field-archive-v2" && inbox.renderedInfoFrame.dynamicHeight, "animal inbox must use the shared premium archive frame with compact dynamic height");
assert(inbox.renderedLetterInbox.style === "field-post-v2" && inbox.renderedLetterInbox.unreadMarker === "wax-seal", "animal inbox must use the parchment-letter hierarchy and restrained unread marker");

const recentLetterState = game.state.world.lifeMemory;
game.state.world.lifeMemory = archiveWorld.lifeMemory;
game.openAnimalLetterInbox();
const longInbox = game.infoDetailModal;
game.hitAreas = [];
game.drawInfoDetailModal();
assert(longInbox.letters.length >= 60 && longInbox.letterMaxScroll > 0, "long letter history must use an independently scrollable archive");
longInbox.letterScrollY = longInbox.letterMaxScroll;
game.hitAreas = [];
game.drawInfoDetailModal();
assert(longInbox.renderedLetterItems.some((row) => row.index === longInbox.letters.length - 1 && row.visible), "the earliest saved animal letter must remain reachable");

game.state.world.lifeMemory = recentLetterState;
game.openAnimalLetterReader(latest, inbox);
const reader = game.infoDetailModal;
[320, 375, 430].forEach((width) => {
  game.width = width;
  game.height = width === 320 ? 568 : width === 375 ? 667 : 932;
  game.ctx = createFakeContext(width, game.height);
  game.hitAreas = [];
  game.drawInfoDetailModal();
  assert(reader.renderedAnimalLetter && reader.renderedAnimalLetter.portrait && reader.renderedAnimalLetter.fits, `letter reader must fit and keep the animal portrait at ${width}px`);
  assert(reader.renderedAnimalLetter.style === "field-letter-v2" && reader.renderedInfoFrame.style === "field-archive-v2", `letter reader must keep the unified premium visual language at ${width}px`);
});
assert(game.state.world.lifeMemory.animalLetters.find((letter) => letter.id === latest.id).readAt > 0, "reader must mark the selected letter as read");

game.hitAreas = [];
const unreadChipHeight = game.drawAnimalLetterInboxChip(createFakeContext(375, 667), 14, 120, 126);
assert(unreadChipHeight === 42 && game.renderedAnimalLetterChip && game.renderedAnimalLetterChip.unread > 0,
  "the home letter chip should remain while another unread letter still needs attention");
game.state.world.lifeMemory.animalLetters = game.state.world.lifeMemory.animalLetters.map((letter) => Object.assign({}, letter, { readAt: letter.readAt || Date.now() }));
game.hitAreas = [];
const readChipHeight = game.drawAnimalLetterInboxChip(createFakeContext(375, 667), 14, 120, 126);
assert(readChipHeight === 0 && game.renderedAnimalLetterChip === null && game.hitAreas.length === 0,
  "the home letter reminder must disappear immediately after every letter is read");
assert(animalLetterInbox(game.state.world.lifeMemory).length === daily.state.animalLetters.length,
  "hiding the home reminder must preserve every historical letter in Reserve Memory");

nativeShare = null;
game.shareAnimalLetter(latest);
assert(nativeShare && /写给我的一封信/.test(nativeShare.title) && /share=guardian/.test(nativeShare.query), "letter share must use the real named letter and a valid friend-entry query");
assert(game.state.world.lifeMemory.animalLetters.find((letter) => letter.id === latest.id).sharedAt > 0, "sharing a letter must be recorded without changing its content");

console.log("animal letter system check ok (2-3 daily, no backfill, stable content, inbox history, reader, portrait, share)");
