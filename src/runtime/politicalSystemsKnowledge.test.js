import test from "node:test";
import assert from "node:assert/strict";

import { buildPublicPoliticalView } from "./politicalKnowledge.js";
import { normalizePoliticalActors } from "./politicalActors.js";

test("public knowledge exposes regime structure and bounded power-bloc facts without hidden internals", () => {
  const world = {
    politicalActors: normalizePoliticalActors({
      byPolity: {
        Kingdom: {
          polityKey: "Kingdom",
          government: { form: "Absolute monarchy", headOfState: "King A" },
          politicalSystem: {
            type: "absolute_monarchy",
            representation: "court_factions",
            notes: "Private succession concern",
          },
          powerBlocs: [{
            id: "court",
            name: "Royal Court",
            aliases: ["Palace"],
            kind: "dynastic",
            status: "Dominant",
            influence: { percent: 42, label: "Dominant" },
            publicDescription: "The sovereign's immediate court and dynastic network.",
            internalStrategy: "Block the reform faction",
            privateGoal: "Control the succession",
          }],
        },
      },
    }),
  };

  const view = buildPublicPoliticalView(world, "Kingdom");
  assert.equal(view.politicalSystem.type, "absolute_monarchy");
  assert.equal(view.politicalSystem.representation, "court_factions");
  assert.equal("notes" in view.politicalSystem, false);
  assert.equal(view.powerBlocs[0].name, "Royal Court");
  assert.equal(view.powerBlocs[0].influence.percent, 42);
  assert.equal(view.powerBlocs[0].influence.label, "Dominant");
  assert.equal("internalStrategy" in view.powerBlocs[0], false);
  assert.equal("privateGoal" in view.powerBlocs[0], false);
  assert.equal("aliases" in view.powerBlocs[0], false);
  assert.equal("parties" in view, false);
});
