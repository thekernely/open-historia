/*! Open Historia - staged commissioned-output clock is a finite persistent GDP level. */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeCountryStatPatch } from "./countryStats.js";
import { advanceNativeProductionClock } from "./statsProductionClock.js";

const worldWithRamp = () => ({
  ownerCodes: ["Aland"],
  countryStats: { Aland: mergeCountryStatPatch(null, {
    territorialComponents: [{ geography: "Aland Province", group: "core", population: 100_000, gdpPerCapita: 1000 }],
    economy: { publicDebt: 40 },
    continuity: { assessedDate: "1912-01-01", gdpRamps: [{
      eventId: "commissioned-e1", projectId: "steelworks-1",
      startDate: "1912-01-01", endDate: "1913-01-01", lastDate: "1912-01-01",
      gdpDelta: 1_000_000, credited: 0,
    }] },
  }) },
});

test("a commissioned project raises annual GDP only once over its authored ramp", () => {
  const before = worldWithRamp();
  const first = advanceNativeProductionClock(before, { fromDate: "1912-01-01", toDate: "1912-07-01" });
  const second = advanceNativeProductionClock(first, { fromDate: "1912-07-01", toDate: "1913-01-01" });
  assert.ok(first.countryStats.Aland.economy.gdp > before.countryStats.Aland.economy.gdp);
  assert.equal(second.countryStats.Aland.continuity.gdpRamps[0].credited, 1_000_000);
  assert.equal(second.countryStats.Aland.economy.gdp, before.countryStats.Aland.economy.gdp + 1_000_000);
  assert.deepEqual(advanceNativeProductionClock(second, { fromDate: "1913-01-01", toDate: "1914-01-01" }), second);
});

test("missing projects and missing reviewed GDP never produce autonomous output", () => {
  const empty = { ownerCodes: ["Aland"], countryStats: { Aland: { military: { spending: 80 } } } };
  assert.deepEqual(advanceNativeProductionClock(empty, { fromDate: "1912-01-01", toDate: "1913-01-01" }), empty);
  const noRamp = worldWithRamp();
  delete noRamp.countryStats.Aland.continuity.gdpRamps;
  assert.deepEqual(advanceNativeProductionClock(noRamp, { fromDate: "1912-01-01", toDate: "1913-01-01" }), noRamp);
});
