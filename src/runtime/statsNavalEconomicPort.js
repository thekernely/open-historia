/*! Open Historia - read-only dated blockade evidence and charges.
 * This module DOES NOT write GDP, budgets, receipts, or history. A validated
 * chronological native writer consumes it; unsupported or unknown evidence
 * keeps the existing whole-turn legacy blockade writer in gameplay.
 */
import { addGameDays, compareGameDates, diffGameDays, isCanonicalGameDate } from "./gameDates.js";
import { BLOCKADE_GDP_A_YEAR, BLOCKADE_BUDGET_A_YEAR, BLOCKADE_LEAST } from "./naval/blockade.js";

const MAX_DAILY_RECORDS = 12000;
const finiteShare = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

// Raw naval pressure is a complete sparse view of positive observations, not
// a series with fabricated zeros. When coastal geometry, naval chronology or
// the observation cap prevented coverage, `blockadeDays` MUST be null.
// Malformed dates, duplicate country-days, non-canonical identities, or any
// impossible row fail closed for the entire batch; no partially credited GDP.
export const validateDatedBlockadeEvidence = ({ fromDate = "", toDate = "", blockadeDays = null } = {}) => {
  if (!isCanonicalGameDate(fromDate) || !isCanonicalGameDate(toDate)
    || !(diffGameDays(fromDate, toDate) > 0)
    || !Array.isArray(blockadeDays) || blockadeDays.length > MAX_DAILY_RECORDS) return null;
  const seen = new Set();
  const validated = [];
  for (const row of blockadeDays) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const { country, date, pressure, covered, by } = row;
    if (typeof country !== "string" || !country.trim() || country !== country.trim() || country.length > 120
      || !isCanonicalGameDate(date) || compareGameDates(date, fromDate) <= 0
      || compareGameDates(date, toDate) > 0
      || !finiteShare(pressure) || pressure <= 0 || !finiteShare(covered)
      || !Array.isArray(by) || by.length === 0 || by.length > 40
      || by.some((name) => typeof name !== "string" || !name.trim() || name !== name.trim() || name.length > 120)) return null;
    const identity = `${country.toLocaleLowerCase()}\u0000${date}`;
    if (seen.has(identity)) return null;
    seen.add(identity);
    validated.push({ country, date, pressure, covered, by: [...by] });
  }
  return validated.sort((a, b) => compareGameDates(a.date, b.date) || a.country.localeCompare(b.country));
};

// Converts exact daily observations to additive pressure-days and a
// partition-invariant loss factor. No partial-month estimate is needed; an
// event-day/turn-day writer can consume subsets and compose their factors.
// A full year at 100% pressure keeps the old 20%-per-year loss calibration:
// exp(log(1 - 0.20) * 365 / 365) === 0.8. The old *per-turn* 50% cap is not
// applied here because its effect depends on skip partitioning; any long-run
// clamp policy belongs in the later single-writer contract.
export const deriveDatedBlockadeCharges = ({ fromDate = "", toDate = "", blockadeDays = null } = {}) => {
  const valid = validateDatedBlockadeEvidence({ fromDate, toDate, blockadeDays });
  if (valid === null) return null;
  const countries = new Map();
  for (const row of valid) {
    const key = row.country.toLocaleLowerCase();
    const current = countries.get(key) || { country: row.country, pressureDays: 0, activeDays: 0 };
    current.pressureDays += row.pressure;
    current.activeDays += 1;
    countries.set(key, current);
  }
  return [...countries.values()].sort((a, b) => a.country.localeCompare(b.country)).map((row) => ({
    ...row,
    gdpFactor: Math.exp(Math.log1p(-BLOCKADE_GDP_A_YEAR) * row.pressureDays / 365),
    budgetBalanceDelta: -BLOCKADE_BUDGET_A_YEAR * row.pressureDays / 365,
  }));
};

// Positive-pressure cutover requires the three naval evidence projections to
// reconcile, not merely the presence of a non-null sparse day list. Their
// source is a complete runNaval simulation; a missing coast/map or a war/land
// transition explicitly reports null instead of authorizing a zero reading.
export const validateCompletePositiveNavalEvidence = ({ fromDate, toDate, sea } = {}) => {
  const days = diffGameDays(fromDate, toDate);
  if (!sea || !Number.isInteger(days) || days <= 0 || sea.fromDate !== fromDate
    || sea.days !== days || !Array.isArray(sea.blockadePeriods)
    || !Array.isArray(sea.blockades)) return null;
  const positive = validateDatedBlockadeEvidence({ fromDate, toDate, blockadeDays: sea.blockadeDays });
  if (!positive?.length) return null;
  const folded = (text) => text.toLocaleLowerCase();
  const byCountryMonth = new Map();
  const activeCountries = new Map();
  for (const row of positive) {
    const key = folded(row.country);
    const month = row.date.slice(0, row.date.lastIndexOf("-"));
    const id = `${key}\u0000${month}`;
    const slot = byCountryMonth.get(id) || { pressure: 0, covered: 0, activeDays: 0, by: new Set() };
    slot.pressure += row.pressure;
    slot.covered += row.covered;
    slot.activeDays++;
    for (const owner of row.by) slot.by.add(folded(owner));
    byCountryMonth.set(id, slot);
    if (!activeCountries.has(key)) activeCountries.set(key, row.country);
    else if (activeCountries.get(key) !== row.country) return null;
  }
  const seen = new Set();
  const rangeByMonth = new Map();
  // The source emits a row for EVERY civil month on an exposed country's
  // coast, including zero-pressure months before/after pressure. Requiring
  // each one prevents a fabricated partial batch from claiming completeness.
  for (let i = 1; i <= days; i++) {
    const date = addGameDays(fromDate, i);
    const month = date.slice(0, date.lastIndexOf("-"));
    const span = rangeByMonth.get(month) || { fromDate: date, toDate: date, days: 0 };
    span.toDate = date;
    span.days++;
    rangeByMonth.set(month, span);
  }
  for (const period of sea.blockadePeriods) {
    if (!period || typeof period !== "object" || Array.isArray(period)
      || typeof period.country !== "string" || !activeCountries.has(folded(period.country))
      || activeCountries.get(folded(period.country)) !== period.country
      || !isCanonicalGameDate(period.fromDate) || !isCanonicalGameDate(period.toDate)) return null;
    const month = period.fromDate.slice(0, period.fromDate.lastIndexOf("-"));
    const range = rangeByMonth.get(month);
    const key = `${folded(period.country)}\u0000${month}`;
    const observed = byCountryMonth.get(key) || { pressure: 0, covered: 0, activeDays: 0, by: new Set() };
    if (!range || seen.has(key) || period.fromDate !== range.fromDate || period.toDate !== range.toDate
      || period.days !== range.days || period.activeDays !== observed.activeDays
      || !finiteShare(period.pressure) || !finiteShare(period.covered)
      || Math.abs(period.pressure - observed.pressure / range.days) > 1e-9
      || Math.abs(period.covered - (observed.activeDays ? observed.covered / observed.activeDays : 0)) > 1e-9
      || !Array.isArray(period.by) || period.by.length !== observed.by.size
      || period.by.some((owner) => typeof owner !== "string" || !observed.by.has(folded(owner)))) return null;
    seen.add(key);
  }
  if (seen.size !== activeCountries.size * rangeByMonth.size) return null;
  const totalByCountry = new Map();
  for (const row of positive) totalByCountry.set(folded(row.country),
    (totalByCountry.get(folded(row.country)) || 0) + row.pressure);
  const threshold = BLOCKADE_LEAST;
  const thresholded = new Set();
  for (const row of sea.blockades) {
    if (!row || typeof row.country !== "string" || !activeCountries.has(folded(row.country))
      || !finiteShare(row.pressure) || !Number.isInteger(row.days) || row.days < 1) return null;
    const key = folded(row.country);
    if (thresholded.has(key)) return null;
    const pressure = totalByCountry.get(key) / days;
    if (pressure < threshold || Math.abs(row.pressure - Math.round(pressure * 1000) / 1000) > 1e-9
      || row.days !== positive.filter((entry) => folded(entry.country) === key).length) return null;
    thresholded.add(key);
  }
  for (const [key, sum] of totalByCountry) if (sum / days >= threshold && !thresholded.has(key)) return null;
  return positive;
};
