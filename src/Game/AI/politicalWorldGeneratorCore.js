/*! Open Historia — Political World generation AI orchestration (Phase006B core) */

import {
  POLITICAL_GENERATION_CONFIDENCE,
  POLITICAL_GENERATION_NEEDS,
  POLITICAL_WORLD_GENERATION_SCHEMA_VERSION,
  assessPoliticalGenerationNeeds,
  buildPoliticalGenerationPlan,
  validatePoliticalGenerationProposal,
} from "../../runtime/politicalWorldGeneration.js";

export const POLITICAL_WORLD_GENERATOR_RESULT_VERSION = 1;
export const POLITICAL_WORLD_GENERATOR_MAX_ATTEMPTS = 2;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clone = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const truncate = (value, maxChars) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 80))}\n...[bounded context truncated]`;
};

const stripDerivedPoliticalState = (actor) => {
  if (!isPlainObject(actor)) return null;
  const out = clone(actor);
  delete out.behavioralDisposition;
  delete out.politicalPressures;
  return out;
};

const TOP_LEVEL_FIELDS_BY_NEED = Object.freeze({
  [POLITICAL_GENERATION_NEEDS.POLITICAL_SYSTEM]: new Set(["politicalSystem"]),
  [POLITICAL_GENERATION_NEEDS.GOVERNING_STRUCTURE]: new Set(["government", "leader"]),
  [POLITICAL_GENERATION_NEEDS.REPRESENTATION_ENTITIES]: new Set(["parties", "powerBlocs", "government"]),
  [POLITICAL_GENERATION_NEEDS.LEADERSHIP_TRAITS]: new Set(["traits"]),
  [POLITICAL_GENERATION_NEEDS.RESPONSE_PROFILES]: new Set(["parties", "powerBlocs"]),
  [POLITICAL_GENERATION_NEEDS.STRATEGIC_CONTEXT]: new Set(["goals", "fears", "ambitions", "government"]),
  [POLITICAL_GENERATION_NEEDS.PERCEPTIONS]: new Set(["perceptions"]),
  [POLITICAL_GENERATION_NEEDS.DOMESTIC_CONTEXT]: new Set(["domesticPressures", "government"]),
});

const allowedTopLevelFields = (needs) => {
  const out = new Set();
  for (const need of Array.isArray(needs) ? needs : []) {
    for (const field of TOP_LEVEL_FIELDS_BY_NEED[need] ?? []) out.add(field);
  }
  return out;
};

const allowedGovernmentFields = (needs) => {
  const set = new Set();
  if (needs.includes(POLITICAL_GENERATION_NEEDS.GOVERNING_STRUCTURE)) {
    for (const key of ["form", "status", "headOfState", "headOfGovernment"]) set.add(key);
  }
  if (needs.includes(POLITICAL_GENERATION_NEEDS.STRATEGIC_CONTEXT)) set.add("ideology");
  if (needs.includes(POLITICAL_GENERATION_NEEDS.REPRESENTATION_ENTITIES)) {
    for (const key of ["rulingPartyIds", "coalitionPartyIds", "coalitionName"]) set.add(key);
  }
  if (needs.includes(POLITICAL_GENERATION_NEEDS.DOMESTIC_CONTEXT)) {
    for (const key of ["approval", "stability"]) set.add(key);
  }
  return set;
};

const representationEntityFieldScope = (needs) => {
  const fields = new Set(["id", "name"]);
  if (needs.includes(POLITICAL_GENERATION_NEEDS.REPRESENTATION_ENTITIES)) {
    for (const key of [
      "shortName", "aliases", "support", "ideology", "leader", "goals",
      "publicPriorities", "publicForeignPolicy", "publicDescription", "color",
      "influence", "kind", "status",
    ]) fields.add(key);
  }
  if (needs.includes(POLITICAL_GENERATION_NEEDS.RESPONSE_PROFILES)) fields.add("politicalResponse");
  return fields;
};

const scopeErrors = (actorPatch, needsInput) => {
  if (!isPlainObject(actorPatch)) return ["actorPatch must be an object"];
  const needs = Array.isArray(needsInput) ? needsInput : [];
  const allowed = allowedTopLevelFields(needs);
  const errors = [];
  for (const key of Object.keys(actorPatch)) {
    if (!allowed.has(key)) errors.push(`actorPatch.${key} was not requested for this generation depth/need set`);
  }

  if (isPlainObject(actorPatch.government)) {
    const governmentAllowed = allowedGovernmentFields(needs);
    for (const key of Object.keys(actorPatch.government)) {
      if (!governmentAllowed.has(key)) errors.push(`actorPatch.government.${key} was not requested by the current political needs`);
    }
  }

  const entityAllowed = representationEntityFieldScope(needs);
  for (const [collection, entities] of [["parties", actorPatch.parties], ["powerBlocs", actorPatch.powerBlocs]]) {
    if (!Array.isArray(entities)) continue;
    for (const [index, entity] of entities.entries()) {
      if (!isPlainObject(entity)) continue;
      for (const key of Object.keys(entity)) {
        if (!entityAllowed.has(key)) errors.push(`actorPatch.${collection}[${index}].${key} was not requested by the current political needs`);
      }
    }
  }
  return errors;
};

const normalizeConfidence = (value) => {
  const confidence = clean(value).toLocaleLowerCase();
  return Object.values(POLITICAL_GENERATION_CONFIDENCE).includes(confidence)
    ? confidence
    : POLITICAL_GENERATION_CONFIDENCE.UNKNOWN;
};

const parseResponseObject = (response) => {
  if (isPlainObject(response?.toolInput)) return response.toolInput;
  if (isPlainObject(response) && Array.isArray(response.proposals)) return response;
  const raw = typeof response === "string" ? response : String(response?.rawText ?? "");
  if (!raw) return null;
  const unfenced = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const first = unfenced.indexOf("{");
    const last = unfenced.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(unfenced.slice(first, last + 1));
    } catch {
      return null;
    }
  }
};

const generatedAtValue = (generatedAt) => {
  const value = typeof generatedAt === "function" ? generatedAt() : generatedAt;
  const text = clean(value);
  return text || new Date().toISOString();
};

const compactExistingActor = (actor) => {
  const stripped = stripDerivedPoliticalState(actor);
  if (!stripped) return null;
  return stripped;
};

const itemBlock = (item, { politicalActors, contextByPolity, previousErrors }) => {
  const existing = compactExistingActor(politicalActors?.byPolity?.[item.polityKey]);
  const localContext = contextByPolity?.[item.polityKey];
  const errors = previousErrors?.[item.polityKey] ?? [];
  return [
    `POLITY: ${item.polityKey}`,
    `DEPTH: ${item.depth}`,
    `GENERATE ONLY THESE MISSING NEEDS: ${item.needs.join(", ")}`,
    `EXISTING CANONICAL POLITICAL STATE (preserve it; do not repeat fields unless needed to complete a requested nested structure):`,
    existing ? truncate(existing, 4500) : "(none)",
    `POLITY-SPECIFIC SCENARIO CONTEXT:`,
    localContext ? truncate(localContext, 3000) : "(none supplied)",
    ...(errors.length ? [
      `PREVIOUS ATTEMPT VALIDATION ERRORS — correct these exactly:`,
      errors.slice(0, 12).map((error) => `- ${error}`).join("\n"),
    ] : []),
  ].join("\n");
};

export const POLITICAL_WORLD_GENERATION_TOOL = Object.freeze({
  name: "submit_political_world_generation",
  description: "Submit bounded missing Political Actor patches for only the requested canonical polities. Native code supplies identity/date/depth/provenance and validates every patch before review.",
  schema: Object.freeze({
    type: "object",
    properties: {
      proposals: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            polityKey: { type: "string", description: "Exact requested canonical polity name/key." },
            confidence: { type: "string", enum: ["low", "moderate", "high", "unknown"] },
            sourceAsOf: { type: "string", description: "Optional YYYY-MM-DD historical source/as-of date; never later than scenario start." },
            referenceDates: {
              type: "array",
              maxItems: 16,
              items: { type: "string" },
              description: "Optional historical dates actually relied upon; never later than scenario start.",
            },
            actorPatch: {
              type: "object",
              description: "Only missing Political Actor fields requested for this polity. Never behavioralDisposition or politicalPressures.",
              additionalProperties: true,
            },
          },
          required: ["polityKey", "actorPatch"],
          additionalProperties: false,
        },
      },
    },
    required: ["proposals"],
    additionalProperties: false,
  }),
});

export const buildPoliticalWorldGenerationPrompt = ({
  scenarioDate,
  items,
  politicalActors,
  scenarioContext = "",
  contextByPolity = {},
  previousErrors = {},
} = {}) => {
  const systemPrompt = `You generate MISSING starting political state for an alternate-history strategy scenario.\n\n`
    + `HARD AUTHORITY RULES:\n`
    + `- Scenario date is ${scenarioDate}. Never use historical facts, officeholders, parties, outcomes, institutions, or developments from AFTER that date.\n`
    + `- For future, alternate, or fictional scenarios, authored scenario canon is the world. Never snap it back toward real history.\n`
    + `- Existing canonical political state is stronger authority than you. Fill gaps only.\n`
    + `- Return only requested missing needs. Prefer omission or qualitative influence to fake precision.\n`
    + `- Determine the political system before choosing its representation. Competitive elections are NOT the default.\n`
    + `- Non-electoral systems use power blocs/court/elite/military/revolutionary/colonial structures as appropriate; never invent King's Party 99% polling.\n`
    + `- Parties and power blocs require stable lowercase slug-like ids that survive renames. Government party references use those exact ids.\n`
    + `- For meaningful competitive electoral systems, include coarse start-date support for major parties when reasonably inferable from scenario/start-date context; whole or broadly rounded percentages are better than fake decimals, and unlisted Other may remain. Do not invent polling for non-electoral systems or for minor coalition entities merely because they govern.\n`
    + `- behavioralDisposition and politicalPressures are native runtime-derived state and MUST NEVER appear in actorPatch.\n`
    + `- Structured leader traits should use bounded 0-100 values when justified. Useful native keys include riskTolerance, recklessness, caution, opportunism, militarism, conciliatory, pragmatism, paranoia, vindictiveness, consensusDriven. Do not force every key.\n`
    + `- Hidden politicalResponse profiles may use organization/credibility/inertia/resilience 0-100 and sparse issues. Issue position/strainResponse are -100..100; sensitivity is 0-100. Only encode issues that materially distinguish the entity.\n`
    + `- Structured perceptions should describe beliefs, not truth. Useful bounded keys include threat, opportunity, weakness, cohesionEstimate.\n`
    + `- Never create extra polities. Never generate events. Never simulate future campaign outcomes.\n\n`
    + `OUTPUT: use the supplied tool. One proposal per requested polity. polityKey must match exactly.`;

  const userMessage = [
    `SCENARIO DATE: ${scenarioDate}`,
    "",
    "GLOBAL SCENARIO CANON / BACKSTORY (authoritative when supplied):",
    scenarioContext ? truncate(scenarioContext, 9000) : "(none supplied)",
    "",
    "REQUESTED POLITIES:",
    ...(Array.isArray(items) ? items : []).map((item, index) => `\n=== ${index + 1} ===\n${itemBlock(item, { politicalActors, contextByPolity, previousErrors })}`),
  ].join("\n");

  return { systemPrompt, userMessage };
};

const wrapRawProposal = (rawProposal, item, { scenarioDate, generatedAt }) => ({
  schemaVersion: POLITICAL_WORLD_GENERATION_SCHEMA_VERSION,
  polityKey: item.polityKey,
  scenarioDate,
  depth: item.depth,
  provenance: {
    source: "generated",
    confidence: normalizeConfidence(rawProposal?.confidence),
    generatedAt,
  },
  ...(clean(rawProposal?.sourceAsOf) ? { sourceAsOf: clean(rawProposal.sourceAsOf) } : {}),
  ...(Array.isArray(rawProposal?.referenceDates) ? { referenceDates: rawProposal.referenceDates.slice(0, 32) } : {}),
  actorPatch: isPlainObject(rawProposal?.actorPatch) ? clone(rawProposal.actorPatch) : rawProposal?.actorPatch,
});

const validateBatchResponse = (payload, items, context) => {
  const rawProposals = Array.isArray(payload?.proposals) ? payload.proposals : [];
  const requestedByKey = new Map(items.map((item) => [item.polityKey, item]));
  const seen = new Set();
  const valid = [];
  const errorsByPolity = {};
  const warnings = [];
  const counts = new Map();
  for (const raw of rawProposals) {
    const polityKey = clean(raw?.polityKey);
    if (requestedByKey.has(polityKey)) counts.set(polityKey, (counts.get(polityKey) ?? 0) + 1);
  }

  for (const raw of rawProposals) {
    const polityKey = clean(raw?.polityKey);
    if (!requestedByKey.has(polityKey)) {
      warnings.push(`Ignored unrequested generated polity ${polityKey || "<blank>"}`);
      continue;
    }
    if ((counts.get(polityKey) ?? 0) > 1) {
      seen.add(polityKey);
      errorsByPolity[polityKey] = ["AI returned duplicate proposals for this polity"];
      continue;
    }
    seen.add(polityKey);
    const item = requestedByKey.get(polityKey);
    const scope = scopeErrors(raw?.actorPatch, item.needs);
    const envelope = wrapRawProposal(raw, item, context);
    const validation = validatePoliticalGenerationProposal(envelope, {
      polityKey: item.polityKey,
      scenarioDate: context.scenarioDate,
      depth: item.depth,
      existingActor: context.politicalActors?.byPolity?.[item.polityKey] ?? null,
      allowEntityExpansion: false,
    });
    const errors = [...scope, ...(validation.errors ?? [])];
    if (!errors.length) {
      const remainingNeeds = assessPoliticalGenerationNeeds(validation.actor, item.depth);
      for (const need of item.needs) {
        if (remainingNeeds.includes(need)) errors.push(`proposal did not satisfy requested need ${need}`);
      }
    }
    if (errors.length) {
      errorsByPolity[polityKey] = errors;
      continue;
    }
    valid.push({ item, proposal: envelope, validation });
  }

  for (const item of items) {
    if (!seen.has(item.polityKey)) {
      errorsByPolity[item.polityKey] = ["AI omitted this requested polity from the batch response"];
    }
  }

  return { valid, errorsByPolity, warnings };
};

export const generatePoliticalWorldProposalsCore = async ({
  scenarioDate,
  polities = [],
  politicalActors = null,
  relevanceByPolity = {},
  scenarioContext = "",
  contextByPolity = {},
  maxBatchSize = 6,
  maxAttempts = 2,
  callModel,
  generatedAt = () => new Date().toISOString(),
  signal,
  onBatch,
} = {}) => {
  if (typeof callModel !== "function") throw new Error("Phase006B requires a callModel function");
  const plan = buildPoliticalGenerationPlan({
    polities,
    politicalActors,
    relevanceByPolity,
    scenarioDate,
    maxBatchSize,
  });
  const runTimestamp = generatedAtValue(generatedAt);
  const attemptsLimit = Math.max(1, Math.min(POLITICAL_WORLD_GENERATOR_MAX_ATTEMPTS, Math.trunc(Number(maxAttempts)) || 1));
  const accepted = [];
  const failures = [];
  const warnings = [];
  const batchResults = [];

  for (const [batchIndex, initialItems] of plan.batches.entries()) {
    let unresolved = [...initialItems];
    let previousErrors = {};
    const acceptedKeys = new Set();
    let attempts = 0;

    while (unresolved.length && attempts < attemptsLimit) {
      if (signal?.aborted) throw signal.reason || new DOMException("Political world generation cancelled.", "AbortError");
      attempts += 1;
      const { systemPrompt, userMessage } = buildPoliticalWorldGenerationPrompt({
        scenarioDate: plan.scenarioDate,
        items: unresolved,
        politicalActors,
        scenarioContext,
        contextByPolity,
        previousErrors,
      });
      const response = await callModel(systemPrompt, [{ role: "user", parts: [{ text: userMessage }] }], {
        signal,
        reasoningEnabled: false,
        taskKey: "politicalWorldGeneration",
        logLabel: "political world generation",
        tool: POLITICAL_WORLD_GENERATION_TOOL,
      });
      const payload = parseResponseObject(response);
      if (!payload) {
        previousErrors = Object.fromEntries(unresolved.map((item) => [item.polityKey, ["AI response did not contain parseable structured output"]]));
        continue;
      }
      const checked = validateBatchResponse(payload, unresolved, {
        scenarioDate: plan.scenarioDate,
        politicalActors,
        generatedAt: runTimestamp,
      });
      warnings.push(...checked.warnings);
      for (const entry of checked.valid) {
        if (acceptedKeys.has(entry.item.polityKey)) continue;
        acceptedKeys.add(entry.item.polityKey);
        accepted.push(entry);
      }
      previousErrors = checked.errorsByPolity;
      unresolved = unresolved.filter((item) => !acceptedKeys.has(item.polityKey));
      if (typeof onBatch === "function") {
        onBatch({
          batchIndex,
          attempt: attempts,
          accepted: checked.valid.map((entry) => entry.item.polityKey),
          unresolved: unresolved.map((item) => item.polityKey),
        });
      }
    }

    for (const item of unresolved) {
      failures.push({
        polityKey: item.polityKey,
        depth: item.depth,
        needs: [...item.needs],
        errors: [...(previousErrors[item.polityKey] ?? ["Political generation did not produce a valid proposal"])],
      });
    }
    batchResults.push({
      batchIndex,
      requested: initialItems.map((item) => item.polityKey),
      attempts,
      accepted: initialItems.filter((item) => acceptedKeys.has(item.polityKey)).map((item) => item.polityKey),
      failed: unresolved.map((item) => item.polityKey),
    });
  }

  return {
    schemaVersion: POLITICAL_WORLD_GENERATOR_RESULT_VERSION,
    scenarioDate: plan.scenarioDate,
    generatedAt: runTimestamp,
    plan,
    proposals: accepted,
    failures,
    warnings,
    batches: batchResults,
    generatedPolities: accepted.length,
    failedPolities: failures.length,
  };
};
