import assert from "node:assert/strict";
import test from "node:test";

import { estimateNativePowerScore, powerTierForPolity, refreshPowerStatus, seedPowerTier } from "./powerStatus.js";

const makePeerWorld = () => ({
  polityOverrides: {
    Testland: { name: "Testland", aliases: [], status: "active" },
    Peera: { name: "Peera", status: "active" },
    Peerb: { name: "Peerb", status: "active" },
    Peerc: { name: "Peerc", status: "active" },
    Peerd: { name: "Peerd", status: "active" },
  },
  countryStats: {
    Testland: { economy: { gdp: 10_000 }, population: { total: 800 } },
    Peera: { economy: { gdp: 500 }, population: { total: 150 } },
    Peerb: { economy: { gdp: 250 }, population: { total: 100 } },
    Peerc: { economy: { gdp: 100 }, population: { total: 60 } },
    Peerd: { economy: { gdp: 25 }, population: { total: 25 } },
  },
  politicalActors: { byPolity: {} },
  countryTags: { Testland: ["nuclear"] },
  institutions: { schemaVersion: 1, ledgerVersion: 0, byId: {} },
  agreements: [],
  wars: [],
});

test("power-tier hysteresis advances at most once per campaign round", () => {
  let world = seedPowerTier(makePeerWorld(), "Testland", "minor-power", { basis: "authored", date: "2014-01-01", round: 1 });

  world = refreshPowerStatus(world, { date: "2014-02-01", round: 2 });
  assert.equal(powerTierForPolity(world, "Testland"), "minor-power");
  assert.equal(world.powerStatus.byPolity.Testland.candidateTier, "major-power");
  assert.equal(world.powerStatus.byPolity.Testland.candidateRounds, 1);

  // Multiple subsystem refreshes in the same completed round must not count as
  // multiple months/turns of sustained strategic weight.
  world = refreshPowerStatus(world, { date: "2014-02-01", round: 2 });
  world = refreshPowerStatus(world, { date: "2014-02-01", round: 2 });
  assert.equal(powerTierForPolity(world, "Testland"), "minor-power");
  assert.equal(world.powerStatus.byPolity.Testland.candidateRounds, 1);

  world = refreshPowerStatus(world, { date: "2014-03-01", round: 3 });
  assert.equal(powerTierForPolity(world, "Testland"), "major-power");
  assert.equal(world.powerStatus.byPolity.Testland.candidateTier, "");
  assert.equal(world.powerStatus.byPolity.Testland.candidateRounds, 0);
});

test("native power scoring is era-relative rather than tied to modern GDP units", () => {
  const makeWorld = (scale) => ({
    polityOverrides: {
      Alpha: { status: "active" },
      Beta: { status: "active" },
      Gamma: { status: "active" },
      Delta: { status: "active" },
      Epsilon: { status: "active" },
    },
    countryStats: {
      Alpha: { economy: { gdp: 100 * scale }, population: { total: 100 * scale } },
      Beta: { economy: { gdp: 60 * scale }, population: { total: 75 * scale } },
      Gamma: { economy: { gdp: 30 * scale }, population: { total: 50 * scale } },
      Delta: { economy: { gdp: 10 * scale }, population: { total: 25 * scale } },
      Epsilon: { economy: { gdp: 2 * scale }, population: { total: 10 * scale } },
    },
    politicalActors: { byPolity: {} },
    countryTags: {},
    institutions: { schemaVersion: 1, byId: {} },
    agreements: [],
    wars: [],
  });

  const medievalScale = makeWorld(1);
  const modernScale = makeWorld(1_000_000_000);
  for (const polity of ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]) {
    const a = estimateNativePowerScore(medievalScale, polity).score;
    const b = estimateNativePowerScore(modernScale, polity).score;
    assert.equal(a, b, `${polity} should keep the same relative power score when every material unit scales equally`);
  }
  assert.ok(estimateNativePowerScore(medievalScale, "Alpha").score > estimateNativePowerScore(medievalScale, "Beta").score);
  assert.ok(estimateNativePowerScore(medievalScale, "Epsilon").score < 35);
});

test("generated major/regional baselines are stable unless relative campaign state changes substantially", () => {
  const world = makePeerWorld();
  let major = seedPowerTier(world, "Testland", "major-power", { basis: "generated-estimate", round: 1 });
  major = refreshPowerStatus(major, { round: 2 });
  assert.equal(powerTierForPolity(major, "Testland"), "major-power");

  let regional = seedPowerTier(world, "Peera", "regional-power", { basis: "generated-estimate", round: 1 });
  regional = refreshPowerStatus(regional, { round: 2 });
  assert.equal(powerTierForPolity(regional, "Peera"), "regional-power");
});

test("institutional leadership contributes materially more strategic weight than ordinary membership", () => {
  const makeWorld = (role) => ({
    polityOverrides: {
      Ukraine: { name: "Ukraine", status: "active" },
      Poland: { status: "active" },
      Romania: { status: "active" },
      Latvia: { status: "active" },
      Moldova: { status: "active" },
    },
    countryStats: {
      Ukraine: { economy: { gdp: 133 }, population: { total: 45 } },
      Poland: { economy: { gdp: 545 }, population: { total: 38 } },
      Romania: { economy: { gdp: 190 }, population: { total: 20 } },
      Latvia: { economy: { gdp: 31 }, population: { total: 2 } },
      Moldova: { economy: { gdp: 8 }, population: { total: 3.5 } },
    },
    politicalActors: { byPolity: {} },
    countryTags: {},
    agreements: [],
    wars: [],
    institutions: {
      schemaVersion: 1,
      ledgerVersion: 1,
      byId: {
        "lublin-defense-pact": {
          id: "lublin-defense-pact",
          name: "Lublin Defense Pact",
          kind: "defense_pact",
          status: "active",
          foundedDate: "2014-01-01",
          members: [{ polity: "Ukraine", status: "member", role }],
        },
      },
    },
  });
  const member = estimateNativePowerScore(makeWorld("member"), "Ukraine").score;
  const leader = estimateNativePowerScore(makeWorld("leader"), "Ukraine").score;
  assert.ok(leader - member >= 7, `leadership should materially raise strategic weight (${member} -> ${leader})`);
});
