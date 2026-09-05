import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import url from "url";

import {
  mergePoliticalActorsSeed,
  mergeTagsSeed,
  runMigration,
} from "../scripts/migrations/seed-fault-lines-2014-political-actors.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

const readSource = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const extractTemplateWorldOverrideKeys = (source, label) => {
  const match = source.match(
    /(?:export\s+)?const\s+TEMPLATE_WORLD_OVERRIDE_KEYS\s*=\s*\[([\s\S]*?)\];/,
  );
  assert.ok(match, `${label} must declare TEMPLATE_WORLD_OVERRIDE_KEYS`);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
};

const assertFreshWorldSeedUsesTemplateKeys = (source, label) => {
  const match = source.match(
    /(?:export\s+)?const\s+buildFreshWorldSeedFromScenario\s*=\s*\([\s\S]*?\)\s*=>\s*\{([\s\S]*?)\n\};/,
  );
  assert.ok(match, `${label} must declare buildFreshWorldSeedFromScenario`);
  assert.match(
    match[1],
    /for\s*\(\s*const\s+key\s+of\s+TEMPLATE_WORLD_OVERRIDE_KEYS\s*\)/,
    `${label} fresh-world seeding must iterate TEMPLATE_WORLD_OVERRIDE_KEYS`,
  );
  assert.match(
    match[1],
    /nextWorld\s*\[\s*key\s*\]\s*=\s*cloneJson\s*\(\s*scenarioWorld\s*\[\s*key\s*\]\s*\)/,
    `${label} fresh-world seeding must copy authored scenario values by key`,
  );
};

const seedWithTemplateKeys = ({ baseWorld, scenarioWorld, keys }) => {
  const nextWorld = JSON.parse(JSON.stringify(baseWorld ?? {}));
  for (const key of keys) {
    if (!(key in (scenarioWorld ?? {}))) continue;
    nextWorld[key] = JSON.parse(JSON.stringify(scenarioWorld[key]));
  }
  return nextWorld;
};

test("desktop and web fresh scenario seed contracts preserve authored Political Actors", () => {
  for (const [label, relativePath] of [
    ["desktop", "server/libraryStore.js"],
    ["web", "src/runtime/web/models.js"],
  ]) {
    const source = readSource(relativePath);
    const keys = extractTemplateWorldOverrideKeys(source, label);
    assert.ok(keys.includes("politicalActors"), `${label} seed allowlist must include politicalActors`);
    assertFreshWorldSeedUsesTemplateKeys(source, label);

    const seeded = seedWithTemplateKeys({
      baseWorld: { politicalActors: { schemaVersion: 1, byPolity: {} }, marker: "base" },
      scenarioWorld: {
        politicalActors: {
          schemaVersion: 1,
          byPolity: { Ukraine: { polityKey: "Ukraine", leader: "Oleksandr Turchynov" } },
        },
      },
      keys,
    });
    assert.equal(seeded.politicalActors.byPolity.Ukraine.leader, "Oleksandr Turchynov");
    assert.equal(seeded.marker, "base");
  }
});

test("Fault Lines migration fills missing actors/tags without overwriting authored current values", () => {
  const world = mergePoliticalActorsSeed({
    politicalActors: {
      schemaVersion: 1,
      byPolity: {
        Ukraine: { polityKey: "Ukraine", leader: "Custom Current Leader" },
      },
    },
  });
  assert.equal(world.politicalActors.byPolity.Ukraine.leader, "Custom Current Leader");
  assert.equal(world.politicalActors.byPolity["Russian Federation"].leader, "Vladimir Putin");
  assert.equal(world.politicalActors.byPolity["Republic of Poland"].government.headOfGovernment, "Donald Tusk");

  const tags = mergeTagsSeed({ Ukraine: ["custom-tag"] });
  assert.deepEqual(tags.Ukraine, ["custom-tag"]);
  assert.ok(tags["Russian Federation"].includes("great-power"));
});

test("Fault Lines migration patches Round-Zero game and its linked scenario but skips progressed games", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oh-pa-seed-"));
  const gameDir = path.join(root, "server", "data", "games", "fault-lines-test");
  const scenarioDir = path.join(root, "server", "data", "scenarios", "fault-lines-scenario");
  fs.mkdirSync(gameDir, { recursive: true });
  fs.mkdirSync(scenarioDir, { recursive: true });

  fs.writeFileSync(path.join(gameDir, "game-instance.json"), JSON.stringify({
    name: "Fault Lines - 2014 Session",
    scenarioId: "fault-lines-scenario",
  }));
  fs.writeFileSync(path.join(gameDir, "game.json"), JSON.stringify({ startDate: "2014-03-22", gameDate: "2014-03-22", round: 1 }));
  fs.writeFileSync(path.join(gameDir, "world.json"), JSON.stringify({ startingTimelineText: "22 March 2014. Crimea has changed Europe." }));
  fs.writeFileSync(path.join(gameDir, "tags.json"), "{}");

  fs.writeFileSync(path.join(scenarioDir, "scenario.json"), JSON.stringify({ name: "Fault Lines - 2014" }));
  fs.writeFileSync(path.join(scenarioDir, "game.json"), JSON.stringify({ startDate: "2014-03-22", gameDate: "2014-03-22", round: 1 }));
  fs.writeFileSync(path.join(scenarioDir, "world.json"), JSON.stringify({ startingTimelineText: "22 March 2014. Crimea has changed Europe." }));
  fs.writeFileSync(path.join(scenarioDir, "tags.json"), "{}");

  const result = runMigration({ rootDir: root });
  assert.deepEqual(result.changes.sort(), ["game:fault-lines-test", "scenario:fault-lines-scenario"]);

  const gameWorld = JSON.parse(fs.readFileSync(path.join(gameDir, "world.json"), "utf8"));
  const scenarioWorld = JSON.parse(fs.readFileSync(path.join(scenarioDir, "world.json"), "utf8"));
  const gameTags = JSON.parse(fs.readFileSync(path.join(gameDir, "tags.json"), "utf8"));
  assert.equal(gameWorld.politicalActors.byPolity["Russian Federation"].leader, "Vladimir Putin");
  assert.equal(scenarioWorld.politicalActors.byPolity.Ukraine.leader, "Oleksandr Turchynov");
  assert.ok(gameTags["Russian Federation"].includes("authoritarian"));
});
