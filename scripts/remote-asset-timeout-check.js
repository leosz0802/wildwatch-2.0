const assert = require("assert");
const { Game } = require("../js/game");

async function main() {
  let request;
  let aborted = 0;
  const game = Object.create(Game.prototype);
  game.remoteAssetDownloadTimeoutMs = 5;
  game.runtime = {
    downloadFile(options) {
      request = options;
      return {
        abort() { aborted += 1; }
      };
    }
  };

  const result = await game.downloadRemoteAtlas({
    url: "https://wild.hubao.tv/assets/slow-test.webp",
    statusKey: "slowAssetDownload",
    save: () => Promise.resolve(true)
  });

  assert.strictEqual(result, false, "远程图集超时必须回退失败结果");
  assert.strictEqual(aborted, 1, "远程图集超时必须 abort 原生下载任务");
  assert.deepStrictEqual(game.slowAssetDownload, {
    status: "failed",
    progress: 0,
    source: "canvas"
  }, "远程图集超时必须写入失败状态");
  assert(request && typeof request.fail === "function", "远程图集请求必须绑定 fail 回调");
  console.log("remote asset timeout check ok");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
