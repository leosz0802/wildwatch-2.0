const AUDIO_ASSETS = {
  tap: "assets/audio/sfx-tap.m4a",
  confirm: "assets/audio/sfx-confirm.m4a",
  success: "assets/audio/sfx-success.m4a",
  warning: "assets/audio/sfx-warning.m4a",
  dice: "assets/audio/sfx-dice.m4a"
};

function normalizeAudioSettings(state) {
  if (!state || typeof state !== "object") return { enabled: true, sfx: true };
  state.ui = Object.assign({}, state.ui || {});
  state.ui.audio = Object.assign({ enabled: true, sfx: true }, state.ui.audio || {});
  state.ui.audio.enabled = state.ui.audio.enabled !== false;
  state.ui.audio.sfx = state.ui.audio.sfx !== false;
  delete state.ui.audio.music;
  return state.ui.audio;
}

class AudioSystem {
  constructor(runtime, state) {
    this.runtime = runtime || {};
    this.state = state || {};
    this.settings = normalizeAudioSettings(this.state);
    this.effects = {};
    this.userActivated = false;
    this.lastPlayedAt = {};
  }

  isAvailable() {
    return !!(this.runtime && typeof this.runtime.createInnerAudioContext === "function");
  }

  attachState(state) {
    if (state && typeof state === "object") this.state = state;
    this.settings = normalizeAudioSettings(this.state);
    return this.settings;
  }

  isEnabled() {
    this.settings = normalizeAudioSettings(this.state);
    return this.settings.enabled !== false;
  }

  createContext(src, options = {}) {
    if (!this.isAvailable()) return null;
    try {
      const context = this.runtime.createInnerAudioContext();
      context.autoplay = false;
      context.loop = !!options.loop;
      context.obeyMuteSwitch = true;
      context.volume = typeof options.volume === "number" ? options.volume : 0.5;
      context.src = src;
      if (typeof context.onError === "function") context.onError(() => {});
      return context;
    } catch (error) {
      return null;
    }
  }

  ensureEffect(name) {
    if (!AUDIO_ASSETS[name]) return null;
    if (!this.effects[name]) this.effects[name] = this.createContext(AUDIO_ASSETS[name], { volume: name === "tap" ? 0.30 : name === "warning" ? 0.42 : 0.48 });
    return this.effects[name];
  }

  unlock() {
    this.userActivated = true;
  }

  playEffect(name) {
    if (!this.userActivated || !this.isEnabled() || this.settings.sfx === false || !AUDIO_ASSETS[name]) return false;
    const now = Date.now();
    const cooldown = name === "tap" ? 45 : 80;
    if (now - (this.lastPlayedAt[name] || 0) < cooldown) return false;
    this.lastPlayedAt[name] = now;
    const effect = this.ensureEffect(name);
    if (!effect || typeof effect.play !== "function") return false;
    try {
      if (typeof effect.stop === "function") effect.stop();
      effect.src = AUDIO_ASSETS[name];
      effect.play();
      return true;
    } catch (error) {
      return false;
    }
  }

  setEnabled(enabled) {
    this.settings = normalizeAudioSettings(this.state);
    this.settings.enabled = !!enabled;
    if (this.settings.enabled) {
      this.unlock();
      this.playEffect("confirm");
    }
    return this.settings.enabled;
  }

  toggle() {
    return this.setEnabled(!this.isEnabled());
  }

  destroy() {
    Object.values(this.effects).forEach((context) => {
      if (context && typeof context.destroy === "function") {
        try { context.destroy(); } catch (error) { /* ignore audio teardown errors */ }
      }
    });
    this.effects = {};
  }
}

module.exports = {
  AUDIO_ASSETS,
  normalizeAudioSettings,
  AudioSystem
};
