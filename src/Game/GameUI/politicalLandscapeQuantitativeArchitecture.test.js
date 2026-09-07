/*! Open Historia Continuum — Phase006D political landscape UI regression */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const overview = fs.readFileSync(new URL("./PoliticalOverview.jsx", import.meta.url), "utf8");

test("missing political percentages never render as fake 0%", () => {
  assert.match(overview, /if \(value === null \|\| value === undefined \|\| value === ""\) return "—"/);
  assert.match(overview, /const number = Number\(value\)/);
});

test("generated Round-Zero quantitative landscapes are visibly marked Approximate", () => {
  assert.match(overview, /landscape\.isApproximate/);
  assert.match(overview, />\s*Approximate\s*</);
  assert.match(overview, /party\.supportApproximate/);
  assert.match(overview, /bloc\.influenceApproximate/);
});

test("the same landscape component renders electoral support and non-electoral influence", () => {
  assert.match(overview, /buildPoliticalLandscape/);
  assert.match(overview, /landscape\.mode === "party"/);
  assert.match(overview, /PowerBlocDetail/);
  assert.match(overview, /party\.displayValue \|\| formatSupport\(party\.support\)/);
});
