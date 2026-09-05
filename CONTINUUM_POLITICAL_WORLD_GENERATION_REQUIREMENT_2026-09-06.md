# Continuum Political World Generation Requirement

Status: HARD REQUIREMENT for Phase006 and later Political Actors integration.
Track: Continuum. Do not assume this exists upstream until explicitly ported and tested.

## Core rule

Every canonical polity must be able to possess a political identity. Relevance determines the DEPTH of that identity, not whether the polity is considered politically real.

The political system must therefore work for authored historical scenarios, future scenarios, alternate histories, fictional/custom worlds, and imported maps. It must never assume that competitive modern electoral politics is the default form of political life.

## Scenario-agnostic generation

Generate Political World must first ask what political system exists in the scenario and polity at the scenario start date. Only then may it decide whether the polity needs parties, court factions, elite blocs, a one-party structure, military factions, revolutionary movements, colonial administration, or another supported representation.

Examples that must be valid inputs include 1066, 1815, 1867, 1911, 1936, 2014, 2067, and fully fictional dates/worlds.

A historical monarchy must not receive fake modern polling. A one-party state must not be represented as 99% ruling party / 1% opposition merely to satisfy a chart. A future or fictional polity must not be corrected back toward present-day real-world institutions.

## Authority hierarchy

Political generation fills missing state only. Authority is:

1. authored Political Actor data;
2. scenario canonical metadata and explicit backstory;
3. historical/start-date context that does not cross the scenario date boundary;
4. generated missing political state.

Generation must never silently overwrite stronger-authority state.

Once a campaign starts, campaign canon outranks later real-world history. The model must never resurrect future real leaders, parties, coalitions, election outcomes, alliances, institutions, or borders merely because they occurred in reality.

## Persistent world, bounded attention

Every polity may receive a minimal canonical identity, while generation depth is relevance-tiered and may be enriched later without replacing stable identity.

Conceptual tiers:

- FULL: player, major/global powers, scenario-central polities, active belligerents, principal rivals/allies.
- RICH: regional powers, important neighbors, major institution members, active crisis participants.
- STANDARD: ordinary sovereign polities with enough political state to simulate normally.
- MINIMAL: currently peripheral polities with political system, government/leadership where applicable, representation mode, and enough identity to be enriched later.

Tiers are dynamic attention levels, not permanent castes. A previously peripheral polity that becomes strategically important must be enriched in place while retaining its stable polity/party/bloc identity and campaign history.

## Generation lifecycle

Generation is scenario creation/upgrade infrastructure, not the political simulator itself:

scenario/authored state
-> find missing political state
-> bounded AI proposal in relevance-ranked batches
-> native schema/identity/date validation
-> review/apply where appropriate
-> persist as scenario canon
-> normal native political simulation takes over

Do not re-run AI political generation every turn.

## Provenance

Generated political data must be distinguishable from authored/curated/campaign-created state. Phase006 should support provenance concepts such as authored, curated, generated, and campaign-created, with uncertainty/confidence metadata only where useful.

Prefer omission or qualitative state over invented precision.

## Integration requirement

Political World generation must eventually provide the identities and hidden response/disposition inputs consumed by the native political engine. The World Director should later receive only a bounded task-relevant political projection, never the entire political database.

This requirement exists to support the project north star:

Anything could happen - but it should make sense that it happened.

## Derived disposition ownership

Phase006 may generate missing structured political inputs such as leader traits, perceptions, party/power-bloc response profiles, government structure, and strategic state when allowed by the authority hierarchy.

It must not treat current `behavioralDisposition` as AI-authored political truth when the native disposition engine can derive it. Behavioral disposition is runtime/campaign-derived state produced from structured canonical inputs and current pressure. Generation supplies the organism; native simulation calculates its current decision-facing condition.

## Phase006A executable contract

Phase006A materializes this requirement in `src/runtime/politicalWorldGeneration.js`.

The native contract owns:
- deterministic relevance depth classification;
- completeness/needs assessment;
- bounded relevance-ranked generation batches;
- exact polity/date/depth proposal envelopes;
- strict stable IDs for generated parties and power blocs;
- regime-aware rejection of fake non-electoral party polling;
- rejection of AI-authored `behavioralDisposition` and `politicalPressures`;
- scenario-date boundary checks for supplied historical/reference dates;
- missing-only merges that preserve authored values;
- explicit reviewed opt-in before a generated proposal may expand an already-authored party/power-bloc roster;
- applied-path provenance returned for later persistence/review.

Phase006A does NOT call an AI, mutate the world, run the political clock, or generate events. Phase006B may build AI requests on top of this contract; Phase006C may expose review/apply UX. Those later phases must not bypass the native validator/application seam.

## Phase006B bounded AI generation seam

Phase006B materializes the AI proposal stage in `src/Game/AI/politicalWorldGeneratorCore.js` and `src/Game/AI/politicalWorldGenerator.js`.

The AI does not own the canonical proposal envelope. Native code supplies the exact requested polity key, scenario date, generation depth, `generated` provenance source, and generation timestamp. The model supplies only a bounded missing-state `actorPatch`, confidence, and optional historical reference dates. Every returned patch is then passed through the Phase006A validator before it can reach later review/apply UX.

Phase006B requirements:
- use the Phase006A relevance-ranked bounded batches (maximum 12 polities per request);
- send only bounded scenario context, polity-specific context, requested needs, and existing non-derived political state;
- never send `behavioralDisposition` or `politicalPressures` back to the generator as fields it should author;
- accept no unrequested polity and no generated top-level field outside the requested need set;
- retry invalid or omitted polities at most once, without regenerating already-valid proposals;
- preserve valid partial batch results when another polity fails validation;
- never mutate world/scenario state in the generation layer; Phase006C owns review/apply and persistence;
- expose a dedicated `politicalWorldGeneration` AI task key so users may select an appropriate model independently from normal turns.
- after the AI chooses a previously-unknown representation, re-run native completeness against the resulting actor so `representation=none`, electoral parties, court factions, etc. are judged by the regime that was actually proposed rather than by the pre-generation placeholder;
- RICH/FULL completeness requires reusable hidden response profiles for every represented party/power bloc, including deliberately-unpolled coalition members, without inventing polling for them;
- government ideology remains part of strategic political completeness even when government form/leadership was already authored.

Phase006B is still scenario creation/upgrade infrastructure, not a runtime political tick and not a World Director behavior source.
