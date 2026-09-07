# Continuum Round-Zero Pregame Event Contract Compatibility Fix

Date: 2026-09-07
Track: Continuum only

## Problem

After the Round-Zero trigger/retry and Gemini shallow-transport fixes, `pregameHistory` reached the provider and returned data, but the current released-beta timeline validator rejected legacy/loose event metadata. Observed failures included:

- `$.events[0].tags[0] must be one of "Military", "Diplomacy", "Economy", "Politics", "Culture", "Disaster".`
- `$.events[0].importance must be string; received number.`

The current timeline/event system owns those contracts. Round Zero must conform to them rather than weakening the timeline validator.

## Fix

1. The live Round-Zero directive now states the current event object contract explicitly for every `eventsJson` entry.
2. `importance` is instructed to be exactly the string `minor` or `major`.
3. `tags` are instructed to use only the released-beta six-category vocabulary, with 1-3 tags per event.
4. The shallow tool schema descriptions mirror the same contract so Gemini sees it at both prompt and tool boundaries.
5. The provider decode seam normalizes older/looser metadata before canonical validation:
   - case-insensitive valid tags are canonicalized;
   - unknown tags are dropped using the same native runtime tag normalizer used by saved events;
   - legacy numeric importance is mapped to the current string representation;
   - common textual salience aliases normalize to `minor`/`major`.
6. Canonical `PREGAME_HISTORY_SCHEMA` validation is unchanged and still runs after normalization. Invalid core event structure is still rejected before any write.
7. Round-Zero events remain historical records with no impacts/effects/changes object.

## Scope

Modified runtime files:

- `src/Game/AI/gameplay.js`
- `src/Game/AI/gameplaySchemas.js`

Regression tests:

- `src/Game/AI/pregameHistoryTransport.test.js`
- `src/Game/AI/pregameBootstrapArchitecture.test.js`

No changes to Political Actors, Phase009B, historical verification, world-generation logic, or the canonical timeline validator.

## Validation

Focused event-contract/Round-Zero tests: 16/16 passed.

Broader runnable AI/runtime suite excluding three tests blocked by the sandbox's missing `maplibre-gl` dependency: 395/395 passed.

`node --check` passed for both modified runtime JS files.
