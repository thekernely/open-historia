/*! Open Historia - bounded, read-only Statistics turn chronology.
 * Chronological events and monthly readings are a plan, not a new canonical
 * economic writer. The single-writer cutover must be separately authorized.
 */
import {
  addGameDays, compareGameDates, diffGameDays, gameDateDaysInMonth,
  isCanonicalGameDate, parseGameDate,
} from "./gameDates.js";
import { validateDatedBlockadeEvidence } from "./statsNavalEconomicPort.js";

const MAX_SPAN_DAYS = 1461;
const MAX_EVENTS = 1000;
const MAX_STEPS = 3500;
const later = (a, b) => compareGameDates(a, b) > 0;
const monthEnd = (date) => {
  const parts = parseGameDate(date);
  return parts && parts.day === gameDateDaysInMonth(parts.year, parts.month);
};

// Plan accrual intervals (fromDate, toDate], authoritative same-day event
// batches, and actual month-end observations. An event is effective BEFORE
// that civil day's accrual; earlier days can never read its future values.
// The order of accepted same-day events is unchanged. A time skip with
// incomplete naval chronology, invalid or unordered event dates, or excessive
// work fails CLOSED; it cannot quietly claim complete simulated history.
// No state, GDP, budget, history, or event is mutated by this planner.
export const planNativeStatsTurnChronology = ({
  fromDate = "", toDate = "", events = [], blockadeDays = null, dailyTicks = false, processDates = [],
} = {}) => {
  const days = diffGameDays(fromDate, toDate);
  if (!isCanonicalGameDate(fromDate) || !isCanonicalGameDate(toDate)
    || !Number.isInteger(days) || days < 1 || days > MAX_SPAN_DAYS
    || !Array.isArray(events) || events.length > MAX_EVENTS
    || !Array.isArray(processDates) || processDates.length > 100) return null;
  const evidence = validateDatedBlockadeEvidence({ fromDate, toDate, blockadeDays });
  if (evidence === null) return null;
  const eventGroups = new Map();
  let previous = fromDate;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const date = event?.date;
    if (!isCanonicalGameDate(date) || compareGameDates(date, fromDate) < 0
      || compareGameDates(date, toDate) > 0 || compareGameDates(date, previous) < 0) return null;
    if (!eventGroups.has(date)) eventGroups.set(date, []);
    eventGroups.get(date).push(index);
    previous = date;
  }
  // Civil month-end boundaries are not equal-spaced 30-day intervals. Iterate
  // the actual signed game calendar (including leap years and years BCE).
  const endDates = new Set([toDate]);
  let day = addGameDays(fromDate, 1);
  for (let index = 0; index < days; index++, day = addGameDays(day, 1)) {
    if (dailyTicks || monthEnd(day)) endDates.add(day);
  }
  for (const date of eventGroups.keys()) endDates.add(date);
  // Native migration begins/ends on authored dates, not arbitrary month ends.
  // Without these exact boundaries its initial population anchor and
  // long-vs-split chronology could disagree.
  for (const date of processDates) {
    if (!isCanonicalGameDate(date)) return null;
    if (compareGameDates(date, fromDate) > 0 && compareGameDates(date, toDate) <= 0) endDates.add(date);
  }
  const dates = [...endDates].sort(compareGameDates);
  const steps = [];
  let cursor = fromDate, rowIndex = 0;
  const tick = (end) => {
    if (!later(end, cursor)) return;
    const previousDate = cursor;
    const positive = [];
    while (rowIndex < evidence.length && compareGameDates(evidence[rowIndex].date, end) <= 0) {
      // Every positive pressure day is assigned to exactly one elapsed tick.
      if (!later(evidence[rowIndex].date, previousDate)) return false;
      positive.push(evidence[rowIndex]);
      rowIndex++;
    }
    steps.push({ type: "tick", fromDate: cursor, toDate: end, blockadeDays: positive });
    cursor = end;
    return true;
  };
  // Accepted events on the day where this turn starts can alter the entire
  // following interval; there is no duplicate accrual of its start day.
  const atStart = eventGroups.get(fromDate);
  if (atStart?.length) steps.push({ type: "events", date: fromDate, indices: atStart });
  for (const date of dates) {
    if (date === fromDate) continue;
    const onDate = eventGroups.get(date);
    if (onDate?.length) {
      const prior = addGameDays(date, -1);
      if (later(prior, cursor) && tick(prior) === false) return null;
      steps.push({ type: "events", date, indices: onDate });
    }
    if (tick(date) === false) return null;
    if (monthEnd(date) || date === toDate) {
      steps.push({ type: "sample", date, monthEnd: Boolean(monthEnd(date)) });
    }
    if (steps.length > MAX_STEPS) return null;
  }
  if (rowIndex !== evidence.length || cursor !== toDate) return null;
  return steps;
};
