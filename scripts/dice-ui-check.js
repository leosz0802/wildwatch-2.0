const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const previewDir = process.env.UI_PREVIEW_DIR;
const canvasLibrary = previewDir ? require("@napi-rs/canvas") : null;
if (canvasLibrary && process.env.UI_PREVIEW_FONT) canvasLibrary.GlobalFonts.registerFromPath(process.env.UI_PREVIEW_FONT, "PingFang SC");
function fakeContext() {
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return (value) => ({ width: [...String(value)].reduce((sum, c) => sum + (/[^\x00-\xff]/.test(c) ? 1 : .56), 0) * (Number((target.font || "12px").match(/([\d.]+)px/)[1])) });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
      return target[key] || (() => {});
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}
async function main() {
const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.dpr = 1;
game.scrollY = 0;
// Use the actual sandbox terrain in raster previews, and a loaded-image double
// in headless checks so the image path cannot silently regress to primitives.
const terrainImage = canvasLibrary ? await canvasLibrary.loadImage(require("path").join(__dirname, "../assets/art/core-map-anime-v1.jpg")) : { width: 1672, height: 941 };
terrainImage.loaded = true;
game.art = Object.assign({}, game.art, { map: terrainImage });
const kinds = ["materialExploration", "collectionDice", "strategicDice", "neighborEventDice", "visitorIncidentDice"];
for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
  game.width = width; game.height = height;
  game.info = { windowWidth: width, windowHeight: height, pixelRatio: 1, safeArea: { top: 0, bottom: height } };
  game.canvas = canvasLibrary ? canvasLibrary.createCanvas(width, height) : null;
  game.ctx = game.canvas ? game.canvas.getContext("2d") : fakeContext();
  for (const kind of kinds) {
    for (const phase of ["ready", "rolling", "resolved"]) {
      for (let face = 1; face <= 6; face++) {
        const event = /EventDice|IncidentDice/.test(kind);
        const modal = {
          kind, phase: event && phase === "resolved" ? "result" : phase, displayRoll: face,
          explorationMode: kind === "materialExploration" ? "archery" : "animalDice",
          archeryAimStartedAt: Date.now(),
          title: "探索自然遗留物", kicker: "动物引路 · 物资与知识", icon: "eye",
          actionLabel: phase === "ready" ? "探索" : phase === "rolling" ? "点数生成中" : "点数已锁定", action() {},
          footer: "点数与结果同步 · 每次只结算一次",
          preview: { level: 1, levelContribution: 0, relationshipContribution: 1, requiredScore: 5, relationship: { securityAverage: 43, wildnessAverage: 84 } },
          lead: { quality: 2, animal: { name: "晨角", trust: 85 } }, method: { id: "animal" },
          dicePreview: { routeModifier: 1, resourceModifier: 2, threshold: 5 },
          diceMotion: phase === "rolling" ? { startedAt: Date.now() - 160, duration: 455 } : null,
          result: event && phase === "resolved" ? { success: true, businessChange: { visitorsBefore: 0, visitorsAfter: 152, visitorsDelta: 152, fundBefore: 123456, fundAfter: 234567, fundDelta: 111111 } } : null
        };
        game.infoDetailModal = modal; game.hitAreas = [];
        game.ctx.clearRect(0, 0, width, height);
        game.drawInfoDetailModal();
        const stage = modal.renderedDiceStage;
        const eventLayout = modal.renderedNeighborEventLayout || modal.renderedVisitorIncidentLayout;
        const drawing = stage ? stage.drawing : eventLayout.die.drawing;
        assert.strictEqual(drawing.face, phase === "ready" ? 0 : face, `${kind}: visual die must match displayed number`);
        assert.strictEqual(drawing.pips.length, phase === "ready" ? 0 : face, `${kind}: every face must contain exactly the stated dots`);
        const die = stage ? stage.die : eventLayout.die;
        const formula = stage ? stage.formula : eventLayout.formula;
        assert(die.y + die.size + 4 <= formula.y, `${kind}: animated die must not cover formula`);
        assert(die.x >= 0 && die.x + die.size <= width, `${kind}: die must stay inside modal`);
        const frame = modal.renderedInfoFrame;
        if (stage) assert(stage.note.y + stage.note.h <= frame.y + frame.h - 98, `${kind}: note must stay above footer`);
        if (kind === "collectionDice") {
          const fire = modal.renderedArcheryFireButton;
          assert(fire, "collection dice needs a footer fire button");
          assert(stage && stage.y + stage.h <= fire.y, "collection dice fire button must sit below the archery stage");
          assert(fire.w >= (game.width - 40) - 40, "collection dice fire button must span the modal footer");
          assert(fire.x <= 40, "collection dice fire button must sit in the modal footer");
          if (phase === "ready") {
            const fireHits = game.hitAreas.filter((hit) => hit.x === fire.x && Math.abs(hit.y - fire.y) <= 8 && hit.w >= fire.w - 2);
            assert(fireHits.length >= 1, "collection dice footer fire must be tappable");
          }
        }
        if (kind === "materialExploration") {
          const caption = modal.renderedArcheryCaption;
          const fire = modal.renderedArcheryFireButton;
          assert(caption && caption.separateCaption, "exploration needs a separate caption area");
          const prompt = modal.renderedArcheryPrompt;
          assert(modal.renderedArcheryTerrain.sharedWithSandbox, "archery must draw the loaded sandbox terrain image");
          assert(prompt && prompt.y >= caption.graphicsBottom + 10, "prompt must sit below bow and compass");
          assert(prompt.y + prompt.h <= caption.stageBottom, "prompt must stay inside bottom safe area");
          if (phase === "resolved") {
            assert(prompt.text.includes(`本次获得 ${face} 点`), "bottom caption must show the actual shot score");
            assert(modal.renderedArcheryResult.y >= caption.graphicsBottom + 10, "score must never overlay the arrow flight");
          }
          assert(caption.graphicsBottom + 10 <= caption.formula.y, "formula must clear bow, pointer and compass label");
          assert(caption.formula.y + caption.formula.h + 2 <= caption.note.y, "notes must clear formula");
          assert(caption.note.y + caption.note.h + 8 <= caption.stageBottom, "notes need bottom padding");
          assert(fire && caption.stageBottom < fire.y, "fire button must not intersect caption");
          // The target keeps its pre-change position and responsive size.
          assert.strictEqual(stage.target.y, stage.y + 22);
          assert.strictEqual(stage.target.size, Math.min(132, stage.w - 24, Math.max(48, stage.h - 90)));
          if (phase === "ready") {
            const targetHits = game.hitAreas.filter((hit) => Math.abs(hit.x - stage.target.x) < 2
              && Math.abs(hit.y - stage.target.y) < 2 && Math.abs(hit.w - stage.target.size) < 8);
            assert.strictEqual(targetHits.length, 0, "解救射箭靶面不能绕过底部按钮直接发射");
            const fireHits = game.hitAreas.filter((hit) => hit.x === fire.x && Math.abs(hit.y - fire.y) <= 8 && hit.w >= fire.w - 2);
            assert(fireHits.length >= 1, "解救射箭底部发射按钮必须可点击");
          }
        }
        if (eventLayout) {
          const graphics = eventLayout.graphics;
          assert(graphics.bottom + 10 <= eventLayout.formula.y, `${kind}: result strip must clear bow and compass`);
          assert(graphics.y + graphics.h <= eventLayout.formula.y, `${kind}: all feedback must sit below terrain`);
          if (eventLayout.result) {
            assert(eventLayout.formula.y + eventLayout.formula.h + 8 <= eventLayout.result.y, `${kind}: result cards must clear score strip`);
            assert(eventLayout.result.statusY >= eventLayout.result.y + eventLayout.result.h + 14, `${kind}: status must clear result cards`);
            assert(eventLayout.result.statusY < frame.y + frame.h - 56, `${kind}: result must stay above bottom buttons`);
          }
          if (phase === "ready") {
            const die = eventLayout.die;
            const targetHits = game.hitAreas.filter((hit) => Math.abs(hit.x - die.x) < 2 && Math.abs(hit.y - die.y) < 2 && Math.abs(hit.w - die.size) < 8);
            assert.strictEqual(targetHits.length, 0, `${kind}: footer-controlled target must not be a hidden fire button`);
            assert(game.hitAreas.filter((hit) => hit.hud).length >= 2, `${kind}: footer buttons must use hud so WeChat cannot fire touchstart and touchend twice`);
          }
        }
        if (previewDir && face === 6 && ["materialExploration", "neighborEventDice"].includes(kind)) {
          require("fs").writeFileSync(require("path").join(previewDir, `${kind}-${phase}-${width}.png`), game.canvas.toBuffer("image/png"));
        }
      }
    }
  }
}

// All rescue item names and ready/flight/result states use the same safe caption layout.
const { RESCUE_ITEM_CATALOG } = require("../js/chapterRescueSystem");
for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
  game.width = width; game.height = height;
  game.info = { windowWidth: width, windowHeight: height, pixelRatio: 1, safeArea: { top: 0, bottom: height } };
  game.ctx = fakeContext();
  for (const item of RESCUE_ITEM_CATALOG) {
    game.openMaterialExploration(item.id);
    const modal = game.infoDetailModal;
    assert.strictEqual(modal.target.id, item.id);
    for (const phase of ["ready", "rolling", "resolved"]) {
      modal.phase = phase; game.hitAreas = [];
      game.drawInfoDetailModal();
      const caption = modal.renderedArcheryCaption;
      assert(caption.graphicsBottom < caption.formula.y, `${item.label} ${phase}: caption overlaps compass`);
      assert(caption.note.y + caption.note.h <= caption.stageBottom - 8, `${item.label} ${phase}: bottom padding lost`);
    }
  }
}

// Inspect actual canvas arcs, so a wrong point pattern cannot pass using metadata alone.
const ctx = fakeContext();
for (const rolling of [false, true]) {
  for (let face = 1; face <= 6; face++) {
    const arcs = [];
    ctx.arc = (x, y, r) => arcs.push({ x, y, r });
    game.infoDetailModal = { diceMotion: { startedAt: Date.now() - 100, duration: 455 } };
    const die = game.drawSixSidedDie(ctx, 0, 0, 100, face, rolling);
    assert.strictEqual(arcs.length, face, "drawing must not choose its own random face");
    arcs.forEach((pip) => {
      const b = die.frontBounds;
      assert(pip.x - pip.r > b.x + 8 && pip.x + pip.r < b.x + b.w - 8, "dots must clear both side edges");
      assert(pip.y - pip.r > b.y + 8 && pip.y + pip.r < b.y + b.h - 8, "dots must clear top and bottom edges");
    });
  }
}

// Exercise real animation callbacks with a virtual clock: rolling/resolved double taps
// must not reroll, and closing the modal must cancel the delayed settlement callback.
const oldTimer = global.setTimeout;
const oldNow = Date.now;
const oldRandom = Math.random;
try {
  let clock = 10000;
  let queue = [];
  global.setTimeout = (fn, delay) => { queue.push({ fn, delay }); return queue.length; };
  Date.now = () => clock;
  Math.random = () => .67;
  for (const kind of ["materialExploration", "collectionDice"]) {
    for (const cancel of [false, true]) {
      let settlements = 0;
      queue = [];
      game.infoDetailModal = { kind, phase: "ready", displayRoll: 1, explorationMode: kind === "materialExploration" ? "archery" : "animalDice", archeryAimStartedAt: clock, archeryAimValue: kind === "materialExploration" ? .4 : undefined };
      const modal = game.infoDetailModal;
      game.executeMaterialExploration = (_, roll) => { assert.strictEqual(roll, 5); settlements++; };
      game.finishCollectionInvestigation = (roll) => { assert.strictEqual(roll, 5); settlements++; };
      const roll = () => kind === "materialExploration" ? game.rollMaterialExplorationDice() : game.rollCollectionDice();
      roll(); roll();
      while (queue.length) {
        const task = queue.shift(); clock += task.delay; task.fn();
        if (modal.phase === "resolved") {
          roll();
          if (cancel) game.infoDetailModal = null;
        }
      }
      assert.strictEqual(modal.displayRoll, 5);
      assert.strictEqual(modal.diceMotion, null);
      if (cancel) {
        assert.strictEqual(settlements, 0, `${kind}: torn-down confirm page must not auto-settle`);
        assert.equal(game.restoreResolvedArcheryOrDiceConfirm(), true, `${kind}: torn-down page must restore confirm`);
        if (kind === "materialExploration") game.confirmArcheryScore();
        else game.confirmResolvedArcheryOrDice();
        assert.strictEqual(settlements, 1, `${kind}: 确认得分 must settle once after restore`);
      } else {
        assert.strictEqual(settlements, 0, `${kind}: 确认得分 must stay until the player confirms`);
        if (kind === "materialExploration") game.confirmArcheryScore();
        else game.confirmResolvedArcheryOrDice();
        assert.strictEqual(settlements, 1, `${kind}: 确认得分 must settle once`);
      }
    }
  }
} finally {
  global.setTimeout = oldTimer; Date.now = oldNow; Math.random = oldRandom;
}
// Close X must dismiss the 点数调查 card, including mid-flight.
game.width = 375; game.height = 667;
game.info = { windowWidth: 375, windowHeight: 667, pixelRatio: 1, safeArea: { top: 0, bottom: 667 } };
game.ctx = fakeContext();
game.collectionRollToken = "live";
game.infoDetailModal = {
  kind: "collectionDice", phase: "rolling", displayRoll: 4, action() {},
  lead: { quality: 1, animal: { name: "晨角", trust: 85 } }, method: { id: "animal", name: "动物引路" }
};
game.hitAreas = [];
const drawnTexts = [];
const originalText = game.text.bind(game);
game.text = function (ctx, value, ...rest) {
  drawnTexts.push(String(value || ""));
  return originalText(ctx, value, ...rest);
};
game.drawInfoDetailModal();
game.text = originalText;
assert.equal(drawnTexts.some((value) => /点数.+\+ 线索|调查总点数|总点数5\+|命中区/.test(value)), false, "collection dice must not overlay the formula or hit-zone copy");
const frame = game.infoDetailModal.renderedInfoFrame;
const close = game.infoDetailHeaderLayout(game.ctx, game.infoDetailModal, frame.x, frame.y, frame.w).close;
const closeHit = game.hitAreas.slice().reverse().find((hit) => (
  hit.x < close.x + close.w && hit.x + hit.w > close.x
  && hit.y < close.y + close.h && hit.y + hit.h > close.y
  && typeof hit.onTap === "function"
));
assert(closeHit, "collection dice close must stay tappable");
closeHit.onTap();
assert.strictEqual(game.infoDetailModal, null, "collection dice close must dismiss the card");
assert.strictEqual(game.collectionRollToken, null, "collection dice close must cancel the in-flight roll");

console.log("dice UI check ok (5 dialogs, 3 viewports, ready/rolling/result, all 6 faces, repeat taps and cancellation)");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
