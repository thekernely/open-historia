/*! Open Historia — Wars and Fronts Pt.2 service commitment integration regressions © 2026. */
import test from "node:test";
import assert from "node:assert/strict";
import { runFronts } from "./engine.js";
import { frontInput, syntheticMap } from "./syntheticMap.js";
import { withFrontPersonnel, normalizeFrontPersonnel } from "./personnelReserve.js";

const terrain = syntheticMap({
  layout: ["AAAABBBB", "AAAABBBB", "AAAABBBB", "AAAABBBB", "AAAABBBB", "AAAABBBB"],
  legend: { A: "Aland", B: "Borduria", "~": null }, west: 20, north: 53, step: 1, stepLat: 0.5, key: "service-regression",
});
const peopleOf = (name) => ({ Aland: 300000, Borduria: 300000 })[name] || 0;
const census = { Aland: { population: { total: 300000 } }, Borduria: { population: { total: 300000 } } };
const worldOf = (state, battles = []) => ({ countryStats: structuredClone(census), frontPersonnel: state, battlefields: battles });
const fight = (opts = {}) => runFronts(frontInput(terrain, { days: 30, peopleOf,
  moments: [{ day: 0, type: "order", battlefield: "The front", side: "Aland", order: "advance", sector: "all" }], ...opts }));

test("a full period of frontline recruitment cannot reduce resident population", () => {
  const first = fight();
  assert.ok(first.manpower.some((row) => row.drawn > 0));
  assert.ok(first.personnel.some((row) => row.unavailable > 0), "losses are military commitments, not census deaths");
  const next = withFrontPersonnel(worldOf({}), first);
  assert.deepEqual(next.countryStats, census);
  assert.ok(next.frontPersonnel.Aland?.unavailable > 0);
  assert.deepEqual(normalizeFrontPersonnel(structuredClone(next.frontPersonnel)), next.frontPersonnel);
});

test("save/reload and replay preserve military service limits without double-committing", () => {
  const first = fight();
  const saved = withFrontPersonnel(worldOf({}), first);
  const resumed = {
    days: 10, moments: [], peopleOf,
    fromDate: "2024-03-31", battlefields: first.battlefields,
    frontPersonnel: structuredClone(saved.frontPersonnel),
  };
  const second = fight(resumed);
  const twice = fight(resumed);
  assert.deepEqual(second.personnel, twice.personnel, "replayed native simulation is deterministic");
  assert.deepEqual(second.manpower, twice.manpower);
  const committed = withFrontPersonnel(saved, second);
  assert.deepEqual(committed.countryStats, census);
  assert.deepEqual(withFrontPersonnel(saved, twice).frontPersonnel, committed.frontPersonnel);
  assert.ok(committed.frontPersonnel.Aland.unavailable >= saved.frontPersonnel.Aland.unavailable,
    "service losses remain reserved while the front is active");
});

test("an older identified unresolved dispatch cannot disappear on a quiet turn", () => {
  const receipt = { id: "hit2:d1:1", transportId: "ship-1", dispatchId: "d1", date: "2024-03-01", people: 200 };
  const older = { Aland: { unresolved: 200, incidents: [receipt] } };
  const first = fight({ days: 0, frontPersonnel: older });
  const stored = withFrontPersonnel(worldOf(older), first);
  assert.equal(stored.frontPersonnel.Aland.unresolved, 200);
  assert.deepEqual(stored.frontPersonnel.Aland.incidents, [receipt]);
});

test("modern military counter sizes and share limits remain effective with a saved reserve", () => {
  const small = fight({ days: 0, mechanics: { military: true },
    militaryOf: (name) => (name === "Aland" ? { manpowerShare: 20, menPerCounter: 500 } : null),
    frontPersonnel: { Aland: { unavailable: 59000 } },
  });
  const born = small.manpower.find((r) => r.name === "Aland")?.drawn ?? 0;
  assert.ok(born <= 1000, `only 1,000 men of the 20% reserve remain: ${born}`);
});
