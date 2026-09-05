/*! Open Historia — political knowledge / visibility projection */

import { getPoliticalProfile } from "./politicalActors.js";
import { politicalIntelligenceAccess } from "./spycraft.js";

// Canonical political reality and player knowledge are deliberately different
// things. The political-actor record is authoritative world truth; consumers get
// a projection appropriate to what they are allowed to know. The espionage system
// will choose the player-facing level and supply narrative assessments, while the
// GM/debug surface may request the complete canonical record.
export const POLITICAL_KNOWLEDGE_LEVELS = Object.freeze({
  PUBLIC: "public",
  ASSESSED: "assessed",
  CLASSIFIED: "classified",
  GM: "gm",
});

const KNOWLEDGE_LEVEL_SET = new Set(Object.values(POLITICAL_KNOWLEDGE_LEVELS));

const cloneValue = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const cleanStringArray = (value, limit = 24) => {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const text = clean(raw);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
};

const publicOfficeholder = (value) => {
  if (typeof value === "string") return clean(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const name = clean(value.name || value.id);
  if (!name) return "";
  return {
    ...(clean(value.id) ? { id: clean(value.id) } : {}),
    name,
    ...(clean(value.title || value.role) ? { title: clean(value.title || value.role) } : {}),
  };
};

const publicParty = (party) => {
  if (!party || typeof party !== "object" || Array.isArray(party)) return null;
  const name = clean(party.name);
  if (!name) return null;

  const support = Number(party?.support?.percent);
  const goals = cleanStringArray(party.goals, 12);
  const publicPriorities = cleanStringArray(party.publicPriorities, 12);
  const publicForeignPolicy = cleanStringArray(party.publicForeignPolicy, 12);
  const leader = publicOfficeholder(party.leader);

  return {
    ...(clean(party.id) ? { id: clean(party.id) } : {}),
    name,
    ...(clean(party.shortName || party.abbreviation) ? { shortName: clean(party.shortName || party.abbreviation) } : {}),
    ...(clean(party.ideology) ? { ideology: clean(party.ideology) } : {}),
    ...(Number.isFinite(support)
      ? { support: { percent: Math.max(0, Math.min(100, support)) } }
      : {}),
    ...(leader ? { leader } : {}),
    ...(goals.length ? { goals } : {}),
    ...(publicPriorities.length ? { publicPriorities } : {}),
    ...(publicForeignPolicy.length ? { publicForeignPolicy } : {}),
    ...(clean(party.publicDescription) ? { publicDescription: clean(party.publicDescription) } : {}),
    ...(clean(party.color) ? { color: clean(party.color) } : {}),
    ...(party.ruling === true ? { ruling: true } : {}),
    ...(party.coalition === true ? { coalition: true } : {}),
  };
};

const publicGovernment = (government) => {
  if (!government || typeof government !== "object" || Array.isArray(government)) return {};
  const rulingPartyIds = cleanStringArray(government.rulingPartyIds, 12);
  const coalitionPartyIds = cleanStringArray(government.coalitionPartyIds, 12);
  const rulingParties = cleanStringArray(government.rulingParties, 12);
  const coalition = cleanStringArray(government.coalition, 12);
  const headOfState = publicOfficeholder(government.headOfState || government.headOfStateId);
  const headOfGovernment = publicOfficeholder(government.headOfGovernment || government.headOfGovernmentId);

  return {
    ...(clean(government.form) ? { form: clean(government.form) } : {}),
    ...(clean(government.ideology) ? { ideology: clean(government.ideology) } : {}),
    ...(headOfState ? { headOfState } : {}),
    ...(headOfGovernment ? { headOfGovernment } : {}),
    ...(clean(government.coalitionName) ? { coalitionName: clean(government.coalitionName) } : {}),
    ...(rulingPartyIds.length ? { rulingPartyIds } : {}),
    ...(coalitionPartyIds.length ? { coalitionPartyIds } : {}),
    ...(rulingParties.length ? { rulingParties } : {}),
    ...(coalition.length ? { coalition } : {}),
  };
};

// Intelligence output is intentionally narrative and confidence-bearing. It is
// NOT a route for raw canonical trait weights / hidden disposition numbers to leak
// into the normal Country UI. The espionage layer may later derive these rows from
// collection quality, penetration, deception and analyst confidence.
export const normalizePoliticalIntelligenceAssessment = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const summary = clean(value.summary);
  const source = clean(value.source);
  const confidence = clean(value.confidence || value.confidenceLabel);
  const gatheredAt = clean(value.gatheredAt);
  const stale = value.stale === true;
  const findings = (Array.isArray(value.findings) ? value.findings : [])
    .map((finding) => {
      if (typeof finding === "string") {
        const text = clean(finding);
        return text ? { text } : null;
      }
      if (!finding || typeof finding !== "object" || Array.isArray(finding)) return null;
      const text = clean(finding.text || finding.assessment || finding.summary);
      if (!text) return null;
      return {
        ...(clean(finding.topic) ? { topic: clean(finding.topic) } : {}),
        text,
        ...(clean(finding.confidence || finding.confidenceLabel)
          ? { confidence: clean(finding.confidence || finding.confidenceLabel) }
          : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  if (!summary && !source && !confidence && !gatheredAt && !stale && findings.length === 0) return null;

  return {
    ...(summary ? { summary } : {}),
    ...(source ? { source } : {}),
    ...(confidence ? { confidence } : {}),
    ...(gatheredAt ? { gatheredAt } : {}),
    ...(stale ? { stale: true } : {}),
    ...(findings.length ? { findings } : {}),
  };
};

export const buildPublicPoliticalView = (world, polityKey) => {
  const actor = getPoliticalProfile(world, polityKey);
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) return null;

  const government = publicGovernment(actor.government);
  const parties = (Array.isArray(actor.parties) ? actor.parties : [])
    .map(publicParty)
    .filter(Boolean)
    .slice(0, 24);
  const goals = cleanStringArray(actor.goals, 16);
  const tags = cleanStringArray(actor.tags, 16);
  const polity = clean(actor.polityKey || polityKey);
  const name = clean(actor.name);
  const leader = publicOfficeholder(actor.leader);

  return {
    ...(polity ? { polityKey: polity } : {}),
    ...(name ? { name } : {}),
    ...(Object.keys(government).length ? { government } : {}),
    ...(leader ? { leader } : {}),
    ...(parties.length ? { parties } : {}),
    ...(goals.length ? { goals } : {}),
    ...(tags.length ? { tags } : {}),
  };
};

export const buildPoliticalKnowledgeView = (
  world,
  polityKey,
  {
    level = POLITICAL_KNOWLEDGE_LEVELS.PUBLIC,
    intelligenceAssessment = null,
  } = {},
) => {
  const normalizedLevel = KNOWLEDGE_LEVEL_SET.has(level)
    ? level
    : POLITICAL_KNOWLEDGE_LEVELS.PUBLIC;

  const actor = getPoliticalProfile(world, polityKey);
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) return null;

  // GM/debug is the only projection that exposes canonical internals. Always clone
  // so a UI/editor inspection cannot mutate live world state by accident.
  if (normalizedLevel === POLITICAL_KNOWLEDGE_LEVELS.GM) {
    return {
      level: POLITICAL_KNOWLEDGE_LEVELS.GM,
      canonical: cloneValue(actor),
    };
  }

  const publicView = buildPublicPoliticalView(world, polityKey);
  if (!publicView) return null;

  const assessment = normalizedLevel === POLITICAL_KNOWLEDGE_LEVELS.PUBLIC
    ? null
    : normalizePoliticalIntelligenceAssessment(intelligenceAssessment);

  return {
    level: normalizedLevel,
    public: publicView,
    ...(assessment ? { intelligence: assessment } : {}),
  };
};


const knowledgeKey = (value) => clean(value).toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");

const interceptForActor = (world, polityKey, intercepts) => {
  const actor = getPoliticalProfile(world, polityKey);
  if (!actor) return null;
  const targetKey = knowledgeKey(actor.polityKey || actor.name || polityKey);
  for (const [target, entry] of Object.entries(intercepts && typeof intercepts === "object" ? intercepts : {})) {
    const targetActor = getPoliticalProfile(world, target);
    if (targetActor === actor) return { target, entry };
    const candidateKey = knowledgeKey(targetActor?.polityKey || targetActor?.name || target);
    if (candidateKey && targetKey && candidateKey === targetKey) return { target, entry };
  }
  return null;
};

const downgradeConfidence = (value) => {
  const label = clean(value).toLocaleLowerCase();
  if (label === "high") return "Moderate";
  return "Low";
};

// Player-facing convenience seam: joins canonical Political Actors to the existing
// espionage report without copying either ledger. Callers pass DECRYPTED intercepts
// (gameplay.readOpenedIntercepts does that); a report from a turned source remains
// believable because this projection never receives or exposes the hidden turned flag.
export const buildPlayerPoliticalKnowledgeView = (
  world,
  polityKey,
  { viewerPolity = "", intercepts = {} } = {},
) => {
  const publicOnly = () => buildPoliticalKnowledgeView(world, polityKey, {
    level: POLITICAL_KNOWLEDGE_LEVELS.PUBLIC,
  });

  const report = interceptForActor(world, polityKey, intercepts);
  const assessment = normalizePoliticalIntelligenceAssessment(report?.entry?.politicalAssessment);
  if (!assessment) return publicOnly();

  const accessTarget = report?.target || polityKey;
  const access = politicalIntelligenceAccess(world, accessTarget, { viewerPolity });
  const reportSpyId = clean(report?.entry?.spyId);
  const sameLiveSource = access.hasLiveSource && reportSpyId && access.spyId === reportSpyId;

  if (!sameLiveSource) {
    return buildPoliticalKnowledgeView(world, polityKey, {
      level: POLITICAL_KNOWLEDGE_LEVELS.ASSESSED,
      intelligenceAssessment: {
        ...assessment,
        confidence: downgradeConfidence(assessment.confidence),
        source: "Last known HUMINT reporting — source no longer active",
        gatheredAt: assessment.gatheredAt || clean(report?.entry?.gatheredAt),
        stale: true,
      },
    });
  }

  const sourceConcern = access.sourceIntegrity === "suspected";
  return buildPoliticalKnowledgeView(world, polityKey, {
    level: sourceConcern ? POLITICAL_KNOWLEDGE_LEVELS.ASSESSED : access.level,
    intelligenceAssessment: {
      ...assessment,
      confidence: sourceConcern ? "Low" : (assessment.confidence || access.confidence),
      source: sourceConcern ? "HUMINT reporting — source integrity concerns" : "HUMINT reporting",
      gatheredAt: assessment.gatheredAt || clean(report?.entry?.gatheredAt),
    },
  });
};
