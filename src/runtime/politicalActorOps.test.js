import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPoliticalActorOperation,
  applyPoliticalActorOperations,
  POLITICAL_ACTOR_OPS,
} from "./politicalActorOps.js";
import { normalizePoliticalActors } from "./politicalActors.js";

const makeWorld = () => ({
  politicalActors: normalizePoliticalActors({
    byPolity: {
      Poland: {
        polityKey: "Poland",
        government: {
          form: "Parliamentary republic",
          headOfState: "President A",
          headOfGovernment: "Prime Minister A",
          rulingPartyIds: ["po"],
          coalitionPartyIds: ["psl"],
        },
        parties: [
          { id: "po", name: "Platforma Obywatelska", support: { percent: 33 }, ruling: true },
          { id: "psl", name: "Polskie Stronnictwo Ludowe", support: { percent: 6 }, coalition: true },
        ],
        goals: ["Maintain regional security"],
      },
    },
  }),
});

test("party lifecycle seam creates a stable party then updates support and leader without changing identity", () => {
  const world = makeWorld();

  const created = applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.CREATE_PARTY,
    polityKey: "Poland",
    party: {
      id: "nfp",
      name: "Narodowy Front Ludowy",
      aliases: ["National People's Front"],
      ideology: "Nationalist populist",
      support: { percent: 2.4 },
    },
  });
  assert.equal(created.applied, true);

  const batch = applyPoliticalActorOperations(world, [
    {
      op: POLITICAL_ACTOR_OPS.SET_PARTY_SUPPORT,
      polityKey: "Poland",
      partyId: "nfp",
      percent: 19.2,
    },
    {
      op: POLITICAL_ACTOR_OPS.SET_PARTY_LEADER,
      polityKey: "Poland",
      partyId: "National People's Front",
      leader: "Jan Nowak",
    },
  ]);

  assert.equal(batch.failed, 0);
  const party = world.politicalActors.byPolity.Poland.parties.find((entry) => entry.id === "nfp");
  assert.equal(party.support.percent, 19.2);
  assert.equal(party.leader, "Jan Nowak");
  assert.equal(party.name, "Narodowy Front Ludowy");
});

test("forming and changing a coalition uses stable party ids while keeping local display names derived", () => {
  const world = makeWorld();
  applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.CREATE_PARTY,
    polityKey: "Poland",
    party: { id: "nfp", name: "Narodowy Front Ludowy", support: { percent: 18 } },
  });

  const formed = applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.FORM_COALITION,
    polityKey: "Poland",
    rulingPartyIds: ["nfp"],
    coalitionPartyIds: ["psl"],
    coalitionName: "Internal historical label",
  });
  assert.equal(formed.applied, true);

  let government = world.politicalActors.byPolity.Poland.government;
  assert.deepEqual(government.rulingPartyIds, ["nfp"]);
  assert.deepEqual(government.coalitionPartyIds, ["psl"]);
  assert.deepEqual(government.rulingParties, ["Narodowy Front Ludowy"]);
  assert.deepEqual(government.coalition, ["Polskie Stronnictwo Ludowe"]);
  assert.equal(government.coalitionName, "Internal historical label");

  const left = applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.LEAVE_COALITION,
    polityKey: "Poland",
    partyId: "psl",
  });
  assert.equal(left.applied, true);

  government = world.politicalActors.byPolity.Poland.government;
  assert.deepEqual(government.rulingPartyIds, ["nfp"]);
  assert.deepEqual(government.coalitionPartyIds, []);
  assert.equal(world.politicalActors.byPolity.Poland.parties.find((party) => party.id === "psl").coalition, undefined);
});

test("government and leader transitions share the same canonical mutation doorway", () => {
  const world = makeWorld();

  const batch = applyPoliticalActorOperations(world, [
    {
      op: POLITICAL_ACTOR_OPS.SET_GOVERNMENT,
      polityKey: "Poland",
      patch: {
        form: "Presidential republic",
        ideology: "National conservative",
        rulingPartyIds: ["po"],
        coalitionPartyIds: [],
      },
    },
    {
      op: POLITICAL_ACTOR_OPS.REPLACE_LEADER,
      polityKey: "Poland",
      office: "headOfState",
      leader: "President B",
    },
    {
      op: POLITICAL_ACTOR_OPS.REPLACE_LEADER,
      polityKey: "Poland",
      office: "headOfGovernment",
      leader: "Prime Minister B",
    },
    {
      op: POLITICAL_ACTOR_OPS.SET_STRATEGY,
      polityKey: "Poland",
      patch: {
        goals: ["Restore direct regional dominance"],
        fears: ["Strategic isolation"],
        ambitions: ["Build a new regional bloc"],
      },
    },
    {
      op: POLITICAL_ACTOR_OPS.SET_TRAITS,
      polityKey: "Poland",
      traits: { riskTolerance: 83, opportunism: 77 },
    },
    {
      op: POLITICAL_ACTOR_OPS.SET_PERCEPTIONS,
      polityKey: "Poland",
      perceptions: { NATO: { cohesionEstimate: 48, trust: -12 } },
    },
  ]);

  assert.equal(batch.failed, 0);
  const actor = world.politicalActors.byPolity.Poland;
  assert.equal(actor.government.form, "Presidential republic");
  assert.equal(actor.government.ideology, "National conservative");
  assert.equal(actor.government.headOfState, "President B");
  assert.equal(actor.government.headOfGovernment, "Prime Minister B");
  assert.equal(actor.leader, "President B");
  assert.deepEqual(actor.goals, ["Restore direct regional dominance"]);
  assert.deepEqual(actor.fears, ["Strategic isolation"]);
  assert.deepEqual(actor.ambitions, ["Build a new regional bloc"]);
  assert.equal(actor.traits.riskTolerance, 83);
  assert.equal(actor.traits.opportunism, 77);
  assert.equal(actor.perceptions.NATO.cohesionEstimate, 48);
  assert.equal(actor.perceptions.NATO.trust, -12);
});

test("unknown parties are rejected rather than minting duplicate coalition identities", () => {
  const world = makeWorld();
  const outcome = applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.FORM_COALITION,
    polityKey: "Poland",
    rulingPartyIds: ["po"],
    coalitionPartyIds: ["Not A Real Party"],
  });
  assert.equal(outcome.applied, false);
  assert.match(outcome.error, /Unknown party/);
  assert.deepEqual(world.politicalActors.byPolity.Poland.government.coalitionPartyIds, ["psl"]);
});

test("non-democratic political systems and power blocs use the canonical mutation doorway", () => {
  const world = { politicalActors: normalizePoliticalActors({}) };
  const batch = applyPoliticalActorOperations(world, [
    {
      op: POLITICAL_ACTOR_OPS.SET_POLITICAL_SYSTEM,
      polityKey: "Kingdom",
      patch: { type: "absolute_monarchy", representation: "court_factions" },
    },
    {
      op: POLITICAL_ACTOR_OPS.SET_GOVERNMENT,
      polityKey: "Kingdom",
      patch: { form: "Absolute monarchy", headOfState: "King A" },
    },
    {
      op: POLITICAL_ACTOR_OPS.CREATE_POWER_BLOC,
      polityKey: "Kingdom",
      bloc: { id: "court", name: "Royal Court", influence: { label: "Dominant" } },
    },
    {
      op: POLITICAL_ACTOR_OPS.CREATE_POWER_BLOC,
      polityKey: "Kingdom",
      bloc: { id: "army", name: "Military establishment", influence: { percent: 24 } },
    },
    {
      op: POLITICAL_ACTOR_OPS.SET_POWER_BLOC_INFLUENCE,
      polityKey: "Kingdom",
      blocId: "army",
      percent: 31.5,
      label: "Strong",
    },
  ]);

  assert.equal(batch.failed, 0);
  const actor = world.politicalActors.byPolity.Kingdom;
  assert.equal(actor.politicalSystem.representation, "court_factions");
  assert.deepEqual(actor.parties, []);
  assert.equal(actor.powerBlocs.find((bloc) => bloc.id === "court").influence.label, "Dominant");
  assert.equal(actor.powerBlocs.find((bloc) => bloc.id === "army").influence.percent, 31.5);
  assert.equal(actor.powerBlocs.find((bloc) => bloc.id === "army").influence.label, "Strong");
});

test("renaming a power bloc preserves stable identity and keeps its former name as an alias", () => {
  const world = makeWorld();
  applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.SET_POLITICAL_SYSTEM,
    polityKey: "Poland",
    patch: { type: "personalist_regime", representation: "elite_factions" },
  });
  applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.CREATE_POWER_BLOC,
    polityKey: "Poland",
    bloc: { id: "security", name: "Security Directorate" },
  });
  const renamed = applyPoliticalActorOperation(world, {
    op: POLITICAL_ACTOR_OPS.UPDATE_POWER_BLOC,
    polityKey: "Poland",
    blocId: "security",
    patch: { name: "National Security Directorate" },
  });

  assert.equal(renamed.applied, true);
  const bloc = world.politicalActors.byPolity.Poland.powerBlocs.find((entry) => entry.id === "security");
  assert.equal(bloc.name, "National Security Directorate");
  assert.ok(bloc.aliases.includes("Security Directorate"));
});
