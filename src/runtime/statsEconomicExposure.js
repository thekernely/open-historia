/*! Open Historia - native economic exposure from canonical geography and war records. */
import { compareGameDates } from "./gameDates.js";
import {
  appendCountryStatHistorySample, buildCountryStatHistorySample,
  normalizeTerritorialComponents, normalizeCountryStatGdpRamps,
} from "./countryStats.js";

const keyOf = (value) => String(value ?? "").trim().toLocaleLowerCase();
const labelOf = (value) => String(value ?? "").trim();
const round2 = (value) => Math.round(value * 100) / 100;

// One O(regions + components + wars) pass for ALL polities. Capturing twelve
// month ends for a 4,392-region scenario must not rescan every nation 80 times.
// These are observations of territorial *control* and already-booked output,
// never national GDP revaluations, census edits or guessed battle damage.
export const deriveAllNativeEconomicExposure = (world, { regionCatalog = null } = {}) => {
  const sheets = world?.countryStats;
  if (!sheets || typeof sheets !== "object" || Array.isArray(sheets)) return {};
  const results = {}, ledgerKeys = new Map(), ambiguousLedgerKeys = new Set();
  for (const [polity, sheet] of Object.entries(sheets)) {
    const key = keyOf(polity);
    if (!key || ambiguousLedgerKeys.has(key)) continue;
    if (ledgerKeys.has(key)) {
      delete results[ledgerKeys.get(key)];
      ledgerKeys.delete(key);
      ambiguousLedgerKeys.add(key);
      continue; // ambiguous canonical identity refuses projection for both
    }
    ledgerKeys.set(key, polity);
    const ramps = normalizeCountryStatGdpRamps(sheet?.continuity?.gdpRamps) || [];
    results[polity] = {
      polity, activeWarIds: [], commissionedProjectCount: ramps.length,
      commissionedAnnualGdp: round2(ramps.reduce((sum, item) => sum + item.credited, 0)),
      territorialCoverage: "unavailable", mappedComponents: 0, unresolvedComponents: 0,
      sovereignTerritorialGdp: null, sovereignGdpUnderForeignControl: null,
      foreignTerritorialGdpUnderControl: null, effectiveControlTerritorialGdp: null,
    };
  }
  for (const war of Array.isArray(world?.wars) ? world.wars : []) {
    if (war?.status !== "active" || !labelOf(war.id)) continue;
    for (const actor of [...(Array.isArray(war.sideA) ? war.sideA : []), ...(Array.isArray(war.sideB) ? war.sideB : [])]) {
      const found = ledgerKeys.get(keyOf(actor));
      if (found) results[found].activeWarIds.push(labelOf(war.id));
    }
  }
  for (const entry of Object.values(results)) entry.activeWarIds = [...new Set(entry.activeWarIds)].sort();

  const rows = Array.isArray(regionCatalog) ? regionCatalog : [];
  const byGeography = new Map(), regionIdCounts = new Map();
  for (const row of rows) {
    const name = keyOf(row?.name), id = labelOf(row?.id);
    if (id) regionIdCounts.set(id, (regionIdCounts.get(id) || 0) + 1);
    if (!name) continue;
    if (!byGeography.has(name)) byGeography.set(name, []);
    byGeography.get(name).push(row);
  }
  const componentNameCounts = new Map();
  for (const sheet of Object.values(sheets)) {
    for (const component of normalizeTerritorialComponents(sheet?.territorialComponents)) {
      const name = keyOf(component.geography);
      componentNameCounts.set(name, (componentNameCounts.get(name) || 0) + 1);
    }
  }
  const consumedIds = new Set();
  const ownedTotals = new Map(), occupiedTotals = new Map(), foreignTotals = new Map();
  for (const [legalOwner, raw] of Object.entries(sheets)) {
    const result = results[legalOwner];
    if (!result) continue;
    const components = normalizeTerritorialComponents(raw?.territorialComponents);
    if (components.length) result.territorialCoverage = "incomplete";
    for (const component of components) {
      const matching = byGeography.get(keyOf(component.geography)) || [];
      if (matching.length !== 1 || !labelOf(matching[0]?.id)
        || componentNameCounts.get(keyOf(component.geography)) !== 1) { result.unresolvedComponents++; continue; }
      const row = matching[0], id = labelOf(row.id);
      if (regionIdCounts.get(id) !== 1 || consumedIds.has(id)) { result.unresolvedComponents++; continue; }
      const initialOwner = labelOf(row.country || row.owner);
      const legal = labelOf(world?.regionSovereigntyOverrides?.[id])
        || labelOf(world?.regionOwnershipOverrides?.[id]) || initialOwner;
      if (keyOf(legal) !== keyOf(legalOwner)) { result.unresolvedComponents++; continue; }
      consumedIds.add(id);
      result.mappedComponents++;
      const gdp = component.population * component.gdpPerCapita;
      const controller = labelOf(world?.regionOwnershipOverrides?.[id]) || initialOwner;
      ownedTotals.set(legalOwner, (ownedTotals.get(legalOwner) || 0) + gdp);
      if (keyOf(controller) !== keyOf(legalOwner)) {
        occupiedTotals.set(legalOwner, (occupiedTotals.get(legalOwner) || 0) + gdp);
        const controllerKey = ledgerKeys.get(keyOf(controller));
        if (controllerKey) foreignTotals.set(controllerKey, (foreignTotals.get(controllerKey) || 0) + gdp);
      }
    }
    if (components.length && result.unresolvedComponents === 0) result.territorialCoverage = "complete";
  }
  for (const [polity, result] of Object.entries(results)) {
    if (result.territorialCoverage !== "complete") continue;
    const owned = ownedTotals.get(polity) || 0;
    const occupied = occupiedTotals.get(polity) || 0;
    const foreign = foreignTotals.get(polity) || 0;
    result.sovereignTerritorialGdp = round2(owned);
    result.sovereignGdpUnderForeignControl = round2(occupied);
    // Confirmed lower bound if an occupied foreign country has unresolved rows.
    result.foreignTerritorialGdpUnderControl = round2(foreign);
    result.effectiveControlTerritorialGdp = round2(owned - occupied + foreign);
  }
  return results;
};

export const deriveNativeEconomicExposure = (world, polity, options = {}) => {
  const results = deriveAllNativeEconomicExposure(world, options);
  const exact = results[labelOf(polity)];
  if (exact) return exact;
  const candidates = Object.keys(results).filter((key) => keyOf(key) === keyOf(polity));
  return candidates.length === 1 ? results[candidates[0]] : null;
};

// Month-end read-model observation. This does not change countryStats or GDP.
// Explicit zero records the end of occupation. War statuses are NOT historical
// here: war updates currently publish only after the normal turn event fold.
export const captureNativeEconomicExposureHistory = (
  world, { date = "", round = 0, regionCatalog = null } = {},
) => {
  if (!world?.countryStats || !Array.isArray(regionCatalog) || !regionCatalog.length) return world;
  const exposures = deriveAllNativeEconomicExposure(world, { regionCatalog });
  let history = world.countryStatsHistory;
  for (const [polity, sheet] of Object.entries(world.countryStats)) {
    const observed = exposures[polity];
    if (observed?.territorialCoverage !== "complete") continue;
    const prior = history?.[polity]?.filter((sample) => compareGameDates(sample.date, date) < 0).at(-1);
    const occupied = observed.sovereignGdpUnderForeignControl;
    const foreign = observed.foreignTerritorialGdpUnderControl;
    if (!(occupied > 0 || foreign > 0
      || prior?.sovereignGdpUnderForeignControl > 0
      || prior?.foreignTerritorialGdpUnderControl > 0)) continue;
    const sample = buildCountryStatHistorySample(sheet, { date, round });
    if (!sample) continue;
    sample.sovereignGdpUnderForeignControl = occupied;
    sample.foreignTerritorialGdpUnderControl = foreign;
    history = appendCountryStatHistorySample(history, polity, sample, { date, round });
  }
  return history !== world.countryStatsHistory ? { ...world, countryStatsHistory: history } : world;
};
