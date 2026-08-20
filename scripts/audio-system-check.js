const fs = require("fs");
const path = require("path");
const { AudioSystem, AUDIO_ASSETS, normalizeAudioSettings } = require("../js/audioSystem");

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
assert(defaults.enabled && defaults.sfx && !("music" in defaults), "新存档应只默认开启操作音效");

const audio = new AudioSystem(runtime, state);
assert(audio.isAvailable(), "InnerAudioContext 可用时声音系统必须启用");
assert(!audio.playEffect("tap"), "用户首次交互前不得自动播放音效");
audio.unlock();
assert(contexts.length === 0 && !AUDIO_ASSETS.music, "首次交互后不得启动背景音乐");
assert(audio.playEffect("tap"), "用户交互后按键音应可播放");
assert(contexts.some((context) => context.src === AUDIO_ASSETS.tap && context.plays === 1), "按键音资源必须实际进入播放上下文");

audio.setEnabled(false);
assert(!state.ui.audio.enabled, "关闭声音必须写入存档设置");
assert(!audio.playEffect("success"), "静音后不得播放奖励音效");
audio.setEnabled(true);
assert(state.ui.audio.enabled, "重新开启声音必须写入存档设置");
assert(contexts.some((context) => context.src === AUDIO_ASSETS.confirm), "重新开启时应提供确认音");

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
assert(gameSource.includes('this.playSfx("dice")'), "六面骰必须接入独立音效");
assert(!/playMusic|pauseMusic|bgm-forest/.test(`${gameSource}\n${fs.readFileSync(path.join(root, "js/audioSystem.js"), "utf8")}`), "代码中不得残留背景音乐播放逻辑");
assert(!fs.existsSync(path.join(root, "assets/audio/bgm-forest.m4a")), "背景音乐资源必须移除");

console.log(`audio system check ok (5 operation sounds, ${(totalBytes / 1024).toFixed(1)}KiB, no background music)`);
