import test from "node:test";
import assert from "node:assert/strict";

import { buildGovernmentPartyPresentation } from "./politicalPresentation.js";

test("player-facing government presentation lists governing parties and ignores coalition ceremonial names", () => {
  const profile = {
    government: {
      rulingPartyIds: ["batkivshchyna"],
      coalitionPartyIds: ["udar", "svoboda"],
      coalitionName: "Європейський вибір",
    },
    parties: [
      { id: "batkivshchyna", name: "Батьківщина" },
      { id: "udar", name: "УДАР" },
      { id: "svoboda", name: "Свобода" },
    ],
  };

  const view = buildGovernmentPartyPresentation(profile);
  assert.equal(view.label, "Governing coalition");
  assert.deepEqual(view.names, ["Батьківщина", "УДАР", "Свобода"]);
  assert.equal(view.names.includes("Європейський вибір"), false);
});

test("single-party governments remain a simple Government label", () => {
  const view = buildGovernmentPartyPresentation({
    government: { rulingPartyIds: ["united-russia"] },
    parties: [{ id: "united-russia", name: "Единая Россия" }],
  });
  assert.equal(view.label, "Government");
  assert.deepEqual(view.names, ["Единая Россия"]);
});
