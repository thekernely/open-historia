# Native playtest runner (headless, offline)

**Status:** Deterministic native Statistics smoke-test harness. This is **not** an
AI-generated jump, naval/front simulation, event curator, politics/diplomacy
resolver, UI/browser smoke test, or importable complete campaign save.

## Why this exists

A developer should be able to test actual canonical Statistics behavior in a
real campaign without manually advancing the UI or modifying that campaign.
This runner imports the same `planNativeStatsLiveTurn`,
`applyEventImpactsToWorld`, and native coverage reader used by the game.
It does **not** reimplement GDP or economic accounting.

It reads the existing campaign folder or a JSON
`open-historia-game-bundle/1` export. The input is never overwritten,
reimported, selected in the UI, moved, or deleted. No network or provider code
is invoked. Output consists of an isolated report and a **diagnostic-only**
native snapshot, neither of which should be imported as a fully resolved game.

## Commands (PowerShell)

From `C:\dev\open-historia-beta-current`:

```powershell
$game = "server/data/games/opossum-kingdom-v10-saved-state-session"
$out = Join-Path $env:LOCALAPPDATA "OpenHistoria\LiveDiagnostics\opossum-native-2127-11-09-example"
node scripts/native-playtest.mjs --game-dir $game --days 7 --out $out
```

To **replay an actual saved AI turn** from a native rollback snapshot, and
independently verify the economic result against the campaign's saved state:

```powershell
$game = "server/data/games/opossum-kingdom-v10-saved-state-session"
$snapshot = Join-Path $game "storage/snapshots/snap-4-1793110064119.json"
$out = Join-Path $env:LOCALAPPDATA "OpenHistoria\LiveDiagnostics\opossum-replay-new-folder"
node scripts/native-playtest.mjs --snapshot $snapshot --compare-game-dir $game --out $out
```

A completed comparison writes `comparison.json` with the exact country
coverage, GDP and unemployment differences (and cursor differences); it
reports `pass` only when all expected fields match at canonical precision.
Mismatch output is retained for diagnosis and the CLI exits with status 2.
This replays the **previously accepted** events, not a new provider answer.
Other areas of the finished game are not compared.

For a user-exported JSON game bundle (not a ZIP):

```powershell
node scripts/native-playtest.mjs --bundle "C:\path\to\exported-bundle.json" --days 7 --out "C:\path\to\new-report"
```

To **replay supplied events**, instead of only the native baseline clock,
prepare a separate, explicitly test-only JSON fixture such as:

```json
{
  "toDate": "2127-11-09",
  "events": []
}
```

Then:

```powershell
node scripts/native-playtest.mjs --game-dir $game --turn "C:\path\to\turn-fixture.json" --out "C:\path\to\different-report"
```

The fixture can contain real dated canonical event objects with
`polityChanges[].statsEffects`; native accounting/source/receipt admission
and date ordering are honored. You may instead supply
`generatedPayload` containing a complete generated jump answer. The full
gameplay schema must accept that payload before events reach the reducer.
An empty `events` list is a **no-event native baseline**; it is not an AI
assessment of the crisis.

## Guarded wartime neutral-only acceptance (1912)

When a real campaign has ongoing wars but no **independently verified naval
report**, full-country Statistics settlement is **not authorized**. An explicit
`--neutral-scope true` permits exactly the same `planNeutralStatsLiveTurn`
fallback used by production. It calculates only canonical nonbelligerent
countries and leaves wartime combatants' economic accounts to the production
war/legacy writer. This does not synthesize missing blockade results.

```powershell
$game = "server/data/games/1912-a-world-in-balance-session"
$out = Join-Path $env:LOCALAPPDATA "OpenHistoria\LiveDiagnostics\1912-neutral-new-folder"
node scripts/native-playtest.mjs --game-dir $game --days 7 --neutral-scope true --out $out
```

**Verified actual saved campaign:** January 1 to January 8, 1912, 79
national Statistics sheets, active Italo-Turkish War. **77/79** countries
advanced by the native neutral-scope clock. The **Kingdom of Italy** and
**Ottoman Empire** were explicitly excluded: they are **not** claimed to have
been settled or exposed to zero naval pressure. The separately established
Austrian Empire display-name migration to Austria-Hungary was preserved; it is
not a third wartime exclusion.

The report sets `partial=true`, `mode="native-neutral-scope-only"`,
`nativeSettledCountryCount=77`, names both
`notNativeSettledCountries`, and marks individual country rows with
`nativeSettled`. Whole-world all-GDP-increased/all-unemployment-decreased
observations are explicitly false for a partial run. The CLI refuses full
saved-game economic comparison on a partial result because it cannot check
an excluded belligerent's legacy-war settlement against a native-only replay.

Native source security also now requires a purported war participant to be
established **independently of the war record itself**. The general Political
World roster includes names found in active wars, so validating war sides
against that entire roster was circular and could authorize an invented
belligerent. `statsNeutralTurnClock.js` builds its eligibility list without
war-derived membership and fails closed on unknown participants, including
ones with stray legacy countryStats rows.

**Still open:** complete wartime maritime/naval-blockade outcomes for Italy and
the Ottoman Empire, day-sliced economic consequences and comparison with an
actual provider-generated full-war turn. The saved 1912 campaign contains no
dated naval observation for that future turn, so none has been fabricated.
The original saved state is never modified.

## Output

- `report.json` — from/to dates, sheet counts, accepted event counts, new
  native Statistics receipts, per-country GDP and unemployment changes,
  coverage warnings, and deterministic hashes.
- `comparison.json` (when `--compare-game-dir` is supplied) — independently
  checks every country's GDP (within €0.01), unemployment (within 0.0001
  points), and native clock cursor against an existing saved campaign.
- `native-snapshot.json` — detached economic output for offline inspection.
  **Diagnostic only**: not a valid full UI game save, because diplomacy,
  history folding, wars/fronts, actions, projects, messaging and state
  publication are not handled here.

Every result explicitly identifies itself as `native-stats-only`, with
`providerCalled=false` and `fullGameplayTurn=false`.

## Safety / limitations

- The output directory must not exist and must be **outside the input folder**.
  The runner refuses overwrite, negative or invalid dates, duplicate event
  IDs, invalid economic accounting, unsupported event schema, lack of
  initialized Stats, and a native chronology it cannot prove complete.
- War, blockade or naval transition cases may fail closed because their native
  chronology requires additional engine reports. Do **not** interpret that as
  the scenario being invalid, or silently run a peaceful fallback.
- Native no-event GDP growth and falling unemployment are **observations**,
  not a passed financial-contagion acceptance test. The Opossum 2127 live AI
  problem still requires actual accepted provider output and national causal
  evidence; no GDP penalties are fabricated.
- The runner does **not** read provider API keys, make paid requests, control a
  GUI, or access cloud services. Real end-to-end provider/browser automation
  requires an additional, verified integration with explicit user approval.
- No original campaign save is ever written. The file-system CLI refuses
  output inside the source directory; the pure core function tests input
  nonmutation and exact deterministic replay.

## Verification

The focused regression suite in
`src/runtime/nativePlaytestHarness.test.js` exercises native seven-day
Statistics advance, dated event effects with unrelated country isolation,
replay determinism, original-file hash preservation, bundle imports, fail-
closed wartime chronology, invalid economic declarations, duplicate IDs, and
non-overwrite output rules. The actual Opossum campaign folder was run once
for **2127-11-02 to 2127-11-09** with no AI events: 47 initialized country
Statistics sheets reached the target cursor; all 47 had rising GDP and falling
unemployment; 60 unresolved crisis associations remained evidence-pending
(no confirmed structured exposure, no accepted national estimate). This is a
baseline diagnosis only, not a financial-collapse causality success.

**Stronger actual rollback replay:** The existing Opossum
`snap-4-1793110064119.json` contains the pre-turn state on 2127-10-26
and **three already accepted AI events** for the following week.
`--snapshot` replayed them using real native event settlement and compared
the output with the saved game on 2127-11-02: **47/47 GDP values, 47/47
unemployment values, and 47/47 native clock dates matched**, zero
mismatches. No provider request, save edit, UI action, or fabricated national
loss was involved. This verifies **native economic replay parity for that
specific accepted turn**; it does not prove full game/narrative equivalence.
