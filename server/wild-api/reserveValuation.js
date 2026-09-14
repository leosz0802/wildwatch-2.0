"use strict";

// Keep this server copy dependency-free so the API can be deployed alone.
// scripts/reserve-valuation-check.js verifies it against the client formula.
const LEVEL_BASE_VALUE = Object.freeze({
  1: 1800,
  2: 3600,
  3: 5400,
  4: 7200,
  5: 9300,
  6: 11400,
  7: 13500
});

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function calculateReserveValuation(level, animalTotal) {
  const normalizedLevel = clampInt(level, 1, 7);
  const animals = clampInt(animalTotal, 0, 99999);
  const firstBand = Math.min(animals, 200);
  const secondBand = Math.min(Math.max(0, animals - 200), 300);
  const thirdBand = Math.max(0, animals - 500);
  return Math.min(10000000, LEVEL_BASE_VALUE[normalizedLevel]
    + firstBand * 18
    + secondBand * 12
    + thirdBand * 8);
}

module.exports = { LEVEL_BASE_VALUE, calculateReserveValuation };
