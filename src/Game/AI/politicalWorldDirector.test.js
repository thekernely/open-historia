import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildWorldDirectorPoliticalDecisionLayer,
  validateWorldPoliticalDecisionCompatibility,
  WORLD_DIRECTOR_POLITICAL_MAX_ACTORS,
  WORLD_DIRECTOR_POLITICAL_MAX_CHARS,
} from "./politicalWorldDirector.js";

const actor = (polityKey, disposition = {}, extra = {}) => ({
  polityKey,
  politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
  government: {
    form: "Parliamentary republic",
    headOfGovernment: `Prime Minister of ${polityKey}`,
    rulingPartyIds: [`${polityKey.toLowerCase().replace(/\W+/g, "-")}-party`],
  },
  parties: [{
    id: `${polityKey.toLowerCase().replace(/\W+/g, "-")}-party`,
    name: `${polityKey} Party`,
    support: { percent: 42, basis: "campaign-derived" },
  }],
  goals: ["Preserve national security"],
  fears: ["Strategic isolation"],
  ambitions: ["Increase regional influence"],
  politicalPressures: {
    issues: {
      economic_stress: { salience: 30, strain: 25, lean: 0, momentum: 0, persistence: 0.5 },
    },
  },
  behavioralDisposition: {
    assertiveness: 50,
    riskTolerance: 50,
    escalationPressure: 50,
    compromisePressure: 50,
    regimeVulnerability: 40,
    deterrenceSensitivity: 50,
    opportunityPerception: 50,
    threatPerception: 50,
    ...disposition,
  },
  perceptions: {},
  ...extra,
});

const makeWorld = () => {
  const byPolity = {
    "Player State": actor("Player State"),
    "Cautious Republic": actor("Cautious Republic", {
      assertiveness: 10,
      riskTolerance: 10,
      escalationPressure: 8,
      compromisePressure: 90,
      opportunityPerception: 10,
      threatPerception: 12,
    }),
    "Neighbor State": actor("Neighbor State"),
    "Story Actor": actor("Story Actor"),
    "Explore One": actor("Explore One"),
    "Explore Two": actor("Explore Two"),
    "Diplomatic One": actor("Diplomatic One"),
    "Diplomatic Two": actor("Diplomatic Two"),
    "Economic One": actor("Economic One"),
    "Overflow Actor": actor("Overflow Actor"),
  };
  return {
    politicalActors: { schemaVersion: 6, byPolity },
    polityOverrides: Object.fromEntries(
      Object.keys(byPolity).map((name) => [name, { name, aliases: [`${name} Alias`] }]),
    ),
    relations: [{ a: "Cautious Republic", b: "Neighbor State", score: 5, status: "neutral" }],
    agreements: [],
    wars: [],
  };
};

const buildLayer = (world = makeWorld()) => buildWorldDirectorPoliticalDecisionLayer({
  bundle: { game: { country: "Player State" }, world },
  storylineAttention: {
    selected: [{
      id: "story-1",
      title: "Regional bargaining",
      participants: ["Cautious Republic", "Neighbor State", "Story Actor"],
    }],
  },
  explorationSlate: [
    { type: "actor-domain", actor: "Explore One", domain: "politics" },
    { type: "actor-domain", actor: "Explore Two", domain: "economy" },
  ],
  diplomaticAttention: { actors: ["Diplomatic One", "Diplomatic Two", "Overflow Actor"] },
  economicAttention: [{ actor: "Economic One" }],
});

test("Phase009B builds a bounded World Director political context without expanding past the actor/text budget", () => {
  const layer = buildLayer();
  assert.ok(layer.actors.length > 0);
  assert.ok(layer.actors.length <= WORLD_DIRECTOR_POLITICAL_MAX_ACTORS);
  assert.ok(layer.charCount <= WORLD_DIRECTOR_POLITICAL_MAX_CHARS);
  assert.match(layer.text, /Bounded Political Decision Context Set/);
  assert.match(layer.text, /ACTOR CAPSULE/);
  assert.ok(layer.actors.includes("Player State"));
  assert.ok(layer.actors.includes("Cautious Republic"));
  assert.equal(layer.compatibility.length, layer.actors.length);
});

test("Phase009B compatibility gate rejects only a gross untriggered non-player escalation", () => {
  const world = makeWorld();
  const layer = buildLayer(world);
  const candidate = {
    events: [{
      title: "Cautious Republic declares war on Neighbor State",
      description: "Cautious Republic declares war and orders an invasion despite no new incident or external trigger.",
    }],
  };
  const issue = validateWorldPoliticalDecisionCompatibility(candidate, {
    politicalDecisionCompatibility: layer.compatibility,
  }, { world, gameCountry: "Player State" });
  assert.match(issue, /grossly conflicts with its current Political Decision Context/i);
  assert.match(issue, /concrete campaign-state trigger/i);
});

test("Phase009B compatibility gate allows a sharp reversal when the event contains a concrete new trigger", () => {
  const world = makeWorld();
  const layer = buildLayer(world);
  const candidate = {
    events: [{
      title: "Cautious Republic launches attack",
      description: "Cautious Republic launches an attack in response to an invasion of its border district.",
    }],
  };
  const issue = validateWorldPoliticalDecisionCompatibility(candidate, {
    politicalDecisionCompatibility: layer.compatibility,
  }, { world, gameCountry: "Player State" });
  assert.equal(issue, "");
});

test("Phase009B never lets political compatibility veto an explicit player-polity decision", () => {
  const world = makeWorld();
  world.politicalActors.byPolity["Player State"].behavioralDisposition = {
    assertiveness: 5,
    riskTolerance: 5,
    escalationPressure: 5,
    compromisePressure: 95,
    regimeVulnerability: 20,
    deterrenceSensitivity: 60,
    opportunityPerception: 5,
    threatPerception: 5,
  };
  const layer = buildLayer(world);
  const candidate = {
    events: [{
      title: "Player State declares war",
      description: "Player State declares war on Neighbor State and launches an invasion.",
    }],
  };
  const issue = validateWorldPoliticalDecisionCompatibility(candidate, {
    politicalDecisionCompatibility: layer.compatibility,
  }, { world, gameCountry: "Player State" });
  assert.equal(issue, "");
});

test("Phase009B architecture enriches the existing jump call instead of creating a political AI pass", () => {
  const bridgeSource = fs.readFileSync(new URL("./politicalWorldDirector.js", import.meta.url), "utf8");
  const worldDirectorSource = fs.readFileSync(new URL("./nativeWorldDirector.js", import.meta.url), "utf8");
  const gameplaySource = fs.readFileSync(new URL("./gameplay.js", import.meta.url), "utf8");

  assert.doesNotMatch(bridgeSource, /callAI\s*\(|fetch\s*\(|generateContent|OpenAI|anthropic|gemini/i);
  assert.doesNotMatch(bridgeSource, /writeWorldState|applyPoliticalActor|ensurePoliticalProfile|Math\.random/);
  assert.match(worldDirectorSource, /buildWorldDirectorPoliticalDecisionLayer/);
  assert.match(worldDirectorSource, /POLITICAL DECISION CONTEXT — ACTOR-RELATIVE/);
  assert.match(gameplaySource, /validateWorldPoliticalDecisionCompatibility/);
  assert.match(gameplaySource, /worldInitiative\.analysis/);
  assert.match(gameplaySource, /outputAttempt <= 2/);
});
