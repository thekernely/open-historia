/*! Open Historia - finite, evidenced operating-capacity ramp after project commissioning. */
import { compareGameDates, diffGameDays } from "./gameDates.js";
import { mergeCountryStatPatch, normalizeCountryStatSheet } from "./countryStats.js";
import { collectActiveScenarioPolityKeys } from "./scenarioPolities.js";

const round2 = (value) => Math.round(value * 100) / 100;
const round4 = (value) => Math.round(value * 10000) / 10000;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// A commissioned factory's GDP contribution is an ANNUAL OUTPUT LEVEL,
// not revenue added again every turn. Each project has one bounded ramp from
// 0 to its established increment, after which it stays embedded in the GDP
// baseline. No fallback growth assumption, title matching or AI request.
export const advanceNativeProductionClock = (world, { fromDate = "", toDate = "" } = {}) => {
  if (!(diffGameDays(fromDate, toDate) > 0) || !world?.countryStats || typeof world.countryStats !== "object") return world;
  const active = new Set(collectActiveScenarioPolityKeys(world));
  let changed = null;
  for (const [polity, raw] of Object.entries(world.countryStats)) {
    if (!active.has(polity) || !own(world.countryStats, polity)) continue;
    let sheet = normalizeCountryStatSheet(raw);
    const ramps = sheet?.continuity?.gdpRamps;
    if (!ramps?.length || !(sheet?.economy?.gdp > 0)) continue;
    let any = false;
    const nextRamps = ramps.map((item) => {
      if (compareGameDates(item.lastDate, toDate) >= 0) return item;
      const until = compareGameDates(toDate, item.endDate) > 0 ? item.endDate : toDate;
      const entire = diffGameDays(item.startDate, item.endDate);
      const elapsed = diffGameDays(item.startDate, until);
      if (!(entire > 0) || !(elapsed > 0)) return item;
      const target = round2(item.gdpDelta * Math.min(1, elapsed / entire));
      const incremental = target - item.credited;
      const currentGdp = sheet.economy.gdp;
      if (incremental <= 0 || !(currentGdp > 0)) return item;
      const nextGdp = currentGdp + incremental;
      if (!Number.isFinite(nextGdp) || nextGdp > 1e18) return item;
      // A GDP level change alone does not make nominal debt vanish: keep its
      // absolute stock constant through the ratio denominator change.
      const debt = sheet.economy.publicDebt;
      const economy = { gdp: nextGdp };
      if (typeof debt === "number" && Number.isFinite(debt) && debt >= 0) {
        economy.publicDebt = round4(debt * currentGdp / nextGdp);
      }
      const patched = mergeCountryStatPatch(sheet, { economy }, { maxAggregateRescale: 10 });
      const realised = patched?.economy?.gdp - currentGdp;
      if (!(realised > 0) || !Number.isFinite(realised)) return item;
      any = true;
      sheet = patched;
      return { ...item, lastDate: until, credited: round2(item.credited + realised) };
    });
    if (!any) continue;
    sheet = mergeCountryStatPatch(sheet, { continuity: { gdpRamps: nextRamps } });
    if (!changed) changed = { ...world.countryStats };
    changed[polity] = sheet;
  }
  return changed ? { ...world, countryStats: changed } : world;
};
