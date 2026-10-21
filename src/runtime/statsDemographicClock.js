/*! Open Historia - scenario-authorized native births/deaths with durable accounting. */
import { compareGameDates, diffGameDays, gameDateDayNumber } from "./gameDates.js";
import { mergeCountryStatPatch, normalizeCountryStatDemographicClock, normalizeCountryStatDemographicEvolution,
  normalizeCountryStatSheet, scaleComponentPopulationExact } from "./countryStats.js";
import { collectActiveScenarioPolityKeys } from "./scenarioPolities.js";

const YEAR_DAYS = 365.2425;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Each civil day is accounted exactly once using stored fractional residues.
// Consequently splitting a turn, save/reload, or replay gives the same result.
// Scenario-authored trends are bounded; accepted numeric policy outcomes ramp
// with lag and expire. Prose and ordinary political announcements have no effect.
const clampRate = (value) => Math.max(0, Math.min(80, value));
const evolutionTick = (current, model, until) => {
  const startDay = gameDateDayNumber(model.sourceDate);
  const endDay = gameDateDayNumber(until);
  const lastDay = gameDateDayNumber(model.lastDate);
  const influences = model.influences.map((entry) => ({
    ...entry, day: gameDateDayNumber(entry.startDate),
  }));
  let population = current.population.total;
  let creditedBirths = model.creditedBirths;
  let creditedDeaths = model.creditedDeaths;
  let birthFraction = model.birthFraction;
  let deathFraction = model.deathFraction;
  for (let day = lastDay + 1; day <= endDay; day += 1) {
    const years = (day - startDay) / YEAR_DAYS;
    let birthRate = model.birthRate + model.birthTrendPerYear * years;
    let deathRate = model.deathRate + model.deathTrendPerYear * years;
    for (const effect of influences) {
      const age = day - effect.day - effect.lagDays;
      if (age <= 0 || age > effect.durationDays) continue;
      const share = Math.min(1, age / effect.rampDays);
      birthRate += effect.birthRateChange * share;
      deathRate += effect.deathRateChange * share;
    }
    birthFraction += population * clampRate(birthRate) / (1000 * YEAR_DAYS);
    deathFraction += population * clampRate(deathRate) / (1000 * YEAR_DAYS);
    const births = Math.floor(birthFraction);
    const deaths = Math.floor(deathFraction);
    birthFraction -= births;
    deathFraction -= deaths;
    population += births - deaths;
    creditedBirths += births;
    creditedDeaths += deaths;
    if (!Number.isSafeInteger(population) || population <= 0
      || !Number.isSafeInteger(creditedBirths) || !Number.isSafeInteger(creditedDeaths)) return null;
  }
  return {
    population, model: { ...model, lastDate: until, creditedBirths, creditedDeaths,
      birthFraction, deathFraction,
      // An expired adjustment is no longer active. Keep its accepted event
      // in the timeline, not in a forever-full runtime influence queue.
      influences: model.influences.filter((effect) =>
        endDay < gameDateDayNumber(effect.startDate) + effect.lagDays + effect.durationDays),
    },
  };
};

// Natural change only. A net migration "rate" would create or destroy people
// without a corresponding source/destination entry and is not modeled here.
// Each dated rate is an ANCHORED estimate for a finite horizon, never a default
// perpetually extrapolated to countries that did not establish it.
export const advanceNativeDemographicClock = (world, { baselineWorld, fromDate = "", toDate = "" } = {}) => {
  if (!(diffGameDays(fromDate, toDate) > 0) || !world?.countryStats || typeof world.countryStats !== "object") return world;
  const active = new Set(collectActiveScenarioPolityKeys(world));
  let updated = null;
  for (const [polity, raw] of Object.entries(world.countryStats)) {
    if (!active.has(polity) || !own(world.countryStats, polity)) continue;
    const current = normalizeCountryStatSheet(raw);
    const evolution = normalizeCountryStatDemographicEvolution(current?.continuity?.demographicEvolution);
    const clock = normalizeCountryStatDemographicClock(current?.continuity?.demographicClock);
    // Never double-accrue two demographic processes for the same polity.
    if (evolution && clock) continue;
    if (evolution) {
      if (!(current?.population?.total > 0)) continue;
      const startsNow = evolution.lastDate === evolution.sourceDate
        && compareGameDates(evolution.sourceDate, fromDate) > 0
        && compareGameDates(evolution.sourceDate, toDate) <= 0;
      if (compareGameDates(evolution.lastDate, fromDate) !== 0 && !startsNow) continue;
      if (startsNow && evolution.basePopulation !== current.population.total) continue;
      if (baselineWorld && evolution.lastDate === evolution.sourceDate && !startsNow) {
        const original = normalizeCountryStatSheet(baselineWorld.countryStats?.[polity]);
        if (original?.population?.total !== evolution.basePopulation) continue;
      }
      const until = compareGameDates(toDate, evolution.endDate) > 0 ? evolution.endDate : toDate;
      if (compareGameDates(until, evolution.lastDate) <= 0) continue;
      const settled = evolutionTick(current, evolution, until);
      if (!settled) continue;
      const populationDelta = settled.population - current.population.total;
      const patch = { continuity: { demographicEvolution: settled.model } };
      let replaceComponents = false;
      if (populationDelta !== 0) {
        if (Array.isArray(current.territorialComponents) && current.territorialComponents.length) {
          const scaled = scaleComponentPopulationExact(current.territorialComponents, () => true, settled.population);
          if (scaled.error) continue;
          patch.territorialComponents = scaled.components;
          replaceComponents = true;
        } else if (current.territorialScope === "mapped" && Array.isArray(current.territorialComponents)) {
          continue;
        } else {
          patch.population = { total: settled.population };
        }
        const gdp = current.economy?.gdp;
        if (Number.isFinite(gdp) && gdp > 0) patch.economy = { gdp };
      }
      const next = mergeCountryStatPatch(current, patch, { replaceComponents, maxAggregateRescale: 10 });
      if (next?.population?.total !== settled.population
        || !next?.continuity?.demographicEvolution
        || (populationDelta !== 0 && Number.isFinite(current.economy?.gdp)
          && Math.abs((next.economy?.gdp || 0) - current.economy.gdp) > Math.max(1, current.economy.gdp * 0.000002))) continue;
      if (!updated) updated = { ...world.countryStats };
      updated[polity] = next;
      continue;
    }
    if (!clock || !(current?.population?.total > 0)) continue;
    // A retroactive/mismatched cursor cannot silently backfill an older save.
    const startNow = clock.lastDate === clock.sourceDate
      && compareGameDates(clock.sourceDate, fromDate) > 0
      && compareGameDates(clock.sourceDate, toDate) <= 0;
    if (compareGameDates(clock.lastDate, fromDate) !== 0 && !startNow) continue;
    if (startNow && clock.basePopulation !== current.population.total) continue;
    // First activation must agree with the beginning-of-turn canonical Stats,
    // not an event-mutated sheet partway through the same turn.
    if (baselineWorld && clock.lastDate === clock.sourceDate && !startNow) {
      const anchored = normalizeCountryStatSheet(baselineWorld.countryStats?.[polity]);
      if (anchored?.population?.total !== clock.basePopulation) continue;
    }
    const until = compareGameDates(toDate, clock.endDate) > 0 ? clock.endDate : toDate;
    if (compareGameDates(until, clock.lastDate) <= 0) continue;
    const elapsed = diffGameDays(clock.sourceDate, until);
    const births = Math.round(clock.basePopulation * clock.birthsPerThousand / 1000 * elapsed / YEAR_DAYS);
    const deaths = Math.round(clock.basePopulation * clock.deathsPerThousand / 1000 * elapsed / YEAR_DAYS);
    const populationDelta = (births - clock.creditedBirths) - (deaths - clock.creditedDeaths);
    const nextPopulation = current.population.total + populationDelta;
    if (!Number.isSafeInteger(nextPopulation) || nextPopulation <= 0) continue;

    const patch = { continuity: { demographicClock: {
      ...clock, lastDate: until, creditedBirths: births, creditedDeaths: deaths,
    } } };
    let replaceComponents = false;
    if (populationDelta !== 0) {
      if (Array.isArray(current.territorialComponents) && current.territorialComponents.length) {
        const result = scaleComponentPopulationExact(current.territorialComponents, () => true, nextPopulation);
        if (result.error) continue;
        patch.territorialComponents = result.components;
        replaceComponents = true;
      } else if (current.territorialScope === "mapped" && Array.isArray(current.territorialComponents)) {
        // An explicitly empty mapped ledger is not authorization for growth.
        continue;
      } else {
        patch.population = { total: nextPopulation };
      }
      // New residents alone are not evidence for additional productive output.
      // Preserve existing nominal GDP, including independent production shocks.
      const gdp = current.economy?.gdp;
      if (Number.isFinite(gdp) && gdp > 0) patch.economy = { gdp };
    }
    const next = mergeCountryStatPatch(current, patch, { replaceComponents, maxAggregateRescale: 10 });
    if (next?.population?.total !== nextPopulation) continue;
    if (populationDelta !== 0 && Number.isFinite(current.economy?.gdp) &&
      Math.abs((next.economy?.gdp || 0) - current.economy.gdp) > Math.max(1, current.economy.gdp * 0.000002)) continue;
    if (!updated) updated = { ...world.countryStats };
    updated[polity] = next;
  }
  return updated ? { ...world, countryStats: updated } : world;
};
