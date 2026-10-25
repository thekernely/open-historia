# P3B2 candidate - event/reducer settlement and dated demographic anchors (2026-10-22)

**Status: Windows candidate, NOT installed, NOT release-accepted.** P3B1's source-only planner below is preserved as historical design evidence. P3B2 adds one catalog-backed, validated title-and-Statistics transaction in `applyEventImpactsToWorld` and propagates the catalog through ordinary gameplay, Game Master Apply, manual annexation/region editing, staged previews, project-board event carriers, war/peace settlement, and host-authoritative multiplayer diplomacy. A failed crosswalk aborts the detached event mutation; no previous campaign is rebaselined. A country with only legacy/unmapped sheets retains map-only semantics unless a measured counterparty would be made inconsistent.

The planner conserves exact component residents and component-based GDP, refuses ambiguous region/component names and malformed map identity, guards operational military reservations and unstarted migration-plan anchors, and distinguishes de facto control from legal sovereignty. It does **not** create absent territory values or assign a new polity invented debt, unemployment, inflation, birth/death assumptions, or a ready Political World.

**Demography:** Active finite `demographicClock` segments may be re-anchored at the next uncredited civil day after a legal transfer, retaining previous receipts and author-specified rates, with at most 32 dated rebase entries. A mismatched/unsynchronized clock rejects publication; a landless country's live clock requires explicit dissolution in the same event. An authored `demographicEvolution` model not yet activated has a different first-start anchor and is blocked pending an explicit reanchor contract. An already active evolution model may continue from its canonical current population if its cursor is synchronized. Unstarted migration plans whose anchors would become invalid also reject the transfer instead of silently skipping transfers later.

**Important remaining gates:** The native positive-blockade daily-chronology path currently excludes events with `regionTransfers`, so a combined positive blockade + legal succession + active demographic clock may fail closed rather than settle; do not disable that guard. The affected fiscal/output baselines, nation-wide dissolution and history/Undo in a real campaign, UI regional selection, mixed sovereign/control cases, multiplayer privacy, author-review conflicts and comprehensive historical scenario calibration still require review. Positive-blockade plus territorial transfer is **not claimed implemented**. Performance and real long skips are NOT measured for this candidate. Repeated authoring in legacy scenes can reveal missing catalog metadata that must be reported for author review, not guessed.

**QA:** Pure planner, finite demography and adjacent selected runtime tests pass in the dependency-filtered source workspace, but real `gameState`/war-peace/host integration tests cannot import the missing `pmtiles` dependency there. Windows validation requires those focused tests, `npm.cmd test`, desktop/web builds, `git diff --check`, and automated persistence/Undo/long-vs-split checks. No manual campaign is requested before consolidated release acceptance. No public Beta, Continuum, Alpha or user Git mutation has occurred.

---

# Statistics V2 - legal territorial component reconciliation (P3B1 foundation)

**2026-10-22.** Source-tested preparatory contract only. This module is **not wired into game-state publication** and therefore does **not** claim that annexation, independence, peace settlement, region inspector, or staged events currently reconcile Statistics. No scenario or saved campaign was migrated.

## Why the foundation exists

`world.regionOwnershipOverrides` describes control, while sparse `regionSovereigntyOverrides` records a lawful title different from the controller. A legal `regionTransfers` operation changes the lawful sovereign. `world.countryStats[polity].territorialComponents` still owns its own resident and per-capita GDP values. Without an explicit coupled mutation, an annexation can move map borders yet leave the residents and production booked to the former sovereign. De-facto occupation and claims must not transfer these values.

`src/runtime/territorialStatsReconciliation.js` is a **pure planner**:

- Accepts an explicit authoritative catalog with stable map `id`, original owner, and geography name. A transfer names the exact `regionId` and cannot authorize itself merely by claiming a matching `regionName`.
- Requires unique region IDs, uniquely matched map/component names, and the pre-transfer lawful sovereign. Treats occupier and sovereign as different parties, including a treaty cession during foreign occupation.
- Moves the **existing** component, including its unchanged resident count and GDP-per-capita value, into the receiving polity's canonical Stats ledger. No invented initial debt, rates or indices for new polities. Conserves headcount exactly and component-based GDP within floating-point tolerance.
- Rejects duplicate transfers, unknown IDs, ambiguous geography, bad counterparty identity, and transfers into partial legacy GDP sheets that cannot be reconciled. Leaves the caller's original state unchanged on any error.
- Treats a region already legally held by the recipient as a no-op. Supports complete loss of legal territorial holdings with zero represented residents and **no** phantom territorial GDP.
- Returns planned countryStats plus a movement summary; it does **not** touch the map, war ledger, event receipts, migration plans or saves.

## Mandatory integration work before enabling runtime publication

1. **Canonical map catalog availability:** all callers must supply the same validated region ID/name/owner crosswalk. The normal jump path has an async map loader, but the following also call `applyEventImpactsToWorld`: GM Apply, Cheats annex and Region Inspector, peace settlement `makePeace`, board/project completion effects, `viewAsSeen`, and the timeline's synchronous staged previews. A one-path-only integration would make previews, admin operations, peace and live state disagree. Do not assume `regionName` in an AI payload is an authoritative map crosswalk.
2. **Atomic ownership:** run the planner with legal transfers before publishing the detached event state, and commit region sovereignty/control, both country Stats sheets, events and any polity lifecycle changes together. A failed crosswalk must fail closed before a transfer can be narrated as settled. Preserve existing war/occupation/claim routing and lawful `fromCode` semantics.
3. **Clock continuity:** baseline anchoring for finite demographic/evolution, migration-flow dates/cursors, fiscal and native macroeconomic clocks must be reconciled after a legal population/territory change. Neither retaining stale population anchors nor silently assuming rates for a newly founded country is acceptable. Test long-vs-split steps across mid-turn transfer dates, same-day `statsEffects`, production ramps, save/reload/Undo, player-focused history and host projection.
4. **Legacy and scenario data:** intentionally sparse/legacy/unmapped sheets need explicit compatibility choices, not a blanket forced GDP baseline. Existing 1912/Modern Day scenario exports and played saves remain untouched. The 1912 source's large geography-name ledger requires unique catalog matches; any ambiguous name is a review item, not permission to guess or divide national totals evenly.
5. **UI:** regional population/GDP in the selected-region panel should read the identical component used in legal reconciliation. It should say unavailable when referential matching fails rather than presenting fabricated precision.

## Source QA and remaining Windows gates

`node --test src/runtime/territorialStatsReconciliation.test.js` exercises 14 contract cases on the actual modern Beta P3A-extracted source. The module is not yet reached by the game-state reducer and does not modify player-visible rules. After wiring, run specific game-state territory/occupation/peace/GM/preview tests, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run build:web`, state reload/Undo, and one consolidated live acceptance pass. Until then territorial succession **remains a known integration gap** and Statistics V2 release gate stays NOT PASS.
