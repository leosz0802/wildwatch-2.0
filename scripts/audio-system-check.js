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
assert(!audio.playEffect("success"), "用户首次交互前不得自动播放音效");
audio.unlock();
assert(!AUDIO_ASSETS.music, "背景循环音频已移除，不得再引用");
assert(contexts.length === 0, "首次交互不得创建背景音播放器");
assert(audio.playMusic() === false, "背景循环音频已移除，不得再播放");
assert(MUSIC_PROFILE.volume <= 0.10, "残留音量配置不得压过玩法音效");
assert(audio.playEffect("success"), "用户交互后成功音应可播放");
assert(contexts.some((context) => context.src === AUDIO_ASSETS.success && context.plays === 1), "成功音资源必须实际进入播放上下文");
assert(!AUDIO_ASSETS.confirm && !EFFECT_PROFILES.confirm, "按钮不得再保留第二套确认音");
assert(EFFECT_PROFILES.warning.playbackRate < 1 && EFFECT_PROFILES.dice.playbackRate < 1, "警告与骰子音应避免尖锐高音");
assert(EFFECT_PROFILES.warning.cooldown > EFFECT_PROFILES.success.cooldown, "警告音必须使用更长防抖，避免错误提示叠响");
assert(audio.playEffect("warning"), "警告音应在用户交互后可播放");
assert(AUDIO_ASSETS.warning === AUDIO_ASSETS.dice, "警告音应复用已打包的骰子短音，避免引用被忽略资源");
assert(Object.keys(CUE_PROFILES).length === 0, "已移除的按键提示音不得保留语义通道");

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
assert(contexts.some((context) => context.src === AUDIO_ASSETS.success), "重新开启时应恢复可播放的成功音");

const root = path.resolve(__dirname, "..");
let totalBytes = 0;
const project = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const ignored = new Set(((project.packOptions || {}).ignore || []).filter((item) => item.type === "file").map((item) => item.value));
Array.from(new Set(Object.values(AUDIO_ASSETS))).forEach((relative) => {
  const absolute = path.join(root, relative);
  assert(fs.existsSync(absolute), `缺少音频资源: ${relative}`);
  assert(!ignored.has(relative), `运行时音频不能引用被忽略资源: ${relative}`);
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
assert(!gameSource.includes('this.playSfx("confirm")') && /if \(name === "tap"\) return false;/.test(gameSource), "普通按钮不得重新接入已移除的按键音");
assert(!fs.existsSync(path.join(root, "assets/audio/bgm-nature-loop.m4a")), "背景循环音频文件必须删除");
assert(!/bgm-nature-loop/.test(fs.readFileSync(path.join(root, "js/audioSystem.js"), "utf8")), "声音系统不得再引用背景循环音频");

console.log(`audio system check ok (operation sounds only, ${(totalBytes / 1024).toFixed(1)}KiB)`);
