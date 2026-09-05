import test from "node:test";
import assert from "node:assert/strict";

import {
  POLITICAL_ACTORS_SCHEMA_VERSION,
  normalizePoliticalActors,
  resolvePoliticalParty,
} from "./politicalActors.js";

test("Political Actors v2 upgrades legacy party-name government references to stable party ids", () => {
  const normalized = normalizePoliticalActors({
    schemaVersion: 1,
    byPolity: {
      Ukraine: {
        polityKey: "Ukraine",
        government: {
          form: "Semi-presidential republic",
          rulingParties: ["Батьківщина"],
          coalition: ["UDAR", "Свобода"],
        },
        parties: [
          {
            id: "batkivshchyna",
            name: "Батьківщина",
            aliases: ["Batkivshchyna", "Fatherland"],
            ruling: true,
            support: { percent: 22.2 },
          },
          {
            id: "udar",
            name: "УДАР",
            aliases: ["UDAR"],
            coalition: true,
            support: { percent: 16.4 },
          },
          {
            id: "svoboda",
            name: "Свобода",
            aliases: ["Svoboda"],
            coalition: true,
            support: { percent: 5.2 },
          },
        ],
        goals: ["Preserve territorial integrity"],
        fears: ["State fragmentation"],
        ambitions: ["Deepen European integration"],
        traits: { riskTolerance: 64 },
        perceptions: { Russia: { threat: 91 } },
      },
    },
  });

  assert.equal(normalized.schemaVersion, POLITICAL_ACTORS_SCHEMA_VERSION);
  assert.equal(normalized.schemaVersion, 2);

  const actor = normalized.byPolity.Ukraine;
  assert.deepEqual(actor.government.rulingPartyIds, ["batkivshchyna"]);
  assert.deepEqual(actor.government.coalitionPartyIds, ["udar", "svoboda"]);
  assert.deepEqual(actor.government.rulingParties, ["Батьківщина"]);
  assert.deepEqual(actor.government.coalition, ["УДАР", "Свобода"]);
  assert.equal(actor.parties.find((party) => party.id === "batkivshchyna").ruling, true);
  assert.equal(actor.parties.find((party) => party.id === "udar").coalition, true);
  assert.equal(actor.traits.riskTolerance, 64);
  assert.equal(actor.perceptions.Russia.threat, 91);
});

test("party identity resolves ids, local names, short names, and aliases to one canonical record", () => {
  const world = {
    politicalActors: normalizePoliticalActors({
      byPolity: {
        Ukraine: {
          polityKey: "Ukraine",
          parties: [
            {
              id: "batkivshchyna",
              name: "Батьківщина",
              shortName: "Батьківщина",
              aliases: ["Batkivshchyna", "Fatherland"],
            },
          ],
        },
      },
    }),
  };

  const canonical = resolvePoliticalParty(world, "Ukraine", "batkivshchyna");
  assert.ok(canonical);
  assert.equal(resolvePoliticalParty(world, "Ukraine", "Батьківщина"), canonical);
  assert.equal(resolvePoliticalParty(world, "Ukraine", "Batkivshchyna"), canonical);
  assert.equal(resolvePoliticalParty(world, "Ukraine", "Fatherland"), canonical);
});

test("v2 normalization derives stable ids for legacy parties and bounds canonical numeric inputs", () => {
  const actor = normalizePoliticalActors({
    byPolity: {
      Testland: {
        government: { approval: 140, stability: -4 },
        parties: [
          { name: "National People's Front", support: { percent: 103.44 } },
        ],
        traits: { riskTolerance: 144, paranoia: -5 },
      },
    },
  }).byPolity.Testland;

  assert.equal(actor.parties[0].id, "national-people-s-front");
  assert.equal(actor.parties[0].support.percent, 100);
  assert.equal(actor.government.approval, 100);
  assert.equal(actor.government.stability, 0);
  assert.equal(actor.traits.riskTolerance, 100);
  assert.equal(actor.traits.paranoia, 0);
});

test("government ideology, national strategy, leadership traits, and perceptions remain separate owners", () => {
  const actor = normalizePoliticalActors({
    byPolity: {
      Testland: {
        ideology: "Legacy liberal",
        government: { ideology: "National conservative" },
        goals: ["Preserve regional influence"],
        fears: ["Encirclement"],
        traits: { opportunism: 72 },
        perceptions: { Rival: { trust: 18 } },
      },
    },
  }).byPolity.Testland;

  assert.equal(actor.government.ideology, "National conservative");
  assert.deepEqual(actor.goals, ["Preserve regional influence"]);
  assert.deepEqual(actor.fears, ["Encirclement"]);
  assert.equal(actor.traits.opportunism, 72);
  assert.equal(actor.perceptions.Rival.trust, 18);
  assert.equal("ideology" in actor, false);
});
