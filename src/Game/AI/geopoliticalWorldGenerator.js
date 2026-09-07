/*! Open Historia Continuum — bounded geopolitical substrate generator */

import { callAI } from "./main.jsx";
import { applyDiplomaticUpdates } from "./nativeDiplomaticDirector.js";
import { applyInstitutionUpdates, INSTITUTION_KINDS, normalizeInstitutions, validateInstitutionTemporalBaseline } from "../../runtime/institutions.js";
import { normalizePowerStatus, normalizePowerTier, seedPowerTier } from "../../runtime/powerStatus.js";
import { resolvePolityIdentity } from "../../runtime/polityIdentity.js";

export const GEOPOLITICAL_WORLD_BATCH_SIZE = 48;
export const GEOPOLITICAL_WORLD_SCHEMA_VERSION = 1;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => clean(value).toLocaleLowerCase();
const array = (value) => Array.isArray(value) ? value : [];
const clone = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};
const slug = (value) => lower(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

export const GEOPOLITICAL_WORLD_TOOL = Object.freeze({
  name: "submit_geopolitical_world_baseline",
  description: "Submit a bounded exact-date geopolitical baseline. The nested records travel as JSON strings for provider compatibility.",
  schema: Object.freeze({
    type: "object",
    properties: {
      politiesJson: { type: "string", description: "JSON array text. Exactly one record per requested polity: polityKey, powerTier, memberships[]." },
      agreementsJson: { type: "string", description: "JSON array text of strategically important active formal agreements involving requested polities. Use [] when none." },
    },
    required: ["politiesJson", "agreementsJson"],
    additionalProperties: false,
  }),
});

const parseArrayText = (value) => {
  if (Array.isArray(value)) return value;
  const text = clean(value);
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("provider field must decode to a JSON array");
  return parsed;
};

const parseTool = (response) => {
  const source = response?.toolInput && typeof response.toolInput === "object"
    ? response.toolInput
    : response && typeof response === "object" && !Array.isArray(response) ? response : null;
  if (!source) return null;
  return {
    polities: parseArrayText(source.politiesJson ?? source.polities),
    agreements: parseArrayText(source.agreementsJson ?? source.agreements),
  };
};

const canonicalPolity = (value, world, allowedByLower) => {
  const token = clean(value);
  if (!token) return "";
  const direct = allowedByLower.get(lower(token));
  if (direct) return direct;
  const resolved = resolvePolityIdentity(token, world || {}, {
    allowUnknown: false,
    requireActive: false,
    allowCoreMatch: true,
    allowStockBase: true,
  });
  const canonical = clean(resolved?.resolved);
  return allowedByLower.get(lower(canonical)) || "";
};

const normalizeMembership = (value, { world = {}, scenarioDate = "", warnings = [] } = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = slug(value.id || value.name);
  const name = clean(value.name || value.shortName || id);
  const kind = lower(value.kind).replace(/[\s-]+/g, "_");
  const status = lower(value.status || "member");
  const role = lower(value.role || "member");
  if (!id || !name || !INSTITUTION_KINDS.includes(kind)) return null;
  if (!["member", "candidate", "associate", "observer", "suspended"].includes(status)) return null;
  if (!["leader", "leading-member", "member"].includes(role)) return null;

  const existingInstitutions = normalizeInstitutions(world?.institutions, world);
  const existingInstitution = existingInstitutions.byId[id] || Object.values(existingInstitutions.byId)
    .find((entry) => slug(entry?.name) === id || slug(entry?.id) === slug(name)) || null;
  const joinedDate = clean(value.joinedDate || value.sinceDate || value.statusSinceDate);
  const temporal = validateInstitutionTemporalBaseline({
    institution: {
      id,
      name,
      aliases: array(value.aliases),
      foundedDate: clean(value.foundedDate),
      dissolvedDate: clean(value.dissolvedDate),
    },
    scenarioDate,
    existingInstitution,
    membershipDate: joinedDate,
  });
  if (!temporal.valid) {
    warnings.push(`${name}: dropped temporally invalid generated membership for ${scenarioDate}: ${temporal.reason}.`);
    return null;
  }
  return {
    id,
    name,
    kind,
    status,
    role,
    foundedDate: temporal.foundedDate,
    dissolvedDate: temporal.dissolvedDate,
    joinedDate,
    note: clean(value.note).slice(0, 300),
  };
};

const dateKey = (value, edge = "start") => {
  const text = clean(value);
  const match = text.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : (edge === "end" ? 12 : 1);
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const day = match[3] ? Number(match[3]) : (edge === "end" ? monthDays[month - 1] : 1);
  if (day < 1 || day > monthDays[month - 1]) return null;
  return year * 10000 + month * 100 + day;
};

const normalizeAgreement = (value, world, allowedByLower, scenarioDate, warnings = []) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parties = array(value.parties).map((entry) => canonicalPolity(entry, world, allowedByLower)).filter(Boolean);
  const uniqueParties = [...new Set(parties)];
  if (uniqueParties.length < 2) return null;
  const type = lower(value.type).replace(/[\s-]+/g, "_");
  const allowedTypes = ["alliance", "mutual_defense", "guarantee", "non_aggression", "friendship_consultation", "trade_economic", "military_cooperation", "military_access", "neutrality", "peace_settlement", "other"];
  const id = slug(value.id || value.title || uniqueParties.join("-"));
  if (!id || !allowedTypes.includes(type)) return null;
  const startedDate = clean(value.startedDate || value.startDate || value.effectiveDate);
  const endedDate = clean(value.endedDate || value.endDate || value.expiredDate);
  const scenarioKey = dateKey(scenarioDate, "start");
  const startedKey = dateKey(startedDate, "start");
  const endedKey = dateKey(endedDate, "end");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedDate) || !startedKey) {
    warnings.push(`${clean(value.title || id)}: dropped generated agreement without an exact YYYY-MM-DD startedDate.`);
    return null;
  }
  if (endedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endedDate) || !endedKey)) {
    warnings.push(`${clean(value.title || id)}: dropped generated agreement with unusable endedDate ${endedDate}.`);
    return null;
  }
  if (scenarioKey && startedKey > scenarioKey) {
    warnings.push(`${clean(value.title || id)}: dropped generated agreement that starts after ${scenarioDate}.`);
    return null;
  }
  if (scenarioKey && endedKey && scenarioKey >= endedKey) {
    warnings.push(`${clean(value.title || id)}: dropped generated agreement already ended by ${scenarioDate}.`);
    return null;
  }
  return {
    id,
    op: "start",
    type,
    parties: uniqueParties,
    eventIndexes: [],
    eventIds: [],
    title: clean(value.title || id).slice(0, 180),
    terms: clean(value.terms || value.note).slice(0, 600),
    startedDate,
    endedDate,
  };
};

const actorSummary = (world, polity) => {
  const actor = world?.politicalActors?.byPolity?.[polity] || {};
  const system = clean(actor?.politicalSystem?.type || actor?.government?.form);
  const legacyTags = array(world?.countryTags?.[polity]).join(", ");
  return `${polity}${system ? ` | system: ${system}` : ""}${legacyTags ? ` | existing descriptors: ${legacyTags}` : ""}`;
};

const existingInstitutionSummary = (world) => Object.values(normalizeInstitutions(world?.institutions, world).byId)
  .slice(0, 48)
  .map((institution) => `- ${institution.name} [${institution.id}]${institution.foundedDate ? ` founded ${institution.foundedDate}` : ""}${institution.dissolvedDate ? ` dissolved ${institution.dissolvedDate}` : ""}`)
  .join("\n")
  .slice(0, 6000);

const buildPrompt = ({ scenarioDate, batch, world, scenarioContext, allPolityKeys = [] }) => {
  const systemPrompt = `You initialize OpenHistoria's canonical geopolitical substrate at Round Zero.

DATE WALL: ${scenarioDate}. Use only institutions, memberships, agreements and power relationships actually true ON this exact date. Later real history has zero authority. Never project present-day organizations backward into earlier eras.

AUTHORITY: structured scenario-authored/canonical state already supplied by the game outranks real history. For fictional or alternate scenarios, preserve the scenario's canon. Do not overwrite it with real-world chronology.

POWER TIERS ARE ERA-RELATIVE AND SCENARIO-RELATIVE. Compare each polity with the other active powers of THIS world and THIS date, not with modern GDP/military thresholds. Every requested polity needs exactly one powerTier: major-power | regional-power | minor-power. Use major-power sparingly for actors able to shape system-level or multi-regional outcomes in their own era; regional-power for meaningful regional weight/reach; minor-power for the remainder.

MEMBERSHIPS: include only strategically relevant formal institutions/blocs actually active on ${scenarioDate}. Derive a stable lowercase id from the institution's canonical name; do not choose from a modern preset list. Formal membership is not fuzzy alignment. For every generated membership include institution foundedDate (YYYY-MM-DD when known; YYYY or YYYY-MM is allowed when historical precision is genuinely lower), dissolvedDate when applicable, and joinedDate/statusSinceDate when known. Never list a polity as a member before it joined or after the institution dissolved. kind must be one of ${INSTITUTION_KINDS.join(" | ")}. status member|candidate|associate|observer|suspended. role leader|leading-member|member.

AGREEMENTS: include strategically important ACTIVE formal agreements not better represented as institution membership. Every agreement must include exact YYYY-MM-DD startedDate and, when applicable, exact YYYY-MM-DD endedDate. Do not include future agreements or agreements already ended by ${scenarioDate}. Do not duplicate a multilateral institution as a bilateral agreement.

No prose outside the required tool. Keep this compact.`;
  const polityVocabulary = array(allPolityKeys).map(clean).filter(Boolean).join(" | ").slice(0, 14000);
  const authoredInstitutions = existingInstitutionSummary(world);
  const userMessage = `Scenario context:
${clean(scenarioContext).slice(0, 5000) || "(none)"}

Existing structured canonical institutions (authoritative; do not contradict or duplicate):
${authoredInstitutions || "(none)"}

Requested polities (${batch.length}):
${batch.map((entry) => `- ${actorSummary(world, entry.polityKey)}`).join("\n")}

Canonical polity keys available for AGREEMENT counterpart resolution (including actors outside this 48-polity batch):
${polityVocabulary || "(none)"}

Only return powerTier/membership PROFILE records for the requested polities above. Agreements may include a counterpart outside this batch when it is a strategically important active agreement; use its exact canonical key from the vocabulary.

Call the tool once. politiesJson must contain one object for every requested polity: {"polityKey":"exact key","powerTier":"major-power|regional-power|minor-power","memberships":[{"id":"stable-name-derived-id","name":"","kind":"","status":"member","role":"member","foundedDate":"YYYY-MM-DD or lower precision","dissolvedDate":"","joinedDate":"","note":""}]}. agreementsJson contains [{"id":"","type":"mutual_defense|guarantee|...","parties":["exact polity keys"],"title":"","terms":"","startedDate":"YYYY-MM-DD","endedDate":""}].`;
  return { systemPrompt, userMessage };
};

export const generateGeopoliticalWorldBaseline = async ({
  scenarioDate,
  polities = [],
  world = {},
  scenarioContext = "",
  callModel = callAI,
  signal,
  onBatch,
} = {}) => {
  const normalizedPower = normalizePowerStatus(world?.powerStatus, world);
  const allPolityKeys = array(polities)
    .map((entry) => clean(typeof entry === "string" ? entry : entry?.polityKey))
    .filter(Boolean);
  const requested = array(polities)
    .map((entry) => typeof entry === "string" ? { polityKey: clean(entry) } : entry)
    .filter((entry) => entry?.active !== false && clean(entry?.polityKey))
    .filter((entry) => !normalizedPower.byPolity[clean(entry.polityKey)]);
  const allowedByLower = new Map(allPolityKeys.map((key) => [lower(key), key]));
  const batches = chunk(requested, GEOPOLITICAL_WORLD_BATCH_SIZE);
  const records = [];
  const agreements = new Map();
  const warnings = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    if (signal?.aborted) throw signal.reason || new DOMException("Geopolitical generation cancelled.", "AbortError");
    const batch = batches[batchIndex];
    const { systemPrompt, userMessage } = buildPrompt({ scenarioDate, batch, world, scenarioContext, allPolityKeys });
    let parsed = null;
    let error = "";
    try {
      const response = await callModel(systemPrompt, [{ role: "user", parts: [{ text: userMessage }] }], {
        signal,
        reasoningEnabled: false,
        taskKey: "politicalWorldGeneration",
        logLabel: "geopolitical baseline",
        tool: GEOPOLITICAL_WORLD_TOOL,
      });
      parsed = parseTool(response);
    } catch (nextError) {
      error = clean(nextError?.message || nextError);
    }
    const returned = new Map();
    for (const raw of array(parsed?.polities)) {
      const polityKey = canonicalPolity(raw?.polityKey, world, allowedByLower);
      if (!polityKey || !batch.some((entry) => entry.polityKey === polityKey) || returned.has(polityKey)) continue;
      const powerTier = normalizePowerTier(raw?.powerTier) || "minor-power";
      const memberships = array(raw?.memberships)
        .map((membership) => normalizeMembership(membership, { world, scenarioDate, warnings }))
        .filter(Boolean)
        .slice(0, 12);
      returned.set(polityKey, { polityKey, powerTier, memberships, basis: "generated-estimate" });
    }
    for (const item of batch) {
      const record = returned.get(item.polityKey);
      if (record) records.push(record);
      else {
        records.push({ polityKey: item.polityKey, powerTier: "minor-power", memberships: [], basis: "native-fallback" });
        warnings.push(`${item.polityKey}: provider omitted/unusable geopolitical baseline; native minor-power fallback used.`);
      }
    }
    for (const raw of array(parsed?.agreements)) {
      const agreement = normalizeAgreement(raw, world, allowedByLower, scenarioDate, warnings);
      if (agreement && agreement.parties.some((party) => batch.some((entry) => entry.polityKey === party))) agreements.set(agreement.id, agreement);
    }
    onBatch?.({ batchIndex, totalBatches: batches.length, resolvedPolities: records.length, totalPolities: requested.length, warning: error });
    if (error) warnings.push(`Batch ${batchIndex + 1}: ${error}`);
  }

  return {
    schemaVersion: GEOPOLITICAL_WORLD_SCHEMA_VERSION,
    scenarioDate: clean(scenarioDate),
    records,
    agreements: [...agreements.values()],
    warnings,
    requestedPolities: requested.length,
    modelCalls: batches.length,
  };
};

export const applyGeopoliticalWorldBaseline = ({ world: worldLike = {}, result, date = "" } = {}) => {
  let world = clone(worldLike || {});
  const applied = [];
  const institutionUpdates = [];
  const existingInstitutions = normalizeInstitutions(world.institutions, world);
  const seenCreates = new Set(Object.keys(existingInstitutions.byId));

  for (const record of array(result?.records)) {
    const polity = clean(record?.polityKey);
    if (!polity) continue;
    if (!normalizePowerStatus(world.powerStatus, world).byPolity[polity]) {
      world = seedPowerTier(world, polity, record.powerTier || "minor-power", { basis: record.basis || "generated-estimate", date, round: 0 });
      applied.push(`${polity}:powerTier`);
    }
    for (const membership of array(record?.memberships)) {
      if (!seenCreates.has(membership.id)) {
        institutionUpdates.push({ id: membership.id, op: "create", polity: "", status: "", role: "", eventIds: [], eventIndexes: [], name: membership.name, kind: membership.kind, foundedDate: membership.foundedDate, dissolvedDate: membership.dissolvedDate, note: membership.note || "Round-Zero generated institutional baseline." });
        seenCreates.add(membership.id);
      }
      institutionUpdates.push({ id: membership.id, op: "join", polity, status: membership.status || "member", role: membership.role || "member", sinceDate: membership.joinedDate, eventIds: [], eventIndexes: [], name: "", kind: "", note: membership.note || "Round-Zero generated membership baseline." });
    }
  }

  const institutionMerge = applyInstitutionUpdates({
    world,
    updates: institutionUpdates,
    events: [],
    stopDate: date,
    round: 0,
    allowUnboundBaseline: true,
    enforceTemporalBaseline: true,
  });
  world = institutionMerge.world;
  applied.push(...institutionMerge.appliedIds.map((id) => `institution:${id}`));

  const knownAgreements = new Set(array(world.agreements).map((entry) => clean(entry?.id)).filter(Boolean));
  const agreementUpdates = array(result?.agreements).filter((entry) => !knownAgreements.has(clean(entry?.id)));
  const diplomaticMerge = applyDiplomaticUpdates({ world, relationUpdates: [], agreementUpdates, events: [], stopDate: date, round: 0, allowUnboundBaseline: true });
  world = diplomaticMerge.world;
  applied.push(...diplomaticMerge.appliedAgreementIds.map((id) => `agreement:${id}`));
  return { world, applied, warnings: array(result?.warnings) };
};
