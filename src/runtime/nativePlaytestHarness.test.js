/*! Open Historia native-playtest harness - actual no-provider reducer and CLI regressions. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNativePlaytest, compareNativePlaytestToSave, digest } from "../../scripts/native-playtest-core.mjs";
import { main } from "../../scripts/native-playtest.mjs";
import { mergeCountryStatPatch } from "./countryStats.js";

const date = "1912-01-01";
const country = (name) => mergeCountryStatPatch(null, {
  territorialComponents: [
    { geography: name + " centre", group: "core", population: 1_000_000, gdpPerCapita: 1_000 },
  ],
  economy: { gdpGrowth: 3, unemployment: 7, inflation: 2, publicDebt: 40, budgetBalance: -2 },
  continuity: { assessedDate: date },
});
const source = () => ({
  game: { country: "Aland", gameDate: date, round: 1 },
  world: {
    ownerCodes: ["Aland", "Neutral"],
    polityOverrides: { Aland: { code: "Aland", name: "Aland" },
      Neutral: { code: "Neutral", name: "Neutral" } },
    countryStats: { Aland: country("Aland"), Neutral: country("Neutral") },
  },
  historicalEvents: [],
  colors: {},
});
const datePlus = "1912-01-08";
const event = () => ({
  id: "documented-disruption", date: "1912-01-03", title: "Aland trade settlement freeze",
  description: "Aland clearing banks halted interbank settlement for imports.",
  tags: ["Economy"], storylineIds: [], economicAccounting: {
    status: "applied", reason: "The dated trade disruption has a bounded country-specific influence.",
  },
  impacts: { polityChanges: [{ code: "Aland", operation: "update",
    statsEffects: { annualRealGrowthDelta: -3, durationDays: 30,
      gdpCause: "trade", reason: "Documented interruption to trade settlement for local banks." },
  }] },
});

test("the real native clock runs without an AI provider, preserves all source objects and is replay deterministic", () => {
  const fixture = source();
  const before = digest(fixture);
  const first = runNativePlaytest({ ...fixture, turn: { toDate: datePlus, events: [] } });
  const second = runNativePlaytest({ ...fixture, turn: { toDate: datePlus, events: [] } });
  assert.equal(digest(fixture), before);
  assert.deepEqual(first, second);
  assert.equal(first.report.mode, "native-stats-only");
  assert.equal(first.report.providerCalled, false);
  assert.equal(first.report.fullGameplayTurn, false);
  assert.equal(runNativePlaytest({ ...fixture,
    turn: { toDate: datePlus, events: [], neutralOnly: true } }).report.partial, false,
    "the opt-in must never replace a fully supported peaceful native chronology");
  assert.equal(first.report.originalCountryCount, 2);
  assert.equal(first.report.resultingCountryCount, 2);
  assert.equal(first.report.newStatsReceiptCount, 0);
  assert.equal(first.snapshot.game.gameDate, datePlus);
  assert.equal(first.snapshot.world.countryStats.Aland.continuity.nativeEconomyClock.lastDate, datePlus);
  assert.ok(first.snapshot.world.countryStats.Aland.economy.gdp > fixture.world.countryStats.Aland.economy.gdp);
});

test("replays supplied accepted event effects using native dated GDP settlement, without mutating unrelated country", () => {
  const fixture = source();
  const one = runNativePlaytest({ ...fixture, turn: { toDate: datePlus, events: [event()] } });
  const none = runNativePlaytest({ ...fixture, turn: { toDate: datePlus, events: [] } });
  assert.equal(one.report.proposedEventCount, 1);
  assert.equal(one.report.acceptedEventCount, 1);
  assert.equal(one.report.newStatsReceiptCount, 1);
  assert.equal(one.report.newStatsReceipts[0].polity, "Aland");
  assert.equal(one.report.newStatsReceipts[0].eventId, "documented-disruption");
  assert.ok(one.snapshot.world.countryStats.Aland.economy.gdp <
    none.snapshot.world.countryStats.Aland.economy.gdp);
  assert.equal(one.snapshot.world.countryStats.Neutral.economy.gdp,
    none.snapshot.world.countryStats.Neutral.economy.gdp);
  assert.equal(fixture.world.countryStats.Aland.continuity.nativeEconomyClock, undefined);
});

test("rejects invalid accounting, duplicate events, unsupported war chronology and provider calls before writes", () => {
  const fixture = source();
  for (const turn of [
    { toDate: datePlus, events: [{ ...event(), economicAccounting: {
      status: "unquantified", reason: "No estimate applies.", exposures: [],
    } }] },
    { toDate: datePlus, events: [event(), event()] },
    { toDate: datePlus, events: [{ ...event(), date: "1912-01-09" }] },
    { toDate: datePlus, events: [], model: "paid-provider" },
    { toDate: "1912-01-01", events: [] },
  ]) assert.throws(() => runNativePlaytest({ ...fixture, turn }));
  const wartime = { ...fixture, world: { ...fixture.world,
    wars: [{ id: "active-war", status: "active", sideA: ["Aland"], sideB: ["Neutral"] }] } };
  assert.throws(() => runNativePlaytest({ ...wartime,
    turn: { toDate: datePlus, events: [] } }), /No unverified full-country fallback/);
});

test("a wartime neutral-only opt-in advances only verified nonbelligerents and cannot invent zero naval pressure", () => {
  const fixture = source();
  fixture.world.ownerCodes.push("Farland");
  fixture.world.polityOverrides.Farland = { code: "Farland", name: "Farland" };
  fixture.world.countryStats.Farland = country("Farland");
  fixture.world.wars = [{ id: "war-1912", status: "active",
    sideA: ["Aland"], sideB: ["Neutral"] }];
  const originalHash = digest(fixture);
  assert.throws(() => runNativePlaytest({ ...fixture,
    turn: { toDate: datePlus, events: [] } }), /No unverified full-country fallback/);
  const first = runNativePlaytest({ ...fixture,
    turn: { toDate: datePlus, events: [], neutralOnly: true } });
  const second = runNativePlaytest({ ...fixture,
    turn: { toDate: datePlus, events: [], neutralOnly: true } });
  assert.deepEqual(first, second);
  assert.equal(digest(fixture), originalHash);
  assert.equal(first.report.partial, true);
  assert.equal(first.report.mode, "native-neutral-scope-only");
  assert.equal(first.report.nativeSettledCountryCount, 1);
  assert.deepEqual(first.report.notNativeSettledCountries, ["Aland", "Neutral"]);
  assert.equal(first.report.resultingCountryCount, 3);
  assert.equal(first.report.newStatsReceiptCount, 0);
  assert.equal(first.report.observations.everyCountryGdpIncreased, false);
  assert.equal(first.snapshot.world.countryStats.Farland.continuity.nativeEconomyClock.lastDate, datePlus);
  assert.ok(first.snapshot.world.countryStats.Farland.economy.gdp >
    fixture.world.countryStats.Farland.economy.gdp);
  for (const belligerent of ["Aland", "Neutral"]) {
    assert.equal(first.snapshot.world.countryStats[belligerent].economy.gdp,
      fixture.world.countryStats[belligerent].economy.gdp);
    assert.equal(first.snapshot.world.countryStats[belligerent].continuity?.nativeEconomyClock,
      undefined);
  }
  const broken = structuredClone(fixture);
  broken.world.wars[0].sideB = ["Unknown fake polity"];
  assert.throws(() => runNativePlaytest({ ...broken,
    turn: { toDate: datePlus, events: [], neutralOnly: true } }),
  /No unverified full-country fallback/);
});

test("wartime CLI requires explicit neutral-scope authorization and does not touch the original save", () => {
  const fixture = source();
  fixture.world.ownerCodes.push("Farland");
  fixture.world.polityOverrides.Farland = { code: "Farland", name: "Farland" };
  fixture.world.countryStats.Farland = country("Farland");
  fixture.world.wars = [{ id: "war-1912", status: "active",
    sideA: ["Aland"], sideB: ["Neutral"] }];
  const root = mkdtempSync(path.join(os.tmpdir(), "oh-wartime-neutral-"));
  try {
    const gameDir = path.join(root, "game");
    mkdirSync(path.join(gameDir, "storage"), { recursive: true });
    const files = [
      [path.join(gameDir, "game.json"), fixture.game],
      [path.join(gameDir, "world.json"), fixture.world],
      [path.join(gameDir, "storage", "events.json"), fixture.historicalEvents],
    ];
    for (const [filename, data] of files) writeFileSync(filename, JSON.stringify(data));
    const hashes = files.map(([filename]) => digest(readFileSync(filename, "utf8")));
    const out = path.join(root, "out");
    assert.throws(() => main(["--game-dir", gameDir, "--days", "7",
      "--out", out]), /No unverified full-country fallback/);
    assert.equal(existsSync(out), false);
    assert.throws(() => main(["--game-dir", gameDir, "--days", "7",
      "--neutral-scope", "false", "--out", out]), /Usage:/);
    assert.equal(existsSync(out), false);
    const response = main(["--game-dir", gameDir, "--days", "7",
      "--neutral-scope", "true", "--out", out]);
    assert.equal(response.report.partial, true);
    assert.deepEqual(response.report.notNativeSettledCountries, ["Aland", "Neutral"]);
    assert.equal(JSON.parse(readFileSync(path.join(out, "report.json"))).nativeSettledCountryCount, 1);
    const comparisonOut = path.join(root, "comparison-rejected");
    assert.throws(() => main(["--game-dir", gameDir, "--days", "7",
      "--neutral-scope", "true", "--compare-game-dir", gameDir, "--out", comparisonOut]),
    /Full saved-game economic comparison is unsupported for partial neutral scope/);
    assert.equal(existsSync(comparisonOut), false);
    assert.deepEqual(files.map(([filename]) => digest(readFileSync(filename, "utf8"))), hashes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("read-only game-folder CLI writes only new diagnostic output and refuses overwrites", () => {
  const fixture = source();
  const root = mkdtempSync(path.join(os.tmpdir(), "oh-native-playtest-"));
  try {
    const gameDir = path.join(root, "source");
    const storage = path.join(gameDir, "storage");
    const out = path.join(root, "output");
    mkdirSync(storage, { recursive: true });
    const write = (file, data) => writeFileSync(file, JSON.stringify(data));
    const gamePath = path.join(gameDir, "game.json");
    const worldPath = path.join(gameDir, "world.json");
    const eventsPath = path.join(storage, "events.json");
    write(gamePath, fixture.game);
    write(worldPath, fixture.world);
    write(eventsPath, fixture.historicalEvents);
    const originals = [gamePath, worldPath, eventsPath].map((file) =>
      digest(readFileSync(file, "utf8")));
    const run = main(["--game-dir", gameDir, "--days", "7", "--out", out]);
    assert.equal(run.report.resultingCountryCount, 2);
    assert.equal(JSON.parse(readFileSync(path.join(out, "report.json"))).providerCalled, false);
    assert.equal(JSON.parse(readFileSync(path.join(out, "native-snapshot.json"))).schema,
      "open-historia-native-playtest-snapshot/1");
    assert.deepEqual([gamePath, worldPath, eventsPath].map((file) =>
      digest(readFileSync(file, "utf8"))), originals);
    assert.throws(() => main(["--game-dir", gameDir, "--days", "7", "--out", out]),
      /already exists/);
    assert.throws(() => main(["--game-dir", gameDir, "--days", "7",
      "--out", path.join(gameDir, "writes")]), /outside all source paths/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rollback-snapshot CLI reproduces accepted economic state and compares a persisted save without altering it", () => {
  const fixture = source();
  const turn = { toDate: datePlus, events: [event()] };
  const settled = runNativePlaytest({ ...fixture, turn });
  const same = compareNativePlaytestToSave(settled.snapshot,
    settled.snapshot.game, settled.snapshot.world);
  assert.equal(same.status, "pass");
  assert.equal(same.comparedCountries, 2);
  assert.equal(same.mismatchCount, 0);
  const wrong = structuredClone(settled.snapshot.world);
  wrong.countryStats.Aland.economy.gdp += 100;
  const mismatch = compareNativePlaytestToSave(settled.snapshot,
    settled.snapshot.game, wrong);
  assert.equal(mismatch.status, "mismatch");
  assert.deepEqual(mismatch.mismatches.map((entry) => entry.field), ["economy.gdp"]);
  const root = mkdtempSync(path.join(os.tmpdir(), "oh-native-snapshot-"));
  try {
    const rollback = path.join(root, "snap.json");
    const saved = path.join(root, "saved");
    const output = path.join(root, "results");
    mkdirSync(saved);
    writeFileSync(rollback, JSON.stringify({
      id: "snap-1", fromDate: date, toDate: datePlus,
      state: { game: fixture.game, world: fixture.world,
        events: fixture.historicalEvents, colors: fixture.colors },
      turn: { stopDate: datePlus, events: [event()] },
    }));
    const write = (filename, value) => writeFileSync(filename, JSON.stringify(value));
    write(path.join(saved, "game.json"), settled.snapshot.game);
    write(path.join(saved, "world.json"), settled.snapshot.world);
    const originalRollback = digest(readFileSync(rollback, "utf8"));
    const originalSaved = digest(readFileSync(path.join(saved, "world.json"), "utf8"));
    const outcome = main(["--snapshot", rollback, "--compare-game-dir", saved, "--out", output]);
    assert.equal(outcome.comparison.status, "pass");
    assert.equal(JSON.parse(readFileSync(path.join(output, "comparison.json"))).mismatchCount, 0);
    assert.equal(digest(readFileSync(rollback, "utf8")), originalRollback);
    assert.equal(digest(readFileSync(path.join(saved, "world.json"), "utf8")), originalSaved);
    assert.throws(() => main(["--snapshot", rollback, "--days", "7",
      "--out", path.join(root, "invalid")]), /Usage:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundle and supplied-turn modes are read-only and reject invalid economic payloads without output", () => {
  const fixture = source();
  const root = mkdtempSync(path.join(os.tmpdir(), "oh-native-bundle-"));
  try {
    const bundle = path.join(root, "export.json");
    const turn = path.join(root, "turn.json");
    writeFileSync(bundle, JSON.stringify({
      schema: "open-historia-game-bundle/1",
      data: { game: fixture.game, world: fixture.world,
        events: fixture.historicalEvents, colors: fixture.colors },
    }));
    writeFileSync(turn, JSON.stringify({ toDate: datePlus, events: [event()] }));
    const output = path.join(root, "report");
    assert.equal(main(["--bundle", bundle, "--turn", turn, "--out", output])
      .report.newStatsReceiptCount, 1);
    const invalidOut = path.join(root, "invalid");
    const invalid = event();
    delete invalid.impacts.polityChanges[0].statsEffects;
    writeFileSync(turn, JSON.stringify({ toDate: datePlus, events: [invalid] }));
    assert.throws(() => main(["--bundle", bundle, "--turn", turn,
      "--out", invalidOut]), /Economic admission rejected/);
    assert.equal(existsSync(invalidOut), false, "a rejected native run creates no partial output folder");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
