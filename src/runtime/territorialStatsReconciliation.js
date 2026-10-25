/*! Open Historia - evidence-gated legal territorial Statistics reconciliation.
 * This module plans canonical component movements only; callers must publish
 * map sovereignty, affected Stats sheets and lifecycle changes atomically.
 */
import {
  finalizeCountryStatSheet, normalizeCountryStatSheet, normalizeTerritorialComponents,
  normalizeCountryStatDemographicClock, demographicClockCumulative,
  COUNTRY_STATS_DEMOGRAPHIC_MAX_REBASES,
} from "./countryStats.js";
import { addGameDays } from "./gameDates.js";
import { normalizeFrontPersonnel } from "./fronts/personnelReserve.js";
import { compareGameDates, isCanonicalGameDate } from "./gameDates.js";

const clean = (value) => String(value ?? "").trim();
const keyOf = (value) => clean(value).toLocaleLowerCase();

const uniquePolityKey = (stats, raw) => {
  const found = Object.keys(stats).filter((name) => keyOf(name) === keyOf(raw));
  if (found.length > 1) throw new Error(`Ambiguous canonical Statistics polity: ${raw}`);
  return found[0] || "";
};

const mappedData = (raw) => {
  const sheet = normalizeCountryStatSheet(raw);
  if (!sheet || !Array.isArray(sheet.territorialComponents)) return null;
  return sheet;
};

// One complete legal-title transaction, not an occupation or a claim. The
// region catalog is a validated map snapshot containing stable region IDs and
// original owner/name metadata. Names alone are NEVER used as region IDs.
//
// Returns null for a transaction with no affected canonical countryStats.
// Throws for incomplete/ambiguous canonical coverage rather than writing a
// border whose national resident/GDP accounting can no longer reconcile.
export const planLegalTerritorialStatsTransfers = (world, transfers, regionCatalog, {
  resolveOwner = (value) => value, effectiveDate = "", dissolvingPolities = [],
} = {}) => {
  if (!Array.isArray(transfers) || !transfers.length) return null;
  const rawStats = world?.countryStats;
  if (!rawStats || typeof rawStats !== "object" || Array.isArray(rawStats) || !Object.keys(rawStats).length) return null;
  const anyMapped = Object.values(rawStats).some((raw) => {
    const sheet = mappedData(raw);
    return sheet?.territorialComponents?.length > 0;
  });
  if (!anyMapped) return null; // legacy-only scenarios retain pre-V2 map behavior
  if (!Array.isArray(regionCatalog) || !regionCatalog.length) {
    throw new Error("Legal Statistics transfer requires the canonical region catalog");
  }
  const byId = new Map(), mapNameCounts = new Map();
  for (const row of regionCatalog) {
    const id = clean(row?.id);
    if (!id) continue;
    if (byId.has(id)) throw new Error(`Ambiguous canonical map region ID: ${id}`);
    byId.set(id, row);
    const name = keyOf(row.name);
    if (name) mapNameCounts.set(name, (mapNameCounts.get(name) || 0) + 1);
  }
  const sheets = new Map();
  const componentsByName = new Map();
  for (const [name, raw] of Object.entries(rawStats)) {
    const sheet = mappedData(raw);
    if (!sheet) continue;
    sheets.set(name, sheet);
    for (const component of sheet.territorialComponents) {
      const key = keyOf(component.geography);
      const held = componentsByName.get(key) || [];
      held.push({ owner: name, component });
      componentsByName.set(key, held);
    }
  }
  if (!sheets.size) return null;
  const touched = new Set(), staged = new Map();
  const getComponents = (polity) => {
    if (staged.has(polity)) return staged.get(polity);
    const result = sheets.get(polity)?.territorialComponents.slice() ?? [];
    staged.set(polity, result);
    return result;
  };
  const movements = [];
  const encountered = new Set();
  for (const transfer of transfers) {
    const id = clean(transfer?.regionId);
    if (!id || encountered.has(id)) throw new Error(`Duplicate or missing legal transfer region ID: ${id}`);
    encountered.add(id);
    const row = byId.get(id);
    if (!row) throw new Error(`Unknown legal transfer region ID: ${id}`);
    const original = clean(row.owner || row.country);
    const legal = clean(world?.regionSovereigntyOverrides?.[id])
      || clean(world?.regionOwnershipOverrides?.[id]) || original;
    const previous = clean(resolveOwner(legal)) || legal;
    const recipientName = clean(transfer?.toCode);
    const destination = clean(resolveOwner(recipientName)) || recipientName;
    if (!previous || !destination) throw new Error(`Legal transfer has unresolved parties: ${id}`);
    if (keyOf(previous) === keyOf(destination)) continue;
    const statedSource = clean(transfer?.fromCode);
    const controller = clean(world?.regionOwnershipOverrides?.[id]) || original;
    const attributedSource = clean(resolveOwner(statedSource)) || statedSource;
    if (statedSource && keyOf(attributedSource) !== keyOf(previous)
      && keyOf(attributedSource) !== keyOf(controller)) {
      throw new Error(`Legal transfer declares an unrelated source: ${id}`);
    }
    const donor = uniquePolityKey(rawStats, previous);
    const receiver = uniquePolityKey(rawStats, destination) || destination;
    // Do not extrapolate an unknown donor into an existing recipient's stock.
    if (!donor) {
      if (sheets.has(receiver)) throw new Error(`Legal transfer has no donor Statistics sheet: ${id}`);
      continue; // legacy/unmeasured polities retain their old map-only behavior
    }
    if (!sheets.has(donor)) throw new Error(`Donor has no mapped component ledger: ${donor}`);
    const candidates = componentsByName.get(keyOf(row.name)) || [];
    if (mapNameCounts.get(keyOf(row.name)) !== 1 || candidates.length !== 1 || candidates[0].owner !== donor) {
      throw new Error(`Region ${id} has no unique sovereign Statistics component`);
    }
    // A recipient with numeric baseline data but no component ownership cannot
    // suddenly gain an invented regional allocation: it must be reviewed first.
    const recipientExisting = rawStats[receiver];
    if (recipientExisting && !sheets.has(receiver)) {
      throw new Error(`Recipient ${receiver} has no mapped Statistics ledger`);
    }
    const source = getComponents(donor);
    const index = source.findIndex((item) => keyOf(item.geography) === keyOf(row.name));
    if (index < 0) throw new Error(`Region ${id} is not held in donor Statistics`);
    // Rebase finite demographic clocks at the next unaccounted day, never
    // retroactively changing their credited birth/death totals. Multiple
    // same-day transfers replace one pending rebase after full preflight.
    for (const name of [donor, receiver]) {
      const rawClock = rawStats[name]?.continuity?.demographicClock;
      if (!rawClock) continue;
      const clock = normalizeCountryStatDemographicClock(sheets.get(name)?.continuity?.demographicClock);
      if (!clock || !isCanonicalGameDate(effectiveDate)) {
        throw new Error(`Legal Statistics transfer has invalid demographic anchor for ${name}`);
      }
      if (compareGameDates(effectiveDate, clock.endDate) > 0) continue;
      const last = clock.lastDate;
      if (compareGameDates(effectiveDate, last) < 0
        || compareGameDates(effectiveDate, addGameDays(last, 1)) > 0) {
        throw new Error(`Legal Statistics transfer has unsettled demographic cursor for ${name}`);
      }
    }
    // The separate evolving demographic model accrues from current residents,
    // but its first activation still requires the scenario's exact population
    // anchor. Do not accept a title change that strands an unstarted model.
    for (const name of [donor, receiver]) {
      const rawEvolution = rawStats[name]?.continuity?.demographicEvolution;
      const evolution = sheets.get(name)?.continuity?.demographicEvolution;
      if (rawEvolution && !evolution) {
        throw new Error(`Legal Statistics transfer has invalid evolving-demographic anchor for ${name}`);
      }
      if (!evolution || compareGameDates(effectiveDate, evolution.endDate) > 0) continue;
      if (!isCanonicalGameDate(effectiveDate) || !isCanonicalGameDate(evolution.lastDate)) {
        throw new Error(`Legal Statistics transfer has invalid evolving-demographic date for ${name}`);
      }
      if (compareGameDates(effectiveDate, evolution.lastDate) < 0
        || compareGameDates(effectiveDate, addGameDays(evolution.lastDate, 1)) > 0) {
        throw new Error(`Legal Statistics transfer has unsettled evolving-demographic cursor for ${name}`);
      }
      if (evolution.lastDate === evolution.sourceDate) {
        throw new Error(`Legal Statistics transfer needs unstarted demographic-evolution reanchor for ${name}`);
      }
    }
    const [component] = source.splice(index, 1);
    getComponents(receiver).push(component);
    touched.add(donor);
    touched.add(receiver);
    movements.push({ regionId: id, fromPolity: donor, toPolity: receiver,
      population: component.population, gdp: component.population * component.gdpPerCapita });
  }
  if (!movements.length) return null;
  // Preserve operational military reservation bounds. A treaty cannot imply
  // that committed/missing personnel suddenly became free civilians or died.
  const personnel = normalizeFrontPersonnel(world?.frontPersonnel);
  for (const name of touched) {
    const original = world?.frontPersonnel?.[name];
    if (original && !personnel[name]) {
      throw new Error(`Legal Statistics transfer has malformed military reservations for ${name}`);
    }
  }
  // An unstarted finite migration plan has an explicit scenario baseline.
  // Moving its population before the first transfer would make that plan's
  // source/destination anchors false. Demand a revised authored plan first.
  for (const flow of world?.migrationFlows || []) {
    if (!touched.has(flow?.fromPolity) && !touched.has(flow?.toPolity)) continue;
    if (flow.lastDate === flow.sourceDate && (!isCanonicalGameDate(effectiveDate)
      || compareGameDates(effectiveDate, flow.sourceDate) <= 0)) {
      throw new Error(`Legal Statistics transfer needs migration-plan reanchor for ${flow.id || "unnamed flow"}`);
    }
  }
  const countryStats = { ...rawStats };
  for (const name of touched) {
    const base = sheets.get(name);
    const components = normalizeTerritorialComponents(getComponents(name));
    if (components.length !== getComponents(name).length) {
      throw new Error(`Territorial Statistics collision for ${name}`);
    }
    if (components.length) {
      const nextTotal = components.reduce((sum, item) => sum + item.population, 0);
      const reserved = (personnel[name]?.unavailable || 0) + (personnel[name]?.unresolved || 0);
      if (reserved > nextTotal) {
        throw new Error(`Legal Statistics transfer would overdraw committed military personnel for ${name}`);
      }
      const clock = base?.continuity?.demographicClock;
      let continuity = base?.continuity;
      if (clock && isCanonicalGameDate(effectiveDate)
        && compareGameDates(effectiveDate, clock.endDate) <= 0) {
        const from = addGameDays(clock.lastDate, 1);
        const cumulative = demographicClockCumulative(clock, clock.lastDate);
        if (!cumulative || cumulative.births !== clock.creditedBirths || cumulative.deaths !== clock.creditedDeaths) {
          throw new Error(`Cannot reanchor incomplete demographic receipt for ${name}`);
        }
        const rebases = [...(clock.rebases || [])];
        const rebase = { effectiveDate: from, basePopulation: nextTotal,
          creditedBirthsAtStart: clock.creditedBirths, creditedDeathsAtStart: clock.creditedDeaths };
        if (rebases.at(-1)?.effectiveDate === from) rebases[rebases.length - 1] = rebase;
        else rebases.push(rebase);
        if (rebases.length > COUNTRY_STATS_DEMOGRAPHIC_MAX_REBASES) {
          throw new Error(`Excessive demographic clock reanchors for ${name}`);
        }
        const updatedClock = normalizeCountryStatDemographicClock({ ...clock, rebases });
        if (!updatedClock) throw new Error(`Invalid demographic clock reanchor for ${name}`);
        continuity = { ...(continuity || {}), demographicClock: updatedClock };
      }
      countryStats[name] = finalizeCountryStatSheet({
        ...(base || { territorialScope: "mapped", statsSchemaVersion: 1 }),
        territorialComponents: components,
        ...(continuity ? { continuity } : {}),
      });
    } else {
      if (base?.continuity?.demographicClock && isCanonicalGameDate(effectiveDate)
        && compareGameDates(effectiveDate, base.continuity.demographicClock.endDate) <= 0
        && !dissolvingPolities.some((polity) => keyOf(resolveOwner(polity) || polity) === keyOf(name))) {
        throw new Error(`Legal transfer needs demographic termination for landless polity ${name}`);
      }
      // A polity with no territory has no defensible territorial GDP. Keep
      // indices, military and fiscal metadata as separately owned state; do
      // not leave the former country's output masquerading as current GDP.
      const economy = { ...(base?.economy || {}) };
      for (const key of ["gdp", "gdpPerCapita", "coreGdpPerCapita", "otherGdpPerCapita"]) delete economy[key];
      countryStats[name] = finalizeCountryStatSheet({ ...base,
        territorialScope: "mapped", territorialComponents: [], economy,
        population: { total: 0, coreIntegrated: 0, otherTerritories: 0 },
      });
    }
  }
  const beforePopulation = [...touched].reduce((sum, name) => sum + (sheets.get(name)?.population?.total || 0), 0);
  const afterPopulation = [...touched].reduce((sum, name) => sum + (countryStats[name]?.population?.total || 0), 0);
  if (beforePopulation !== afterPopulation) throw new Error("Legal transfer did not conserve mapped residents");
  const gdpOf = (stats) => [...touched].reduce((sum, name) => sum + (stats[name]?.territorialComponents || [])
    .reduce((part, component) => part + component.population * component.gdpPerCapita, 0), 0);
  const beforeGdp = gdpOf(Object.fromEntries(sheets));
  const afterGdp = gdpOf(countryStats);
  if (Math.abs(beforeGdp - afterGdp) > Math.max(0.01, beforeGdp * 1e-12)) {
    throw new Error("Legal transfer did not conserve territorial output");
  }
  return { countryStats, movements };
};
