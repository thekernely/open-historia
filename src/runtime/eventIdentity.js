/*! Open Historia — canonical timeline event identity helpers. */

import { isCanonicalGameDate } from "./gameDates.js";

const norm = (value) => String(value ?? "").trim();

const dateToken = (value) => {
  const compact = norm(value).replace(/[^0-9]/g, "");
  return compact || "undated";
};

const roundToken = (value) => {
  const round = Math.max(0, Math.trunc(Number(value) || 0));
  return String(round).padStart(4, "0");
};

const sequenceToken = (value) => String(Math.max(1, Math.trunc(Number(value) || 1))).padStart(3, "0");

export const duplicateEventIds = (events) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    const id = norm(event?.id);
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  }
  return [...duplicates];
};

// Allocate canonical ids ONLY for newly generated events. Existing history is never
// rewritten here: old saves may contain duplicate legacy ids that already appear in
// storyline/history references, and blindly renaming those records would be ambiguous.
// New AI events instead get ids that are unique across ordinary turn commits because
// the canonical round increases once per committed turn and each event has a unique
// sequence inside that turn.
export const allocateCanonicalTurnEventIds = ({
  existingEvents = [],
  newEvents = [],
  round = 0,
  preserveAcceptedIds = false,
} = {}) => {
  const used = new Set(
    (Array.isArray(existingEvents) ? existingEvents : [])
      .map((event) => norm(event?.id))
      .filter(Boolean),
  );

  // Intervene re-applies a journal of events the canonical turn ALREADY
  // accepted and the player already saw. Do not rebrand a native frontline
  // capture as an AI event or change a stable reference on replay. This is
  // deliberately not the normal new-generation path: every retained ID must
  // belong to this round/date, be unique, and not appear in prior history.
  // An old or malformed journal keeps the existing remapping behavior.
  const candidates = Array.isArray(newEvents) ? newEvents : [];
  if (preserveAcceptedIds && candidates.length) {
    const seen = new Set();
    const key = roundToken(round);
    const retain = candidates.every((event) => {
      const id = norm(event?.id);
      const date = norm(event?.date);
      const day = dateToken(date);
      const aiPrefix = `event-ai-r${key}-${day}-`;
      const nativeId = `event-native-front-r${key}-${date.startsWith("-") ? "bce-" : ""}${day}`;
      const canonical = (isCanonicalGameDate(date)
        && ((id.startsWith(aiPrefix) && /^\d{3,}$/.test(id.slice(aiPrefix.length)))
          || (norm(event?.source) === "front" && id === nativeId)));
      if (!canonical || used.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (retain) {
      return {
        events: candidates.map((event) => ({ ...event })),
        idMap: new Map([...seen].map((id) => [id, id])),
      };
    }
  }

  const idMap = new Map();
  let sequence = 0;
  const events = (Array.isArray(newEvents) ? newEvents : []).map((event) => {
    sequence += 1;
    const previousId = norm(event?.id);
    const token = dateToken(event?.date);
    let candidate = `event-ai-r${roundToken(round)}-${token}-${sequenceToken(sequence)}`;
    while (used.has(candidate)) {
      sequence += 1;
      candidate = `event-ai-r${roundToken(round)}-${token}-${sequenceToken(sequence)}`;
    }
    used.add(candidate);
    if (previousId && !idMap.has(previousId)) idMap.set(previousId, candidate);
    return {
      ...(event && typeof event === "object" ? event : {}),
      id: candidate,
    };
  });

  return { events, idMap };
};

// A record's eventIndexes count the events of the segment it was written in.
// Once it carries the round's ids they would point at other events of the
// round (Intervene's cut, the apply's fallback when an id is not found), so a
// record with ids leaves them behind.
export const remapLedgerEventIds = (updates, idMap) => {
  if (!(idMap instanceof Map) || idMap.size === 0) {
    return Array.isArray(updates) ? updates : [];
  }
  return (Array.isArray(updates) ? updates : []).map((update) => {
    const eventIds = [...new Set(
      (Array.isArray(update?.eventIds) ? update.eventIds : [])
        .map((value) => idMap.get(norm(value)) || norm(value))
        .filter(Boolean),
    )].slice(0, 24);
    return {
      ...(update && typeof update === "object" ? update : {}),
      eventIds,
      ...(eventIds.length && Array.isArray(update?.eventIndexes) ? { eventIndexes: [] } : {}),
    };
  });
};
