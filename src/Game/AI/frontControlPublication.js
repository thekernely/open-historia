/*! Open Historia - date-true canonical publication of native front controls.
 * The front resolver may temporarily place its mutations on nearby narrative
 * events. Before the canonical event fold, republish verified control flips at
 * their actual dates. No new front outcome is inferred here.
 */
import { addGameDays, compareGameDates, diffGameDays, isCanonicalGameDate } from "../../runtime/gameDates.js";
import { EVENT_IMPACT_KEYS } from "../../runtime/gameState.js";
import { FRONT_MARK } from "./frontTurn.js";

const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => typeof value === "string" ? value.trim() : "";
const publicEvent = (event) => rows(event?.audience).length === 0 && !clean(event?.audience);
const fail = (reason) => { throw new Error(`Native front control publication refused: ${reason}`); };
const emptyNativeImpacts = () => Object.fromEntries(EVENT_IMPACT_KEYS.map((key) => [key, []]));

// Called after the front engine and before native Statistics / event reduction.
// Preserve AI-authored events and their relative order, keep same-day public
// carriers when available, and emit at most one engine event per other day.
// Group-control operations remain on the legacy carrier: they are not national
// naval/economic control receipts and require their own separate design.
export const publishDatedFrontControlEvents = ({
  events = [], flips = [], fromDate = "", toDate = "", round = 0, historicalIds = [],
} = {}) => {
  if (!Array.isArray(events) || !Array.isArray(flips)) fail("malformed events or front results");
  const controls = flips.filter((flip) => flip?.kind === "control");
  if (!controls.length) return events;
  const days = diffGameDays(fromDate, toDate);
  // Preserve the existing fantasy-calendar front path, which has no canonical
  // civil date representation and cannot activate native dated Statistics.
  if (!isCanonicalGameDate(fromDate) || !isCanonicalGameDate(toDate)
    || !Number.isInteger(days)) return events;
  if (days < 1 || !Number.isInteger(round) || round < 1
    || !Array.isArray(historicalIds)) fail("invalid canonical turn boundaries");
  const used = new Set(historicalIds.map(clean).filter(Boolean));
  let previous = fromDate;
  for (const event of events) {
    const id = clean(event?.id), date = event?.date;
    if (!id || used.has(id) || !isCanonicalGameDate(date)
      || compareGameDates(date, fromDate) < 0
      || compareGameDates(date, toDate) > 0
      || compareGameDates(date, previous) < 0) fail("noncanonical, duplicate, or unordered accepted event");
    used.add(id);
    previous = date;
  }
  const seen = new Set(), byDate = new Map();
  for (const flip of controls) {
    const { day, date, regionId, from, to } = flip;
    if (!Number.isInteger(day) || day < 1 || day > days
      || !isCanonicalGameDate(date) || date !== addGameDays(fromDate, day)
      || !clean(regionId) || !clean(from) || !clean(to) || from === to)
      fail("malformed or undated canonical front flip");
    const key = JSON.stringify([day, regionId, from, to]);
    if (seen.has(key)) fail("duplicate canonical front flip");
    seen.add(key);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(flip);
  }
  if (events.length + byDate.size > 1000) fail("dated front event bound exceeded");
  // Discard ONLY the native control ops placed on nearby narrative carriers;
  // preserve authored control, group, project and all other mutations.
  const cleanEvents = events.map((event) => {
    const impacts = event?.impacts;
    if (!impacts || !Array.isArray(impacts.regionControlOps)
      || !impacts.regionControlOps.some((op) => op?.by === FRONT_MARK)) return event;
    return { ...event, impacts: { ...impacts,
      regionControlOps: impacts.regionControlOps.filter((op) => op?.by !== FRONT_MARK) } };
  });
  const produced = [];
  for (const [date, changes] of byDate) {
    const syntheticOps = [];
    for (const flip of changes) {
      const operation = {
        op: "control", regionId: flip.regionId, fromCode: flip.from, toCode: flip.to,
        basis: "occupation", note: clean(flip.battlefield), by: FRONT_MARK,
      };
      // Do not attribute a capture to an unrelated article merely because
      // it shares the date. Reuse ONLY the public narrative that originally
      // carried this exact engine result, if its date was already correct.
      const carrierIndex = events.findIndex((event) =>
        event.date === date && publicEvent(event)
        && rows(event?.impacts?.regionControlOps).some((op) =>
          op?.by === FRONT_MARK && op?.op === "control"
          && op.regionId === flip.regionId && op.fromCode === flip.from && op.toCode === flip.to));
      if (carrierIndex < 0) {
        syntheticOps.push(operation);
      } else {
        const event = cleanEvents[carrierIndex];
        cleanEvents[carrierIndex] = { ...event, impacts: { ...event.impacts,
          regionControlOps: [...rows(event.impacts?.regionControlOps), operation] } };
      }
    }
    if (!syntheticOps.length) continue;
    const id = `event-native-front-r${String(round).padStart(4, "0")}-${date.startsWith("-") ? "bce-" : ""}${date.replace(/[^0-9]/g, "")}`;
    if (used.has(id)) fail("native event identity collision");
    used.add(id);
    produced.push({
      id, date, createdAt: `${date}T00:00:00.000Z`,
      title: "Frontline control changes",
      description: "The native front engine recorded territorial control changes on this date.",
      kind: "world", importance: "minor", source: "front", notable: false,
      impacts: { ...emptyNativeImpacts(), regionControlOps: syntheticOps },
    });
  }
  // These are NEW canonical events, not provider events. Downstream gameplay
  // iterates impact families directly (createdChats, etc.), whereas the
  // territory reducer normalizes only its own copy. Use the canonical family
  // keys above for a complete in-memory event, without re-normalizing or
  // altering already-verified region-control operations.
  // Stable sorting leaves the model events in their original same-day order.
  return [...cleanEvents, ...produced].sort((a, b) => compareGameDates(a.date, b.date));
};
