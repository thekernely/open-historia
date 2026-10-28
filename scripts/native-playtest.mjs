#!/usr/bin/env node
/*! Open Historia - offline native-playtest CLI.
 * All source assets are read-only. Outputs go to a NEW directory only.
 * No server, AI provider, network, saved game mutation or import action.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextPlaytestDate, runNativePlaytest, compareNativePlaytestToSave } from "./native-playtest-core.mjs";

const help = `OpenHistoria native Statistics playtest (NO provider calls, NOT a full game turn)
Usage:
  node scripts/native-playtest.mjs --game-dir <game-folder> --days 7 --out <new-report-folder>
  node scripts/native-playtest.mjs --game-dir <wartime-game-folder> --days 7 --neutral-scope true --out <new-report-folder>
  node scripts/native-playtest.mjs --game-dir <game-folder> --turn <turn.json> --out <new-report-folder>
  node scripts/native-playtest.mjs --bundle <exported-game-bundle.json> --days 7 --out <new-report-folder>
  node scripts/native-playtest.mjs --snapshot <rollback-snapshot.json> --out <new-report-folder>
  node scripts/native-playtest.mjs --snapshot <rollback-snapshot.json> --compare-game-dir <saved-game-folder> --out <new-report-folder>

Options:
  --game-dir    Existing game directory with game.json, world.json, storage/events.json
  --bundle      Existing open-historia-game-bundle/1 JSON (NOT zip; extract first)
  --snapshot    Existing rollback snapshot with state + accepted turn (no new provider calls)
  --compare-game-dir  Existing saved game directory to compare GDP/unemployment/cursors
  --days        No-event native clock advance, 1–31 in-game days
  --neutral-scope true  Explicitly permit production's verified nonbelligerent scope when full wartime evidence is absent
  --turn        Local JSON {toDate, events:[...]} or {toDate, generatedPayload:{...}}
  --out         New, nonexistent report directory; never the source game directory
  --help        Show this message

This is real canonical native Statistics reduction, not AI generation, front
simulation, history folding, diplomacy, a UI test, or an importable game save.
Unsupported chronology FAILS CLOSED. Original saves are never modified.
`;

const readJson = (filename, label) => {
  const stats = fs.statSync(filename);
  if (!stats.isFile() || stats.size > 100 * 1024 * 1024) {
    throw new Error(`${label} must be a JSON file under 100 MB`);
  }
  return JSON.parse(fs.readFileSync(filename, "utf8"));
};

const argumentsOf = (argv) => {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const allowed = new Set(["--game-dir", "--bundle", "--snapshot", "--days", "--turn", "--compare-game-dir", "--neutral-scope", "--out"]);
  const values = {};
  if (!argv.length || argv.length % 2) throw new Error(help);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!allowed.has(key) || values[key] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new Error(`Unknown, duplicated or incomplete option ${key}\n${help}`);
    }
    values[key] = argv[i + 1];
  }
  if (Number(Boolean(values["--game-dir"])) + Number(Boolean(values["--bundle"]))
      + Number(Boolean(values["--snapshot"])) !== 1
    || (values["--snapshot"]
      ? Boolean(values["--days"] || values["--turn"])
      : Number(Boolean(values["--days"])) + Number(Boolean(values["--turn"])) !== 1)
    || (values["--neutral-scope"] && (values["--neutral-scope"] !== "true" || values["--snapshot"]))
    || !values["--out"]) throw new Error(help);
  return values;
};
const readSource = (args) => {
  if (args["--snapshot"]) {
    const record = readJson(path.resolve(args["--snapshot"]), "Rollback snapshot");
    if (!record?.state?.game || !record?.state?.world
      || !Array.isArray(record?.state?.events)
      || !Array.isArray(record?.turn?.events) || !record?.turn?.stopDate) {
      throw new Error("Snapshot has no complete pre-turn state and accepted event list");
    }
    if (record.state.game.gameDate !== record.fromDate
      || record.turn.stopDate !== record.toDate) {
      throw new Error("Snapshot date boundaries disagree with its pre-turn state");
    }
    return {
      game: record.state.game, world: record.state.world,
      historicalEvents: record.state.events, colors: record.state.colors || {},
      savedTurn: { toDate: record.toDate, events: record.turn.events },
    };
  }
  if (args["--bundle"]) {
    const data = readJson(path.resolve(args["--bundle"]), "Exported game bundle");
    if (data?.schema !== "open-historia-game-bundle/1" || !data?.data) {
      throw new Error("Expected an actual open-historia-game-bundle/1 JSON export");
    }
    return { game: data.data.game, world: data.data.world,
      historicalEvents: data.data.events || [], colors: data.data.colors || {} };
  }
  const dir = path.resolve(args["--game-dir"]);
  const game = readJson(path.join(dir, "game.json"), "game.json");
  const world = readJson(path.join(dir, "world.json"), "world.json");
  const eventsFile = path.join(dir, "storage", "events.json");
  if (!fs.existsSync(eventsFile)) throw new Error("Missing authoritative storage/events.json");
  const historicalEvents = readJson(eventsFile, "events.json");
  const colorsFile = path.join(dir, "colors.json");
  const colors = fs.existsSync(colorsFile) ? readJson(colorsFile, "colors.json") : {};
  return { game, world, historicalEvents, colors };
};
export const main = (argv) => {
  const args = argumentsOf(argv);
  if (args.help) return { help };
  const source = readSource(args);
  const turn = source.savedTurn || (args["--days"]
    ? { toDate: nextPlaytestDate(source.game?.gameDate, Number(args["--days"])), events: [] }
    : readJson(path.resolve(args["--turn"]), "Turn fixture"));
  if (args["--neutral-scope"] === "true") turn.neutralOnly = true;
  const out = path.resolve(args["--out"]);
  const sources = [args["--bundle"], args["--game-dir"], args["--snapshot"], args["--turn"], args["--compare-game-dir"]]
    .filter(Boolean).map((p) => path.resolve(p));
  if (sources.some((p) => out === p || out.startsWith(p + path.sep))) {
    throw new Error("Output must be outside all source paths");
  }
  if (fs.existsSync(out)) throw new Error("Output directory already exists; refusing to overwrite");
  // Complete the read-only native simulation BEFORE creating any report files.
  const result = runNativePlaytest({ ...source, turn });
  let comparison = null;
  if (args["--compare-game-dir"]) {
    if (result.report.partial) {
      throw new Error("Full saved-game economic comparison is unsupported for partial neutral scope: wartime belligerents were deliberately not settled");
    }
    const directory = path.resolve(args["--compare-game-dir"]);
    comparison = compareNativePlaytestToSave(result.snapshot,
      readJson(path.join(directory, "game.json"), "Comparison game"),
      readJson(path.join(directory, "world.json"), "Comparison world"));
  }
  fs.mkdirSync(out, { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(out, name),
    JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  write("report.json", result.report);
  write("native-snapshot.json", result.snapshot);
  if (comparison) write("comparison.json", comparison);
  return { path: out, report: result.report, comparison };
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = main(process.argv.slice(2));
    if (result.help) process.stdout.write(result.help);
    else {
      process.stdout.write(`Native-only playtest completed: ${result.path}\n`
        + `Native settled: ${result.report.nativeSettledCountryCount}/${result.report.resultingCountryCount} national sheets, `
        + `excluded: ${result.report.notNativeSettledCountries.join(", ") || "none"}.\n`
        + `Receipts: ${result.report.newStatsReceiptCount}, `
        + `coverage: ${result.report.coverage.status}. NO AI calls or original save edits.\n`
        + (result.comparison ? `Saved-game economic comparison: ${result.comparison.status} (${result.comparison.comparedCountries} countries, ${result.comparison.mismatchCount} mismatches).\n` : ""));
      if (result.comparison && result.comparison.status !== "pass") process.exitCode = 2;
    }
  } catch (error) {
    console.error(`Native-only playtest FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
