const MINI_GAME_FAVORITE_LOGIN_LIMIT = 5;
const MINI_GAME_FAVORITE_LOGIN_KEY = "forest_kingdom_minigame_favorite_logins";
function readStoredCount(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }
  return 0;
}
function recordMiniGameFavoriteLogin(runtime = {}) {
  let count = 0;
  try {
    if (typeof runtime.getStorageSync === "function") count = readStoredCount(runtime.getStorageSync(MINI_GAME_FAVORITE_LOGIN_KEY));
  } catch (error) {
    count = 0;
  }
  count += 1;
  try {
    if (typeof runtime.setStorageSync === "function") runtime.setStorageSync(MINI_GAME_FAVORITE_LOGIN_KEY, count);
  } catch (error) { /* 记不住次数时，这一次登录仍按已记录的数字显示。 */ }
  return count;
}
function miniGameFavoriteButtonVisible(loginCount) {
  return readStoredCount(loginCount) > 0 && readStoredCount(loginCount) <= MINI_GAME_FAVORITE_LOGIN_LIMIT;
}
class WechatMiniGameFavorite {
  constructor(runtime) {
    this.runtime = runtime || {};
    this.added = false;
    this.checked = false;
  }
  refresh(onChange) {
    const check = this.runtime && this.runtime.checkIsAddedToMyMiniProgram;
    if (typeof check !== "function") return false;
    try {
      check({
        success: (res) => {
          const added = !!(res && res.added);
          const changed = added !== this.added || !this.checked;
          this.added = added;
          this.checked = true;
          if (changed && typeof onChange === "function") onChange(added);
        },
        fail: () => { this.checked = true; }
      });
      return true;
    } catch (error) {
      return false;
    }
  }
  bindMenuFavorite(payload) {
    const listen = this.runtime && this.runtime.onAddToFavorites;
    if (typeof listen !== "function") return false;
    try {
      listen(() => (typeof payload === "function" ? payload() : { title: "继续守护" }));
      return true;
    } catch (error) {
      return false;
    }
  }
  showPlatformGuide() {
    const show = this.runtime && this.runtime.showFavoriteGuide;
    if (typeof show !== "function") return false;
    try {
      show({
        type: "bar",
        content: "添加到我的小程序",
        position: "bottom"
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
module.exports = {
  MINI_GAME_FAVORITE_LOGIN_LIMIT,
  recordMiniGameFavoriteLogin,
  miniGameFavoriteButtonVisible,
  WechatMiniGameFavorite
};
