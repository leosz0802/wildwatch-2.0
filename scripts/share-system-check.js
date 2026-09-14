const fs = require("fs");
const path = require("path");

function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

let launchOptions = {};
let nativeShare = null;
let menuShareFactory = null;
global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  getLaunchOptionsSync() { return launchOptions; },
  createCanvas() { return { width: 375, height: 667, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onKeyboardConfirm() {},
  onAppHide() {}, onAppShow() {}, showToast() {}, showShareMenu() {},
  onShareAppMessage(factory) { menuShareFactory = factory; },
  shareAppMessage(payload) { nativeShare = payload; }
};

const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const {
  SHARE_IMAGES,
  sharePayload,
  parseShareInvite,
  applyShareAssistance
} = require("../js/shareSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function queryObject(query) {
  return Object.fromEntries(String(query || "").split("&").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

Object.values(SHARE_IMAGES).forEach((relative) => {
  const absolute = path.join(__dirname, "..", relative);
  assert(fs.existsSync(absolute), `share image missing: ${relative}`);
  const size = fs.statSync(absolute).size;
  assert(size > 6000 && size < 16000, `share image should remain readable and package-safe: ${relative} ${size}`);
});

const sender = createCharacter(null, "保护区卫士");
sender.world.day = 18;
const named = sender.world.lifeMemory && sender.world.lifeMemory.individuals && sender.world.lifeMemory.individuals[0];
const individual = named || { id: "friend_deer_1", name: "晨角", species: "鹿", speciesId: "deer", health: 30, status: "active" };

const rare = sharePayload(sender.world, { type: "rare", day: 18, individualId: individual.id, name: "月白", species: "鹿", body: "白鹿第一次出现" });
assert(rare.imageUrl === SHARE_IMAGES.rare && /终于出现/.test(rare.title) && /不是抽到的奖励/.test(rare.text), "rare share should use surprise image and earned-discovery text");
const rescue = sharePayload(sender.world, { type: "injury", day: 18, individualId: individual.id, name: individual.name, species: individual.species, individual: Object.assign({}, individual, { health: 30, status: "active" }) });
assert(rescue.imageUrl === SHARE_IMAGES.rescue && /受伤|等我回去/.test(rescue.title) && /不是一条数字/.test(rescue.text), "injury share should use rescue image and named emotional text");
const returned = sharePayload(sender.world, { type: "return", day: 18, individualId: individual.id, name: individual.name, species: individual.species });
assert(returned.imageUrl === SHARE_IMAGES.warm && /回来了/.test(returned.title) && /迁入\+1/.test(returned.text), "return share should present a friend coming home rather than a raw number");

const parsed = parseShareInvite({ query: queryObject(rescue.query) });
assert(parsed && parsed.shareId === rescue.shareId && parsed.name === rescue.name && parsed.kind === "rescue", "share query should restore the exact friend invitation");
const rawEncoded = Object.fromEntries(String(rescue.query).split("&").map((part) => {
  const index = part.indexOf("=");
  return [part.slice(0, index), part.slice(index + 1)];
}));
const encodedParsed = parseShareInvite({ query: rawEncoded });
assert(encodedParsed && encodedParsed.name === rescue.name && encodedParsed.species === rescue.species, "raw percent-encoded launch values must never reach the UI");
const doubleEncoded = Object.fromEntries(Object.entries(rawEncoded).map(([key, value]) => [key, encodeURIComponent(value)]));
const doubleParsed = parseShareInvite({ query: doubleEncoded });
assert(doubleParsed && doubleParsed.name === rescue.name && doubleParsed.species === rescue.species, "forwarded double-encoded share values must be decoded safely");
const stringParsed = parseShareInvite({ query: rescue.query });
assert(stringParsed && stringParsed.name === rescue.name, "string launch query should be supported");
assert(!parseShareInvite({ query: { share: "other", sid: "x" } }), "unrelated launch query must not create a forest invitation");

const receiver = createCharacter(null, "保护区卫士");
receiver.world.knownCharacters[0].species = parsed.species;
const reputationBefore = receiver.world.reserve.reputation;
const trustBefore = receiver.world.knownCharacters[0].relation.trust;
const assistance = applyShareAssistance(receiver, parsed);
assert(assistance.applied, "first real share entry should apply assistance");
assert(!Object.prototype.hasOwnProperty.call(receiver.world.reserve, "intel"), "share assistance must not restore retired resource fields");
assert(receiver.world.reserve.reputation === Math.min(100, reputationBefore + 1), "share assistance reputation change is wrong");
assert(receiver.world.knownCharacters[0].relation.trust === Math.min(100, trustBefore + 1), "matching animal trust should respond to friend assistance");
assert(receiver.world.lifeMemory.memories.some((item) => item.type === "friend_assist" && item.id.includes(parsed.shareId)), "friend assistance should enter permanent reserve memory");
const duplicate = applyShareAssistance(receiver, parsed);
assert(!duplicate.applied && duplicate.reason === "duplicate", "same shareId must never grant resources twice");

// Cold-start recipient carries the real invite into the fog story; it settles
// when the hound leads the player into the reserve instead of interrupting the opening.
launchOptions = { query: queryObject(rescue.query) };
const invitedGame = new Game();
invitedGame.stopLoop();
assert(invitedGame.screen === "choose" && invitedGame.pendingShareInvite && invitedGame.pendingShareInvite.shareId === rescue.shareId,
  "cold-start share recipient should retain the named invitation without interrupting the fog opening");
assert(invitedGame.advancePlayablePrologue(true) && invitedGame.advancePlayablePrologue(true), "shared new-player flow should retain the two-step discovery");
assert(invitedGame.state.character && invitedGame.state.ui.shareAssistances.some((item) => item.shareId === rescue.shareId), "following the hound into the reserve should settle the retained friend assistance once");

// Native share button and menu share both carry dynamic text, image and entry query.
launchOptions = {};
const game = new Game();
game.stopLoop();
game.state = createCharacter(null, "保护区卫士");
game.render = () => {};
nativeShare = null;
game.shareForestPostcard({ type: "rare", day: game.state.world.day, individualId: individual.id, name: "月白", species: "鹿" });
assert(nativeShare && /月白/.test(nativeShare.title) && nativeShare.imageUrl === SHARE_IMAGES.rare && /share=guardian/.test(nativeShare.query), "visible share button should send dynamic native payload");
assert(typeof menuShareFactory === "function", "WeChat top-right share menu should be registered");
const menuPayload = menuShareFactory();
assert(menuPayload.title && Object.values(SHARE_IMAGES).includes(menuPayload.imageUrl) && /share=guardian/.test(menuPayload.query), "top-right share menu payload is incomplete");

const emotion = game.buildEmotionEventDetail({ type: "return", day: 20, individual: { id: individual.id, name: individual.name, species: individual.species }, title: `${individual.name}回来了`, body: "它沿旧路线回家。" });
assert(emotion.actionLabel === "分享这一刻" && typeof emotion.action === "function", "major animal moments should expose direct sharing");

console.log("share system check ok (3 images, dynamic copy, native/menu share, cold entry, one-time assistance, memory)");
