/*! Open Historia — canonical player Statistics sheet validation © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
// The AI countryStatSheet tool describes generated measurements, not the
// persistent native state envelope. Runtime continuity cursors and military
// backend figures are never authorable through the AI schema.
import { validateGameplayPayload } from "../AI/gameplaySchemas.js";
import { isCompleteCountryStatSheet, normalizeCountryStatContinuity } from "../../runtime/countryStats.js";

const sameCanonicalStructure = (actual, expected) => {
    if (actual === expected) return true;
    if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object") return false;
    if (Array.isArray(actual) !== Array.isArray(expected)) return false;
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
    if (actualKeys.length !== expectedKeys.length) return false;
    return actualKeys.every((key) => Object.hasOwn(expected, key)
        && sameCanonicalStructure(actual[key], expected[key]));
};

export const validatePlayerCountryStatSheet = (sheet) => {
    if (!isCompleteCountryStatSheet(sheet)) {
        return { valid: false, error: "The canonical national Statistics sheet is incomplete." };
    }
    // Never hide malformed native continuity behind a permissive projection.
    // The native normalizer is the authority for dated demographic, fiscal and
    // GDP clocks. A dropped, altered or unknown cursor is not a valid saved sheet.
    if (Object.hasOwn(sheet, "continuity")) {
        const normalized = normalizeCountryStatContinuity(sheet.continuity);
        if (!normalized || !sameCanonicalStructure(sheet.continuity, normalized)) {
            return { valid: false, error: "The canonical Statistics continuity is invalid." };
        }
    }
    // The model-facing schema still strictly validates all player-visible
    // measurements, component identities and economic ranges. Remove ONLY the
    // separately owned native envelopes before invoking it.
    const modelFields = { ...sheet };
    delete modelFields.military;
    delete modelFields.continuity;
    return validateGameplayPayload("countryStatSheet", modelFields);
};
