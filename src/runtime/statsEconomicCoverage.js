/*! Open Historia - read-only national coverage of event-backed economic crises.
 * Event economicAccounting owns qualitative evidence; Stats receipts own
 * quantified effects. Never derive numerical macro impacts from these rows.
 */
import { buildOwnerAliasMap, canonicalOwnerName } from './ownerNames.js';
import { compareGameDates, isCanonicalGameDate } from './gameDates.js';
import { normalizeStatsEconomicEventAccounting } from './statsEconomicEventAccounting.js';
import { normalizeStatsEventReceipts } from './statsEventReceipts.js';

const array = (value) => Array.isArray(value) ? value : [];
const token = (value) => typeof value === 'string' ? value.trim() : '';
const bounded = (value, maximum = 4) => Number.isInteger(value) && value > 0
  ? Math.min(value, maximum) : maximum;

export const buildCountryEconomicCoverage = ({
  world, events, polity, viewerPolity = '', date, maxRows = 4,
} = {}) => {
  const empty = { status: 'none', confirmedCount: 0, potentialCount: 0,
    assessedCount: 0, confirmed: [], potential: [] };
  const aliases = buildOwnerAliasMap(world?.polityOverrides);
  const resolve = (value) => canonicalOwnerName(value, aliases);
  const target = resolve(polity);
  if (!target || !isCanonicalGameDate(date) || !Array.isArray(events)
    || !world?.countryStats || typeof world.countryStats !== 'object'
    || !Object.hasOwn(world.countryStats, target)) return empty;

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
    .filter((receipt) => resolve(receipt.polity) === target
      && receipt.assessesUnquantifiedEventId && isCanonicalGameDate(receipt.date)
      && compareGameDates(receipt.date, date) <= 0);
  // Preserve closure when bounded receipts are pruned, without a quadratic
  // scan of long event histories on every Country Panel render.
  const assessedHistory = new Map();
  for (const later of events) {
    if (!isCanonicalGameDate(later?.date) || compareGameDates(later.date, date) > 0
      || eventIds.get(token(later?.id)) !== 1
      || (array(later.audience).length && !array(later.audience).some((name) =>
        viewerPolity && resolve(name) === resolve(viewerPolity)))) continue;
    for (const change of array(later?.impacts?.polityChanges)) {
      const origin = token(change?.statsEffects?.assessesUnquantifiedEventId);
      const sourceId = token(change?.statsEffects?.sourceStorylineId);
      if (!origin || !sourceId || resolve(change?.code) !== target
        || !array(later.storylineIds).includes(sourceId)) continue;
      const rows = assessedHistory.get(origin) || [];
      rows.push({ date: later.date, sourceId });
      assessedHistory.set(origin, rows);
    }
  }
  const confirmed = [];
  const potential = [];
  let assessedCount = 0;
  for (const event of events) {
    const id = token(event?.id);
    const eventDate = token(event?.date);
    if (!id || eventIds.get(id) !== 1 || !isCanonicalGameDate(eventDate)
      || compareGameDates(eventDate, date) > 0
      || (array(event.audience).length && !array(event.audience).some((name) =>
        viewerPolity && resolve(name) === resolve(viewerPolity)))) continue;
    const accounting = normalizeStatsEconomicEventAccounting(event.economicAccounting);
    if (!accounting || accounting.status === 'none') continue;
    const linked = array(event.storylineIds).map((id) => sources.get(token(id)))
      .filter((source) => source && array(source.sourceEventIds).includes(id)
        && isCanonicalGameDate(source.startedDate)
        && compareGameDates(source.startedDate, eventDate) <= 0
        && array(source.participants).some((name) => resolve(name) === target));
    const active = linked.some((source) => source.status === 'active');
    const coverage = array(accounting.exposures)
      .find((exposure) => resolve(exposure.polity) === target);
    const resolvedByReceipt = assessedReceipts.some((receipt) =>
      receipt.assessesUnquantifiedEventId === id
      && compareGameDates(receipt.date, eventDate) > 0
      && array(event.storylineIds).includes(receipt.sourceStorylineId)
      && linked.some((source) => source.id === receipt.sourceStorylineId));
    const resolvedAfterPruning = array(assessedHistory.get(id)).some((row) =>
      compareGameDates(row.date, eventDate) > 0
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
