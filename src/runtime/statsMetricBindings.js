/*! Open Historia - read-only, single-owner national Statistics presentation bindings. */
import { NATIONAL_NATIVE_METRICS, normalizeStatSheetDefinition } from "./statIndexDefinitions.js";

const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const nativeAt = (sheet, path) => path.reduce((object, segment) => object?.[segment], sheet);

/**
 * A presentation definition is not a list of writable customStats fields.
 * An explicit native card has an existing canonical owner, even when its
 * display key is entirely different from the native metric's identity.
 * Legacy definitions (no nativeMetric) retain the exact prior key list.
 */
export const nationalStatsAuthoringContract = (definitionInput) => {
  const definition = normalizeStatSheetDefinition(definitionInput, { fallbackStandard: false });
  if (!definition.custom) return { custom: false, customKeys: [], boundRows: [] };
  const rows = definition.sections.flatMap((section) => section.stats);
  return {
    custom: true,
    customKeys: rows.filter((stat) => !stat.nativeMetric).map((stat) => stat.key),
    boundRows: rows.filter((stat) => stat.nativeMetric).map((stat) => ({ key: stat.key, nativeMetric: stat.nativeMetric })),
  };
};

/**
 * The only safe automatic transition is one with no old value for the bound
 * card key. Even equal values are still two independently writable ledgers:
 * the author must review them through a future explicit migration operation.
 * No normalization/deletion/selection is performed here.
 */
export const assertNoLegacyNativeStatCopies = (definitionInput, sheet) => {
  const { boundRows } = nationalStatsAuthoringContract(definitionInput);
  // A renamed widget key must not hide a surviving legacy customStats.gdp
  // alongside native economy.gdp. Check both the presentation key and the
  // explicit source identity. Neither check assumes numerical equivalence.
  const conflict = boundRows.map((row) => ({
    ...row, legacyKey: [row.key, row.nativeMetric].find((key) => own(sheet?.customStats, key)),
  })).find((row) => row.legacyKey);
  if (conflict) {
    throw new Error(`Custom statistic ${conflict.legacyKey} has an existing independent value; review its migration to native ${conflict.nativeMetric} before enabling this binding.`);
  }
};

/**
 * Resolves one existing countryStats reading for a presentation row.
 * A declared native binding never falls back to a potentially conflicting
 * customStats entry. Even equal legacy readings need author review before
 * the new presentation can be activated. This function changes no state.
 */
export const resolveNationalStatReading = (stat, sheet) => {
  const key = typeof stat?.key === "string" ? stat.key : "";
  if (!key) return { source: "invalid", status: "invalid-definition", value: null };
  if (!stat.nativeMetric) {
    const value = sheet?.customStats?.[key];
    return { source: "custom", status: finite(value) ? "ready" : "unavailable", value: finite(value) ? value : null };
  }
  const native = NATIONAL_NATIVE_METRICS[stat.nativeMetric];
  if (!native || native.kind !== stat.kind) {
    return { source: "invalid", status: "invalid-definition", value: null };
  }
  if (own(sheet?.customStats, key) || own(sheet?.customStats, stat.nativeMetric)) {
    return { source: "native", status: "review-required", value: null };
  }
  const value = nativeAt(sheet, native.path);
  return { source: "native", status: finite(value) ? "ready" : "unavailable", value: finite(value) ? value : null };
};

/** Display readiness is not the same as native economic/demographic readiness. */
export const nationalStatsPresentationCoverage = (definitionInput, sheet) => {
  const definition = normalizeStatSheetDefinition(definitionInput, { fallbackStandard: false });
  if (!definition.custom) return { ready: false, rows: [] };
  const rows = definition.sections.flatMap((section) => section.stats.map((stat) => ({
    key: stat.key,
    nativeMetric: stat.nativeMetric ?? null,
    ...resolveNationalStatReading(stat, sheet),
  })));
  return { ready: rows.length > 0 && rows.every((row) => row.status === "ready"), rows };
};
