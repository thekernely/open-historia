/*! Open Historia - headless, read-only-input native Statistics playtest.
 * This is the real chronological Stats reducer, NOT an AI/provider jump, front
 * resolver, narrative curator, save-import, or complete game turn.
 */
import { createHash } from "node:crypto";
import { addGameDays, compareGameDates, diffGameDays, isCanonicalGameDate } from "../src/runtime/gameDates.js";
import { applyEventImpactsToWorld, normalizeEvents, normalizeWorldState } from "../src/runtime/gameState.js";
import { planNativeStatsLiveTurn } from "../src/runtime/statsLiveTurnClock.js";
import { planNeutralStatsLiveTurn } from "../src/runtime/statsNeutralTurnClock.js";
import { validateGeneratedStatsEconomicAccounting } from "../src/runtime/statsEconomicEventAccounting.js";
import { normalizeGameplayPayload, validateGameplayPayload } from "../src/Game/AI/gameplaySchemas.js";
import { buildNationalEconomicCoverageAudit } from "../src/runtime/statsEconomicCoverageAudit.js";

const object = (v) => v && typeof v === "object" && !Array.isArray(v);
export const digest = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const metric = (sheet, key) => {
  const value = sheet?.economy?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const roundValue = (v) => v === null ? null : Number(v.toPrecision(12));
const metricChange = (a, b) => a === null || b === null ? null : roundValue(b - a);
const fail = (message) => { throw new Error(message); };

export const runNativePlaytest = ({ game, world, historicalEvents = [], colors = {},
  turn, regionCatalog = null } = {}) => {
  if (!object(game) || !object(world) || !Array.isArray(historicalEvents)
    || !object(turn) || !object(colors)) fail("Playtest needs canonical game, world, historical events and a turn");
  const fromDate = game.gameDate;
  const toDate = turn.toDate;
  if (!isCanonicalGameDate(fromDate) || !isCanonicalGameDate(toDate)
    || compareGameDates(fromDate, toDate) >= 0
    || diffGameDays(fromDate, toDate) > 366) fail("Invalid bounded forward in-game date range");
  if (!Number.isInteger(game.round) || game.round < 0) fail("Game round is not canonical");
  if (!object(world.countryStats) || !Object.keys(world.countryStats).length) {
    fail("No initialized canonical country Statistics");
  }
  if (turn.provider || turn.prompt || turn.model) {
    fail("Provider generation is unsupported by the offline runner; no AI request was made");
  }
  if (turn.neutralOnly !== undefined && turn.neutralOnly !== true) {
    fail("neutralOnly may only be explicitly true; no unsupported automatic wartime fallback");
  }
  if (object(turn.generatedPayload) && turn.events !== undefined) {
    fail("Specify generatedPayload or events, not both");
  }
  let proposed = turn.events ?? [];
  if (object(turn.generatedPayload)) {
    const candidate = normalizeGameplayPayload("jumpForward", structuredClone(turn.generatedPayload));
    const check = validateGameplayPayload("jumpForward", candidate);
    if (!check.valid) fail(`Generated jump response rejected by game schema: ${check.error}`);
    if (candidate.stopDate !== toDate) fail("Generated jump stopDate does not match requested toDate");
    proposed = candidate.events;
  }
  if (!Array.isArray(proposed) || proposed.length > 64) fail("Turn events must be a bounded array");
  const accountingError = validateGeneratedStatsEconomicAccounting(proposed);
  if (accountingError) fail(`Economic admission rejected: ${accountingError}`);
  const eventIds = new Set();
  for (const event of proposed) {
    if (typeof event?.id !== "string" || !event.id.trim() || eventIds.has(event.id)) {
      fail("Each supplied event needs a unique stable ID");
    }
    eventIds.add(event.id);
    if (!isCanonicalGameDate(event.date)
      || compareGameDates(event.date, fromDate) <= 0
      || compareGameDates(event.date, toDate) > 0) {
      fail(`Event ${event.id} is outside the forward time-skip window`);
    }
  }
  const eventRows = normalizeEvents(proposed);
  if (eventRows.length !== proposed.length) fail("Event normalization removed a supplied event");
  const historicalIds = new Set(historicalEvents.map((row) => row?.id).filter(Boolean));
  if ([...eventIds].some((id) => historicalIds.has(id))) {
    fail("Turn reuses a historical event ID");
  }
  const sourceHash = digest({ game, world, historicalEvents, colors, turn });
  const beforeWorld = normalizeWorldState(structuredClone(world));
  const beforeNames = Object.keys(beforeWorld.countryStats).sort();
  const round = game.round + 1;
  const chronologyArgs = {
    baseWorld: beforeWorld, fromDate, toDate, round, events: eventRows,
    warUpdates: [], turnFronts: null, regionCatalog,
  };
  const full = planNativeStatsLiveTurn(chronologyArgs);
  const chronology = full || (turn.neutralOnly
    ? planNeutralStatsLiveTurn(chronologyArgs) : null);
  if (!chronology) {
    fail("Native Statistics chronology unavailable (incomplete war/naval evidence or unsupported state). No unverified full-country fallback.");
  }
  const nativeSettled = chronology.partial
    ? new Set(chronology.scopedCountries) : null;
  const settled = applyEventImpactsToWorld({
    world: beforeWorld, colors: structuredClone(colors), events: eventRows,
    historicalEvents, regionCatalog,
    motion: { originDate: fromDate, round, tick: 0 },
    statsChronology: chronology,
  });
  const afterWorld = settled.world;
  const rename = new Map((settled.renamedPolities || []).map((row) => [row.from, row.to]));
  const names = Object.keys(afterWorld.countryStats).sort();
  if (names.length !== beforeNames.length) fail("Native Statistics ownership count changed unexpectedly");
  const countryChanges = beforeNames.map((name) => {
    const afterName = rename.get(name) || name;
    const before = beforeWorld.countryStats[name];
    const after = afterWorld.countryStats[afterName];
    if (!after) fail(`Statistics sheet disappeared: ${name}`);
    const selected = nativeSettled === null || nativeSettled.has(afterName);
    if (selected && after.continuity?.nativeEconomyClock?.lastDate !== toDate) {
      fail(`Native GDP cursor did not reach target date: ${afterName}`);
    }
    if (nativeSettled && !selected && eventRows.length === 0
      && (metric(before, "gdp") !== metric(after, "gdp")
        || metric(before, "unemployment") !== metric(after, "unemployment"))) {
      fail(`An excluded wartime polity acquired unverified native economic changes: ${afterName}`);
    }
    const previousGdp = metric(before, "gdp");
    const nextGdp = metric(after, "gdp");
    const previousUnemployment = metric(before, "unemployment");
    const nextUnemployment = metric(after, "unemployment");
    return {
      country: afterName, nativeSettled: selected,
      gdpBefore: previousGdp, gdpAfter: nextGdp,
      gdpDelta: metricChange(previousGdp, nextGdp),
      unemploymentBefore: previousUnemployment,
      unemploymentAfter: nextUnemployment,
      unemploymentDelta: metricChange(previousUnemployment, nextUnemployment),
      annualRealGrowth: metric(after, "gdpGrowth"),
    };
  });
  const previousReceipts = new Set((beforeWorld.statsEventReceipts || [])
    .map((row) => `${row.eventId}:${row.polity}`));
  const newReceipts = (afterWorld.statsEventReceipts || [])
    .filter((row) => !previousReceipts.has(`${row.eventId}:${row.polity}`));
  const allEvents = [...historicalEvents, ...eventRows];
  const coverage = buildNationalEconomicCoverageAudit({
    world: afterWorld, events: allEvents, date: toDate,
  });
  const report = {
    schema: "open-historia-native-playtest/1",
    mode: chronology.partial ? "native-neutral-scope-only" : "native-stats-only",
    partial: Boolean(chronology.partial),
    nativeSettledCountryCount: countryChanges.filter((row) => row.nativeSettled).length,
    notNativeSettledCountries: countryChanges.filter((row) => !row.nativeSettled)
      .map((row) => row.country).sort(),
    providerCalled: false, fullGameplayTurn: false, originalInputModified: false,
    fromDate, toDate, round, originalCountryCount: beforeNames.length,
    resultingCountryCount: names.length, proposedEventCount: proposed.length,
    acceptedEventCount: eventRows.length,
    newStatsReceiptCount: newReceipts.length, newStatsReceipts: newReceipts,
    countryChanges, coverage,
    observations: {
      everyCountryGdpIncreased: countryChanges.every((row) =>
        row.nativeSettled && row.gdpDelta !== null && row.gdpDelta > 0),
      everyCountryUnemploymentFell: countryChanges.every((row) =>
        row.nativeSettled && row.unemploymentDelta !== null && row.unemploymentDelta < 0),
      noNewCountryStatsReceipts: newReceipts.length === 0,
    },
  };
  if (sourceHash !== digest({ game, world, historicalEvents, colors, turn })) {
    fail("Playtest mutated source input");
  }
  const resultGame = { ...game, gameDate: toDate, round };
  return {
    report: { ...report, resultingWorldSha256: digest(afterWorld),
      reportSha256: digest(report) },
    // For diagnostics only; NOT a complete UI/provider game save.
    snapshot: { schema: "open-historia-native-playtest-snapshot/1",
      game: resultGame, world: afterWorld, colors: settled.colors,
      events: allEvents },
  };
};

// Compare the native result with an independently saved campaign state.
 // Only fields the native clock owns are compared. This is NOT proof that the
 // AI's narrative, diplomacy, units, projects or wider full-game state match.
export const compareNativePlaytestToSave = (snapshot, savedGame, savedWorld) => {
  if (!object(snapshot?.game) || !object(snapshot?.world?.countryStats)
    || !object(savedGame) || !object(savedWorld?.countryStats)) {
    fail("Comparison requires the native snapshot and an independently saved game/world");
  }
  const dateMatches = snapshot.game.gameDate === savedGame.gameDate;
  const expectedNames = Object.keys(savedWorld.countryStats).sort();
  const actualNames = Object.keys(snapshot.world.countryStats).sort();
  const countryNamesMatch = digest(expectedNames) === digest(actualNames);
  const mismatches = [];
  for (const country of expectedNames) {
    const expected = savedWorld.countryStats[country];
    const actual = snapshot.world.countryStats[country];
    if (!actual) {
      mismatches.push({ country, field: "countryStats", expected: "present", actual: "missing" });
      continue;
    }
    for (const [field, tolerance] of [["gdp", 0.01], ["unemployment", 0.0001]]) {
      const e = metric(expected, field);
      const a = metric(actual, field);
      if (e === null || a === null || Math.abs(e - a) > tolerance) {
        mismatches.push({ country, field: `economy.${field}`, expected: e, actual: a });
      }
    }
    const expectedDate = expected.continuity?.nativeEconomyClock?.lastDate ?? null;
    const actualDate = actual.continuity?.nativeEconomyClock?.lastDate ?? null;
    if (expectedDate !== actualDate) {
      mismatches.push({ country, field: "nativeEconomyClock.lastDate",
        expected: expectedDate, actual: actualDate });
    }
  }
  return {
    schema: "open-historia-native-playtest-comparison/1",
    status: dateMatches && countryNamesMatch && mismatches.length === 0
      ? "pass" : "mismatch",
    dateMatches, countryNamesMatch, comparedCountries: expectedNames.length,
    comparedFields: ["economy.gdp", "economy.unemployment", "nativeEconomyClock.lastDate"],
    tolerances: { gdp: 0.01, unemployment: 0.0001 },
    mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 64),
    fullGameplayEquivalence: false,
  };
};

export const nextPlaytestDate = (date, days) => {
  if (!isCanonicalGameDate(date) || !Number.isInteger(days) || days < 1 || days > 31) {
    fail("Autonomous dry-run days must be an integer from 1 to 31");
  }
  return addGameDays(date, days);
};
