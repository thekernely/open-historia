/*! Open Historia - final save must not erase native wartime observation fields. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gameplay = readFileSync(new URL("./gameplay.js", import.meta.url), "utf8");

test("the final same-date national history capture reattaches observed occupation metadata", () => {
  const finalCapture = gameplay.indexOf("// Permanent compact Stats history:");
  assert.ok(finalCapture >= 0, "normal final save hook must remain present");
  const generic = gameplay.indexOf("nextWorld = captureCountryStatsHistory(nextWorld, {", finalCapture);
  const regional = gameplay.indexOf("nextWorld = captureNativeEconomicExposureHistory(nextWorld, {", finalCapture);
  const powerTier = gameplay.indexOf("// Power tiers follow the turn's live Stats", finalCapture);
  assert.ok(generic >= 0 && regional > generic && powerTier > regional,
    "verified regional exposure must be restored AFTER the generic same-day save, before subsequent readers");
  const captureCode = gameplay.slice(generic, powerTier);
  assert.match(captureCode, /nativeStatsChronology\s*&&\s*!nativeStatsChronology\.partial/);
  assert.match(captureCode, /Array\.isArray\(nativeStatsRegionCatalog\)/);
  assert.match(captureCode, /regionCatalog:\s*nativeStatsRegionCatalog/);
  assert.match(gameplay.slice(0, generic), /nativeStatsRegionCatalog\s*=\s*candidate\.partial\s*\?\s*null\s*:\s*statsTurnArgs\.regionCatalog/);
});
