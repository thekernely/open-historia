import fs from "fs";
import path from "path";
import url from "url";

const START_DATE = "2014-03-22";

export const FAULT_LINES_2014_POLITICAL_ACTORS = Object.freeze({
  schemaVersion: 1,
  byPolity: {
    "Russian Federation": {
      polityKey: "Russian Federation",
      government: {
        form: "Federal semi-presidential republic",
        headOfState: "Vladimir Putin",
        headOfGovernment: "Dmitry Medvedev",
      },
      leader: "Vladimir Putin",
      parties: [
        { id: "united-russia", name: "United Russia", support: { percent: 53 } },
      ],
      goals: [
        "Maintain regional influence",
        "Preserve strategic depth",
      ],
    },
    Ukraine: {
      polityKey: "Ukraine",
      government: {
        form: "Semi-presidential republic",
        headOfState: "Oleksandr Turchynov",
        headOfGovernment: "Arseniy Yatsenyuk",
      },
      leader: "Oleksandr Turchynov",
      parties: [
        { id: "batkivshchyna", name: "Batkivshchyna" },
        { id: "udar", name: "UDAR" },
        { id: "party-of-regions", name: "Party of Regions" },
      ],
      goals: [
        "Stabilize the interim political order",
        "Deepen European integration",
        "Preserve territorial integrity",
      ],
    },
    "Republic of Poland": {
      polityKey: "Republic of Poland",
      government: {
        form: "Parliamentary republic",
        headOfState: "Bronisław Komorowski",
        headOfGovernment: "Donald Tusk",
      },
      leader: "Bronisław Komorowski",
      parties: [
        { id: "civic-platform", name: "Civic Platform", support: { percent: 35 } },
        { id: "law-and-justice", name: "Law and Justice", support: { percent: 30 } },
      ],
      goals: [
        "Strengthen NATO cooperation",
        "Support Ukrainian sovereignty",
        "Reinforce regional security",
      ],
    },
  },
});

export const FAULT_LINES_2014_TAGS = Object.freeze({
  "Russian Federation": ["authoritarian", "great-power", "nuclear", "revisionist"],
  Ukraine: ["democratic", "pro-western", "semi-presidential", "democratizing"],
  "Republic of Poland": ["democratic", "nato-aligned", "eu-member", "parliamentary"],
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const readJson = (filePath, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const mergeMissing = (target, seed) => {
  if (!isObject(seed)) return target ?? clone(seed);
  const out = isObject(target) ? clone(target) : {};
  for (const [key, seedValue] of Object.entries(seed)) {
    if (!(key in out) || out[key] == null || out[key] === "") {
      out[key] = clone(seedValue);
    } else if (isObject(seedValue) && isObject(out[key])) {
      out[key] = mergeMissing(out[key], seedValue);
    }
  }
  return out;
};

export const mergePoliticalActorsSeed = (world) => {
  const next = isObject(world) ? clone(world) : {};
  const current = isObject(next.politicalActors) ? next.politicalActors : {};
  next.politicalActors = {
    schemaVersion: 1,
    byPolity: {},
    ...current,
    byPolity: isObject(current.byPolity) ? clone(current.byPolity) : {},
  };
  for (const [key, seedActor] of Object.entries(FAULT_LINES_2014_POLITICAL_ACTORS.byPolity)) {
    next.politicalActors.byPolity[key] = mergeMissing(next.politicalActors.byPolity[key], seedActor);
  }
  return next;
};

export const mergeTagsSeed = (tags) => {
  const next = isObject(tags) ? clone(tags) : {};
  for (const [key, seedTags] of Object.entries(FAULT_LINES_2014_TAGS)) {
    if (!Array.isArray(next[key]) || next[key].length === 0) next[key] = [...seedTags];
  }
  return next;
};

const looksLikeFaultLines = ({ meta, game, world }) => {
  const title = [meta?.name, meta?.subtitle, meta?.heroTitle].filter(Boolean).join(" ").toLowerCase();
  const timeline = String(world?.startingTimelineText || "");
  const startDate = String(game?.startDate || "");
  return title.includes("fault lines") || (
    startDate === START_DATE &&
    timeline.includes("22 March 2014") &&
    timeline.includes("Crimea")
  );
};

const roundZeroGame = (game) => {
  const startDate = String(game?.startDate || "");
  const gameDate = String(game?.gameDate || startDate);
  const round = Math.max(0, Math.trunc(Number(game?.round) || 0));
  return startDate === START_DATE && gameDate === START_DATE && round <= 1;
};

export const runMigration = ({ rootDir, forceGameSeed = false, dryRun = false } = {}) => {
  const root = path.resolve(rootDir || process.cwd());
  const dataDir = path.join(root, "server", "data");
  const gamesDir = path.join(dataDir, "games");
  const scenariosDir = path.join(dataDir, "scenarios");
  const linkedScenarioIds = new Set();
  const changes = [];
  const skipped = [];

  if (fs.existsSync(gamesDir)) {
    for (const gameId of fs.readdirSync(gamesDir)) {
      const dir = path.join(gamesDir, gameId);
      if (!fs.statSync(dir).isDirectory()) continue;
      const meta = readJson(path.join(dir, "game-instance.json"), {});
      const game = readJson(path.join(dir, "game.json"), {});
      const worldPath = path.join(dir, "world.json");
      const world = readJson(worldPath, {});
      if (!looksLikeFaultLines({ meta, game, world })) continue;
      if (meta?.scenarioId) linkedScenarioIds.add(String(meta.scenarioId));

      if (!forceGameSeed && !roundZeroGame(game)) {
        skipped.push(`${gameId}: progressed game left untouched (use --force-game only if you know its political state still matches Round Zero)`);
        continue;
      }

      const nextWorld = mergePoliticalActorsSeed(world);
      const tagsPath = path.join(dir, "tags.json");
      const nextTags = mergeTagsSeed(readJson(tagsPath, {}));
      if (!dryRun) {
        writeJson(worldPath, nextWorld);
        writeJson(tagsPath, nextTags);
      }
      changes.push(`game:${gameId}`);
    }
  }

  if (fs.existsSync(scenariosDir)) {
    for (const scenarioId of fs.readdirSync(scenariosDir)) {
      const dir = path.join(scenariosDir, scenarioId);
      if (!fs.statSync(dir).isDirectory()) continue;
      const meta = readJson(path.join(dir, "scenario.json"), {});
      const game = readJson(path.join(dir, "game.json"), {});
      const worldPath = path.join(dir, "world.json");
      const world = readJson(worldPath, {});
      const linked = linkedScenarioIds.has(scenarioId);
      if (!linked && !looksLikeFaultLines({ meta, game, world })) continue;

      const nextWorld = mergePoliticalActorsSeed(world);
      const tagsPath = path.join(dir, "tags.json");
      const nextTags = mergeTagsSeed(readJson(tagsPath, {}));
      if (!dryRun) {
        writeJson(worldPath, nextWorld);
        writeJson(tagsPath, nextTags);
      }
      changes.push(`scenario:${scenarioId}`);
    }
  }

  return { changes, skipped };
};

const invokedDirectly = process.argv[1] && url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const rootFlag = process.argv.indexOf("--root");
  const rootDir = rootFlag >= 0 ? process.argv[rootFlag + 1] : process.cwd();
  const result = runMigration({
    rootDir,
    forceGameSeed: process.argv.includes("--force-game"),
    dryRun: process.argv.includes("--dry-run"),
  });
  console.log(`[political actors] patched ${result.changes.length} Fault Lines target(s): ${result.changes.join(", ") || "none"}`);
  for (const note of result.skipped) console.warn(`[political actors] ${note}`);
}
