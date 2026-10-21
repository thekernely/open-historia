/*! Open Historia - native, persistent, evidence-bounded macroeconomic dynamics.
 * Country GDP remains the legal territorial ledger. Estimated rates are not new
 * observed facts. No AI, randomness, title matching or hidden external data.
 */
import { compareGameDates, diffGameDays, isCanonicalGameDate } from "./gameDates.js";
import {
  mergeCountryStatPatch, normalizeCountryStatSheet, normalizeCountryStatNativeEconomyClock,
  normalizeCountryStatGdpTrendClock,
} from "./countryStats.js";
import { collectActiveScenarioPolityKeys } from "./scenarioPolities.js";
import { deriveAllNativeEconomicExposure } from "./statsEconomicExposure.js";

const YEAR = 365.2425;
const HALF_LIFE = 4 * YEAR; // A reviewed productivity trend is evidence, not an eternal forecast.
// Explicit, versioned model-policy constants, NOT asserted historical measurements.
const PRESSURE_RELAX_DAYS = 180;
const OCCUPIED_ACCESS_PRESSURE_POINTS = 12; // maximum %-points of annual growth pressure
const DEFICIT_PRESSURE_POINTS = 0.12;
const LABOR_OUTPUT_RESPONSE = 0.20;
const PRICE_DEMAND_RESPONSE = 0.055;
const PRICE_LABOR_RESPONSE = 0.018;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const bounded = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;

// An observed natural-change rate (per thousand residents per year) is evidence
// of initial labor-supply growth, not a permanently imposed birth/death rate.
const assessedNaturalRate = (sheet) => {
  const demo = sheet.continuity?.demographicEvolution || sheet.continuity?.demographicClock;
  if (!demo || !bounded(demo.birthRate, 0, 80) || !bounded(demo.deathRate, 0, 80)) return 0;
  return clamp((demo.birthRate - demo.deathRate) / 10, -15, 15);
};

// Component identity distinguishes organic demographic change from a change
// in LEGAL geographic scope. A border transfer already brings its own GDP;
// treating its newly acquired residents as births would double-count output.
// Two independent 32-bit hashes plus count are compact save-safe change
// detectors, not a replacement for the canonical component / region IDs.
const territorialKey = (sheet) => {
  const keys = sheet.territorialComponents.map((c) => `${c.geography.toLocaleLowerCase()}\u0000${c.group}`).sort();
  let a = 2166136261, b = 0x9e3779b9;
  for (const key of keys) {
    for (let i = 0; i < key.length; i++) {
      const code = key.charCodeAt(i);
      a = Math.imul(a ^ code, 16777619);
      b = Math.imul(b ^ code, 2246822519);
    }
    a = Math.imul(a ^ 255, 16777619);
    b = Math.imul(b ^ 255, 2246822519);
  }
  return `${keys.length}:${(a >>> 0).toString(16).padStart(8, "0")}:${(b >>> 0).toString(16).padStart(8, "0")}`;
};

const commissioned = (sheet) => (sheet.continuity?.gdpRamps || [])
  .reduce((sum, ramp) => sum + (Number(ramp.credited) || 0), 0);

const establishedDate = (sheet) => sheet.continuity?.assessedDate
  || sheet.continuity?.demographicEvolution?.sourceDate
  || sheet.continuity?.demographicClock?.sourceDate
  || sheet.continuity?.foundingAssessment?.date;

const newClock = (sheet, sourceDate, fromDate, oldClock) => {
  const sourceReal = oldClock?.realGrowth ?? sheet.economy.gdpGrowth;
  const sourceInflation = oldClock?.inflation ?? sheet.economy.inflation;
  if (!bounded(sourceReal, -30, 30) || !bounded(sourceInflation, -20, 100)) return null;
  const lastDate = oldClock?.lastDate && compareGameDates(oldClock.lastDate, fromDate) >= 0
    ? oldClock.lastDate : compareGameDates(sourceDate, fromDate) > 0 ? sourceDate : fromDate;
  const yearsOld = Math.max(0, diffGameDays(sourceDate, lastDate)) / YEAR;
  const productivity = (sourceReal - assessedNaturalRate(sheet)) * 2 ** (-yearsOld / 4);
  return {
    version: 1, sourceDate, lastDate, lastPopulation: sheet.population.total,
    lastGdp: sheet.economy.gdp, lastTerritoryKey: territorialKey(sheet), sourceRealGrowth: sourceReal,
    sourceInflation, productivity, demandGap: 0,
    inflation: sourceInflation, unemployment: bounded(sheet.economy.unemployment, 0, 100)
      ? sheet.economy.unemployment : null,
    sourceUnemployment: bounded(sheet.economy.unemployment, 0, 100)
      ? sheet.economy.unemployment : null,
    lastProjectOutput: round(commissioned(sheet), 2),
  };
};

// Returns a modeled rate projection for a *measured* period. Population growth
// is taken from the existing native demographic/migration clocks and therefore
// never credited a second time to their ledgers. Product ramps are applied by
// their own credited cursor AFTER this step, not re-issued here.
export const advanceNativeMacroEconomyClock = (
  world, { fromDate = "", toDate = "", regionCatalog = null } = {},
) => {
  if (!(diffGameDays(fromDate, toDate) > 0) || !world?.countryStats) return world;
  const active = new Set(collectActiveScenarioPolityKeys(world));
  const exposures = Array.isArray(regionCatalog) && regionCatalog.length
    ? deriveAllNativeEconomicExposure(world, { regionCatalog }) : null;
  let revised = null;
  for (const [polity, raw] of Object.entries(world.countryStats)) {
    if (!active.has(polity)) continue;
    const sheet = normalizeCountryStatSheet(raw);
    const population = sheet?.population?.total;
    const gdp = sheet?.economy?.gdp;
    if (!sheet?.territorialComponents?.length || !(population > 0) || !(gdp > 0)) continue;
    const sourceDate = establishedDate(sheet);
    if (!isCanonicalGameDate(sourceDate) || compareGameDates(sourceDate, toDate) > 0) continue;
    const old = normalizeCountryStatNativeEconomyClock(sheet.continuity?.nativeEconomyClock);
    const legacy = normalizeCountryStatGdpTrendClock(sheet.continuity?.gdpTrendClock);
    // Invalid persisted native state cannot be silently treated as a fresh
    // assessment, restarting credit on an already advanced national GDP.
    if ((own(raw?.continuity || {}, "nativeEconomyClock") && !old)
      || (own(raw?.continuity || {}, "gdpTrendClock") && !legacy && !old)) continue;
    let clock = old?.sourceDate === sourceDate ? old
      : newClock(sheet, sourceDate, fromDate, legacy?.sourceDate === sourceDate ? legacy : null);
    const newlyAssessed = !!clock && clock.lastDate === clock.sourceDate
      && compareGameDates(clock.sourceDate, fromDate) > 0
      && compareGameDates(clock.sourceDate, toDate) <= 0;
    if (!clock || (compareGameDates(clock.lastDate, fromDate) !== 0 && !newlyAssessed)) continue;
    // Once the native clock owns modeled inflation/growth, authored changes to
    // either macro reading without a new assessment source must be rejected.
    if (old?.sourceDate === sourceDate && (
      !bounded(sheet.economy.gdpGrowth, -30, 30)
      || !bounded(sheet.economy.inflation, -20, 100)
      || Math.abs(sheet.economy.gdpGrowth - (old.reportedGrowth ?? old.sourceRealGrowth)) > .0002
      || Math.abs(sheet.economy.inflation - old.inflation) > .0002
    )) continue;
    const days = diffGameDays(clock.lastDate, toDate);
    const currentTerritoryKey = territorialKey(sheet);
    const populationFactor = currentTerritoryKey === clock.lastTerritoryKey
      ? population / clock.lastPopulation : 1;
    if (!(populationFactor > 0) || !Number.isFinite(populationFactor)) continue;
    // When geography cannot be reconciled we do NOT assume occupation equals
    // zero or impose an unsupported loss on this country's economy.
    const exposure = exposures?.[polity];
    const occupationFraction = exposure?.territorialCoverage === "complete"
      && exposure.sovereignTerritorialGdp > 0
      ? clamp(exposure.sovereignGdpUnderForeignControl / exposure.sovereignTerritorialGdp, 0, 1) : null;
    // An assessed fiscal balance can support macro demand pressure only while
    // the *individual day* is inside its bounded evidence window. If this is
    // decided once from the turn's start, a 365-day skip continues to apply an
    // expired reading while twelve monthly turns do not.
    const sourceAge = diffGameDays(sourceDate, clock.lastDate);
    const assessedBalance = bounded(sheet.economy.budgetBalance, -50, 50)
      ? sheet.economy.budgetBalance : 0;
    const occupationGap = occupationFraction === null ? 0
      : -OCCUPIED_ACCESS_PRESSURE_POINTS * occupationFraction;
    // A stable source-date labor anchor makes the price response independent
    // of where a player chooses to divide a time skip.
    const sourceUnemployment = Object.hasOwn(clock, "sourceUnemployment")
      ? clock.sourceUnemployment : clock.unemployment;
    let unemployment = clock.unemployment;
    let inflation = clock.inflation;
    let productivity = clock.productivity;
    let gap = clock.demandGap;
    let nominalLog = 0;
    // Daily integration makes 365 days in one call equivalent to 12 months or
    // 365 one-day turns; the loop performs arithmetic only, no sheet rewrites.
    for (let day = 0; day < days; day += 1) {
      const balance = sourceAge + day <= 240 ? assessedBalance : 0;
      const targetGap = clamp(occupationGap - DEFICIT_PRESSURE_POINTS * balance, -12, 8);
      gap += (targetGap - gap) / PRESSURE_RELAX_DAYS;
      productivity *= 2 ** (-1 / HALF_LIFE);
      const realRate = clamp(productivity + gap, -35, 35);
      const priceRate = clamp(inflation, -20, 100);
      nominalLog += (Math.log1p(realRate / 100) + Math.log1p(priceRate / 100)) / YEAR;
      // Okun / price-pressure approximations are explicit, bounded policy
      // parameters. A missing unemployment baseline stays unknown, not zero.
      if (unemployment !== null) {
        unemployment = clamp(unemployment - (LABOR_OUTPUT_RESPONSE * (realRate + assessedNaturalRate(sheet)) / YEAR), 0, 100);
      }
      inflation = clamp(inflation + (PRICE_DEMAND_RESPONSE * gap - PRICE_LABOR_RESPONSE * (unemployment === null || sourceUnemployment === null ? 0 : unemployment - sourceUnemployment)) / YEAR, -20, 100);
    }
    const nominalFactor = Math.exp(nominalLog) * populationFactor;
    const nextGdp = round(gdp * nominalFactor, 2);
    if (!(nextGdp > 0) || !Number.isFinite(nextGdp) || nextGdp > 1e18) continue;
    // GDP growth is a modeled CURRENT annual real-rate estimate, not a
    // misleading annualization of one month of lumpy census credits.
    const realAnnual = round(clamp(assessedNaturalRate(sheet) + productivity + gap, -35, 35), 4);
    const nextClock = {
      ...clock, lastDate: toDate, lastPopulation: population, lastGdp: nextGdp,
      lastTerritoryKey: currentTerritoryKey,
      productivity: round(productivity, 8), demandGap: round(gap, 8),
      inflation: round(inflation, 4), unemployment: unemployment === null ? null : round(unemployment, 4),
      lastProjectOutput: round(commissioned(sheet), 2), reportedGrowth: realAnnual,
      sourceUnemployment,
    };
    const economy = { gdp: nextGdp, gdpGrowth: realAnnual, inflation: nextClock.inflation };
    if (nextClock.unemployment !== null) economy.unemployment = nextClock.unemployment;
    if (bounded(sheet.economy.publicDebt, 0, 1000)) {
      economy.publicDebt = round(sheet.economy.publicDebt * gdp / nextGdp, 4);
    }
    const updated = mergeCountryStatPatch(sheet, {
      economy, continuity: { nativeEconomyClock: nextClock },
    }, { maxAggregateRescale: 10 });
    if (!updated?.continuity?.nativeEconomyClock) continue;
    // Store the value ACTUALLY conserved by the component ledger, not the
    // two-decimal target which may differ after geographic rounding.
    updated.continuity.nativeEconomyClock.lastGdp = updated.economy.gdp;
    if (!revised) revised = { ...world.countryStats };
    revised[polity] = updated;
  }
  return revised ? { ...world, countryStats: revised } : world;
};
