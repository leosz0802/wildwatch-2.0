const assert = require("assert");
const { REAL_NATURE_EVENTS } = require("../js/realNatureEventCatalog");
const { REAL_NATURE_EVENT_DEFINITIONS } = require("../js/realNatureEventSystem");
const { WORLD_EVENT_DEFINITIONS } = require("../js/worldEventSystem");
const reserveEvents = require("../js/reserveEventCatalog");

// Keep event copy neutral and suitable for a broad audience.  Internal IDs and
// source URLs are excluded so a legacy persistence key or citation URL does not
// become a player-facing match.
const SENSITIVE_TERMS = /(台湾|台灣|新疆|西藏|香港|澳门|澳門|塔利班|Taliban|Taiwan|Xinjiang|Tibet|Hong Kong|Macau|Kashmir|喀什米尔|克里米亚|Crimea|以色列|巴勒斯坦|乌克兰|俄乌)/i;
const SKIP_KEYS = new Set(["id", "url"]);

function collectText(value, path = "root", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectText(item, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") output.push({ path, value });
    return output;
  }
  Object.entries(value).forEach(([key, child]) => {
    if (!SKIP_KEYS.has(key)) collectText(child, `${path}.${key}`, output);
  });
  return output;
}

const catalogs = [
  ["real-nature", REAL_NATURE_EVENTS],
  ["real-nature-definitions", REAL_NATURE_EVENT_DEFINITIONS],
  ["world", WORLD_EVENT_DEFINITIONS],
  ["reserve", reserveEvents]
];
const matches = [];
catalogs.forEach(([name, catalog]) => {
  collectText(catalog, name).forEach((entry) => {
    if (SENSITIVE_TERMS.test(entry.value)) matches.push(`${entry.path}: ${entry.value}`);
  });
});

assert.deepStrictEqual(matches, [], `事件文案含敏感地区或组织名称:\n${matches.join("\n")}`);
console.log(`event-content-sensitivity-check: ${catalogs.reduce((count, [, catalog]) => count + Object.keys(catalog).length, 0)}个事件目录通过`);
