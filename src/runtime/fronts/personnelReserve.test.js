/*! Open Historia - resident-population-safe multi-turn frontline reserve tests. */
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFrontPersonnel, withFrontPersonnel } from "./personnelReserve.js";
import { renamePolityInWorld } from "../../../server/polityRename.js";

test("the reserve has a sparse bounded canonical shape", () => {
  assert.deepEqual(normalizeFrontPersonnel({ Germany: { unavailable: 20000 }, Elsewhere: { unavailable: 0 }, Invalid: { unavailable: -10 } }),
    { Germany: { unavailable: 20000 } });
  assert.deepEqual(normalizeFrontPersonnel({ A: { unavailable: Infinity }, B: { unavailable: "500" }, C: { unavailable: 1.5 } }), {});
  assert.deepEqual(normalizeFrontPersonnel(null), {});
});

test("only a successful frontline result updates its reservation", () => {
  const base = { countryStats: { Germany: { population: { total: 60000000 } } }, frontPersonnel: { Germany: { unavailable: 12000 } } };
  assert.equal(withFrontPersonnel(base, null), base);
  assert.equal(withFrontPersonnel(base, { personnel: null }), base);
  assert.deepEqual(withFrontPersonnel(base, { personnel: [{ name: "Germany", unavailable: 13000 }] }).frontPersonnel, { Germany: { unavailable: 13000 } });
  const retired = withFrontPersonnel(base, { personnel: [] });
  assert.deepEqual(retired.frontPersonnel, {});
  assert.equal(retired.countryStats.Germany.population.total, 60000000);
  assert.deepEqual(base.frontPersonnel, { Germany: { unavailable: 12000 } }, "the old world is unchanged");
});

test("a canonical polity rename rekeys frontline reserve state with its other ledgers", () => {
  const world = { polityOverrides: { Prussia: { name: "Prussia", code: "Prussia" } },
    frontPersonnel: { Prussia: { unavailable: 18000 } } };
  const changed = renamePolityInWorld(world, "Prussia", "Germany").world;
  assert.deepEqual(changed.frontPersonnel, { Germany: { unavailable: 18000 } });
  assert.deepEqual(world.frontPersonnel, { Prussia: { unavailable: 18000 } });
});
test("normalized world preserves distinct operational and unresolved personnel", () => {
  const input = { Germany: { unavailable: 20000, unresolved: 5000 }, France: { unresolved: 12000 },
    Ghost: { unresolved: 0 }, Invalid: { unavailable: 1, unresolved: "unbounded" } };
  assert.deepEqual(normalizeFrontPersonnel(input), { Germany: { unavailable: 20000, unresolved: 5000 }, France: { unresolved: 12000 } });
  const base = { frontPersonnel: { Germany: { unavailable: 20000, unresolved: 5000 } },
    countryStats: { Germany: { population: { total: 60000000 } } } };
  const changed = withFrontPersonnel(base, { personnel: [{ name: "Germany", unavailable: 0, unresolved: 5000 }] });
  assert.deepEqual(changed.frontPersonnel, { Germany: { unresolved: 5000 } });
  assert.equal(changed.countryStats.Germany.population.total, 60000000);
  assert.deepEqual(base.frontPersonnel.Germany, { unavailable: 20000, unresolved: 5000 });
  assert.deepEqual(withFrontPersonnel(changed, { personnel: [{ name: "Germany", unavailable: 0, unresolved: 5000 }] }).frontPersonnel, changed.frontPersonnel);
});

test("malformed or duplicated personnel reports cannot silently erase the last trusted ledger", () => {
  const base = { frontPersonnel: { Germany: { unavailable: 20000, unresolved: 5000 } } };
  for (const bad of [
    [{ name: "Germany", unavailable: "0", unresolved: 5000 }],
    [{ name: "Germany", unavailable: 0, unresolved: -4 }],
    [{ name: "Germany", unavailable: 0, unresolved: 5000 }, { name: "germany", unavailable: 0, unresolved: 2000 }],
    [{ name: "", unavailable: 1000 }],
    [{ name: "Germany", unavailable: 20000000001 }],
  ]) assert.equal(withFrontPersonnel(base, { personnel: bad }), base);
});

test("polity rename retains both reserved and unresolved accounts", () => {
  const world = { polityOverrides: { Prussia: { name: "Prussia", code: "Prussia" } },
    frontPersonnel: { Prussia: { unavailable: 18000, unresolved: 4000 } } };
  const renamed = renamePolityInWorld(world, "Prussia", "Germany").world;
  assert.deepEqual(renamed.frontPersonnel, { Germany: { unavailable: 18000, unresolved: 4000 } });
});

test("a native front report cannot mint personnel for an explicitly dissolved polity", () => {
  const base = { polityOverrides: { Alpha: { status: "dissolved" } },
    frontPersonnel: { Alpha: { unresolved: 2000 } } };
  assert.deepEqual(withFrontPersonnel(base, { personnel: [{ name: "Alpha", unavailable: 0, unresolved: 5000 }] }).frontPersonnel, {});
  assert.deepEqual(base.frontPersonnel, { Alpha: { unresolved: 2000 } });
});

test("stable intercepted-transport incidents keep provenance without inventing mortality", () => {
  const incident = { id: "hit:123abc", transportId: "t1", date: "2024-03-03", people: 10000 };
  const row = { unavailable: 5000, unresolved: 25000, incidents: [incident] };
  assert.deepEqual(normalizeFrontPersonnel({ Aland: row }), { Aland: row });
  assert.deepEqual(normalizeFrontPersonnel({ Aland: { unresolved: 25000 } }), { Aland: { unresolved: 25000 } },
    "pre-provenance saves keep the unassigned aggregate unchanged");
  for (const malformed of [
    { ...incident, people: 30000 },
    { ...incident, people: -1 },
    { ...incident, id: "" },
    { ...incident, transportId: "" },
    { ...incident, date: "" },
  ]) {
    assert.deepEqual(normalizeFrontPersonnel({ Aland: { unresolved: 25000, incidents: [malformed] } }), {});
  }
  assert.deepEqual(normalizeFrontPersonnel({ Aland: { unresolved: 25000, incidents: [incident, incident] } }), {},
    "a single interception is not two cases");
});

test("malformed provenance cannot replace a saved accepted reserve", () => {
  const previous = { Germany: { unresolved: 10000, incidents: [{ id: "hit:1", transportId: "t1", date: "2024-03-01", people: 10000 }] } };
  const world = { frontPersonnel: previous, countryStats: { Germany: { population: { total: 60000000 } } } };
  assert.equal(withFrontPersonnel(world, { personnel: [{ name: "Germany", unavailable: 0, unresolved: 10000,
    incidents: [{ id: "hit:2", transportId: "t2", date: "2024-03-02", people: 12000 }] }] }), world);
  const valid = withFrontPersonnel(world, { personnel: [{ name: "Germany", unavailable: 0, unresolved: 10000,
    incidents: [{ id: "hit:1", transportId: "t1", date: "2024-03-01", people: 10000 }] }] });
  assert.deepEqual(valid.frontPersonnel, previous);
  assert.equal(valid.countryStats.Germany.population.total, 60000000);
});

test("canonical rename preserves per-incident identity and remains bounded", () => {
  const incidents = [{ id: "hit:abc", transportId: "t4", date: "2024-03-05", people: 3000 }];
  const world = { polityOverrides: { Prussia: { name: "Prussia", code: "Prussia" } },
    frontPersonnel: { Prussia: { unavailable: 8000, unresolved: 5000, incidents } } };
  const renamed = renamePolityInWorld(world, "Prussia", "Germany").world;
  assert.deepEqual(renamed.frontPersonnel.Germany, { unavailable: 8000, unresolved: 5000, incidents });
  assert.equal(Object.hasOwn(renamed.frontPersonnel, "Prussia"), false);
  assert.deepEqual(world.frontPersonnel.Prussia.incidents, incidents);
});


test("v2 interception provenance binds immutable dispatch lineage and hit ordinal", () => {
  const strong = { id: "hit2:d72:3", dispatchId: "d72", transportId: "t1", date: "2024-03-03", people: 6000 };
  const legacy = { id: "hit:abcd", transportId: "t1", date: "2024-03-01", people: 2000 };
  assert.deepEqual(normalizeFrontPersonnel({ Aland: { unresolved: 8000, incidents: [legacy, strong] } }),
    { Aland: { unresolved: 8000, incidents: [legacy, strong] } });
  for (const incident of [
    { ...strong, id: "hit2:d71:3" }, { ...strong, id: "hit2:d72:0" },
    { ...strong, dispatchId: "d71" }, { ...strong, dispatchId: "anything" },
    { id: "hit2:d72:3", transportId: "t1", date: "2024-03-03", people: 6000 },
  ]) assert.deepEqual(normalizeFrontPersonnel({ Aland: { unresolved: 6000, incidents: [incident] } }), {});
});

// The native front report is an absolute snapshot, NOT an authority to settle
// personnel. Existing unresolved losses and strong-case settlement receipts
// must survive it unchanged. Only a late, accepted disposition can release them.
test("front reports cannot shrink already accepted unresolved losses", () => {
  const world = { frontPersonnel: { Aland: { unavailable: 3000, unresolved: 5000 } } };
  for (const report of [
    [{ name: "Aland", unavailable: 0, unresolved: 4000 }],
    [{ name: "Aland", unavailable: 0 }],
    [],
  ]) assert.equal(withFrontPersonnel(world, { personnel: report }), world);
  const good = withFrontPersonnel(world, { personnel: [{ name: "Aland", unavailable: 0, unresolved: 6000 }] });
  assert.deepEqual(good.frontPersonnel, { Aland: { unresolved: 6000 } });
  assert.equal(good.frontPersonnel.Aland.unavailable, undefined, "normal demobilization is still legal");
});

test("front reports cannot discard or rewrite live identified case evidence", () => {
  const incident = { id: "hit2:d19:2", dispatchId: "d19", transportId: "t2", date: "2024-03-01",
    people: 5000, remaining: 3500, returns: [{ eventId: "accepted-return-1", people: 1500 }] };
  const source = { frontPersonnel: { Aland: { unresolved: 7000, unavailable: 1200, incidents: [incident] } },
    countryStats: { Aland: { population: { total: 10000000 } } } };
  for (const incidents of [
    [],
    [{ ...incident, people: 6000, remaining: 4500 }],
    [{ ...incident, remaining: 5000, returns: undefined }],
    [{ ...incident, date: "2024-03-02" }],
  ]) assert.equal(withFrontPersonnel(source, { personnel: [
    { name: "Aland", unavailable: 0, unresolved: 8000, incidents },
  ] }), source, "an absolute report cannot rewrite established case evidence");
  const newIncident = { id: "hit2:d20:1", dispatchId: "d20", transportId: "t2", date: "2024-04-01", people: 2000 };
  const accepted = withFrontPersonnel(source, { personnel: [
    { name: "Aland", unavailable: 0, unresolved: 9000, incidents: [incident, newIncident] },
  ] });
  assert.deepEqual(accepted.frontPersonnel.Aland.incidents, [incident, newIncident]);
  assert.equal(accepted.frontPersonnel.Aland.unresolved, 9000);
  assert.equal(accepted.countryStats.Aland.population.total, 10000000);
  assert.deepEqual(source.frontPersonnel.Aland.incidents, [incident], "failed and successful reports leave old world untouched");
});

test("dissolution may retire a polity's entire personnel state", () => {
  const base = { polityOverrides: { Aland: { status: "dissolved" } },
    frontPersonnel: { Aland: { unresolved: 5000,
      incidents: [{ id: "hit2:d19:2", dispatchId: "d19", transportId: "t2", date: "2024-03-01", people: 5000 }] } } };
  const result = withFrontPersonnel(base, { personnel: [] });
  assert.deepEqual(result.frontPersonnel, {});
});

test("front reports reject a durable interception case assigned to two different polities", () => {
  const incident = { id: "hit2:d27:1", dispatchId: "d27", transportId: "t2", date: "2024-04-01", people: 1000 };
  const source = { frontPersonnel: { Prussia: { unresolved: 1000, incidents: [incident] } } };
  const duplicated = { personnel: [
    { name: "Prussia", unavailable: 0, unresolved: 1000, incidents: [incident] },
    { name: "France", unavailable: 0, unresolved: 1000, incidents: [incident] },
  ] };
  assert.equal(withFrontPersonnel(source, duplicated), source);
  const valid = { personnel: [
    { name: "Prussia", unavailable: 0, unresolved: 1000, incidents: [incident] },
    { name: "France", unavailable: 0, unresolved: 1000, incidents: [
      { ...incident, id: "hit2:d28:1", dispatchId: "d28" },
    ] },
  ] };
  assert.deepEqual(Object.keys(withFrontPersonnel(source, valid).frontPersonnel), ["Prussia", "France"]);
});
