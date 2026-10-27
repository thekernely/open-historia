/*! Open Historia - read-only national coverage of event-backed economic crises.
 * Event economicAccounting owns qualitative evidence; Stats receipts own
 * quantified effects. Never derive numerical macro impacts from these rows.
 */
import { buildOwnerAliasMap, canonicalOwnerName } from './ownerNames.js';
import { compareGameDates, isCanonicalGameDate } from './gameDates.js';
import { normalizeStatsEconomicEventAccounting } from './statsEconomicEventAccounting.js';
import { normalizeStatsEventReceipts } from './statsEventReceipts.js';
import { normalizeStatsCrisisEstimate, estimateGrowthLimit } from './statsCrisisEstimate.js';

const array = (value) => Array.isArray(value) ? value : [];
const token = (value) => typeof value === 'string' ? value.trim() : '';
const bounded = (value, maximum = 4) => Number.isInteger(value) && value > 0
  ? Math.min(value, maximum) : maximum;

// A source ID alone is never proof of a completed economic assessment. After
// bounded receipts age out, only a retained accepted event containing the
// same dated, finite and evidence-backed negative effect may close coverage.
// Do not let a malformed/synthetic metadata-only event erase an old warning.
const hasRetainedAssessment = (effect) => {
  const estimate = normalizeStatsCrisisEstimate(effect?.economicShockEstimate);
  if (!estimate || !Number.isFinite(effect.annualRealGrowthDelta)
    || effect.annualRealGrowthDelta > -0.25
    || effect.annualRealGrowthDelta < -estimateGrowthLimit(estimate)
    || !Number.isInteger(effect.durationDays)
    || effect.durationDays < 1 || effect.durationDays > 90
    || (estimate.channel === 'credit' || estimate.channel === 'trade'
      ? effect.gdpCause !== 'trade' : effect.gdpCause !== 'production')
    || typeof effect.reason !== 'string' || effect.reason.trim().length < 12) return false;
  return true;
};

// An accepted, retained event supplies evidence after the bounded receipt
// ledger is pruned. Share this strictly validated index between the Country
// Panel's coverage reader and the AI's deferred-review briefing; otherwise the
// next model turn can be told to assess a national crisis already assessed.
// Entries are only candidate closures: callers must additionally prove that
// the original event is older and linked to the *same canonical storyline*.
export const indexRetainedEconomicAssessments = ({
  events, date, eventIds, resolve = token, viewer = '', includePrivate = false,
} = {}) => {
  const indexed = new Map();
  if (!Array.isArray(events) || !isCanonicalGameDate(date)
    || !(eventIds instanceof Map)) return indexed;
  for (const later of events) {
    if (!isCanonicalGameDate(later?.date) || compareGameDates(later.date, date) > 0
      || eventIds.get(token(later?.id)) !== 1
      || (!includePrivate && array(later.audience).length
        && !array(later.audience).some((name) =>
          viewer && resolve(name) === viewer))) continue;
    for (const change of array(later?.impacts?.polityChanges)) {
      const effect = change?.statsEffects;
      const originalId = token(effect?.assessesUnquantifiedEventId);
      const sourceId = token(effect?.sourceStorylineId);
      if (!originalId || !sourceId || !array(later.storylineIds).includes(sourceId)
        || !hasRetainedAssessment(effect)) continue;
      const polity = resolve(change?.code);
      if (!polity) continue;
      const rows = indexed.get(originalId) || [];
      rows.push({ date: later.date, sourceId, polity });
      indexed.set(originalId, rows);
    }
  }
  return indexed;
};

// Reuse one source/receipt/index scan when a multiplayer host builds the
// coverage of many countries for one authorized viewer.
export const createCountryEconomicCoverageReader = ({
  world, events, viewerPolity = '', date, includePrivate = false,
} = {}) => {
  const empty = { status: 'none', confirmedCount: 0, potentialCount: 0,
    assessedCount: 0, confirmed: [], potential: [] };
  const aliases = buildOwnerAliasMap(world?.polityOverrides);
  const resolve = (value) => canonicalOwnerName(value, aliases);
  if (!isCanonicalGameDate(date) || !Array.isArray(events)
    || !world?.countryStats || typeof world.countryStats !== 'object') {
    return () => ({ ...empty, confirmed: [], potential: [] });
  }
  const viewer = resolve(viewerPolity);

  const eventIds = new Map();
  for (const event of events) {
    const id = token(event?.id);
    if (id) eventIds.set(id, (eventIds.get(id) || 0) + 1);
  }
  const sourceCounts = new Map();
  for (const source of array(world.storylines)) {
    const id = token(source?.id);
    if (id) sourceCounts.set(id, (sourceCounts.get(id) || 0) + 1);
  }
  const sources = new Map(array(world.storylines)
    .filter((source) => sourceCounts.get(token(source?.id)) === 1)
    .map((source) => [source.id, source]));
  const assessedReceipts = normalizeStatsEventReceipts(world.statsEventReceipts)
    .filter((receipt) => receipt.assessesUnquantifiedEventId
      && isCanonicalGameDate(receipt.date)
      && compareGameDates(receipt.date, date) <= 0);
  // One shared retained-event assessment index also drives the AI follow-up
  // briefing, so receipt pruning cannot make a country look unassessed there.
  const assessedHistory = indexRetainedEconomicAssessments({
    events, date, eventIds, resolve, viewer, includePrivate,
  });
  // Event/date/accounting and causal-source admission are independent of
  // which country is being inspected. Parse once; preserve the unique-ID
  // and private-audience guards for every country in the resulting reader.
  const considered = [];
  for (const event of events) {
    const id = token(event?.id);
    const eventDate = token(event?.date);
    if (!id || eventIds.get(id) !== 1 || !isCanonicalGameDate(eventDate)
      || compareGameDates(eventDate, date) > 0
      || (!includePrivate && array(event.audience).length
        && !array(event.audience).some((name) =>
          viewer && resolve(name) === viewer))) continue;
    const accounting = normalizeStatsEconomicEventAccounting(event.economicAccounting);
    if (!accounting || accounting.status === 'none') continue;
    const sourceRows = array(event.storylineIds).map((id) => sources.get(token(id)))
      .filter((source) => source && array(source.sourceEventIds).includes(id)
        && isCanonicalGameDate(source.startedDate)
        && compareGameDates(source.startedDate, eventDate) <= 0);
    considered.push({ event, id, eventDate, accounting, sourceRows });
  }
  return (polity, maxRows = 4) => {
  const target = resolve(polity);
  if (!target || !Object.hasOwn(world.countryStats, target)) {
    return { ...empty, confirmed: [], potential: [] };
  }
  const countryReceipts = assessedReceipts.filter((receipt) => resolve(receipt.polity) === target);
  const confirmed = [];
  const potential = [];
  let assessedCount = 0;
  for (const { event, id, eventDate, accounting, sourceRows } of considered) {
    const linked = sourceRows.filter((source) =>
      array(source.participants).some((name) => resolve(name) === target));
    const active = linked.some((source) => source.status === 'active');
    const coverage = array(accounting.exposures)
      .find((exposure) => resolve(exposure.polity) === target);
    const resolvedByReceipt = countryReceipts.some((receipt) =>
      receipt.assessesUnquantifiedEventId === id
      && compareGameDates(receipt.date, eventDate) > 0
      && array(event.storylineIds).includes(receipt.sourceStorylineId)
      && linked.some((source) => source.id === receipt.sourceStorylineId));
    const resolvedAfterPruning = array(assessedHistory.get(id)).some((row) =>
      row.polity === target && compareGameDates(row.date, eventDate) > 0
      && linked.some((source) => source.id === row.sourceId));
    if (resolvedByReceipt || resolvedAfterPruning) { assessedCount++; continue; }
    if (coverage) {
      confirmed.push({ eventId: id, date: eventDate,
        title: token(event.title).slice(0, 120),
        sourceStorylineId: active ? linked.find((source) => source.status === 'active').id : '',
        channel: coverage.channel, exposure: coverage.exposure,
        evidence: coverage.evidence, active });
    } else if (accounting.status === 'unquantified' && active) {
      // A storyline participant is NOT a verified economic exposure. Existing
      // saves without new structured evidence get only a clearly tentative note.
      potential.push({ eventId: id, date: eventDate,
        title: token(event.title).slice(0, 120),
        sourceStorylineId: linked.find((source) => source.status === 'active').id });
    }
  }
  const newestFirst = (a, b) => compareGameDates(b.date, a.date)
    || a.eventId.localeCompare(b.eventId);
  confirmed.sort(newestFirst);
  potential.sort(newestFirst);
  return { status: confirmed.length ? 'documented-unquantified'
    : potential.length ? 'potential-unverified' : 'none',
    confirmedCount: confirmed.length, potentialCount: potential.length,
    assessedCount, confirmed: confirmed.slice(0, bounded(maxRows)),
    potential: potential.slice(0, bounded(maxRows)) };
  };
};

// A single Country Panel read keeps its original public API and exact result.
export const buildCountryEconomicCoverage = ({
  world, events, polity, viewerPolity = '', date, maxRows = 4,
} = {}) => createCountryEconomicCoverageReader({
  world, events, viewerPolity, date,
})(polity, maxRows);
