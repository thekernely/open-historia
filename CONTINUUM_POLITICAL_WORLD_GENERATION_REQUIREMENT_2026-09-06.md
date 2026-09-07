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
- accept no unrequested polity; project model over-generation down to the exact requested top-level/nested field scope before validation, so harmless extras are discarded rather than becoming canon or causing a whole-polity rejection;
- retry invalid or omitted polities at most once, without regenerating already-valid proposals;
- corrective retry locking is field-aware: a canonically valid `politicalSystem.type` and/or `politicalSystem.representation` is frozen independently unless validation specifically invalidates that field. A `representation_entities` failure with both fields valid freezes both and repairs only the party/power-bloc collection or entity shape; a representation-semantic failure may unlock representation while still freezing a valid type. A retry must not silently reclassify a dominant-party authoritarian system as `one_party_state` merely to make the roster validate;
- preserve valid partial batch results when another polity fails validation;
- never mutate world/scenario state in the generation layer; Phase006C owns review/apply and persistence;
- expose a dedicated `politicalWorldGeneration` AI task key so users may select an appropriate model independently from normal turns.
- after the AI chooses a previously-unknown representation, re-run native completeness against the resulting actor so `representation=none`, electoral parties, court factions, etc. are judged by the regime that was actually proposed rather than by the pre-generation placeholder;
- RICH/FULL completeness requires reusable hidden response profiles for every represented party/power bloc, including deliberately-unpolled coalition members, without inventing polling for them;
- when response profiles are missing on an existing roster, the generation prompt must enumerate the exact stable entity ids still requiring profiles; for newly generated rosters, every generated entity must carry a non-empty response profile when that need is requested;
- government ideology remains part of strategic political completeness even when government form/leadership was already authored.

Phase006B is still scenario creation/upgrade infrastructure, not a runtime political tick and not a World Director behavior source.


## Phase006C Scenario Editor review/apply seam

Phase006C materializes review and persistence in the Scenario Editor. Political generation is a first-class `Politics` section of scenario authoring, not Map Editor state and not a runtime turn effect.

The Phase006C flow is:

saved scenario canon
-> build scenario-wide polity/relevance inputs
-> Phase006B bounded AI generation
-> validated review queue
-> optional author edits / explicit entity-expansion opt-in
-> native revalidation against freshly reloaded scenario canon
-> atomic apply
-> persist `world.politicalActors`

Phase006C requirements:
- generation always uses the saved canonical scenario start date and refuses to run against an unsaved date edit;
- the Scenario Editor exposes Basic, Balanced, and Simulation-ready depth modes without changing the rule that every active canonical polity remains politically real;
- AI results remain review-only until the author explicitly applies selected proposals;
- author edits are revalidated through the Phase006A contract before persistence;
- adding parties/power blocs to an already-authored roster is closed by default; the author must explicitly pre-authorize roster-expansion proposals before generation and still approve expansion per polity at Apply (`allowEntityExpansion`);
- Apply re-loads the scenario immediately before writing so a long generation pass cannot overwrite newer world edits with stale `world.json` state;
- a scenario-date change invalidates the review queue and requires regeneration;
- selected proposals apply atomically: if any reviewed edit fails validation, none of the selected political state is persisted;
- only `world.politicalActors` is replaced on Apply; other freshly loaded world fields are preserved exactly;
- generated-field provenance is attached as non-public `generationProvenance` metadata on the resulting Political Actor, keyed by the paths actually filled, and survives normal Political Actor normalization;
- Phase006C does not write games, generate events, run political ticks, or feed the World Director.

Phase006C remains scenario creation/upgrade infrastructure. After accepted political state is persisted, the native C1-C4 engine owns its ongoing campaign evolution.

## Phase006C live-generation stabilization requirements

Live generation must be strict about canonical output without being brittle about harmless model phrasing/schema variation.

The native generation boundary therefore must:
- normalize a small, explicit set of common government aliases into canonical fields before validation (for example `government.type` -> `government.form`, known prime-minister/premier/chancellor aliases -> `headOfGovernment`, and known president/monarch/sovereign aliases -> `headOfState`);
- deterministically mirror a human-readable `government.form` from an otherwise-valid generated `politicalSystem` when the model omits that duplicate description;
- recursively project generated political-system/government/party/power-bloc objects down to the Phase006A field contract so unsupported descriptive extras are discarded rather than persisted or used to reject an otherwise-valid polity;
- keep party and power-bloc field scopes distinct (for example party `status` must not pass through merely because power blocs may have status);
- keep `strategic_context` strict: current `government.ideology` and at least one national `goals`/`fears`/`ambitions` entry are required at RICH/FULL depth, with corrective prompts explaining which half is missing; tolerate the common live-provider alias `strategicContext.{goals,fears,ambitions}` only by deterministically flattening it into those canonical top-level fields before scope projection;
- canonicalize generated `politicalSystem.representation` into the existing Phase005B representation vocabulary (`electoral`, `court_factions`, `party_state`, `elite_factions`, `military_factions`, `revolutionary_factions`, `colonial`, `none`) and normalize generated system type text into stable slug form rather than persisting a second free-form representation taxonomy;
- keep response-profile completeness strict while explicitly listing the exact stable entity IDs still requiring profiles; if generated `politicalResponse.issues` is present, each issue entry must be a structured object with finite `position`, `sensitivity`, and `strainResponse` values. Numeric shorthand such as `{ security: 90 }` is invalid and must trigger corrective retry rather than silently degrading C2 semantics;
- treat malformed `actorPatchJson` as a retryable generation failure, with only conservative JSON extraction (no broad guessed JSON repair);
- normalize only safe representation aliases that map cleanly into canon (for example power-bloc `role`/`powerType` -> `kind`, ruling-party/coalition aliases -> canonical government party ids, and a top-level live-provider `representation: [...]` entity array -> `parties` or `powerBlocs` according to the selected representation); unknown extras are still discarded;
- keep political-system type and representation semantically separate: `politicalSystem.type` must describe the constitutional/regime system and may never persist a Phase005B representation enum such as `elite_factions` or `military_factions`; if a provider misplaces a representation enum in `type`, derive the system type from the generated government form instead;
- treat `party_state` as a mixed representation that may expose the ruling party, internal power blocs, or both. Either collection can satisfy representation completeness, and RICH/FULL response-profile completeness applies to every represented entity across both collections;
- when enriching an existing authored roster, an exact stable entity id is sufficient identity for a missing-only patch such as `politicalResponse`; the AI does not need to repeat the canonical display name, while genuinely new entity ids still require a display name;
- avoid fabricated political precision while still providing a usable Round-Zero baseline: exact/measured polling claims remain forbidden, but Phase006D may request integer `supportEstimate` / `influenceEstimate` values only when `quantitative_landscape` is in scope. Native code converts those to explicitly approximate `generated-estimate` state, preserves authored/campaign percentages, repairs omissions/totals without a retry, and keeps quantitative estimates outside exact-date historical adjudication.
- corrective retries must not mutate an already-valid generated `politicalSystem.type` or `politicalSystem.representation` merely to make a different entity collection validate. Retry locks are field-level: errors naming only `politicalSystem.representation` unlock representation but preserve a valid type; errors naming only `politicalSystem.type` unlock type but preserve a valid representation; unrelated failures lock both valid fields. `party_state` is reserved for genuine party-state/one-party structures, not a generic label for dominant-party authoritarian republics with legal opposition.

## Fast diagnostic generation mode

The Scenario Editor Politics section must provide a development-oriented `Test 15 Polities` action so generation-contract changes can be smoke-tested without running the full world.

The test set should prioritize a fixed, diverse group when present: Poland, Russia, China, DPRK, Ethiopia, Equatorial Guinea, South Sudan, Azerbaijan, Saudi Arabia, Iran, Thailand, Malawi, Malta, Kyrgyzstan, and Djibouti. This deliberately mixes structural-regime regressions with exact-date Round-Zero traps that exposed later-2014 officeholder/government leakage. Missing targets may be filled deterministically from remaining active polities.

Test mode requirements:
- maximum 15 polities;
- RICH generation depth for every selected target so traits/response/strategy paths are exercised;
- maximum 5 polities per AI batch;
- exactly the normal two-attempt corrective limit;
- review-only output by default (valid test proposals start unselected);
- no persistence unless the author explicitly selects and applies proposals afterward.

## Generation diagnostics / run log

Every completed generation run should be exportable from the Scenario Editor as a diagnostic JSON log. The log must contain enough information to debug provider/contract failures without manually copying UI messages:
- scenario id/name/date and generation mode;
- planned, accepted, and failed polity counts;
- batch/attempt summaries;
- requested depth and needs per polity;
- bounded raw provider proposal data;
- parsed actor patch;
- scope-projected actor patch;
- discarded/unrequested field paths;
- validator errors and final per-polity status;
- final failures, warnings, and accepted proposal envelopes.

The diagnostic log must not contain provider credentials/secrets or unrelated scenario/world state.

## Downstream behavioral consumers: World Director AND Diplomatic Chat

Political Actors are not only a World Director input. Diplomatic Chat must also consume the same canonical political identity, leadership traits, agendas, domestic pressures, relevant perceptions, and current native behavioral disposition through a bounded conversation-specific projection.

Do not create a second diplomatic personality database. A government change, leadership change, political pressure shift, or altered perception must naturally change both world-action reasoning and diplomatic-chat voice/stance while the persistent diplomatic thread itself survives.


## Phase006C final pre-Apply hardening: party-state semantics and entity identity

The full Balanced live run exposed two remaining canonical edge cases that MUST be blocked before Apply:

- `politicalSystem.representation = party_state` MUST NOT cause native code to rewrite or infer `politicalSystem.type = one_party_state`. System type and representation are independent canonical dimensions.
- `party_state` is valid only when the proposal itself gives explicit structural evidence of one-party/single-party/vanguard-party/party-led/party-state rule in `politicalSystem.type` or `government.form`. Wording such as `dominant-party state`, `dominant party`, or the retry evasion `one-party dominant ...` is explicitly NOT party-state evidence. A generic or dominant-party republic must use `electoral` or the appropriate factional representation instead. This rule is scenario-agnostic and structural; it is not a hardcoded country list.
- Stable political entity ids are globally unique inside a Political Actor across both `parties` and `powerBlocs`. The same id may not appear in both collections.
- A `party_state` semantic failure invalidates the representation field, not an otherwise valid regime type. Corrective retry therefore unlocks `politicalSystem.representation` while preserving a valid `politicalSystem.type`; the model may not escape by rewriting `dominant_party_republic` into `one_party_state`.
- The fast 15-polity stress preset must include Ethiopia, Equatorial Guinea, and South Sudan alongside genuine party-state controls such as China and the DPRK.

The accepted full-world proposal set generated before this hardening is diagnostic evidence only and MUST NOT be Applied. Generate a fresh Balanced set after this gate is live and tested.

## Phase006C pre-Apply retry alias hardening: nested leader traits

Live Test-15 diagnostics exposed one safe Gemini retry variant after the party-state hardening: a corrective proposal may place the requested actor-level leadership profile under `leader.traits` while `leader` itself carries officeholder identity (`name`/`title`). The generator boundary MUST normalize this before requested-scope projection:

- when top-level `actorPatch.traits` is absent or empty and `actorPatch.leader.traits` is a non-empty object, promote that nested object to top-level `actorPatch.traits`;
- remove the nested `leader.traits` field after promotion so officeholder identity remains separate from actor-level behavioral traits;
- never overwrite a valid explicit top-level `actorPatch.traits` object with the nested alias;
- preserve supported leader officeholder identity fields such as `id`, `name`, and `title`;
- keep the existing strict validator for `government.rulingPartyIds`: references to entities represented only as `powerBlocs` remain invalid and should trigger corrective retry rather than being silently reinterpreted.

This alias exists only at the generated-provider boundary. Canonical Political Actors continue to own leadership traits at the actor root.


## Phase006C final party-state field-lock hardening

The final Test-15 exposed a retry loophole after the earlier whole-system lock: when only `politicalSystem.representation` failed semantic validation, the model could rewrite a valid dominant-party regime type into `one_party_state` and manufacture matching prose. The native retry contract MUST close that loophole without freezing a genuinely invalid representation:

- retry locks are independent per field (`type`, `representation`);
- a semantic error that explicitly names `actorPatch.politicalSystem.representation` unlocks only representation while retaining a valid non-`unspecified` type;
- a generic `political_system` completeness failure invalidates both fields conservatively;
- native retry projection reapplies only the locked field(s), preserving corrected unlocked fields returned by the provider;
- a provider attempt to mutate a locked field is ignored and recorded as a diagnostic warning;
- `dominant-party state`, `dominant party`, and `party dominant` phrases never satisfy the `party_state` evidence gate;
- genuine one-party/vanguard-party systems such as canonical China/DPRK shapes remain valid and may lock both fields on unrelated retries.

The exact live regressions are Ethiopia (`dominant_party_republic + party_state` retrying into `one_party_state`) and South Sudan (`dominant_party_republic + party_state` with `dominant-party state` prose). These must remain covered by automated tests before a full Balanced generation is Applied.

## Phase006C final Round-Zero exact-date historical verification gate

The final full Balanced live run proved that structural validation alone cannot enforce factual start-date accuracy. A proposal may truthfully declare `sourceAsOf = scenarioDate` while still recalling an officeholder, government transition, coup, or political structure from later in the same year. This is a factual temporal leak, not a schema failure.

Before any generated historical political identity reaches the review queue, Phase006C therefore performs a second bounded exact-date verification pass over only newly generated date-sensitive identity fields.

Requirements:
- the verification pass is read-only with respect to scenario/world state and runs before Scenario Editor review/apply;
- it checks only generated Round-Zero identity that must already be true on the exact scenario date: head of state, head of government, government form/status, and date-sensitive political-system/representation or generated representation-roster state;
- scenario-authored canon/backstory remains stronger authority than real history. If authored canon diverges before the start date, verification must preserve that divergence;
- real-world developments after the scenario date have zero authority and may never be moved backward into Round Zero;
- verification is conservative: terminology/taxonomy preference alone is not grounds for correction;
- existing authored Political Actor fields are never corrected by this pass. The verifier receives an explicit list of generated identity paths and native code scopes any correction back to those generated paths;
- `confirmed` proposals pass unchanged;
- `corrected` proposals may return only identity fields (`politicalSystem`, `government`, `leader`, `parties`, `powerBlocs`). Native code merges the correction into the already-valid proposal and reruns the full Phase006A proposal validator and requested-need completeness checks before review;
- a representation change requires explicit representation-roster replacement authorization from the verification result so stale generated parties/power blocs are not silently retained;
- malformed, omitted, duplicate, or natively invalid verification results retry at most once and then fail closed rather than entering the review queue as historically verified;
- future scenario dates skip real-history verification entirely so future/fictional canon is never snapped back toward real history;
- verification uses a separate AI task-routing key (`politicalWorldVerification`). When unset it inherits the Political World generation model override so the verifier is not accidentally weaker; authors/developers may still route the cross-check to a different model when desired;
- Scenario Editor progress and downloadable generation diagnostics must expose the verification phase, including confirmed/corrected/failed counts and bounded verifier diagnostics.

This gate is specifically intended to catch the factual class exposed by the 2014-03-22 Fault Lines run (for example officeholders/government transitions remembered from later in 2014 and pre-coup states described as already post-coup) without hardcoding country/date facts into the native political model.

## Phase006C exact-date verifier transport hardening

The first full Balanced run with the Round-Zero verifier exposed one remaining provider-boundary failure mode: a verifier may correctly identify a temporal contradiction but return `correctedIdentityJson` as a one-layer escaped JSON string (for example `{\n  \"government\": ... }`) instead of directly parseable JSON text.

Requirements:
- exact-date verification must accept normal JSON object text, fenced JSON object text, JSON-string-wrapped object text, and one conservative layer of standard JSON escaping;
- transport recovery is parser-only: no `eval`, no heuristic field invention, and no acceptance unless the recovered value parses to a plain JSON object;
- recovered corrections still pass the same generated-path scoping, representation-roster replacement rules, full Phase006A validation, and requested-need completeness checks;
- the main Political World wire parser and exact-date verifier share the same conservative JSON-object transport parser so provider-format resilience cannot drift between the two seams;
- once a verification attempt has explicitly identified a temporal contradiction (`verdict=corrected`) but its correction fails transport/native validation, a later retry may not silently switch to `confirmed` for the unchanged candidate. It must return a valid correction or fail closed.

The live regressions are Malawi and Madagascar in the 2014-03-22 Balanced run: both corrections were historically identified correctly, but escaped correction transport was initially unreadable; Madagascar then incorrectly flipped to `confirmed` on retry. Both behaviors must remain covered by automated tests.


## Phase006C final domestic-context provider alias hardening

The next full Balanced run exposed one remaining generated-provider naming mismatch on a FULL-depth actor: the model supplied the requested `domestic_context` payload under a non-canonical `actorPatch.domesticContext` wrapper on both attempts. Native requested-scope projection correctly discarded that unknown wrapper, which then caused an otherwise complete United States proposal to fail `domestic_context`.

Requirements:
- canonical Political Actor ownership remains unchanged: domestic pressure text belongs in top-level `domesticPressures`, while scalar approval/stability belong in `government.approval` and `government.stability`;
- at the generated-provider boundary only, a `domesticContext` alias may be normalized before requested-scope projection;
- known alias payloads are conservative: `domesticContext.pressures` or `domesticContext.domesticPressures` may fill missing/empty top-level `domesticPressures`, and finite `domesticContext.approval` / `domesticContext.stability` may fill missing government metrics;
- an array-valued `domesticContext` may be treated only as a pressure-string array; no other guessed fields are invented;
- explicit canonical `domesticPressures`, `government.approval`, and `government.stability` always win over alias values;
- the alias wrapper is removed after normalization so it cannot leak into review/apply or appear as an unrequested dropped field;
- generation prompting must explicitly require `domesticPressures` and/or `government.approval` / `government.stability` and forbid `actorPatch.domesticContext`;
- the live United States regression shapes from the 2014-03-22 Balanced run (approval/stability only, and approval/stability plus a `pressures` array) must remain covered by automated tests.

This is a provider-boundary compatibility alias only. It does not create a second canonical domestic-context schema and does not change Phase006A ownership or downstream Political Actor semantics.

## Phase006C final representation-retry roster alignment hardening

The next full Balanced run exposed a final corrective-retry shape failure on the Sahrawi Arab Democratic Republic. The first proposal correctly failed the strict `party_state` semantic gate; the second proposal repaired `politicalSystem.representation` to `revolutionary_factions` while keeping the Polisario Front under `parties`, so `representation_entities` still failed because factional representations canonically own their represented forces under `powerBlocs`.

Requirements:
- representation repair and representation-roster repair are atomic on corrective retry. If an unlocked representation changes, the same retry must reshape the represented entities to the canonical collection for the new representation: `electoral -> parties`; `party_state -> parties and/or powerBlocs`; `court_factions` / `elite_factions` / `military_factions` / `revolutionary_factions` / `colonial -> powerBlocs`; `none -> no roster required`;
- corrective prompts must state that mapping explicitly when representation is unlocked, not merely ask the provider to choose a more accurate representation;
- native code must not broadly reinterpret first-attempt party rosters as factional power blocs. A first failed attempt still gets the normal semantic corrective retry so the provider can replace a superficially similar party list with a genuinely better faction/court/military/revolutionary roster;
- only on a corrective retry where representation itself was previously invalidated (there is a field-level system lock but no locked representation), native provider-boundary normalization may conservatively relocate a sole wrong roster collection to the collection required by the provider's newly chosen canonical representation;
- that fallback is collection-shape normalization only: it does not change `politicalSystem.representation`, does not invent entities, does not synthesize polling/support, and does not infer a new regime type. Destination-incompatible collection-only fields are removed, and party-id government references are removed if the entire party roster is relocated to non-party power blocs;
- `party_state` remains mixed and is never force-relocated because both parties and power blocs may legitimately represent it;
- an already-locked representation continues to use the existing semantic retry path rather than being silently reinterpreted on first failure;
- diagnostics must record any corrective roster relocation so review/debug logs expose that native transport normalization occurred.

The exact regression fixture is the 2014-03-22 Sahrawi retry: `semi_presidential_republic + revolutionary_factions` with `Polisario Front` mistakenly returned under `parties`. It must finish accepted as `revolutionary_factions` with the same generated entity under `powerBlocs`, while the valid locked system type remains unchanged. A symmetric `electoral` retry with a sole mistaken `powerBlocs` collection must likewise normalize to `parties` without carrying bloc-only fields into party canon.

## Phase006C final reliability hardening: party-state evidence, verifier scope, and compound officeholders

The next full Balanced live run exposed three final reliability classes at once: genuine one-party systems were rejected because the native evidence gate required a narrow noun immediately after `one-party` / `single-party`; a terminology-only verifier correction for Niger poisoned sticky temporal-correction state; and a compound officeholder string for Australia was confirmed without independently checking the embedded Governor-General.

Requirements:
- after dominant-party wording has been rejected, `politicalSystem.type` / `government.form` containing an explicit `one-party` or `single-party` marker is sufficient party-state structural evidence even when followed by a constitutional form such as `presidential republic`, `semi-presidential republic`, `socialist republic`, or `communist state`;
- dominant-party language remains excluded before positive party-state matching. `dominant party`, `party dominant`, `one-party dominant`, and equivalent dominant-party structures must not pass merely because they contain the words `one party`;
- the literal live 2014-03-22 Cuba (`Single-party communist state`), Eritrea (`One-party presidential republic`), and Sahrawi (`One-party semi-presidential republic`) shapes must validate as `party_state` on the first attempt, while the existing Ethiopia/South Sudan dominant-party regressions remain rejected;
- historical verification must declare explicit `correctionScopes`: `officeholders`, `government_structure`, `political_system`, and/or `representation_roster`; confirmed results use an empty scope list;
- verifier correction scoping is native and fail-closed. Only fields belonging to declared scopes may be merged, and all accepted corrections still pass the full Phase006A validation/completeness gate;
- spelling, demonym, translation, transliteration/romanization, capitalization, abbreviation, ideology-label, wording, and other display-only preferences are outside the Round-Zero verifier's mandate. They must not create sticky temporal-correction state or rewrite otherwise-valid generated canon;
- a valid representation-roster correction must be structurally date-sensitive (membership, governing references, leader/status/kind, or a real roster replacement). A same-identity display-only rename is ignored by the exact-date verifier rather than applied as historical canon;
- malformed REAL temporal corrections remain sticky. Once a verifier claims an actual temporal contradiction in an allowed correction scope, a later retry may not rescind it by confirming unchanged state merely because the correction transport/native validation failed;
- when `politicalSystem.representation` changes, the correction must declare both `political_system` and `representation_roster`, provide replacement roster state, and set `replaceRepresentationEntities=true`;
- compound officeholder fields are high-risk exact-date identity. If a generated `headOfState`, `headOfGovernment`, or `leader` field embeds multiple named people/roles (for example sovereign + Governor-General, regent, acting official, co-head, collective presidency, slash-separated or parenthetical representative), every named person and role must be verified independently on the exact scenario date;
- compound-officeholder candidates receive explicit per-polity verifier callouts; all historical-verification work is now uniformly bounded to maximum 4 polities per batch, reducing the chance that a secondary officeholder is skipped inside a dense global batch;
- these rules remain scenario-agnostic. Australia, Niger, Cuba, Eritrea, and Sahrawi are regression fixtures only, not country hardcodes.

The exact live regressions from the 2014-03-22 Balanced run are: Cuba/Eritrea/Sahrawi rejected despite explicit one-party government forms; Niger marked `corrected` only to change `Nigerian` to `Nigerien`, with malformed correction JSON; and Australia confirmed as `Queen Elizabeth II (Governor-General Peter Cosgrove)` even though the embedded Governor-General identity was date-sensitive. All must remain covered by automated tests before applying a full Balanced review queue.

## Phase006C final generated-entity collection-shape transport hardening

The next full Balanced live run reduced the remaining failure to a provider transport-shape mismatch on a FULL-depth United States retry: Gemini returned the correct party identities under an id-keyed object (`parties: { "democratic-party": {...}, "republican-party": {...} }`) instead of the canonical array required by Political Actors.

Requirements:
- canonical Political Actor ownership remains unchanged: `parties` and `powerBlocs` are arrays of entity objects, each carrying its own stable `id`;
- generation and corrective-retry prompts must explicitly state that `actorPatch.parties` and `actorPatch.powerBlocs` MUST always be JSON arrays and MUST NOT be keyed objects/maps/dictionaries;
- at the generated-provider boundary, before representation inference, requested-scope projection, and Phase006A validation, a plain-object `parties` or `powerBlocs` map may be normalized deterministically to an array using its object keys as stable ids;
- an explicit entity `id` always wins only when it is identical to the object key after basic whitespace cleanup. If a keyed entry contains a conflicting explicit id, the transport is ambiguous and must remain invalid/fail closed rather than guessing;
- non-object keyed entries are not recoverable and must remain invalid;
- canonical arrays pass through unchanged;
- the normalization is transport-only. It must not change political representation, move entities between parties/powerBlocs, invent entities, alter support/polling, or weaken any existing semantic validation;
- the same rule applies symmetrically to `parties` and `powerBlocs` so a future factional retry cannot reproduce the same bug under the other collection;
- retry prompts must repeat the strict array requirement when the previous native error says `actorPatch.parties must be an array when generated` or `actorPatch.powerBlocs must be an array when generated`.

The exact live regression fixture is the 2014-03-22 United States corrective retry that returned two valid party payloads keyed by `democratic-party` and `republican-party`. It must be accepted as a canonical two-element `parties` array with those ids injected natively, while a mismatched key/id fixture must continue to fail closed.

## Phase006C final historical-verifier reliability hardening: formal officeholders, collision sentinel, and verifier-only re-check

The first mechanically complete 202/202 Balanced run proved that generation/validation had converged, but the exact-date verifier could still miss two classes of factual officeholder error: a supreme/de facto leader being substituted for the formal head of state, and the same head of government being assigned to two different polities on the same scenario date.

Requirements:
- `government.headOfState` and `government.headOfGovernment` mean the FORMAL current officeholders for those offices on the exact scenario date. A supreme leader, paramount party leader, military patron, or de facto strongman must not substitute for the formal officeholder unless that person formally holds the office. When the supreme/de facto political leader is different, that identity belongs in top-level `leader` when generated;
- the same formal-officeholder rule is stated in both generation and historical-verification prompts so the generator and verifier use identical semantics;
- every historical-verification batch is bounded to at most 4 polities, and the verification tool schema itself also advertises `maxItems: 4`;
- after the normal exact-date verification pass, native code performs a cross-polity officeholder collision scan over the verified candidates;
- shared heads of state alone are not treated as contradictions because shared monarchs can be legitimate. A collision is escalated when the same normalized named person appears across multiple polities and at least one assignment is `headOfGovernment`;
- every escalated collision receives a focused exact-date re-verification prompt that lists all conflicting polity/role assignments and explicitly requires the verifier to check the formal officeholder in each polity;
- if focused re-verification corrects the collision, the corrected proposals are revalidated through the existing Phase006A historical-correction path and remain eligible for review;
- if the same cross-polity head-of-government collision remains after focused re-verification, all still-ambiguous affected proposals fail closed rather than entering the review queue as historically verified;
- legitimate same-person `headOfState` + `headOfGovernment` assignments inside one polity are unaffected by the collision sentinel;
- historical-verification diagnostics expose an `initial` pass and any `collision-recheck` pass, plus collision-recheck summary fields listing requested, resolved, and failed polities;
- Scenario Editor exposes a `Re-check History Only` action for an existing successful generation result. It reruns only exact-date historical verification (including the collision sentinel) against the already-generated review proposals and MUST NOT invoke Political World generation again;
- verifier-only re-check is still read-only with respect to scenario persistence. It updates the in-memory review result only; Apply remains the sole persistence action and the existing saved-date guard remains mandatory.

Regression fixtures:
- 2014-03-22 DPRK: `Kim Jong Un` may remain the supreme political `leader`, while the historical verifier must be able to correct the formal `government.headOfState` independently;
- 2014-03-22 Madagascar/Mali: the same generated `Oumar Tatam Ly` head-of-government assignment across both polities must trigger native collision review, allow correction of Madagascar to the correct formal incumbent, and fail closed if a focused verifier confirms the contradiction unchanged;
- shared `Queen Elizabeth II` head-of-state assignments across multiple Commonwealth realms must not trigger the collision sentinel when their heads of government differ.

## Phase006C verifier sticky-temporal-obligation hardening

The next 202/202 Balanced run exposed one final verifier retry loophole on the Republic of Korea: the verifier correctly identified that the New Politics Alliance for Democracy did not yet exist on 2014-03-22, but its first `corrected` response omitted `correctionScopes` and returned malformed correction JSON. Because sticky correction state was established only after scope validation, the second verifier attempt could incorrectly rescind the already-established temporal finding by returning `confirmed` for the unchanged future roster.

Requirements:
- a clearly temporal verifier finding becomes a sticky correction obligation as soon as the verifier returns `verdict=corrected` with an issue that explicitly identifies a date/order contradiction (for example before/after/until/as-of/took-office/founded/formed/created/dissolved/merged/elected/sworn or an explicit year/date), before `correctionScopes` or `correctedIdentityJson` transport is validated;
- malformed or missing `correctionScopes` and malformed correction JSON may cause the correction attempt to fail and retry, but they must not erase the already-established temporal contradiction;
- once sticky temporal correction state exists for a polity, a retry must not return `confirmed`; it must return a valid scoped correction that passes the existing native historical-correction scope, transport, representation-roster replacement, Phase006A validation, and completeness rules, or the polity fails closed;
- corrective retry prompts must explicitly surface a `TEMPORAL CORRECTION OBLIGATION` for affected polities and state that `verdict=confirmed` is forbidden until a valid correction is returned;
- clearly non-temporal terminology/display-only issues remain outside the verifier's mandate and must not establish sticky correction state, even if the provider also omits `correctionScopes`;
- valid scoped temporal corrections whose issue wording is terse or ambiguous retain the previous fail-closed sticky behavior;
- this hardening changes only the verifier retry contract. It does not regenerate politics, alter generation semantics, change canonical ownership, or weaken any existing validation.

Regression fixtures:
- 2014-03-22 Republic of Korea: a first verifier response that correctly states NPAD was founded on 2014-03-26 but returns `correctionScopes=[]` and malformed `correctedIdentityJson` must establish sticky correction state immediately. A second `confirmed` response must be rejected; a second valid `representation_roster` replacement to the Democratic Party must succeed without rerunning political-world generation;
- Niger terminology-only corrections remain non-sticky even when the provider omits `correctionScopes`.

## Phase006C historical verification consensus and adjudication hardening

A mechanically valid 202/202 history-only re-check demonstrated that a single exact-date verifier call can still be non-deterministic: the same 2014-03-22 Republic of Korea roster was previously identified as temporally invalid because the New Politics Alliance for Democracy was formed on 2014-03-26, yet a later verifier call confirmed the unchanged future roster. Historical verification must therefore not treat one model verdict as sole factual authority.

Required behavior:

- every generated date-sensitive Round-Zero identity is checked by two independent verifier passes over the same original generated candidate. Pass B must be a fresh challenge check and must explicitly look for near-date transitions, including officeholder changes, acting/caretaker incumbents, party formations/dissolutions/mergers, election-transition rosters, government-form changes, and compound officeholders;
- only unanimous `confirmed` results may pass directly without further review;
- if both independent passes return valid corrections that produce the same canonical generated identity, the correction is accepted as independent agreement without a third model call;
- every other disagreement is sent to a focused consensus-adjudication pass against the original candidate. The adjudicator receives bounded summaries of both independent outcomes as evidence, not as authoritative canon;
- if either independent pass produced a valid correction OR any failed independent attempt established a concrete temporal contradiction, that polity enters adjudication with a sticky temporal-correction obligation. The adjudicator may not erase the finding by returning `confirmed`; it must provide a valid scoped correction or fail closed;
- if neither independent pass established a temporal correction and they still disagree because of transport/validation failure, adjudication may independently confirm or correct the original candidate;
- an unresolved adjudication fails closed. A polity is never accepted merely because one of two verifier calls said `confirmed`;
- non-temporal display/terminology corrections remain outside the verifier mandate and normalize to confirmation before consensus, preserving the existing Niger-style protection;
- the deterministic cross-polity officeholder collision sentinel runs only after consensus/adjudication has produced the provisional verified set. Its existing focused collision re-check and fail-closed behavior remain unchanged;
- generation, canonical ownership, Phase006A validation, retry limits, Apply semantics, and the scenario-date wall are unchanged. This hardening changes only how exact-date historical verification reaches a final verdict;
- diagnostics must identify `consensus-a`, `consensus-b`, `consensus-adjudication`, and any `collision-recheck` pass, and expose consensus summary counts/lists so live runs can prove whether a polity passed by unanimous confirmation, agreed correction, adjudication, or failed closed.

Mandatory regressions:

- 2014-03-22 Republic of Korea: if one independent pass confirms the future NPAD roster while the other identifies the 2014-03-26 formation date, consensus must not accept the confirmation. Focused adjudication must retain the temporal obligation and replace the future roster with the date-correct Democratic Party (or fail closed);
- a malformed temporal correction in one independent pass must still transfer its sticky temporal finding into adjudication even if the other independent pass confirms unchanged state;
- two independent valid corrections that produce the same identity must be accepted without unnecessary adjudication;
- two independent confirmations must remain the fast consensus path and must not trigger adjudication;
- the history-only re-check path must use the same consensus/adjudication contract and must never rerun Political World generation.

## Phase006C temporal red-team sentinel and bounded History-only recheck

The live 2014-03-22 Balanced run after the first consensus/adjudication hardening proved that two correction-capable verifier passes remain correlated: both independently confirmed the Republic of Korea roster even though `New Politics Alliance for Democracy` did not exist until 2014-03-26. The same design also made `Re-check History Only` prohibitively expensive because it replayed two full four-polity verifier passes over roughly 199 candidates.

The exact-date gate therefore uses two deliberately different jobs rather than the same verifier twice:

1. **Pass A — correction-capable exact-date verifier**
   - maximum four polities per batch;
   - may confirm or return a narrowly scoped correction;
   - retains sticky correction semantics, formal-officeholder rules, scenario-canon precedence, native revalidation, and fail-closed behavior.

2. **Pass B — temporal red-team sentinel**
   - maximum twelve polities per batch because its transport is shallow and correction-free;
   - provider tool transport MUST remain Gemini-safe and one level deep: the tool accepts a single `checksJson` string containing the complete JSON array of sentinel results, then native code conservatively parses and validates that array. Do not expose the nested check objects directly in the provider function schema; Gemini may reject nested/deep `ANY` function declarations with HTTP 400 `Request contains an invalid argument.`;
   - audits the *resulting Pass-A candidate*, including a corrected candidate when Pass A changed it;
   - receives an explicit numbered FACT list for every date-sensitive generated identity field;
   - must individually attest every supplied FACT id before returning `clear`;
   - treats officeholder tenure, acting/caretaker status, coups/election transitions, party/faction foundations, dissolutions, mergers, renames, coalition changes, and representation changes as temporal attack surfaces;
   - explicitly treats an identity that becomes true later in the same month/year as invalid on an earlier scenario date;
   - never authors corrections itself. It returns only `clear` or `challenge` plus checked/challenged FACT ids and a concrete issue.

Native orchestration rules:
- Pass-A result + sentinel `clear` => accept the Pass-A result, preserving any valid Pass-A correction.
- Sentinel `challenge`, invalid/incomplete sentinel coverage, or unresolved Pass-A failure => focused correction-capable adjudication on the original generated candidate.
- A valid sentinel `challenge` is a sticky temporal correction obligation unless the issue is clearly non-temporal; adjudication may not silently wash it away by confirming unchanged state.
- A malformed, duplicate, incomplete, or omitted sentinel result never clears a polity. It routes that polity to focused adjudication instead.
- The cross-polity officeholder collision sentinel remains after the verifier/sentinel/adjudication stage.

`Re-check History Only` is now intentionally cheaper:
- if a proposal already carries a valid prior `historicalVerification` verdict, the recheck reuses that Pass-A decision instead of replaying the correction-capable verifier;
- it runs only the twelve-polity temporal sentinel over those existing decisions and invokes focused adjudication for challenged/invalid cases;
- candidates with no prior historical decision still receive Pass A before the sentinel;
- therefore a 199-candidate already-verified world has a baseline of `ceil(199 / 12) = 17` model calls rather than roughly 100 calls before disputes.

Regression requirements include:
- a literal Korea case where Pass A confirms NPAD on 2014-03-22, the temporal sentinel challenges the NPAD FACT because the party formed on 2014-03-26, and sticky adjudication replaces it with the correct pre-NPAD opposition roster;
- sentinel `clear` is invalid unless all supplied FACT ids are attested;
- History-only recheck call count scales by the twelve-polity sentinel batch size and does not replay Pass A for already-verified proposals.

This hardening is verifier-only. It does not change Political World generation semantics, relevance tiers, native Phase006A validation, Apply behavior, or canonical Political Actor ownership.

## Phase006C temporal sentinel live-protocol hardening

The first successful 199-polity bounded History-only recheck proved the temporal sentinel concept itself: it independently caught five real same-date contradictions, including the 2014-03-22 Republic of Korea NPAD leak, Cook Islands One Cook Islands Movement, FijiFirst, Bosnia's rotating Presidency chair, and South Ossetia's acting prime minister. The same run also exposed provider-transport noise that unnecessarily escalated otherwise clear polities.

Required hardening:
- sentinel polity identity remains the exact requested canonical polity key, but native validation may recover provider-only case/punctuation/slug variants (for example `republic-of-austria` -> `Republic of Austria`) only when the normalized transport key maps to exactly one polity in the current requested batch. Ambiguous or unknown matches still fail closed and never clear a polity;
- `verdict=clear` remains strict: all supplied FACT ids must be attested and `challengedFactIds` must be empty. A harmless provider note such as `None`, `No issues`, or affirmative prose stating that all supplied identities are verified/correct/temporally valid must not manufacture an adjudication. Any substantive, ambiguous, adversative, negative, or temporal-contradiction text on a clear verdict still fails closed into focused adjudication;
- progress callbacks from the temporal sentinel must use the same structured `sampleError` shape as generation/verification (`{polityKey, errors[]}`), and the Scenario Editor must defensively render either structured or legacy string diagnostics so `Current rejection` can never appear as an empty box;
- these compatibility rules do not weaken the sentinel's date wall, FACT coverage requirement, sticky temporal challenge behavior, or focused adjudication contract.

Live-run regression target:
- replaying the provider patterns observed in the 199-polity 2014-03-22 recheck must treat the 12 slugged polity keys as their unique requested canonical identities and treat the 48 affirmative/`None` clear notes as clear rather than challenges;
- the five genuine sentinel challenges remain challenges and therefore require only two four-polity adjudication batches;
- an otherwise identical already-verified 199-polity recheck should therefore remain at 17 sentinel calls plus 2 genuine adjudication calls (19 total), rather than escalating every transport-noise batch.

## Phase006C temporal sentinel live-protocol hardening II — partial salvage + idempotent recheck

The next live 199-polity History-only recheck proved that the prior transport-key normalization worked and that the Korea correction remained stable, but exposed three final deterministic protocol edge cases:

1. Gemini may write affirmative `verdict=clear` commentary that does not begin with `All`/`Every` (for example `Executive leadership and major party figures are temporally valid...` or `Andrus Ansip is Prime Minister on 2014-03-22...`). Complete FACT attestation plus an empty `challengedFactIds` list must not be converted into a fake challenge merely because benign explanatory prose is present. Clear commentary still fails closed when it contains explicit contradiction/adversative markers such as `but`, `however`, `incorrect`, `wrong`, `not yet`, `did not exist`, or an explicit before/after-scenario contradiction.
2. `checksJson` is a flat array transport. One malformed provider-invented member (observed live as an invalid `_comment` field) must not cause all other valid polity objects in the same twelve-polity batch to disappear. Native parsing may conservatively salvage independently parseable flat check objects and must route only malformed/omitted members to focused adjudication. It must never repair or accept the malformed member itself.
3. History-only recheck reuses already-applied Pass-A corrections. A prior `historicalVerification.verdict=corrected` is historical metadata describing a correction that is already present in the current candidate; it is not a new unresolved sticky obligation. During a later recheck, only a fresh Pass-A temporal finding or a fresh sentinel temporal challenge may create sticky adjudication state. If a protocol-only sentinel dispute is adjudicated as `confirmed`, native code preserves the prior correction metadata rather than erasing it or forcing a no-op `corrected` response.

Mandatory regression behavior:
- a previously corrected Bosnia candidate (`Bakir Izetbegović` / `Vjekoslav Bevanda`) must remain accepted and retain its prior correction metadata during a later recheck; it must not fail with `Historical correction did not change the generated candidate identity` merely because a protocol-only dispute triggered adjudication;
- a twelve-polity sentinel response with eleven valid checks and one malformed flat object must preserve the eleven valid clears and adjudicate only the malformed/omitted polity;
- the live affirmative commentary patterns observed for Egypt, Argentina, Australia, Barbados, Belize, Venezuela, Bosnia, Brunei, Burkina Faso, Costa Rica, El Salvador, and Estonia must clear when all FACT ids are checked and no contradiction is expressed;
- a `clear` result whose commentary explicitly says a supplied identity existed only after/before the scenario date must still fail closed into adjudication;
- the 2014-03-22 Republic of Korea correction to the Democratic Party must remain preserved across repeated History-only rechecks.

Exact live-log replay target (using the provider responses from `balanced-history-recheck(2)` against the previously accepted 202-polity result):
- 199 date-sensitive candidates requested;
- 17 temporal-sentinel calls;
- only Republic of Macedonia (missing one FACT attestation) and Republic of Uganda (the malformed member) require focused adjudication;
- one four-polity-cap adjudication call is sufficient for those two disputes;
- 202 proposals remain accepted, 0 failed;
- historical summary remains 191 confirmed / 8 corrected / 0 failed;
- Republic of Korea remains `Saenuri Party` + `Democratic Party`;
- Bosnia remains accepted with its prior corrected verification metadata.

This hardening remains Continuum-only and verifier-only. It does not alter Political World generation, relevance/depth planning, canonical Political Actor ownership, Apply semantics, or upstream OpenHistoria.
