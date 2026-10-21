/*! Open Historia - opt-in chronological Statistics boundary for the canonical event reducer.
 * The ordinary gameplay turn writer is NOT switched on by this source-only seam.
 */

// The chronology planner has already proved calendar, evidence and event order.
// This adapter must respect the reducer's existing single-pass event sequence:
// run native ticks and month-end samples between native event operations, never
// replay those operations once per month. It deliberately does not interpret
// narration or make new sovereign choices.
export const createStatsChronologyReducerBoundary = ({ steps, events, accrue, sample } = {}) => {
  if (!Array.isArray(steps) || !Array.isArray(events) || typeof accrue !== "function" || typeof sample !== "function") {
    throw new TypeError("A verified chronology and both native handlers are required");
  }
  let position = 0;
  let nextEventIndex = 0;
  let activeGroup = null;
  let activeDate = "";
  let groupOffset = 0;
  let complete = false;

  const throughNonEvents = (world) => {
    let next = world;
    while (position < steps.length && steps[position].type !== "events") {
      const step = steps[position++];
      if (step.type === "tick") next = accrue(next, step);
      else if (step.type === "sample") next = sample(next, step);
      else throw new Error("Unexpected Statistics chronology step");
      if (!next || typeof next !== "object" || !next.countryStats) {
        throw new Error("Native Statistics chronology returned invalid canonical world");
      }
    }
    return next;
  };

  return {
    beforeEvent(world, index, event) {
      if (complete || index !== nextEventIndex) throw new Error("Statistics event index is out of sequence");
      let next = world;
      if (!activeGroup) {
        next = throughNonEvents(next);
        const step = steps[position++];
        if (step?.type !== "events" || !Array.isArray(step.indices) || !step.indices.length) {
          throw new Error("Statistics chronology has no matching accepted event batch");
        }
        activeGroup = step.indices;
        activeDate = step.date;
        groupOffset = 0;
      }
      const expected = events[index];
      if (activeGroup[groupOffset] !== index || !expected || !event
        || event.id !== expected.id || event.date !== expected.date
        || event.date !== activeDate) {
        throw new Error("Statistics event identity diverged from chronological plan");
      }
      nextEventIndex++;
      groupOffset++;
      if (groupOffset === activeGroup.length) { activeGroup = null; activeDate = ""; }
      return next;
    },
    afterEvents(world, total) {
      if (complete || activeGroup || total !== nextEventIndex || total !== events.length) {
        throw new Error("Statistics chronology missing or repeated accepted events");
      }
      const next = throughNonEvents(world);
      if (position !== steps.length) throw new Error("Statistics chronology has unmatched events");
      complete = true;
      return next;
    },
  };
};
