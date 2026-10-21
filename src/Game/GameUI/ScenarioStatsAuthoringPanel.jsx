/*! Open Historia — human-oriented, reviewed country Stats scenario authoring. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { callAI } from "../AI/main.jsx";
import { interpretScenarioStatsAiResponse, buildScenarioStartingStatsTool } from "./scenarioStatsAiResponse.js";
import { buildTargetStatsTerritorialBasisKernel, projectCountryStatsScenarioCatalog } from "../AI/countryStatsWorkerKernel.js";
import { downloadScenarioJsonAsset, loadScenarioDetails, saveScenario } from "../../runtime/library.js";
import { normalizeGameDate } from "../../runtime/gameDates.js";
import {
  applyScenarioStatsManualEdits,
  authorApprovedMacroEstimates,
  createReviewedScenarioStatsSheet,
  scenarioStatsCoverage,
  scenarioStatsEditorValues,
  scenarioStatsPolityKey,
  scenarioStatsRequiredReady,
} from "../../runtime/scenarioStatsAuthoring.js";
import { DEFAULT_STAT_INDEX_KEYS } from "../../runtime/statIndexDefinitions.js";
import { reviewScenarioNationalMetricAliases } from "../../runtime/statsMetricAliasReview.js";
import { logDebugEvent } from "../../runtime/debugLog.js";

const clean = (value) => String(value ?? "").trim();
const copy = (value) => JSON.parse(JSON.stringify(value));
const inputStyle = { background: "rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.17)", borderRadius: 9, padding: ".55rem .6rem", color: "#fff", minWidth: 0, width: "100%" };
const buttonStyle = { background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 10, padding: ".55rem .8rem", color: "#fff", cursor: "pointer", fontWeight: 700 };
const cardStyle = { border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: ".8rem", background: "rgba(255,255,255,.025)" };
const summary = (sheet) => sheet?.population?.total ? `${Number(sheet.population.total).toLocaleString()} residents · ${Number(sheet.economy?.gdp ?? 0).toLocaleString()} GDP` : "No quantitative baseline";
const numeric = (value) => value === "" ? "" : Number(value);
const NUMBER_FIELDS = ["population", "gdp", "stability", "gdpGrowth", "inflation", "unemployment", "publicDebt", "budgetBalance", "agriculture", "industry", "services", "birthRate", "deathRate", "birthTrendPerYear", "deathTrendPerYear"];
const FORM_FIELDS = [
  ["population", "Population (people)"], ["gdp", "Annual GDP (shared scenario accounting units)"],
  ["capital", "Capital"], ["continent", "Region / continent"], ["government", "Government"], ["leader", "Leader"],
  ["stability", "Stability (0–100)"], ["currency", "Currency"],
  ["gdpGrowth", "GDP growth (%/year)"], ["inflation", "Inflation (%)"], ["unemployment", "Unemployment (%)"],
  ["publicDebt", "Public debt (% of GDP)"], ["budgetBalance", "Budget balance (% of GDP/year)"],
  ["agriculture", "Agriculture share (%)"], ["industry", "Industry share (%)"], ["services", "Services share (%)"],
  ["birthRate", "Annual births per 1,000 people"], ["deathRate", "Annual deaths per 1,000 people"],
  ["birthTrendPerYear", "Change in birth rate per year"], ["deathTrendPerYear", "Change in death rate per year"],
];
const MAX_BATCH_COUNTRIES = 3;
const MAX_CALLS_PER_RUN = 10;
const snapshot = (value) => JSON.stringify(value ?? null);

const makePrompt = ({ batch, scenarioDate, details, customKeys }) => {
  const custom = Array.isArray(customKeys);
  const world = details.data?.world ?? {};
  const game = details.data?.game ?? {};
  const scenario = details.scenario ?? {};
  const startingEvents = (Array.isArray(details.data?.events) ? details.data.events : [])
    .slice(0, 20).map((event) => `${clean(event.date)} ${clean(event.title)}`).filter(Boolean);
  const context = [
    `SCENARIO: ${clean(scenario.name)}. Starting date ${scenarioDate}.`,
    `Player's starting country: ${clean(game.country)}.`,
    `Scenario prehistory: ${clean(world.startingTimelineText).slice(0, 3200) || "not provided"}`,
    `Simulation rules: ${clean(world.simulationRules).slice(0, 1800) || "not provided"}`,
    `Pre-start event headings: ${startingEvents.join("; ").slice(0, 1400) || "not provided"}`,
    ...batch.map(({ code, name, basis }, index) => [
      `OUTPUT TOOL SLOT: country${index + 1}Json is EXCLUSIVELY for ${code} (${name}).`,
      `CANONICAL SCENARIO COUNTRY: ${code} (display name ${name}). The output slot, not an AI-invented abbreviation, supplies this identity.`,
      `AUTHORITATIVE TERRITORIAL BASIS (legal sovereignty, not occupied lands):`,
      clean(basis.context).slice(0, 4100),
      `Return exactly ${basis.macroPlan.length} regional macro bucket rows with the supplied indices:`,
      basis.macroPlan.map((entry) => `M${entry.index}: ${entry.members.map((item) => item.geography).slice(0, 12).join(", ")} (${entry.members.length} map components)`).join("\n"),
    ].join("\n")),
  ].join("\n\n");
  return {
    system: `You propose STARTING Statistics for an alternate-history/grand-strategy scenario. Generate historically and scenario-plausible ESTIMATES for the provided starting date, not today's statistics or future historical outcomes. Scenario canon outranks remembered real-world history. Do not generate anything for an unlisted country. This is author review only; no simulation changes happen from this response. Use numbers as JSON numbers, not abbreviations or prose. Call the required submit_scenario_starting_statistics output tool, filling every required countryNJson STRING field with a JSON OBJECT containing the proposal for THAT SLOT'S specified canonical country only. Every countryNJson has two REQUIRED numeric tool arguments: countryNPublicDebt (0..1000) and countryNBudgetBalance (-1000..1000); set both as JSON NUMBERS for the matching slot, and OMIT publicDebt and budgetBalance inside the countryNJson string. The function's required argument names bind the identities. Do NOT add "code", "countryCode", "polityCode", "country", "polity" or "name" in the objects; do not use ISO abbreviations as identities. Never answer with unstructured explanation. Each object must include "macro": a list of {"index":integer,"population":integer,"gdpPerCapita":number,"group":"core"|"integrated"|"overseas/dependent"} for EXACTLY the given native bucket indices. A regional bucket may have population 0 and gdpPerCapita 0 only if it is genuinely uninhabited; national population must remain positive. The native system expands these values to REAL mapped geography; you must never invent province keys. Do not include military units, artificial territorial entries, dates, or continuity/clock receipts. Estimation is permitted but must be labelled in "basisNote"; your numbers are proposals for human review, not observations. ${custom
      ? `This scenario uses a CUSTOM presentation sheet. For each country also return "customStats" object with EXACT keys ${JSON.stringify(customKeys)} (all finite numerical values), required typed numeric publicDebt and budgetBalance tool arguments for that country slot. Include optional "birthRate" and "deathRate" (0..80, births/deaths per 1,000/year), optional "birthTrendPerYear" and "deathTrendPerYear" (-2..2) only when the demographic meaning fits the scenario.`
      : `Standard modern native sheet: for EACH country also return nonempty "capital", "continent", "government", "leader", "currency"; number "stability" (0..100), "gdpGrowth" (-100..100), "inflation" (-1000..1000), "unemployment" (0..100), required typed numeric publicDebt and budgetBalance tool arguments for that country slot, "agriculture", "industry", "services" (each 0..100, sum EXACTLY 100), and "indices" with all six keys ${JSON.stringify(DEFAULT_STAT_INDEX_KEYS)} as 0..100. Include "birthRate" and "deathRate" (0..80 per thousand per year) and "birthTrendPerYear", "deathTrendPerYear" (-2..2), based on the scenario era and circumstances. No country may inherit another era's rates.`} Be careful with colonial territories: bucket population covers only held provinces, not the whole namesake geography. Do not invent missing scope.`,
    user: context,
  };
};

const ScenarioStatsAuthoringPanel = ({ details, formState, countryOptions, statsValue, statsDefinitionDirty = false, statsDefinitionUnavailable = false, onDetailsChange, onDirtyChange }) => {
  const scenarioId = details?.scenario?.id;
  const world = details?.data?.world ?? {};
  const scenarioDate = normalizeGameDate(details?.data?.game?.startDate || details?.data?.game?.gameDate);
  const unsavedDate = normalizeGameDate(formState?.gameDate);
  const dateMismatch = !scenarioDate || scenarioDate !== unsavedDate;
  const authoringBlocked = dateMismatch || statsDefinitionDirty || statsDefinitionUnavailable;
  const customKeys = useMemo(() => statsValue?.custom
    ? [...new Set((statsValue.sections ?? []).flatMap((section) => (section.stats ?? []).map((item) => clean(item.key))).filter(Boolean))]
    : null, [statsValue]);
  const coverage = useMemo(() => scenarioStatsCoverage(world, countryOptions, { customKeys }), [world, countryOptions, customKeys]);
  const missing = coverage.filter((row) => row.status !== "ready");
  const [selected, setSelected] = useState("");
  const active = coverage.find((row) => row.code === selected) || coverage[0];
  const activeCode = active?.code ?? "";
  const currentSheet = world.countryStats?.[activeCode] ?? null;
  const aliasReviewRows = useMemo(() => reviewScenarioNationalMetricAliases(statsValue, currentSheet)
    .filter((row) => row.reviewRequired), [statsValue, currentSheet]);
  const [fields, setFields] = useState({});
  const [dirty, setDirty] = useState(false);
  const [proposals, setProposals] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const catalogRef = useRef(null);
  const draftToOpen = useRef("");
  const runId = useRef(0);
  useEffect(() => {
    setSelected(""); setProposals({}); setProgress(""); setDirty(false); setError(""); catalogRef.current = null;
    return () => { runId.current += 1; };
  }, [scenarioId]);
  useEffect(() => {
    const draft = draftToOpen.current === activeCode ? proposals[activeCode]?.sheet : null;
    draftToOpen.current = "";
    setFields(scenarioStatsEditorValues(draft || currentSheet, customKeys)); setDirty(Boolean(draft));
  }, [activeCode, currentSheet, customKeys]);
  useEffect(() => { onDirtyChange?.(dirty || Object.keys(proposals).length > 0); }, [dirty, proposals, onDirtyChange]);
  const update = (key, value) => { setFields((previous) => ({ ...previous, [key]: value })); setDirty(true); };
  const updateNested = (key, name, value) => { setFields((previous) => ({ ...previous, [key]: { ...(previous[key] || {}), [name]: value } })); setDirty(true); };
  const ensureCatalog = async () => {
    const mapRevision = snapshot(details?.assetStatus?.regionsGeojson);
    if (catalogRef.current?.scenarioId === scenarioId && catalogRef.current?.mapRevision === mapRevision) return catalogRef.current.catalog;
    // Only the scenario's own map is authoritative. Do not reuse a different
    // campaign's cached geography or silently fall back to modern borders.
    const geojson = await downloadScenarioJsonAsset(scenarioId, "regionsGeojson");
    if (!Array.isArray(geojson?.features) || !geojson.features.length) {
      throw new Error("This scenario does not expose an authoritative regions GeoJSON. Map-backed generation is unavailable; existing Stats can still be edited. No fake geography will be created.");
    }
    const catalog = projectCountryStatsScenarioCatalog(geojson);
    if (!catalog.length) throw new Error("The region file has no usable region IDs.");
    catalogRef.current = { scenarioId, mapRevision, catalog };
    return catalog;
  };
  const basisFor = async (code, catalog) => buildTargetStatsTerritorialBasisKernel({
    bundle: { world, game: details.data?.game, events: details.data?.events || [] },
    code, scenarioCatalog: catalog,
  });
  const loadDraftToEditor = (row) => {
    draftToOpen.current = row.code;
    setSelected(row.code);
    setFields(scenarioStatsEditorValues(row.sheet, customKeys));
    setDirty(true);
  };
  const applyToScenario = async (patches, guards) => {
    if (authoringBlocked) throw new Error("Save the scenario start date and Statistics sheet definition before writing country baselines.");
    const fresh = await loadScenarioDetails(scenarioId);
    const freshDate = normalizeGameDate(fresh?.data?.game?.startDate || fresh?.data?.game?.gameDate);
    if (freshDate !== scenarioDate) throw new Error("Scenario start date changed during Statistics editing. Reload before applying.");
    if (snapshot(fresh.assetStatus?.regionsGeojson) !== snapshot(details.assetStatus?.regionsGeojson)) {
      throw new Error("Scenario map asset changed during authoring; reload the region ledger before saving.");
    }
    // A concurrent map change invalidates every planned territorial component.
    const freshWorld = fresh.data?.world ?? {};
    if (snapshot(freshWorld.regionOwnershipOverrides) !== snapshot(world.regionOwnershipOverrides)
      || snapshot(freshWorld.regionSovereigntyOverrides) !== snapshot(world.regionSovereigntyOverrides)
      || snapshot(freshWorld.ownerCodes) !== snapshot(world.ownerCodes)) {
      throw new Error("Scenario ownership or polity roster changed. Reload Statistics proposals against the new map.");
    }
    for (const [code, prior] of Object.entries(guards)) {
      if (snapshot(freshWorld.countryStats?.[code]) !== prior) throw new Error(`${code}'s Statistics changed after generation; regenerate or reload instead of overwriting the author's newer values.`);
    }
    const nextWorld = { ...freshWorld, countryStats: { ...(freshWorld.countryStats || {}), ...patches } };
    const saved = await saveScenario(scenarioId, { world: nextWorld });
    onDetailsChange(saved);
    return saved;
  };
  const saveManual = async () => {
    if (!activeCode || busy) return;
    setBusy(true); setError("");
    try {
      let base = proposals[activeCode]?.sheet ?? currentSheet;
      if (!base || !base.territorialComponents?.length) {
        // A manual baseline for a country not yet initialized is also mapped,
        // but the author's aggregate numbers are allocated transparently by
        // native regional weights (not hallucinated provinces).
        const catalog = await ensureCatalog();
        const basis = await basisFor(activeCode, catalog);
        const macro = authorApprovedMacroEstimates(basis, Number(fields.population), Number(fields.gdp));
        const row = {
          ...Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== "" && value !== null && value !== undefined)),
          macro,
          ...Object.fromEntries(NUMBER_FIELDS.filter((key) => fields[key] !== "" && fields[key] !== null && fields[key] !== undefined)
            .map((key) => [key, Number(fields[key])])),
        };
        base = createReviewedScenarioStatsSheet({ row, basis, date: scenarioDate, customKeys, existing: currentSheet });
      }
      const next = applyScenarioStatsManualEdits({ sheet: base, edits: fields, date: scenarioDate, customKeys });
      await applyToScenario({ [activeCode]: next }, { [activeCode]: snapshot(currentSheet) });
      setProposals((previous) => { const result = { ...previous }; delete result[activeCode]; return result; });
      setDirty(false); setProgress(`Saved ${active.name}'s starting Statistics.`);
    } catch (problem) { setError(problem?.message || String(problem)); }
    finally { setBusy(false); }
  };
  const runGeneration = async ({ selectedOnly = false } = {}) => {
    if (busy || authoringBlocked) return;
    setError(""); setProgress("Preparing starting Statistics…"); setBusy(true);
    const token = ++runId.current;
    const wanted = coverage.filter((row) => (selectedOnly ? row.code === activeCode : (!onlyMissing || row.status !== "ready")) && !proposals[row.code]);
    const queue = wanted.slice(0, MAX_BATCH_COUNTRIES * MAX_CALLS_PER_RUN);
    if (!queue.length) { setProgress("Nothing left to generate in this selection."); setBusy(false); return; }
    try {
      const catalog = await ensureCatalog();
      const all = { ...proposals };
      let calls = 0;
      let accepted = 0;
      let rejected = 0;
      for (let cursor = 0; cursor < queue.length; cursor += MAX_BATCH_COUNTRIES) {
        if (runId.current !== token) return;
        const group = queue.slice(cursor, cursor + MAX_BATCH_COUNTRIES);
        const prepared = [];
        for (const country of group) {
          const basis = await basisFor(country.code, catalog);
          if (!basis.plan?.length || !basis.macroPlan?.length) {
            all[country.code] = { ...country, error: "No authoritative mapped territory. Requires separate author review.", prior: snapshot(world.countryStats?.[country.code]) };
            rejected += 1;
          } else prepared.push({ ...country, basis });
        }
        if (!prepared.length) { setProposals({ ...all }); continue; }
        const prompts = makePrompt({ batch: prepared, scenarioDate, details, customKeys });
        setProgress(`Generating ${cursor + 1}–${Math.min(queue.length, cursor + group.length)} of ${queue.length} countries (max ${MAX_CALLS_PER_RUN} AI calls per run)…`);
        const response = await callAI(prompts.system, [{ role: "user", parts: [{ text: prompts.user }] }], {
          taskKey: "countryStatSheet", logLabel: "Scenario starting Statistics", languageMode: "none", reasoningEnabled: false,
          tool: buildScenarioStartingStatsTool(prepared),
        });
        calls += 1;
        if (runId.current !== token) return;
        const interpreted = interpretScenarioStatsAiResponse(response, prepared, { resolveIdentity: (identity) => scenarioStatsPolityKey(identity, world) });
        for (const item of prepared) {
          try {
            const answer = interpreted[item.code];
            if (!answer?.row) throw new Error(answer?.error || "No usable country proposal was returned.");
            const original = world.countryStats?.[item.code] ?? null;
            const sheet = createReviewedScenarioStatsSheet({ row: answer.row, basis: item.basis, date: scenarioDate, customKeys, existing: original });
            if (!scenarioStatsRequiredReady(sheet, customKeys)) throw new Error("Incomplete normalized baseline.");
            all[item.code] = { ...item, sheet, prior: snapshot(original), basisNote: clean(answer.row.basisNote).slice(0, 360), selected: true };
            accepted += 1;
          } catch (problem) {
            const reason = problem?.message || String(problem);
            // Debug information is about validation, not the private AI reply.
            logDebugEvent("stats", "Scenario Statistics proposal rejected", {
              scenarioId, country: item.code, reason: String(reason).slice(0, 300),
            }, { problem: true });
            all[item.code] = { ...item, error: reason, prior: snapshot(world.countryStats?.[item.code]) };
            rejected += 1;
          }
        }
        setProposals({ ...all });
      }
      setProgress(`${accepted} proposed for review; ${rejected} need attention. ${calls} AI request(s). ${wanted.length - queue.length} countries remain for a later batch.`);
    } catch (problem) {
      const reason = problem?.message || String(problem);
      logDebugEvent("stats", "Scenario Statistics generation interrupted", { scenarioId, reason: String(reason).slice(0, 300) }, { problem: true });
      setError(reason);
    }
    finally { if (runId.current === token) setBusy(false); }
  };
  const applyReviewed = async () => {
    const selectedRows = Object.values(proposals).filter((row) => row.selected && row.sheet && !row.error);
    if (!selectedRows.length || busy) return;
    if (!window.confirm(`Save ${selectedRows.length} reviewed AI-estimated country baseline(s) into this SCENARIO? Existing authored fields are preserved. This affects future new games, not current campaigns.`)) return;
    setBusy(true); setError("");
    try {
      const patches = Object.fromEntries(selectedRows.map((row) => [row.code, row.sheet]));
      const guards = Object.fromEntries(selectedRows.map((row) => [row.code, row.prior]));
      await applyToScenario(patches, guards);
      setProposals((previous) => { const after = { ...previous }; for (const row of selectedRows) delete after[row.code]; return after; });
      setProgress(`Saved ${selectedRows.length} reviewed starting baselines. New campaigns will inherit them.`);
    } catch (problem) { setError(problem?.message || String(problem)); }
    finally { setBusy(false); }
  };
  const displayRows = (customKeys ? FORM_FIELDS.filter(([key]) => ["population", "gdp", "publicDebt", "budgetBalance", "birthRate", "deathRate", "birthTrendPerYear", "deathTrendPerYear"].includes(key)) : FORM_FIELDS);
  return (
    <div style={{ display: "grid", gap: ".85rem" }}>
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, marginBottom: ".25rem" }}>Starting Statistics for every country</div>
        <div style={{ color: "#abb2bd", fontSize: ".78rem", lineHeight: 1.5 }}>Edit the world's initial conditions here. AI proposes historically/scenario-appropriate figures; you review and approve them. The native simulation takes over after a campaign starts.</div>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".7rem", fontWeight: 800 }}>
          <span>{coverage.filter((row) => row.status === "ready").length} ready</span><span>· {coverage.filter((row) => row.status === "incomplete").length} incomplete</span><span>· {coverage.filter((row) => row.status === "missing").length} missing</span><span>· {coverage.length} countries on map roster</span>
        </div>
        {dateMismatch && <p style={{ color: "#fcd34d" }}>Save the scenario's starting date before generating or saving Statistics.</p>}
        {statsDefinitionDirty && <p style={{ color: "#fcd34d" }}>Save the customized Statistics sheet definition first, then generate baselines against it.</p>}
        {statsDefinitionUnavailable && <p style={{ color: "#fca5a5" }}>The Statistics definition could not be loaded. Reopen this scenario before authoring starting values.</p>}
        {missing.length > 0 && <p style={{ color: "#cbd5e1", fontSize: ".74rem" }}>Countries with missing/incomplete Statistics will not get fully functional native panels merely by starting a new campaign. Generate or edit their baselines first.</p>}
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={buttonStyle} disabled={busy || authoringBlocked || !coverage.length} onClick={() => runGeneration()}>Generate {onlyMissing ? "missing" : "all"} - review first</button>
          <button type="button" style={buttonStyle} disabled={busy || authoringBlocked || !activeCode} onClick={() => runGeneration({ selectedOnly: true })}>Generate selected country</button>
          <label style={{ color: "#cbd5e1", fontSize: ".75rem" }}><input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)}/> Preserve complete country sheets</label>
        </div>
        {(busy || progress) && <p role="status" aria-live="polite" aria-busy={busy} style={{ fontSize: ".8rem", color: "#a7f3d0", fontWeight: 700, margin: ".6rem 0 .3rem" }}>
          {busy ? "⏳ " : ""}{progress || "Preparing starting Statistics…"}
        </p>}
        {error && <p role="alert" style={{ fontSize: ".78rem", color: "#fca5a5", margin: ".6rem 0 .3rem" }}>{error}</p>}
        <p style={{ fontSize: ".72rem", color: "#9ca3af", lineHeight: 1.5, marginBottom: 0 }}>Generation runs up to {MAX_CALLS_PER_RUN} AI requests (at most {MAX_CALLS_PER_RUN * MAX_BATCH_COUNTRIES} countries) per click, with real provider costs. Estimates aren't researched facts. No automatic application. Generate all can propose replacements, but existing authored values remain protected.</p>
      </div>
      {Object.keys(proposals).length > 0 && <div style={cardStyle}>
        <div style={{ fontWeight: 800 }}>Generated proposals - review before applying</div>
        <div style={{ color: "#9ca3af", fontSize: ".72rem", margin: ".4rem 0" }}>{Object.values(proposals).filter((row) => row.sheet).length} valid; {Object.values(proposals).filter((row) => row.error).length} need attention. Proposals are not saved in the scenario yet.</div>
        <div style={{ maxHeight: "15rem", overflow: "auto", display: "grid", gap: ".3rem" }}>
          {Object.values(proposals).map((row) => <div key={row.code} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: ".35rem", padding: ".35rem", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <input type="checkbox" disabled={!row.sheet || busy} checked={Boolean(row.selected && row.sheet)} onChange={(event) => setProposals((previous) => ({ ...previous, [row.code]: { ...previous[row.code], selected: event.target.checked } }))}/>
            <button type="button" onClick={() => { setSelected(row.code); if (row.sheet) loadDraftToEditor(row); }} style={{ ...buttonStyle, fontSize: ".7rem" }}>{row.name}</button>
            <span style={{ fontSize: ".7rem", color: row.error ? "#fca5a5" : "#a7f3d0" }}>{row.error || summary(row.sheet)}</span>
            {row.sheet && reviewScenarioNationalMetricAliases(statsValue, row.sheet).some((item) => item.status === "different") &&
              <span role="note" style={{ color: "#fcd34d", fontSize: ".7rem" }}><span>Canonical conflict</span>{" · "}<span>Review</span></span>}
            {row.basisNote && <span title={row.basisNote} style={{ fontSize: ".7rem", color: "#a3a3a3" }}>AI estimate</span>}
            {row.error && <button type="button" disabled={busy} style={{ ...buttonStyle, fontSize: ".68rem" }} onClick={() => setProposals((previous) => { const next = { ...previous }; delete next[row.code]; return next; })}>Retry later</button>}
          </div>)}
        </div>
        <div style={{ display: "flex", gap: ".5rem", marginTop: ".55rem", flexWrap: "wrap" }}>
          <button type="button" style={buttonStyle} disabled={busy || authoringBlocked || !Object.values(proposals).some((row) => row.selected && row.sheet)} onClick={applyReviewed}>Apply selected reviewed baselines</button>
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => { if (window.confirm("Discard all unapplied AI proposals?")) setProposals({}); }}>Discard drafts</button>
        </div>
      </div>}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, marginBottom: ".5rem" }}>Edit one country's starting values</div>
        <select value={activeCode} style={inputStyle} onChange={(event) => setSelected(event.target.value)}>
          {coverage.map((row) => <option key={row.code} value={row.code}>{row.name} - {row.status}</option>)}
        </select>
        {activeCode && <>
          <p style={{ fontSize: ".75rem", color: "#a3a3a3" }}>Saved: {summary(currentSheet)}. {proposals[activeCode]?.sheet ? "There's also an unapplied AI proposal above. You can use Save this country to approve your edits, or Apply selected reviewed baselines to save the original AI proposal." : ""}</p>
          {aliasReviewRows.length > 0 && <div role="note" style={{ border: "1px solid rgba(251,191,36,.35)", borderRadius: 8, padding: ".6rem", margin: ".6rem 0", color: "#fcd34d", fontSize: ".72rem" }}>
            <strong>{aliasReviewRows.some((row) => row.status === "different") ? "Canonical conflict" : "Review"}</strong>
            {aliasReviewRows.map((item) => <div key={item.key} style={{ marginTop: ".35rem", overflowWrap: "anywhere" }}>
              <span>{item.label}</span> · <code>{item.nativePath}</code> = <span data-no-translate>{item.nativeValue?.toLocaleString()}</span>
              {" ↔ "}<code>{item.customPath}</code> = <span data-no-translate>{item.customValue?.toLocaleString()}</span>
              {" · "}<span>Review</span>
            </div>)}
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: ".6rem" }}>
            {displayRows.map(([key, label]) => <label key={key} style={{ fontSize: ".7rem", color: "#cbd5e1", display: "grid", gap: ".2rem" }}>
              {label}
              <input style={inputStyle} type={NUMBER_FIELDS.includes(key) ? "number" : "text"} step={NUMBER_FIELDS.includes(key) ? "any" : undefined} value={fields[key] ?? ""} onChange={(event) => update(key, NUMBER_FIELDS.includes(key) ? numeric(event.target.value) : event.target.value)}/>
            </label>)}
            {!customKeys && DEFAULT_STAT_INDEX_KEYS.map((key) => <label key={key} style={{ fontSize: ".7rem", color: "#cbd5e1", display: "grid", gap: ".2rem" }}>
              {key.replace(/([A-Z])/g, " $1")}
              <input style={inputStyle} type="number" step="1" min="0" max="100" value={fields.indices?.[key] ?? ""} onChange={(event) => updateNested("indices", key, numeric(event.target.value))}/>
            </label>)}
            {customKeys && customKeys.map((key) => <label key={key} style={{ fontSize: ".7rem", color: "#cbd5e1", display: "grid", gap: ".2rem" }}>
              {key} (custom statistic)
              <input style={inputStyle} type="number" step="any" value={fields.customStats?.[key] ?? ""} onChange={(event) => updateNested("customStats", key, numeric(event.target.value))}/>
            </label>)}
          </div>
          <p style={{ fontSize: ".72rem", color: "#9ca3af" }}>Manual new-country entry distributes your total population/GDP across the scenario's real mapped geographies using simple native weights, not researched regional values. Review detailed AI proposals for better regional estimates. Birth/death rates are per 1,000 residents annually; leave both blank to keep natural demographic simulation uninitialized.</p>
          <button type="button" style={buttonStyle} disabled={busy || authoringBlocked || !dirty} onClick={saveManual}>Save this country's starting values</button>
        </>}
      </div>
      <div style={{ fontSize: ".72rem", color: "#9ca3af" }}>For unusual eras, use “Customize full sheet” below. This panel edits starting VALUES; that advanced editor controls which Statistics the player sees. Neither function changes an already running campaign.</div>
    </div>
  );
};

export default ScenarioStatsAuthoringPanel;
