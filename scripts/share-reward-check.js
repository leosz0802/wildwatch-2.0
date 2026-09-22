const { createCharacter } = require("../js/storage");
const {
  shareRewardPreview,
  recordShareSent,
  SHARE_REWARD_LIMIT_PER_TYPE,
  SHARE_REWARD_LIMIT_PER_CHAPTER
} = require("../js/shareSystem");
const { chapterVisitorTotal, chapterVisitorBreakdown } = require("../js/chapterTargets");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(SHARE_REWARD_LIMIT_PER_TYPE === 2, "each entry gets two share rewards per chapter");
assert(SHARE_REWARD_LIMIT_PER_CHAPTER === 4, "visitor plus animal shares are four rewards per chapter");

const state = createCharacter(null, "分享奖励回归");
const reserve = state.world.reserve;
reserve.progression.stage = 3;
const animalBefore = shareRewardPreview(state, { rewardType: "animals" });
assert(animalBefore.eligible && animalBefore.remaining === SHARE_REWARD_LIMIT_PER_TYPE, "animal share should start with two rewards per chapter");
assert(animalBefore.percent === 2 && animalBefore.amount === Math.max(1, Math.round(animalBefore.base * .02)), "first animal reward must be 2% of current animals");
assert(animalBefore.otherRemaining === 2 && animalBefore.totalLimit === 4, "visitor shares stay independent at chapter start");

const first = recordShareSent(state, { shareId: "share_animals_1", kind: "birth", species: "鹿", rewardType: "animals" });
assert(first.applied && first.reward && first.reward.rewardType === "animals", "animal share should settle a reward");
assert(first.reward.after - first.reward.before === first.reward.amount, "animal reward must change the live animal total by the displayed amount");
assert(state.ui.shareStats.sent === 1 && state.ui.shareStats.rewardCount === 1, "animal share stats should record one send and one reward");

const duplicate = recordShareSent(state, { shareId: "share_animals_1", kind: "birth", species: "鹿", rewardType: "animals" });
assert(duplicate.reason === "duplicate" && state.ui.shareStats.sent === 1, "same share callback must not consume another opportunity or send count");

const secondAnimalPreview = shareRewardPreview(state, { rewardType: "animals" });
assert(secondAnimalPreview.eligible && secondAnimalPreview.remaining === 1 && secondAnimalPreview.percent === 3, "second animal share in the chapter should use 3%");
const secondAnimal = recordShareSent(state, { shareId: "share_animals_2", kind: "birth", species: "鹿", rewardType: "animals" });
assert(secondAnimal.applied && secondAnimal.reward.rewardType === "animals", "second animal share should still settle");

const animalExhausted = recordShareSent(state, { shareId: "share_animals_3", kind: "birth", species: "鹿", rewardType: "animals" });
assert(animalExhausted.reason === "chapter_limit" && !animalExhausted.reward, "third animal share in one chapter must settle no reward");

const visitorPreview = shareRewardPreview(state, { rewardType: "visitors" });
assert(visitorPreview.eligible && visitorPreview.remaining === 2 && visitorPreview.percent === 2, "using up animal shares must not consume visitor shares");
const visitorBefore = chapterVisitorTotal(reserve);
const firstVisitor = recordShareSent(state, { shareId: "share_visitors_1", kind: "daily", rewardType: "visitors" });
assert(firstVisitor.applied && firstVisitor.reward.rewardType === "visitors", "visitor share should settle a reward");
assert(chapterVisitorTotal(reserve) - visitorBefore === firstVisitor.reward.amount, "visitor reward must use the chapter visitor ledger");
const breakdown = chapterVisitorBreakdown(reserve);
assert(breakdown.share === firstVisitor.reward.amount, "visitor share reward must be visible as a share ledger source");

const secondVisitor = recordShareSent(state, { shareId: "share_visitors_2", kind: "daily", rewardType: "visitors" });
assert(secondVisitor.applied && secondVisitor.reward.percent === 3, "second visitor share should use 3% independently");

const visitorExhausted = recordShareSent(state, { shareId: "share_visitors_3", kind: "daily", rewardType: "visitors" });
assert(visitorExhausted.reason === "chapter_limit" && !visitorExhausted.reward, "third visitor share in one chapter must settle no reward");
assert(shareRewardPreview(state, { rewardType: "animals" }).remaining === 0, "animal entry stays exhausted after visitor shares");
assert(shareRewardPreview(state, { rewardType: "visitors" }).remaining === 0, "visitor entry stays exhausted after two completed shares");
assert(state.ui.shareStats.rewardCount === 4, "a chapter can grant two animal rewards and two visitor rewards");

reserve.progression.stage = 4;
const nextChapter = shareRewardPreview(state, { rewardType: "animals" });
assert(nextChapter.eligible && nextChapter.used === 0 && nextChapter.remaining === 2, "entering a new chapter must restore two animal share opportunities");
assert(shareRewardPreview(state, { rewardType: "visitors" }).remaining === 2, "entering a new chapter must restore two visitor share opportunities");

console.log("share reward check ok (2 visitor + 2 animal per chapter, 2% then 3% each, live ledgers, duplicate callback protection)");
