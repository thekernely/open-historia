/*! Open Historia - finite, explicitly ESTIMATED systemic disruption evidence.
 * Qualitative exposure is not a measured GDP observation or a trade ledger.
 * Numeric consequences remain owned by countryStats.economicInfluences.
 */
const record = (row) => row && typeof row === "object" && !Array.isArray(row);
const channels = new Set(["credit", "trade", "production", "logistics", "labor"]);
const exposures = new Set(["direct", "dependent"]);
const keys = new Set(["basis", "channel", "exposure", "evidence"]);
export const normalizeStatsCrisisEstimate = (value) => {
  if (!record(value) || Object.keys(value).some((key) => !keys.has(key))
    || value.basis !== "simulation-estimate" || !channels.has(value.channel)
    || !exposures.has(value.exposure) || typeof value.evidence !== "string"
    || value.evidence.trim().length < 32 || value.evidence.trim().length > 240) return null;
  return { basis: value.basis, channel: value.channel, exposure: value.exposure,
    evidence: value.evidence.trim() };
};
// Conservative native policy limits for *unmeasured* causal estimates, in
// annualized percentage points, NOT a claimed observed percent loss of GDP.
export const estimateGrowthLimit = (estimate) => estimate.exposure === "direct" ? 12 : 5;
