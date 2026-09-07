# Continuum — Round-Zero Pre-game Bootstrap Lifecycle Fix
Date: 2026-09-07
Track: Continuum only

## Problem
A fresh campaign with `world.startingTimelineText` could lose its World Before Round One bootstrap if any event appeared first. The idle world pulse was allowed to run while the main/library menu was open and could write a start-day intelligence sighting. Both the UI trigger and `maybeGeneratePregameHistory()` treated a non-empty event ledger (and, separately, any simulation-history entry) as proof that Round Zero had already happened.

## Correct invariant
Round Zero is complete only when `world.simulationHistory` contains an entry whose `mode` is `pregame`.

A campaign is eligible while:
- `startingTimelineText` is non-empty;
- round is 1;
- current game date is still the scenario start date;
- no `mode: pregame` marker exists.

## Fix
- idle world pulse is suspended while the main menu is open;
- idle world pulse also checks the Round-Zero pending state natively before mutating anything;
- pre-game generation no longer requires an empty event ledger or empty generic simulation history;
- pre-existing start-day/manual/GM events are preserved and merged with generated pre-game events;
- generic manual/GM history entries are preserved when the `pregame` marker is inserted;
- exact duplicate event cards reconcile to the existing canonical event id so linked war/storyline/diplomatic bootstrap state cannot point at an event that dedupe later removes;
- Round Zero remains forbidden after round/date advancement.

## Scope
No changes to political generation, historical verification, Phase009B political reasoning, or scenario canonical political state.

## Follow-up: reactive trigger + retryability
A clean post-fix fresh-campaign reproduction showed the idle gate was doing its job (zero start-day pulse spam) but Round Zero could still remain at zero events. The remaining lifecycle defect was in the UI trigger itself:
- it read the main-menu flag non-reactively, so a campaign mounted while the library/menu was visible could miss the exact transition where gameplay became visible;
- it latched `pregameAttemptedRef` before the async bootstrap completed, so any transient busy/provider/validation failure permanently suppressed further attempts for that mounted campaign.

The trigger now subscribes to the main-menu state with `useMainMenuOpen()`, uses an in-flight guard rather than a permanent attempted latch, and retries a still-pending Round Zero after bounded exponential backoff. Persisted `simulationHistory.mode === "pregame"` remains the only completion marker.
