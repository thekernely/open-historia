/*! Open Historia — Continuum Phase009B political World Director bridge */

import {
  buildBoundedPoliticalDecisionContextSet,
  POLITICAL_DECISION_CONTEXT_VERSION,
} from "./politicalDecisionContext.js";
import {
  getPoliticalProfile,
  getPoliticalProfileKey,
} from "../../runtime/politicalActors.js";

export const POLITICAL_WORLD_DIRECTOR_VERSION = 1;
export const WORLD_DIRECTOR_POLITICAL_MAX_ACTORS = 8;
export const WORLD_DIRECTOR_POLITICAL_PER_ACTOR_MAX_CHARS = 1700;
export const WORLD_DIRECTOR_POLITICAL_MAX_CHARS = 12600;

const WORLD_DIRECTOR_POLITICAL_LIMITS = Object.freeze({
  traits: 5,
  goals: 4,
  fears: 4,
  ambitions: 4,
  domesticPressures: 4,
  pressureIssues: 4,
  governingEntities: 3,
  oppositionEntities: 3,
  perceptions: 3,
  relations: 4,
  agreements: 4,
  wars: 3,
});

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const array = (value) => Array.isArray(value) ? value : [];
const tokenKey = (value) => clean(value)
  .toLocaleLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, "");

const canonicalActorKey = (world, polity) => {
  const key = clean(getPoliticalProfileKey(world, polity));
  if (key) return key;
  return clean(polity);
};

const actorEquivalent = (world, left, right) => {
  const a = getPoliticalProfile(world, left);
  const b = getPoliticalProfile(world, right);
  if (a && b) return a === b;
  return tokenKey(left) === tokenKey(right);
};

const canonicalActorLabel = (world, polity) => {
  const actor = getPoliticalProfile(world, polity);
  if (!actor) return clean(polity);
  const key = canonicalActorKey(world, polity);
  const override = world?.polityOverrides?.[key];
  return clean(override?.name || actor?.name || actor?.polityKey || key || polity);
};

const aliasesForActor = (world, polity) => {
  const actor = getPoliticalProfile(world, polity);
  const key = canonicalActorKey(world, polity);
  const override = world?.polityOverrides?.[key];
  return [...new Set([
    clean(polity),
    key,
    clean(actor?.polityKey),
    clean(actor?.name),
    clean(override?.name),
    clean(override?.code),
    ...array(override?.aliases).map(clean),
  ].filter((value) => value.length >= 3))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 12);
};

const choosePoliticalActors = ({
  bundle,
  storylineAttention,
  explorationSlate,
  diplomaticAttention,
  economicAttention,
}) => {
  const world = bundle?.world || {};
  const playerPolity = clean(bundle?.game?.country);
  const selected = [];

  const push = (actor, reason, counterpart = "") => {
    const raw = clean(actor);
    if (!raw || selected.length >= WORLD_DIRECTOR_POLITICAL_MAX_ACTORS) return;
    if (!getPoliticalProfile(world, raw)) return;
    if (selected.some((entry) => actorEquivalent(world, entry.actor, raw))) return;
    selected.push({
      actor: canonicalActorKey(world, raw),
      reason: clean(reason) || "current world attention",
      counterpart: clean(counterpart),
    });
  };

  // The player polity is included because its domestic politics matter for
  // internal consequences and foreign reactions. Explicit human orders remain
  // authoritative and are never vetoed by this context.
  push(playerPolity, "player polity");

  for (const storyline of array(storylineAttention?.selected)) {
    const participants = array(storyline?.participants).map(clean).filter(Boolean);
    for (const participant of participants) {
      const counterpart = participants.find((other) =>
        other && !actorEquivalent(world, other, participant)
      ) || "";
      push(participant, `selected storyline: ${clean(storyline?.title || storyline?.id)}`, counterpart);
    }
  }

  for (const slot of array(explorationSlate)) {
    if (slot?.type !== "actor-domain") continue;
    push(slot.actor, `exploration: ${clean(slot?.domain) || "actor-domain"}`);
  }

  for (const actor of array(diplomaticAttention?.actors)) {
    const counterpart = playerPolity && !actorEquivalent(world, actor, playerPolity)
      ? playerPolity
      : "";
    push(actor, "bounded diplomatic attention", counterpart);
  }

  for (const row of array(economicAttention)) {
    push(row?.actor, "bounded economic attention");
  }

  return selected;
};

/**
 * Build the bounded actor-relative political layer injected into the existing
 * World Director prompt. This is native-only, read-only, and does not create an
 * additional AI call. The caller's normal jump request simply becomes richer.
 */
export const buildWorldDirectorPoliticalDecisionLayer = ({
  bundle,
  storylineAttention,
  explorationSlate,
  diplomaticAttention,
  economicAttention,
}) => {
  const world = bundle?.world || {};
  const selected = choosePoliticalActors({
    bundle,
    storylineAttention,
    explorationSlate,
    diplomaticAttention,
    economicAttention,
  });
  const counterpartByActor = Object.fromEntries(
    selected.filter((entry) => entry.counterpart).map((entry) => [entry.actor, entry.counterpart]),
  );
  const set = buildBoundedPoliticalDecisionContextSet(world, {
    actorPolities: selected.map((entry) => entry.actor),
    counterpartByActor,
    maxActors: WORLD_DIRECTOR_POLITICAL_MAX_ACTORS,
    perActorMaxChars: WORLD_DIRECTOR_POLITICAL_PER_ACTOR_MAX_CHARS,
    maxTotalChars: WORLD_DIRECTOR_POLITICAL_MAX_CHARS,
    limits: WORLD_DIRECTOR_POLITICAL_LIMITS,
  });
  const text = String(set?.text ?? "").trim();
  const contexts = array(set?.contexts);

  return {
    schemaVersion: POLITICAL_WORLD_DIRECTOR_VERSION,
    politicalDecisionContextVersion: POLITICAL_DECISION_CONTEXT_VERSION,
    text,
    charCount: text.length,
    selected,
    actors: contexts.map((context) => clean(context?.actorPolity)).filter(Boolean),
    omittedActorPolities: array(set?.omittedActorPolities).map(clean).filter(Boolean),
    compatibility: contexts.map((context) => ({
      actorPolity: clean(context?.actorPolity),
      behavioralDisposition: { ...(context?.political?.behavioralDisposition || {}) },
      pressureIssues: array(context?.political?.pressureIssues).map((issue) => ({
        issue: clean(issue?.issue),
        salience: Number(issue?.salience) || 0,
        strain: Number(issue?.strain) || 0,
      })),
      activeWarCount: array(context?.bilateral?.wars)
        .filter((war) => ["active", "ceasefire"].includes(clean(war?.status).toLowerCase()))
        .length,
    })),
  };
};

const POLITICAL_MAJOR_ESCALATION_RE = /\b(?:declares?\s+war|launch(?:es|ed)?\s+(?:an?\s+)?(?:attack|invasion|airstrike|missile\s+strike|offensive)|invades?|attacks?|orders?\s+(?:an?\s+)?(?:attack|invasion|airstrike|missile\s+strike)|issues?\s+(?:an?\s+)?ultimatum|imposes?\s+(?:a\s+)?blockade|begins?\s+(?:full\s+)?mobilization)\b/i;
const POLITICAL_TRIGGER_RE = /\b(?:in\s+response\s+to|respond(?:s|ed|ing)?\s+to|retaliat(?:e|es|ed|ion)|after\s+(?:an?|the)\s+(?:attack|invasion|incursion|strike|coup|ultimatum|blockade)|following\s+(?:an?|the)\s+(?:attack|invasion|incursion|strike|coup|ultimatum|blockade)|was\s+attacked|came\s+under\s+attack|treaty\s+obligation|mutual\s+defen[cs]e|collective\s+defen[cs]e)\b/i;

const actorSubjectEscalation = (world, actor, text) => {
  const haystack = clean(text);
  if (!haystack || !POLITICAL_MAJOR_ESCALATION_RE.test(haystack)) return false;
  return aliasesForActor(world, actor).some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)[\\s\\S]{0,120}${POLITICAL_MAJOR_ESCALATION_RE.source}`,
      "iu",
    ).test(haystack);
  });
};

/**
 * Conservative Phase009B compatibility gate. It intentionally catches only a
 * very narrow class of gross contradiction: a named non-player actor initiating
 * a major escalation while every native disposition signal is strongly
 * non-escalatory, no active conflict or strong security pressure explains it,
 * and the event supplies no concrete new trigger. High aggression never forces
 * aggression, and surprising but politically defensible decisions remain legal.
 */
export const validateWorldPoliticalDecisionCompatibility = (
  candidate,
  analysis,
  { world = {}, gameCountry = "" } = {},
) => {
  const events = array(candidate?.events);
  if (!events.length) return "";
  const playerPolity = clean(gameCountry);

  for (const row of array(analysis?.politicalDecisionCompatibility)) {
    const actor = clean(row?.actorPolity);
    if (!actor) continue;
    if (playerPolity && actorEquivalent(world, actor, playerPolity)) continue;

    const d = row?.behavioralDisposition || {};
    const assertiveness = Number(d.assertiveness);
    const riskTolerance = Number(d.riskTolerance);
    const escalationPressure = Number(d.escalationPressure);
    const compromisePressure = Number(d.compromisePressure);
    const threatPerception = Number(d.threatPerception);
    const opportunityPerception = Number(d.opportunityPerception);
    if (![assertiveness, riskTolerance, escalationPressure, compromisePressure, threatPerception, opportunityPerception].every(Number.isFinite)) continue;

    const strongSecurityPressure = array(row?.pressureIssues).some((issue) =>
      /security|war|territor|national|sovereign|military/i.test(clean(issue?.issue)) &&
      (Number(issue?.salience) >= 65 || Number(issue?.strain) >= 65)
    );
    const uniformlyNonEscalatory =
      assertiveness <= 20 &&
      riskTolerance <= 20 &&
      escalationPressure <= 20 &&
      compromisePressure >= 75 &&
      threatPerception <= 25 &&
      opportunityPerception <= 25;

    if (!uniformlyNonEscalatory || strongSecurityPressure || Number(row?.activeWarCount) > 0) continue;

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const text = `${clean(event?.title)} ${clean(event?.description)}`;
      if (!actorSubjectEscalation(world, actor, text)) continue;
      if (POLITICAL_TRIGGER_RE.test(text)) continue;
      return `$.events[${index}] depicts ${canonicalActorLabel(world, actor)} initiating a major escalation that grossly conflicts with its current Political Decision Context (very low assertiveness/risk/escalation, high compromise pressure, low perceived threat/opportunity) and gives no material new trigger. Either provide a concrete campaign-state trigger that explains the reversal or choose an action compatible with the actor's current politics.`;
    }
  }

  return "";
};
