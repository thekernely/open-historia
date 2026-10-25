# Statistics V2 national dashboard - opt-in authoring candidate

**Prepared:** 2026-10-22. **Status:** dependency-filtered source-tested UI candidate, not Windows-build or live-browser accepted. Preserve the unmodified legacy player Statistics layout until a scenario author explicitly enables `stats.json.dashboard`.

## Canonical boundary

- `world.countryStats` owns national economy and demographics; this dashboard is read-only presentation metadata in scenario-owned `stats.json`. The same `native:gdp` source may have multiple widgets without copying or writing GDP. `custom:<key>` resolves ONLY to an existing independently authored custom national metric in a custom sheet; a native-bound card cannot be misrepresented as a writable custom stat.
- A standard sheet (`custom:false`) may define a dashboard without requiring a custom Stats sheet. Old files without `dashboard` load and render using the previous screens. Do not add empty modern economic baselines to medieval/fictional scenarios simply to display a widget.
- `version:1`, maximum 48 widgets (expanded to leave author headroom beyond the 31-card classic preset), six-column authoring grid. Each widget: unique `id`, `source`, `style` (`value|bar|trend|heading|change|intelligence|breakdown|military`), `page` (`overview|details`), integer `x,y,w,h` (standard tiles 1-6 wide, 1-4 high; fixed six-row military system view) and optional display-only `label`. Explicit unknown sources/invalid geometry/collisions fail validation before save. Hidden from the dashboard means absent from that presentation, **not** removed from canonical simulation.
- Rendering shares `StatsDashboard.jsx` across scenario preview and player Country Panel. Responsive 6/3/2-column projection is deterministic, non-overlapping and does not mutate the authored grid. A trend chart reads dated campaign observations only; fewer than two points show unavailable history, not a fabricated chart.
- Editor uses actual pointer dragging/resizing with snapped six-column placement previews and invalid collision feedback. Keyboard buttons and controls offer moves, width/height adjustment, details/overview assignment, Undo and removal. The editor preview's example values are explicitly illustrative, not initial scenario data.

## Integration and acceptance

- Scenario Editor: `StatsDashboardEditor.jsx` writes only scenario presentation metadata through the existing Stats asset editor and save door. Native metric UI selection never creates custom numeric values. A default standard-sheet dashboard includes GDP, population, unemployment, debt and stability in the screenshot-inspired hierarchy; scenario authors can replace it.
- Player: `stats.jsx` displays opt-in overview/details dashboard while preserving the existing Military Card, Advanced Statistics, historical tracking and all other tabs. Scenarios with no dashboard continue to use their previous standard/custom panel.
- Automated source tests verify normalizer schema, collisions, repeated canonical binding, responsive projection, legacy collision review, opt-in serialization and static UI/save integration. **Windows full npm test/build/build:web and browser pointer/keyboard/touch/localization QA are NOT yet observed.** Do not claim feature completion based solely on source tests.
- Release follow-ups: full 22-language translations for new labels and controls, browser UX across Country Panel widths/RTL/reduced-motion, scenario export/import/new-game reload, keyboard focus and screen-reader quality, time/history chart performance and multi-device layout. Existing positive naval pressure plus mid-turn legal transfer still deliberately remains outside the native dated writer without trustworthy coupled evidence.

## P4A R2 - visual authoring correction (2026-10-22 source candidate)

The first P4A screenshot exposed a misleading full-width editor preview,
indistinguishable GDP number/chart widgets, and row after row of form controls.
The revised editor adds a separate 345px *player-width preview* using the same
read-only renderer and *illustrative, explicitly unsaved* dated observations.
The actual campaign renderer never fabricates missing history.

Cards move by dragging their surface and resize from right, bottom, or corner
edges. Resizing selects one of a small number of readable grid footprints,
not arbitrary pixel dimensions. Selection reveals a compact property panel
with keyboard move/size alternatives; controls are not baked into every card.
Legacy P4A grid dimensions remain readable and are not rebaselined. The default
modern Statistics view retains the GDP-leading hierarchy and may show existing
canonical strategic indices, including economic independence and food/energy
autonomy, directly from countryStats.indices. Missing facts remain missing.

Progress bars require bounded 0-100 percentage or index sources. Existing
P4A GDP-as-progress-bar cards are retained for author review, but the renderer
shows why they cannot display meaningful progress instead of fabricating a
percentage. Source tests are not browser interaction evidence.

Known remaining work: browser/touch drag checks, 22-language localization,
responsive and keyboard QA, scenario save/export/new-campaign/reload, and
combined positive-blockade/territorial chronology (still guarded).

## P4A R3 - classic-composition and localization candidate (2026-10-23)

The 22 October in-game screenshots exposed a functional layout mismatch:
although the authored grid is six columns, the player projection at the
Country Panel's normal width (~345px) collapsed to two columns. Three
supporting metrics consequently wrapped instead of forming the old compact
population/unemployment/debt strip. R3 retains six logical columns at 300px+
and only reflows for genuinely narrower panels. At full width, author-defined
row positions remain intact instead of being greedily repacked.

The grid now includes **presentation-only section headings** (no metric
source, mandatory bounded title and full-row footprint) and a **recorded
change** card (same canonical metric source, requires two actual dated
observations; otherwise shows baseline reading). National-condition progress
bars render as compact full-width rows instead of tall number cards. The
classic layout preset consists of GDP hero, three supporting number readings,
National condition heading, stability and autonomy bars, and Change. Authors
can apply this preset via the editor's "Classic layout" action with Undo;
previously authored P4A/P4A-R2 layouts remain accepted and are not replaced
without author action. A scenario without any dashboard remains on the legacy
player panel. The player's military information remains reachable on the
Statistics Details page when an authored dashboard is enabled.

The editor includes the same canonical card renderer at player-panel width,
plus illustrative examples of the Advanced Statistics/history access controls
that still belong to the surrounding player UI. The sample GDP history is
explicitly unsaved; actual campaigns never synthesize historical values.

The two reported Windows test failures are fixed in source by adding the
four reported dashboard-derived strings to the English catalog and providing
nonempty, localized Position/Size/Tab controls in all 22 shipped packs.
Neither catalog enforcement nor institution-translation coverage is weakened.
Full Windows catalog extraction, browser resize/drag, save/export/import,
RTL/accessibility and production builds remain required before UI acceptance.


## P4A R4 - direct visual editing and scoped shortcuts (source candidate)

R4 keeps the accepted six-column classic Overview/Details, same shared player/editor
renderer and canonical metric references. A single selected card may change its
metric binding (for example GDP to GDP per capita), presentation, bounded accent
or preset grid size without deletion/recreation. Accents are allowlisted
`auto|neutral|green|blue|amber|red` presentation tokens, not arbitrary CSS or
new national data. Pasted cards receive new widget IDs, but preserve the original
source reference, not an independent numeric ledger. Direct same-footprint
collisions may swap two cards atomically; other collisions still fail closed.

The editing canvas handles Ctrl/Cmd+Z (Undo), Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z
(Redo), Ctrl/Cmd+C/X/V (internal widget clipboard, not OS text clipboard),
Ctrl/Cmd+D (duplicate), Delete/Backspace, Escape and arrow-key move/resize.
The editor only intercepts shortcuts while a dashboard card/canvas owns focus;
text fields, select menus, browser actions elsewhere and the running campaign's
Undo are not intercepted. Each complete pointer move/resize records one Undo
step, and completing a new action clears Redo. Pointer resize handles forward
their own move/up/cancel events. The selected card gets contextual settings
while the advanced custom-metric definition editor is visually nested in the
same dashboard workspace. Movement receives a brief motion treatment, suppressed
by prefers-reduced-motion. R4 does not generate history, modify existing saves,
or change native Statistics semantics.

**Acceptance evidence:** pure schema/placement and source-wiring checks must
pass, followed by Windows full suite and both builds. Browser QA remains
necessary for actual pointer capture, key focus, smoothness, screen reader and
touch. This description is a candidate, not verified production behavior.


## P4A R5 - complete native Details and military reuse (2026-10-23 candidate)

The former classic Details had only GDP/capita and inflation. The R5 classic
preset retains the screenshot-inspired Overview and expands Details to 21
widgets: national stability, live intelligence service, six canonical strategic
indices, population, the seven existing native economy readings, the recorded
GDP sector breakdown and an integrated military card. Overview (10 widgets)
and Details (21 widgets) together require 31 places. For practical custom
scenario authoring, the bounded dashboard capacity increases from 32 to 48;
all identity, placement, source-ownership and collision validation remains strict.
No existing authored layouts are automatically replaced: authors explicitly
select the Classic preset to adopt the expanded Details.

The three special modules are not `countryStats` metric bindings:
`system:intelligence` projects the existing live intelligence rating,
`system:gdpBreakdown` reads the scenario's GDP-sector state without inventing
shares, and `system:military` hosts the pre-existing `MilitaryCard` (which uses
the same military profile as Ranking and preserves its lazy rating path).
System cards have strictly paired `style/source` identities, fixed full-width
footprints and cannot be silently converted into a fake writable statistic.
Existing dashboard configurations without a military widget retain the legacy
military card on the player Details page. The editor uses explicitly
illustrative military values; the player never falls back to that fixture.

Verification caution: the source ZIP used Windows backslash paths, which had
to be normalized during extraction. After correction, the imported modules are
present and the selected dashboard/metric and localization coverage tests pass.
The full catalog extractor still needs its npm Babel dependencies; both real
Windows builds and browser behavior must be verified after installation.
A short UI Details inspection is necessary before the consolidated playtest.

## Scenario-approved starting baselines - lifecycle correction (2026-10-23 candidate)

`world.countryStats` is the canonical campaign numeric state. New games copy the
reviewed scenario `world.countryStats` at creation; changing a scenario later does
**not** overwrite an existing campaign. The Statistics player loader must display
an already-complete, valid starting sheet without converting a missing legacy
population-calibration marker into permission to ask the AI to estimate it again.

Newly reviewed/generated or manually edited mapped starting baselines carry
`continuity.scenarioBaseline = { version: 1, source: "scenario-author-reviewed",
date: <scenario start date> }`, a **native provenance marker**, not a claim that
`populationCalibrationVersion` ran. The AI generation wire schema cannot author
this marker. Older saved 1912-style scenario sheets without the marker may also
be recognized at the exact campaign starting date when they have a fully native-
validated scenario-authored `demographicEvolution` clock anchored to that same
start date and to the exact sheet population. A complete but unmarked legacy
sheet without that evidence retains its old start-only calibration audit. The
independent ambiguous-64-component legacy audit always remains active. Invalid
or incomplete saved sheets are still rejected, and explicit hard reassessment
remains available.

This only governs **existing game sheets**. If a game was created before an
author later generated the scenario baselines, those new values are not
silently imported into the older save. An explicit reviewable import/migration
is a separate future decision, not part of this correction. Source tests and
1912 export checks are not substitutes for the user-run Windows suite/build
and in-game opening of an already populated Country > Economy panel.


## Scenario-wide economic comparability review (2026-10-23, candidate)

The **Scenario Editor starting Statistics generator** is a distinct tool from
in-game `generateCountryStatSheet`. The earlier scenario-authoring path generated
up to three countries per request without a common, explicit accounting-unit
instruction or an audit against previously saved countries. Exact territorial
sums did not establish economically meaningful cross-country comparability.

- Every generation batch now declares one common **constant 2026 EUR equivalent
  nominal-output basis, not PPP**. This is an accounting convention, not an
  authoritative historical datum or permission to fabricate national accounts.
- A pure native cross-country review examines *both* existing authored sheets
  and pending valid proposals. Where at least two countries have populations
  of one million or more, at least one has ten million or more, and their GDP
  per person differs by eightfold or more, it raises an **economic comparability
  review** warning. This is a screening threshold, **not** a historical-law
  invariant and **not** an automatic rejection: genuine income gaps can be large.
- The author sees bounded top comparisons, can export every flagged pair to a
  CSV file for external research, and must explicitly acknowledge unusual comparisons affecting selected proposals or manually edited countries
  before saving. The warning never silently rescales GDP, population or region
  outputs. Reconciliation and region-identity validators remain unchanged.
- A scenario lacking comparable economic readings (including scenarios that
  deliberately use nonmonetary custom Statistics) gets no inferred GDP or zero.
- The 1912 Russia/Australia and Russia/Germany differences are **regression
  examples**, not country-specific code or proof that either value is correct.
  The same native screening applies irrespective of start year and polity name.

**Still open / required for historical accuracy:** the current scenario-authoring
schema still requires quantitative national GDP on its standard mapped sheet,
including premodern scenarios with poor evidence. The warning system alone
cannot establish reliable medieval or alternate-history baselines. A future
version needs independently documented scenario-wide anchors with confidence,
price convention, legal territorial scope, divergence provenance and explicit
unsupported/unset behavior where GDP is not defensible. Source-backed
country-level figures and region distributions must be reviewed before any
mass correction to an approved scenario. Do not describe this screening pass as
full historical calibration or automatic economic repair.


## Native live Statistics in worlds with unrelated wars (2026-10-23 candidate)

The complete native dated GDP/fiscal turn writer still rejects ambiguous naval
pressure, war transitions, and land-control changes for involved polities. A
separate, explicit **non-belligerent scoped chronology** now allows countries
with no causal military/occupation/blockade exposure in the accepted turn to
accrue deterministic civil days and emit real month-end history. Its safe list
is derived from canonical war rosters, war updates, event combatants, active
fronts, occupation flips and blockade targets; unknown identities fail closed.
Connected migration flows are never split across native/legacy writers.

The original war-blockade and periodic legacy writer remains authoritative for
excluded countries, and no inferred wartime months are backfilled into older
campaign saves. 1912 game-export evidence: Germany had only a January baseline
and December year-end sample after one 365-day wartime skip, with an unadvanced
demographicEvolution cursor. This is a regression fixture for future wartime
completion; it is **not** permission to fabricate intermediate observations.
When a legacy year-end save has a real matching final observation but its
`demographicEvolution.lastDate` remains behind, native settlement can hand
ownership forward at that exact saved date. It never credits missing historical
days or invents monthly snapshots. This handoff requires exact national and
territorial population agreement and refuses existing native clocks, pending
demographic adjustments, or stale migration cursors. The bounded original
scenario birth/death rates are reused for future accrual only.
The neutral split is a scoped recovery, not full wartime naval chronology.

## Finite economic event influences (2026-10-24 candidate, not release-approved)

An accepted event may now carry a typed `polityChanges[].statsEffects`
`annualRealGrowthDelta` (signed annual real-growth percentage points),
`durationDays` (1-730), `gdpCause` (production/trade/policy) and a bounded
evidence-based `reason`. The native reducer persists an event-ID-linked finite
`continuity.economicInfluences` record, plus a receipt for the accepted
process. The native daily macroeconomic clock applies that explicitly authored
rate only inside its authorized dates and reverts to the baseline dynamics
after expiration. Source tests check long-skip versus monthly-skip equality
and refuse malformed, duplicate or unbounded plans. No new AI request or random
monthly fluctuation is introduced. This capability is only effective when the
accepted event actually supplies a validated numerical effect.

**Outstanding release blockers remain:** the 1912 playtest's generated
material economy events contained no `statsEffects`; updating the output
schema/prompt alone does not establish generation compliance. The active
Italo-Turkish belligerents also remain outside the scoped native calendar
because dated occupation changes and naval completeness are not yet safely
co-owned by one GDP/fiscal settlement. Neither blocked path may be treated as
zero damage or silently represented as fully settled. Dedicated browser
playtests, native event-contract enforcement, full wartime calendar and
real-save persistence are still required before Statistics V2 release.

## 2026-10-24 - Generated economic event accountability candidate

A generated `jumpForward`/`autoJumpForward` event tagged `Economy`, or any
generated event carrying `polityChanges[].statsEffects`, must supply a
validated `economicAccounting` object with a specific 12-240 character reason
and one state:

- `applied` requires an actual typed Stats effect in its accepted event impacts.
- `unquantified` records a real but unmeasured economic consequence, without
  changing GDP/population; it requires later evidence before numerical mutation.
- `none` records an economic discussion, proposal, or non-measurable item without
  a canonical Statistics mutation.

These declarations are persisted on events and summarized in turn diagnostics;
only existing typed effects may modify `world.countryStats` and emit
`statsEventReceipts`. Old saved events and manually written Game Master
transactions retain their previous compatibility. This adds a strict native
acceptance test, not a prompt-only rule, and does **not** infer GDP deltas
from narrative words. A source-level replay must verify the transport,
normalization, native reducer and stored receipts on Windows; filtered-source
tests cannot exercise the full reducer because `pmtiles` is missing.

**Release remains blocked.** Belligerent monthly settlement still needs the
dated naval/occupation/legal-transfer integration; this candidate neither
turns missing naval evidence into zero pressure nor advances excluded
belligerents. It also does not make unquantified economic events automatically
produce numbers. Continue review against the retained March 1912 save fixture.


## 2026-10-24 - Dated coastal control and wartime calendar candidate

A front can transfer occupation control without transferring legal sovereignty.
The naval engine now takes bounded **dated region-ID control receipts** and
recomputes the coastline and land-border exposure on their actual days, rather
than representing an entire contested turn with its opening map. Naval pressure
remains sparse daily evidence backed by complete monthly and legacy aggregates.
Missing geography, contradicting control transitions, changed war rosters,
non-region/group control, and unmatched event/front receipts still fail closed.
An exact duplicate receipt from the front and its event is de-duplicated without
applying the same capture twice.

The full native GDP/fiscal/demographic writer can include the belligerents only
when the naval evidence validates **and** a read-only region catalog supports a
complete legal territorial join for the changing controllers. The live turn
caller provides that catalog when front-control changes occur; native macro
calculations can then recognize occupied output access at event/month boundaries
without assigning territory or changing authored sovereign GDP by inference.
A positive verified naval day is charged once by the existing native economic
writer; the original whole-turn blockade writer is bypassed on full cutover.

**Still outside scope:** new/ending wars during the same turn, unsupported
non-region control operations, legal territorial transfers under active naval
pressure, and maps whose regional Stats components cannot be reconciled.
Those cases retain scoped neutral settlement/legacy safeguards and are NOT
certified as completed wartime GDP. The generated-event `unquantified` outcome
also remains informational, not a numerical change. Windows full-suite,
production-build and real-save wartime browser checks remain release gates.
