/*! Open Historia — player-facing political presentation helpers */

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const asList = (value, limit = 12) => {
  const source = Array.isArray(value) ? value : (clean(value) ? [value] : []);
  const out = [];
  const seen = new Set();
  for (const entry of source) {
    const text = clean(entry);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
};

const clampSupport = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
};

const partyKey = (party, index = 0) => clean(party?.id || party?.name) || `party-${index}`;

const officeholderName = (value) => {
  if (typeof value === "string") return clean(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return clean(value.name || value.id);
};

const publicPartyRow = (party, index) => {
  if (!party || typeof party !== "object" || Array.isArray(party)) return null;
  const name = clean(party.name);
  if (!name) return null;
  const support = clampSupport(party?.support?.percent);
  return {
    id: partyKey(party, index),
    name,
    shortName: clean(party.shortName || party.abbreviation),
    support,
    ideology: asList(party.ideology, 5),
    goals: asList(party.goals, 6),
    publicPriorities: asList(party.publicPriorities, 6),
    publicForeignPolicy: asList(party.publicForeignPolicy, 6),
    publicDescription: clean(party.publicDescription),
    leader: officeholderName(party.leader),
    ruling: party.ruling === true,
    coalition: party.coalition === true,
    color: clean(party.color),
  };
};

const samePartyToken = (left, right) => {
  const a = clean(left).toLocaleLowerCase();
  const b = clean(right).toLocaleLowerCase();
  return Boolean(a && b && a === b);
};

const governmentPartyTokens = (government) => [
  ...asList(government?.rulingParties, 12),
  ...asList(government?.coalition, 12),
  clean(government?.rulingParty),
].filter(Boolean);

const markGovernmentParties = (parties, government) => {
  const tokens = governmentPartyTokens(government);
  if (!tokens.length) return parties;
  return parties.map((party) => {
    const governing = tokens.some((token) => samePartyToken(token, party.id) || samePartyToken(token, party.name) || samePartyToken(token, party.shortName));
    if (!governing) return party;
    return {
      ...party,
      ruling: party.ruling || asList(government?.rulingParties, 12).some((token) => samePartyToken(token, party.id) || samePartyToken(token, party.name) || samePartyToken(token, party.shortName)) || samePartyToken(government?.rulingParty, party.id) || samePartyToken(government?.rulingParty, party.name),
      coalition: party.coalition || asList(government?.coalition, 12).some((token) => samePartyToken(token, party.id) || samePartyToken(token, party.name) || samePartyToken(token, party.shortName)),
    };
  });
};

// Build a bounded, presentation-only party landscape from an already public
// Political Knowledge projection. The result never includes arbitrary canonical
// Party fields: callers can safely render every property returned here.
export const buildPoliticalPartyLandscape = (
  publicPoliticalProfile,
  { minSlicePercent = 4, maxNamedSlices = 6 } = {},
) => {
  const source = Array.isArray(publicPoliticalProfile?.parties) ? publicPoliticalProfile.parties : [];
  const government = publicPoliticalProfile?.government || {};
  const rows = markGovernmentParties(
    source.map(publicPartyRow).filter(Boolean),
    government,
  ).sort((left, right) => (Number(right.support) || 0) - (Number(left.support) || 0) || left.name.localeCompare(right.name));

  const supported = rows.filter((party) => Number.isFinite(party.support) && party.support > 0);
  if (!supported.length) return { parties: rows, slices: [], totalKnownSupport: 0 };

  const explicitOther = supported.find((party) => /^(other|others|other parties|independent|independents)$/i.test(party.name));
  const namedCandidates = supported.filter((party) => party !== explicitOther);
  const keep = [];
  const grouped = [];
  for (const party of namedCandidates) {
    if (keep.length < Math.max(1, maxNamedSlices) && (party.support >= minSlicePercent || keep.length < 3)) keep.push(party);
    else grouped.push(party);
  }

  const knownSupport = supported.reduce((sum, party) => sum + (party.support || 0), 0);
  const remainder = Math.max(0, Math.round((100 - knownSupport) * 10) / 10);
  const groupedSupport = grouped.reduce((sum, party) => sum + (party.support || 0), 0);
  const explicitOtherSupport = explicitOther?.support || 0;
  const otherSupport = Math.round((groupedSupport + explicitOtherSupport + remainder) * 10) / 10;

  const slices = keep.map((party) => ({ ...party, isOther: false, members: [] }));
  if (otherSupport > 0.05) {
    const members = [
      ...(explicitOther ? [explicitOther] : []),
      ...grouped,
    ];
    slices.push({
      id: "__other__",
      name: "Other",
      shortName: "Other",
      support: otherSupport,
      ideology: [],
      goals: [],
      publicPriorities: [],
      publicForeignPolicy: [],
      publicDescription: remainder > 0.05 ? "Includes parties or voters not individually represented in the current public political profile." : "",
      leader: "",
      ruling: members.some((party) => party.ruling),
      coalition: members.some((party) => party.coalition),
      color: "",
      isOther: true,
      members,
      unlistedSupport: remainder,
    });
  }

  // If authored support somehow exceeds 100, retain the authored percentages for
  // labels/details but give the chart bounded proportional weights.
  const chartTotal = slices.reduce((sum, party) => sum + (party.support || 0), 0) || 1;
  const boundedSlices = slices.map((party) => ({
    ...party,
    chartPercent: Math.max(0, (party.support / chartTotal) * 100),
  }));

  return {
    parties: rows,
    slices: boundedSlices,
    totalKnownSupport: Math.round(Math.min(100, knownSupport) * 10) / 10,
  };
};
