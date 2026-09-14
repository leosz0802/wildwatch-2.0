const FIRST_RETURN_HOOK_ID = "chapter1_reverse_tracks";
const FIRST_RETURN_HOOK_COPY = Object.freeze({
  closing: "晨角已经喝到水，但泥岸出现了一串逆行脚印。明天必须确认，它属于幼鹿，还是正在接近水源的陌生动物。",
  title: "逆行脚印有了答案",
  scene: "天亮后，猎犬在泥岸尽头停下：这串脚印不属于幼鹿，而是一只陌生的独狼。它绕开鹿群，只沿最浅的水线靠近。",
  animalLine: "它昨夜没有扑向我们。",
  answer: "来者是陌生动物，不是幼鹿。",
  actionLabel: "辨认它为何靠近",
  actionId: "houndScout"
});

function localDateKey(now = Date.now()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function nextLocalDateKey(now = Date.now()) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(date.getTime())) return "";
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

function normalizeFirstReturnHook(value) {
  if (!value || value.id !== FIRST_RETURN_HOOK_ID) return null;
  const status = ["pending", "revealed"].includes(value.status) ? value.status : "pending";
  return {
    version: 1,
    id: FIRST_RETURN_HOOK_ID,
    status,
    sourceGuardianDay: 1,
    scheduledDateKey: String(value.scheduledDateKey || ""),
    availableDateKey: String(value.availableDateKey || ""),
    revealedDateKey: String(value.revealedDateKey || "")
  };
}

function scheduleFirstReturnHook(value, guardianNight, now = Date.now()) {
  const existing = normalizeFirstReturnHook(value);
  if (existing) return existing;
  if (!guardianNight || Number(guardianNight.day) !== 1) return null;
  return {
    version: 1,
    id: FIRST_RETURN_HOOK_ID,
    status: "pending",
    sourceGuardianDay: 1,
    scheduledDateKey: localDateKey(now),
    availableDateKey: nextLocalDateKey(now),
    revealedDateKey: ""
  };
}

function firstReturnHookDue(value, now = Date.now()) {
  const hook = normalizeFirstReturnHook(value);
  const today = localDateKey(now);
  return !!(hook && hook.status === "pending" && hook.availableDateKey && today >= hook.availableDateKey);
}

function revealFirstReturnHook(value, now = Date.now()) {
  const hook = normalizeFirstReturnHook(value);
  if (!hook || hook.status !== "pending") return hook;
  return Object.assign({}, hook, {
    status: "revealed",
    revealedDateKey: localDateKey(now)
  });
}

module.exports = {
  FIRST_RETURN_HOOK_ID,
  FIRST_RETURN_HOOK_COPY,
  localDateKey,
  nextLocalDateKey,
  normalizeFirstReturnHook,
  scheduleFirstReturnHook,
  firstReturnHookDue,
  revealFirstReturnHook
};
