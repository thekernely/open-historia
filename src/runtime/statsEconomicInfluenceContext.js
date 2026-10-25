/*! Open Historia - bounded canonical source identities for resolving finite economic causes.
 * Read-only briefing. Never infer a process from narrative event text.
 */
import { compareGameDates, isCanonicalGameDate } from './gameDates.js';
import { normalizeCountryStatEconomicInfluences } from './countryStats.js';
import { normalizeStatsEventReceipts, remainingStatsRecoveryLosses } from './statsEventReceipts.js';

export const buildActiveEconomicInfluenceContext = (world, date, { maxRows = 12 } = {}) => {
  if (!isCanonicalGameDate(date) || !world?.countryStats || typeof world.countryStats !== 'object') return '';
  const active = [];
  for (const [polity, sheet] of Object.entries(world.countryStats)) {
    const rows = normalizeCountryStatEconomicInfluences(sheet?.continuity?.economicInfluences || []);
    if (!rows) continue;
    for (const row of rows) {
      if (compareGameDates(row.startDate, date) > 0 || compareGameDates(row.endDate, date) < 0
        || (row.resolvedDate && compareGameDates(row.resolvedDate, date) <= 0)) continue;
      active.push({ polity, row });
    }
  }
  if (!active.length) return '';
  active.sort((a, b) => compareGameDates(a.row.endDate, b.row.endDate)
    || a.polity.localeCompare(b.polity) || a.row.eventId.localeCompare(b.row.eventId));
  const chosen = active.slice(0, Math.max(1, Math.min(24, Math.trunc(maxRows) || 12)));
  const display = (text) => JSON.stringify(text);
  return `[Unresolved national economic influences - canonical source IDs, ${chosen.length} of ${active.length}]
Only resolve a listed exact event ID for its listed polity if an accepted event establishes that the cause has ENDED, not merely improved. Effects otherwise remain active until their original end date. These records are numerical model assumptions, not verified historical measurements.
${chosen.map(({polity, row}) => `- polity=${display(polity)}; sourceEventId=${display(row.eventId)}; scheduledEnd=${row.endDate}; annualRealGrowthDelta=${row.annualRealGrowthDelta}; cause=${row.cause}${row.sourceStorylineId ? `; sourceStorylineId=${display(row.sourceStorylineId)}` : ""}${row.economicShockEstimate ? `; numericalAuthority=simulation-estimate; channel=${row.economicShockEstimate.channel}; exposure=${row.economicShockEstimate.exposure}` : ""}; reason=${display(row.reason)}`).join('\n')}`;
};

// Finite, receipt-backed recovery hints for the existing jump request. Never
// infer a recoverable amount from prose, a storyline, or the current metric.
export const buildRecoverableStatsLossContext = (world, date, { maxRows = 8 } = {}) => {
  if (!isCanonicalGameDate(date) || !world?.countryStats) return '';
  const rows = normalizeStatsEventReceipts(world.statsEventReceipts);
  const available = rows.flatMap((row) => {
    if (!Object.hasOwn(world.countryStats, row.polity) || row.recoversEventId) return [];
    const outstanding = remainingStatsRecoveryLosses(rows, {
      eventId: row.eventId, polity: row.polity, date,
    });
    const keys = outstanding && Object.entries(outstanding).filter(([, amount]) => amount > 1e-8);
    return keys?.length ? [{ row, keys }] : [];
  });
  if (!available.length) return '';
  const limited = available.slice(-Math.max(1, Math.min(12, Math.trunc(maxRows) || 8)));
  const asString = (value) => JSON.stringify(value);
  return `[Recorded national losses potentially eligible for later recovery - ${limited.length} of ${available.length}]
These are historical numerical losses, NOT automatic restoration or proof of repair. Only a genuinely documented later recovery event may reference the original exact Stats sourceEventId using recoveryOfEventId. Restored values may NOT exceed the outstanding loss; the native validator checks current metric and scenario bounds. No GDP, demographic or unmeasured recovery is authorized.
${limited.map(({ row, keys }) => `- polity=${asString(row.polity)}; sourceEventId=${asString(row.eventId)}; date=${row.date}; remaining=${keys.slice(0,8).map(([key, amount])=>`${asString(key)}:${Number(amount.toFixed(6))}`).join(',')}`).join('\n')}`;
};
