/*! Open Historia — political actor runtime domain */

import { resolveStockCountryCode } from "./polityIdentity.js";

export const POLITICAL_ACTORS_SCHEMA_VERSION = 2;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const cloneActorValue = (value) => {
    if (!value || typeof value !== "object") return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const clampPercent = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
};

const cleanStringArray = (value, limit = 32) => {
    const source = Array.isArray(value) ? value : (clean(value) ? [value] : []);
    const out = [];
    const seen = new Set();
    for (const entry of source) {
        const text = clean(entry);
        const key = text.toLocaleLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        out.push(text);
        if (out.length >= limit) break;
    }
    return out;
};

const normalizeMetricRecord = (value, { depth = 0, maxDepth = 3, maxKeys = 32, clampNumeric = false } = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || depth > maxDepth) return {};
    const out = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, maxKeys)) {
        const key = clean(rawKey);
        if (!key) continue;
        if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
            const nested = normalizeMetricRecord(rawValue, { depth: depth + 1, maxDepth, maxKeys, clampNumeric });
            if (Object.keys(nested).length) out[key] = nested;
            continue;
        }
        if (Array.isArray(rawValue)) {
            const list = cleanStringArray(rawValue, 16);
            if (list.length) out[key] = list;
            continue;
        }
        if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
            const rounded = Math.round(rawValue * 10) / 10;
            out[key] = clampNumeric ? Math.max(0, Math.min(100, rounded)) : rounded;
            continue;
        }
        if (typeof rawValue === "boolean") {
            out[key] = rawValue;
            continue;
        }
        const text = clean(rawValue);
        if (text) out[key] = text;
    }
    return out;
};

const normalizeOfficeholder = (value) => {
    if (typeof value === "string") return clean(value);
    if (!value || typeof value !== "object" || Array.isArray(value)) return "";
    const name = clean(value.name || value.id);
    if (!name) return "";
    const out = {};
    if (clean(value.id)) out.id = clean(value.id);
    out.name = name;
    const title = clean(value.title || value.role);
    if (title) out.title = title;
    return out;
};

const partyTokenKey = (value) =>
    clean(value)
        .toLocaleLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, "");

const asciiPartySlug = (value) =>
    clean(value)
        .toLocaleLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const stableTextHash = (value) => {
    let hash = 2166136261;
    for (const char of String(value ?? "")) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
};

const derivePartyId = (party, index = 0) => {
    const explicit = clean(party?.id);
    if (explicit) return explicit;
    for (const candidate of [
        party?.shortName,
        party?.abbreviation,
        party?.name,
        ...(Array.isArray(party?.aliases) ? party.aliases : []),
    ]) {
        const slug = asciiPartySlug(candidate);
        if (slug) return slug;
    }
    const seed = clean(party?.name || party?.shortName || party?.abbreviation) || `party-${index + 1}`;
    return `party-${stableTextHash(seed)}`;
};

export const normalizePoliticalParty = (value, { index = 0 } = {}) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const name = clean(value.name || value.shortName || value.abbreviation || value.id);
    if (!name) return null;

    // Preserve unrecognized extension data for forward compatibility, but normalize
    // every field the runtime itself owns. Unknown fields remain inert unless a
    // specific consumer explicitly understands them.
    const out = cloneActorValue(value);
    out.id = derivePartyId(value, index);
    out.name = name;

    const shortName = clean(value.shortName || value.abbreviation);
    if (shortName) out.shortName = shortName;
    else delete out.shortName;
    delete out.abbreviation;

    const aliases = cleanStringArray(value.aliases, 24)
        .filter((alias) => partyTokenKey(alias) !== partyTokenKey(name));
    if (aliases.length) out.aliases = aliases;
    else delete out.aliases;

    const support = clampPercent(value?.support?.percent ?? value?.support);
    if (support != null) out.support = { percent: support };
    else delete out.support;

    const ideology = clean(value.ideology);
    if (ideology) out.ideology = ideology;
    else delete out.ideology;

    const leader = normalizeOfficeholder(value.leader);
    if (leader) out.leader = leader;
    else delete out.leader;

    for (const key of ["goals", "publicPriorities", "publicForeignPolicy"]) {
        const list = cleanStringArray(value[key], 16);
        if (list.length) out[key] = list;
        else delete out[key];
    }

    for (const key of ["publicDescription", "color", "internalStrategy", "internalPressure", "privateGoal"]) {
        const text = clean(value[key]);
        if (text) out[key] = text;
        else delete out[key];
    }

    if (value.ruling === true) out.ruling = true;
    else delete out.ruling;
    if (value.coalition === true) out.coalition = true;
    else delete out.coalition;

    return out;
};

const partyTokens = (party) => [
    party?.id,
    party?.name,
    party?.shortName,
    ...(Array.isArray(party?.aliases) ? party.aliases : []),
].map(clean).filter(Boolean);

export const resolvePoliticalParty = (actorOrWorld, polityOrToken, maybeToken) => {
    const actor = maybeToken === undefined
        ? actorOrWorld
        : getPoliticalProfile(actorOrWorld, polityOrToken);
    const token = maybeToken === undefined ? polityOrToken : maybeToken;
    if (!actor || !Array.isArray(actor.parties)) return null;
    const target = partyTokenKey(token);
    if (!target) return null;
    return actor.parties.find((party) =>
        partyTokens(party).some((candidate) => partyTokenKey(candidate) === target),
    ) || null;
};

const normalizePartyReferenceList = (value, parties, { deriveFromFlags = null } = {}) => {
    const source = cleanStringArray(value, 32);
    const ids = [];
    const unresolvedNames = [];
    const seen = new Set();

    for (const token of source) {
        const match = resolvePoliticalParty({ parties }, token);
        if (match) {
            if (!seen.has(match.id)) {
                seen.add(match.id);
                ids.push(match.id);
            }
        } else {
            const key = partyTokenKey(token);
            if (key && !seen.has(`name:${key}`)) {
                seen.add(`name:${key}`);
                unresolvedNames.push(token);
            }
        }
    }

    if (!ids.length && !unresolvedNames.length && deriveFromFlags) {
        for (const party of parties.filter((entry) => entry?.[deriveFromFlags] === true)) {
            if (!seen.has(party.id)) {
                seen.add(party.id);
                ids.push(party.id);
            }
        }
    }

    return { ids, unresolvedNames };
};

const partyDisplayNamesFromRefs = (ids, unresolvedNames, parties) => {
    const out = [];
    const seen = new Set();
    for (const id of ids) {
        const party = parties.find((entry) => entry.id === id);
        const name = clean(party?.name || id);
        const key = partyTokenKey(name);
        if (!name || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    for (const name of unresolvedNames) {
        const key = partyTokenKey(name);
        if (!name || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
};

export const normalizePoliticalGovernment = (value, parties = []) => {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const out = cloneActorValue(source);

    for (const key of ["form", "ideology", "status", "coalitionName"]) {
        const text = clean(source[key]);
        if (text) out[key] = text;
        else delete out[key];
    }

    const headOfState = normalizeOfficeholder(source.headOfState || source.headOfStateId);
    const headOfGovernment = normalizeOfficeholder(source.headOfGovernment || source.headOfGovernmentId);
    if (headOfState) out.headOfState = headOfState;
    else delete out.headOfState;
    if (headOfGovernment) out.headOfGovernment = headOfGovernment;
    else delete out.headOfGovernment;
    delete out.headOfStateId;
    delete out.headOfGovernmentId;

    for (const key of ["approval", "stability"]) {
        const number = clampPercent(source[key]);
        if (number != null) out[key] = number;
        else delete out[key];
    }

    const hasExplicitRulingRefs =
        Object.prototype.hasOwnProperty.call(source, "rulingPartyIds") ||
        Object.prototype.hasOwnProperty.call(source, "rulingParties") ||
        Object.prototype.hasOwnProperty.call(source, "rulingParty");
    const hasExplicitCoalitionRefs =
        Object.prototype.hasOwnProperty.call(source, "coalitionPartyIds") ||
        Object.prototype.hasOwnProperty.call(source, "coalition");

    const rulingTokens = [
        ...(Array.isArray(source.rulingPartyIds) ? source.rulingPartyIds : []),
        ...(Array.isArray(source.rulingParties) ? source.rulingParties : []),
        ...(clean(source.rulingParty) ? [source.rulingParty] : []),
    ];
    const coalitionTokens = [
        ...(Array.isArray(source.coalitionPartyIds) ? source.coalitionPartyIds : []),
        ...(Array.isArray(source.coalition) ? source.coalition : []),
    ];

    const ruling = normalizePartyReferenceList(rulingTokens, parties, {
        deriveFromFlags: hasExplicitRulingRefs ? null : "ruling",
    });
    const coalition = normalizePartyReferenceList(coalitionTokens, parties, {
        deriveFromFlags: hasExplicitCoalitionRefs ? null : "coalition",
    });

    out.rulingPartyIds = ruling.ids;
    out.coalitionPartyIds = coalition.ids;
    out.rulingParties = partyDisplayNamesFromRefs(ruling.ids, ruling.unresolvedNames, parties);
    out.coalition = partyDisplayNamesFromRefs(coalition.ids, coalition.unresolvedNames, parties);
    delete out.rulingParty;

    return out;
};

export const normalizePoliticalActorRecord = (value, fallbackPolityKey = "") => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const out = cloneActorValue(value);
    const polityKey = clean(value.polityKey || fallbackPolityKey);
    if (polityKey) out.polityKey = polityKey;

    const parties = [];
    const seenIds = new Set();
    for (const [index, rawParty] of (Array.isArray(value.parties) ? value.parties : []).entries()) {
        const party = normalizePoliticalParty(rawParty, { index });
        if (!party) continue;
        let id = party.id;
        if (seenIds.has(id)) {
            id = `${id}-${stableTextHash(`${party.name}:${index}`)}`;
            party.id = id;
        }
        seenIds.add(id);
        parties.push(party);
    }

    const governmentSource = value.government && typeof value.government === "object" && !Array.isArray(value.government)
        ? value.government
        : {};
    // A few very early experiments put ideology at actor root. Fold it into the
    // government layer without treating national interests as government ideology.
    const government = normalizePoliticalGovernment(
        governmentSource.ideology || !clean(value.ideology)
            ? governmentSource
            : { ...governmentSource, ideology: value.ideology },
        parties,
    );

    const rulingIds = new Set(government.rulingPartyIds || []);
    const coalitionIds = new Set(government.coalitionPartyIds || []);
    for (const party of parties) {
        if (rulingIds.has(party.id)) party.ruling = true;
        else delete party.ruling;
        if (coalitionIds.has(party.id)) party.coalition = true;
        else delete party.coalition;
    }

    out.government = government;
    out.parties = parties;

    const leader = normalizeOfficeholder(value.leader || government.headOfState);
    if (leader) out.leader = leader;
    else delete out.leader;

    for (const key of ["goals", "fears", "ambitions", "domesticPressures", "tags"]) {
        const list = cleanStringArray(value[key], key === "tags" ? 24 : 32);
        if (list.length) out[key] = list;
        else delete out[key];
    }

    for (const key of ["traits", "perceptions", "behavioralDisposition"]) {
        const record = normalizeMetricRecord(value[key], {
            clampNumeric: key !== "perceptions",
        });
        if (Object.keys(record).length) out[key] = record;
        else delete out[key];
    }

    const name = clean(value.name);
    if (name) out.name = name;
    else delete out.name;

    // Top-level ideology is an old compatibility input, never a second owner.
    delete out.ideology;

    return out;
};

export function normalizePoliticalActors(input) {
    const source = input && typeof input === "object" ? input : {};
    const byPolity = {};
    if (source.byPolity && typeof source.byPolity === "object" && !Array.isArray(source.byPolity)) {
        for (const [rawKey, rawActor] of Object.entries(source.byPolity)) {
            const key = clean(rawKey);
            if (!key || !rawActor || typeof rawActor !== "object" || Array.isArray(rawActor)) continue;
            const actor = normalizePoliticalActorRecord(rawActor, key);
            if (actor) byPolity[key] = actor;
        }
    }
    return {
        schemaVersion: POLITICAL_ACTORS_SCHEMA_VERSION,
        byPolity,
    };
}

function candidatesForPolity(world, key) {
    if (!key) return [];
    const out = [key];
    const override = world?.polityOverrides?.[key];
    if (override?.name) out.push(override.name);
    for (const [candidateKey, candidate] of Object.entries(world?.polityOverrides || {})) {
        if (candidateKey === key || candidate?.name === key || candidate?.aliases?.includes?.(key)) {
            out.push(candidateKey, candidate?.name, ...(candidate?.aliases || []));
        }
    }
    return [...new Set(out.filter(Boolean))];
}

export function getPoliticalProfile(world, polityKey) {
    const byPolity = world?.politicalActors?.byPolity;
    if (!byPolity) return null;

    const normalizeActorKey = (value) =>
        String(value ?? "")
            .trim()
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\p{L}\p{N}]+/gu, "");

    for (const candidate of candidatesForPolity(world, polityKey)) {
        if (byPolity[candidate]) return byPolity[candidate];
    }

    const normalizedTargetKeys = new Set(
        candidatesForPolity(world, polityKey).map(normalizeActorKey).filter(Boolean),
    );

    for (const [actorKey, actor] of Object.entries(byPolity)) {
        if (normalizedTargetKeys.has(normalizeActorKey(actorKey))) return actor;
        if (actor?.polityKey && normalizedTargetKeys.has(normalizeActorKey(actor.polityKey))) return actor;
        if (actor?.name && normalizedTargetKeys.has(normalizeActorKey(actor.name))) return actor;
    }

    const candidates = new Set(candidatesForPolity(world, polityKey));
    for (const actor of Object.values(byPolity)) {
        if (!actor || typeof actor !== "object") continue;
        if (actor.polityKey && candidates.has(actor.polityKey)) return actor;
    }

    for (const [actorKey, actor] of Object.entries(byPolity)) {
        if (candidates.has(actorKey)) return actor;
    }

    const stockCode = resolveStockCountryCode(polityKey);
    if (stockCode) {
        for (const [actorKey, actor] of Object.entries(byPolity)) {
            const actorTokens = [actorKey, actor?.polityKey, actor?.name].filter(Boolean);
            if (actorTokens.some((token) => resolveStockCountryCode(token) === stockCode)) return actor;
        }
    }

    return null;
}

export const getPoliticalProfileKey = (world, polityKey) => {
    const byPolity = world?.politicalActors?.byPolity;
    if (!byPolity) return "";
    const actor = getPoliticalProfile(world, polityKey);
    if (!actor) return "";
    for (const [key, candidate] of Object.entries(byPolity)) {
        if (candidate === actor) return key;
    }
    return clean(actor.polityKey || polityKey);
};

export const ensurePoliticalProfile = (world, polityKey) => {
    if (!world || typeof world !== "object") return null;
    const key = clean(polityKey);
    if (!key) return null;
    const normalized = normalizePoliticalActors(world.politicalActors);
    world.politicalActors = normalized;
    const existing = getPoliticalProfile(world, key);
    if (existing) return existing;
    normalized.byPolity[key] = normalizePoliticalActorRecord({ polityKey: key, government: {}, parties: [] }, key);
    return normalized.byPolity[key];
};

// Compatibility bridge while event impacts still express leadership/government
// changes through polityChanges.stats. Stats generation itself must never rewrite
// Political Actors; only an explicit polity metadata change reaches this seam.
export function applyPoliticalActorMetadataPatch(world, polityKey, patch) {
    if (!world || !patch || typeof patch !== "object" || Array.isArray(patch)) return null;
    const actor = getPoliticalProfile(world, polityKey);
    if (!actor || typeof actor !== "object") return null;

    const leader = clean(patch.leader);
    const government = clean(patch.government);

    if (leader) {
        actor.leader = leader;
        actor.government = normalizePoliticalGovernment({
            ...(actor.government && typeof actor.government === "object" ? actor.government : {}),
            headOfState: leader,
        }, actor.parties || []);
    }

    if (government) {
        actor.government = normalizePoliticalGovernment({
            ...(actor.government && typeof actor.government === "object" ? actor.government : {}),
            form: government,
        }, actor.parties || []);
    }

    return actor;
}
