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
  assert.equal(world.politicalActors.schemaVersion, 2);
  assert.equal(world.politicalActors.byPolity.Ukraine.leader, "Custom Current Leader");
  assert.equal(world.politicalActors.byPolity["Russian Federation"].leader, "Vladimir Putin");
  assert.equal(world.politicalActors.byPolity["Russian Federation"].parties[0].support.percent, 56);
  assert.equal(world.politicalActors.byPolity["Republic of Poland"].government.headOfGovernment, "Donald Tusk");
  assert.deepEqual(world.politicalActors.byPolity["Republic of Poland"].government.rulingPartyIds, ["civic-platform"]);
  assert.deepEqual(world.politicalActors.byPolity["Republic of Poland"].government.rulingParties, ["Platforma Obywatelska"]);
  assert.deepEqual(world.politicalActors.byPolity["Republic of Poland"].government.coalitionPartyIds, ["polish-peoples-party"]);
  assert.deepEqual(world.politicalActors.byPolity["Republic of Poland"].government.coalition, ["Polskie Stronnictwo Ludowe"]);
  assert.equal(world.politicalActors.byPolity.Ukraine.government.coalitionName, "Європейський вибір");
  assert.deepEqual(world.politicalActors.byPolity.Ukraine.government.rulingPartyIds, ["batkivshchyna"]);
  assert.deepEqual(world.politicalActors.byPolity.Ukraine.government.coalitionPartyIds, ["udar", "svoboda", "economic-development-ukraine", "sovereign-european-ukraine"]);
  assert.deepEqual(world.politicalActors.byPolity.Ukraine.government.coalition, ["УДАР", "Свобода", "Економічний розвиток", "Суверенна європейська Україна"]);
  assert.equal(world.politicalActors.byPolity["Russian Federation"].government.coalition, undefined);
  assert.ok(world.politicalActors.byPolity.Ukraine.parties.some((party) => party.id === "solidarity-ukraine"));
  assert.ok(world.politicalActors.byPolity.Ukraine.parties.some((party) => party.id === "economic-development-ukraine"));
  assert.ok(world.politicalActors.byPolity.Ukraine.parties.some((party) => party.id === "sovereign-european-ukraine"));

  const tags = mergeTagsSeed({ Ukraine: ["custom-tag"] });
  assert.deepEqual(tags.Ukraine, ["custom-tag"]);
  assert.ok(tags["Russian Federation"].includes("great-power"));
});

test("Fault Lines seed enriches sparse legacy party arrays without overwriting authored campaign values", () => {
  const world = mergePoliticalActorsSeed({
    politicalActors: {
      schemaVersion: 1,
      byPolity: {
        "Russian Federation": {
          polityKey: "Russian Federation",
          parties: [
            {
              id: "united-russia",
              name: "United Russia",
              support: { percent: 53 },
              publicDescription: "Custom authored description",
            },
          ],
        },
        "Republic of Poland": {
          polityKey: "Republic of Poland",
          parties: [
            { id: "civic-platform", name: "Civic Platform", support: { percent: 41 } },
            { id: "law-and-justice", name: "Law and Justice", support: { percent: 30 } },
          ],
        },
      },
    },
  });

  const russia = world.politicalActors.byPolity["Russian Federation"];
  const unitedRussia = russia.parties.find((party) => party.id === "united-russia");
  assert.equal(unitedRussia.support.percent, 56, "the exact old Port002B placeholder is upgraded");
  assert.equal(unitedRussia.name, "Единая Россия", "the exact old seed display name upgrades to the canonical local name");
  assert.equal(unitedRussia.publicDescription, "Custom authored description", "authored party detail is preserved");
  assert.ok(russia.parties.some((party) => party.id === "communist-party-russian-federation"));
  assert.ok(russia.parties.some((party) => party.id === "ldpr"));

  const poland = world.politicalActors.byPolity["Republic of Poland"];
  const civicPlatform = poland.parties.find((party) => party.id === "civic-platform");
  const lawAndJustice = poland.parties.find((party) => party.id === "law-and-justice");
  assert.equal(civicPlatform.support.percent, 41, "a non-legacy authored support value is never replaced");
  assert.equal(lawAndJustice.support.percent, 36.1, "the exact old Port002B placeholder is upgraded");
  assert.equal(civicPlatform.name, "Platforma Obywatelska");
  assert.equal(lawAndJustice.name, "Prawo i Sprawiedliwość");
  assert.ok(poland.parties.some((party) => party.id === "democratic-left-alliance"));
  assert.ok(poland.parties.some((party) => party.id === "polish-peoples-party"));
  assert.equal(poland.parties.find((party) => party.id === "polish-peoples-party").coalition, true);
});

test("Fault Lines March 2014 party snapshots are sufficiently mapped for the player-facing landscape", () => {
  const world = mergePoliticalActorsSeed({});
  const mapped = (polity) => world.politicalActors.byPolity[polity].parties
    .reduce((sum, party) => sum + (Number(party?.support?.percent) || 0), 0);

  assert.ok(mapped("Russian Federation") >= 90);
  assert.ok(mapped("Republic of Poland") >= 99);
  assert.ok(mapped("Ukraine") >= 94);

  const batkivshchyna = world.politicalActors.byPolity.Ukraine.parties.find((party) => party.id === "batkivshchyna");
  assert.equal(batkivshchyna?.leader, "Yulia Tymoshenko");
  assert.equal(batkivshchyna?.name, "Батьківщина");
  assert.equal(batkivshchyna?.shortName, "Батьківщина");
  assert.ok(batkivshchyna?.aliases?.includes("Fatherland"));
  assert.equal(
    world.politicalActors.byPolity["Republic of Poland"].parties.find((party) => party.id === "civic-platform")?.ruling,
    true,
  );
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
