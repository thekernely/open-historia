/*! Open Historia — country tags © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

import { institutionMembershipBadge, institutionsForPolity, institutionStrategicPriority } from "./institutions.js";
import { powerTierForPolity } from "./powerStatus.js";

// What a country IS, in short traits: "socialist", "authoritarian", "anti-nato".
// The map-maker sets the starting tags in the editor (tags.json on the scenario);
// the AI reads them as context for everything that country does and rewrites them
// as the world changes, which lands in world.countryTags.
//
// This module owns the two rules both halves must agree on — how a tag list is
// normalized, and which source wins — so the editor and the runtime cannot drift.
// It deliberately imports nothing: the editor, the game and the server all use it.

export const MAX_TAGS = 8;
export const MAX_TAG_LEN = 32;

// Suggestions only — the vocabulary is open. Alt-history is the product, so a
// closed list could never cover it; these exist so the common cases converge on
// one spelling instead of "anti-nato" / "anti nato" / "antiNATO" splitting the
// model's attention three ways.
export const TAG_SUGGESTIONS = [
  "socialist", "communist", "capitalist", "social-democratic", "liberal",
  "conservative", "fascist", "monarchist", "theocratic", "technocratic",
  "authoritarian", "totalitarian", "democratic", "one-party", "military-junta",
  "nato-aligned", "anti-nato", "warsaw-pact", "non-aligned", "neutral",
  "major-power", "regional-power", "minor-power", "great-power", "client-state", "puppet-state", "colonial",
  "nuclear", "isolationist", "expansionist", "revanchist", "pariah",
];

// Trim, collapse whitespace, cap length, drop blanks, dedupe case-insensitively,
// cap count. Non-strings are dropped rather than coerced: colors.json is
// code -> [r,g,b], and a number reaching a tag list means that palette has leaked
// in — which should vanish, not render as "102".
export const normalizeTagList = (list, { maxTags = MAX_TAGS, maxLen = MAX_TAG_LEN } = {}) => {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, maxLen);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= maxTags) break;
  }
  return out;
};

// The tags in force right now for one country: the AI's live list if it has ever
// set one, else the author's starting list. NOT a merge — a revolution that
// dropped "socialist" must not have it restored by the scenario file underneath.
// Keyed by the country's NAME, verbatim. The uppercasing this used to do worked
// only while owners were GADM codes, which are already uppercase — with names it
// looked up baseTags["RUSSIA"] for a tags.json keyed "Russia" and every author tag
// silently vanished.
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => clean(value).toLocaleLowerCase();

const actorForCountry = (world, country) => {
  const key = clean(country);
  if (!key) return null;
  if (world?.politicalActors?.byPolity?.[key]) return world.politicalActors.byPolity[key];
  const wanted = lower(key);
  for (const [polityKey, actor] of Object.entries(world?.politicalActors?.byPolity || {})) {
    const override = world?.polityOverrides?.[polityKey] || {};
    const aliases = [polityKey, override?.name, ...(Array.isArray(override?.aliases) ? override.aliases : [])].map(lower);
    if (aliases.includes(wanted)) return actor;
  }
  return null;
};

const politicalSystemBadges = (actor) => {
  const out = [];
  const type = lower(actor?.politicalSystem?.type);
  const representation = lower(actor?.politicalSystem?.representation);
  const form = lower(actor?.government?.form);
  const combined = `${type} ${form}`;

  if (/authoritarian|autocr|dictator|personalist|one[- ]party|party[- ]state|military regime|military junta|absolute monarch/.test(combined)) out.push("authoritarian");
  else if (/democrat|parliamentary|constitutional|republic|electoral/.test(combined) || representation === "electoral") out.push("democratic");

  if (representation === "party_state" || /one[- ]party|party[- ]state|vanguard/.test(combined)) out.push("party-state");
  else if (/military junta|military regime/.test(combined)) out.push("military-junta");
  else if (/absolute monarch|constitutional monarch|monarchy|kingdom/.test(combined)) out.push("monarchy");

  if (/semi[- ]presidential/.test(combined)) out.push("semi-presidential");
  else if (/parliamentary/.test(combined)) out.push("parliamentary");
  else if (/presidential/.test(combined)) out.push("presidential");

  return normalizeTagList(out, { maxTags: 3 });
};

const legacyTagsForCountry = (baseTags, world, key) => {
  const live = world?.countryTags?.[key];
  const overrideName = clean(world?.polityOverrides?.[key]?.name);
  if (Array.isArray(live)) return normalizeTagList(live);
  return normalizeTagList(baseTags?.[key] ?? (overrideName ? baseTags?.[overrideName] : undefined));
};

const canonicalInstitutionBadges = (world, key) => institutionsForPolity(world || {}, key, { includeSuspended: true })
  .map(({ institution, member }) => ({
    badge: institutionMembershipBadge(institution, member),
    priority: institutionStrategicPriority(institution),
  }))
  .filter((entry) => entry.badge)
  .sort((a, b) => b.priority - a.priority || a.badge.localeCompare(b.badge));

const buildInstitutionBadgeIndex = (world) => {
  const source = world?.institutions?.byId && typeof world.institutions.byId === "object"
    ? world.institutions.byId
    : (world?.institutions || {});
  const out = new Map();
  for (const [rawId, institution] of Object.entries(source)) {
    if (rawId === "schemaVersion" || rawId === "ledgerVersion") continue;
    if (!institution || typeof institution !== "object" || Array.isArray(institution)) continue;
    if (lower(institution.status || "active") === "dissolved") continue;
    for (const member of Array.isArray(institution.members) ? institution.members : []) {
      const polity = clean(member?.polity || member?.country || member?.member);
      if (!polity) continue;
      const badge = institutionMembershipBadge({ ...institution, id: institution.id || rawId }, member);
      if (!badge) continue;
      const key = lower(polity);
      const list = out.get(key) || [];
      list.push({ badge, priority: institutionStrategicPriority({ ...institution, id: institution.id || rawId }) });
      out.set(key, list);
    }
  }
  for (const [key, list] of out) {
    list.sort((a, b) => b.priority - a.priority || a.badge.localeCompare(b.badge));
    out.set(key, list);
  }
  return out;
};

const isPowerTag = (tag) => ["great-power", "major-power", "regional-power", "minor-power", "global-power", "middle-power"].includes(lower(tag));

// The header badges are now a projection of canonical state, not a parallel truth.
// Author/live tags still supply open-vocabulary descriptors (revisionist, nuclear,
// isolationist...), but structured power tier, regime and formal membership win.
const resolveCountryTagsInternal = (baseTags, world, country, membershipIndex = null) => {
  const key = clean(country);
  if (!key) return [];

  const actor = actorForCountry(world, key);
  const powerTier = powerTierForPolity(world || {}, key);
  const systemTags = politicalSystemBadges(actor);
  const indexedMemberships = membershipIndex?.get(lower(key));
  const memberships = indexedMemberships || canonicalInstitutionBadges(world || {}, key);
  const membershipBadges = memberships.map((entry) => entry.badge);
  const membershipRoots = new Set(membershipBadges.map((tag) => lower(tag).replace(/-(?:member|candidate|associate|observer|suspended)$/, "")));

  const legacy = legacyTagsForCountry(baseTags, world || {}, key).filter((tag) => {
    const normalized = lower(tag);
    if (isPowerTag(normalized)) return false;
    // Formal membership is stronger than fuzzy legacy alignment. Keep alignment
    // only when there is no canonical institution record for that same root.
    const aligned = normalized.match(/^(.+)-aligned$/);
    if (aligned && membershipRoots.has(aligned[1])) return false;
    // Structured political-system badges own these semantic slots.
    if (["authoritarian", "democratic", "one-party", "party-state", "military-junta", "parliamentary", "presidential", "semi-presidential", "monarchy"].includes(normalized) && systemTags.length) return false;
    return true;
  });

  const reserved = [powerTier, ...systemTags, ...membershipBadges];
  return normalizeTagList([...reserved, ...legacy]);
};

export const resolveCountryTags = (baseTags, world, country) =>
  resolveCountryTagsInternal(baseTags, world, country, null);

// Every polity known to any canonical identity source gets a badge projection, so
// newly generated worlds no longer look tagged only for the three original seed actors.
export const resolveAllCountryTags = (baseTags, world) => {
  const institutionMembers = Object.values(world?.institutions?.byId || {})
    .flatMap((institution) => Array.isArray(institution?.members) ? institution.members.map((member) => member?.polity) : [])
    .filter(Boolean);
  const out = {};
  const membershipIndex = buildInstitutionBadgeIndex(world || {});
  for (const country of new Set([
    ...Object.keys(baseTags || {}),
    ...Object.keys(world?.countryTags || {}),
    ...Object.keys(world?.polityOverrides || {}),
    ...Object.keys(world?.politicalActors?.byPolity || {}),
    ...Object.keys(world?.powerStatus?.byPolity || {}),
    ...institutionMembers,
  ])) {
    const tags = resolveCountryTagsInternal(baseTags, world, country, membershipIndex);
    if (tags.length) out[String(country)] = tags;
  }
  return out;
};
