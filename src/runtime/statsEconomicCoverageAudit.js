/*! Open Historia - native post-turn national economic coverage audit.
 * Read-only: canonical economicAccounting documents exposure, and dated
 * Statistics receipts/accepted events establish assessment. No GDP writer.
 */
import { isCanonicalGameDate } from "./gameDates.js";
import { createCountryEconomicCoverageReader } from "./statsEconomicCoverage.js";

const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const MAX_SAMPLE = 8;

// This is an evidence *completeness* reading, never a source of numerical
// estimates. "No national evidence" is an open follow-up, NOT a finding that
// a country's economy is unaffected or proof that a model reviewed it.
// Counts are exact; returned identifiers are sampled and bounded.
export const buildNationalEconomicCoverageAudit = ({
  world, events, date,
} = {}) => {
  const base = {
    status: "unavailable", complete: false, totalCountries: 0,
    documentedUnresolvedCount: 0, noNationalEvidenceCount: 0,
    assessedCount: 0, documentedUnresolved: [], noNationalEvidence: [],
  };
  if (!isCanonicalGameDate(date) || !Array.isArray(events)
    || !record(world?.countryStats)) return base;

  const polities = Object.keys(world.countryStats).sort((a, b) => a.localeCompare(b));
  const report = { ...base, totalCountries: polities.length };
  // Host-only diagnostic authority: account for all canonical private events.
  // The player-facing Country Panel and multiplayer projections call the
  // reader without this opt-in and retain their per-viewer audience filtering.
  const read = createCountryEconomicCoverageReader({
    world, events, date, includePrivate: true,
  });
  for (const polity of polities) {
    const result = read(polity, MAX_SAMPLE);
    report.documentedUnresolvedCount += result.confirmedCount;
    report.noNationalEvidenceCount += result.potentialCount;
    report.assessedCount += result.assessedCount;
    for (const entry of result.confirmed) {
      if (report.documentedUnresolved.length >= MAX_SAMPLE) break;
      report.documentedUnresolved.push({
        outcome: "documented-unresolved", polity, eventId: entry.eventId,
        sourceStorylineId: entry.sourceStorylineId, date: entry.date,
        channel: entry.channel,
        assessed: false, verifiedExposure: true,
      });
    }
    for (const entry of result.potential) {
      if (report.noNationalEvidence.length >= MAX_SAMPLE) break;
      report.noNationalEvidence.push({
        outcome: "no-national-evidence", polity, eventId: entry.eventId,
        sourceStorylineId: entry.sourceStorylineId, date: entry.date,
        assessed: false, verifiedExposure: false,
      });
    }
  }
  report.status = report.documentedUnresolvedCount ? "incomplete"
    : report.noNationalEvidenceCount ? "evidence-pending" : "complete";
  report.complete = report.status === "complete";
  return report;
};
