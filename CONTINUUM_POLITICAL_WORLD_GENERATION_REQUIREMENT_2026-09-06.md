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
