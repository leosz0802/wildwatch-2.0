const AUDIO_ASSETS = {
  success: "assets/audio/sfx-success.m4a",
  taskComplete: "assets/audio/sfx-success.m4a",
  warning: "assets/audio/sfx-dice.m4a",
  dice: "assets/audio/sfx-dice.m4a"
};
const MUSIC_ASSET = "audio-pack/bgm-nature-loop.m4a";
const MUSIC_PROFILE = Object.freeze({ volume: 0.16 });
const EFFECT_PROFILES = Object.freeze({
  success: { volume: 0.30, playbackRate: 0.94, cooldown: 180 },
  taskComplete: { volume: 0.34, playbackRate: 1, cooldown: 260 },
  warning: { volume: 0.12, playbackRate: 0.92, cooldown: 900 },
  dice: { volume: 0.27, playbackRate: 0.90, cooldown: 210 }
});
const CUE_PROFILES = Object.freeze({});
function normalizeAudioSettings(state) {
  if (!state || typeof state !== "object") return { enabled: true, sfx: true, music: true };
  state.ui = Object.assign({}, state.ui || {});
  state.ui.audio = Object.assign({ enabled: true, sfx: true, music: true }, state.ui.audio || {});
  state.ui.audio.enabled = state.ui.audio.enabled !== false;
  state.ui.audio.sfx = state.ui.audio.sfx !== false;
  state.ui.audio.music = state.ui.audio.music !== false;
  return state.ui.audio;
}
class AudioSystem {
  constructor(runtime, state) {
    this.runtime = runtime || {};
    this.state = state || {};
    this.settings = normalizeAudioSettings(this.state);
    this.effects = {};
    this.cueEffects = {};
    this.music = null;
    this.musicStarted = false;
    this.musicPaused = false;
    this.musicReady = false;
    this.musicLoading = false;
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
    const profile = EFFECT_PROFILES[name] || { volume: 0.40 };
    if (!this.effects[name]) this.effects[name] = this.createContext(AUDIO_ASSETS[name], { volume: profile.volume });
    return this.effects[name];
  }
  unlock() {
    this.userActivated = true;
    if (this.isEnabled() && this.settings.music !== false && !this.musicStarted) this.playMusic();
    return true;
  }
  ensureMusic() {
    if (this.music) return this.music;
    this.music = this.createContext(MUSIC_ASSET, { loop: true, volume: MUSIC_PROFILE.volume });
    return this.music;
  }
  startMusicContext() {
    const music = this.ensureMusic();
    if (!music || typeof music.play !== "function") return false;
    try {
      music.loop = true;
      music.volume = MUSIC_PROFILE.volume;
      if (music.src !== MUSIC_ASSET) music.src = MUSIC_ASSET;
      music.play();
      this.musicStarted = true;
      this.musicPaused = false;
      return true;
    } catch (error) {
      return false;
    }
  }
  playMusic() {
    if (!this.userActivated || !this.isEnabled() || this.settings.music === false) return false;
    if (this.musicStarted && !this.musicPaused) return true;
    if (this.musicReady || typeof this.runtime.loadSubpackage !== "function") {
      this.musicReady = true;
      return this.startMusicContext();
    }
    if (this.musicLoading) return true;
    this.musicLoading = true;
    try {
      this.runtime.loadSubpackage({
        name: "audio-pack",
        success: () => {
          this.musicReady = true;
          this.musicLoading = false;
          if (this.userActivated && this.isEnabled() && this.settings.music !== false) this.startMusicContext();
        },
        fail: () => { this.musicLoading = false; }
      });
      return true;
    } catch (error) {
      this.musicLoading = false;
      this.musicReady = true;
      return this.startMusicContext();
    }
  }
  pauseMusic() {
    if (!this.music || typeof this.music.pause !== "function") return false;
    try {
      this.music.pause();
      this.musicPaused = true;
      return true;
    } catch (error) {
      return false;
    }
  }
  playEffect(name) {
    if (!this.userActivated || !this.isEnabled() || this.settings.sfx === false || !AUDIO_ASSETS[name]) return false;
    const now = Date.now();
    const cooldown = (EFFECT_PROFILES[name] || {}).cooldown || 100;
    if (now - (this.lastPlayedAt[name] || 0) < cooldown) return false;
    this.lastPlayedAt[name] = now;
    const effect = this.ensureEffect(name);
    if (!effect || typeof effect.play !== "function") return false;
    try {
      if (typeof effect.stop === "function") effect.stop();
      effect.src = AUDIO_ASSETS[name];
      effect.volume = (EFFECT_PROFILES[name] || {}).volume || 0.25;
      effect.playbackRate = (EFFECT_PROFILES[name] || {}).playbackRate || 1;
      effect.play();
      return true;
    } catch (error) {
      return false;
    }
  }
  playCue(name) {
    const profile = CUE_PROFILES[name];
    if (!profile || !this.userActivated || !this.isEnabled() || this.settings.sfx === false) return false;
    const now = Date.now();
    const key = `cue:${name}`;
    if (now - (this.lastPlayedAt[key] || 0) < profile.cooldown) return false;
    this.lastPlayedAt[key] = now;
    if (!this.cueEffects[name]) this.cueEffects[name] = this.createContext(AUDIO_ASSETS[profile.asset], { volume: profile.volume });
    const effect = this.cueEffects[name];
    if (!effect || typeof effect.play !== "function") return false;
    try {
      if (typeof effect.stop === "function") effect.stop();
      effect.src = AUDIO_ASSETS[profile.asset];
      effect.volume = profile.volume;
      effect.playbackRate = profile.playbackRate;
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
    } else {
      [this.music].concat(Object.values(this.effects), Object.values(this.cueEffects)).forEach((context) => {
        if (!context) return;
        try {
          context.volume = 0;
          const stop = context.stop || context.pause;
          if (stop) stop.call(context);
        } catch (error) {}
      });
      this.musicStarted = false;
      this.musicPaused = true;
    }
    return this.settings.enabled;
  }
  toggle() {
    return this.setEnabled(!this.isEnabled());
  }
  destroy() {
    Object.values(this.effects).forEach((context) => {
      if (context && typeof context.destroy === "function") {
        try { context.destroy(); } catch (error) {}
      }
    });
    Object.values(this.cueEffects).forEach((context) => {
      if (context && typeof context.destroy === "function") {
        try { context.destroy(); } catch (error) {}
      }
    });
    if (this.music && typeof this.music.destroy === "function") {
      try { this.music.destroy(); } catch (error) {}
    }
    this.effects = {};
    this.cueEffects = {};
    this.music = null;
    this.musicStarted = false;
    this.musicPaused = false;
  }
}
module.exports = {
  AUDIO_ASSETS,
  EFFECT_PROFILES,
  CUE_PROFILES,
  MUSIC_ASSET,
  MUSIC_PROFILE,
  normalizeAudioSettings,
  AudioSystem
};
