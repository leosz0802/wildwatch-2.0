const fs = require("fs");
const path = require("path");
const { AudioSystem, AUDIO_ASSETS, EFFECT_PROFILES, CUE_PROFILES, MUSIC_PROFILE, normalizeAudioSettings } = require("../js/audioSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const contexts = [];
const runtime = {
  createInnerAudioContext() {
    const context = {
      src: "",
      volume: 1,
      loop: false,
      plays: 0,
      pauses: 0,
      stops: 0,
      play() { this.plays += 1; },
      pause() { this.pauses += 1; },
      stop() { this.stops += 1; },
      destroy() {},
      onError() {}
    };
    contexts.push(context);
    return context;
  }
};

const state = { ui: {} };
const defaults = normalizeAudioSettings(state);
assert(defaults.enabled && defaults.sfx && defaults.music, "新存档应默认开启柔和自然氛围与操作音效");

const audio = new AudioSystem(runtime, state);
assert(audio.isAvailable(), "InnerAudioContext 可用时声音系统必须启用");
assert(!audio.playEffect("tap"), "用户首次交互前不得自动播放音效");
audio.unlock();
assert(contexts.some((context) => context.src === AUDIO_ASSETS.music && context.loop && context.plays === 1), "首次交互后应启动低音量自然氛围循环");
assert(MUSIC_PROFILE.volume <= 0.10, "自然氛围不得压过玩法音效");
assert(audio.playEffect("tap"), "用户交互后按键音应可播放");
assert(contexts.some((context) => context.src === AUDIO_ASSETS.tap && context.plays === 1), "按键音资源必须实际进入播放上下文");
assert(EFFECT_PROFILES.tap.volume <= 0.10, "统一按键音应保持柔和轻松");
assert(!AUDIO_ASSETS.confirm && !EFFECT_PROFILES.confirm, "按钮不得再保留第二套确认音");
assert(EFFECT_PROFILES.warning.playbackRate < 1 && EFFECT_PROFILES.dice.playbackRate < 1, "警告与骰子音应避免尖锐高音");
assert(EFFECT_PROFILES.warning.cooldown > EFFECT_PROFILES.tap.cooldown, "警告音必须使用更长防抖，避免错误提示叠响");
assert(audio.playCue("animal"), "动物点选应使用独立的语义音效通道");
const animalCue = contexts[contexts.length - 1];
assert(animalCue.src === AUDIO_ASSETS.tap && animalCue.playbackRate === CUE_PROFILES.animal.playbackRate, "动物音效应复用统一轻提示音并使用柔和音高");
assert(audio.playCue("zoomIn"), "放大应提供轻量音高反馈");
const zoomInCue = contexts[contexts.length - 1];
assert(zoomInCue.playbackRate > 1, "放大反馈音高应向上");
assert(audio.playCue("zoomOut"), "缩小应提供不同的音高反馈");
const zoomOutCue = contexts[contexts.length - 1];
assert(zoomOutCue.playbackRate < 1, "缩小反馈音高应向下");
assert(zoomInCue !== animalCue && zoomOutCue !== animalCue, "地图与动物音效不得互相截断");

audio.setEnabled(false);
assert(!state.ui.audio.enabled, "关闭声音必须写入存档设置");
assert(!audio.playEffect("success"), "静音后不得播放奖励音效");
assert(contexts.filter((context) => context.plays > 0).every((context) => context.stops > 0 && context.volume === 0), "静音必须立即停止并归零所有正在播放的音乐和音效");
const playsWhileMuted = contexts.reduce((sum, context) => sum + context.plays, 0);
audio.unlock();
assert(contexts.reduce((sum, context) => sum + context.plays, 0) === playsWhileMuted, "静音后的后续触摸不得重新启动背景音乐");
const reloadedMutedAudio = new AudioSystem(runtime, JSON.parse(JSON.stringify(state)));
reloadedMutedAudio.unlock();
assert(contexts.reduce((sum, context) => sum + context.plays, 0) === playsWhileMuted, "重新进入游戏后必须继续保持静音");
audio.setEnabled(true);
assert(state.ui.audio.enabled, "重新开启声音必须写入存档设置");
assert(contexts.some((context) => context.src === AUDIO_ASSETS.tap), "重新开启时应使用统一按键音");

const root = path.resolve(__dirname, "..");
let totalBytes = 0;
Object.values(AUDIO_ASSETS).forEach((relative) => {
  const absolute = path.join(root, relative);
  assert(fs.existsSync(absolute), `缺少音频资源: ${relative}`);
  const bytes = fs.readFileSync(absolute);
  assert(bytes.length > 1000, `音频资源异常过小: ${relative}`);
  assert(bytes.subarray(4, 8).toString("ascii") === "ftyp", `音频资源不是有效M4A容器: ${relative}`);
  totalBytes += bytes.length;
});
assert(totalBytes < 80 * 1024, `音频资源总量必须低于80KiB，当前${totalBytes}`);

const gameSource = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
assert(gameSource.includes("drawAudioToggle"), "阶段栏必须提供声音开关");
assert(/toggleAudio\(\), "none"/.test(gameSource), "声音开关关闭前不得额外播放点击音");
assert(gameSource.includes('this.playSfx("dice")'), "六面骰必须接入独立结果音效");
assert(!gameSource.includes('this.playSfx("confirm")') && /buttonSfx\(label\)[\s\S]{0,160}return "tap"/.test(gameSource), "所有普通按钮必须只使用统一轻提示音");
assert(/playMusic|pauseMusic/.test(`${gameSource}\n${fs.readFileSync(path.join(root, "js/audioSystem.js"), "utf8")}`), "自然氛围必须支持前后台暂停与恢复");
assert(fs.existsSync(path.join(root, AUDIO_ASSETS.music)), "自然氛围循环资源缺失");

console.log(`audio system check ok (nature loop + 4 operation sounds, ${(totalBytes / 1024).toFixed(1)}KiB)`);
