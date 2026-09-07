# OpenHistoria Continuum — Geopolitical Substrate, Institutions, Dynamic Power and Chat Resolution
Date: 2026-09-07
Track: Continuum only

## Purpose
Complete the objective geopolitical substrate needed by Political Decision Context / World Director without making header tags a second source of truth. Also restore Continuum's stable diplomatic-thread resolution semantics that regressed during the beta merge.

## Canonical ownership
- `world.politicalActors`: internal political organism.
- `world.institutions`: formal organizations/blocs and membership/role/status.
- `world.agreements`: formal standing agreements/treaties.
- `world.relations`: bilateral political-climate truth.
- `world.wars`: conflict truth.
- `world.powerStatus`: one current geopolitical power tier per active polity.
- Country header tags are projections only. They are not canonical membership or power truth.

## Formal institutions
`world.institutions` is schema-versioned native state. Supported institution kinds include security alliances, defense pacts, political/economic unions, regional blocs, international organizations and consultative groups.

Membership status is distinct from alignment and can be `member`, `candidate`, `associate`, `observer`, or `suspended`. Member role can be `leader`, `leading-member`, or `member`.

Native lifecycle operations support create, join, leave, suspend, restore, role change and dissolve. Normal generated events/decisions and GM transactions have a structured `institutionUpdates` channel. A country joining/leaving NATO, the EU, CSTO, a future Lublin pact, etc. must mutate this ledger rather than merely changing a descriptive tag.

Round Zero can compile strategically relevant Day-One institutions through `institution:active` baseline facts. Scenario-editor geopolitical baseline generation can also seed reusable scenario membership state.

## Geopolitical baseline generation
Scenario Editor Politics exposes a separate `Generate Geopolitical Baseline` review/apply flow. It is not the Political Actor historical verifier.

- batch size: 48 polities
- about 5 provider calls for a 202-polity world
- shallow provider transport: `politiesJson` + `agreementsJson`
- each requested polity receives one initial power tier and strategically relevant formal memberships
- major active agreements may reference canonical counterpart polities outside the current 48-polity profile batch through a bounded global polity-key vocabulary
- no historical verifier / temporal sentinel
- apply writes only canonical geopolitical substrate domains

Fresh-scenario seeding must preserve `world.institutions`, `world.powerStatus`, and `world.agreements` into a new campaign on both desktop and web paths.


## Universality / temporal hardening
This subsystem must work for 1066, 1911, 2014, future dates, fictional worlds and alternate-history authored scenarios. Modern geopolitical vocabulary must never be assumed merely because the current developer test scenario is 2014.

- Geopolitical baseline prompts do not present a modern organization menu. Generated institution ids derive from the institution name actually valid in the scenario era.
- Every newly generated institution baseline carries a founding/establishment date; generated memberships may carry their own joined/status-since date. Native Round-Zero validation rejects institutions not yet founded, already dissolved, or memberships explicitly dated after the scenario date.
- A small native temporal guard table exists only as an anachronism safety rail for well-known real institutions (for example NATO, the EU, CSTO, the Warsaw Pact, League of Nations). It never auto-creates those institutions.
- Structured scenario-authored `world.institutions` outranks the real-history guard. A fictional/alternate scenario may intentionally define an institution earlier than its real-world namesake, and that authored canon remains valid.
- Round Zero uses the same temporal baseline guard for newly generated `institution:active` facts. The canonical envelope carries the institution founding date and agreement start/effective date.
- Generated standing agreements must provide an exact active start/effective date and are rejected if they begin after the scenario date or are already ended by it.
- Dynamic power scoring is era-relative and scenario-relative. Native recalculation uses the polity's rank/share against the current campaign world's available GDP/population distribution plus strategic state; it does not use fixed modern-dollar GDP thresholds. Scaling every polity's economy by the same unit factor must not change their relative native power scores.
- Round-Zero/generated power tier remains an era-aware prior and changes only after sustained campaign-derived evidence crosses hysteresis thresholds.

Example invariants:
- 1911 cannot receive a newly generated NATO, EU, CSTO or Warsaw Pact simply because those organizations are familiar to the model.
- A 1911 authored alternate scenario that explicitly defines its own NATO-like institution remains authoritative.
- A 1066 great power can rank as `major-power` based on its relative material/strategic weight without needing modern GDP magnitudes.
- A future campaign may create, dissolve, join or leave institutions through canonical event/decision operations regardless of later real-world history.

## Dynamic power status
Every active polity resolves to exactly one visible tier:
- `major-power`
- `regional-power`
- `minor-power`

Round-Zero/generated tier is a baseline. Native campaign recalculation uses material capacity and actual strategic state, including GDP, population, nuclear capability, active conflict role, major agreements, institution membership, and especially institution leadership.

The system must be able to promote or demote emergent alternate-history actors without hard-coded names. Examples: a Baltic Union can become regionally important from its accumulated material/strategic state; Ukraine leading a consequential Lublin defense pact contributes more strategic weight than ordinary membership.

Tier evolution uses hysteresis. Repeated recalculation calls during one campaign round do not count as multiple sustained rounds. Ordinary regional powers must not automatically become major powers from GDP alone.

## Derived header badges
Country header badges project the current canonical world:
- exactly one power-tier badge is reserved for every polity
- political-system badges derive from Political Actors (`democratic`, `authoritarian`, `party-state`, `parliamentary`, etc.)
- formal membership badges derive from `world.institutions` (`nato-member`, `eu-member`, `csto-member`, etc.)
- open-vocabulary legacy descriptors such as `revisionist` and `nuclear` can coexist

Formal membership overrides weaker fuzzy alignment for the same institution. Example: canonical NATO-member Poland must show `nato-member`, not `nato-aligned`.

## Country Diplomacy UI
Country -> Diplomacy includes a `Formal institutions` section showing canonical institution name, type, membership status, role/leadership and join date where available. Header badges remain the compact high-signal projection; the Diplomacy tab carries the fuller roster.

## Objective diplomatic completeness
Canonical objective conflict facts may not coexist with a missing/benign relation solely because a producer omitted a relation update. Native reconciliation derives a minimum negative bilateral relation from:
- opposing sides in an active/ceasefire canonical war
- legal-sovereign vs de-facto-controller territorial disputes

This uses canonical ledger/map facts, never keyword/prose sentiment inference, and only pushes an existing relation more negative — never warmer. Thus a Russia-controlled / Ukraine-sovereign Crimea state cannot leave Russia-Ukraine with no tracked relationship.

## Political Decision Context / World Director
009A/009B consume current formal institution memberships/roles and current power tier as read-only geopolitical context. This does not add a new per-turn AI call. Native power recalculation is deterministic.

## Diplomatic chat resolution regression
The beta merge regressed Continuum's stable thread resolution for generated/event-based diplomacy. The player is implicit in stored diplomatic threads. Event output may redundantly include the player among `countries`, but that must not create a second participant set.

Required behavior:
- generated/event/idle/GM/advisor messages fold using stable save-aware polity identity
- player aliases/lineage are stripped from stored participants
- `[Latvia, Lithuania, Estonia]` while Latvia is player resolves to the same open channel as `[Lithuania, Estonia]`
- `[Latvia, Poland]` while Latvia is player resolves to the existing Poland 1:1 channel
- established thread id/title/status/history win; incoming messages append without erasing prior history
- ambiguous identities fail safe rather than being guessed/merged
- closed historical threads are not folded into a new negotiation
- Chat UI reads/writes through the same player-aware reconciliation path so legacy contaminated rows repair in memory and persist on a later ordinary write

## Non-goals
- No Political Actor historical-verifier redesign.
- No party-agenda evolution in this patch.
- No Round-Zero loading-screen/main-thread performance redesign; that remains a separately tracked TODO.
- No hard-coded Baltic Union/Lublin-pact power promotion.
- No freeform tags as canonical institution membership.

## Acceptance criteria
1. 202-polity baseline requires about five normal provider calls.
2. Scenario application survives fresh campaign seeding on desktop/web.
3. Every polity displays exactly one power tier.
4. Formal memberships replace same-root alignment badges.
5. Institution membership can change through structured event/decision operations and UI follows automatically.
6. Institution leadership materially contributes to dynamic strategic weight.
7. Objective war/territorial conflict produces matching negative relations.
8. Country Diplomacy displays formal memberships.
9. Event-generated chats cannot create player-self duplicate channels and preserve existing history.
10. No new verifier/sentinel pass is introduced.
11. Newly generated institutions cannot exist before their temporal start or after dissolution; structured authored institutions remain authoritative exceptions.
12. The baseline prompt contains no hard-coded modern institution menu.
13. Native power scoring is invariant to a common scaling of all scenario GDP/material units and therefore does not depend on modern absolute GDP thresholds.
14. Round-Zero institution/agreement baseline facts carry and validate their temporal start dates.

## Applied-baseline load performance invariant

Applying a geopolitical baseline must not make scenario/campaign loading scale quadratically with the number of polities and map regions. Read-only presentation/prompt paths must not normalize the entire `world.powerStatus` or `world.institutions` ledger separately for every country. Exact canonical polity keys are fast-pathed, institution badge projections are indexed once for all-country summaries, and save-wide polity identity indexes are reused within normalization passes. A 202-polity world with thousands of ownership records must remain bounded and must not trigger browser script-timeout termination merely because `world.powerStatus` / `world.institutions` are populated.
