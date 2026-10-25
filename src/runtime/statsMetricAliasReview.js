/*! Open Historia - read-only compatibility review of potential national metric aliases.
 * This module deliberately does NOT infer binding authority from a custom key,
 * migrate legacy values, or change simulation/readiness behavior.
 */
import { flattenStatSheetRows, NATIONAL_NATIVE_METRICS, normalizeStatSheetDefinition } from "./statIndexDefinitions.js";

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

const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
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
  const rows = [];
  const seen = new Set();
  for (const stat of flattenStatSheetRows(definition)) {
    // A bound card may have a NEW display key (heroGDP) while an old
    // customStats.gdp still exists. Review the orphan as well as any old
    // value stored under the new card key. Do not mistake either for an
    // authoritative national reading.
    const nativeId = stat.nativeMetric || stat.key;
    const nativePath = stat.nativeMetric
      ? NATIONAL_NATIVE_METRICS[stat.nativeMetric]?.path
      : NATIVE_CANDIDATES[stat.key];
    if (!nativePath) continue;
    const legacyKeys = stat.nativeMetric
      ? [...new Set([stat.key, stat.nativeMetric])].filter((key) => own(sheet?.customStats, key))
      : [stat.key];
    for (const legacyKey of legacyKeys) {
      const identity = `${nativeId}\u0000${legacyKey}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const nativeValue = actualNumber(atPath(sheet, nativePath));
      const customValue = actualNumber(sheet?.customStats?.[legacyKey]);
      const status = nativeValue === null ? "native-unset"
        : customValue === null ? "custom-unset"
          : nativeValue === customValue ? "same-reading" : "different";
      rows.push({
        key: legacyKey,
        label: stat.label,
        nativeMetric: nativeId,
        nativePath: nativePath.join("."),
        customPath: `customStats.${legacyKey}`,
        nativeValue,
        customValue,
        status,
        reviewRequired: nativeValue !== null && customValue !== null,
      });
    }
  }
  return rows;
};

/**
 * Produces a read-only scenario-wide review inventory. The supplied roster is
 * authoritative for which polities to list; this does not infer country
 * identities from similarly named records or mutate any baseline.
 */
export const summarizeScenarioNationalMetricAliasReviews = (definition, world, roster) => {
  const rows = [];
  const countries = new Set();
  const seen = new Set();
  for (const entry of Array.isArray(roster) ? roster : []) {
    const code = String(entry?.code ?? "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const sheet = world?.countryStats?.[code];
    if (!sheet) continue;
    for (const item of reviewScenarioNationalMetricAliases(definition, sheet)) {
      if (!item.reviewRequired) continue;
      countries.add(code);
      rows.push({ countryCode: code, countryName: String(entry.name || code), ...item });
    }
  }
  return {
    rows,
    countries: countries.size,
    matching: rows.filter((item) => item.status === "same-reading").length,
    conflicting: rows.filter((item) => item.status === "different").length,
  };
};

const csvText = (value) => {
  // Actual numeric readings, including negative fiscal balances, are data,
  // not formula strings. Preserve their exact finite numeric representation.
  if (typeof value === "number" && Number.isFinite(value)) return `"${value}"`;
  // Country names and authored labels are untrusted spreadsheet content.
  // Quote every cell and neutralize spreadsheet formula prefixes.
  const input = String(value ?? "");
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(input) ? `'${input}` : input;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Complete, non-rounded numeric evidence; never a migration instruction. */
export const serializeScenarioNationalMetricReviewCsv = (review) => {
  const cols = ["Country code", "Country", "Metric", "Native path", "Native value", "Legacy custom path", "Legacy value", "Comparison", "Review required"];
  const lines = [cols.map(csvText).join(",")];
  for (const row of review?.rows ?? []) {
    lines.push([
      row.countryCode, row.countryName, row.key, row.nativePath,
      row.nativeValue, row.customPath, row.customValue,
      row.status, row.reviewRequired ? "yes" : "no",
    ].map(csvText).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
};
