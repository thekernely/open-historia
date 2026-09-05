/*! Open Historia — Political World generation contract (Phase006A) */

import {
  normalizePoliticalActorRecord,
  POLITICAL_REPRESENTATIONS,
} from "./politicalActors.js";

export const POLITICAL_WORLD_GENERATION_SCHEMA_VERSION = 1;

export const POLITICAL_GENERATION_DEPTHS = Object.freeze({
  MINIMAL: "minimal",
  STANDARD: "standard",
  RICH: "rich",
  FULL: "full",
});

export const POLITICAL_GENERATION_SOURCES = Object.freeze({
  GENERATED: "generated",
  CURATED: "curated",
  AUTHORED: "authored",
  CAMPAIGN_CREATED: "campaign-created",
});

export const POLITICAL_GENERATION_SOURCE_AUTHORITY = Object.freeze({
  [POLITICAL_GENERATION_SOURCES.GENERATED]: 0,
  [POLITICAL_GENERATION_SOURCES.CURATED]: 1,
  [POLITICAL_GENERATION_SOURCES.AUTHORED]: 2,
  [POLITICAL_GENERATION_SOURCES.CAMPAIGN_CREATED]: 3,
});

export const comparePoliticalGenerationAuthority = (left, right) => {
  const leftRank = POLITICAL_GENERATION_SOURCE_AUTHORITY[clean(left).toLocaleLowerCase()] ?? -1;
  const rightRank = POLITICAL_GENERATION_SOURCE_AUTHORITY[clean(right).toLocaleLowerCase()] ?? -1;
  return leftRank === rightRank ? 0 : (leftRank > rightRank ? 1 : -1);
};

export const POLITICAL_GENERATION_CONFIDENCE = Object.freeze({
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
  UNKNOWN: "unknown",
});

export const POLITICAL_GENERATION_NEEDS = Object.freeze({
  POLITICAL_SYSTEM: "political_system",
  GOVERNING_STRUCTURE: "governing_structure",
  REPRESENTATION_ENTITIES: "representation_entities",
  LEADERSHIP_TRAITS: "structured_leadership_traits",
  RESPONSE_PROFILES: "entity_response_profiles",
  STRATEGIC_CONTEXT: "strategic_context",
  PERCEPTIONS: "structured_perceptions",
  DOMESTIC_CONTEXT: "domestic_context",
});

const DEPTH_ORDER = Object.freeze({
  [POLITICAL_GENERATION_DEPTHS.FULL]: 0,
  [POLITICAL_GENERATION_DEPTHS.RICH]: 1,
  [POLITICAL_GENERATION_DEPTHS.STANDARD]: 2,
  [POLITICAL_GENERATION_DEPTHS.MINIMAL]: 3,
});

const DEPTH_SET = new Set(Object.values(POLITICAL_GENERATION_DEPTHS));
const REPRESENTATION_SET = new Set(Object.values(POLITICAL_REPRESENTATIONS));
const CONFIDENCE_SET = new Set(Object.values(POLITICAL_GENERATION_CONFIDENCE));

const GENERATED_ACTOR_FIELDS = new Set([
  "polityKey",
  "name",
  "government",
  "leader",
  "parties",
  "powerBlocs",
  "politicalSystem",
  "goals",
  "fears",
  "ambitions",
  "domesticPressures",
  "tags",
  "traits",
  "perceptions",
]);

const GENERATED_PARTY_FIELDS = new Set([
  "id",
  "name",
  "shortName",
  "aliases",
  "support",
  "ideology",
  "leader",
  "goals",
  "publicPriorities",
  "publicForeignPolicy",
  "publicDescription",
  "color",
  "politicalResponse",
]);

const GENERATED_BLOC_FIELDS = new Set([
  "id",
  "name",
  "shortName",
  "aliases",
  "influence",
  "politicalResponse",
  "kind",
  "ideology",
  "status",
  "publicDescription",
  "color",
  "leader",
  "goals",
  "publicPriorities",
  "publicForeignPolicy",
]);

const GENERATED_GOVERNMENT_FIELDS = new Set([
  "form",
  "ideology",
  "status",
  "coalitionName",
  "headOfState",
  "headOfGovernment",
  "approval",
  "stability",
  "rulingPartyIds",
  "coalitionPartyIds",
]);

const GENERATED_POLITICAL_SYSTEM_FIELDS = new Set(["type", "representation", "label", "notes"]);
const FORBIDDEN_GENERATED_FIELDS = new Set(["behavioralDisposition", "politicalPressures"]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clone = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const hasKeys = (value) => isPlainObject(value) && Object.keys(value).length > 0;
const hasText = (value) => Boolean(clean(value));

const parseScenarioDate = (value) => {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return null;
  return { year, month, day, text: match[0] };
};

const compareScenarioDates = (left, right) => {
  for (const key of ["year", "month", "day"]) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
};

export const classifyPoliticalGenerationDepth = (relevance = {}) => {
  if (
    relevance.isPlayer === true ||
    relevance.scenarioCentral === true ||
    relevance.globalPower === true ||
    relevance.activeBelligerent === true ||
    relevance.principalRival === true ||
    relevance.principalAlly === true
  ) {
    return POLITICAL_GENERATION_DEPTHS.FULL;
  }

  if (
    relevance.regionalPower === true ||
    relevance.neighborOfFull === true ||
    relevance.majorInstitutionMember === true ||
    relevance.activeCrisis === true
  ) {
    return POLITICAL_GENERATION_DEPTHS.RICH;
  }

  if (relevance.sovereign !== false) return POLITICAL_GENERATION_DEPTHS.STANDARD;
  return POLITICAL_GENERATION_DEPTHS.MINIMAL;
};

const normalizeDepth = (value) => {
  const depth = clean(value).toLocaleLowerCase();
  return DEPTH_SET.has(depth) ? depth : POLITICAL_GENERATION_DEPTHS.STANDARD;
};

const actorRepresentation = (actor) => {
  const explicit = clean(actor?.politicalSystem?.representation).toLocaleLowerCase();
  if (REPRESENTATION_SET.has(explicit)) return explicit;
  return normalizePoliticalActorRecord(actor ?? {}, actor?.polityKey ?? "")?.politicalSystem?.representation
    ?? POLITICAL_REPRESENTATIONS.NONE;
};

const hasGoverningStructure = (actor) => {
  const government = actor?.government;
  if (!isPlainObject(government)) return false;
  return [
    government.form,
    government.status,
    government.headOfState,
    government.headOfGovernment,
  ].some((value) => hasText(isPlainObject(value) ? value.name : value));
};

const hasRepresentationEntities = (actor, representation) => {
  if (representation === POLITICAL_REPRESENTATIONS.NONE) return true;
  if (representation === POLITICAL_REPRESENTATIONS.ELECTORAL) {
    return Array.isArray(actor?.parties) && actor.parties.length > 0;
  }
  return Array.isArray(actor?.powerBlocs) && actor.powerBlocs.length > 0;
};

const hasResponseProfiles = (actor, representation) => {
  const entities = representation === POLITICAL_REPRESENTATIONS.ELECTORAL
    ? actor?.parties
    : actor?.powerBlocs;
  if (!Array.isArray(entities) || !entities.length) return representation === POLITICAL_REPRESENTATIONS.NONE;
  return entities.some((entity) => hasKeys(entity?.politicalResponse));
};

const hasStrategicContext = (actor) => [actor?.goals, actor?.fears, actor?.ambitions]
  .some((value) => Array.isArray(value) && value.length > 0);

const hasDomesticContext = (actor) => (
  (Array.isArray(actor?.domesticPressures) && actor.domesticPressures.length > 0) ||
  Number.isFinite(Number(actor?.government?.approval)) ||
  Number.isFinite(Number(actor?.government?.stability))
);

export const assessPoliticalGenerationNeeds = (actorInput, depthInput = POLITICAL_GENERATION_DEPTHS.STANDARD) => {
  const actor = isPlainObject(actorInput) ? actorInput : {};
  const depth = normalizeDepth(depthInput);
  const representation = actorRepresentation(actor);
  const needs = [];

  const politicalSystem = actor?.politicalSystem;
  const type = clean(politicalSystem?.type).toLocaleLowerCase();
  const explicitRepresentation = clean(politicalSystem?.representation).toLocaleLowerCase();
  if (!type || type === "unspecified" || !REPRESENTATION_SET.has(explicitRepresentation)) {
    needs.push(POLITICAL_GENERATION_NEEDS.POLITICAL_SYSTEM);
  }
  if (!hasGoverningStructure(actor) && representation !== POLITICAL_REPRESENTATIONS.NONE) {
    needs.push(POLITICAL_GENERATION_NEEDS.GOVERNING_STRUCTURE);
  }

  if (depth === POLITICAL_GENERATION_DEPTHS.MINIMAL) return needs;

  if (!hasRepresentationEntities(actor, representation)) {
    needs.push(POLITICAL_GENERATION_NEEDS.REPRESENTATION_ENTITIES);
  }
  if (depth === POLITICAL_GENERATION_DEPTHS.STANDARD) return needs;

  if (!hasKeys(actor?.traits)) needs.push(POLITICAL_GENERATION_NEEDS.LEADERSHIP_TRAITS);
  if (!hasResponseProfiles(actor, representation)) needs.push(POLITICAL_GENERATION_NEEDS.RESPONSE_PROFILES);
  if (!hasStrategicContext(actor)) needs.push(POLITICAL_GENERATION_NEEDS.STRATEGIC_CONTEXT);
  if (depth === POLITICAL_GENERATION_DEPTHS.RICH) return needs;

  if (!hasKeys(actor?.perceptions)) needs.push(POLITICAL_GENERATION_NEEDS.PERCEPTIONS);
  if (!hasDomesticContext(actor)) needs.push(POLITICAL_GENERATION_NEEDS.DOMESTIC_CONTEXT);
  return needs;
};

const normalizePolityInput = (entry) => {
  if (typeof entry === "string") return { polityKey: clean(entry), sovereign: true };
  if (!isPlainObject(entry)) return null;
  const polityKey = clean(entry.polityKey ?? entry.key ?? entry.name ?? entry.id);
  if (!polityKey) return null;
  return { ...entry, polityKey };
};

export const buildPoliticalGenerationPlan = ({
  polities = [],
  politicalActors = null,
  relevanceByPolity = {},
  scenarioDate = "",
  maxBatchSize = 6,
} = {}) => {
  const parsedDate = parseScenarioDate(scenarioDate);
  if (!parsedDate) throw new Error("Political generation requires scenarioDate in YYYY-MM-DD form");

  const byPolity = politicalActors?.byPolity && isPlainObject(politicalActors.byPolity)
    ? politicalActors.byPolity
    : {};
  const unique = new Map();
  for (const rawEntry of polities) {
    const entry = normalizePolityInput(rawEntry);
    if (!entry || unique.has(entry.polityKey)) continue;
    unique.set(entry.polityKey, entry);
  }

  const items = [];
  for (const entry of unique.values()) {
    const relevance = {
      sovereign: entry.sovereign !== false,
      ...(isPlainObject(relevanceByPolity?.[entry.polityKey]) ? relevanceByPolity[entry.polityKey] : {}),
    };
    const depth = normalizeDepth(relevance.depth || classifyPoliticalGenerationDepth(relevance));
    const actor = byPolity[entry.polityKey] ?? null;
    const needs = assessPoliticalGenerationNeeds(actor, depth);
    if (!needs.length) continue;
    items.push({
      polityKey: entry.polityKey,
      depth,
      needs,
      hasExistingActor: Boolean(actor),
    });
  }

  items.sort((left, right) => (
    (DEPTH_ORDER[left.depth] - DEPTH_ORDER[right.depth]) || left.polityKey.localeCompare(right.polityKey)
  ));

  const batchSize = Math.max(1, Math.min(12, Math.trunc(Number(maxBatchSize)) || 6));
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return {
    schemaVersion: POLITICAL_WORLD_GENERATION_SCHEMA_VERSION,
    scenarioDate: parsedDate.text,
    items,
    batches,
  };
};

const validateKnownFields = (object, allowed, prefix, errors) => {
  if (!isPlainObject(object)) return;
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) errors.push(`${prefix}.${key} is not part of the Phase006A generation contract`);
  }
};

const validateGeneratedEntities = (entities, { kind, allowedFields, errors }) => {
  if (entities === undefined) return;
  if (!Array.isArray(entities)) {
    errors.push(`${kind} must be an array when generated`);
    return;
  }
  const seen = new Set();
  for (const [index, entity] of entities.entries()) {
    if (!isPlainObject(entity)) {
      errors.push(`${kind}[${index}] must be an object`);
      continue;
    }
    validateKnownFields(entity, allowedFields, `${kind}[${index}]`, errors);
    const id = clean(entity.id);
    const name = clean(entity.name);
    if (!id) errors.push(`${kind}[${index}] requires an explicit stable id`);
    if (!name) errors.push(`${kind}[${index}] requires a display name`);
    if (id) {
      if (seen.has(id)) errors.push(`${kind} contains duplicate id ${id}`);
      seen.add(id);
    }
  }
};

const validateReferenceList = (value, knownIds, path, errors) => {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array of stable party ids`);
    return;
  }
  for (const rawId of value) {
    const id = clean(rawId);
    if (!id || !knownIds.has(id)) errors.push(`${path} references unknown party id ${id || "<blank>"}`);
  }
};

const mergeEntityArray = (existing, generated, path, appliedPaths, { allowEntityExpansion }) => {
  if (!Array.isArray(existing)) {
    appliedPaths.push(path);
    return clone(generated);
  }
  const out = clone(existing);
  const byId = new Map(out.map((entry, index) => [clean(entry?.id), { entry, index }]).filter(([id]) => id));
  for (const generatedEntity of generated) {
    const id = clean(generatedEntity?.id);
    const match = id ? byId.get(id) : null;
    if (match) {
      out[match.index] = mergeMissingValue(match.entry, generatedEntity, `${path}[${id}]`, appliedPaths, { allowEntityExpansion });
      continue;
    }
    if (allowEntityExpansion) {
      out.push(clone(generatedEntity));
      appliedPaths.push(`${path}[${id || out.length - 1}]`);
    }
  }
  return out;
};

const mergeMissingValue = (existing, generated, path, appliedPaths, options) => {
  if (!isPlainObject(generated)) return existing;
  const out = isPlainObject(existing) ? clone(existing) : {};
  for (const [key, generatedValue] of Object.entries(generated)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (!hasOwn(out, key)) {
      out[key] = clone(generatedValue);
      appliedPaths.push(nextPath);
      continue;
    }
    if ((key === "parties" || key === "powerBlocs") && Array.isArray(generatedValue)) {
      out[key] = mergeEntityArray(out[key], generatedValue, nextPath, appliedPaths, options);
      continue;
    }
    if (isPlainObject(out[key]) && isPlainObject(generatedValue)) {
      out[key] = mergeMissingValue(out[key], generatedValue, nextPath, appliedPaths, options);
    }
  }
  return out;
};

export const mergeMissingPoliticalActor = (existingActor, generatedPatch, { allowEntityExpansion = false } = {}) => {
  const appliedPaths = [];
  const actor = mergeMissingValue(
    isPlainObject(existingActor) ? existingActor : {},
    isPlainObject(generatedPatch) ? generatedPatch : {},
    "",
    appliedPaths,
    { allowEntityExpansion: allowEntityExpansion === true },
  );
  return { actor, appliedPaths };
};

const proposalReferenceDates = (proposal) => {
  const dates = [];
  if (hasText(proposal?.sourceAsOf)) dates.push(clean(proposal.sourceAsOf));
  if (Array.isArray(proposal?.referenceDates)) {
    for (const value of proposal.referenceDates.slice(0, 32)) if (hasText(value)) dates.push(clean(value));
  }
  return dates;
};

export const validatePoliticalGenerationProposal = (proposal, {
  polityKey,
  scenarioDate,
  depth = POLITICAL_GENERATION_DEPTHS.STANDARD,
  existingActor = null,
  allowEntityExpansion = false,
} = {}) => {
  const errors = [];
  const warnings = [];
  const expectedPolityKey = clean(polityKey);
  const expectedDate = parseScenarioDate(scenarioDate);
  const expectedDepth = normalizeDepth(depth);

  if (!expectedPolityKey) errors.push("A canonical polityKey is required");
  if (!expectedDate) errors.push("A canonical scenarioDate in YYYY-MM-DD form is required");
  if (!isPlainObject(proposal)) {
    return { ok: false, errors: [...errors, "Political generation proposal must be an object"], warnings };
  }

  if (Number(proposal.schemaVersion) !== POLITICAL_WORLD_GENERATION_SCHEMA_VERSION) {
    errors.push(`proposal.schemaVersion must equal ${POLITICAL_WORLD_GENERATION_SCHEMA_VERSION}`);
  }
  if (clean(proposal.polityKey) !== expectedPolityKey) errors.push("proposal.polityKey must match the canonical requested polity");
  if (clean(proposal.scenarioDate) !== expectedDate?.text) errors.push("proposal.scenarioDate must exactly match the scenario start date");
  if (normalizeDepth(proposal.depth) !== expectedDepth || !DEPTH_SET.has(clean(proposal.depth).toLocaleLowerCase())) {
    errors.push("proposal.depth must exactly match the requested generation depth");
  }

  const source = clean(proposal?.provenance?.source).toLocaleLowerCase();
  if (source !== POLITICAL_GENERATION_SOURCES.GENERATED) {
    errors.push("AI political generation proposals must declare provenance.source=generated");
  }
  const confidenceRaw = clean(proposal?.provenance?.confidence).toLocaleLowerCase();
  const confidence = CONFIDENCE_SET.has(confidenceRaw) ? confidenceRaw : POLITICAL_GENERATION_CONFIDENCE.UNKNOWN;
  if (confidenceRaw && !CONFIDENCE_SET.has(confidenceRaw)) warnings.push("Unknown confidence label was normalized to unknown");

  if (expectedDate) {
    for (const rawDate of proposalReferenceDates(proposal)) {
      const parsed = parseScenarioDate(rawDate);
      if (!parsed) {
        errors.push(`reference date ${rawDate} is not a valid YYYY-MM-DD date`);
      } else if (compareScenarioDates(parsed, expectedDate) > 0) {
        errors.push(`reference date ${rawDate} crosses the scenario-date boundary ${expectedDate.text}`);
      }
    }
  }

  const patch = proposal.actorPatch;
  if (!isPlainObject(patch)) {
    errors.push("proposal.actorPatch must be an object");
    return { ok: false, errors, warnings };
  }

  for (const forbidden of FORBIDDEN_GENERATED_FIELDS) {
    if (hasOwn(patch, forbidden)) errors.push(`actorPatch.${forbidden} is runtime-derived state and may not be AI-authored`);
  }
  validateKnownFields(patch, GENERATED_ACTOR_FIELDS, "actorPatch", errors);
  if (hasOwn(patch, "polityKey") && clean(patch.polityKey) !== expectedPolityKey) {
    errors.push("actorPatch.polityKey must match the canonical requested polity");
  }
  validateKnownFields(patch.government, GENERATED_GOVERNMENT_FIELDS, "actorPatch.government", errors);
  validateKnownFields(patch.politicalSystem, GENERATED_POLITICAL_SYSTEM_FIELDS, "actorPatch.politicalSystem", errors);
  validateGeneratedEntities(patch.parties, { kind: "actorPatch.parties", allowedFields: GENERATED_PARTY_FIELDS, errors });
  validateGeneratedEntities(patch.powerBlocs, { kind: "actorPatch.powerBlocs", allowedFields: GENERATED_BLOC_FIELDS, errors });

  const mergedPreview = mergeMissingPoliticalActor(existingActor, patch, { allowEntityExpansion });
  const normalizedActor = normalizePoliticalActorRecord(
    { ...mergedPreview.actor, polityKey: expectedPolityKey },
    expectedPolityKey,
  );
  const representation = normalizedActor?.politicalSystem?.representation ?? POLITICAL_REPRESENTATIONS.NONE;

  if (representation !== POLITICAL_REPRESENTATIONS.ELECTORAL && Array.isArray(patch.parties)) {
    for (const party of patch.parties) {
      if (party?.support !== undefined) {
        errors.push("Generated non-electoral political systems may not invent party polling/support percentages");
        break;
      }
    }
  }

  const knownPartyIds = new Set((normalizedActor?.parties ?? []).map((party) => clean(party.id)).filter(Boolean));
  validateReferenceList(patch?.government?.rulingPartyIds, knownPartyIds, "actorPatch.government.rulingPartyIds", errors);
  validateReferenceList(patch?.government?.coalitionPartyIds, knownPartyIds, "actorPatch.government.coalitionPartyIds", errors);

  if (errors.length) return { ok: false, errors, warnings };

  return {
    ok: true,
    errors: [],
    warnings,
    actor: normalizedActor,
    appliedPaths: mergedPreview.appliedPaths,
    provenance: {
      source: POLITICAL_GENERATION_SOURCES.GENERATED,
      scenarioDate: expectedDate.text,
      depth: expectedDepth,
      confidence,
      ...(hasText(proposal?.provenance?.generatedAt) ? { generatedAt: clean(proposal.provenance.generatedAt).slice(0, 40) } : {}),
      ...(hasText(proposal?.sourceAsOf) ? { sourceAsOf: clean(proposal.sourceAsOf) } : {}),
      appliedPaths: [...mergedPreview.appliedPaths],
    },
  };
};
