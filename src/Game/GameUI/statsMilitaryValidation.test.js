/*! Open Historia — Statistics panel / native sheet boundary tests © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateGameplayPayload } from "../AI/gameplaySchemas.js";
import { normalizeCountryStatSheet } from "../../runtime/countryStats.js";
import { validatePlayerCountryStatSheet } from "./statsPanelSheetValidation.js";

const date = "1912-01-01";
const sheet = () => normalizeCountryStatSheet({
    capital: "Berlin", continent: "Europe", government: "Constitutional monarchy",
    leader: "Wilhelm II", stability: 70,
    indices: { sovereignty: 89, foodAutonomy: 70, energyAutonomy: 65,
        economicIndependence: 80, internalSecurity: 73, internationalReputation: 68 },
    territorialScope: "mapped",
    territorialComponents: [{ geography: "Helgoland", group: "core", population: 2000, gdpPerCapita: 2100 }],
    economy: { gdpGrowth: 3, currency: "Goldmark", inflation: 2,
        unemployment: 4, publicDebt: 45, budgetBalance: -2 },
    gdpBreakdown: { agriculture: 30, industry: 40, services: 30 },
    military: { quality: 65, technology: 70, land: 67 },
    continuity: { assessedDate: date, demographicEvolution: {
        version: 1, sourceDate: date, endDate: "1961-12-31", lastDate: date,
        basePopulation: 2000, birthRate: 29, deathRate: 15,
        birthTrendPerYear: -0.2, deathTrendPerYear: -0.2,
        creditedBirths: 0, creditedDeaths: 0,
        birthFraction: 0, deathFraction: 0, influences: [],
    } },
});

test("native 1912 demographic evolution and military backend do not poison the player Stats panel", () => {
    const saved = sheet();
    assert.equal(validateGameplayPayload("countryStatSheet", saved).valid, false,
        "provider schema must keep refusing native-only fields");
    assert.deepEqual(validatePlayerCountryStatSheet(saved), { valid: true, error: "" });
    assert.deepEqual(validatePlayerCountryStatSheet(JSON.parse(JSON.stringify(saved))),
        { valid: true, error: "" }, "save/reload must preserve a usable Stats sheet");
});

test("native invalid, unknown and duplicated continuity are NOT silently stripped from player validation", () => {
    const saved = sheet();
    for (const continuity of [
        { ...saved.continuity, demographicEvolution: { ...saved.continuity.demographicEvolution, birthRate: 1000 } },
        { ...saved.continuity, demographicEvolution: { ...saved.continuity.demographicEvolution, secret: "invalid" } },
        { ...saved.continuity, unexpectedCursor: {} },
        null,
    ]) {
        assert.equal(validatePlayerCountryStatSheet({ ...saved, continuity }).valid, false);
    }
});

test("model-owned population, components and economy remain strictly validated", () => {
    const saved = sheet();
    assert.equal(validatePlayerCountryStatSheet({ ...saved, economy: { ...saved.economy, unemployment: 200 } }).valid, false);
    assert.equal(validatePlayerCountryStatSheet({ ...saved, territorialComponents: [
        ...saved.territorialComponents, { ...saved.territorialComponents[0] },
    ] }).valid, false);
    assert.equal(validatePlayerCountryStatSheet({ ...saved, foreignField: true }).valid, false);
});

test("both persisted and just-generated standard sheets use the native-safe UI validator", () => {
    const stats = readFileSync(new URL("./stats.jsx", import.meta.url), "utf8");
    assert.match(stats, /return validatePlayerCountryStatSheet\(sheet\)\.valid/);
    assert.match(stats, /const validation = validatePlayerCountryStatSheet\(generated\)/);
    assert.doesNotMatch(stats, /validateGameplayPayload\("countryStatSheet", (?:sheet|generated)\)/);
});
