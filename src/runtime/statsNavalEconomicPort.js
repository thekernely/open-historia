/*! Open Historia - read-only dated blockade accounting port for Statistics V2.
 * This module DOES NOT write GDP, budgets, receipts, or history. The legacy
 * whole-turn blockade writer remains active until a single, chronological
 * canonical writer is installed and independently tested.
 */
import { compareGameDates, diffGameDays, isCanonicalGameDate } from "./gameDates.js";
import { BLOCKADE_GDP_A_YEAR, BLOCKADE_BUDGET_A_YEAR } from "./naval/blockade.js";

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
