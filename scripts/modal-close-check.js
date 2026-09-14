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
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
  },
  createCanvas() {
    return {
      width: 375,
      height: 667,
      getContext() {
        return createFakeContext();
      }
    };
  },
  getStorageSync() {
    return null;
  },
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { strategicDilemmaById } = require("../js/strategySystem");

const game = new Game();
const animal = game.state.world.knownCharacters[0];
game.infoDetailModal = game.buildAnimalThoughtDetail(animal, game.createAnimalDialogueContext(animal));
game.hitAreas = [];
game.drawInfoDetailModal();

const topClose = game.hitAreas.slice().reverse().find((area) => area.x > 290 && area.y < 120);
if (!topClose) throw new Error("top close hit area missing");
topClose.onTap();
if (game.infoDetailModal) throw new Error("top close did not clear info modal");

game.infoDetailModal = {
  kicker: "通用详情",
  title: "按钮检查",
  icon: "eye",
  lines: ["验证底部关闭按钮仍可使用。"],
  actionLabel: "继续",
  action() {}
};
game.hitAreas = [];
game.drawInfoDetailModal();

const bottomClose = game.hitAreas.slice().reverse().find((area) => area.y > 530 && area.x < game.width / 2 && area.w > 120);
if (!bottomClose) throw new Error("bottom close hit area missing");
bottomClose.onTap();
if (game.infoDetailModal) throw new Error("bottom close did not clear info modal");

// An incoming forest relay must stay dismissed when either close control is
// used; the pending invite cannot be allowed to reopen from the sandbox queue.
game.pendingShareInvite = { name: "松影", species: "斑马", day: 21, kind: "rescue", shareId: "close-check" };
game.infoDetailModal = game.buildShareInviteDetail(game.pendingShareInvite);
game.dismissInfoDetailModal();
if (game.infoDetailModal || game.pendingShareInvite) throw new Error("share relay close reopened or kept the pending invite");
game.pendingShareInvite = { name: "松影", species: "斑马", day: 21, kind: "rescue", shareId: "close-check" };
if (game.openPendingShareInvite()) throw new Error("dismissed share relay was reopened from the event queue");

// A pending strategic dilemma used to reopen itself from dismissInfoDetailModal,
// so both the top close control and “暂缓决定” looked completely unresponsive.
const dilemma = strategicDilemmaById("patrol_split");
game.state = createCharacter(null, "关闭回归测试员");
game.screen = "home";
game.state.world.reserve.strategy = {
  pendingDilemma: { id: dilemma.id, tier: dilemma.tier, day: 2, actionIndex: 4, chapter: 1, guaranteed: true, occurrence: 1 },
  pendingSelection: null,
  pendingRoll: null
};

function openStrategicModal() {
  game.infoDetailModal = null;
  if (!game.openPendingStrategicDilemma()) throw new Error("strategic dilemma did not open for close regression");
  game.hitAreas = [];
  game.drawInfoDetailModal();
  return game.infoDetailModal.renderedInfoFrame;
}

let frame = openStrategicModal();
const strategicTopClose = game.hitAreas.slice().reverse().find((area) => (
  area.x > frame.x + frame.w - 90
  && area.y >= frame.y + 10
  && area.y <= frame.y + 80
));
if (!strategicTopClose) throw new Error("strategic dilemma top close hit area missing");
strategicTopClose.onTap();
if (game.infoDetailModal) throw new Error("strategic dilemma top close immediately reopened the pending decision");
if (!game.state.world.reserve.strategy.pendingDilemma) throw new Error("closing a strategic dilemma should keep it pending");

frame = openStrategicModal();
const deferDecision = game.hitAreas.slice().reverse().find((area) => (
  area.x < game.width / 2
  && area.y >= frame.y + frame.h - 70
  && area.y <= frame.y + frame.h
  && area.w > 100
));
if (!deferDecision) throw new Error("strategic dilemma defer button hit area missing");
deferDecision.onTap();
if (game.infoDetailModal) throw new Error("defer decision immediately reopened the pending strategic dilemma");
if (!game.state.world.reserve.strategy.pendingDilemma) throw new Error("deferred strategic dilemma should remain available later");

console.log("modal close check ok");
