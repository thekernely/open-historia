/*! Open Historia - editor details response contract. No mutations. */
const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Scenario and game editors receive server-owned details, not arbitrary JSON.
// A late or malformed response must never become the active editor record.
// Return stable machine-readable reasons for diagnostics, not invented data.
export const editorDetailsIssue = ({ kind, expectedId, details } = {}) => {
  if (kind !== "scenario" && kind !== "game") return "unknown-kind";
  if (typeof expectedId !== "string" || !expectedId.trim()) return "missing-expected-id";
  if (!object(details)) return "missing-details";
  const record = details[kind];
  if (!object(record) || typeof record.id !== "string" || !record.id.trim()) return "missing-record";
  if (record.id !== expectedId) return "wrong-record";
  if (!object(details.data) || !object(details.data.world) || !object(details.data.game)) return "missing-world-or-game";
  return null;
};
