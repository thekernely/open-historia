/*! Open Historia - scenario-authorized, incremental military expenditure.
 * The project milestone owns delivery evidence; this ledger stores the authorized
 * price and once-only payment identity, never a second debt/GDP balance.
 * Generated events cannot create or change an authorization.
 */
import { compareGameDates, isCanonicalGameDate } from './gameDates.js';
import { mergeCountryStatPatch } from './countryStats.js';
import { appendAcceptedStatsReceipt } from './statsEventReceipts.js';

const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 80;
const money = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
  && value <= 100_000_000_000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
const point4 = (value) => Math.round(value * 10000) / 10000;
const PAID = ['paidAt', 'paidEventId', 'debtRatioPoints'];
const AUTHORIZED = ['id', 'polity', 'projectId', 'milestoneId', 'authorizedAt', 'amountGdpEquivalent', 'financing', 'budgetTreatment', 'authority'];
const KEYS = new Set([...AUTHORIZED, ...PAID]);

// A structural check on READ. In contrast with descriptive projects, financial
// authorizations cannot be repaired or dropped silently: that would erase
// obligations or permit re-payment after save/reload.
export const normalizeMilitaryExpenditureCommitments = (value) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 128) throw new Error('Invalid military expenditure commitments ledger');
  const identifiers = new Set();
  const milestones = new Set();
  return value.map((raw) => {
    if (!record(raw) || Object.keys(raw).some((key) => !KEYS.has(key))
      || !id(raw.id) || !id(raw.polity) || !id(raw.projectId) || !id(raw.milestoneId)
      || !isCanonicalGameDate(raw.authorizedAt) || !money(raw.amountGdpEquivalent)
      || raw.financing !== 'debt' || raw.budgetTreatment !== 'incremental'
      || raw.authority !== 'scenario') {
      throw new Error('Invalid scenario-authorized military expenditure commitment');
    }
    const milestoneKey = `${raw.polity}\u0000${raw.projectId}\u0000${raw.milestoneId}`;
    if (identifiers.has(raw.id) || milestones.has(milestoneKey)) {
      throw new Error('Duplicate military expenditure commitment or milestone');
    }
    identifiers.add(raw.id);
    milestones.add(milestoneKey);
    const isPaid = PAID.some((key) => Object.hasOwn(raw, key));
    if (isPaid && (!isCanonicalGameDate(raw.paidAt) || !id(raw.paidEventId)
      || raw.paidEventId.length > 80 || typeof raw.debtRatioPoints !== 'number'
      || !Number.isFinite(raw.debtRatioPoints) || raw.debtRatioPoints <= 0
      || raw.debtRatioPoints > 5 || point4(raw.debtRatioPoints) !== raw.debtRatioPoints
      || compareGameDates(raw.paidAt, raw.authorizedAt) < 0)) {
      throw new Error('Invalid settled military expenditure commitment');
    }
    return {
      id: raw.id, polity: raw.polity, projectId: raw.projectId,
      milestoneId: raw.milestoneId, authorizedAt: raw.authorizedAt,
      amountGdpEquivalent: raw.amountGdpEquivalent,
      financing: 'debt', budgetTreatment: 'incremental', authority: 'scenario',
      ...(isPaid ? { paidAt: raw.paidAt, paidEventId: raw.paidEventId, debtRatioPoints: raw.debtRatioPoints } : {}),
    };
  });
};

const milestone = (projects, projectId, milestoneId) => {
  const project = projects.find((row) => row?.id === projectId);
  if (!project) return null;
  return { project, milestone: project.milestones?.find((row) => row.id === milestoneId) };
};

// Runs AFTER this accepted event's projectOps. The event's observed transition
// into done, not an AI textual claim or an old already-done milestone, licenses
// payment. The authorization is pre-existing scenario-owned world data.
// Returns a detached world; on any invalid entry, the entire turn fails closed.
export const settleMilitaryMilestonePayments = (worldBefore, worldAfter, { eventId, date, event = null } = {}) => {
  const commitments = normalizeMilitaryExpenditureCommitments(worldAfter?.militaryExpenditureCommitments);
  if (!commitments.length) return worldAfter;
  if (!id(eventId) || !isCanonicalGameDate(date)) throw new Error('Military payment needs a dated accepted event');
  let next = worldAfter;
  let updated = false;
  for (let index = 0; index < commitments.length; index++) {
    const commitment = commitments[index];
    if (commitment.paidAt) continue;
    const oldEntry = milestone(worldBefore.projects || [], commitment.projectId, commitment.milestoneId);
    const newEntry = milestone(next.projects || [], commitment.projectId, commitment.milestoneId);
    if (newEntry?.milestone?.status !== 'done' || oldEntry?.milestone?.status === 'done') continue;
    if (!oldEntry || !newEntry || newEntry.project.ownerCode !== commitment.polity
      || oldEntry.project.ownerCode !== commitment.polity
      || !['active', 'complete'].includes(newEntry.project.status)
      || newEntry.milestone.repeat || oldEntry.milestone.repeat
      || compareGameDates(date, commitment.authorizedAt) < 0) {
      throw new Error('Military payment lacks a matching authorized project and delivery');
    }
    const conflicts = event?.impacts?.polityChanges?.some((change) =>
      change?.code === commitment.polity && Object.hasOwn(change?.statsEffects ?? {}, 'debtFinancedOutlayPercentGdp'));
    if (conflicts) throw new Error('Military payment conflicts with same-event debt-financed outlay');
    const before = next.countryStats?.[commitment.polity];
    const gdp = before?.economy?.gdp;
    const debt = before?.economy?.publicDebt;
    const ratio = typeof gdp === 'number' && gdp > 0
      ? point4(commitment.amountGdpEquivalent / gdp * 100) : 0;
    if (!(typeof debt === 'number' && Number.isFinite(debt) && debt >= 0)
      || !(ratio >= .0001 && ratio <= 5) || debt + ratio > 1000) {
      throw new Error('Military payment requires initialized GDP/debt and bounded incremental authority');
    }
    const after = mergeCountryStatPatch(before, { economy: { publicDebt: point4(debt + ratio) } },
      { continuity: { accountedEventIds: [`military-payment:${commitment.id}`] } });
    if (!after || after.economy.publicDebt <= debt || after.economy.gdp !== gdp) {
      throw new Error('Military payment failed canonical fiscal settlement');
    }
    next = updated ? next : { ...next, countryStats: { ...next.countryStats },
      militaryExpenditureCommitments: [...commitments], statsEventReceipts: [...(next.statsEventReceipts || [])] };
    updated = true;
    const receiptId = `military-payment:${commitment.id}`;
    appendAcceptedStatsReceipt(next, { eventId: receiptId, polity: commitment.polity, date,
      reason: `Scenario-priced military project ${commitment.projectId} milestone ${commitment.milestoneId}`,
      before, after });
    next.countryStats[commitment.polity] = after;
    next.militaryExpenditureCommitments[index] = { ...commitment,
      paidAt: date, paidEventId: eventId, debtRatioPoints: ratio };
  }
  return next;
};
