/*! Open Historia — political actor runtime domain */

import { resolveStockCountryCode } from "./polityIdentity.js";

export const POLITICAL_ACTORS_SCHEMA_VERSION = 1;

const cloneActorValue = (value) => {
    if (!value || typeof value !== "object") return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

export function normalizePoliticalActors(input) {
    const source = input && typeof input === "object" ? input : {};
    const byPolity = source.byPolity && typeof source.byPolity === "object" && !Array.isArray(source.byPolity)
        ? Object.fromEntries(
            Object.entries(source.byPolity)
                .filter(([key, actor]) => String(key || "").trim() && actor && typeof actor === "object" && !Array.isArray(actor))
                .map(([key, actor]) => [key, cloneActorValue(actor)]),
        )
        : {};
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
            .replace(/[^a-z0-9]+/g, "");

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

    // Migration compatibility: political actor records may have been authored
    // before stable display identities were finalized. Match their declared
    // polityKey against the resolved identity candidates.
    const candidates = new Set(candidatesForPolity(world, polityKey));
    for (const actor of Object.values(byPolity)) {
        if (!actor || typeof actor !== "object") continue;
        if (actor.polityKey && candidates.has(actor.polityKey)) return actor;
    }

    // Final compatibility pass: compare the actor record key itself against
    // known display names/aliases from polity overrides.
    for (const [actorKey, actor] of Object.entries(byPolity)) {
        if (candidates.has(actorKey)) return actor;
    }

    // Modern/formal-name bridge. Map clicks can legitimately arrive through the
    // stock geography name ("Russia", "Poland") while a modern scenario uses the
    // formal campaign identity ("Russian Federation", "Republic of Poland").
    // Use the central stock-country provenance resolver rather than teaching the
    // Political Actor domain its own country-name alias table. Historical/custom
    // identities that do not resolve to one stock geography are intentionally left
    // alone.
    const stockCode = resolveStockCountryCode(polityKey);
    if (stockCode) {
        for (const [actorKey, actor] of Object.entries(byPolity)) {
            const actorTokens = [actorKey, actor?.polityKey, actor?.name].filter(Boolean);
            if (actorTokens.some((token) => resolveStockCountryCode(token) === stockCode)) return actor;
        }
    }

    return null;
}

// Compatibility bridge while event impacts still express leadership/government
// changes through polityChanges.stats. Stats generation itself must never rewrite
// Political Actors; only an explicit polity metadata change reaches this seam.
export function applyPoliticalActorMetadataPatch(world, polityKey, patch) {
    if (!world || !patch || typeof patch !== "object" || Array.isArray(patch)) return null;
    const actor = getPoliticalProfile(world, polityKey);
    if (!actor || typeof actor !== "object") return null;

    const leader = String(patch.leader ?? "").trim();
    const government = String(patch.government ?? "").trim();

    if (leader) {
        actor.leader = leader;
        actor.government = {
            ...(actor.government && typeof actor.government === "object" ? actor.government : {}),
            headOfState: leader,
        };
    }

    if (government) {
        actor.government = {
            ...(actor.government && typeof actor.government === "object" ? actor.government : {}),
            form: government,
        };
    }

    return actor;
}
