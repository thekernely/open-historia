/*! Open Historia - host-private evidence of accepted national Stats mutations.
 * These observations do not authorize mutation or substitute for countryStats.
 */
import { compareGameDates, diffGameDays, isCanonicalGameDate } from "./gameDates.js";
import { normalizeStatsCrisisEstimate, estimateGrowthLimit } from "./statsCrisisEstimate.js";
import { MAX_STAT_INDICES, MAX_CUSTOM_STATS, STAT_INDEX_KEY_PATTERN } from "./statIndexDefinitions.js";

const KEYS = ["population.total", "economy.gdp", "economy.publicDebt", "economy.budgetBalance", "stability"];
const isReceiptMetric = (key) => KEYS.includes(key)
  || (typeof key === "string" && key.startsWith("indices.") && STAT_INDEX_KEY_PATTERN.test(key.slice(8)))
  || (typeof key === "string" && key.startsWith("customStats.") && STAT_INDEX_KEY_PATTERN.test(key.slice(12)));
const reading = (sheet, key) => {
  const [group, name] = key.split(".");
  const value = name ? sheet?.[group]?.[name] : sheet?.[group];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const isRecord = (x) => x && typeof x === "object" && !Array.isArray(x);
const validStorylineId = (id) => typeof id === "string" && !!id.trim() && id.length <= 128;
const validProcess = (row) => isRecord(row) && typeof row.eventId === "string"
  && row.eventId.trim() && row.eventId.length <= 128
  && isCanonicalGameDate(row.startDate) && isCanonicalGameDate(row.endDate)
  && diffGameDays(row.startDate, row.endDate) >= 1 && diffGameDays(row.startDate, row.endDate) <= 730
  && typeof row.annualRealGrowthDelta === "number" && Number.isFinite(row.annualRealGrowthDelta)
  && row.annualRealGrowthDelta !== 0 && Math.abs(row.annualRealGrowthDelta) <= 20
  && ["production", "trade", "policy"].includes(row.cause)
  && (!Object.hasOwn(row, "sourceStorylineId") || validStorylineId(row.sourceStorylineId))
  && (!Object.hasOwn(row, "economicShockEstimate") || (() => {
    const estimate = normalizeStatsCrisisEstimate(row.economicShockEstimate);
    return estimate && validStorylineId(row.sourceStorylineId)
      && row.annualRealGrowthDelta <= -0.25
      && row.annualRealGrowthDelta >= -estimateGrowthLimit(estimate)
      && diffGameDays(row.startDate, row.endDate) <= 90
      && (estimate.channel === "credit" || estimate.channel === "trade"
        ? row.cause === "trade" : row.cause === "production");
  })());
const validResolution = (row) => isRecord(row) && typeof row.eventId === "string"
  && row.eventId.trim() && row.eventId.length <= 128
  && isCanonicalGameDate(row.resolvedDate)
  && typeof row.resolvedByEventId === "string" && row.resolvedByEventId.trim()
  && row.resolvedByEventId.length <= 128 && row.eventId !== row.resolvedByEventId;
export const normalizeStatsEventReceipts = (value) => Array.isArray(value)
  ? value.filter((r) => isRecord(r) && typeof r.eventId === "string" && r.eventId.trim()
    && r.eventId.length <= 128 && typeof r.polity === "string" && r.polity.trim()
    && r.polity.length <= 128 && isCanonicalGameDate(r.date) && Array.isArray(r.changes))
    .map((r) => ({ eventId: r.eventId, polity: r.polity, date: r.date,
      reason: typeof r.reason === "string" ? r.reason.slice(0, 240) : "",
      ...(validStorylineId(r.sourceStorylineId) ? { sourceStorylineId: r.sourceStorylineId } : {}),
      ...(validStorylineId(r.recoversEventId) && r.recoversEventId !== r.eventId
        ? { recoversEventId: r.recoversEventId } : {}),
      ...(validProcess(r.process) ? { process: {
        eventId: r.process.eventId, startDate: r.process.startDate,
        endDate: r.process.endDate, annualRealGrowthDelta: r.process.annualRealGrowthDelta,
        cause: r.process.cause,
        ...(validStorylineId(r.process.sourceStorylineId) ? { sourceStorylineId: r.process.sourceStorylineId } : {}),
        ...(normalizeStatsCrisisEstimate(r.process.economicShockEstimate)
          ? { economicShockEstimate: normalizeStatsCrisisEstimate(r.process.economicShockEstimate) } : {}),
      } } : {}),
      ...(validResolution(r.resolution) && r.resolution.resolvedByEventId === r.eventId
        && r.resolution.resolvedDate === r.date ? { resolution: {
          eventId: r.resolution.eventId, resolvedDate: r.resolution.resolvedDate,
          resolvedByEventId: r.resolution.resolvedByEventId,
        } } : {}),
      changes: r.changes.filter((c) => isRecord(c) && isReceiptMetric(c.metric)
        && (c.before === null || (typeof c.before === "number" && Number.isFinite(c.before)))
        && (c.after === null || (typeof c.after === "number" && Number.isFinite(c.after)))
        && c.before !== c.after).slice(0, 5 + MAX_STAT_INDICES + MAX_CUSTOM_STATS).map((c) => ({
          metric: c.metric, before: c.before, after: c.after,
          delta: c.before === null || c.after === null ? null : c.after - c.before,
        })) }))
    .filter((r) => r.changes.length || r.process || r.resolution)
    .slice(-1200)
  : [];

// Read-only outstanding losses from an accepted event's durable numerical receipts.
// Receipts are bounded history, not lifetime account IDs; if the original has
// been pruned, a later recovery fails closed instead of assuming fresh credit.
export const remainingStatsRecoveryLosses = (receipts, { eventId, polity, date } = {}) => {
  if (!validStorylineId(eventId) || !validStorylineId(polity) || !isCanonicalGameDate(date)) return null;
  const rows = normalizeStatsEventReceipts(receipts);
  const origin = rows.find((row) => row.eventId === eventId && row.polity === polity);
  if (!origin || origin.recoversEventId || compareGameDates(date, origin.date) <= 0) return null;
  const prior = rows.filter((row) => row.polity === polity && row.recoversEventId === eventId);
  const remaining = {};
  for (const change of origin.changes) {
    const key = change.metric;
    if (!(change.delta < 0) || !(key === "stability" || key.startsWith("indices.")
      || key.startsWith("customStats."))) continue;
    const already = prior.reduce((sum, row) => sum
      + (row.changes.find((candidate) => candidate.metric === key)?.delta ?? 0), 0);
    if (!(already >= 0) || already > -change.delta + 1e-8) return null;
    const outstanding = -change.delta - already;
    if (outstanding > 1e-8) remaining[key] = outstanding;
  }
  return remaining;
};
export const appendAcceptedStatsReceipt = (world, { eventId, polity, date, reason, before, after, process = null, resolution = null, sourceStorylineId = null, recoveryOfEventId = null }) => {
  if (!isCanonicalGameDate(date) || !eventId || !polity) throw new Error("Unidentified accepted Statistics event");
  const existing = normalizeStatsEventReceipts(world.statsEventReceipts);
  if (existing.some((r) => r.eventId === eventId && r.polity === polity)) {
    throw new Error("Duplicate Statistics event receipt");
  }
  const indexKeys = Object.keys(after?.indices ?? {})
    .filter((key) => STAT_INDEX_KEY_PATTERN.test(key) && Object.hasOwn(before?.indices ?? {}, key))
    .sort().slice(0, MAX_STAT_INDICES);
  const customKeys = Object.keys(after?.customStats ?? {})
    .filter((key) => STAT_INDEX_KEY_PATTERN.test(key) && Object.hasOwn(before?.customStats ?? {}, key))
    .sort().slice(0, MAX_CUSTOM_STATS);
  const changes = [...KEYS, ...indexKeys.map((key) => `indices.${key}`),
    ...customKeys.map((key) => `customStats.${key}`)].map((metric) => {
    const previous = reading(before, metric);
    const next = reading(after, metric);
    return { metric, before: previous, after: next,
      delta: previous === null || next === null ? null : next - previous };
  }).filter((change) => change.before !== change.after);
  if (process && (!validProcess(process) || process.eventId !== eventId || process.startDate !== date)) {
    throw new Error("Statistics effect has an invalid dated process receipt");
  }
  if (resolution && (!validResolution(resolution) || resolution.resolvedByEventId !== eventId
    || resolution.resolvedDate !== date || process || changes.length)) {
    throw new Error("Statistics influence resolution has an invalid canonical receipt");
  }
  if (sourceStorylineId !== null && (!validStorylineId(sourceStorylineId)
    || (process?.sourceStorylineId && process.sourceStorylineId !== sourceStorylineId))) {
    throw new Error("Invalid Statistics causal storyline receipt");
  }
  if (recoveryOfEventId !== null && (!validStorylineId(recoveryOfEventId)
    || recoveryOfEventId === eventId || process || resolution || !changes.length)) {
    throw new Error("Invalid source-linked Statistics recovery receipt");
  }
  if (!changes.length && !validProcess(process) && !validResolution(resolution)) {
    throw new Error("Statistics effect produced no observable numerical change");
  }
  world.statsEventReceipts = normalizeStatsEventReceipts([...existing, { eventId, polity, date, reason,
    ...(sourceStorylineId ? { sourceStorylineId } : {}),
    ...(recoveryOfEventId ? { recoversEventId: recoveryOfEventId } : {}),
    ...(validProcess(process) ? { process } : {}), ...(validResolution(resolution) ? { resolution } : {}), changes }]);
};
