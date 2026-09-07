# Continuum Phase006D.1 — Governing Alignment Repair

Date: 2026-09-07
Track: **Continuum only**
Status: implementation / acceptance contract

## Purpose

Phase006D made the political landscape quantitative, but live Country-panel smoke testing exposed a separate completeness gap: many otherwise-valid Political Actors have a government and an existing party roster but no canonical `government.rulingPartyIds` / `government.coalitionPartyIds`. The UI therefore cannot identify the governing party or coalition even though the polity's political identity is already present.

Phase006D.1 repairs only that alignment. It is **not** Political World regeneration and it does **not** reopen Phase006C historical verification.

## Canonical ownership

`world.politicalActors[polity].government.rulingPartyIds` and `coalitionPartyIds` remain the canonical governing-party references.

The repair pass may only connect the existing government to **stable party IDs already present in that same Political Actor roster**. It may not create, rename, remove, merge, or replace any representation entity.

## Surgical mutation contract

An accepted repair proposal may write only:

- `government.rulingPartyIds`
- `government.coalitionPartyIds`

It may not rewrite:

- political system / representation;
- government form or ideology;
- head of state / head of government / leader;
- party names, IDs, aliases, ideology, leaders, descriptions or priorities;
- support / influence percentages or their provenance;
- traits, goals, fears, ambitions, perceptions, pressures or response profiles;
- any relation, agreement, war, institution, Stats or map state.

The ordinary Phase006A missing-only contract remains closed. Normal generation/review **cannot** fill an explicitly normalized empty governing-party array. Only an explicit governing-alignment review receives the narrow `fillEmptyGovernmentPartyRefs` capability.

Non-empty canonical `rulingPartyIds` / `coalitionPartyIds` are immutable to this repair and may never be overwritten.

## Candidate rules

A model-backed repair candidate must:

1. already have a Political Actor;
2. use `electoral` or `party_state` representation;
3. already have a non-empty canonical party roster;
4. lack a valid existing ruling-party reference.

A single-party `party_state` can be resolved natively with zero model calls: its sole existing party becomes the ruling party.

If the incumbent government is genuinely independent, technocratic, military, personalist, or otherwise not formally led by any supplied party, the provider may return `nonPartisan: true`. The repair must not invent a governing party merely to make the UI badge non-empty.

## Exact-date and provider boundary

The provider receives:

- canonical scenario date;
- compact scenario canon/backstory when available;
- polity name;
- representation;
- compact existing government metadata (form, HoS, HoG, existing coalition name if any);
- the existing party roster with stable IDs and only compact public identifying context.

The provider returns only, per polity:

```json
{"rulingPartyIds":["cdu-csu"],"coalitionPartyIds":["spd"]}
```

or:

```json
{"nonPartisan":true}
```

No historical verifier, temporal sentinel, roster expansion, leader generation, or normal Political World proposal generation is invoked by this pass.

## Performance contract

- batch size: **48 polities**;
- maximum attempts: **2**;
- retry only unresolved/malformed polities, never already-valid rows;
- ~202 unresolved alignments must fit in at most **5 compact model calls** in the all-model worst case;
- valid rows from a partially malformed response are retained;
- single-party party-state repairs consume zero model calls;
- already-aligned actors consume zero model calls.

## Review / Apply contract

The repair uses the existing Political World review queue:

1. Repair Governing Alignment;
2. inspect proposed stable IDs;
3. explicit Apply Selected;
4. re-read latest scenario state immediately before apply;
5. validate against current roster and scenario date;
6. atomically persist only still-missing governing references;
7. Save remains scenario persistence through the existing library seam.

History-only recheck is hidden for a governing-alignment repair run because this pass has no verifier phase.

## Presentation sidecar correction

Phase006D also requires the public Political Knowledge projection to preserve safe quantitative landscape provenance (`basis`) and party-state `influence`. These are public presentation fields, not hidden political internals. Preserving them allows the Country panel to render **Approximate** for generated Round-Zero values and to display party-state influence correctly.

## Acceptance criteria

1. France/Germany/Latvia-style actors with an existing roster but missing governing refs receive valid existing stable IDs.
2. Germany can resolve CDU/CSU as ruling and SPD as coalition without changing either party record.
3. A genuinely non-partisan government is not forced into a bogus party badge.
4. A one-party party state resolves natively without an AI call.
5. Existing valid governing refs (for example a fully aligned USA record) are never overwritten.
6. Repair proposals apply only the two governing-reference paths.
7. Normal generation still cannot fill normalized empty governing refs unless the explicit repair flag is present.
8. The repair never invokes historical verification or roster expansion.
9. 202 missing alignments require no more than five compact model calls in the all-model case.
10. Public political projection preserves quantitative `basis` and party-state influence so Approximate/influence UI semantics survive the knowledge boundary.
11. Relevant Political Actor / Political World / Political Knowledge / Country-panel regressions pass.
