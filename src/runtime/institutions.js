/*! Open Historia Continuum — canonical institutions / membership ledger */

import { buildPolityIdentityIndex, resolvePolityIdentity } from "./polityIdentity.js";

export const INSTITUTIONS_SCHEMA_VERSION = 1;
export const INSTITUTION_LEDGER_VERSION = 1;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => clean(value).toLocaleLowerCase();
const array = (value) => Array.isArray(value) ? value : [];
const clone = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};
const slug = (value) => lower(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 72);
const unique = (values, limit = 128) => {
  const out = [];
  const seen = new Set();
  for (const raw of array(values)) {
    const value = clean(raw);
    const key = lower(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
};

const DATEISH_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const comparableDate = (value, edge = "start") => {
  const text = clean(value);
  const match = text.match(DATEISH_RE);
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

const KNOWN_INSTITUTION_TEMPORAL_BOUNDS = Object.freeze([
  { ids: ["nato", "otan", "north-atlantic-treaty-organization", "north-atlantic-treaty-organisation", "north-atlantic-alliance"], foundedDate: "1949-04-04", dissolvedDate: "" },
  { ids: ["european-union", "eu"], foundedDate: "1993-11-01", dissolvedDate: "" },
  { ids: ["collective-security-treaty-organization", "csto"], foundedDate: "2002-10-07", dissolvedDate: "" },
  { ids: ["visegrad-group", "visegrad"], foundedDate: "1991-02-15", dissolvedDate: "" },
  { ids: ["association-of-southeast-asian-nations", "asean"], foundedDate: "1967-08-08", dissolvedDate: "" },
  { ids: ["african-union", "au"], foundedDate: "2002-07-09", dissolvedDate: "" },
  { ids: ["gulf-cooperation-council", "gcc"], foundedDate: "1981-05-25", dissolvedDate: "" },
  { ids: ["commonwealth-of-independent-states", "cis"], foundedDate: "1991-12-08", dissolvedDate: "" },
  { ids: ["organization-for-security-and-co-operation-in-europe", "osce"], foundedDate: "1995-01-01", dissolvedDate: "" },
  { ids: ["conference-on-security-and-co-operation-in-europe", "csce"], foundedDate: "1975-08-01", dissolvedDate: "1995-01-01" },
  { ids: ["united-nations", "un"], foundedDate: "1945-10-24", dissolvedDate: "" },
  { ids: ["warsaw-pact", "warsaw-treaty-organization"], foundedDate: "1955-05-14", dissolvedDate: "1991-07-01" },
  { ids: ["league-of-nations"], foundedDate: "1920-01-10", dissolvedDate: "1946-04-20" },
  { ids: ["council-for-mutual-economic-assistance", "comecon", "cmea"], foundedDate: "1949-01-25", dissolvedDate: "1991-06-28" },
  { ids: ["organization-of-african-unity", "oau"], foundedDate: "1963-05-25", dissolvedDate: "2002-07-09" },
  { ids: ["european-economic-community", "eec"], foundedDate: "1958-01-01", dissolvedDate: "1993-11-01" },
]);

const knownInstitutionBounds = (institution = {}) => {
  const keys = new Set([
    slug(institution?.id),
    slug(institution?.name),
    ...array(institution?.aliases).map(slug),
  ].filter(Boolean));
  return KNOWN_INSTITUTION_TEMPORAL_BOUNDS.find((entry) => entry.ids.some((id) => keys.has(id))) || null;
};

export const validateInstitutionTemporalBaseline = ({
  institution = {},
  scenarioDate = "",
  existingInstitution = null,
  membershipDate = "",
} = {}) => {
  // Structured scenario-authored state outranks real-history guards. This lets
  // fictional/alternate scenarios intentionally define an institution earlier
  // than its real-world namesake without the generated baseline deleting it.
  if (existingInstitution) {
    return {
      valid: true,
      foundedDate: clean(existingInstitution.foundedDate || institution.foundedDate),
      dissolvedDate: clean(existingInstitution.dissolvedDate || institution.dissolvedDate),
      reason: "",
    };
  }

  const scenarioKey = comparableDate(scenarioDate, "start");
  if (!scenarioKey) return { valid: true, foundedDate: clean(institution.foundedDate), dissolvedDate: clean(institution.dissolvedDate), reason: "" };

  const known = knownInstitutionBounds(institution);
  const suppliedFounded = clean(institution.foundedDate);
  const suppliedDissolved = clean(institution.dissolvedDate);
  const foundedDate = clean(known?.foundedDate || suppliedFounded);
  const dissolvedDate = clean(known?.dissolvedDate || suppliedDissolved);
  const foundedKey = comparableDate(foundedDate, "start");
  const dissolvedKey = comparableDate(dissolvedDate, "end");
  const memberKey = comparableDate(membershipDate, "start");

  // Generated institutions need at least a temporal start anchor. Known
  // institutions can obtain that anchor from the native guard table; unknown
  // or fictional ones must provide it in the AI proposal.
  if (!foundedKey) {
    return { valid: false, foundedDate, dissolvedDate, reason: "generated institution is missing a usable foundedDate" };
  }
  if (scenarioKey < foundedKey) {
    return { valid: false, foundedDate, dissolvedDate, reason: `institution was not founded until ${foundedDate}` };
  }
  if (dissolvedKey && scenarioKey >= dissolvedKey) {
    return { valid: false, foundedDate, dissolvedDate, reason: `institution was already dissolved by ${dissolvedDate}` };
  }
  if (membershipDate && !memberKey) {
    return { valid: false, foundedDate, dissolvedDate, reason: `membership date ${membershipDate} is not a usable historical date` };
  }
  if (memberKey && memberKey > scenarioKey) {
    return { valid: false, foundedDate, dissolvedDate, reason: `membership does not begin until ${membershipDate}` };
  }
  if (memberKey && memberKey < foundedKey) {
    return { valid: false, foundedDate, dissolvedDate, reason: `membership date ${membershipDate} predates institution founding ${foundedDate}` };
  }
  return { valid: true, foundedDate, dissolvedDate, reason: "" };
};

export const INSTITUTION_KINDS = Object.freeze([
  "security_alliance",
  "defense_pact",
  "political_union",
  "economic_union",
  "regional_bloc",
  "international_organization",
  "consultative_group",
  "other",
]);
const INSTITUTION_KIND_SET = new Set(INSTITUTION_KINDS);

export const INSTITUTION_MEMBER_STATUSES = Object.freeze([
  "member",
  "candidate",
  "associate",
  "observer",
  "suspended",
]);
const MEMBER_STATUS_SET = new Set(INSTITUTION_MEMBER_STATUSES);

export const INSTITUTION_MEMBER_ROLES = Object.freeze([
  "leader",
  "leading-member",
  "member",
]);
const MEMBER_ROLE_SET = new Set(INSTITUTION_MEMBER_ROLES);

const hasExactPolityKey = (world, token) => Boolean(
  Object.prototype.hasOwnProperty.call(world?.polityOverrides || {}, token)
  || Object.prototype.hasOwnProperty.call(world?.politicalActors?.byPolity || {}, token)
  || Object.prototype.hasOwnProperty.call(world?.countryStats || {}, token)
  || Object.prototype.hasOwnProperty.call(world?.powerStatus?.byPolity || {}, token)
);

const canonicalPolity = (value, world, identityIndex = null) => {
  const token = clean(value);
  if (!token) return "";
  if (hasExactPolityKey(world || {}, token)) return token;
  const identity = resolvePolityIdentity(token, world || {}, {
    allowUnknown: true,
    requireActive: false,
    allowCoreMatch: true,
    allowStockBase: true,
    identityIndex,
  });
  return clean(identity?.resolved || token);
};

const normalizeMember = (value, world, identityIndex = null) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const polity = canonicalPolity(value.polity || value.country || value.member, world, identityIndex);
  if (!polity) return null;
  const statusRaw = lower(value.status || "member");
  const roleRaw = lower(value.role || "member");
  return {
    polity,
    status: MEMBER_STATUS_SET.has(statusRaw) ? statusRaw : "member",
    role: MEMBER_ROLE_SET.has(roleRaw) ? roleRaw : "member",
    sinceDate: clean(value.sinceDate || value.joinedDate),
    lastUpdatedDate: clean(value.lastUpdatedDate || value.sinceDate || value.joinedDate),
    sourceEventIds: unique(value.sourceEventIds, 24),
    note: clean(value.note).slice(0, 600),
  };
};

export const normalizeInstitutionRecord = (value, fallbackId = "", world = {}, identityIndex = null) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = slug(value.id || fallbackId || value.name);
  const name = clean(value.name || value.title || id);
  if (!id || !name) return null;
  const kindRaw = lower(value.kind || value.type || "other").replace(/[\s-]+/g, "_");
  const status = lower(value.status || "active");
  const memberMap = new Map();
  for (const rawMember of array(value.members)) {
    const member = normalizeMember(rawMember, world, identityIndex);
    if (!member) continue;
    memberMap.set(lower(member.polity), member);
  }
  const leaders = unique([
    ...array(value.leaders),
    ...[...memberMap.values()].filter((member) => ["leader", "leading-member"].includes(member.role)).map((member) => member.polity),
  ], 24).map((polity) => canonicalPolity(polity, world, identityIndex)).filter(Boolean);
  const leaderKeys = new Set(leaders.map(lower));
  for (const member of memberMap.values()) {
    if (leaderKeys.has(lower(member.polity)) && member.role === "member") member.role = "leading-member";
  }
  return {
    id,
    name,
    shortName: clean(value.shortName).slice(0, 80),
    aliases: unique(value.aliases, 24),
    kind: INSTITUTION_KIND_SET.has(kindRaw) ? kindRaw : "other",
    status: ["active", "dormant", "dissolved"].includes(status) ? status : "active",
    members: [...memberMap.values()].sort((a, b) => a.polity.localeCompare(b.polity)),
    leaders,
    foundedDate: clean(value.foundedDate),
    dissolvedDate: clean(value.dissolvedDate),
    lastUpdatedDate: clean(value.lastUpdatedDate),
    note: clean(value.note).slice(0, 1000),
    sourceEventIds: unique(value.sourceEventIds, 24),
  };
};

export const normalizeInstitutions = (input, world = {}) => {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const byIdSource = source.byId && typeof source.byId === "object" && !Array.isArray(source.byId)
    ? source.byId
    : source;
  // Institution ledgers can contain hundreds of memberships. Build save identity
  // metadata at most once per normalization instead of once per member.
  const identityIndex = buildPolityIdentityIndex(world || {});
  const byId = {};
  for (const [rawId, rawInstitution] of Object.entries(byIdSource)) {
    if (rawId === "schemaVersion" || rawId === "ledgerVersion") continue;
    const institution = normalizeInstitutionRecord(rawInstitution, rawId, world, identityIndex);
    if (institution) byId[institution.id] = institution;
  }
  return {
    schemaVersion: INSTITUTIONS_SCHEMA_VERSION,
    ledgerVersion: Math.max(0, Math.trunc(Number(source.ledgerVersion) || 0)),
    byId,
  };
};

const parseCsv = (value) => clean(value).split(",").map(clean).filter(Boolean);
const parseEventNumbers = (value) => parseCsv(value)
  .map((entry) => Number(entry))
  .filter((entry) => Number.isInteger(entry) && entry > 0)
  .map((entry) => entry - 1);

export const decodeInstitutionUpdates = (value) => {
  if (Array.isArray(value)) return value.filter((entry) => entry && typeof entry === "object").map(clone);
  const text = clean(value);
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [id, op, polity, status, role, eventNumbers, name, kind, note] = line.split("~");
    return {
      id: clean(id),
      op: lower(op),
      polity: clean(polity),
      status: lower(status),
      role: lower(role),
      eventIndexes: parseEventNumbers(eventNumbers),
      eventIds: [],
      name: clean(name),
      kind: lower(kind).replace(/[\s-]+/g, "_"),
      note: clean(note),
    };
  });
};

export const bindInstitutionUpdatesToEvents = (updatesInput, eventsInput) => {
  const events = array(eventsInput);
  return decodeInstitutionUpdates(updatesInput).map((update) => {
    const eventIds = unique([
      ...array(update.eventIds),
      ...array(update.eventIndexes)
        .filter((index) => Number.isInteger(index) && index >= 0 && index < events.length)
        .map((index) => clean(events[index]?.id))
        .filter(Boolean),
    ], 24);
    return { ...update, eventIds };
  });
};

export const validateInstitutionUpdates = (updatesInput, {
  world = {},
  events = [],
  allowUnboundBaseline = false,
  enforceTemporalBaseline = false,
  baselineDate = "",
} = {}) => {
  const institutions = normalizeInstitutions(world?.institutions, world);
  const updates = bindInstitutionUpdatesToEvents(updatesInput, events);
  const known = new Set(Object.keys(institutions.byId));
  for (let index = 0; index < updates.length; index += 1) {
    const update = updates[index];
    const op = lower(update.op);
    const id = slug(update.id || update.name);
    if (!id) return `$.institutionUpdates record ${index + 1} requires an institution id.`;
    if (!["create", "join", "leave", "suspend", "restore", "role", "dissolve"].includes(op)) {
      return `$.institutionUpdates record ${index + 1} has unsupported op ${op || "<blank>"}.`;
    }
    if (!["create", "dissolve"].includes(op)) {
      const polity = canonicalPolity(update.polity, world);
      if (!polity) return `$.institutionUpdates record ${index + 1} requires a polity.`;
    }
    if (op === "create" && !clean(update.name)) return `$.institutionUpdates record ${index + 1} create requires name.`;
    if (enforceTemporalBaseline && op === "create" && !institutions.byId[id]) {
      const temporal = validateInstitutionTemporalBaseline({
        institution: { id, name: update.name, aliases: update.aliases, foundedDate: update.foundedDate, dissolvedDate: update.dissolvedDate },
        scenarioDate: clean(baselineDate),
      });
      if (!temporal.valid) return `$.institutionUpdates record ${index + 1} is temporally invalid for ${clean(baselineDate)}: ${temporal.reason}.`;
    }
    if (enforceTemporalBaseline && op === "join" && clean(update.sinceDate)) {
      const joined = comparableDate(update.sinceDate, "start");
      const baseline = comparableDate(baselineDate, "start");
      if (!joined || (baseline && joined > baseline)) {
        return `$.institutionUpdates record ${index + 1} has membership date ${clean(update.sinceDate) || "<blank>"} after/invalid for baseline ${clean(baselineDate)}.`;
      }
    }
    if (!allowUnboundBaseline && op !== "create" && !array(update.eventIds).length) {
      return `$.institutionUpdates record ${index + 1} must bind to a causal event.`;
    }
    if (op === "join" && update.status && !MEMBER_STATUS_SET.has(lower(update.status))) {
      return `$.institutionUpdates record ${index + 1} has unsupported member status ${update.status}.`;
    }
    if (op === "role" && !MEMBER_ROLE_SET.has(lower(update.role))) {
      return `$.institutionUpdates record ${index + 1} has unsupported role ${update.role || "<blank>"}.`;
    }
    if (op === "create" || clean(update.name)) known.add(id);
    if (!["create", "join"].includes(op) && !known.has(id)) {
      return `$.institutionUpdates record ${index + 1} references unknown institution ${id}.`;
    }
  }
  return "";
};

const upsertMember = (institution, member) => {
  const members = array(institution.members).filter((entry) => lower(entry.polity) !== lower(member.polity));
  members.push(member);
  institution.members = members.sort((a, b) => a.polity.localeCompare(b.polity));
  institution.leaders = unique([
    ...array(institution.leaders).filter((polity) => lower(polity) !== lower(member.polity)),
    ...(["leader", "leading-member"].includes(member.role) ? [member.polity] : []),
  ], 24);
};

export const applyInstitutionUpdates = ({
  world: worldLike,
  updates: updatesInput,
  events = [],
  stopDate = "",
  round = 0,
  allowUnboundBaseline = false,
  enforceTemporalBaseline = false,
} = {}) => {
  const world = clone(worldLike || {});
  const institutions = normalizeInstitutions(world.institutions, world);
  const updates = bindInstitutionUpdatesToEvents(updatesInput, events);
  const error = validateInstitutionUpdates(updates, {
    world: { ...world, institutions },
    events,
    allowUnboundBaseline,
    enforceTemporalBaseline,
    baselineDate: stopDate,
  });
  if (error) return { world: { ...world, institutions }, institutions, appliedIds: [], error };
  const appliedIds = [];
  const eventById = new Map(array(events).map((event) => [clean(event?.id), event]));

  for (let index = 0; index < updates.length; index += 1) {
    const update = updates[index];
    const id = slug(update.id || update.name);
    const op = lower(update.op);
    const sourceEventIds = unique(update.eventIds, 24);
    const sourceDates = sourceEventIds.map((eventId) => clean(eventById.get(eventId)?.date)).filter(Boolean).sort();
    const updateDate = sourceDates.at(-1) || clean(stopDate);
    let institution = institutions.byId[id] || normalizeInstitutionRecord({ id, name: clean(update.name) || id, kind: update.kind || "other" }, id, world);

    if (op === "create") {
      institution = normalizeInstitutionRecord({
        ...institution,
        id,
        name: clean(update.name) || institution?.name || id,
        kind: update.kind || institution?.kind || "other",
        status: "active",
        foundedDate: clean(update.foundedDate) || institution?.foundedDate || updateDate,
        dissolvedDate: clean(update.dissolvedDate) || institution?.dissolvedDate || "",
        lastUpdatedDate: updateDate,
        note: clean(update.note) || institution?.note,
        sourceEventIds: unique([...(institution?.sourceEventIds || []), ...sourceEventIds], 24),
      }, id, world);
      institutions.byId[id] = institution;
      appliedIds.push(`${id}:create`);
      continue;
    }

    if (!institution) continue;
    if (!institutions.byId[id]) institutions.byId[id] = institution;
    const polity = canonicalPolity(update.polity, world);
    const existingMember = array(institution.members).find((entry) => lower(entry.polity) === lower(polity));

    if (op === "join" || op === "restore") {
      const status = op === "restore" ? "member" : (MEMBER_STATUS_SET.has(lower(update.status)) ? lower(update.status) : "member");
      const role = MEMBER_ROLE_SET.has(lower(update.role)) ? lower(update.role) : (existingMember?.role || "member");
      upsertMember(institution, {
        polity,
        status,
        role,
        sinceDate: existingMember?.sinceDate || clean(update.sinceDate) || updateDate,
        lastUpdatedDate: updateDate,
        sourceEventIds: unique([...(existingMember?.sourceEventIds || []), ...sourceEventIds], 24),
        note: clean(update.note) || existingMember?.note || "",
      });
    } else if (op === "suspend") {
      if (!existingMember) continue;
      upsertMember(institution, { ...existingMember, status: "suspended", lastUpdatedDate: updateDate, sourceEventIds: unique([...(existingMember.sourceEventIds || []), ...sourceEventIds], 24), note: clean(update.note) || existingMember.note || "" });
    } else if (op === "role") {
      if (!existingMember) continue;
      upsertMember(institution, { ...existingMember, role: lower(update.role), lastUpdatedDate: updateDate, sourceEventIds: unique([...(existingMember.sourceEventIds || []), ...sourceEventIds], 24), note: clean(update.note) || existingMember.note || "" });
    } else if (op === "leave") {
      institution.members = array(institution.members).filter((entry) => lower(entry.polity) !== lower(polity));
      institution.leaders = array(institution.leaders).filter((entry) => lower(entry) !== lower(polity));
    } else if (op === "dissolve") {
      institution.status = "dissolved";
      institution.dissolvedDate = updateDate;
    }

    institution.lastUpdatedDate = updateDate || institution.lastUpdatedDate || "";
    institution.sourceEventIds = unique([...(institution.sourceEventIds || []), ...sourceEventIds], 24);
    institution.note = clean(update.note) || institution.note || "";
    institutions.byId[id] = normalizeInstitutionRecord(institution, id, world);
    appliedIds.push(`${id}:${op}${polity ? `:${polity}` : ""}`);
  }

  institutions.ledgerVersion = Math.max(Number(institutions.ledgerVersion) || 0, INSTITUTION_LEDGER_VERSION);
  return { world: { ...world, institutions }, institutions, appliedIds, error: "" };
};

export const removePolityFromInstitutions = (institutionsInput, polityInput, world = {}, date = "") => {
  const institutions = normalizeInstitutions(institutionsInput, world);
  const polity = canonicalPolity(polityInput, world);
  if (!polity) return institutions;
  for (const [id, institution] of Object.entries(institutions.byId)) {
    const members = array(institution.members).filter((member) => lower(member.polity) !== lower(polity));
    const leaders = array(institution.leaders).filter((leader) => lower(leader) !== lower(polity));
    if (members.length === institution.members.length && leaders.length === institution.leaders.length) continue;
    institutions.byId[id] = { ...institution, members, leaders, lastUpdatedDate: clean(date) || institution.lastUpdatedDate || "" };
  }
  return institutions;
};

export const institutionsForPolity = (world, polityInput, { includeSuspended = true } = {}) => {
  const polity = canonicalPolity(polityInput, world);
  if (!polity) return [];
  const wanted = lower(polity);
  const source = world?.institutions && typeof world.institutions === "object" ? world.institutions : {};
  const byIdSource = source.byId && typeof source.byId === "object" && !Array.isArray(source.byId)
    ? source.byId
    : source;
  const out = [];
  let identityIndex = null;

  // Hot read path: the applied ledger is already canonical. Do not normalize the
  // entire institution ledger for every country badge / prompt-summary lookup.
  for (const [rawId, rawInstitution] of Object.entries(byIdSource)) {
    if (rawId === "schemaVersion" || rawId === "ledgerVersion") continue;
    if (!rawInstitution || typeof rawInstitution !== "object" || Array.isArray(rawInstitution)) continue;
    if (lower(rawInstitution.status || "active") === "dissolved") continue;
    let member = array(rawInstitution.members).find((entry) => lower(entry?.polity || entry?.country || entry?.member) === wanted);
    if (!member) {
      const candidates = array(rawInstitution.members).filter((entry) => entry && typeof entry === "object");
      for (const candidate of candidates) {
        const rawPolity = clean(candidate?.polity || candidate?.country || candidate?.member);
        if (!rawPolity) continue;
        if (!identityIndex) identityIndex = buildPolityIdentityIndex(world || {});
        if (lower(canonicalPolity(rawPolity, world, identityIndex)) === wanted) {
          member = candidate;
          break;
        }
      }
    }
    if (!member) continue;
    const statusRaw = lower(member.status || "member");
    const normalizedMember = {
      ...member,
      polity,
      status: MEMBER_STATUS_SET.has(statusRaw) ? statusRaw : "member",
      role: MEMBER_ROLE_SET.has(lower(member.role || "member")) ? lower(member.role || "member") : "member",
    };
    if (!includeSuspended && normalizedMember.status === "suspended") continue;
    const institution = {
      ...rawInstitution,
      id: slug(rawInstitution.id || rawId || rawInstitution.name),
      name: clean(rawInstitution.name || rawInstitution.title || rawId),
      kind: INSTITUTION_KIND_SET.has(lower(rawInstitution.kind || rawInstitution.type || "other").replace(/[\s-]+/g, "_"))
        ? lower(rawInstitution.kind || rawInstitution.type || "other").replace(/[\s-]+/g, "_")
        : "other",
      status: lower(rawInstitution.status || "active"),
    };
    out.push({ institution, member: normalizedMember });
  }
  return out.sort((a, b) => institutionStrategicPriority(b.institution) - institutionStrategicPriority(a.institution) || a.institution.name.localeCompare(b.institution.name));
};

const INSTITUTION_PRIORITY_BY_ID = Object.freeze({
  nato: 100,
  "european-union": 95,
  eu: 95,
  csto: 92,
  "collective-security-treaty-organization": 92,
  "warsaw-pact": 92,
  "gulf-cooperation-council": 80,
  gcc: 80,
  asean: 76,
  "african-union": 74,
  au: 74,
  cis: 70,
  "commonwealth-of-independent-states": 70,
  "visegrad-group": 66,
  visegrad: 66,
  osce: 45,
  un: 20,
  "united-nations": 20,
});

export const institutionStrategicPriority = (institution) => {
  const id = slug(institution?.id || institution?.name);
  const byId = INSTITUTION_PRIORITY_BY_ID[id] ?? 0;
  const kind = lower(institution?.kind);
  const byKind = kind === "security_alliance" ? 85
    : kind === "defense_pact" ? 82
      : kind === "political_union" ? 78
        : kind === "economic_union" ? 70
          : kind === "regional_bloc" ? 60
            : kind === "consultative_group" ? 45
              : 30;
  return Math.max(byId, byKind);
};

const canonicalBadgeRoot = (institution) => {
  const id = slug(institution?.id || institution?.name);
  const aliases = {
    "north-atlantic-treaty-organization": "nato",
    nato: "nato",
    "european-union": "eu",
    eu: "eu",
    "collective-security-treaty-organization": "csto",
    csto: "csto",
    "gulf-cooperation-council": "gcc",
    gcc: "gcc",
    "african-union": "au",
    au: "au",
    "association-of-southeast-asian-nations": "asean",
    asean: "asean",
    "commonwealth-of-independent-states": "cis",
    cis: "cis",
    "visegrad-group": "visegrad",
    visegrad: "visegrad",
    "organization-for-security-and-co-operation-in-europe": "osce",
    osce: "osce",
  };
  return aliases[id] || id;
};

export const institutionMembershipBadge = (institution, member) => {
  const root = canonicalBadgeRoot(institution);
  if (!root || !member) return "";
  const status = lower(member.status || "member");
  if (status === "member") return `${root}-member`;
  if (status === "candidate") return `${root}-candidate`;
  if (status === "associate") return `${root}-associate`;
  if (status === "observer") return `${root}-observer`;
  if (status === "suspended") return `${root}-suspended`;
  return "";
};

export const buildInstitutionContext = (world, focusPolities = [], { maxInstitutions = 14 } = {}) => {
  const focus = new Set(array(focusPolities).map((polity) => lower(canonicalPolity(polity, world))).filter(Boolean));
  const institutions = normalizeInstitutions(world?.institutions, world);
  const rows = Object.values(institutions.byId)
    .filter((institution) => institution.status !== "dissolved")
    .filter((institution) => !focus.size || array(institution.members).some((member) => focus.has(lower(member.polity))))
    .sort((a, b) => institutionStrategicPriority(b) - institutionStrategicPriority(a))
    .slice(0, Math.max(1, maxInstitutions));
  return rows.map((institution) => {
    const members = array(institution.members)
      .filter((member) => !focus.size || focus.has(lower(member.polity)))
      .map((member) => `${member.polity} (${member.status}${member.role !== "member" ? `, ${member.role}` : ""})`);
    return `- ${institution.name} [${institution.id}; ${institution.kind}]${members.length ? `: ${members.join(", ")}` : ""}`;
  }).join("\n");
};
