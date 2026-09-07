// Open Historia Continuum — Round-Zero pre-game bootstrap lifecycle guards.
// Pure helpers on purpose: both gameplay.js and the UI can agree on the exact
// done-marker without importing browser/state machinery into tests.

const clean = (value) => String(value ?? "").trim();
const arr = (value) => Array.isArray(value) ? value : [];

export const hasPregameBootstrapMarker = (world) =>
  arr(world?.simulationHistory).some(
    (entry) => clean(entry?.mode).toLowerCase() === "pregame",
  );

export const isAtRoundOneStart = (game) => {
  const round = Number(game?.round) || 1;
  if (round !== 1) return false;
  const startDate = clean(game?.startDate);
  const gameDate = clean(game?.gameDate || game?.startDate);
  if (!startDate) return false;
  return !gameDate || gameDate === startDate;
};

export const isPregameBootstrapPending = ({ game, world } = {}) =>
  Boolean(clean(world?.startingTimelineText))
  && isAtRoundOneStart(game)
  && !hasPregameBootstrapMarker(world);

export const mergePregameSimulationHistory = (historyInput, pregameEntry, limit = 12) => {
  const history = arr(historyInput).filter(
    (entry) => clean(entry?.mode).toLowerCase() !== "pregame",
  );
  return [pregameEntry, ...history].slice(0, Math.max(1, Number(limit) || 12));
};

const eventKey = (event) => [
  clean(event?.date),
  clean(event?.title).toLowerCase(),
  clean(event?.description).toLowerCase(),
].join("\u0000");

const uniqueStrings = (values) => [...new Set(arr(values).map(clean).filter(Boolean))];

// A start-day event (for example an idle intelligence sighting) must never erase
// Round Zero. Preserve whatever already exists, reconcile exact duplicate event
// cards onto their existing ids, then add the generated historical cards.
export const mergePregameEventLogs = (existingInput, generatedInput) => {
  const existing = arr(existingInput).map((event) => ({ ...event }));
  const generated = arr(generatedInput).map((event) => ({ ...event }));
  const existingByKey = new Map();
  existing.forEach((event, index) => existingByKey.set(eventKey(event), { event, index }));

  const bootstrapEvents = [];
  const appended = [];
  const seenKeys = new Set(existing.map(eventKey));

  for (const event of generated) {
    const key = eventKey(event);
    const match = existingByKey.get(key);
    if (match) {
      const reconciled = {
        ...event,
        id: clean(match.event?.id) || clean(event?.id),
      };
      bootstrapEvents.push(reconciled);

      // Preserve the existing event's source/metadata while carrying across any
      // storyline links the Round-Zero bootstrap attached to the same card.
      const storylineIds = uniqueStrings([
        ...arr(match.event?.storylineIds),
        ...arr(event?.storylineIds),
      ]);
      if (storylineIds.length) {
        existing[match.index] = { ...match.event, storylineIds };
      }
      continue;
    }

    bootstrapEvents.push(event);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      appended.push(event);
    }
  }

  const mergedEvents = [...existing, ...appended];
  const allIso = mergedEvents.every((event) => /^\d{4}-\d{2}-\d{2}$/.test(clean(event?.date)));
  if (allIso) {
    mergedEvents.sort((a, b) => clean(a?.date).localeCompare(clean(b?.date)));
  } else if (appended.length) {
    // Non-Gregorian/ancient timelines cannot be mechanically date-sorted. The
    // generated pre-game list is already oldest-first, so put it before the
    // existing Round-One ledger rather than risking a bogus lexical ordering.
    return {
      bootstrapEvents,
      mergedEvents: [...appended, ...existing],
    };
  }

  return { bootstrapEvents, mergedEvents };
};
