/*! Open Historia - read-only follow-up for accepted but unquantified national economic events.
 * Event history owns the declaration; storylines own causal lifecycle; countryStats
 * owns numbers. This is a bounded prompt view, NOT a second canonical queue.
 */
import { compareGameDates, isCanonicalGameDate } from './gameDates.js';
import { normalizeStatsEconomicEventAccounting } from './statsEconomicEventAccounting.js';
import { normalizeStatsEventReceipts } from './statsEventReceipts.js';

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

  // Receipts are the native numerical authority. A completed assessment is
  // per-country evidence, never proof that every participant was affected.
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
    const assessed = [...new Set(assessments.filter((receipt) =>
      receipt.assessesUnquantifiedEventId === id
      && rows(event.storylineIds).includes(receipt.sourceStorylineId)
      && compareGameDates(receipt.date, eventDate) > 0)
      .map((receipt) => text(receipt.polity)).filter(Boolean))].sort();
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

  // Recent supported causes are most useful; reserve two slots for the oldest
  // still-uncertain declarations so a long-running crisis is not starved forever.
  const active = pending.filter((row) => row.status === 'active-source');
  const other = pending.filter((row) => row.status !== 'active-source');
  const priority = [...active.reverse(), ...other.reverse()];
  const limit = bounded(maxRows, 8, 12);
  const chosen = priority.slice(0, limit);
  if (priority.length > limit && limit >= 3) {
    const oldest = [...pending].find((row) => !chosen.includes(row));
    if (oldest) chosen[limit - 1] = oldest;
  }
  const display = chosen.map((row) =>
    `- originalEventId=${quoted(row.id)}; date=${row.date}; title=${quoted(row.title)}; accountingReason=${quoted(row.reason)}; accountingStatus=${row.accountingStatus}${row.eventEvidence ? `; sourceEventEvidence=${quoted(row.eventEvidence)}` : ''}${row.documentedExposures.length ? `; documentedNationalExposures=${quoted(row.documentedExposures)}` : ''}; sourceStatus=${row.status}${row.sourceId ? `; sourceStorylineId=${quoted(row.sourceId)}` : ''}${row.participants.length ? `; storylineParticipants= ${quoted(row.participants)} (CANDIDATES, NOT verified affected polities)` : ''}${row.hiddenParticipants ? `; additionalParticipantsNotShown=${row.hiddenParticipants}` : ''}${row.assessedPolityCount ? `; receiptBackedAssessedPolities=${quoted(row.assessedPolities)}; assessedPolityCount=${row.assessedPolityCount}` : ''}`);

  return `[Economic events with unresolved quantitative coverage - ${chosen.length} of ${pending.length} canonical declarations]
An 'unquantified' declaration has NO authorized numerical GDP effect. This is a historical follow-up, not permission to rewrite the original event, infer exposure from storyline pressure, mark every participant affected, or manufacture an observed GDP loss. Check subsequent evidence and country-specific mechanisms. Only a NEW accepted dated event with concrete national evidence may propose a bounded typed Statistics influence, using an active, exactly event-linked storyline. When this new event quantifies a prior unquantified declaration for ONE country, use the exact originalEventId as statsEffects.assessesUnquantifiedEventId alongside sourceStorylineId and economicShockEstimate. receiptBackedAssessedPolities are already assessed for that source and must not be counted twice. Other countries still require independent exposure evidence. If sourceStatus is inactive or unconfirmed, no source ID here authorizes an estimate: establish a valid new causal event or keep it unquantified. Do not retrospectively backdate effects or mark the whole crisis resolved.
${display.join('\n')}`;
};
