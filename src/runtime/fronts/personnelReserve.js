/*! Open Historia - bounded military operational reserve commitments © 2026.
 *
 * This is NOT a casualty or population ledger. It records personnel no longer
 * serving in the battlefield's active formations but still unavailable for
 * recruitment while that polity has an active frontline or troop transport. An ended participation
 * releases that operational reservation; no demographic claim is made.
 * `unresolved` is a separate, durable count of people in intercepted troop
 * transport losses whose individual disposition is unknown. Not confirmed dead.
 *
 * An absent field on legacy saves is equivalent to no historical reservation.
 */
import { MAX_BATTLEFIELDS, MAX_SIDE_MEMBERS } from "./constants.js";

const MAX_ENTRIES = MAX_BATTLEFIELDS * MAX_SIDE_MEMBERS * 2;
const MAX_PEOPLE = 2e10;
// Bounded saved identity evidence. Never rotate an already identified, still-open
// dispatch case out merely because newer interceptions occurred. Overflow remains
// in the unresolved aggregate but is not individually settleable yet.
export const MAX_FRONT_PERSONNEL_INCIDENTS = 24;

// Preserve previously retained, open dispatch-lineage cases; prioritize newer
// lineage cases ahead of legacy receipts when slots remain. The surviving cases
// retain their original order for deterministic saves and normalized replays.
// This is NOT an archive: overflow still needs its own authoritative resolution.
export const retainFrontPersonnelIncidents = (previous, added) => {
  const saved = Array.isArray(previous) ? previous : [];
  const incoming = Array.isArray(added) ? added : [];
  const entries = [...saved, ...incoming];
  const knownLineage = (entry) => typeof entry?.dispatchId === "string" &&
    typeof entry?.id === "string" && entry.id.startsWith("hit2:");
  const savedLineage = [];
  const newLineage = [];
  const legacy = [];
  entries.forEach((entry, index) => {
    if (!knownLineage(entry)) legacy.push(index);
    else if (index < saved.length) savedLineage.push(index);
    else newLineage.push(index);
  });
  const kept = new Set(savedLineage.slice(-MAX_FRONT_PERSONNEL_INCIDENTS));
  const keepRecent = (indices) => {
    const slots = MAX_FRONT_PERSONNEL_INCIDENTS - kept.size;
    if (slots > 0) indices.slice(-slots).forEach((index) => kept.add(index));
  };
  keepRecent(newLineage);
  keepRecent(legacy);
  return entries.filter((_, index) => kept.has(index));
};
// An identified case may be released in bounded, separately verified batches.
// These receipts are replay guards, not authority for a release on their own.
export const MAX_FRONT_PERSONNEL_CASE_RETURNS = 16;
const MAX_EVENT_ID_LENGTH = 120;
const incidentId = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9:._-]{0,79}$/i.test(value);
const record = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const validIncidents = (row, unresolved) => {
  if (row.incidents === undefined) return [];
  if (!Array.isArray(row.incidents) || row.incidents.length > MAX_FRONT_PERSONNEL_INCIDENTS) return null;
  const seen = new Set();
  const incidents = [];
  let attributed = 0;
  for (const value of row.incidents) {
    // `people` remains the ORIGINAL interception count. Only `remaining`
    // changes after authorized returns, preserving the incident's provenance.
    const remaining = value?.remaining ?? value?.people;
    const returns = value?.returns === undefined ? [] : value.returns;
    if (!Array.isArray(returns) || returns.length > MAX_FRONT_PERSONNEL_CASE_RETURNS) return null;
    const returnEvents = new Set();
    let returned = 0;
    for (const settlement of returns) {
      if (!record(settlement) || typeof settlement.eventId !== "string" ||
          !settlement.eventId.trim() || settlement.eventId.trim() !== settlement.eventId ||
          settlement.eventId.length > MAX_EVENT_ID_LENGTH || returnEvents.has(settlement.eventId) ||
          !Number.isSafeInteger(settlement.people) || settlement.people <= 0 || settlement.people > MAX_PEOPLE ||
          Object.keys(settlement).some((key) => key !== "eventId" && key !== "people")) return null;
      returned += settlement.people;
      if (!Number.isSafeInteger(returned) || returned > MAX_PEOPLE) return null;
      returnEvents.add(settlement.eventId);
    }
    if (!record(value) || !incidentId(value.id) ||
        typeof value.transportId !== "string" || !clean(value.transportId) || clean(value.transportId).length > 24 ||
        typeof value.date !== "string" || !clean(value.date) || clean(value.date).length > 40 ||
        !Number.isSafeInteger(value.people) || value.people <= 0 || value.people > MAX_PEOPLE ||
        seen.has(value.id) ||
        !Number.isSafeInteger(remaining) || remaining <= 0 || remaining > value.people ||
        (value.remaining !== undefined && returned === 0) ||
        returned !== value.people - remaining ||
        (returns.length && !value.dispatchId) ||
        (value.dispatchId !== undefined &&
          (typeof value.dispatchId !== "string" || !/^d[1-9]\d{0,11}$/.test(value.dispatchId) ||
           !new RegExp(`^hit2:${value.dispatchId}:[1-9]\\d*$`).test(value.id))) ||
        (value.dispatchId === undefined && value.id.startsWith("hit2:"))) return null;
    seen.add(value.id);
    attributed += remaining;
    if (attributed > unresolved) return null;
    incidents.push({ id: value.id, transportId: clean(value.transportId), date: clean(value.date), people: value.people,
      ...(remaining !== value.people ? { remaining } : {}),
      ...(value.dispatchId ? { dispatchId: value.dispatchId } : {}),
      ...(returns.length ? { returns: returns.map(({ eventId, people }) => ({ eventId, people })) } : {}) });
  }
  return incidents;
};
// A sparse map keyed by current canonical polity identity. Never create a
// resident-population patch from a service allocation.
export const normalizeFrontPersonnel = (value) => {
  if (!record(value)) return {};
  const next = {};
  for (const [key, row] of Object.entries(value)) {
    const name = clean(key);
    if (!name || name.length > 120 || !record(row)) continue;
    const unavailable = row.unavailable ?? 0;
    const unresolved = row.unresolved ?? 0;
    // Monotonic campaign-round fence for explicitly authorized unattributed
    // returns. No event ID alone is authority to lower the aggregate.
    const lastUnattributedReturnRound = row.lastUnattributedReturnRound;
    if (lastUnattributedReturnRound !== undefined &&
        (!Number.isSafeInteger(lastUnattributedReturnRound) || lastUnattributedReturnRound < 1)) continue;
    if (!Number.isSafeInteger(unavailable) || unavailable < 0 || unavailable > MAX_PEOPLE ||
        !Number.isSafeInteger(unresolved) || unresolved < 0 || unresolved > MAX_PEOPLE ||
        unavailable + unresolved > MAX_PEOPLE || unavailable + unresolved === 0) continue;
    const incidents = validIncidents(row, unresolved);
    if (incidents === null) continue;
    if (Object.keys(next).length >= MAX_ENTRIES) break;
    next[name] = {
      ...(unavailable > 0 ? { unavailable } : {}), ...(unresolved > 0 ? { unresolved } : {}),
      ...(incidents.length ? { incidents } : {}),
      ...(lastUnattributedReturnRound !== undefined ? { lastUnattributedReturnRound } : {}),
    };
  }
  return next;
};

// The engine has already resolved what remained allocated at the end of the
// run. No field is written if the engine did not execute successfully or was
// disabled. An empty verified report retires an old active-front reservation.
export const withFrontPersonnel = (world, fronts) => {
  if (!world || !Array.isArray(fronts?.personnel)) return world;
  // A malformed engine report must not wipe the last accepted reservation.
  // The report is absolute, so a duplicate/invalid row could otherwise silently
  // replace an authoritative entry or retire every other polity's commitment.
  const seen = new Set();
  for (const row of fronts.personnel) {
    const name = clean(row?.name);
    const key = name.toLowerCase();
    if (!name || name.length > 120 || seen.has(key) ||
        !Number.isSafeInteger(row?.unavailable) || row.unavailable < 0 ||
        row.unavailable > MAX_PEOPLE ||
        (row.unresolved !== undefined && (!Number.isSafeInteger(row.unresolved) || row.unresolved < 0 || row.unresolved > MAX_PEOPLE)) ||
        row.unavailable + (row.unresolved || 0) > MAX_PEOPLE ||
        validIncidents(row, row.unresolved || 0) === null) return world;
    seen.add(key);
  }
  if (fronts.personnel.length > MAX_ENTRIES) return world;
  // A polity the accepted event pipeline dissolved cannot be re-enrolled by
  // a frontline result computed from the pre-dissolution snapshot.
  const eligible = fronts.personnel.filter((row) =>
    String(world.polityOverrides?.[clean(row.name)]?.status ?? "").toLowerCase() !== "dissolved");
  const next = normalizeFrontPersonnel(Object.fromEntries(eligible
    .map((row) => [clean(row.name), { unavailable: row.unavailable, unresolved: row.unresolved,
      ...(row.incidents !== undefined ? { incidents: row.incidents } : {}),
      ...(row.lastUnattributedReturnRound !== undefined
        ? { lastUnattributedReturnRound: row.lastUnattributedReturnRound } : {}) }])));
  // A front report is an ABSOLUTE operational snapshot, not an accepted
  // disposition. Only the later event-authorized reducer can lower unresolved
  // manpower or alter a previously accepted dispatch case's return history.
  // Otherwise a stale report could undo legitimate settlements, quietly erase
  // casualties' provenance, or make old losses recruitable again.
  // Dispatch lineage is campaign-wide, not per-polity. Never publish a
  // cross-owner duplicate that no later disposition can identify safely.
  const seenCaseIds = new Set();
  for (const row of Object.values(next)) {
    for (const incident of row.incidents ?? []) {
      if (!incident.dispatchId) continue;
      if (seenCaseIds.has(incident.id)) return world;
      seenCaseIds.add(incident.id);
    }
  }
  const prior = normalizeFrontPersonnel(world.frontPersonnel);
  if (world.frontPersonnel && Object.keys(prior).length !== Object.keys(world.frontPersonnel).length) return world;
  // Frontline reports may carry a settled round forward, never mint, erase,
  // or advance it. Only an accepted late disposition owns that mutation.
  for (const [polity, after] of Object.entries(next)) {
    if (after.lastUnattributedReturnRound !== prior[polity]?.lastUnattributedReturnRound) return world;
  }
  for (const [polity, before] of Object.entries(prior)) {
    if (String(world.polityOverrides?.[polity]?.status ?? "").toLowerCase() === "dissolved") continue;
    const after = next[polity];
    if ((after?.unresolved ?? 0) < (before.unresolved ?? 0)) return world;
    for (const incident of before.incidents ?? []) {
      // A legacy receipt can age out under the bounded retention policy;
      // a hit2 dispatch case must remain identical until the late reducer
      // explicitly resolves it and publishes the whole canonical generation.
      if (!incident.dispatchId) continue;
      const retained = after?.incidents?.find((value) => value.id === incident.id);
      if (!retained || JSON.stringify(retained) !== JSON.stringify(incident)) return world;
    }
  }
  if (!Object.keys(next).length && !Object.prototype.hasOwnProperty.call(world, "frontPersonnel")) return world;
  return { ...world, frontPersonnel: next };
};
