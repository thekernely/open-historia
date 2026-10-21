import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const panel = fs.readFileSync(new URL("./ScenarioStatsAuthoringPanel.jsx", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("./libraryBar.jsx", import.meta.url), "utf8");
test("country proposal failures have bounded diagnostic reasons but not raw provider responses", () => {
  assert.match(panel, /logDebugEvent\("stats", "Scenario Statistics proposal rejected",/);
  assert.match(panel, /country: item\.code, reason: String\(reason\)\.slice\(0, 300\)/);
  assert.doesNotMatch(panel, /logDebugEvent\([^;]+rawResponse/);
});
test("wrong-type scenario save cannot crash EditorDrawer or replace canonical editor state", () => {
  assert.match(editor, /const record = kind === "scenario"/);
  assert.match(editor, /if \(!record\) return null;/);
  assert.match(editor, /onDetailsChange=\{\(nextDetails\) => \{[\s\S]*?editorDetailsIssue\(\{ kind: editorKind, expectedId, details: nextDetails \}\)/);
  assert.match(editor, /if \(issue\) \{[\s\S]*?throw new Error\(/);
});
