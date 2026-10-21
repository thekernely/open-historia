/*! OpenHistoria - scenario Statistics seeding contract, dependency-free source execution. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { TEMPLATE_WORLD_OVERRIDE_KEYS } from "./web/storeConstants.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const copies = ["server/libraryStore.js", "src/runtime/web/models.js"];
const loadActualBuilder = (rel) => {
  const source = readFileSync(path.join(root, rel), "utf8");
  const prefix = rel.startsWith("server/") ? "const buildFreshWorldSeedFromScenario =" : "export const buildFreshWorldSeedFromScenario =";
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, `${rel} defines the fresh-world seeding function`);
  const end = source.indexOf("\n};", start);
  assert.ok(end > start, `${rel} ends the seeding function with a body`);
  const body = source.slice(start, end + 3).replace(/^export /, "");
  // Execute the real pure function from each platform without pulling in
  // unrelated storage/network dependencies in this tiny contract test.
  return vm.runInNewContext(`${body}\nbuildFreshWorldSeedFromScenario`, {
    TEMPLATE_WORLD_OVERRIDE_KEYS,
    cloneJson: (value) => structuredClone(value),
  });
};
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const file of copies) {
  test(`${file}: dirty scenario carries only authored Stats, not campaign history`, () => {
    const seed = loadActualBuilder(file);
    const baseWorld = { ownerCodes: ["Default"], countryStats: { Default: { population: { total: 999 } } } };
    const sourceWorld = {
      ownerCodes: ["Alba"],
      countryStats: { Alba: {
        population: { total: 100000 },
        economy: { gdp: 200000000, publicDebt: 12 },
        customStats: { grainYield: 18 },
        workforce: { version: 1, assessedDate: "1914-01-01", provenance: "authored",
          assessedPopulation: 100000, civilianLaborForce: 50000,
          employedBySector: { agriculture: 18000, industry: 12000 } },
        continuity: { demographicClock: { sourceDate: "1914-01-01", endDate: "1915-01-01", lastDate: "1914-01-01",
          basePopulation: 100000, birthsPerThousand: 20, deathsPerThousand: 10, creditedBirths: 0, creditedDeaths: 0 } },
      } },
      migrationFlows: [{ id: "alba-to-borea", fromPolity: "Alba", toPolity: "Borea", sourceDate: "1914-01-01",
        endDate: "1915-01-01", lastDate: "1914-01-01", baseSourcePopulation: 100000,
        baseDestinationPopulation: 50000, totalPeople: 1000, creditedPeople: 0,
        reason: "Explicit starting migration plan" }],
      countryStatsHistory: { Alba: [{ date: "1914-02-01" }] },
      statsEventReceipts: [{ eventId:"prior-game", polity:"Alba", date:"1914-02-01", changes:[
        {field:"economy.gdp", unit:"nominal-gdp", before:20, after:10, delta:-10},
      ]}],
      lastJumpMode: "manual",
    };
    const created = plain(seed({ baseWorld, scenarioWorld: sourceWorld }));
    assert.deepEqual(created.countryStats, sourceWorld.countryStats);
    assert.equal(created.countryStats.Alba.workforce.civilianLaborForce, 50000,
      "scenario-authored workforce is cloned into a new game on both platforms");
    assert.deepEqual(created.migrationFlows, sourceWorld.migrationFlows, "scenario-owned two-party population process survives seeding");
    assert.equal(created.countryStatsHistory, undefined);
    assert.equal(created.statsEventReceipts, undefined, "new campaign cannot inherit accepted event receipts");
    assert.equal(created.lastJumpMode, undefined);
    assert.deepEqual(created.ownerCodes, ["Alba"]);
    sourceWorld.migrationFlows[0].totalPeople = 3000;
    assert.equal(created.migrationFlows[0].totalPeople, 1000, "new games own a detached migration plan");
    sourceWorld.countryStats.Alba.population.total = 123;
    sourceWorld.countryStats.Alba.workforce.employedBySector.industry = 25000;
    assert.equal(created.countryStats.Alba.workforce.employedBySector.industry, 12000,
      "an editor change cannot mutate an existing campaign workforce assessment");
    sourceWorld.countryStats.Alba.continuity.demographicClock.birthsPerThousand = 80;
    assert.equal(created.countryStats.Alba.continuity.demographicClock.birthsPerThousand, 20, "dated scenario population process is cloned with the baseline");
    assert.equal(created.countryStats.Alba.population.total, 100000, "game owns a detached copy");
  });
  test(`${file}: absent authored Stats stay absent`, () => {
    const seed = loadActualBuilder(file);
    const baseWorld = { ownerCodes: ["Default"], countryStats: { Default: { economy: { gdp: 10 } } },
      migrationFlows: [{ id: "should-not-copy" }], countryStatsHistory: { Default: [{ date: "1912-01-01" }] }, statsEventReceipts: [{eventId:"old"}] };
    const created = plain(seed({ baseWorld, scenarioWorld: { ownerCodes: ["Alba"] } }));
    assert.equal(created.countryStats, undefined, "neither a default baseline nor a polity roster can create a Stats sheet");
    assert.equal(created.countryStats?.Alba?.workforce, undefined);
    assert.equal(created.countryStatsHistory, undefined);
    assert.equal(created.statsEventReceipts, undefined, "new campaign cannot inherit accepted event receipts");
    assert.equal(created.migrationFlows, undefined, "no inherited migration from the default scenario");
  });
}

// A scenario saved without simulationHistory but with accepted-event receipts is
// still a runtime snapshot: the clean-copy fast path must not leak those rows.
for (const file of copies) {
  test(`${file}: causal receipts flag a runtime snapshot even without a time skip`, () => {
    const source = readFileSync(path.join(root,file),'utf8');
    const prefix = file.startsWith('server/') ? 'const scenarioLooksLikeRuntimeSnapshot =' : 'export const scenarioLooksLikeRuntimeSnapshot =';
    const begin = source.indexOf(prefix);
    assert.ok(begin >= 0);
    const end = source.indexOf('\n};',begin);
    assert.ok(end > begin);
    const body = source.slice(begin,end+3).replace(/^export /,'');
    const detect = vm.runInNewContext(`${body}\nscenarioLooksLikeRuntimeSnapshot`, {
      normalizeSnapshotString: (value) => String(value ?? '').trim(),
      normStr: (value) => String(value ?? '').trim(),
    });
    assert.equal(detect({world:{statsEventReceipts:[{eventId:'past'}]}}),true);
    assert.equal(detect({world:{statsEventReceipts:[]}}),false);
  });
}

// Exercise the real clean-copy branch, which intentionally does not invoke the
// fallback builder. This formerly carried stale read-only economic history.
test("web new game clones a clean scenario's authored Stats without prior campaign receipts", () => {
  const source = readFileSync(path.join(root, "src/runtime/web/libraryStore.js"), "utf8");
  const start = source.indexOf("const seedGameJsonFromScenario =");
  const end = source.indexOf("\n};", start);
  assert.ok(start >= 0 && end > start);
  const seed = vm.runInNewContext(`${source.slice(start, end + 3)}\nseedGameJsonFromScenario`, {
    jsonAsset: (record, key) => record.json?.[key],
    cloneJson: structuredClone,
    scenarioLooksLikeRuntimeSnapshot: () => false,
    JSON_ASSET_KEYS: ["world", "game", "events", "actions", "chat"],
    JSON_ASSET_DEFAULTS: { world: {}, game: {}, events: [], actions: [], chat: [] },
  });
  const scenario = { json: { world: {
    ownerCodes: ["Latvia"], countryStats: { Latvia: { population: { total: 1_000_000 } } },
    countryStatsHistory: { Latvia: [{ date: "2026-02-01" }] },
    statsEventReceipts: [{ eventId: "previous-turn" }],
    customScenarioRule: { keep: true },
  } } };
  const target = {};
  seed(target, scenario, {});
  assert.deepEqual(plain(target.json.world.countryStats), plain(scenario.json.world.countryStats));
  assert.equal(target.json.world.countryStatsHistory, undefined);
  assert.equal(target.json.world.statsEventReceipts, undefined);
  assert.deepEqual(plain(target.json.world.customScenarioRule), { keep: true });
  target.json.world.countryStats.Latvia.population.total = 20;
  assert.equal(scenario.json.world.countryStats.Latvia.population.total, 1_000_000);
});

test("desktop new game uses the clean scenario's baseline and clears campaign-only Stats", () => {
  const source = readFileSync(path.join(root, "server/libraryStore.js"), "utf8");
  const start = source.indexOf("const seedGameJsonFilesFromScenario =");
  const end = source.indexOf("\n};", start);
  assert.ok(start >= 0 && end > start);
  const initialWorld = {
    ownerCodes: ["Latvia"], countryStats: { Latvia: { population: { total: 800000 } } },
    countryStatsHistory: { Latvia: [{ date: "2026-01-01" }] },
    statsEventReceipts: [{ eventId: "already-applied" }],
    customScenarioRule: { preserve: true },
  };
  const files = new Map([["scenario:s1:world", structuredClone(initialWorld)]]);
  const scenarioPath = (id, key) => `scenario:${id}:${key}`;
  const gamePath = (id, key) => `game:${id}:${key}`;
  const seed = vm.runInNewContext(`${source.slice(start, end + 3)}\nseedGameJsonFilesFromScenario`, {
    getScenarioJsonPath: scenarioPath,
    getGameJsonPath: gamePath,
    readJsonFile: (p, fallback) => structuredClone(files.get(p) ?? fallback),
    writeJsonFile: (p, value) => { files.set(p, structuredClone(value)); },
    copyJsonFile: (from, to, fallback) => { files.set(to, structuredClone(files.get(from) ?? fallback)); },
    JSON_ASSET_FILES: { world: "", game: "", events: "", actions: "", chat: "", prompts: "" },
    JSON_ASSET_DEFAULTS: { world: {}, game: {}, events: [], actions: [], chat: [], prompts: {} },
    scenarioLooksLikeRuntimeSnapshot: () => false,
    cloneJson: structuredClone,
    copyScenarioOptionalJsonAssetsToGame: () => {},
  });
  seed("g1", "s1");
  const created = plain(files.get("game:g1:world"));
  assert.deepEqual(created.countryStats, initialWorld.countryStats);
  assert.equal(created.countryStatsHistory, undefined);
  assert.equal(created.statsEventReceipts, undefined);
  assert.deepEqual(created.customScenarioRule, { preserve: true });
  created.countryStats.Latvia.population.total = 1;
  assert.equal(files.get("scenario:s1:world").countryStats.Latvia.population.total, 800000);
});
