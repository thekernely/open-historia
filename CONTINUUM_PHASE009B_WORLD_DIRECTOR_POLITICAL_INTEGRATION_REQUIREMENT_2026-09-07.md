# Continuum Phase009B — World Director Political Integration

**Date:** 2026-09-07  
**Track:** Continuum only  
**Phase:** 009B  
**Status:** implementation candidate

## 1. Purpose

Phase009B wires the accepted Phase009A Political Decision Context into the existing Native World Director without creating a second political AI pass.

The World Director must stop treating relevant polities as generic rational-state actors. When a polity is already inside the Director's bounded attention set, the same timeline-generation request may now receive a compact actor-relative political capsule containing the canonical political organism: government, leadership, governing/opposition entities, goals, fears, ambitions, political pressure, perceptions and native behavioral disposition.

Anything could happen, but it should make sense that it happened.

## 2. Performance contract

Political integration must not create another normal provider call.

Normal segment flow remains:

1. Native World Director computes the existing causal/exploration/diplomatic/economic attention state.
2. Native code selects only currently relevant Political Actors.
3. Phase009A builds bounded actor capsules in-process / in the existing World Director worker.
4. Those capsules are appended to `worldInitiative.text`.
5. The existing `jumpForward` / `autoJumpForward` AI request consumes that richer prompt.

There is no per-country political call and no all-world Political Actor dump.

World Director bounds for this consumer:

- maximum Political Actors: `8`
- maximum per actor: `1700` characters
- maximum Political Decision Context set: `12600` characters

The exact total cap includes the truncation marker; Phase009B fixes the Phase009A wrapper so the marker itself cannot push text beyond the advertised native bound.

A political compatibility failure uses the jump task's already-existing two-attempt envelope. It may cause the one normal correction retry that `runJsonTask` already supports, but it may never create a third attempt or an independent political retry task.

## 3. Actor selection

Political Actors are selected only from the current World Director attention graph, in priority order:

1. player polity (for domestic consequences and NPC reaction context; never as a veto on explicit player orders);
2. participants in scheduler-selected persistent storylines;
3. actor-domain World Exploration slots;
4. bounded Diplomatic Director attention actors;
5. bounded economic-attention actors.

Unknown/missing Political Actors are skipped rather than created.

Aliases resolve through the canonical Political Actor registry and duplicate actor identities do not consume multiple slots.

## 4. Political reasoning contract

The model-facing World Director context explicitly states:

- reason from each actor's own political organism;
- actor perceptions are beliefs and may be wrong;
- objective relations, agreements and wars are separately authoritative reality/feasibility state;
- do not transfer private fears, ambitions, traits, pressures or perceptions between actor capsules;
- high assertiveness/risk does not force aggression;
- low assertiveness/risk does not forbid action after a material new trigger;
- explicit human player orders remain authoritative over the player polity's inferred temperament.

Phase009A remains read-only. Phase009B does not mutate Political Actors.

## 5. Conservative native compatibility gate

The current jump schema does not carry a structured initiator/rationale object for every geopolitical decision, so Phase009B must not pretend native code can semantically police every event.

The compatibility gate is intentionally narrow.

It rejects only a gross contradiction when all of these are true:

- a non-player actor is explicitly written as the subject initiating a major escalation in a visible event;
- the actor has complete native C4 disposition signals;
- assertiveness, risk tolerance and escalation pressure are all very low;
- compromise pressure is very high;
- perceived threat and opportunity are both very low;
- no active/ceasefire conflict already explains the action;
- no strong current security/war/territorial pressure explains the action;
- the event provides no concrete new trigger such as attack, invasion, retaliation or treaty-defense response.

The validator then returns a focused correction reason through the existing `runJsonTask` validation path. The model may use its one ordinary retry to either supply a real campaign-state trigger or choose a politically compatible action.

The gate deliberately does **not** reject peaceful behavior from an assertive actor and does not reject surprising choices that have a plausible new cause.

## 6. Files

New:

- `src/Game/AI/politicalWorldDirector.js`
- `src/Game/AI/politicalWorldDirector.test.js`

Modified:

- `src/Game/AI/nativeWorldDirector.js`
- `src/Game/AI/gameplay.js`
- `src/Game/AI/politicalDecisionContext.js` (exact total-character-bound repair only)

No `gameplaySchemas.js` change is required for this first integration because no new provider output field is introduced.

No `promptContext.js` change is required because `worldInitiative.text` is already appended live inside `runJsonTask`, including for campaigns whose stored prompt pack predates Phase009B.

## 7. Non-goals

Phase009B does not:

- add Party Evolution;
- mutate party agendas/priorities;
- add a new event-consequence ontology;
- change the Political World generator or historical verifier;
- create new Political Actors;
- add another provider pass;
- force war/aggression based on C4;
- wire Diplomatic Chat (Phase009C).

## 8. Diagnostics

Native World Director analysis now records:

- `politicalDecisionActors`
- `politicalDecisionActorCount`
- `politicalDecisionOmittedActors`
- `politicalDecisionContextChars`
- `politicalDecisionCompatibility`

The normal World Director console summary also reports the number of political decision capsules built for the segment.

## 9. Acceptance criteria

1. Phase009A actor/context tests remain green.
2. Relevant World Director actors receive bounded political capsules.
3. Total Political Decision Context text never exceeds the consumer cap.
4. No AI/provider function exists in the political World Director bridge.
5. No writes or random behavior exist in the bridge.
6. Player-polity political temperament cannot veto explicit player action.
7. A gross untriggered escalation by an extremely non-escalatory actor is rejected with focused feedback.
8. The same sharp action is allowed when a concrete new trigger exists.
9. The existing jump task remains capped at two provider attempts total.
10. Upstream OpenHistoria remains untouched until an explicit port is reviewed and tested separately.
