/*! Open Historia - read-only follow-up for accepted but unquantified national economic events.
 * Event history owns the declaration; storylines own causal lifecycle; countryStats
 * owns numbers. This is a bounded prompt view, NOT a second canonical queue.
 */
import { compareGameDates, gameDateDayNumber, isCanonicalGameDate } from './gameDates.js';
import { normalizeStatsEconomicEventAccounting } from './statsEconomicEventAccounting.js';
import { normalizeStatsEventReceipts } from './statsEventReceipts.js';
import { indexRetainedEconomicAssessments } from './statsEconomicCoverage.js';
import { buildOwnerAliasMap, canonicalOwnerName } from './ownerNames.js';

const text = (value) => typeof value === 'string' ? value.trim() : '';
const rows = (value) => Array.isArray(value) ? value : [];
const bounded = (value, fallback, limit) => Number.isInteger(value) && value > 0
  ? Math.min(value, limit) : fallback;
const quoted = (value) => JSON.stringify(value);

export const buildUnquantifiedEconomicAssessmentContext = (
  world, events, date, { maxRows = 8 } = {},
) => {
  if (!isCanonicalGameDate(date) || !Array.isArray(events)) return '';
  const sourceCounts = new Map();
  for (const source of rows(world?.storylines)) {
    const id = text(source?.id);
    if (!id) continue;
    sourceCounts.set(id, (sourceCounts.get(id) || 0) + 1);
  }
  const sources = new Map(rows(world?.storylines).filter((row) =>
    sourceCounts.get(text(row?.id)) === 1 && text(row?.id).length <= 128)
    .map((row) => [row.id, row]));
  const eventCounts = new Map();
  for (const event of events) {
    const id = text(event?.id);
    if (id) eventCounts.set(id, (eventCounts.get(id) || 0) + 1);
  }
  const aliases = buildOwnerAliasMap(world?.polityOverrides);
  const resolve = (name) => canonicalOwnerName(name, aliases);
  // When the bounded receipt ledger is pruned, the retained validated event
  // is still durable evidence. Reuse the Country Panel's exact native index:
  // source IDs alone or an invalid numerical estimate never close an event.
  const retainedAssessments = indexRetainedEconomicAssessments({
    events, date, eventIds: eventCounts, resolve, includePrivate: true,
  });

  // Receipts remain the native numerical authority; a matching retained
  // accepted event preserves that fact after pruning. Closure is per-country,
  // not proof that everyone in the storyline suffered a national loss.
  const assessments = normalizeStatsEventReceipts(world?.statsEventReceipts)
    .filter((row) => row.assessesUnquantifiedEventId
      && compareGameDates(row.date, date) <= 0);
  const pending = [];
  for (const event of events) {
    const id = text(event?.id);
    const eventDate = text(event?.date);
    const declaration = normalizeStatsEconomicEventAccounting(event?.economicAccounting);
    if (!id || id.length > 128 || eventCounts.get(id) !== 1
      || !isCanonicalGameDate(eventDate) || compareGameDates(eventDate, date) > 0
      || !declaration || (declaration.status !== 'unquantified'
        && !rows(declaration.exposures).length)) continue;
    const links = [...new Set(rows(event.storylineIds).map(text).filter(Boolean))]
      .map((sourceId) => sources.get(sourceId))
      .filter((source) => source && rows(source.sourceEventIds).includes(id)
        && isCanonicalGameDate(source.startedDate)
        && compareGameDates(source.startedDate, eventDate) <= 0);
    const active = links.filter((source) => source.status === 'active');
    const link = active[0] || links[0] || null;
    const participantNames = [...new Set(rows(link?.participants)
      .map((value) => text(value).slice(0, 96)).filter(Boolean))];
    const linkedSourceIds = new Set(links.map((source) => source.id));
    const byReceipt = assessments.filter((receipt) =>
      receipt.assessesUnquantifiedEventId === id
      && linkedSourceIds.has(receipt.sourceStorylineId)
      && compareGameDates(receipt.date, eventDate) > 0)
      .map((receipt) => resolve(receipt.polity));
    const byHistory = (retainedAssessments.get(id) || [])
      .filter((row) => linkedSourceIds.has(row.sourceId)
        && compareGameDates(row.date, eventDate) > 0)
      .map((row) => row.polity);
    const assessed = [...new Set([...byReceipt, ...byHistory].filter(Boolean))].sort();
    pending.push({
      id,
      date: eventDate,
      title: text(event.title).slice(0, 96),
      reason: declaration.reason,
      accountingStatus: declaration.status,
      documentedExposures: rows(declaration.exposures).slice(0, 3).map((entry) => ({
        polity: entry.polity, channel: entry.channel, exposure: entry.exposure,
        evidence: entry.evidence.slice(0, 140),
      })),
      // The accounting reason describes WHY no numeric figure was booked, not
      // necessarily WHAT happened. Preserve the original accepted narrative as
      // bounded, quoted evidence or direct country disruptions disappear here.
      eventEvidence: text(event.description).slice(0, 360),
      status: link ? (link.status === 'active' ? 'active-source' : 'inactive-source') : 'no-confirmed-source',
      sourceId: link?.id || '',
      participants: participantNames.slice(0, 5),
      hiddenParticipants: Math.max(0, participantNames.length - 5),
      assessedPolities: assessed.slice(0, 4),
      assessedPolityCount: assessed.length,
    });
  }
  if (!pending.length) return '';

  // A fixed newest-first top-N starved the same middle declarations forever
  // (11 unresolved Opossum events, but a standard briefing of eight). Keep
  // the two newest actionable sources and one oldest declaration when there
  // is room; rotate remaining slots over the other canonical declarations.
  // Game-date weeks, not wall time or mutable save counters, make the schedule
  // deterministic across save/reload, multiplayer and ancient-era calendars.
  const active = pending.filter((row) => row.status === 'active-source');
  const other = pending.filter((row) => row.status !== 'active-source');
  const priority = [...active.reverse(), ...other.reverse()];
  const limit = bounded(maxRows, 8, 12);
  let chosen = priority.slice(0, limit);
  if (priority.length > limit) {
    const fixedNewCount = limit >= 5 ? 2 : limit >= 3 ? 1 : 0;
    const fixedOldCount = limit >= 3 ? 1 : 0;
    // Reserve the chronologically oldest event, not merely the tail of the
    // active-before-inactive priority list (which may be a newer inactive one).
    const oldestEvent = fixedOldCount ? pending.reduce((oldest, row) =>
      compareGameDates(row.date, oldest.date) < 0 ? row : oldest) : null;
    const remaining = oldestEvent
      ? priority.filter((row) => row !== oldestEvent) : priority;
    const recent = remaining.slice(0, fixedNewCount);
    const oldest = oldestEvent ? [oldestEvent] : [];
    const rotating = remaining.slice(fixedNewCount);
    const slots = limit - recent.length - oldest.length;
    const week = Math.floor(gameDateDayNumber(date) / 7);
    // Shift by a whole window each week. A stable backlog is visited in
    // ceil(rotating.length / slots) weekly jumps, not indefinitely ignored.
    const start = ((week * slots) % rotating.length + rotating.length)
      % rotating.length;
    const scheduled = [...rotating.slice(start), ...rotating.slice(0, start)]
      .slice(0, slots);
    chosen = [...recent, ...scheduled, ...oldest];
  }
  const display = chosen.map((row) =>
    `- originalEventId=${quoted(row.id)}; date=${row.date}; title=${quoted(row.title)}; accountingReason=${quoted(row.reason)}; accountingStatus=${row.accountingStatus}${row.eventEvidence ? `; sourceEventEvidence=${quoted(row.eventEvidence)}` : ''}${row.documentedExposures.length ? `; documentedNationalExposures=${quoted(row.documentedExposures)}` : ''}; sourceStatus=${row.status}${row.sourceId ? `; sourceStorylineId=${quoted(row.sourceId)}` : ''}${row.participants.length ? `; storylineParticipants= ${quoted(row.participants)} (CANDIDATES, NOT verified affected polities)` : ''}${row.hiddenParticipants ? `; additionalParticipantsNotShown=${row.hiddenParticipants}` : ''}${row.assessedPolityCount ? `; acceptedAssessedPolities=${quoted(row.assessedPolities)}; assessedPolityCount=${row.assessedPolityCount}` : ''}`);

  return `[Economic events with unresolved quantitative coverage - ${chosen.length} of ${pending.length} canonical declarations]
An 'unquantified' declaration has NO authorized numerical GDP effect. This is a historical follow-up, not permission to rewrite the original event, infer exposure from storyline pressure, mark every participant affected, or manufacture an observed GDP loss. Check subsequent evidence and country-specific mechanisms. Only a NEW accepted dated event with concrete national evidence may propose a bounded typed Statistics influence, using an active, exactly event-linked storyline. When this new event quantifies a prior unquantified declaration for ONE country, use the exact originalEventId as statsEffects.assessesUnquantifiedEventId alongside sourceStorylineId and economicShockEstimate. acceptedAssessedPolities are already assessed for that source (by native receipt or retained accepted effect) and must not be counted twice. Other countries still require independent exposure evidence. If sourceStatus is inactive or unconfirmed, no source ID here authorizes an estimate: establish a valid new causal event or keep it unquantified. Do not retrospectively backdate effects or mark the whole crisis resolved.
${display.join('\n')}`;
};
