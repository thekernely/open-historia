/*! Open Historia - finite scenario-owned, two-polity migration settlement.
 * The plan is an explicit starting assumption, not a generated migration rate.
 * Every credited resident must leave one canonical account and enter another
 * within the same detached turn mutation. Never treat military reservations,
 * territorial conquest, or war narration as an inferred migrant movement.
 */
import { compareGameDates, diffGameDays, isCanonicalGameDate } from "./gameDates.js";
import { collectActiveScenarioPolityKeys } from "./scenarioPolities.js";
import { mergeCountryStatPatch, normalizeCountryStatSheet, scaleComponentPopulationExact } from "./countryStats.js";
import { normalizeFrontPersonnel } from "./fronts/personnelReserve.js";

export const MAX_NATIVE_MIGRATION_FLOWS = 32;
const MAX_DAYS = 1461;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = (message) => { throw new Error(`Native migration: ${message}`); };
const validName = (name) => typeof name === "string" && name.trim() === name && name.length > 0 && name.length <= 128;

// The same historical receipt cursor must be equally valid after save/reload
// and after any partition of a turn. Invalid plans are never normalized into
// plausible-looking zeros or silently ignored.
export const validateNativeMigrationPlans = (world) => {
  if (!own(world ?? {}, "migrationFlows")) return [];
  if (!Array.isArray(world.migrationFlows) || world.migrationFlows.length > MAX_NATIVE_MIGRATION_FLOWS) {
    fail("malformed or excessive scenario plans");
  }
  const active = new Set(collectActiveScenarioPolityKeys(world));
  const known = new Set();
  for (const entry of world.migrationFlows) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || !validName(entry.id) || known.has(entry.id)
      || !validName(entry.fromPolity) || !validName(entry.toPolity)
      || entry.fromPolity === entry.toPolity || !active.has(entry.fromPolity) || !active.has(entry.toPolity)
      || ![entry.sourceDate, entry.endDate, entry.lastDate].every(isCanonicalGameDate)) fail("invalid identity, polity or date");
    known.add(entry.id);
    const duration = diffGameDays(entry.sourceDate, entry.endDate);
    const elapsed = diffGameDays(entry.sourceDate, entry.lastDate);
    if (!(duration >= 1 && duration <= MAX_DAYS) || elapsed < 0 || elapsed > duration
      || !Number.isSafeInteger(entry.baseSourcePopulation) || entry.baseSourcePopulation <= 0
      || !Number.isSafeInteger(entry.baseDestinationPopulation) || entry.baseDestinationPopulation <= 0
      || !Number.isSafeInteger(entry.totalPeople) || entry.totalPeople <= 0
      || entry.totalPeople > Math.floor(entry.baseSourcePopulation * 0.2)
      || !Number.isSafeInteger(entry.creditedPeople)
      || entry.creditedPeople !== Math.round(entry.totalPeople * elapsed / duration)
      || typeof entry.reason !== "string" || entry.reason.trim().length < 1 || entry.reason.length > 480) {
      fail(`invalid bounded receipt or plan for ${entry.id}`);
    }
    for (const key of [entry.fromPolity, entry.toPolity]) {
      const sheet = normalizeCountryStatSheet(world.countryStats?.[key]);
      if (!(sheet?.population?.total > 0) || !sheet.territorialComponents?.length
        || !(sheet.economy?.gdp > 0)
        || sheet.territorialComponents.reduce((sum, row) => sum + row.population, 0) !== sheet.population.total) {
        fail(`missing canonical territorial ledger for ${entry.id}`);
      }
    }
  }
  return world.migrationFlows;
};

// An exported flow is anchored to the two original accounts on its first
// settlement. Subsequent turns may contain legitimate births, deaths, GDP
// changes, and other migrations: do not compare against the old population
// again after the first correctly credited interval.
export const advanceNativeMigrationFlows = (world, { baselineWorld = world, fromDate = "", toDate = "" } = {}) => {
  if (!(diffGameDays(fromDate, toDate) > 0)) return world;
  const flows = validateNativeMigrationPlans(world);
  if (!flows.length) return world;
  const updates = new Map();
  const populationDeltas = new Map();
  const reserved = normalizeFrontPersonnel(world.frontPersonnel);
  for (const polity of new Set(flows.flatMap((flow) => [flow.fromPolity, flow.toPolity]))) {
    // A malformed personnel row must not become an imaginary zero reserve.
    if (own(world.frontPersonnel || {}, polity) && !own(reserved, polity)) {
      fail(`invalid military reserve for ${polity}`);
    }
  }
  for (const entry of flows) {
    if (compareGameDates(entry.lastDate, entry.endDate) === 0) continue;
    if (compareGameDates(entry.sourceDate, toDate) >= 0) continue;
    if (compareGameDates(entry.lastDate, fromDate) !== 0) {
      fail(`out-of-sequence settlement cursor for ${entry.id}`);
    }
    // The first settlement can begin only on the plan's authored start day;
    // earlier periods must be partitioned at that day by the turn planner.
    if (entry.lastDate === entry.sourceDate) {
      if (entry.sourceDate !== fromDate) fail(`unanchored first interval for ${entry.id}`);
      const first = baselineWorld.countryStats || {};
      if (normalizeCountryStatSheet(first[entry.fromPolity])?.population?.total !== entry.baseSourcePopulation
        || normalizeCountryStatSheet(first[entry.toPolity])?.population?.total !== entry.baseDestinationPopulation) {
        fail(`starting population differs from scenario plan ${entry.id}`);
      }
    }
    const until = compareGameDates(toDate, entry.endDate) > 0 ? entry.endDate : toDate;
    const duration = diffGameDays(entry.sourceDate, entry.endDate);
    const target = Math.round(entry.totalPeople * diffGameDays(entry.sourceDate, until) / duration);
    const movement = target - entry.creditedPeople;
    if (movement < 0 || !Number.isSafeInteger(movement)) fail(`nonmonotonic receipt ${entry.id}`);
    if (movement > 0) {
      populationDeltas.set(entry.fromPolity, (populationDeltas.get(entry.fromPolity) || 0) - movement);
      populationDeltas.set(entry.toPolity, (populationDeltas.get(entry.toPolity) || 0) + movement);
    }
    updates.set(entry.id, { ...entry, lastDate: until, creditedPeople: target });
  }
  if (!updates.size) return world;
  if ([...populationDeltas.values()].reduce((sum, value) => sum + value, 0) !== 0) fail("unbalanced resident movement");
  const nextStats = { ...world.countryStats };
  for (const [polity, delta] of populationDeltas) {
    if (!delta) continue;
    const before = normalizeCountryStatSheet(world.countryStats[polity]);
    const total = before.population.total + delta;
    const reserve = (reserved[polity]?.unavailable || 0) + (reserved[polity]?.unresolved || 0);
    if (!Number.isSafeInteger(total) || total <= 0 || total < reserve) fail(`resident or service reserve overdraw for ${polity}`);
    const scaled = scaleComponentPopulationExact(before.territorialComponents, () => true, total);
    if (scaled.error) fail(`unallocatable resident movement for ${polity}`);
    const after = mergeCountryStatPatch(before, {
      territorialComponents: scaled.components,
      economy: { gdp: before.economy.gdp },
    }, { replaceComponents: true, maxAggregateRescale: 10 });
    // Existing territorial per-capita precision is finite. Keep its explicit
    // tolerance rather than claiming perfect GDP conservation from rounding.
    if (after?.population?.total !== total || !after?.territorialComponents?.length
      || Math.abs(after.economy.gdp - before.economy.gdp) > Math.max(1, before.economy.gdp * 0.000002)) {
      fail(`failed national component reconciliation for ${polity}`);
    }
    nextStats[polity] = after;
  }
  // Publish all national transfers and all flow cursors together, only after
  // every participant has passed structural, conservation and reserve checks.
  return { ...world, countryStats: nextStats,
    migrationFlows: flows.map((flow) => updates.get(flow.id) || flow) };
};
