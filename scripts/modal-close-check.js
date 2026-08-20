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

// “本轮成长 → 查看目标” is a modal-to-modal transition. The old modal must
// be released first, otherwise openMissionPush correctly rejects the stack and
// the visible button appears unclickable.
game.state = createCharacter(null, "保护区卫士");
game.screen = "home";
game.infoDetailModal = game.buildRunGrowthDetail();
game.hitAreas = [];
game.drawInfoDetailModal();
const viewGoal = game.hitAreas.slice().reverse().find((area) => area.y > 530 && area.x >= game.width / 2 && area.w > 120);
if (!viewGoal) throw new Error("run growth view-goal hit area missing");
game.handleTap(viewGoal.x + viewGoal.w / 2, viewGoal.y + viewGoal.h / 2);
if (!game.infoDetailModal || game.infoDetailModal.kind !== "missionPush") {
  throw new Error("run growth view-goal button did not replace the current modal with mission goals");
}

console.log("modal close check ok");
