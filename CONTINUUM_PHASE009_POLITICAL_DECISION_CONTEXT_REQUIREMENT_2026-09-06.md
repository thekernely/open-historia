# Continuum Phase009 — Political Decision Context

**Date:** 2026-09-06
**Track:** Continuum only
**Phase:** 009A — shared read-only Political Decision Context
**Status:** implementation candidate; not yet wired into World Director or Diplomatic Chat

## 1. Purpose

Phase009A creates one canonical AI-facing seam between persistent Political Actor state and later behavioral consumers.

The project goal is not a permanent "country personality" and not a random aggression modifier. A polity decision should be explainable through the political organism that exists in the save: government, leadership, ideology, parties/factions, strategic goals, fears, ambitions, domestic pressure, perceptions, and the native current behavioral disposition.

The save remains authoritative. JavaScript owns state. The model receives only a bounded task-relevant projection.

## 2. Ownership

Phase009A does **not** create a new political ledger.

Canonical owners remain:

- `world.politicalActors` — political reality: government, leaders, parties/power blocs, ideology, traits, goals, fears, ambitions, pressures, perceptions and native behavioral disposition.
- `world.relations` — bilateral relationship state.
- `world.agreements` — formal agreements/commitments.
- `world.wars` — actual war/belligerency truth.
- Political Knowledge — visibility boundary for what one actor may know about another actor's politics.
- `world.countryStats` — material/economic state only; never political truth.

The builder is strictly read-only. Missing Political Actors are not created, repaired, inferred from Stats, or reconstructed from prose.

## 3. Public API

New module:

`src/Game/AI/politicalDecisionContext.js`

Exports:

- `POLITICAL_DECISION_CONTEXT_VERSION`
- `DEFAULT_POLITICAL_DECISION_MAX_ACTORS`
- `DEFAULT_POLITICAL_DECISION_MAX_CHARS`
- `DEFAULT_POLITICAL_DECISION_SET_PER_ACTOR_MAX_CHARS`
- `DEFAULT_POLITICAL_DECISION_SET_MAX_CHARS`
- `buildPoliticalDecisionContext(worldLike, actorPolity, options)`
- `buildBoundedPoliticalDecisionContextSet(worldLike, options)`

### Single-actor capsule

`buildPoliticalDecisionContext` returns a bounded actor-relative projection containing:

- political system;
- government form/status/ideology;
- formal head of state and head of government;
- distinct top-level/supreme political leader when applicable;
- leadership traits;
- goals;
- fears;
- ambitions;
- semantic domestic-pressure notes;
- native structured political-pressure issues;
- governing and opposition parties/power blocs;
- actor perceptions;
- native C4 `behavioralDisposition`;
- optional counterpart Political Knowledge view;
- objective bilateral relation;
- formal agreements;
- active/ceasefire wars.

The returned structured object is bounded as well as the model-facing text. It does not expose arbitrary unknown fields from canonical records.

### Multi-actor set

`buildBoundedPoliticalDecisionContextSet` provides a bounded wrapper for later consumers such as the World Director.

It:

- resolves Political Actor aliases to stable canonical actor identity;
- deduplicates aliases;
- skips missing actors instead of inventing them;
- caps actor count;
- caps per-actor text;
- caps total text;
- records omitted requested actors;
- repeats the actor-private knowledge boundary at the set level.

Default native bounds:

- max actors: `8`
- single actor text: `5600` characters
- multi-actor per-capsule text: `2600` characters
- multi-actor total text: `18000` characters

These are projection bounds, not canonical storage limits.

## 4. Reality versus perception

This distinction is mandatory.

### Actor perception

`world.politicalActors[actor].perceptions` is what the actor believes or estimates.

It may be wrong.

The model-facing context explicitly labels these facts as belief rather than objective truth.

### Objective state

Relations, agreements and wars are projected separately as objective canonical world state for continuity and later native feasibility checks.

Objective state does **not** imply that the actor knows it perfectly.

This enables believable:

- miscalculation;
- paranoia;
- overconfidence;
- bad intelligence;
- deterrence failure;
- wishful thinking;
- underestimation of opponents.

Phase009B must preserve this separation when validating World Director actions.

## 5. Political Knowledge boundary

An actor's own capsule may contain that actor's hidden political state because it is being used to model that actor's reasoning.

A counterpart's hidden canonical state must not leak into the actor capsule.

Counterpart politics therefore come only through `buildPoliticalKnowledgeView` at:

- `public`;
- `assessed`;
- `classified`.

A caller requesting `gm` at this seam is deliberately downgraded to `public`. GM-level canonical disclosure is a debug/editor concern, not legitimate actor knowledge.

Narrative assessed/classified intelligence may be supplied with confidence/staleness metadata, but raw counterpart hidden traits, fears, ambitions, perceptions and behavioral disposition remain absent.

## 6. Regime-agnostic behavior

The context must not assume electoral democracy.

It supports:

- electoral parties;
- party-state structures;
- court factions;
- elite factions;
- military factions;
- revolutionary factions;
- other canonical power-bloc representations.

Power blocs remain separate from parties. The builder does not invent fake polling/support numbers.

## 7. Formal officeholders versus political/supreme leader

`government.headOfState` and `government.headOfGovernment` remain formal offices.

A different top-level `leader` is projected separately as the political/supreme leader.

This is required for systems where formal state offices and de facto/supreme leadership differ.

## 8. Model-facing qualitative presentation

Canonical/native structured numeric values remain available in the returned JS object for diagnostics and future compatibility checks.

The text projection intentionally converts sensitive behavioral metrics into qualitative language such as:

- very low;
- low;
- moderate;
- high;
- very high.

This discourages the model from treating the political organism as a deterministic spreadsheet while preserving the native structured source for Phase009B checks.

## 9. Explicit non-goals for Phase009A

Phase009A does **not**:

- call an AI provider;
- mutate world state;
- run the World Director;
- run Diplomatic Chat;
- change events;
- change wars/relations/agreements;
- infer missing politics from Stats;
- add a second diplomatic personality system;
- implement institutions;
- implement National Conditions;
- change the Phase006 political-world generator or historical verifier.

National Conditions remain a future extension point. Do not create that schema inside Phase009A.

## 10. Acceptance tests

Phase009A tests must prove:

1. Actor-relative political context is bounded and contains the intended canonical political layers.
2. Perception is visibly separate from objective bilateral reality.
3. Counterpart hidden political state cannot leak through Political Knowledge, including a caller attempting GM level.
4. Assessed/classified narrative intelligence is supported without raw hidden-state disclosure.
5. The builder is read-only and never mints missing Political Actors.
6. Power-bloc regimes work without inventing electoral parties.
7. Formal officeholders remain distinct from a supreme/political leader.
8. Per-field and text bounds are enforced.
9. Multi-actor alias deduplication and actor bounds work.
10. No-counterpart capsules still expose bounded actor-linked objective diplomatic state.
11. War context distinguishes belligerents from co-belligerents for a focused counterpart.
12. Nested canonical metric records remain bounded and never stringify as `[object Object]`.
13. Multi-actor total text budget is enforced.
14. Architecture tests prohibit AI/provider calls, writes, random behavior and Stats ownership.
15. Architecture tests prove Phase009A is not prematurely wired into World Director or Diplomatic Chat.

## 11. Phase009B next

After this seam is accepted, inspect the current beta/Continuum implementations before editing:

- `src/Game/AI/nativeWorldDirector.js`
- `src/Game/AI/gameplaySchemas.js`
- `src/Game/AI/promptContext.js`
- World Director/world-liveness/turn-performance tests

Phase009B should make the World Director consume this shared Political Decision Context.

Required design direction:

- decisions should reflect the political organism rather than generic rational-state logic;
- actor perception should drive reasoning;
- objective world state should constrain feasibility;
- native compatibility checking should reject decisions grossly incompatible with the supplied political context;
- allow at most one focused correction retry;
- do not force aggression merely because a trait/disposition is high;
- do not resurrect the old donor `CRISIS_ESCALATION_STRESS_TEST = true` behavior into production.

## 12. Track separation

This implementation belongs to **Continuum**.

It is not an upstream OpenHistoria change unless separately reviewed, ported, tested, and accepted there. No source-state or commit assumption may be shared between the two tracks automatically.
