const {
  CLOUD_BASE_URL,
  CloudServiceController
} = require("../js/cloudService");

function assert(value, message) {
  if (!value) throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let now = 2000000;
  const storage = {
    wild_guard_remote_config_v1: {
      value: {
        version: 2,
        features: { worldLeaderboard: true, telemetry: false, socialTrade: false },
        balance: { eventUploadSampleRate: 0 }
      },
      etag: '"cached-v2"',
      updatedAt: 1000000
    }
  };
  const calls = [];
  let pendingConfig = null;
  const runtime = {
    getStorageSync(key) { return storage[key] || null; },
    setStorageSync(key, value) { storage[key] = JSON.parse(JSON.stringify(value)); },
    login(options) { options.success({ code: "cached-first-code" }); },
    request(options) {
      calls.push(options);
      if (options.url === `${CLOUD_BASE_URL}/v1/config`) {
        // Hold the refresh open to prove it is not on the first-frame critical path.
        pendingConfig = options;
      } else if (options.url === `${CLOUD_BASE_URL}/v1/auth/wechat`) {
        options.success({ statusCode: 200, data: {
          token: "cached-first-token", publicId: "cached-first-player", expiresIn: 3600
        } });
      } else if (options.url === `${CLOUD_BASE_URL}/v1/leaderboard/score`) {
        options.success({ statusCode: 200, data: { score: 120, rank: 9 } });
      } else if (options.url.indexOf(`${CLOUD_BASE_URL}/v1/leaderboard?`) === 0) {
        options.success({ statusCode: 200, data: { leaderboard: [] } });
      } else {
        options.fail({ errMsg: "unexpected request" });
      }
      return { abort() {} };
    }
  };

  const controller = new CloudServiceController(runtime, { now: () => now });
  assert(controller.configStatus === "cached", "a valid cached config should be available before bootstrap");
  const bootstrap = controller.bootstrap({ base: { name: "缓存启动测试" } });
  assert(pendingConfig, "bootstrap should start a background config refresh");
  const outcome = await Promise.race([
    bootstrap.then(() => "finished"),
    wait(100).then(() => "timeout")
  ]);
  assert(outcome === "finished", "cached config must let bootstrap finish without waiting for network config");
  assert(controller.config().version === 2, "bootstrap must use the cached config immediately");
  assert(calls.some((call) => call.url === `${CLOUD_BASE_URL}/v1/auth/wechat`), "cached bootstrap must still authenticate in parallel");

  pendingConfig.success({ statusCode: 200, data: { config: {
    version: 3,
    features: { worldLeaderboard: true, telemetry: false, socialTrade: false }
  } }, header: { etag: '"fresh-v3"' } });
  await wait(0);
  assert(controller.config().version === 3, "a completed background refresh must replace the cached config");
  assert(storage.wild_guard_remote_config_v1.etag === '"fresh-v3"', "fresh config must update the local cache");
  console.log("cache-first startup check ok");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
