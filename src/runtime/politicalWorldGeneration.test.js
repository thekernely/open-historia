import test from "node:test";
import assert from "node:assert/strict";

import {
  POLITICAL_GENERATION_DEPTHS,
  POLITICAL_GENERATION_NEEDS,
  assessPoliticalGenerationNeeds,
  buildPoliticalGenerationPlan,
  comparePoliticalGenerationAuthority,
  classifyPoliticalGenerationDepth,
  mergeMissingPoliticalActor,
  validatePoliticalGenerationProposal,
} from "./politicalWorldGeneration.js";


test("generation authority ranks campaign canon above authored/curated/generated input", () => {
  assert.equal(comparePoliticalGenerationAuthority("campaign-created", "authored"), 1);
  assert.equal(comparePoliticalGenerationAuthority("authored", "curated"), 1);
  assert.equal(comparePoliticalGenerationAuthority("curated", "generated"), 1);
  assert.equal(comparePoliticalGenerationAuthority("generated", "authored"), -1);
});

test("relevance changes political generation depth, never whether a polity is politically real", () => {
  assert.equal(classifyPoliticalGenerationDepth({ isPlayer: true }), POLITICAL_GENERATION_DEPTHS.FULL);
  assert.equal(classifyPoliticalGenerationDepth({ regionalPower: true }), POLITICAL_GENERATION_DEPTHS.RICH);
  assert.equal(classifyPoliticalGenerationDepth({ sovereign: true }), POLITICAL_GENERATION_DEPTHS.STANDARD);
  assert.equal(classifyPoliticalGenerationDepth({ sovereign: false }), POLITICAL_GENERATION_DEPTHS.MINIMAL);
});

test("generation plan includes missing polities and batches the most relevant first", () => {
  const plan = buildPoliticalGenerationPlan({
    scenarioDate: "2067-04-19",
    maxBatchSize: 2,
    polities: ["Kingdom of Poland", "European Federation", { polityKey: "Lunar Free State", sovereign: false }],
    politicalActors: { byPolity: {} },
    relevanceByPolity: {
      "European Federation": { globalPower: true },
      "Kingdom of Poland": { regionalPower: true },
    },
  });

  assert.deepEqual(plan.items.map((item) => [item.polityKey, item.depth]), [
    ["European Federation", "full"],
    ["Kingdom of Poland", "rich"],
    ["Lunar Free State", "minimal"],
  ]);
  assert.equal(plan.batches.length, 2);
  assert.ok(plan.items.every((item) => item.needs.includes(POLITICAL_GENERATION_NEEDS.POLITICAL_SYSTEM)));
});

test("1867 monarchy and 2067 fictional polity use the same scenario-agnostic completeness contract", () => {
  const monarchyNeeds = assessPoliticalGenerationNeeds({
    polityKey: "Russian Empire",
    politicalSystem: { type: "absolute_monarchy", representation: "court_factions" },
    government: { form: "Absolute monarchy", headOfState: "Alexander II" },
    powerBlocs: [{ id: "imperial-court", name: "Imperial Court" }],
  }, "rich");
  assert.ok(!monarchyNeeds.includes(POLITICAL_GENERATION_NEEDS.POLITICAL_SYSTEM));
  assert.ok(!monarchyNeeds.includes(POLITICAL_GENERATION_NEEDS.REPRESENTATION_ENTITIES));
  assert.ok(monarchyNeeds.includes(POLITICAL_GENERATION_NEEDS.RESPONSE_PROFILES));

  const futureNeeds = assessPoliticalGenerationNeeds({
    polityKey: "Kingdom of Poland",
    politicalSystem: { type: "constitutional_monarchy", representation: "electoral" },
    government: { form: "Constitutional monarchy" },
  }, "standard");
  assert.deepEqual(futureNeeds, [POLITICAL_GENERATION_NEEDS.REPRESENTATION_ENTITIES]);
});

test("missing-only merge preserves authored values and explicit empty lists", () => {
  const existing = {
    polityKey: "Kingdom of Poland",
    government: { form: "Constitutional monarchy", headOfState: "Anna I" },
    parties: [],
  };
  const generated = {
    government: { form: "Federal republic", headOfGovernment: "Jan Nowak" },
    parties: [{ id: "civic-league", name: "Civic League" }],
    traits: { riskTolerance: 62 },
  };

  const merged = mergeMissingPoliticalActor(existing, generated);
  assert.equal(merged.actor.government.form, "Constitutional monarchy");
  assert.equal(merged.actor.government.headOfState, "Anna I");
  assert.equal(merged.actor.government.headOfGovernment, "Jan Nowak");
  assert.deepEqual(merged.actor.parties, [], "explicit authored party membership is not expanded silently");
  assert.deepEqual(merged.actor.traits, { riskTolerance: 62 });
});

test("reviewed entity expansion may add new parties while still preserving authored party fields", () => {
  const existing = {
    polityKey: "Republic X",
    parties: [{ id: "unity", name: "Unity", ideology: "Authored ideology" }],
  };
  const generated = {
    parties: [
      { id: "unity", name: "Different generated name", politicalResponse: { organization: 60 } },
      { id: "reform", name: "Reform League" },
    ],
  };
  const merged = mergeMissingPoliticalActor(existing, generated, { allowEntityExpansion: true });
  assert.equal(merged.actor.parties[0].name, "Unity");
  assert.equal(merged.actor.parties[0].ideology, "Authored ideology");
  assert.equal(merged.actor.parties[0].politicalResponse.organization, 60);
  assert.equal(merged.actor.parties[1].id, "reform");
});

test("valid generation proposal fills missing state and returns generated-field provenance", () => {
  const proposal = {
    schemaVersion: 1,
    polityKey: "Kingdom of Poland",
    scenarioDate: "2067-04-19",
    depth: "rich",
    provenance: { source: "generated", confidence: "moderate", generatedAt: "2067-04-19T00:00:00Z" },
    actorPatch: {
      politicalSystem: { type: "constitutional_monarchy", representation: "electoral" },
      government: { form: "Constitutional monarchy", rulingPartyIds: ["civic-league"] },
      parties: [{
        id: "civic-league",
        name: "Civic League",
        politicalResponse: { organization: 68, issues: { reform: { position: 45, sensitivity: 70 } } },
      }],
      traits: { riskTolerance: 48, opportunism: 55 },
      goals: ["Preserve the constitutional settlement"],
    },
  };

  const result = validatePoliticalGenerationProposal(proposal, {
    polityKey: "Kingdom of Poland",
    scenarioDate: "2067-04-19",
    depth: "rich",
  });
  assert.equal(result.ok, true, result.errors?.join("\n"));
  assert.equal(result.actor.politicalSystem.representation, "electoral");
  assert.equal(result.actor.government.rulingPartyIds[0], "civic-league");
  assert.equal(result.provenance.source, "generated");
  assert.ok(result.provenance.appliedPaths.includes("politicalSystem"));
  assert.equal(result.actor.behavioralDisposition, undefined);
});

test("proposal cannot cross the historical scenario-date boundary", () => {
  const result = validatePoliticalGenerationProposal({
    schemaVersion: 1,
    polityKey: "Russian Empire",
    scenarioDate: "1867-01-01",
    depth: "standard",
    provenance: { source: "generated", confidence: "moderate" },
    referenceDates: ["1866-12-15", "1870-01-01"],
    actorPatch: {
      politicalSystem: { type: "absolute_monarchy", representation: "court_factions" },
      government: { form: "Absolute monarchy" },
    },
  }, {
    polityKey: "Russian Empire",
    scenarioDate: "1867-01-01",
    depth: "standard",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("crosses the scenario-date boundary")));
});

test("generator cannot author runtime disposition or pressure state", () => {
  const result = validatePoliticalGenerationProposal({
    schemaVersion: 1,
    polityKey: "Republic X",
    scenarioDate: "2067-01-01",
    depth: "standard",
    provenance: { source: "generated", confidence: "low" },
    actorPatch: {
      politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
      behavioralDisposition: { assertiveness: 100 },
      politicalPressures: { issues: { security: { salience: 100 } } },
    },
  }, {
    polityKey: "Republic X",
    scenarioDate: "2067-01-01",
    depth: "standard",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("behavioralDisposition")));
  assert.ok(result.errors.some((error) => error.includes("politicalPressures")));
});

test("non-electoral generated systems cannot fake party polling", () => {
  const result = validatePoliticalGenerationProposal({
    schemaVersion: 1,
    polityKey: "Emirate X",
    scenarioDate: "2067-01-01",
    depth: "rich",
    provenance: { source: "generated", confidence: "moderate" },
    actorPatch: {
      politicalSystem: { type: "absolute_monarchy", representation: "court_factions" },
      government: { form: "Absolute monarchy" },
      parties: [{ id: "kings-party", name: "King's Party", support: { percent: 99 } }],
      powerBlocs: [{ id: "royal-court", name: "Royal Court", influence: { label: "Dominant" } }],
    },
  }, {
    polityKey: "Emirate X",
    scenarioDate: "2067-01-01",
    depth: "rich",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("may not invent party polling")));
});

test("generated government references must resolve to stable party ids", () => {
  const result = validatePoliticalGenerationProposal({
    schemaVersion: 1,
    polityKey: "Republic X",
    scenarioDate: "2067-01-01",
    depth: "standard",
    provenance: { source: "generated", confidence: "moderate" },
    actorPatch: {
      politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
      government: { form: "Parliamentary republic", rulingPartyIds: ["imaginary-party"] },
      parties: [{ id: "real-party", name: "Real Party" }],
    },
  }, {
    polityKey: "Republic X",
    scenarioDate: "2067-01-01",
    depth: "standard",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("unknown party id imaginary-party")));
});


test("scenario-date contract rejects impossible calendar dates", () => {
  assert.throws(() => buildPoliticalGenerationPlan({ scenarioDate: "1867-02-31", polities: ["Russian Empire"] }), /scenarioDate/);
  const leap = buildPoliticalGenerationPlan({ scenarioDate: "2068-02-29", polities: ["Republic X"] });
  assert.equal(leap.scenarioDate, "2068-02-29");
});
