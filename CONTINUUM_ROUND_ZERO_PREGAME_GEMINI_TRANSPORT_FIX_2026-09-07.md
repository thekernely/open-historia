# Continuum Round-Zero Pregame Gemini Transport Fix — 2026-09-07

## Problem

After the Round-Zero lifecycle/trigger fixes, the bootstrap correctly woke up but Gemini rejected the `pregameHistory` function-call request itself with HTTP 400 `Request contains an invalid argument` before returning any model output.

The failure was transport-level: `pregameHistory` still exposed nested arrays of event objects and canonical-update objects directly in Gemini's function declaration. OpenHistoria already has precedent for Gemini rejecting sufficiently complex/deep function schemas with this exact opaque 400.

## Fix

The canonical in-app `PREGAME_HISTORY_SCHEMA` remains structured and unchanged for native validation. Only the provider-facing tool transport is flattened to three strings:

- `eventsJson`
- `summary`
- `canonicalUpdatesJson`

The two JSON fields contain array text. Native code decodes them immediately, then validates the resulting `{events, summary, canonicalUpdates}` payload against the existing canonical schema and Round-Zero semantic validator before any timeline or world state is written.

Raw/local providers that already return the internal structured shape remain accepted.

## Safety / behavior

- No change to Round-Zero canonical semantics.
- No change to event dates, war/relation/agreement/storyline validation, or merge/apply behavior.
- Malformed JSON strings use the existing bounded retry path; they never write partial state.
- The Gemini function declaration is now shallow and avoids nested event/update schema complexity.
- This is Continuum-only until explicitly ported and tested upstream.
