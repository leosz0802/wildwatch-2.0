const assert = require("assert");
const { createReserveState } = require("../js/world");
const {
  visitorEngagement,
  visitorContributionRate,
  eventBusinessFactors
} = require("../js/eventEconomy");
const { previewVisitorRecruitment } = require("../js/visitorRecruitment");

const base = createReserveState();
const values = [0, 20, 50, 80, 100];

// Check the full low/high boundary grid used by the dashboard and recruitment
// path. Engagement is intentionally kept in the 10–90% band.
for (const safety of values) for (const water of values) for (const grass of values) {
  const reserve = JSON.parse(JSON.stringify(base));
  reserve.safety = safety;
  reserve.ecology.water = water;
  reserve.ecology.grass = grass;
  const engagement = visitorEngagement(reserve);
  assert(engagement.activity >= 0.1 && engagement.activity <= 0.9, "activity escaped 10–90% band");
  assert(engagement.retention >= 0.1 && engagement.retention <= 0.9, "retention escaped 10–90% band");
  const recruitment = previewVisitorRecruitment(reserve, 1, 0.5);
  // 第一章两次免费招募应落在相近区间，避免首发十人、次发近百人。
  if (recruitment.firstStageRecruitment) assert(recruitment.visitors >= 8 && recruitment.visitors <= 48, "first-stage visitor recruitment escaped 8–48 range");
  else assert(recruitment.visitors >= 0 && recruitment.visitors <= 600, "visitor recruitment escaped 0–600 range");
  assert(Number.isFinite(visitorContributionRate(reserve).rate), "visitor contribution rate must remain finite");
}

const healthy = JSON.parse(JSON.stringify(base));
healthy.safety = 90;
healthy.ecology.water = 90;
healthy.ecology.grass = 90;
const strained = JSON.parse(JSON.stringify(healthy));
strained.safety = 30;
strained.ecology.water = 30;
strained.ecology.grass = 30;
assert(previewVisitorRecruitment(healthy, 1, 0.5).visitors > previewVisitorRecruitment(strained, 1, 0.5).visitors,
  "healthy reserve should attract more visitors than a strained reserve");

const eventReserve = JSON.parse(JSON.stringify(healthy));
eventReserve.emergency = { active: { type: "wildfire" } };
assert(eventBusinessFactors(eventReserve).demand < 1, "active crisis should lower visitor demand");
assert(previewVisitorRecruitment(eventReserve, 1, 0.5).visitors < previewVisitorRecruitment(healthy, 1, 0.5).visitors,
  "active crisis should reduce recruited visitors");

console.log("tight economy check ok (125 boundary states, first-stage 8–48 / later 0–600 visitors, activity/retention 10–90%, event sensitivity)");
