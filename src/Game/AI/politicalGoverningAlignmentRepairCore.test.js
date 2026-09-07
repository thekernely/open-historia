import test from "node:test";
import assert from "node:assert/strict";

import {
  POLITICAL_GOVERNING_ALIGNMENT_BATCH_SIZE,
  POLITICAL_GOVERNING_ALIGNMENT_TOOL,
  generatePoliticalGoverningAlignmentRepairCore,
} from "./politicalGoverningAlignmentRepairCore.js";

const fixedNow = "2026-09-07T00:00:00Z";

const electoralActor = ({ ruling = [], coalition = [], head = "Prime Minister" } = {}) => ({
  politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
  government: {
    form: "Parliamentary republic",
    headOfGovernment: head,
    rulingPartyIds: ruling,
    coalitionPartyIds: coalition,
  },
  parties: [
    { id: "a", name: "Party A", ideology: "centre-right" },
    { id: "b", name: "Party B", ideology: "centre-left" },
  ],
});

test("governing-alignment repair touches only missing government party refs and skips already aligned actors", async () => {
  const byPolity = {
    "Federal Republic of Germany": {
      politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
      government: { form: "Federal parliamentary republic", headOfGovernment: "Angela Merkel", rulingPartyIds: [], coalitionPartyIds: [] },
      parties: [{ id: "cdu-csu", name: "CDU/CSU" }, { id: "spd", name: "SPD" }],
    },
    "French Republic": {
      politicalSystem: { type: "semi_presidential_republic", representation: "electoral" },
      government: { form: "Unitary semi-presidential republic", headOfState: "François Hollande", headOfGovernment: "Jean-Marc Ayrault", rulingPartyIds: [], coalitionPartyIds: [] },
      parties: [{ id: "ps", name: "Socialist Party" }, { id: "ump", name: "Union for a Popular Movement" }],
    },
    "Republic of Latvia": {
      politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
      government: { form: "Parliamentary Republic", headOfGovernment: "Laimdota Straujuma", rulingPartyIds: [], coalitionPartyIds: [] },
      parties: [
        { id: "unity", name: "Unity" },
        { id: "reform-party", name: "Reform Party" },
        { id: "union-of-greens-and-farmers", name: "Union of Greens and Farmers" },
        { id: "national-alliance", name: "National Alliance" },
      ],
    },
    "United States of America": {
      politicalSystem: { type: "presidential_republic", representation: "electoral" },
      government: { form: "Federal presidential constitutional republic", headOfState: "Barack Obama", rulingPartyIds: ["democratic-party"], coalitionPartyIds: [] },
      parties: [{ id: "democratic-party", name: "Democratic Party" }, { id: "republican-party", name: "Republican Party" }],
    },
  };
  let calls = 0;
  const result = await generatePoliticalGoverningAlignmentRepairCore({
    scenarioDate: "2014-03-22",
    polities: Object.keys(byPolity),
    politicalActors: { byPolity },
    relevanceByPolity: Object.fromEntries(Object.keys(byPolity).map((key) => [key, { depth: "rich" }])),
    generatedAt: fixedNow,
    callModel: async (_system, messages, opts) => {
      calls += 1;
      assert.equal(opts.tool?.name, POLITICAL_GOVERNING_ALIGNMENT_TOOL.name);
      const prompt = messages?.[0]?.parts?.[0]?.text || "";
      assert.match(prompt, /Federal Republic of Germany/);
      assert.match(prompt, /French Republic/);
      assert.match(prompt, /Republic of Latvia/);
      assert.doesNotMatch(prompt, /United States of America/);
      return { toolInput: { alignments: [
        { polityKey: "Federal Republic of Germany", confidence: "high", alignmentJson: JSON.stringify({ rulingPartyIds: ["cdu-csu"], coalitionPartyIds: ["spd"] }) },
        { polityKey: "French Republic", confidence: "high", alignmentJson: JSON.stringify({ rulingPartyIds: ["ps"], coalitionPartyIds: [] }) },
        { polityKey: "Republic of Latvia", confidence: "high", alignmentJson: JSON.stringify({ rulingPartyIds: ["unity"], coalitionPartyIds: ["reform-party", "union-of-greens-and-farmers", "national-alliance"] }) },
      ] } };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.plan.items.length, 3);
  assert.equal(result.generatedPolities, 3, JSON.stringify(result.failures));
  assert.equal(result.failedPolities, 0);
  assert.equal(result.historicalVerification.requested, 0);
  const germany = result.proposals.find((entry) => entry.item.polityKey === "Federal Republic of Germany");
  assert.deepEqual(germany.proposal.actorPatch, { government: { rulingPartyIds: ["cdu-csu"], coalitionPartyIds: ["spd"] } });
  assert.deepEqual(germany.validation.appliedPaths, ["government.rulingPartyIds", "government.coalitionPartyIds"]);
});

test("202 missing governing alignments are bounded to five compact model calls", async () => {
  const polities = Array.from({ length: 202 }, (_, index) => `Polity ${String(index + 1).padStart(3, "0")}`);
  const byPolity = Object.fromEntries(polities.map((key) => [key, electoralActor()]));
  let calls = 0;
  const requestedPerCall = [];
  const result = await generatePoliticalGoverningAlignmentRepairCore({
    scenarioDate: "2014-03-22",
    polities,
    politicalActors: { byPolity },
    generatedAt: fixedNow,
    callModel: async (_system, messages, opts) => {
      calls += 1;
      assert.equal(opts.tool?.name, POLITICAL_GOVERNING_ALIGNMENT_TOOL.name);
      const prompt = messages?.[0]?.parts?.[0]?.text || "";
      const requested = [...prompt.matchAll(/^POLITY: (.+)$/gm)].map((match) => match[1].trim());
      requestedPerCall.push(requested.length);
      assert.ok(requested.length > 0 && requested.length <= POLITICAL_GOVERNING_ALIGNMENT_BATCH_SIZE);
      return { toolInput: { alignments: requested.map((polityKey) => ({
        polityKey,
        confidence: "moderate",
        alignmentJson: JSON.stringify({ rulingPartyIds: ["a"], coalitionPartyIds: ["b"] }),
      })) } };
    },
  });

  assert.equal(calls, 5);
  assert.deepEqual(requestedPerCall, [48, 48, 48, 48, 10]);
  assert.equal(result.generatedPolities, 202, JSON.stringify(result.failures));
  assert.equal(result.failedPolities, 0);
  assert.equal(result.governingAlignmentRepair.modelCalls, 5);
  assert.equal(result.governingAlignmentRepair.batches, 5);
  assert.equal(result.historicalVerification.requested, 0);
});

test("malformed individual governing alignment retries only the unresolved polity", async () => {
  const polities = ["Republic A", "Republic B", "Republic C"];
  const byPolity = Object.fromEntries(polities.map((key) => [key, electoralActor()]));
  const prompts = [];
  let calls = 0;
  const result = await generatePoliticalGoverningAlignmentRepairCore({
    scenarioDate: "2014-03-22",
    polities,
    politicalActors: { byPolity },
    generatedAt: fixedNow,
    maxAttempts: 2,
    callModel: async (_system, messages) => {
      calls += 1;
      const prompt = messages?.[0]?.parts?.[0]?.text || "";
      prompts.push(prompt);
      if (calls === 1) {
        return { toolInput: { alignments: [
          { polityKey: "Republic A", confidence: "high", alignmentJson: JSON.stringify({ rulingPartyIds: ["a"], coalitionPartyIds: ["b"] }) },
          { polityKey: "Republic B", confidence: "unknown", alignmentJson: "{malformed" },
          { polityKey: "Republic C", confidence: "high", alignmentJson: JSON.stringify({ nonPartisan: true }) },
        ] } };
      }
      return { toolInput: { alignments: [
        { polityKey: "Republic B", confidence: "high", alignmentJson: JSON.stringify({ rulingPartyIds: ["a"], coalitionPartyIds: [] }) },
      ] } };
    },
  });

  assert.equal(calls, 2);
  assert.match(prompts[0], /Republic A/);
  assert.match(prompts[0], /Republic B/);
  assert.match(prompts[0], /Republic C/);
  assert.doesNotMatch(prompts[1], /Republic A/);
  assert.match(prompts[1], /Republic B/);
  assert.doesNotMatch(prompts[1], /Republic C/);
  assert.equal(result.generatedPolities, 2);
  assert.deepEqual(result.governingAlignmentRepair.nonPartisan, ["Republic C"]);
  assert.equal(result.failedPolities, 0);
});

test("single-party party-state governing alignment is repaired natively with zero AI calls", async () => {
  const polityKey = "People's Republic X";
  let calls = 0;
  const result = await generatePoliticalGoverningAlignmentRepairCore({
    scenarioDate: "2014-03-22",
    polities: [polityKey],
    politicalActors: { byPolity: {
      [polityKey]: {
        politicalSystem: { type: "one_party_state", representation: "party_state" },
        government: { form: "One-party socialist republic", headOfState: "Leader", rulingPartyIds: [], coalitionPartyIds: [] },
        parties: [{ id: "workers", name: "Workers Party" }],
      },
    } },
    generatedAt: fixedNow,
    callModel: async () => { calls += 1; throw new Error("model should not be called"); },
  });
  assert.equal(calls, 0);
  assert.equal(result.generatedPolities, 1, JSON.stringify(result.failures));
  assert.deepEqual(result.proposals[0].proposal.actorPatch.government.rulingPartyIds, ["workers"]);
  assert.equal(result.governingAlignmentRepair.nativeResolved, 1);
});
