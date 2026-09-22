const assert = require("assert");
const { Game } = require("../js/game");

function mockContext() {
  const gradient = { addColorStop() {} };
  return {
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, arcTo() {}, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, drawImage() {}, rect() {}, clip() {},
    setLineDash() {}, fillText() {},
    measureText(text) {
      const size = Number((this.font || "12px").match(/([\d.]+)px/)[1]);
      return { width: Array.from(String(text)).reduce((sum, c) => sum + size * (c.charCodeAt(0) > 255 ? 1 : .6), 0) };
    },
    createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; }
  };
}
const cases = [
  { phase: "ready", items: [
    { tag: "任务", title: "检查游线与游客秩序", body: "现场暂无冲突，完成一次日常引导和游线维护即可记录今日任务。" },
    { tag: "奖励", title: "研究样本待收 +1 · 基金 +8", body: "完成后自动发放，今日仅领取一次。" }
  ] },
  { phase: "result", items: [
    { tag: "全清完成", title: "今日2项任务全部完成", body: "逐项奖励与全清额外奖励均已到账。" },
    { tag: "全部奖励", title: "回应游客现场：基金 +8；野外工具包 +1；草原斑马信任 +1", body: "基金 1163→1171 · 游客 11→12。水源 73→74 · 草场 88→89 · 安全 75→76。" }
  ] },
  { phase: "result", items: [
    { tag: "完成", title: "游线与游客秩序已检查", body: "回应游客现场：基金 +8；野外工具包 +1" },
    { tag: "游客与基金", title: "11 → 12 人 · 基金 1171 星币", body: "日常引导和维护已写入经营记录。" }
  ] }
];
// Optional real Canvas metrics also exercise the exact production drawing code.
let createCanvas;
try {
  const canvas = require("@napi-rs/canvas");
  createCanvas = canvas.createCanvas;
  canvas.GlobalFonts.registerFromPath("/System/Library/Fonts/STHeiti Medium.ttc", "-apple-system");
} catch (_) {}
for (const width of [320, 375, 430]) {
  for (const bodyH of [280, 362]) {
    for (const fixture of cases) {
      const game = Object.create(Game.prototype);
      game.ctx = createCanvas ? createCanvas(width, 700).getContext("2d") : mockContext();
      game.width = width;
      const modal = JSON.parse(JSON.stringify(fixture));
      modal.kind = "visitorRoutine";
      game.infoDetailModal = modal;
      const draw = () => game.drawVisitorRoutineModalContent(game.ctx, modal, 20, 110, width - 40, bodyH);
      draw();
      const layout = modal.renderedVisitorRoutineLayout;
      const label = `${width}px/${bodyH}/${fixture.phase}`;
      assert.strictEqual(layout.cards.length, fixture.items.length, `missing result card: ${label}`);
      layout.cards.forEach((card, index) => {
        assert(!card.title.truncated && !(card.description && card.description.truncated), `copy truncated: ${label}`);
        assert(card.textTop >= card.tagBottom + 8, `pill overlaps copy: ${label}`);
        assert(card.textBottom <= card.y + card.h - 10, `copy touches border: ${label}`);
        if (index) assert(layout.cards[index - 1].y + layout.cards[index - 1].h + 8 <= card.y, `cards overlap: ${label}`);
      });
      const last = layout.cards[layout.cards.length - 1];
      assert(last.y + last.h + 8 <= layout.steps.y, `step overlaps last card: ${label}`);
      const view = layout.viewport;
      assert(view.y + view.h <= 110 + bodyH, `viewport exceeds footer: ${label}`);
      assert(game.lifeMemoryTimelineTouchPoint(view.x + 10, view.y + 10), `body does not accept scroll: ${label}`);
      assert.strictEqual(game.lifeMemoryTimelineTouchPoint(view.x + 10, 110 + bodyH + 5), null, `footer captures scroll: ${label}`);
      modal.visitorRoutineScrollY = 1e6;
      draw();
      assert.strictEqual(modal.visitorRoutineScrollY, modal.visitorRoutineMaxScroll, `scroll not clamped: ${label}`);
      const bottom = modal.renderedVisitorRoutineLayout;
      const end = bottom.scene || bottom.steps;
      assert(end.y + end.h <= bottom.viewport.y + bottom.viewport.h, `cannot reach final content: ${label}`);
      modal.visitorRoutineScrollY = -100;
      draw();
      assert.strictEqual(modal.visitorRoutineScrollY, 0, `negative scroll: ${label}`);
    }
  }
}
console.log(`visitor routine layout check ok (${createCanvas ? "real Canvas" : "font-aware mock"}; 18 ready/result viewport cases)`);
