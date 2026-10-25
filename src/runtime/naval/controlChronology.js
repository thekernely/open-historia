/*! Open Historia - verified region-control changes for daily naval evidence.
 * The land front supplies dated region IDs. A naval projection may read those
 * control changes for coast/land-border pressure, but must never infer absent
 * region IDs, wars, or undated control transitions as zero blockade pressure.
 */
const label = (v) => typeof v === "string" || typeof v === "number" ? String(v).trim() : "";

export const normalizeNavalControlChronology = ({ grid, controllerOf, changes, days } = {}) => {
  if (!grid || !Array.isArray(grid.ids) || typeof controllerOf !== "function"
    || !Array.isArray(changes) || !Number.isInteger(days) || days < 1 || changes.length > 3000) return null;
  const known = new Set(grid.ids.map(label).filter(Boolean));
  const controller = new Map();
  const normalized = [];
  const previous = new Map();
  for (const raw of changes) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || !Number.isInteger(raw.day) || raw.day < 0 || raw.day > days
      || !known.has(label(raw.regionId)) || !label(raw.to) || !label(raw.from)
      || !["control", undefined].includes(raw.kind)) return null;
    normalized.push({ day: raw.day, regionId: label(raw.regionId), from: label(raw.from), to: label(raw.to) });
  }
  normalized.sort((a, b) => a.day - b.day || a.regionId.localeCompare(b.regionId));
  const distinct = [];
  for (const item of normalized) {
    const last = distinct.at(-1);
    if (last?.day === item.day && last.regionId === item.regionId
      && last.from === item.from && last.to === item.to) continue;
    distinct.push(item);
    const current = previous.get(item.regionId) || label(controllerOf(item.regionId));
    // A duplicate is safe only if it describes the same actual control transition.
    if (current !== item.from || current === item.to) return null;
    previous.set(item.regionId, item.to);
  }
  return distinct;
};

export const sameNavalControlChronology = (one, two) => {
  if (!Array.isArray(one) || !Array.isArray(two)) return false;
  const stable = (rows) => [...new Set(rows.map((row) => `${row.day}|${row.regionId}|${row.from}|${row.to}`))].sort();
  const a = stable(one), b = stable(two);
  return a.length === b.length && a.every((entry, i) => entry === b[i]);
};
