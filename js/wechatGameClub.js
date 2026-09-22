function safeNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

class WechatGameClubController {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.viewport = this.readViewport(options.viewport);
    this.instance = null;
    this.requestedVisible = false;
    this.shown = false;
    this.slot = null;
  }

  readViewport(info = {}) {
    try {
      const system = info && (info.windowWidth || info.width)
        ? info
        : (typeof this.runtime.getSystemInfoSync === "function" ? this.runtime.getSystemInfoSync() : {});
      return {
        width: Math.max(1, safeNumber(system.windowWidth || system.width, 375)),
        height: Math.max(1, safeNumber(system.windowHeight || system.height, 667))
      };
    } catch (error) {
      return { width: 375, height: 667 };
    }
  }

  isSupported() {
    return typeof this.runtime.createGameClubButton === "function";
  }

  offscreenTop() {
    return Math.max(1, safeNumber(this.viewport.height, 667)) + 96;
  }

  styleForSlot(slot = this.slot, park = false) {
    const width = Math.max(72, Math.round(safeNumber(slot && slot.w, 148)));
    const height = Math.max(32, Math.round(safeNumber(slot && slot.h, 36)));
    return {
      left: park ? -9999 : Math.max(0, Math.round(safeNumber(slot && slot.x, 0))),
      top: park ? this.offscreenTop() : Math.max(0, Math.round(safeNumber(slot && slot.y, 0))),
      width,
      height,
      lineHeight: height,
      backgroundColor: "#1c3325",
      color: "#fff8df",
      borderColor: "#1c3325",
      borderWidth: 0,
      borderRadius: 10,
      fontSize: 13,
      textAlign: "center"
    };
  }

  createOptions(park = true) {
    return {
      type: "text",
      text: "加入游戏圈",
      style: this.styleForSlot(this.slot, park)
    };
  }

  create() {
    if (this.instance || !this.isSupported()) return this.instance;
    try {
      const options = this.createOptions(true);
      const instance = this.runtime.createGameClubButton(options);
      if (!instance) return null;
      this.instance = instance;
      this.shown = false;
      if (typeof instance.hide === "function") {
        try { instance.hide(); } catch (error) { /* 创建后先藏起，避免盖住其他页。 */ }
      }
      return instance;
    } catch (error) {
      this.instance = null;
      if (typeof console !== "undefined" && console.warn) console.warn("创建游戏圈按钮失败", error);
      return null;
    }
  }

  applyStyle(park = !this.requestedVisible) {
    if (!this.instance || !this.instance.style) return;
    const style = this.styleForSlot(this.slot, park);
    Object.keys(style).forEach((key) => {
      this.instance.style[key] = style[key];
    });
  }

  setViewportSlot(slot = null) {
    if (!slot) {
      this.slot = null;
      this.applyStyle(true);
      return;
    }
    if (Number.isFinite(slot.viewportWidth)) this.viewport.width = Math.max(1, slot.viewportWidth);
    if (Number.isFinite(slot.viewportHeight)) this.viewport.height = Math.max(1, slot.viewportHeight);
    this.slot = {
      x: safeNumber(slot.x, 0),
      y: safeNumber(slot.y, 0),
      w: safeNumber(slot.w, 148),
      h: safeNumber(slot.h, 36)
    };
    this.applyStyle(!this.requestedVisible);
  }

  setVisible(visible) {
    const next = !!visible;
    if (!next) {
      this.requestedVisible = false;
      this.destroy();
      return;
    }
    this.requestedVisible = true;
    if (!this.instance && !this.create()) return;
    this.applyStyle(false);
    if (this.shown) return;
    if (this.instance && typeof this.instance.show === "function") {
      try { this.instance.show(); } catch (error) { /* 显示失败时下一帧再试。 */ }
    }
    this.shown = true;
  }

  destroy() {
    this.requestedVisible = false;
    this.shown = false;
    const instance = this.instance;
    this.instance = null;
    if (!instance) return;
    try {
      if (instance.style) {
        instance.style.left = -9999;
        instance.style.top = this.offscreenTop();
      }
    } catch (error) { /* 移出屏幕失败时继续销毁。 */ }
    try { if (typeof instance.hide === "function") instance.hide(); } catch (error) { /* hide 失败不阻断。 */ }
    try { if (typeof instance.destroy === "function") instance.destroy(); } catch (error) { /* destroy 失败不阻断。 */ }
  }
}

module.exports = {
  WechatGameClubController
};
