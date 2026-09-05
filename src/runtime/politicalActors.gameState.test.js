import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCountryStatPatchToWorld,
  applyEventImpactsToWorld,
  normalizeWorldState,
} from "./gameState.js";
import { getPoliticalProfile } from "./politicalActors.js";

const actorWorld = () => ({
  polityOverrides: {
    "Republic of Poland": {
      name: "Republic of Poland",
      aliases: ["Poland"],
      status: "active",
    },
  },
  politicalActors: {
    schemaVersion: 1,
    byPolity: {
      "Republic of Poland": {
        polityKey: "Republic of Poland",
        leader: "Bronisław Komorowski",
        government: {
          form: "Parliamentary republic",
          headOfState: "Bronisław Komorowski",
        },
      },
    },
  },
});

test("normalizeWorldState preserves Political Actors as an owned copy", () => {
  const source = actorWorld();
  const normalized = normalizeWorldState(source);

  normalized.politicalActors.byPolity["Republic of Poland"].leader = "Changed";
  assert.equal(source.politicalActors.byPolity["Republic of Poland"].leader, "Bronisław Komorowski");
});

test("an explicit event leader/government change mirrors into Political Actors", () => {
  const { world } = applyEventImpactsToWorld({
    world: actorWorld(),
    events: [{
      date: "2015-08-06",
      title: "Presidential transition",
      description: "A constitutional transfer of office.",
      impacts: {
        polityChanges: [{
          code: "Republic of Poland",
          stats: {
            leader: "Test President",
            government: "Presidential republic",
          },
        }],
      },
    }],
  });

  const actor = getPoliticalProfile(world, "Poland");
  assert.equal(actor?.leader, "Test President");
  assert.equal(actor?.government?.headOfState, "Test President");
  assert.equal(actor?.government?.form, "Presidential republic");
});

test("ordinary Stats patches do not rewrite Political Actors", () => {
  const world = normalizeWorldState(actorWorld());
  applyCountryStatPatchToWorld(world, "Republic of Poland", {
    leader: "AI-guessed leader",
    government: "AI-guessed government",
  });

  const actor = getPoliticalProfile(world, "Republic of Poland");
  assert.equal(actor?.leader, "Bronisław Komorowski");
  assert.equal(actor?.government?.form, "Parliamentary republic");
});
