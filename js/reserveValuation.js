"use strict";

// Protection-zone valuation V1. Level represents the operating foundation;
// the live animal population represents the ecological asset it can sustain.
// Population uses diminishing bands so a crowded low-level reserve cannot
// overwhelm progression, while every additional animal still has value.
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

function reserveValuationBreakdown(level, animalTotal) {
  const normalizedLevel = clampInt(level, 1, 7);
  const animals = clampInt(animalTotal, 0, 99999);
  const firstBand = Math.min(animals, 200);
  const secondBand = Math.min(Math.max(0, animals - 200), 300);
  const thirdBand = Math.max(0, animals - 500);
  const levelBase = LEVEL_BASE_VALUE[normalizedLevel];
  const animalValue = firstBand * 18 + secondBand * 12 + thirdBand * 8;
  return {
    version: 1,
    level: normalizedLevel,
    animals,
    levelBase,
    animalValue,
    total: Math.min(10000000, levelBase + animalValue),
    bands: Object.freeze([
      { label: "前200只", count: firstBand, unitValue: 18 },
      { label: "201–500只", count: secondBand, unitValue: 12 },
      { label: "500只以上", count: thirdBand, unitValue: 8 }
    ])
  };
}

function calculateReserveValuation(level, animalTotal) {
  return reserveValuationBreakdown(level, animalTotal).total;
}

module.exports = { LEVEL_BASE_VALUE, reserveValuationBreakdown, calculateReserveValuation };
