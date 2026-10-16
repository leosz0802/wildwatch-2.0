const root = typeof GameGlobal !== "undefined" ? GameGlobal : global;
root.__wildPack = root.__wildPack || {};
root.__wildPack.collectionSystem = require("./collectionSystem.js");
root.__wildPack.wildernessKnowledge = require("./wildernessKnowledge.js");
