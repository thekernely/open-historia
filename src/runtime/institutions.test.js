import assert from "node:assert/strict";
import test from "node:test";

import {
  applyInstitutionUpdates,
  institutionMembershipBadge,
  institutionsForPolity,
} from "./institutions.js";

const world = {
  polityOverrides: {
    Poland: { name: "Republic of Poland", aliases: ["Poland"], status: "active" },
    Latvia: { name: "Republic of Latvia", aliases: ["Latvia"], status: "active" },
  },
  institutions: { schemaVersion: 1, ledgerVersion: 0, byId: {} },
};

const events = [
  { id: "e1", date: "2014-03-22", title: "Alliance founded" },
  { id: "e2", date: "2015-01-10", title: "Latvia joins" },
  { id: "e3", date: "2016-02-20", title: "Poland becomes leader" },
  { id: "e4", date: "2017-03-30", title: "Latvia leaves" },
];

test("formal institutions are canonical mutable membership state", () => {
  const created = applyInstitutionUpdates({
    world,
    events,
    stopDate: "2014-03-22",
    round: 1,
    updates: [
      { id: "lublin-defense-pact", op: "create", name: "Lublin Defense Pact", kind: "defense_pact", eventIds: ["e1"] },
      { id: "lublin-defense-pact", op: "join", polity: "Poland", status: "member", role: "member", eventIds: ["e1"] },
    ],
  });
  assert.equal(created.error, "");
  assert.equal(institutionsForPolity(created.world, "Poland").length, 1);

  const joined = applyInstitutionUpdates({
    world: created.world,
    events,
    stopDate: "2015-01-10",
    round: 2,
    updates: [{ id: "lublin-defense-pact", op: "join", polity: "Latvia", status: "member", role: "member", eventIds: ["e2"] }],
  });
  assert.equal(joined.error, "");
  assert.equal(institutionsForPolity(joined.world, "Latvia")[0].member.status, "member");

  const promoted = applyInstitutionUpdates({
    world: joined.world,
    events,
    stopDate: "2016-02-20",
    round: 3,
    updates: [{ id: "lublin-defense-pact", op: "role", polity: "Poland", role: "leader", eventIds: ["e3"] }],
  });
  const polish = institutionsForPolity(promoted.world, "Republic of Poland")[0];
  assert.equal(polish.member.role, "leader");

  const left = applyInstitutionUpdates({
    world: promoted.world,
    events,
    stopDate: "2017-03-30",
    round: 4,
    updates: [{ id: "lublin-defense-pact", op: "leave", polity: "Latvia", eventIds: ["e4"] }],
  });
  assert.equal(institutionsForPolity(left.world, "Latvia").length, 0);
});

test("membership badges distinguish formal status rather than fuzzy alignment", () => {
  assert.equal(institutionMembershipBadge({ id: "nato", name: "NATO" }, { status: "member" }), "nato-member");
  assert.equal(institutionMembershipBadge({ id: "european-union", name: "European Union" }, { status: "candidate" }), "eu-candidate");
  assert.equal(institutionMembershipBadge({ id: "csto", name: "CSTO" }, { status: "suspended" }), "csto-suspended");
});

test("generated Round-Zero baselines cannot project known institutions backward in time", () => {
  const generated1911 = applyInstitutionUpdates({
    world,
    updates: [
      { id: "nato", op: "create", name: "NATO", kind: "security_alliance", foundedDate: "1900-01-01" },
      { id: "nato", op: "join", polity: "Poland", status: "member", role: "member", sinceDate: "1900-01-01" },
    ],
    events: [],
    stopDate: "1911-06-01",
    round: 0,
    allowUnboundBaseline: true,
    enforceTemporalBaseline: true,
  });
  assert.match(generated1911.error, /not founded until 1949-04-04/i);
  assert.equal(generated1911.world.institutions.byId.nato, undefined);

  const generated1960 = applyInstitutionUpdates({
    world,
    updates: [
      { id: "nato", op: "create", name: "NATO", kind: "security_alliance", foundedDate: "1949-04-04" },
    ],
    events: [],
    stopDate: "1960-06-01",
    round: 0,
    allowUnboundBaseline: true,
    enforceTemporalBaseline: true,
  });
  assert.equal(generated1960.error, "");
  assert.equal(generated1960.world.institutions.byId.nato.foundedDate, "1949-04-04");
});

test("structured scenario-authored institutions outrank real-history temporal guards", () => {
  const alternateWorld = {
    ...world,
    institutions: {
      schemaVersion: 1,
      ledgerVersion: 1,
      byId: {
        nato: {
          id: "nato",
          name: "North Atlantic Treaty Organization",
          kind: "security_alliance",
          status: "active",
          foundedDate: "1905-01-01",
          members: [],
        },
      },
    },
  };
  const joined = applyInstitutionUpdates({
    world: alternateWorld,
    updates: [{ id: "nato", op: "join", polity: "Latvia", status: "member", role: "member", sinceDate: "1906-01-01" }],
    events: [],
    stopDate: "1911-06-01",
    round: 0,
    allowUnboundBaseline: true,
    enforceTemporalBaseline: true,
  });
  assert.equal(joined.error, "");
  assert.equal(institutionsForPolity(joined.world, "Latvia")[0].institution.foundedDate, "1905-01-01");
});

test("generated institution membership dates cannot begin after the scenario date", () => {
  const result = applyInstitutionUpdates({
    world,
    updates: [
      { id: "historical-league", op: "create", name: "Historical League", kind: "regional_bloc", foundedDate: "1900-01-01" },
      { id: "historical-league", op: "join", polity: "Poland", status: "member", role: "member", sinceDate: "1915-01-01" },
    ],
    events: [],
    stopDate: "1911-06-01",
    round: 0,
    allowUnboundBaseline: true,
    enforceTemporalBaseline: true,
  });
  assert.match(result.error, /membership date 1915-01-01/i);
});
