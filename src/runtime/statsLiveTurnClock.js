/*! Open Historia - guarded native Statistics turn accrual.
 * This is the first live cutover, deliberately limited to turns with PROVEN
 * zero naval blockade exposure. Positive/unknown naval evidence keeps the
 * legacy turn path until GDP AND fiscal blockade ownership are reconciled.
 * No new national baselines or history from untrusted prose are invented.
 */
import { planNativeStatsTurnChronology } from "./statsTurnChronology.js";
import { diffGameDays } from "./gameDates.js";
import { createStatsChronologyReducerBoundary } from "./statsChronologyReducer.js";
import { advanceNativeDemographicClock } from "./statsDemographicClock.js";
import { advanceNativeMacroEconomyClock } from "./statsNativeEconomyClock.js";
import { advanceNativeProductionClock } from "./statsProductionClock.js";
import { advanceNativeFiscalClock } from "./statsFiscalClock.js";
import { captureCountryStatsHistory } from "./countryStats.js";

const arr = (value) => Array.isArray(value) ? value : [];
const hasBlockade = (entry) => Number(entry?.pressure) > 0;
const hasActiveWar = (entry) => String(entry?.status || "").toLowerCase() !== "ended";

// An absent naval result is evidence of ZERO blockade ONLY in an otherwise
// peaceful turn with no authored/established blockade or war transition.
// In all other cases absence is UNKNOWN. A successful sea run with positive
// observations is also intentionally outside this first limited cutover.
export const provenZeroBlockadeDays = ({ baseWorld, turnFronts, warUpdates = [], fromDate = "", toDate = "" } = {}) => {
  if (!baseWorld || typeof baseWorld !== "object" || Array.isArray(baseWorld)
    || !Array.isArray(warUpdates) || warUpdates.length
    || (baseWorld.blockades != null && !Array.isArray(baseWorld.blockades))
    || (baseWorld.wars != null && !Array.isArray(baseWorld.wars))
    || (baseWorld.battlefields != null && !Array.isArray(baseWorld.battlefields))
    || arr(baseWorld.blockades).length
    || arr(turnFronts?.starts).length || arr(turnFronts?.joins).length
    || arr(turnFronts?.flips).length) return null;
  // A zero-pressure naval report does not make an active LAND war a peaceful
  // turn. Keep wartime backend generation on the legacy path for now.
  if (arr(baseWorld.wars).some(hasActiveWar)
    || arr(baseWorld.battlefields).some((battle) => String(battle?.status || "").toLowerCase() !== "ended")) return null;
  const sea = turnFronts?.sea;
  if (sea) {
    if (!Array.isArray(sea.blockadeDays) || sea.blockadeDays.length
      || !Array.isArray(sea.blockadePeriods) || !Array.isArray(sea.blockades)
      || !fromDate || !toDate || sea.fromDate !== fromDate
      || sea.days !== diffGameDays(fromDate, toDate)
      || sea.blockades.some(hasBlockade)) return null;
    return [];
  }
  return [];
};

// The standard-sheet-only caller must establish scenario Stats mode. Pure
// adapter, used on the already detached canonical event world. This accepts
// only a complete chronological plan; otherwise the caller retains legacy
// behavior without a partial economic mutation.
export const planNativeStatsLiveTurn = ({ baseWorld, turnFronts, warUpdates,
  fromDate = "", toDate = "", events = [], round = 0 } = {}) => {
  if (!baseWorld?.countryStats || !Object.keys(baseWorld.countryStats).length
    || !Array.isArray(events) || !Number.isInteger(round) || round < 1) return null;
  const blockadeDays = provenZeroBlockadeDays({ baseWorld, turnFronts, warUpdates, fromDate, toDate });
  if (blockadeDays === null) return null;
  const steps = planNativeStatsTurnChronology({ fromDate, toDate, events, blockadeDays });
  if (!steps) return null;
  return createStatsChronologyReducerBoundary({
    steps, events,
    accrue(world, step) {
      const baselineWorld = world;
      let next = advanceNativeDemographicClock(world, {
        baselineWorld, fromDate: step.fromDate, toDate: step.toDate,
      });
      next = advanceNativeMacroEconomyClock(next, {
        fromDate: step.fromDate, toDate: step.toDate,
      });
      next = advanceNativeProductionClock(next, {
        fromDate: step.fromDate, toDate: step.toDate,
      });
      return advanceNativeFiscalClock(next, {
        baselineWorld, fromDate: step.fromDate, toDate: step.toDate,
      });
    },
    sample: (world, step) => captureCountryStatsHistory(world, { date: step.date, round }),
  });
};
