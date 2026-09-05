import fs from "fs";
import path from "path";
import url from "url";

const START_DATE = "2014-03-22";

// Party support is a start-date political snapshot, not a permanent historical
// truth. The campaign owns everything after Round Zero.
// - Poland: Homo Homini / wp.pl, fieldwork 15-17 March 2014, decided voters.
// - Russia: Levada Center, March 2014 State Duma voting intention, decided voters.
// - Ukraine: KIIS March 2014 electoral orientations, decided voters.
// Percentages are intentionally treated as public support, not seat shares.
export const FAULT_LINES_2014_POLITICAL_ACTORS = Object.freeze({
  schemaVersion: 2,
  byPolity: {
    "Russian Federation": {
      polityKey: "Russian Federation",
      government: {
        form: "Federal semi-presidential republic",
        headOfState: "Vladimir Putin",
        headOfGovernment: "Dmitry Medvedev",
        rulingPartyIds: ["united-russia"],
        rulingParties: ["Единая Россия"],
      },
      leader: "Vladimir Putin",
      parties: [
        {
          id: "united-russia",
          name: "Единая Россия",
          shortName: "Единая Россия",
          aliases: ["United Russia", "Yedinaya Rossiya"],
          support: { percent: 56 },
          ideology: "Conservative, statist",
          leader: "Dmitry Medvedev",
          ruling: true,
          publicDescription: "The dominant governing party backing Vladimir Putin's presidency and the Medvedev government.",
          publicPriorities: [
            "Political stability and strong central state capacity",
            "Economic modernization without major political disruption",
            "Preserve the government's broad social and electoral coalition",
          ],
          publicForeignPolicy: [
            "Deepen Eurasian integration",
            "Protect Russian influence across the post-Soviet space",
            "Resist further NATO encroachment near Russia's borders",
          ],
        },
        {
          id: "communist-party-russian-federation",
          name: "Коммунистическая партия Российской Федерации",
          shortName: "КПРФ",
          aliases: ["Communist Party of the Russian Federation", "CPRF"],
          support: { percent: 17 },
          ideology: "Communist, left-nationalist",
          leader: "Gennady Zyuganov",
          publicDescription: "The principal parliamentary opposition party on the Russian left, combining communist economics with a strong-state and patriotic outlook.",
          publicPriorities: [
            "Expand state ownership and social guarantees",
            "Protect pensions, wages and Soviet-era welfare commitments",
            "Strengthen state control over strategic sectors",
          ],
          publicForeignPolicy: [
            "Restore close political and economic ties across the former Soviet space",
            "Oppose NATO expansion and Western strategic pressure",
          ],
        },
        {
          id: "ldpr",
          name: "Либерально-демократическая партия России",
          shortName: "ЛДПР",
          aliases: ["Liberal Democratic Party of Russia", "LDPR"],
          support: { percent: 8 },
          ideology: "Nationalist, right-populist",
          leader: "Vladimir Zhirinovsky",
          publicDescription: "A nationalist parliamentary party built around Vladimir Zhirinovsky and an assertive great-power message.",
          publicPriorities: [
            "Strong executive authority",
            "Nationalist social and security policy",
          ],
          publicForeignPolicy: [
            "Assert Russian great-power interests aggressively",
            "Favor a harder line toward Western pressure and neighboring states",
          ],
        },
        {
          id: "a-just-russia",
          name: "Справедливая Россия",
          aliases: ["A Just Russia"],
          support: { percent: 4 },
          ideology: "Social democratic, left-populist",
          leader: "Sergey Mironov",
          publicDescription: "A parliamentary centre-left opposition party emphasizing social protection while remaining broadly within the established political system.",
          publicPriorities: [
            "Raise social spending and reduce inequality",
            "Protect labour and pension interests",
          ],
          publicForeignPolicy: [
            "Defend Russian strategic interests while emphasizing social and domestic priorities",
          ],
        },
        {
          id: "civic-platform-russia",
          name: "Гражданская платформа",
          aliases: ["Civic Platform"],
          support: { percent: 4 },
          ideology: "Market-liberal, reformist",
          leader: "Mikhail Prokhorov",
          publicDescription: "A newer pro-business opposition party associated with Mikhail Prokhorov and urban economic liberalism.",
          publicPriorities: [
            "Market-oriented economic reform",
            "Greater political competition and local autonomy",
          ],
          publicForeignPolicy: [
            "Prefer pragmatic engagement with Europe alongside protection of Russian interests",
          ],
        },
        {
          id: "yabloko",
          name: "Яблоко",
          aliases: ["Yabloko"],
          support: { percent: 1 },
          ideology: "Social-liberal, pro-democracy",
          leader: "Sergey Mitrokhin",
          publicDescription: "A liberal democratic opposition party with a long-standing human-rights and rule-of-law platform.",
          publicPriorities: [
            "Competitive elections and rule of law",
            "Civil liberties and anti-corruption reform",
          ],
          publicForeignPolicy: [
            "Favor cooperation with Europe and oppose coercive expansionism",
          ],
        },
        {
          id: "progress-party",
          name: "Партия прогресса",
          aliases: ["Progress Party"],
          support: { percent: 1 },
          ideology: "Liberal opposition, anti-corruption",
          leader: "Alexei Navalny",
          publicDescription: "An emerging anti-corruption opposition organization centered on Alexei Navalny.",
          publicPriorities: [
            "Anti-corruption enforcement",
            "Competitive politics and government accountability",
          ],
          publicForeignPolicy: [
            "Emphasize accountable statecraft over elite-driven foreign-policy adventurism",
          ],
        },
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
        rulingPartyIds: ["batkivshchyna"],
        rulingParties: ["Батьківщина"],
        coalitionName: "Європейський вибір",
        coalitionPartyIds: ["udar", "svoboda", "economic-development-ukraine", "sovereign-european-ukraine"],
        coalition: ["УДАР", "Свобода", "Економічний розвиток", "Суверенна європейська Україна"],
      },
      leader: "Oleksandr Turchynov",
      parties: [
        {
          id: "batkivshchyna",
          name: "Батьківщина",
          shortName: "Батьківщина",
          aliases: ["Batkivshchyna", "Fatherland", "All-Ukrainian Union Fatherland"],
          support: { percent: 22.2 },
          ideology: "Centre-right, pro-European",
          leader: "Yulia Tymoshenko",
          ruling: true,
          publicDescription: "A major pro-European party whose senior figures hold leading roles in the post-Maidan interim government.",
          publicPriorities: [
            "Stabilize the post-Maidan political order",
            "Restore effective state institutions",
            "Prepare competitive national elections",
          ],
          publicForeignPolicy: [
            "Deepen integration with the European Union",
            "Defend Ukrainian sovereignty and territorial integrity",
          ],
        },
        {
          id: "solidarity-ukraine",
          name: "Солідарність",
          aliases: ["Solidarity"],
          support: { percent: 21.6 },
          ideology: "Centrist, pro-European",
          leader: "Petro Poroshenko",
          publicDescription: "A rapidly rising pro-European political force associated with Petro Poroshenko.",
          publicPriorities: [
            "Political stabilization and institutional reform",
            "Anti-corruption and economic modernization",
          ],
          publicForeignPolicy: [
            "Closer association with the European Union",
            "Defend sovereignty while seeking broad international support",
          ],
        },
        {
          id: "udar",
          name: "УДАР",
          aliases: ["UDAR", "Ukrainian Democratic Alliance for Reform"],
          support: { percent: 16.4 },
          ideology: "Centre-right, pro-European",
          leader: "Vitali Klitschko",
          coalition: true,
          publicDescription: "A reformist opposition party identified with Vitali Klitschko, European integration and anti-corruption politics.",
          publicPriorities: [
            "Anti-corruption reform",
            "Institutional modernization and competitive elections",
          ],
          publicForeignPolicy: [
            "Accelerate European integration",
            "Strengthen ties with democratic European partners",
          ],
        },
        {
          id: "party-of-regions",
          name: "Партія регіонів",
          aliases: ["Party of Regions"],
          support: { percent: 13.6 },
          ideology: "Regionalist, pro-Russian",
          leader: "Oleksandr Yefremov",
          publicDescription: "The former governing party is in rapid disarray after Viktor Yanukovych's flight but still retains parliamentary and regional networks.",
          publicPriorities: [
            "Protect its remaining regional and parliamentary influence",
            "Represent eastern and southern constituencies",
          ],
          publicForeignPolicy: [
            "Preserve close economic and political links with Russia",
            "Resist abrupt breaks with Ukraine's eastern partnerships",
          ],
        },
        {
          id: "communist-party-ukraine",
          name: "Комуністична партія України",
          shortName: "КПУ",
          aliases: ["Communist Party of Ukraine", "CPU"],
          support: { percent: 6.9 },
          ideology: "Communist, pro-Russian",
          leader: "Petro Symonenko",
          publicDescription: "A traditional communist party drawing much of its support from older and eastern/southern electorates.",
          publicPriorities: [
            "Protect Soviet-style social guarantees",
            "Oppose rapid market liberalization",
          ],
          publicForeignPolicy: [
            "Maintain close relations with Russia and the post-Soviet economic space",
            "Oppose rapid NATO integration",
          ],
        },
        {
          id: "radical-party-oleh-liashko",
          name: "Радикальна партія Олега Ляшка",
          shortName: "Радикальна партія",
          aliases: ["Radical Party of Oleh Liashko", "Radical Party"],
          support: { percent: 5.7 },
          ideology: "Nationalist, populist",
          leader: "Oleh Liashko",
          publicDescription: "A populist nationalist party whose support is rising amid the revolutionary and security crisis.",
          publicPriorities: [
            "Hard-line anti-corruption measures",
            "Stronger state response to separatism and elite abuses",
          ],
          publicForeignPolicy: [
            "Defend Ukrainian territorial integrity forcefully",
            "Reduce Russian political leverage over Ukraine",
          ],
        },
        {
          id: "svoboda",
          name: "Свобода",
          aliases: ["Svoboda", "All-Ukrainian Union Svoboda"],
          support: { percent: 5.2 },
          ideology: "Ukrainian nationalist, right-wing",
          leader: "Oleh Tyahnybok",
          coalition: true,
          publicDescription: "A Ukrainian nationalist party that played a visible role in the Maidan movement and holds influence in the post-revolutionary political environment.",
          publicPriorities: [
            "Ukrainian national consolidation",
            "Lustration and removal of Yanukovych-era influence",
          ],
          publicForeignPolicy: [
            "Strong resistance to Russian pressure",
            "Support a westward geopolitical orientation",
          ],
        },
        {
          id: "economic-development-ukraine",
          name: "Економічний розвиток",
          aliases: ["Economic Development"],
          coalition: true,
          ideology: "Centrist, business-oriented parliamentary group",
          publicDescription: "A parliamentary group participating in the post-Maidan governing coalition.",
          publicPriorities: [
            "Maintain parliamentary stability",
            "Support economic recovery and institutional continuity",
          ],
          publicForeignPolicy: [
            "Support Ukraine's European course while emphasizing pragmatic economic policy",
          ],
        },
        {
          id: "sovereign-european-ukraine",
          name: "Суверенна європейська Україна",
          aliases: ["Sovereign European Ukraine"],
          coalition: true,
          ideology: "Centrist, pro-European parliamentary group",
          publicDescription: "A pro-European parliamentary group participating in the post-Maidan governing coalition.",
          publicPriorities: [
            "Support the interim constitutional order",
            "Maintain a stable pro-European parliamentary majority",
          ],
          publicForeignPolicy: [
            "Support European integration and Ukrainian sovereignty",
          ],
        },
        {
          id: "right-sector",
          name: "Правий сектор",
          aliases: ["Right Sector"],
          support: { percent: 2.7 },
          ideology: "Ukrainian nationalist, far-right",
          leader: "Dmytro Yarosh",
          publicDescription: "A new nationalist movement emerging from the Maidan self-defense milieu and beginning to organize electorally.",
          publicPriorities: [
            "Defend the revolutionary political order",
            "Remove former-regime influence from state institutions",
          ],
          publicForeignPolicy: [
            "Take a hard line against Russian intervention and separatism",
          ],
        },
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
        rulingPartyIds: ["civic-platform"],
        rulingParties: ["Platforma Obywatelska"],
        coalitionPartyIds: ["polish-peoples-party"],
        coalition: ["Polskie Stronnictwo Ludowe"],
      },
      leader: "Bronisław Komorowski",
      parties: [
        {
          id: "law-and-justice",
          name: "Prawo i Sprawiedliwość",
          shortName: "PiS",
          aliases: ["Law and Justice"],
          support: { percent: 36.1 },
          ideology: "National-conservative, socially conservative",
          leader: "Jarosław Kaczyński",
          publicDescription: "The main opposition party, combining social conservatism, a strong-state programme and a hard security line toward Russia.",
          publicPriorities: [
            "Strengthen state institutions and national sovereignty",
            "Expand family and social policy",
            "Emphasize security and anti-corruption",
          ],
          publicForeignPolicy: [
            "Strengthen NATO deterrence and ties with the United States",
            "Take a hard line toward Russian pressure in Eastern Europe",
            "Remain skeptical of deeper EU federalization",
          ],
        },
        {
          id: "civic-platform",
          name: "Platforma Obywatelska",
          aliases: ["Civic Platform"],
          shortName: "PO",
          support: { percent: 33.1 },
          ideology: "Liberal-conservative, pro-European",
          leader: "Donald Tusk",
          ruling: true,
          publicDescription: "The centre-right governing party leading Poland's cabinet and the senior partner in coalition with the Polish People's Party.",
          publicPriorities: [
            "Economic growth and fiscal stability",
            "Infrastructure and public-sector modernization",
            "Maintain political stability through the Ukraine crisis",
          ],
          publicForeignPolicy: [
            "Keep Poland firmly anchored in NATO and the European Union",
            "Support Ukrainian sovereignty and European integration",
            "Coordinate a strong European response to Russian pressure",
          ],
        },
        {
          id: "democratic-left-alliance",
          name: "Sojusz Lewicy Demokratycznej",
          shortName: "SLD",
          aliases: ["Democratic Left Alliance"],
          support: { percent: 13.8 },
          ideology: "Social democratic, centre-left",
          leader: "Leszek Miller",
          publicDescription: "The principal established party of the Polish centre-left.",
          publicPriorities: [
            "Protect social welfare and labour interests",
            "Promote a secular state and centre-left social policy",
          ],
          publicForeignPolicy: [
            "Support EU membership while favoring pragmatic diplomacy",
            "Maintain Poland's NATO commitments",
          ],
        },
        {
          id: "polish-peoples-party",
          name: "Polskie Stronnictwo Ludowe",
          shortName: "PSL",
          aliases: ["Polish People's Party"],
          support: { percent: 5.8 },
          ideology: "Agrarian, centrist",
          leader: "Janusz Piechociński",
          coalition: true,
          publicDescription: "The agrarian junior coalition partner in Donald Tusk's government, rooted in rural and local-government politics.",
          publicPriorities: [
            "Protect farming and rural development",
            "Secure EU agricultural and regional funding",
            "Promote pragmatic coalition government",
          ],
          publicForeignPolicy: [
            "Support Poland's EU and NATO commitments",
            "Favor pragmatic regional economic cooperation",
          ],
        },
        {
          id: "your-movement",
          name: "Twój Ruch",
          shortName: "TR",
          aliases: ["Your Movement"],
          support: { percent: 5.4 },
          ideology: "Social-liberal, secular",
          leader: "Janusz Palikot",
          publicDescription: "A socially liberal and anti-clerical opposition party built around Janusz Palikot.",
          publicPriorities: [
            "Church-state separation",
            "Liberal social reform",
            "Modernize public institutions",
          ],
          publicForeignPolicy: [
            "Maintain a strongly pro-European orientation",
          ],
        },
        {
          id: "solidary-poland",
          name: "Solidarna Polska",
          shortName: "SP",
          aliases: ["Solidary Poland"],
          support: { percent: 2.6 },
          ideology: "National-conservative, socially conservative",
          leader: "Zbigniew Ziobro",
          publicDescription: "A conservative splinter from Law and Justice competing for the nationalist and socially conservative electorate.",
          publicPriorities: [
            "Conservative social policy",
            "Tougher criminal justice and stronger national institutions",
          ],
          publicForeignPolicy: [
            "Favor a sovereignty-focused EU policy and a hard line toward Russian pressure",
          ],
        },
        {
          id: "congress-new-right",
          name: "Kongres Nowej Prawicy",
          shortName: "KNP",
          aliases: ["Congress of the New Right"],
          support: { percent: 1.9 },
          ideology: "Libertarian-conservative, Eurosceptic",
          leader: "Janusz Korwin-Mikke",
          publicDescription: "A radical free-market and Eurosceptic party with growing support among younger anti-establishment voters.",
          publicPriorities: [
            "Reduce taxation and the size of the state",
            "Deregulate the economy",
          ],
          publicForeignPolicy: [
            "Oppose deeper European political integration",
          ],
        },
        {
          id: "poland-together",
          name: "Polska Razem Jarosława Gowina",
          shortName: "PRJG",
          aliases: ["Poland Together"],
          support: { percent: 0.7 },
          ideology: "Conservative-liberal, centre-right",
          leader: "Jarosław Gowin",
          publicDescription: "A recently formed centre-right party led by former Civic Platform minister Jarosław Gowin.",
          publicPriorities: [
            "Market-oriented economic policy",
            "Conservative social policy",
          ],
          publicForeignPolicy: [
            "Support NATO while taking a more sovereignty-conscious approach to European integration",
          ],
        },
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

// Earlier Port002B seeds already wrote three placeholder popularity values into
// some Round-Zero saves. Upgrade only those exact legacy values; any other number
// is treated as authored/current campaign state and is preserved.
const LEGACY_SEEDED_PARTY_SUPPORT = Object.freeze({
  "Russian Federation": Object.freeze({
    "united-russia": 53,
  }),
  "Republic of Poland": Object.freeze({
    "civic-platform": 35,
    "law-and-justice": 30,
  }),
});

const LEGACY_SEEDED_PARTY_NAMES = Object.freeze({
  "Russian Federation": Object.freeze({
    "united-russia": Object.freeze({ name: "United Russia" }),
    "communist-party-russian-federation": Object.freeze({ name: "Communist Party of the Russian Federation", shortName: "CPRF" }),
    ldpr: Object.freeze({ name: "Liberal Democratic Party of Russia", shortName: "LDPR" }),
    "a-just-russia": Object.freeze({ name: "A Just Russia" }),
    "civic-platform-russia": Object.freeze({ name: "Civic Platform" }),
    yabloko: Object.freeze({ name: "Yabloko" }),
    "progress-party": Object.freeze({ name: "Progress Party" }),
  }),
  Ukraine: Object.freeze({
    batkivshchyna: Object.freeze({ name: "Batkivshchyna", shortName: "Fatherland" }),
    "solidarity-ukraine": Object.freeze({ name: "Solidarity" }),
    udar: Object.freeze({ name: "UDAR" }),
    "party-of-regions": Object.freeze({ name: "Party of Regions" }),
    "communist-party-ukraine": Object.freeze({ name: "Communist Party of Ukraine", shortName: "CPU" }),
    "radical-party-oleh-liashko": Object.freeze({ name: "Radical Party of Oleh Liashko", shortName: "Radical Party" }),
    svoboda: Object.freeze({ name: "Svoboda" }),
    "right-sector": Object.freeze({ name: "Right Sector" }),
  }),
  "Republic of Poland": Object.freeze({
    "law-and-justice": Object.freeze({ name: "Law and Justice" }),
    "civic-platform": Object.freeze({ name: "Civic Platform" }),
    "democratic-left-alliance": Object.freeze({ name: "Democratic Left Alliance" }),
    "polish-peoples-party": Object.freeze({ name: "Polish People's Party" }),
    "your-movement": Object.freeze({ name: "Your Movement" }),
    "solidary-poland": Object.freeze({ name: "Solidary Poland" }),
    "congress-new-right": Object.freeze({ name: "Congress of the New Right" }),
    "poland-together": Object.freeze({ name: "Poland Together" }),
  }),
});

const LEGACY_GOVERNMENT_PARTY_LABELS = Object.freeze({
  "Russian Federation": Object.freeze({ "United Russia": "Единая Россия" }),
  Ukraine: Object.freeze({ Batkivshchyna: "Батьківщина" }),
  "Republic of Poland": Object.freeze({
    "Civic Platform": "Platforma Obywatelska",
    "Polish People's Party": "Polskie Stronnictwo Ludowe",
  }),
});

const partyIdentity = (party) =>
  String(party?.id || party?.name || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const mergePartySeed = (targetParties, seedParties, polityKey) => {
  const out = Array.isArray(targetParties) ? clone(targetParties) : [];
  for (const seedParty of Array.isArray(seedParties) ? seedParties : []) {
    const seedKey = partyIdentity(seedParty);
    if (!seedKey) continue;
    const index = out.findIndex((party) => partyIdentity(party) === seedKey);
    if (index < 0) {
      out.push(clone(seedParty));
      continue;
    }

    const currentParty = out[index];
    const merged = mergeMissing(currentParty, seedParty);
    const legacyName = LEGACY_SEEDED_PARTY_NAMES?.[polityKey]?.[seedKey];
    if (legacyName?.name && currentParty?.name === legacyName.name && seedParty?.name) merged.name = seedParty.name;
    if (legacyName?.shortName && currentParty?.shortName === legacyName.shortName && seedParty?.shortName) merged.shortName = seedParty.shortName;
    const legacySupport = LEGACY_SEEDED_PARTY_SUPPORT?.[polityKey]?.[seedKey];
    const currentSupport = Number(currentParty?.support?.percent);
    const seedSupport = Number(seedParty?.support?.percent);
    if (
      Number.isFinite(legacySupport)
      && Number.isFinite(currentSupport)
      && Number.isFinite(seedSupport)
      && currentSupport === legacySupport
      && seedSupport !== legacySupport
    ) {
      merged.support = {
        ...(isObject(merged.support) ? merged.support : {}),
        percent: seedSupport,
      };
    }
    out[index] = merged;
  }
  return out;
};

const mergePoliticalActorSeed = (targetActor, seedActor, polityKey) => {
  const current = isObject(targetActor) ? targetActor : {};
  const seed = isObject(seedActor) ? seedActor : {};
  const { parties: currentParties, ...currentRest } = current;
  const { parties: seedParties, ...seedRest } = seed;
  const merged = mergeMissing(currentRest, seedRest);
  const labelMap = LEGACY_GOVERNMENT_PARTY_LABELS?.[polityKey] || {};
  if (isObject(merged.government)) {
    for (const key of ["rulingParties", "coalition"]) {
      if (!Array.isArray(merged.government[key])) continue;
      merged.government[key] = merged.government[key].map((name) => labelMap[name] || name);
    }
  }
  if (Array.isArray(currentParties) || Array.isArray(seedParties)) {
    merged.parties = mergePartySeed(currentParties, seedParties, polityKey);
  }
  return merged;
};

export const mergePoliticalActorsSeed = (world) => {
  const next = isObject(world) ? clone(world) : {};
  const current = isObject(next.politicalActors) ? next.politicalActors : {};
  next.politicalActors = {
    ...current,
    schemaVersion: 2,
    byPolity: isObject(current.byPolity) ? clone(current.byPolity) : {},
  };
  for (const [key, seedActor] of Object.entries(FAULT_LINES_2014_POLITICAL_ACTORS.byPolity)) {
    next.politicalActors.byPolity[key] = mergePoliticalActorSeed(
      next.politicalActors.byPolity[key],
      seedActor,
      key,
    );
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
