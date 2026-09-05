import test from "node:test";
import assert from "node:assert/strict";

import {
  POLITICAL_WORLD_GENERATION_TOOL,
  buildPoliticalWorldGenerationPrompt,
  generatePoliticalWorldProposalsCore,
} from "./politicalWorldGeneratorCore.js";

const fixedNow = "2026-09-06T00:00:00Z";

test("Phase006B tool keeps the provider envelope shallow while native code owns date/depth/provenance", () => {
  assert.equal(POLITICAL_WORLD_GENERATION_TOOL.name, "submit_political_world_generation");
  assert.equal(POLITICAL_WORLD_GENERATION_TOOL.schema.properties.proposals.maxItems, 12);
  const proposal = POLITICAL_WORLD_GENERATION_TOOL.schema.properties.proposals.items;
  assert.ok(proposal.properties.polityKey);
  assert.ok(proposal.properties.actorPatch);
  assert.equal(proposal.properties.scenarioDate, undefined);
  assert.equal(proposal.properties.depth, undefined);
  assert.equal(proposal.properties.provenance, undefined);
});

test("bounded prompt excludes derived runtime politics and carries only requested canonical context", () => {
  const prompt = buildPoliticalWorldGenerationPrompt({
    scenarioDate: "2067-04-19",
    items: [{ polityKey: "Kingdom of Poland", depth: "rich", needs: ["structured_leadership_traits"] }],
    politicalActors: {
      byPolity: {
        "Kingdom of Poland": {
          government: { form: "Constitutional monarchy", ideology: "Constitutional royalism" },
          traits: {},
          behavioralDisposition: { assertiveness: 99 },
          politicalPressures: { issues: { security: { salience: 88 } } },
        },
      },
    },
    scenarioContext: "A fictional 2067 European settlement.",
  });
  assert.match(prompt.systemPrompt, /2067-04-19/);
  assert.match(prompt.userMessage, /Constitutional monarchy/);
  assert.doesNotMatch(prompt.userMessage, /assertiveness/);
  assert.doesNotMatch(prompt.userMessage, /security.*salience/);
  assert.match(prompt.userMessage, /structured_leadership_traits/);
});

test("actual generation handles historical monarchy and future fictional polity through the same validated seam", async () => {
  const calls = [];
  const result = await generatePoliticalWorldProposalsCore({
    scenarioDate: "2067-04-19",
    polities: ["Kingdom of Poland", "Lunar Free State"],
    politicalActors: { byPolity: {} },
    relevanceByPolity: {
      "Kingdom of Poland": { globalPower: true },
      "Lunar Free State": { sovereign: false },
    },
    maxBatchSize: 2,
    generatedAt: fixedNow,
    callModel: async (system, history, opts) => {
      calls.push({ system, history, opts });
      return {
        toolInput: {
          proposals: [
            {
              polityKey: "Kingdom of Poland",
              confidence: "moderate",
              actorPatch: {
                politicalSystem: { type: "constitutional_monarchy", representation: "electoral" },
                government: { form: "Constitutional monarchy", ideology: "Constitutional royalism" },
                parties: [{ id: "civic-league", name: "Civic League", politicalResponse: { organization: 65, issues: { reform: { position: 30, sensitivity: 55 } } } }],
                traits: { riskTolerance: 48 },
                goals: ["Preserve the constitutional settlement"],
                perceptions: { eastern_neighbor: { threat: 55 } },
                domesticPressures: ["Federal autonomy debate"],
              },
            },
            {
              polityKey: "Lunar Free State",
              confidence: "low",
              actorPatch: {
                politicalSystem: { type: "administrative_republic", representation: "none" },
              },
            },
          ],
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.taskKey, "politicalWorldGeneration");
  assert.equal(calls[0].opts.tool.name, "submit_political_world_generation");
  assert.equal(result.generatedPolities, 2);
  assert.equal(result.failedPolities, 0);
  const poland = result.proposals.find((entry) => entry.item.polityKey === "Kingdom of Poland");
  assert.equal(poland.proposal.scenarioDate, "2067-04-19");
  assert.equal(poland.proposal.depth, "full");
  assert.equal(poland.proposal.provenance.source, "generated");
  assert.equal(poland.proposal.provenance.generatedAt, fixedNow);
  assert.equal(poland.validation.actor.behavioralDisposition, undefined);
});

test("invalid polity retries only the unresolved proposal and preserves the valid result", async () => {
  let call = 0;
  const seenUserMessages = [];
  const result = await generatePoliticalWorldProposalsCore({
    scenarioDate: "1867-01-01",
    polities: ["Russian Empire", "Kingdom of Italy"],
    politicalActors: { byPolity: {} },
    maxBatchSize: 2,
    generatedAt: fixedNow,
    callModel: async (_system, history) => {
      call += 1;
      seenUserMessages.push(history[0].parts[0].text);
      if (call === 1) {
        return { toolInput: { proposals: [
          {
            polityKey: "Kingdom of Italy",
            actorPatch: {
              politicalSystem: { type: "constitutional_monarchy", representation: "electoral" },
              government: { form: "Constitutional monarchy" },
              parties: [{ id: "historical-right", name: "Historical Right" }],
            },
          },
          {
            polityKey: "Russian Empire",
            sourceAsOf: "1870-01-01",
            actorPatch: {
              politicalSystem: { type: "absolute_monarchy", representation: "court_factions" },
              government: { form: "Absolute monarchy" },
              powerBlocs: [{ id: "imperial-court", name: "Imperial Court" }],
            },
          },
        ] } };
      }
      return { toolInput: { proposals: [{
        polityKey: "Russian Empire",
        sourceAsOf: "1866-12-01",
        actorPatch: {
          politicalSystem: { type: "absolute_monarchy", representation: "court_factions" },
          government: { form: "Absolute monarchy" },
          powerBlocs: [{ id: "imperial-court", name: "Imperial Court" }],
        },
      }] } };
    },
  });

  assert.equal(call, 2);
  assert.equal(result.generatedPolities, 2);
  assert.equal(result.failedPolities, 0);
  assert.match(seenUserMessages[1], /Russian Empire/);
  assert.doesNotMatch(seenUserMessages[1], /POLITY: Kingdom of Italy/);
  assert.match(seenUserMessages[1], /crosses the scenario-date boundary/);
});

test("unrequested fields are rejected instead of allowing the model to broaden its own task", async () => {
  const result = await generatePoliticalWorldProposalsCore({
    scenarioDate: "2067-01-01",
    polities: ["Republic X"],
    politicalActors: {
      byPolity: {
        "Republic X": {
          politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
          government: { form: "Parliamentary republic" },
          parties: [{ id: "unity", name: "Unity" }],
        },
      },
    },
    relevanceByPolity: { "Republic X": { regionalPower: true } },
    maxAttempts: 1,
    callModel: async () => ({ toolInput: { proposals: [{
      polityKey: "Republic X",
      actorPatch: {
        traits: { riskTolerance: 45 },
        goals: ["This was not requested when other rich needs may vary"],
        tags: ["AI broadened scope"],
      },
    }] } }),
  });
  assert.equal(result.generatedPolities, 0);
  assert.equal(result.failedPolities, 1);
  assert.ok(result.failures[0].errors.some((error) => error.includes("actorPatch.tags was not requested")));
});

test("generation never mutates existing Political Actors while producing review proposals", async () => {
  const politicalActors = {
    byPolity: {
      "Republic X": {
        politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
        government: { form: "Parliamentary republic" },
      },
    },
  };
  const before = JSON.stringify(politicalActors);
  await generatePoliticalWorldProposalsCore({
    scenarioDate: "2067-01-01",
    polities: ["Republic X"],
    politicalActors,
    maxAttempts: 1,
    callModel: async () => ({ toolInput: { proposals: [{
      polityKey: "Republic X",
      actorPatch: { parties: [{ id: "unity", name: "Unity" }] },
    }] } }),
  });
  assert.equal(JSON.stringify(politicalActors), before);
});

test("text-json fallback is still validated when a provider cannot land a tool call", async () => {
  const result = await generatePoliticalWorldProposalsCore({
    scenarioDate: "2067-01-01",
    polities: [{ polityKey: "Station Authority", sovereign: false }],
    maxAttempts: 1,
    callModel: async () => ({ rawText: JSON.stringify({ proposals: [{
      polityKey: "Station Authority",
      confidence: "low",
      actorPatch: { politicalSystem: { type: "appointed_administration", representation: "none" } },
    }] }) }),
  });
  assert.equal(result.generatedPolities, 1);
  assert.equal(result.failedPolities, 0);
});

test("a politically complete world causes zero AI calls", async () => {
  let calls = 0;
  const result = await generatePoliticalWorldProposalsCore({
    scenarioDate: "2067-01-01",
    polities: ["Republic X"],
    politicalActors: { byPolity: { "Republic X": {
      politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
      government: { form: "Parliamentary republic", ideology: "Civic liberalism", headOfGovernment: "A. Example", approval: 60, stability: 70 },
      parties: [{
        id: "unity",
        name: "Unity",
        support: { percent: 55 },
        politicalResponse: { organization: 60, issues: { reform: { position: 20, sensitivity: 50 } } },
      }],
      traits: { riskTolerance: 50 },
      goals: ["Maintain stability"],
      perceptions: { rival: { threat: 40 } },
      domesticPressures: ["Housing costs"],
    } } },
    relevanceByPolity: { "Republic X": { globalPower: true } },
    callModel: async () => { calls += 1; return { toolInput: { proposals: [] } }; },
  });
  assert.equal(calls, 0);
  assert.equal(result.plan.items.length, 0);
});

test("duplicate proposals for one polity are rejected as ambiguous", async () => {
  const result = await generatePoliticalWorldProposalsCore({
    scenarioDate: "2067-01-01",
    polities: [{ polityKey: "Station Authority", sovereign: false }],
    maxAttempts: 1,
    callModel: async () => ({ toolInput: { proposals: [
      { polityKey: "Station Authority", actorPatch: { politicalSystem: { type: "appointed_administration", representation: "none" } } },
      { polityKey: "Station Authority", actorPatch: { politicalSystem: { type: "military_regime", representation: "military_factions" } } },
    ] } }),
  });
  assert.equal(result.generatedPolities, 0);
  assert.equal(result.failedPolities, 1);
  assert.ok(result.failures[0].errors.some((error) => error.includes("duplicate proposals")));
});
