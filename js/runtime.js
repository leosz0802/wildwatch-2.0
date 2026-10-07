function getRuntime() {
  if (typeof wx !== "undefined") return wx;
  if (typeof tt !== "undefined") return tt;
  return {
    getSystemInfoSync() {
      return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
    },
    createCanvas() {
      if (typeof document !== "undefined") {
        return document.createElement("canvas");
      }
      return {
        width: 375,
        height: 667,
        getContext() {
          return null;
        }
      };
    },
    getStorageSync(key) {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
      return null;
    },
    setStorageSync(key, value) {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, JSON.stringify(value));
      }
    },
    onTouchStart() {},
    onTouchMove() {},
    onAppHide() {},
    onAppShow() {},
    showToast(options) {
      console.log(options.title);
    },
    showModal(options) {
      if (options.success) options.success({ confirm: true });
    }
  };
}
module.exports = {
  getRuntime
};
