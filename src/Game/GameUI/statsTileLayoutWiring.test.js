/*! Open Historia - deferred national layout regression (technical-only checkpoint). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeStatSheetDefinition, serializeStatSheet } from "../../runtime/statIndexDefinitions.js";

const editor = readFileSync(new URL("./StatsSheetEditor.jsx", import.meta.url), "utf8");
const player = readFileSync(new URL("./stats.jsx", import.meta.url), "utf8");

test("unaccepted layout preview and tile controls are not exposed", () => {
  assert.doesNotMatch(editor, /National Statistics layout preview|Dashboard tile width|statTileSpan\(stat\)/);
  assert.doesNotMatch(player, /statTileSpan\(stat\)|const tileStyle = \{ \.\.\.cardStyle/);
});

test("preexisting experimental tile widths remain round-trippable but inert", () => {
  const sheet = { sections: [{ label: "Review", stats: [
    { key: "head", label: "National GDP", kind: "currency", nativeMetric: "gdp", tileSpan: 2 },
    { key: "population", label: "Population", kind: "number", nativeMetric: "totalPopulation", tileSpan: 1 },
  ] }] };
  const normalized = normalizeStatSheetDefinition(sheet);
  assert.deepEqual(normalized.sections[0].stats.map(row => row.tileSpan), [2, 1]);
  const roundTrip = serializeStatSheet(normalized);
  assert.deepEqual(roundTrip.sections[0].stats.map(row => row.tileSpan), [2, 1]);
});
