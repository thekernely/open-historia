/*! Open Historia - deterministic turn-level review of country economic coverage.
 * Tests use Opossum's observed missing-assessment pattern, not preselected GDP losses.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildNationalEconomicCoverageAudit } from "./statsEconomicCoverageAudit.js";
import { buildCountryEconomicCoverage } from "./statsEconomicCoverage.js";

const date = "2127-11-02";
const source = "global-financial-collapse-2127";
const countries = ["Ferric Crownlands", "Dyke-and-Rook League", "Opossum Kingdom", "Steppe Relay Khanate", "Ringtail Civic Republic"];
const evidence = "Confirmed merchant clearinghouse defaults suspended national credit settlements across the Ferric Crownlands.";
const exposure = (polity) => ({
  polity, channel: "credit", exposure: "direct",
  evidence: polity === "Ferric Crownlands" ? evidence
    : "Documented merchant lending freeze halted port credit settlements in the Dyke-and-Rook League.",
});
const original = () => ({
  id: "collapse-2127", date: "2127-07-25", title: "Global Financial Collapse",
  description: "Clearinghouses stop merchant transactions across continental Europe.",
  storylineIds: [source], economicAccounting: {
    status: "unquantified", reason: "No accepted numerical national loss estimate.",
    exposures: [exposure("Ferric Crownlands"), exposure("Dyke-and-Rook League")],
  },
});
const positive = (polity, id, delta) => ({
  id, date: "2127-10-28", storylineIds: [source], tags: ["Economy"],
  economicAccounting: { status: "applied", reason: "Documented partial recovery of barter trade." },
  impacts: { polityChanges: [{ code: polity, statsEffects: {
    annualRealGrowthDelta: delta, durationDays: 90, gdpCause: "policy",
    sourceStorylineId: source, reason: "Positive national recovery policy enacted.",
  } }] },
});
const estimate = {
  basis: "simulation-estimate", channel: "credit", exposure: "direct", evidence,
};
const followup = (polity = "Ferric Crownlands", effect = {}) => ({
  id: "national-forecast", date: "2127-10-31", storylineIds: [source],
  impacts: { polityChanges: [{ code: polity, statsEffects: {
    sourceStorylineId: source, assessesUnquantifiedEventId: "collapse-2127",
    annualRealGrowthDelta: -3, durationDays: 30, gdpCause: "trade",
    economicShockEstimate: estimate,
    reason: "New national credit evidence supports a bounded negative influence.",
    ...effect,
  } }] },
});
const world = () => ({
  countryStats: Object.fromEntries(countries.map((name) => [name, { economy: { gdp: 1_000_000 } }])),
  storylines: [{
    id: source, startedDate: "2127-07-21", status: "active",
    sourceEventIds: ["collapse-2127", "barter-policy", "public-works", "national-forecast"],
    participants: countries,
  }],
});

test("Opossum regression: accepted positive policies do not close older documented national disruption", () => {
  const w = world();
  const events = [original(), positive("Steppe Relay Khanate", "barter-policy", 0.2),
    positive("Ringtail Civic Republic", "public-works", 0.1)];
  const before = JSON.stringify({ w, events });
  const result = buildNationalEconomicCoverageAudit({ world: w, events, date });
  assert.equal(result.status, "incomplete");
  assert.equal(result.documentedUnresolvedCount, 2);
  assert.equal(result.noNationalEvidenceCount, 3, "storyline membership is no evidence of country loss");
  assert.equal(result.assessedCount, 0);
  assert.equal(result.totalCountries, 5);
  assert.deepEqual(result.documentedUnresolved.map((row) => row.polity),
    ["Dyke-and-Rook League", "Ferric Crownlands"]);
  assert.equal(result.documentedUnresolved[0].eventId, "collapse-2127");
  assert.equal(result.noNationalEvidence[0].outcome, "no-national-evidence");
  assert.equal(JSON.stringify({ w, events }), before, "audit is read-only");
});

test("a validated country/source estimate closes only its own national exposure", () => {
  const w = world();
  const result = buildNationalEconomicCoverageAudit({
    world: w, events: [original(), followup()], date,
  });
  assert.equal(result.documentedUnresolvedCount, 1);
  assert.equal(result.assessedCount, 1);
  assert.equal(result.noNationalEvidenceCount, 3);
  assert.deepEqual(result.documentedUnresolved.map((row) => row.polity), ["Dyke-and-Rook League"]);
  assert.equal(result.status, "incomplete");
});

test("invalid or source-only assessment claims never mark documented impact as quantified", () => {
  for (const bad of [
    { economicShockEstimate: undefined },
    { annualRealGrowthDelta: 0 },
    { annualRealGrowthDelta: 10 },
    { annualRealGrowthDelta: -16 },
    { durationDays: 200 },
    { gdpCause: "policy" },
    { sourceStorylineId: "unrelated-source" },
  ]) {
    const events = [original(), followup("Ferric Crownlands", bad)];
    const result = buildNationalEconomicCoverageAudit({ world: world(), events, date });
    assert.equal(result.documentedUnresolvedCount, 2, JSON.stringify(bad));
    assert.equal(result.assessedCount, 0, JSON.stringify(bad));
  }
  const valid = [original(), followup()];
  const duplicate = buildNationalEconomicCoverageAudit({ world: world(),
    events: [valid[0], valid[1], valid[1]], date });
  assert.equal(duplicate.documentedUnresolvedCount, 2,
    "duplicate later event IDs cannot authorize closure");
});

test("no-evidence is explicitly provisional, not a completed negative-GDP estimate", () => {
  const result = buildNationalEconomicCoverageAudit({ world: world(),
    events: [{ ...original(), economicAccounting: {
      status: "unquantified", reason: "Impact unknown and no national exposure established.",
    } }], date });
  assert.equal(result.documentedUnresolvedCount, 0);
  assert.equal(result.noNationalEvidenceCount, 5);
  assert.equal(result.status, "evidence-pending");
  assert.equal(result.noNationalEvidence[0].outcome, "no-national-evidence");
  assert.equal(result.noNationalEvidence[0].assessed, false);
  assert.equal(result.noNationalEvidence[0].verifiedExposure, false);
  assert.equal(result.assessedCount, 0);
});

test("host audit counts private canonical evidence without opening the per-viewer Country Panel boundary", () => {
  const hidden = { ...original(), audience: ["Ferric Crownlands"] };
  const w = world();
  const audit = buildNationalEconomicCoverageAudit({
    world: w, events: [hidden], date,
  });
  assert.equal(audit.documentedUnresolvedCount, 2, "host audit sees all canonical evidence");
  assert.equal(buildCountryEconomicCoverage({
    world: w, events: [hidden], date, polity: "Ferric Crownlands",
    viewerPolity: "Opossum Kingdom",
  }).status, "none", "the guest must not see host-private source records");
  assert.equal(buildCountryEconomicCoverage({
    world: w, events: [hidden], date, polity: "Ferric Crownlands",
    viewerPolity: "Ferric Crownlands",
  }).status, "documented-unquantified");
});

test("audit requires authoritative date, history and country stats before claiming completion", () => {
  for (const input of [
    { world: world(), events: [original()], date: "bad" },
    { world: world(), events: null, date },
    { world: {}, events: [original()], date },
  ]) {
    const result = buildNationalEconomicCoverageAudit(input);
    assert.equal(result.status, "unavailable");
    assert.equal(result.complete, false);
  }
});

test("post-settlement jump contract audits all canonical history before recording success", () => {
  const sourceText = readFileSync(new URL("../Game/AI/gameplay.js", import.meta.url), "utf8");
  assert.match(sourceText, /buildNationalEconomicCoverageAudit\(\{\s*world: nextWorld, events: nextEvents, date: nextGame\.gameDate/);
  assert.match(sourceText, /National economic coverage audit/);
  assert.match(sourceText, /coverageAudit\.noNationalEvidenceCount > 0/,
    "legacy unquantified events lacking structured exposures must also carry forward");
  assert.match(sourceText, /withLatestApplicationReceipt\(nextWorld, receipt\)/,
    "late economic follow-up is carried into the next turn's normalized application receipt");
});
