function loadPack(name) {
  const root = typeof GameGlobal !== "undefined" ? GameGlobal : (typeof global !== "undefined" ? global : {});
  const pack = root && root.__wildPack;
  if (pack && pack[name]) return pack[name];
  return require("./" + name);
}

module.exports = {
  get collectionSystem() { return loadPack("collectionSystem"); },
  get wildernessKnowledge() { return loadPack("wildernessKnowledge"); }
};
