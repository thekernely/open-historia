# Continuum Phase006D — Quantitative Political Landscape

Date: 2026-09-06
Track: **Continuum only**
Status: implementation complete / acceptance contract

## Purpose

Every active polity needs a numeric Round-Zero political landscape so political support or influence has a canonical starting point from which campaign dynamics can move. A roster of parties/factions without relative strength is not sufficient simulation state and makes the Country panel appear uninitialized.

Phase006D adds this baseline without reopening the exact-date historical verifier and without adding a second normal AI generation phase.

## Core invariant

At scenario start, every represented Political Actor must have a usable quantitative landscape:

- `electoral` -> party **support** percentages;
- `party_state` -> **influence/control** percentages on power blocs when present, otherwise on represented parties;
- `court_factions`, `elite_factions`, `military_factions`, `revolutionary_factions`, `colonial` -> power-bloc **influence** percentages;
- explicit `none` remains a valid representation with no invented roster, but if canonical power blocs already exist they receive quantitative influence and are presented as a power structure.

A generated percentage is an **approximate Round-Zero baseline**, not a claim of exact polling measurement.

## Authority and provenance

Quantitative values follow existing Political World authority:

1. campaign-created/campaign-derived state;
2. authored/scenario values;
3. generated Round-Zero estimates;
4. deterministic native fallback estimates when a model estimate is missing or unusable.

Authored/campaign percentages must never be overwritten by generation.

Canonical basis labels:

- `generated-estimate` — AI-proposed Round-Zero approximate baseline;
- `native-fallback-estimate` — deterministic native repair/fill for a missing generated estimate;
- `campaign-derived` — value changed by canonical campaign simulation/mutation after Round Zero.

The UI marks the first two as **Approximate**. Once canonical campaign dynamics change a value, the state becomes campaign-derived and the Round-Zero Approximate label no longer applies.

## Performance contract

Phase006D must not turn political generation into a second long-running generation/verifier pipeline.

### Fresh scenario generation

- **Zero additional AI calls in the normal case.**
- `supportEstimate` / `influenceEstimate` ride inside the Political World proposal call already required for that polity.
- Estimates are bounded integers; no explanatory polling essay is requested.
- Missing, partial, or over-capacity estimates are repaired by native code and do **not** consume a retry by themselves.
- Historical verification does not verify support/influence percentages.

### Existing applied scenarios / support-only backfill

A previously complete Political Actor can request only `quantitative_landscape`.

- Existing identity/government/roster is read-only context.
- The provider returns only stable entity ids plus estimates.
- Quantitative-only work uses a dedicated lightweight fast path with a target batch size of **48 polities per AI request** (bounded to 40-60 by design intent), rather than the normal <=12-polity political-generation batches.
- If an **existing** actor already has canonical political system, governing structure, and representation roster but Balanced/Simulation-ready depth also reveals missing enrichment fields (traits, response profiles, strategic context, perceptions, domestic context), the quantitative baseline is prioritized first through this fast path and those enrichment needs are deferred to a later generation run. Missing foundational identity/roster state still blocks the fast path and uses normal generation.
- The fast-path prompt includes only scenario date, compact scenario canon, representation, compact government/ruling references, and the existing party/power-bloc roster required to estimate the baseline. It does not serialize the full Political Actor organism.
- Each polity returns its own shallow `landscapeJson` string so valid entries can be salvaged independently.
- A malformed, duplicate, or omitted individual polity is completed with native fallback and **does not retry the whole batch**.
- Only a completely unusable provider transport may retry, at most once under the normal two-attempt ceiling; after that native fallback completes the batch rather than switching back to political-identity generation.
- A quantitative-only proposal must not enter exact-date historical verification because it contains no date-sensitive identity correction.
- For a ~202-polity support-only world, the normal target is roughly **5 model calls**, not ~17 standard generation calls.

## Provider contract

When `quantitative_landscape` is requested:

- electoral party -> `supportEstimate: <integer 0..100>`;
- party-state party used as the power representation -> `influenceEstimate: <integer 0..100>`;
- power bloc -> `influenceEstimate: <integer 0..100>`.

Named values may sum below 100 so the unrepresented remainder can appear as **Other**. False decimal precision is discouraged. Native code owns normalization and completion.

A quantitative-only provider response must remain tiny and may not rewrite officeholders, government ideology, political-system identity, party names, or other already-canonical fields.

## Native completion rules

Native code owns the final usable baseline:

- preserve every pre-existing authored/campaign percentage;
- clamp incoming generated estimates to 0..100;
- if generated estimates oversubscribe the remaining capacity after fixed values, scale only generated estimates;
- if represented entities are missing estimates, assign bounded deterministic fallback shares;
- never retry the model solely because estimates do not total 100;
- leave any unallocated remainder for `Other` rather than inventing another political entity;
- never transform non-electoral influence into voter support.

## Campaign evolution

The Round-Zero baseline is not static presentation data. It is canonical Political Actor state consumed by the political response/background system.

- electoral changes commit through `set-party-support`;
- party-state party influence changes commit through `set-party-influence` when the party roster is the power representation;
- factional/power-bloc changes commit through `set-power-bloc-influence`;
- each numeric campaign mutation changes basis to `campaign-derived`.

This ensures the numbers have somewhere to move without treating future real-world polling as authoritative after scenario start.

## Country panel semantics

The Country panel always distinguishes missing data from zero:

- absent numeric state must never display `0%`;
- generated/native Round-Zero estimates display percentages and an **Approximate** label;
- electoral landscapes call the metric support;
- non-electoral landscapes call the metric influence;
- party-state systems may render party influence if no separate power-bloc roster exists;
- explicit `none` with canonical power blocs may still render those blocs as a power structure;
- `Other` represents residual/unlisted share and keeps the donut visually complete.

## Historical verifier boundary

Phase006D does **not** reopen Phase006C historical verification.

The verifier may still correct date-sensitive identity (officeholders, party existence, roster, system/representation). It must not adjudicate whether an approximate baseline should be 31% versus 34%. If identity correction changes a roster during a generation run, native quantitative completion fills the corrected roster afterward without a separate percentage-verification pass.

## Acceptance criteria

Phase006D is acceptable when:

1. Germany/USA/India-style generated actors no longer render `0%` merely because support was absent.
2. Generated electoral actors receive approximate numeric support and a visible donut.
3. Generated non-electoral actors receive influence rather than fake voter support.
4. China-style party-state actors can display party influence when no power blocs exist.
5. Existing authored Russia/Ukraine/Poland percentages are preserved.
6. A campaign political tick can mutate the new baseline through canonical Political Actor operations and marks it `campaign-derived`.
7. Missing/bad estimates do not trigger extra AI retries.
8. A quantitative-only backfill performs no historical-verifier calls.
9. A ~202-polity existing-world backfill completes in about five lightweight calls at the 48-polity batch target even when the selected mode would otherwise promote those actors to RICH and expose optional enrichment needs.
10. One malformed/omitted polity in a fast-path batch is salvaged natively without causing a full-batch retry.
11. Fresh generation adds no separate AI phase/call count solely for percentages.
12. All relevant native/generator/presentation regressions pass.
