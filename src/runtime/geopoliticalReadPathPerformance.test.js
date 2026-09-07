import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { resolveAllCountryTags } from "./countryTags.js";

const buildLargeWorld = () => {
  const world = {
    polityOverrides: {},
    politicalActors: { byPolity: {} },
    countryStats: {},
    countryTags: {},
    powerStatus: { schemaVersion: 1, byPolity: {} },
    institutions: { schemaVersion: 1, ledgerVersion: 1, byId: {} },
    regionOwnershipOverrides: {},
  };
  const count = 202;
  for (let index = 0; index < count; index += 1) {
    const polity = `Polity ${index}`;
    world.polityOverrides[polity] = { name: polity, status: "active" };
    world.politicalActors.byPolity[polity] = {
      politicalSystem: {
        type: index % 3 ? "democratic republic" : "authoritarian republic",
        representation: index % 3 ? "electoral" : "elite_factions",
      },
      government: { form: index % 2 ? "parliamentary republic" : "presidential republic" },
    };
    world.countryStats[polity] = {
      economy: { gdp: 1000 + index },
      population: { total: 1_000_000 + index * 1000 },
    };
    world.powerStatus.byPolity[polity] = {
      polityKey: polity,
      tier: index < 10 ? "major-power" : index < 60 ? "regional-power" : "minor-power",
    };
  }
  for (let index = 0; index < 3000; index += 1) {
    world.regionOwnershipOverrides[`region-${index}`] = `Polity ${index % count}`;
  }
  for (let institutionIndex = 0; institutionIndex < 12; institutionIndex += 1) {
    const members = [];
    for (let polityIndex = 0; polityIndex < count; polityIndex += 1) {
      if ((polityIndex + institutionIndex) % 3 !== 0) continue;
      members.push({
        polity: `Polity ${polityIndex}`,
        status: "member",
        role: polityIndex === institutionIndex ? "leader" : "member",
      });
    }
    world.institutions.byId[`institution-${institutionIndex}`] = {
      id: `institution-${institutionIndex}`,
      name: `Institution ${institutionIndex}`,
      kind: institutionIndex % 2 ? "security_alliance" : "economic_union",
      status: "active",
      members,
    };
  }
  return world;
};

test("applied geopolitical baseline does not make all-country badge projection quadratic in map regions", () => {
  const world = buildLargeWorld();
  const started = performance.now();
  const tags = resolveAllCountryTags({}, world);
  const elapsedMs = performance.now() - started;

  assert.equal(Object.keys(tags).length, 202);
  assert.equal(tags["Polity 5"][0], "major-power");
  assert.ok(tags["Polity 5"].some((tag) => tag.endsWith("-member")));
  // Very loose guard: the pre-fix path rebuilt the full polity identity index
  // tens of thousands of times and could hit browser script timeouts. This
  // synthetic 202-polity/3000-region world should remain comfortably bounded.
  assert.ok(elapsedMs < 1500, `all-country tag projection took ${elapsedMs.toFixed(1)}ms`);
});
