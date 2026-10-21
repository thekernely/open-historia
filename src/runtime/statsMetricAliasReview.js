/*! Open Historia - read-only compatibility review of potential national metric aliases.
 * This module deliberately does NOT infer binding authority from a custom key,
 * migrate legacy values, or change simulation/readiness behavior.
 */
import { flattenStatSheetRows, normalizeStatSheetDefinition } from "./statIndexDefinitions.js";

// An exact machine-key match identifies a potential semantic collision, not a
// confirmed equivalence. In particular, historical currency bases and
// denominator/territorial scope may differ even when the readings agree.
const NATIVE_CANDIDATES = Object.freeze({
  gdp: ["economy", "gdp"],
  gdpPerCapita: ["economy", "gdpPerCapita"],
  totalPopulation: ["population", "total"],
  gdpGrowth: ["economy", "gdpGrowth"],
  inflation: ["economy", "inflation"],
  unemployment: ["economy", "unemployment"],
  publicDebt: ["economy", "publicDebt"],
  budgetBalance: ["economy", "budgetBalance"],
  nationalStability: ["stability"],
  agricultureShare: ["gdpBreakdown", "agriculture"],
  industryShare: ["gdpBreakdown", "industry"],
  servicesShare: ["gdpBreakdown", "services"],
});

const actualNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const atPath = (sheet, path) => path.reduce((value, key) => value?.[key], sheet);

/**
 * Returns an immutable-in-practice report describing potential duplicate
 * storage for a SINGLE polity. No values are changed and no claim is made
 * about measurement equivalence, even when numbers happen to match.
 *
 * 'different' means two finite numeric readings differ; 'same-reading' does
 * not establish shared authority. 'native-unset' and 'custom-unset' are not
 * translated into zero or an invented economic baseline.
 */
export const reviewScenarioNationalMetricAliases = (definitionInput, sheet) => {
  // The editor may retain default section previews even when the author
  // explicitly switched back to the standard (non-custom) sheet.
  if (definitionInput?.custom === false) return [];
  const definition = normalizeStatSheetDefinition(definitionInput, { fallbackStandard: false });
  if (!definition.custom) return [];
  return flattenStatSheetRows(definition).flatMap((stat) => {
    const nativePath = NATIVE_CANDIDATES[stat.key];
    if (!nativePath) return [];
    const nativeValue = actualNumber(atPath(sheet, nativePath));
    const customValue = actualNumber(sheet?.customStats?.[stat.key]);
    const status = nativeValue === null ? "native-unset"
      : customValue === null ? "custom-unset"
        : Object.is(nativeValue, customValue) || nativeValue === customValue ? "same-reading" : "different";
    return [{
      key: stat.key,
      label: stat.label,
      nativePath: nativePath.join("."),
      customPath: `customStats.${stat.key}`,
      nativeValue,
      customValue,
      status,
      // All coexisting numeric readings need semantic review; different ones
      // especially must never be silently reconciled or treated as the same.
      reviewRequired: nativeValue !== null && customValue !== null,
    }];
  });
};
