import test from "node:test";
import assert from "node:assert/strict";

import { advancePoliticalBackgroundKernel } from "./politicalBackgroundKernel.js";
import { normalizePoliticalActors } from "./politicalActors.js";

const actorsByPolity = normalizePoliticalActors({
  byPolity: {
    A: {
      polityKey: "A",
      politicalSystem: { type: "parliamentary_republic", representation: "electoral" },
      government: { form: "Republic", rulingPartyIds: ["gov"] },
      parties: [
        { id: "gov", name: "Government", support: { percent: 55 }, politicalResponse: { issues: { security: { position: -70, sensitivity: 100 } } } },
        { id: "opp", name: "Opposition", support: { percent: 35 }, politicalResponse: { issues: { security: { position: 80, sensitivity: 100 } } } },
      ],
    },
  },
}).byPolity;

test("background kernel performs repeated response ticks on detached worker state and returns final canonical ops only", () => {
  const result = advancePoliticalBackgroundKernel({
    actorsByPolity,
    signalsByPolity: {
      A: [{ issue: "security", salience: 60, strain: 40, lean: 90, persistence: 0.85 }],
    },
    months: 6,
    updatedAt: "2014-09-22",
    round: 4,
    responseTicks: 6,
  });

  assert.equal(result.pressureChangedPolities, 1);
  assert.ok(result.responseChangedEntities > result.responseOperations.length);
  assert.ok(result.responseOperations.length <= 2);
  assert.ok(result.responseOperations.every((op) => ["set-party-support", "set-power-bloc-influence"].includes(op.op)));
  assert.equal(result.dispositionOperations.length, 1);
  assert.equal(result.dispositionOperations[0].op, "set-behavioral-disposition");
  assert.equal(actorsByPolity.A.politicalPressures, undefined);
});

test("background kernel is deterministic for identical canonical input", () => {
  const payload = {
    actorsByPolity,
    signalsByPolity: { A: [{ issue: "security", salience: 45, strain: 25, lean: 80, persistence: 0.82 }] },
    months: 3,
    updatedAt: "2014-06-22",
    round: 3,
    responseTicks: 3,
  };
  assert.deepEqual(advancePoliticalBackgroundKernel(payload), advancePoliticalBackgroundKernel(payload));
});
