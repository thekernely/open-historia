import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gameplay = await readFile(new URL("./gameplay.js", import.meta.url), "utf8");
const timeUi = await readFile(new URL("../GameUI/time.jsx", import.meta.url), "utf8");
const mainUi = await readFile(new URL("../GameUI/main.jsx", import.meta.url), "utf8");

test("pregame bootstrap no longer treats any event or generic history entry as completion", () => {
  const start = gameplay.indexOf("export const maybeGeneratePregameHistory");
  const end = gameplay.indexOf("// ---- Idle diplomacy drip", start);
  const block = gameplay.slice(start, end);
  assert.doesNotMatch(block, /normalizeEvents\(bundle\.events\)\.length\s*>\s*0/);
  assert.doesNotMatch(block, /simulationHistory[^\n]*length\s*>\s*0/);
  assert.match(block, /isPregameBootstrapPending/);
  assert.match(block, /mergePregameEventLogs/);
  assert.match(block, /mergePregameSimulationHistory/);
});

test("timeline UI keys Round Zero to the explicit bootstrap state rather than an empty event ledger", () => {
  assert.match(timeUi, /isPregameBootstrapPending\(\{ game: gameData, world: worldState \}\)/);
  assert.doesNotMatch(timeUi, /\(events\?\.length \?\? 0\) === 0/);
});

test("timeline UI reacts when the main menu closes instead of relying on a stale module read", () => {
  assert.match(timeUi, /useMainMenuOpen\(\)/);
  assert.match(timeUi, /\[gameData, worldState, events, mainMenuOpen\]/);
  assert.doesNotMatch(timeUi, /isMainMenuOpen\(\)/);
});

test("a transient Round-Zero failure is retryable and never latched as permanently attempted", () => {
  assert.match(timeUi, /pregameInFlightRef/);
  assert.match(timeUi, /pregameRetryStateRef/);
  assert.match(timeUi, /retryAfter/);
  assert.match(timeUi, /finally\(\(\) => \{\s*pregameInFlightRef\.current = false;/s);
  assert.doesNotMatch(timeUi, /pregameAttemptedRef/);
});

test("idle world pulse cannot run while the main menu is open", () => {
  assert.match(mainUi, /if \(hasNoGames \|\| mainMenuOpen\) return undefined;/);
  assert.match(mainUi, /\[hasNoGames, mainMenuOpen\]/);
});

test("idle world pulse also refuses to mutate a campaign whose Round Zero is pending", () => {
  const start = gameplay.indexOf("export const maybeSendIdleDiplomacy");
  const end = gameplay.indexOf("export const maybeRunIdlePulse", start);
  const block = gameplay.slice(start, end);
  assert.match(block, /isPregameBootstrapPending\(\{ game: bundle\.game, world: bundle\.world \}\)/);
});

test("Round Zero tells the provider to use shallow JSON-string transport fields", () => {
  assert.match(gameplay, /required tool fields are eventsJson, summary, and canonicalUpdatesJson/);
  assert.match(gameplay, /Call the required tool with eventsJson and canonicalUpdatesJson as valid JSON array strings/);
  assert.match(gameplay, /decodePregameHistoryTransportPayload/);
});


test("Round Zero live directive speaks the released-beta timeline event contract", () => {
  assert.match(gameplay, /CURRENT TIMELINE EVENT CONTRACT \(released-beta compatibility\)/);
  assert.match(gameplay, /importance is ALWAYS a STRING and MUST be exactly "minor" or "major"/);
  assert.match(gameplay, /Military, Diplomacy, Economy, Politics, Culture, Disaster/);
  assert.match(gameplay, /Pre-game events have NO impacts\/effects\/changes object/);
});

test("Round Zero applies exact-date temporal guards to institutions and standing agreements", () => {
  assert.match(gameplay, /TEMPORAL AUTHORITY/);
  assert.match(gameplay, /date=institution founding\/establishment date/);
  assert.match(gameplay, /agreement start\/effective date/);
  assert.match(gameplay, /enforceTemporalBaseline: true/);
  assert.match(gameplay, /must provide a valid agreement start\/effective date on or before Round One/);
});
