# Provider-backed Statistics acceptance probe

**Scope:** Bounded Gemini diagnostic for the native Statistics causality contract. It is **not** a complete OpenHistoria turn, an alternative world simulation, or proof that production's entire `runJsonTask`/folded-time-skip pipeline has been exercised. It reuses production jump schema, schema salvage protections, canonical event ID allocation, storyline update decoder, national accounting admission, and native Statistics replay.

The executable is `scripts/gemini-stats-probe.mjs`; the pure evaluation module is `scripts/gemini-stats-probe-core.mjs`; focused tests are `src/runtime/geminiStatsProbe.test.js`.

## Supported modes (PowerShell)

From `C:\dev\open-historia-beta-current`:

```powershell
$game = "server/data/games/opossum-kingdom-v10-saved-state-session"
$log = Join-Path $env:LOCALAPPDATA "OpenHistoria\LiveDiagnostics"

# No network or credentials: emit a prompt-only report.
node scripts/gemini-stats-probe.mjs --game-dir $game --dry-run --out (Join-Path $log "stats-dry-run-new")

# Replay one archived provider response for free.
node scripts/gemini-stats-probe.mjs --game-dir $game --response-file (Join-Path $log "provider-run\provider.json") --out (Join-Path $log "stats-replay-new")

# Make ONE provider request with an externally prepared one-use credential file.
# Never supply the secret in a command argument, source file or chat-visible log.
node scripts/gemini-stats-probe.mjs --game-dir $game --key-file "C:\secure\temporary-key-file" --model gemini-3.5-flash-lite --transport tool --out (Join-Path $log "stats-live-new")

# Make ONE corrective provider request using a saved failed response and its
# precise current validator errors, not a full unrelated new turn.
node scripts/gemini-stats-probe.mjs --game-dir $game --key-file "C:\secure\temporary-key-file" --repair-archive (Join-Path $log "provider-run\provider.json") --focus-event "<existing-original-event-id>" --focus-country "<canonical-country-name>" --out (Join-Path $log "stats-repair-new")
```

A `--key-file` is read into process memory and **unlinked before the network request**. The file must be outside the game directory; the output directory must not already exist. For repeated attempts, provide a new temporary file. The probe never stores API keys in prompt, provider, result or source files, and it never writes the campaign. An archived response can be replayed without a key or paid request. Provider request budgets are intentionally explicit: one request per invocation, no hidden automatic retries.

Each report directory contains `prompt.json`, `provider.json` (including raw response but no authentication headers), `result.json`, and where available the validated payload and detached native diagnostic snapshot/Statistics report. **These files may contain private scenario and generated content**; keep them local or review before sharing. Full source/saves remain authoritative.

The corrective mode supplies the archived answer and **exact native validation errors** to the same Gemini function-declaration schema, then checks corrected date/title event continuity. A valid correction may still leave effects unquantified if evidence is insufficient. Neither a syntactically valid correction nor a single negative national receipt proves general economic contagion.

## Evidence from 2026-10-27

- The first real Opossum Gemini 3.5 Flash Lite provider request: HTTP 200, 3 generated events, **0** accepted negative country-level influences; the original diagnostic runner required IDs that production actually assigns. Replaying the archived answer with production `allocateCanonicalTurnEventIds` passed native settlement (zero accepted assessments).
- Focused Dyke-and-Rook League credit-crisis provider answer: HTTP 200, proposed a **−1.2 percentage-point annualized growth influence for 45 days**, linked to original event `event-ai-r0003-21270822-008`. Its *provider response was invalid*: two duplicate exposures for the same polity, `economicAccounting.reason` length **248** against the **240** maximum, and missing required `statsEffects.economicShockEstimate`. No national receipt was accepted.
- Production schema admission now lists all three concrete faults in one rejection. Production and this probe prohibit salvage from removing `economicAccounting` or an earlier-event `statsEffects` claim merely to make a narrated event appear valid.
- Two initial bounded corrective provider attempts returned HTTP **503 UNAVAILABLE** with no corrective payload. Later requests succeeded; see the live follow-up below. Each temporary credential file was deleted immediately.
- An explicitly **synthetic, offline, in-memory structural repair** of the *same archived proposal*—retaining the model-proposed −1.2-point estimate and its original credit evidence—passed native settlement for **one national negative influence**, **one original-event assessment** and **one accepted receipt**. This is an engine-capability check, **not provider acceptance**, and even that relatively small annualized adjustment does not force weekly GDP to decline.
- The original Opossum saved data and the previously committed Git tree remain unchanged by these provider attempts.

## Invariants and open release gates

The native economic writer remains authoritative: schema admission cannot create numbers; a previous historical disruption must be a real unique source event linked to the same active storyline and affected canonical country; an estimated loss remains a finite, bounded *simulation estimate*, not an observed GDP stock reduction. An AI response that cannot support it must remain explicitly unquantified. No automatic global recession multiplier, keyword-to-GDP mutation, invented affected country or replacement economic clock was added.

**Not yet demonstrated:** provider closure of the original unquantified August 22 event, accepted negative consequences across **multiple** countries of the Opossum financial collapse, full production AI retry/folded world-director parity; 1912 wartime date-sliced settlement; player-facing UI and real WebRTC smoke tests. Individual corrected provider-generated national economic influences have now passed native settlement, but Statistics V2 is **not** accepted as complete.

## Subsequent live-provider acceptance evidence — 2026-10-27

After the initial 503 outage, **three further Gemini 3.5 Flash Lite HTTP 200 requests** were made against the same untouched canonical Opossum save, all with fresh one-use credential files deleted after invocation.

The first correction was schema-valid but native-rejected because the model combined its explicit credit-crisis `economicShockEstimate` with **0.5% of GDP debt-financed relief borrowing** in the same `statsEffects`. A later second correction to that archived response was **native-settled**, retaining the model-generated −1.2 percentage-point annualized growth pressure for **45 days** in Dyke-and-Rook League, but omitting the exact historical `assessesUnquantifiedEventId`.

A separate fresh focused model request was native-rejected after generating an unrelated **0.005%-of-GDP outlay without `debtFinancedOutlayCause`** and a finite national growth effect. Its archived answer was replayed for free, exposing how salvage could otherwise remove the *whole* affected `polityChanges` entry. The generically fixed contract now (a) rejects every `economicShockEstimate` combined with an independently accounted national GDP/population/debt/strategic mutation; (b) rejects a fiscal outlay missing its paired cause, or an orphan cause without outlay; and (c) protects the **entire polity-change item and its statsEffects** inside an event declaring `economicAccounting.status="applied"`, as well as explicit historical assessment claims. These rules mirror existing native writer invariants without relaxing them.

The third live request, a correction of that fresh focused reply, was also **native-settled** with a provider-generated source-linked −1.2 percentage-point annualized estimate for **30 days**, without any invented fiscal outlay. Both successful outputs each produced one negative national influence and one native receipt (in **separate, disposable replays**, not stacked into one campaign). Neither supplied `assessesUnquantifiedEventId`, so **neither closed the existing original August 22 crisis event**. No inference-based closure was added. GDP still rose over the week even for the affected country because these annualized drags are smaller than its positive baseline.

Current diagnostic evidence is retained under `%LOCALAPPDATA%\OpenHistoria\LiveDiagnostics\opossum-focused-credit-repair-20261027-2022`, `opossum-credit-focused-fresh-20261027-2030`, `opossum-fresh-credit-corrected-20261027-2035` and the corresponding `opossum-*-preflight-*` archived-response replays. All requests returned safely to a separate report folder; no original save was mutated. The provider test remains headless native-only, **not** a complete production gameplay time skip.
