const {
  SYSTEM_MESSAGE_INTERACTIVE,
  SYSTEM_MESSAGE_RANK,
  WechatFriendController
} = require("../js/wechatFriendSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildRuntime(overrides = {}) {
  return Object.assign({
    getOpenDataContext() { return { canvas: {}, postMessage() {} }; },
    getSetting(options) { options.success({ authSetting: {}, subscriptionsSetting: {} }); }
  }, overrides);
}

(async () => {
  let request = null;
  const controller = new WechatFriendController(buildRuntime({
    requestSubscribeSystemMessage(options) {
      request = options;
      options.success({
        errMsg: "requestSubscribeSystemMessage:ok",
        [SYSTEM_MESSAGE_INTERACTIVE]: "accept",
        [SYSTEM_MESSAGE_RANK]: "reject"
      });
    }
  }));
  const result = await controller.requestSystemMessageSubscriptions();
  assert(request.msgTypeList.length === 2, "both relationship notification types must be requested together");
  assert(request.msgTypeList.includes(SYSTEM_MESSAGE_INTERACTIVE) && request.msgTypeList.includes(SYSTEM_MESSAGE_RANK), "official system message constants are required");
  assert(result.accepted === 1 && controller.subscriptionStatus === "partial", "partial consent must be represented accurately");

  const unsupported = new WechatFriendController(buildRuntime());
  const fallback = await unsupported.requestSystemMessageSubscriptions();
  assert(fallback.supported === false && unsupported.subscriptionStatus === "unsupported", "unsupported clients must degrade safely");
  console.log("relationship notification check ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
