/*! Open Historia — player-facing political presentation tests */
import test from "node:test";
import assert from "node:assert/strict";
import { buildPoliticalPartyLandscape } from "./politicalPresentation.js";

test("party landscape stays bounded and fills unlisted support as Other", () => {
  const out = buildPoliticalPartyLandscape({
    government: { rulingParties: ["Civic Platform"] },
    parties: [
      { id: "po", name: "Civic Platform", support: { percent: 35 }, ideology: "liberal conservative", ruling: true },
      { id: "pis", name: "Law and Justice", support: { percent: 30 }, ideology: "national conservative" },
      { id: "sld", name: "SLD", support: { percent: 11 } },
      { id: "psl", name: "PSL", support: { percent: 7 } },
    ],
  });

  assert.equal(out.slices.find((party) => party.id === "po")?.ruling, true);
  assert.equal(out.slices.find((party) => party.id === "__other__")?.support, 17);
  assert.equal(Math.round(out.slices.reduce((sum, party) => sum + party.chartPercent, 0)), 100);
});

test("small parties collapse into a clickable Other slice without losing their public detail", () => {
  const out = buildPoliticalPartyLandscape({
    parties: [
      { name: "A", support: { percent: 35 } },
      { name: "B", support: { percent: 30 } },
      { name: "C", support: { percent: 20 } },
      { name: "D", support: { percent: 3 }, ideology: "green", goals: ["Rail investment"] },
      { name: "E", support: { percent: 2 } },
    ],
  }, { minSlicePercent: 4, maxNamedSlices: 4 });

  const other = out.slices.find((party) => party.id === "__other__");
  assert.equal(other.support, 15);
  assert.deepEqual(other.members.map((party) => party.name), ["D", "E"]);
  assert.equal(other.members[0].ideology[0], "green");
  assert.equal(other.members[0].goals[0], "Rail investment");
});

test("presentation helper whitelists public party fields instead of leaking hidden internals", () => {
  const out = buildPoliticalPartyLandscape({
    parties: [{
      id: "x",
      name: "Example Party",
      shortName: "EXP",
      support: { percent: 55 },
      ideology: "centrist",
      publicPriorities: ["Housing"],
      publicForeignPolicy: ["Regional cooperation"],
      publicDescription: "A public-facing description.",
      secretAmbition: "Annex neighbour",
      internalRadicalization: 91,
    }],
  });

  const party = out.parties[0];
  assert.equal(party.name, "Example Party");
  assert.equal(party.publicPriorities[0], "Housing");
  assert.equal("secretAmbition" in party, false);
  assert.equal("internalRadicalization" in party, false);
});
