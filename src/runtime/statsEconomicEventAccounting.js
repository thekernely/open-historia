/*! Open Historia - explicit economy-event accounting on generated timeline turns.
 * Evidence declarations make omissions visible; only typed statsEffects mutate
 * the canonical ledger. No title/prose keyword can manufacture a numeric effect.
 */

const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
// These readings are owned by the native macro, fiscal and demographic clocks.
// Legacy saved events and explicit Game Master corrections are deliberately not
// routed through this generated-jump admission guard.
const CLOCK_OWNED_ECONOMY = new Set([
  'gdp', 'gdpPerCapita', 'coreGdpPerCapita', 'otherGdpPerCapita',
  'gdpGrowth', 'inflation', 'unemployment', 'publicDebt', 'budgetBalance',
]);
const clockOwnedAbsolutePath = (stats) => {
  if (!record(stats)) return '';
  for (const key of ['population', 'territorialComponents', 'gdpBreakdown', 'continuity']) {
    if (Object.hasOwn(stats, key)) return `.${key}`;
  }
  if (record(stats.economy)) {
    for (const key of Object.keys(stats.economy)) {
      if (CLOCK_OWNED_ECONOMY.has(key)) return `.economy.${key}`;
    }
  }
  return '';
};
export const STATS_EVENT_ACCOUNTING_STATES = Object.freeze(['applied', 'unquantified', 'none']);

export const normalizeStatsEconomicEventAccounting = (value) => {
  if (!record(value) || !STATS_EVENT_ACCOUNTING_STATES.includes(value.status)
    || typeof value.reason !== 'string' || !value.reason.trim()
    || value.reason.trim().length > 240) return null;
  return { status: value.status, reason: value.reason.trim() };
};

// Called on new jump candidates BEFORE committing an accepted turn. Existing
// saved events and manually-authored Game Master events remain backward-compatible.
export const validateGeneratedStatsEconomicAccounting = (events) => {
  if (!Array.isArray(events)) return '';
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const changes = Array.isArray(event?.impacts?.polityChanges) ? event.impacts.polityChanges : [];
    // Reject direct economic updates BEFORE accepting a generated jump, even
    // when an event has no statsEffects. The old absolute-only route otherwise
    // bypasses the typed effect guard and can desynchronize native clock cursors.
    for (let changeIndex = 0; changeIndex < changes.length; changeIndex++) {
      const path = clockOwnedAbsolutePath(changes[changeIndex]?.stats);
      if (path) {
        return `$.events[${index}].impacts.polityChanges[${changeIndex}].stats${path} is native-clock-owned; use a supported dated statsEffects operation, not an absolute generated-event update`;
      }
    }
    const effects = changes.filter((change) => record(change) && Object.hasOwn(change, 'statsEffects'));
    const measurable = (effect) => record(effect) && (
      ['populationChange', 'gdpChangePercent', 'annualRealGrowthDelta', 'debtFinancedOutlayPercentGdp', 'stabilityDelta']
        .some((key) => typeof effect[key] === 'number' && Number.isFinite(effect[key]))
      || (record(effect.indexDeltas) && Object.keys(effect.indexDeltas).length > 0)
      || (record(effect.customStatDeltas) && Object.keys(effect.customStatDeltas).length > 0)
      || (typeof effect.resolveGrowthInfluenceEventId === 'string' && effect.resolveGrowthInfluenceEventId.trim()));
    if (effects.some(({ statsEffects }) => !measurable(statsEffects))) {
      return `$.events[${index}].impacts.polityChanges[].statsEffects needs a measurable typed Statistics change`;
    }
    const hasEconomicTypedEffect = effects.some(({ statsEffects }) => record(statsEffects) &&
      (typeof statsEffects.resolveGrowthInfluenceEventId === 'string' && Boolean(statsEffects.resolveGrowthInfluenceEventId.trim())
        || ['populationChange', 'gdpChangePercent', 'annualRealGrowthDelta', 'debtFinancedOutlayPercentGdp'].some((key) =>
        typeof statsEffects[key] === 'number' && Number.isFinite(statsEffects[key]))
      || (Array.isArray(event?.tags) && event.tags.some((tag) => typeof tag === 'string'
        && tag.toLowerCase() === 'economy') && record(statsEffects.customStatDeltas)
        && Object.keys(statsEffects.customStatDeltas).length > 0)));
    const economicTag = Array.isArray(event?.tags) && event.tags.some((tag) =>
      typeof tag === 'string' && tag.toLowerCase() === 'economy');
    // Strategic-only typed effects have their own per-event receipts; they are
    // not economic accounting claims and should not require an Economy declaration.
    if (!economicTag && !hasEconomicTypedEffect && event?.economicAccounting === undefined) continue;
    const path = `$.events[${index}].economicAccounting`;
    const accounting = normalizeStatsEconomicEventAccounting(event.economicAccounting);
    if (!accounting || accounting.reason.length < 12) {
      return `${path} must state applied, unquantified, or none with a concrete reason (12-240 characters)`;
    }
    if (hasEconomicTypedEffect && accounting.status !== 'applied') {
      return `${path} must be applied when the event carries a measurable typed statsEffects change`;
    }
    if (!hasEconomicTypedEffect && accounting.status === 'applied') {
      return `${path} declares an applied economic change without any typed statsEffects`;
    }
  }
  return '';
};
