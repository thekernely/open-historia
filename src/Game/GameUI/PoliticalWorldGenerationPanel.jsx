import React, { useMemo, useRef, useState } from "react";

import { loadScenarioDetails, saveScenario } from "../../runtime/library.js";
import {
  POLITICAL_WORLD_GENERATION_MODES,
  applyReviewedPoliticalGeneration,
  buildScenarioPoliticalGenerationInputs,
  buildScenarioPoliticalGenerationTestInputs,
} from "../../runtime/politicalWorldGenerationReview.js";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeProgressSampleError = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const message = clean(value);
    return message ? { polityKey: "", errors: [message] } : null;
  }
  if (typeof value !== "object") return null;
  const polityKey = clean(value.polityKey);
  const errors = (Array.isArray(value.errors) ? value.errors : [value.issue])
    .map(clean)
    .filter(Boolean);
  if (!polityKey && errors.length === 0) return null;
  return { polityKey, errors };
};

const panelStyle = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  marginBottom: "0.95rem",
  padding: "0.9rem",
};

const buttonStyle = {
  alignItems: "center",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "999px",
  color: "rgba(246,246,248,0.94)",
  cursor: "pointer",
  display: "inline-flex",
  fontSize: "0.8rem",
  fontWeight: 700,
  justifyContent: "center",
  minHeight: "2.1rem",
  padding: "0 0.85rem",
};

const selectStyle = {
  background: "rgba(255,255,255,0.05)",
  colorScheme: "dark",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  color: "#f8fafc",
  minHeight: "2.2rem",
  padding: "0 0.6rem",
};

const textareaStyle = {
  background: "rgba(0,0,0,0.2)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  color: "#e5e7eb",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.72rem",
  lineHeight: 1.45,
  minHeight: "13rem",
  padding: "0.75rem",
  resize: "vertical",
  width: "100%",
};

const MODE_OPTIONS = [
  {
    id: POLITICAL_WORLD_GENERATION_MODES.BALANCED,
    label: "Balanced",
    description: "Player/belligerents full; existing actors rich; other sovereign polities standard.",
  },
  {
    id: POLITICAL_WORLD_GENERATION_MODES.SIMULATION_READY,
    label: "Simulation-ready",
    description: "Player/belligerents full; every other sovereign polity rich enough for native response/disposition simulation.",
  },
  {
    id: POLITICAL_WORLD_GENERATION_MODES.BASIC,
    label: "Basic",
    description: "Player/belligerents full; other sovereign polities receive standard identity only.",
  },
];

const buildRows = (result, { allowRosterExpansion = false, selectValid = true } = {}) => {
  const rows = [];
  for (const entry of result?.proposals ?? []) {
    rows.push({
      polityKey: entry.item.polityKey,
      depth: entry.item.depth,
      needs: [...entry.item.needs],
      confidence: entry.validation?.provenance?.confidence ?? "unknown",
      selected: selectValid,
      allowEntityExpansion: allowRosterExpansion && entry.item.hasExistingActor === true,
      proposal: entry.proposal,
      actorPatchText: JSON.stringify(entry.proposal.actorPatch ?? {}, null, 2),
      sourceErrors: [],
      status: "valid",
    });
  }
  for (const failure of result?.failures ?? []) {
    rows.push({
      polityKey: failure.polityKey,
      depth: failure.depth,
      needs: [...(failure.needs ?? [])],
      confidence: "unknown",
      selected: false,
      allowEntityExpansion: false,
      proposal: null,
      actorPatchText: "",
      sourceErrors: [...(failure.errors ?? [])],
      status: "failed",
    });
  }
  return rows.sort((left, right) => left.polityKey.localeCompare(right.polityKey));
};

const patchSummary = (text) => {
  try {
    const patch = JSON.parse(text);
    const system = clean(patch?.politicalSystem?.type || patch?.politicalSystem?.representation);
    const parties = Array.isArray(patch?.parties) ? patch.parties.length : 0;
    const blocs = Array.isArray(patch?.powerBlocs) ? patch.powerBlocs.length : 0;
    const head = clean(patch?.government?.headOfGovernment?.name || patch?.government?.headOfGovernment || patch?.leader?.name || patch?.leader);
    const ruling = Array.isArray(patch?.government?.rulingPartyIds) ? patch.government.rulingPartyIds.map(clean).filter(Boolean) : [];
    const coalition = Array.isArray(patch?.government?.coalitionPartyIds) ? patch.government.coalitionPartyIds.map(clean).filter(Boolean) : [];
    return [
      system,
      head && `leader: ${head}`,
      ruling.length && `government: ${ruling.join(", ")}`,
      coalition.length && `coalition: ${coalition.join(", ")}`,
      parties && `${parties} parties`,
      blocs && `${blocs} blocs`,
    ].filter(Boolean).join(" · ") || "Structured political patch";
  } catch {
    return "Invalid JSON edit";
  }
};

const savedScenarioDate = (details) => clean(details?.data?.game?.startDate || details?.data?.game?.gameDate);

const formatDuration = (milliseconds) => {
  const seconds = Math.max(0, Math.round(Number(milliseconds) / 1000));
  if (!Number.isFinite(seconds)) return "Estimating…";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
};

const safeFileToken = (value) => clean(value)
  .replace(/[^a-z0-9._-]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80) || "scenario";

const downloadJsonFile = (filename, value) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const restoreResultFromDiagnostic = (diagnostic, { scenarioId = "", scenarioDate = "" } = {}) => {
  if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)) {
    throw new Error("Run log is not a Political World diagnostic object.");
  }
  if (diagnostic.kind !== "political-world-generation-diagnostic" || Number(diagnostic.schemaVersion) !== 1) {
    throw new Error("Run log is not a supported Political World generation diagnostic.");
  }

  const loggedScenarioId = clean(diagnostic?.scenario?.id);
  const loggedScenarioDate = clean(diagnostic?.scenario?.scenarioDate);
  const currentScenarioId = clean(scenarioId);
  const currentScenarioDate = clean(scenarioDate);
  if (currentScenarioId && loggedScenarioId && loggedScenarioId !== currentScenarioId) {
    throw new Error(`Run log belongs to scenario ${loggedScenarioId}, not ${currentScenarioId}.`);
  }
  if (currentScenarioDate && loggedScenarioDate && loggedScenarioDate !== currentScenarioDate) {
    throw new Error(`Run log scenario date ${loggedScenarioDate} does not match current canonical date ${currentScenarioDate}.`);
  }

  const accepted = Array.isArray(diagnostic.acceptedProposals) ? diagnostic.acceptedProposals : [];
  const failures = Array.isArray(diagnostic.failures) ? diagnostic.failures : [];
  if (!accepted.length && !failures.length) {
    throw new Error("Run log contains no accepted proposals or failures to restore.");
  }

  const seen = new Set();
  const proposals = accepted.map((entry, index) => {
    const polityKey = clean(entry?.polityKey || entry?.proposal?.polityKey);
    const proposal = entry?.proposal;
    if (!polityKey || !proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
      throw new Error(`Run log proposal ${index + 1} is missing a valid polityKey/proposal.`);
    }
    if (seen.has(polityKey)) throw new Error(`Run log contains duplicate accepted proposal for ${polityKey}.`);
    seen.add(polityKey);
    if (clean(proposal.polityKey) && clean(proposal.polityKey) !== polityKey) {
      throw new Error(`Run log proposal key mismatch for ${polityKey}.`);
    }
    if (loggedScenarioDate && clean(proposal.scenarioDate) && clean(proposal.scenarioDate) !== loggedScenarioDate) {
      throw new Error(`Run log proposal ${polityKey} targets ${clean(proposal.scenarioDate)}, not ${loggedScenarioDate}.`);
    }
    const needs = Array.isArray(entry?.needs) ? entry.needs.map(clean).filter(Boolean) : [];
    const item = {
      polityKey,
      depth: clean(entry?.depth || proposal?.depth || "standard") || "standard",
      needs,
      hasExistingActor: false,
    };
    return {
      item,
      proposal,
      historicalVerification: entry?.historicalVerification ?? null,
      validation: {
        appliedPaths: Array.isArray(entry?.appliedPathsPreview) ? [...entry.appliedPathsPreview] : [],
        provenance: { confidence: clean(proposal?.provenance?.confidence || "unknown") || "unknown" },
      },
    };
  });

  for (const failure of failures) {
    const polityKey = clean(failure?.polityKey);
    if (polityKey && seen.has(polityKey)) throw new Error(`Run log lists ${polityKey} as both accepted and failed.`);
  }

  const runMode = clean(diagnostic?.run?.mode || "balanced") || "balanced";
  return {
    scenarioDate: loggedScenarioDate || currentScenarioDate,
    generatedAt: clean(diagnostic?.run?.generatedAt) || new Date().toISOString(),
    uiRunKind: runMode,
    plan: { items: proposals.map((entry) => entry.item) },
    proposals,
    failures,
    warnings: Array.isArray(diagnostic.warnings) ? [...diagnostic.warnings] : [],
    batches: Array.isArray(diagnostic.batches) ? [...diagnostic.batches] : [],
    diagnostics: Array.isArray(diagnostic.diagnostics) ? [...diagnostic.diagnostics] : [],
    historicalVerification: diagnostic.historicalVerification ?? null,
    generatedPolities: proposals.length,
    failedPolities: failures.length,
  };
};

const PoliticalWorldGenerationPanel = ({ details, formState, onDetailsChange } = {}) => {
  const [mode, setMode] = useState(POLITICAL_WORLD_GENERATION_MODES.BALANCED);
  const [allowRosterExpansion, setAllowRosterExpansion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [progressInfo, setProgressInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [expandedPolity, setExpandedPolity] = useState("");
  const [filter, setFilter] = useState("");
  const [lastApplied, setLastApplied] = useState(null);
  const [runKind, setRunKind] = useState("balanced");
  const [geopoliticalResult, setGeopoliticalResult] = useState(null);
  const [geopoliticalApplying, setGeopoliticalApplying] = useState(false);
  const abortRef = useRef(null);
  const restoreRunLogInputRef = useRef(null);
  const generationStartedAtRef = useRef(0);
  const progressPhaseRef = useRef("");

  const inputs = useMemo(() => {
    try {
      return buildScenarioPoliticalGenerationInputs(details, { mode, maxBatchSize: 8 });
    } catch {
      return null;
    }
  }, [details, mode]);

  const testInputs = useMemo(() => {
    try {
      return buildScenarioPoliticalGenerationTestInputs(details, { maxBatchSize: 5, count: 15 });
    } catch {
      return null;
    }
  }, [details]);

  const scenarioDate = inputs?.scenarioDate ?? "";
  const unsavedDate = clean(formState?.gameDate);
  const dateMismatch = Boolean(unsavedDate && scenarioDate && unsavedDate !== scenarioDate);
  const polityCount = inputs?.polities?.length ?? 0;
  const actorCount = Object.keys(inputs?.politicalActors?.byPolity ?? {}).length;
  const selectedCount = rows.filter((row) => row.status === "valid" && row.selected).length;
  const progressTotal = Number(progressInfo?.totalPolities) || 0;
  const progressResolved = Math.max(0, Math.min(progressTotal, Number(progressInfo?.resolvedPolities) || 0));
  const progressPercent = progressTotal ? Math.round((progressResolved / progressTotal) * 100) : 0;
  const progressEtaMs = progressResolved > 0 && Number(progressInfo?.elapsedMs) > 0
    ? (Number(progressInfo.elapsedMs) / progressResolved) * (progressTotal - progressResolved)
    : null;
  const progressSampleError = normalizeProgressSampleError(progressInfo?.sampleError);
  const visibleRows = rows.filter((row) => !clean(filter) || row.polityKey.toLocaleLowerCase().includes(clean(filter).toLocaleLowerCase()));

  const updateRow = (polityKey, patch) => {
    setRows((current) => current.map((row) => row.polityKey === polityKey ? { ...row, ...patch } : row));
  };

  const generate = async (testMode = false) => {
    const generationInputs = testMode ? testInputs : inputs;
    if (!generationInputs || busy || applying) return;
    if (!generationInputs.scenarioDate) {
      setError("Save a valid scenario start date before generating political state.");
      return;
    }
    if (dateMismatch) {
      setError("The Scenario Editor date has unsaved changes. Save the scenario first so generation uses canonical start-date context.");
      return;
    }

    setBusy(true);
    setRunKind(testMode ? "test-15" : mode);
    setError("");
    setLastApplied(null);
    setProgress("Planning missing political state…");
    setProgressInfo(null);
    progressPhaseRef.current = "generation";
    generationStartedAtRef.current = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { generatePoliticalWorldProposals } = await import("../AI/politicalWorldGenerator.js");
      const allowEntityExpansionByPolity = allowRosterExpansion
        ? Object.fromEntries(Object.keys(generationInputs.politicalActors?.byPolity ?? {}).map((polityKey) => [polityKey, true]))
        : {};
      const nextResult = await generatePoliticalWorldProposals({
        ...generationInputs,
        allowEntityExpansionByPolity,
        maxAttempts: 2,
        signal: controller.signal,
        onBatch: ({
          phase = "generation", generationMode = "", verificationPass = "initial", batchIndex, totalBatches, attempt, maxAttempts, accepted, unresolved,
          resolvedPolities, totalPolities, acceptedTotal, failedTotal, verifiedTotal, correctedTotal, sampleError,
        }) => {
          if (progressPhaseRef.current !== phase) {
            progressPhaseRef.current = phase;
            generationStartedAtRef.current = Date.now();
          }
          setProgress(phase === "historical-verification"
            ? (verificationPass === "collision-recheck" ? "Re-checking conflicting officeholders…" : "Checking exact-date political history…")
            : (generationMode === "quantitative-landscape-fast" ? "Backfilling quantitative political landscapes…" : "Generating Political World…"));
          setProgressInfo({
            phase,
            generationMode,
            verificationPass,
            batchIndex,
            totalBatches,
            attempt,
            maxAttempts,
            accepted: accepted.length,
            unresolved: unresolved.length,
            resolvedPolities,
            totalPolities,
            acceptedTotal,
            failedTotal,
            verifiedTotal,
            correctedTotal,
            sampleError,
            elapsedMs: Math.max(0, Date.now() - generationStartedAtRef.current),
          });
        },
      });
      const resultWithRun = { ...nextResult, uiRunKind: testMode ? "test-15" : mode };
      setResult(resultWithRun);
      setRows(buildRows(resultWithRun, { allowRosterExpansion, selectValid: !testMode }));
      setExpandedPolity(nextResult.proposals?.[0]?.item?.polityKey ?? "");
      if (!nextResult.plan?.items?.length) {
        setProgress("Political world is already complete for this generation mode. No AI call was needed.");
      } else {
        const verification = nextResult.historicalVerification;
        const verificationSummary = verification?.enabled
          ? ` Exact-date check: ${verification.confirmed} confirmed, ${verification.corrected} corrected, ${verification.failed} failed.`
          : "";
        setProgress(`${testMode ? "Test complete: " : ""}${nextResult.generatedPolities} valid proposal(s), ${nextResult.failedPolities} failed.${verificationSummary}`);
      }
    } catch (nextError) {
      if (nextError?.name === "AbortError") setProgress("Political generation cancelled.");
      else setError(nextError?.message || String(nextError));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };


  const repairGoverningAlignment = async () => {
    if (!inputs || busy || applying) return;
    if (!inputs.scenarioDate) {
      setError("Save a valid scenario start date before repairing governing alignment.");
      return;
    }
    if (dateMismatch) {
      setError("The Scenario Editor date has unsaved changes. Save the scenario first so governing alignment uses canonical start-date context.");
      return;
    }

    setBusy(true);
    setRunKind("governing-alignment-repair");
    setError("");
    setLastApplied(null);
    setProgress("Planning missing governing-party / coalition references…");
    setProgressInfo(null);
    progressPhaseRef.current = "generation";
    generationStartedAtRef.current = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { generatePoliticalGoverningAlignmentRepair } = await import("../AI/politicalGoverningAlignmentRepair.js");
      const nextResult = await generatePoliticalGoverningAlignmentRepair({
        ...inputs,
        maxAttempts: 2,
        signal: controller.signal,
        onBatch: ({
          phase = "generation", generationMode = "governing-alignment-fast", batchIndex, totalBatches, attempt, maxAttempts,
          accepted, unresolved, resolvedPolities, totalPolities, acceptedTotal, failedTotal, sampleError,
        }) => {
          if (progressPhaseRef.current !== phase) {
            progressPhaseRef.current = phase;
            generationStartedAtRef.current = Date.now();
          }
          setProgress("Repairing governing-party / coalition alignment…");
          setProgressInfo({
            phase,
            generationMode,
            batchIndex,
            totalBatches,
            attempt,
            maxAttempts,
            accepted: accepted.length,
            unresolved: unresolved.length,
            resolvedPolities,
            totalPolities,
            acceptedTotal,
            failedTotal,
            sampleError,
            elapsedMs: Math.max(0, Date.now() - generationStartedAtRef.current),
          });
        },
      });
      const resultWithRun = { ...nextResult, uiRunKind: "governing-alignment-repair" };
      setResult(resultWithRun);
      setRows(buildRows(resultWithRun, { allowRosterExpansion: false, selectValid: true }));
      setExpandedPolity(nextResult.proposals?.[0]?.item?.polityKey ?? "");
      const nonPartisan = nextResult.governingAlignmentRepair?.nonPartisan?.length ?? 0;
      if (!nextResult.plan?.items?.length) {
        setProgress("Governing alignment is already present for every repairable party-based government. No AI call was needed.");
      } else {
        setProgress(`Governing alignment repair complete: ${nextResult.generatedPolities} valid patch(es), ${nonPartisan} genuinely non-partisan/partyless government(s), ${nextResult.failedPolities} failed. Historical verifier: 0 calls.`);
      }
    } catch (nextError) {
      if (nextError?.name === "AbortError") setProgress("Governing alignment repair cancelled.");
      else setError(nextError?.message || String(nextError));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };


  const recheckHistory = async () => {
    if (!details?.scenario?.id || !result || busy || applying) return;
    if (dateMismatch) {
      setError("The Scenario Editor date has unsaved changes. Save the scenario before re-checking exact-date political history.");
      return;
    }

    setBusy(true);
    setError("");
    setLastApplied(null);
    setProgress("Re-checking exact-date political history only…");
    setProgressInfo(null);
    progressPhaseRef.current = "historical-verification";
    generationStartedAtRef.current = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const freshDetails = await loadScenarioDetails(details.scenario.id);
      const freshInputs = buildScenarioPoliticalGenerationInputs(freshDetails, { mode, maxBatchSize: 8 });
      if (freshInputs.scenarioDate !== result.scenarioDate) {
        throw new Error(`Scenario start date changed from ${result.scenarioDate} to ${freshInputs.scenarioDate || "<blank>"}. Generate political proposals again for the new canonical date.`);
      }
      const { reverifyPoliticalWorldProposals } = await import("../AI/politicalWorldGenerator.js");
      const allowEntityExpansionByPolity = allowRosterExpansion
        ? Object.fromEntries(Object.keys(freshInputs.politicalActors?.byPolity ?? {}).map((polityKey) => [polityKey, true]))
        : {};
      const previousRows = new Map(rows.map((row) => [row.polityKey, row]));
      const nextResult = await reverifyPoliticalWorldProposals({
        result,
        scenarioDate: freshInputs.scenarioDate,
        politicalActors: freshInputs.politicalActors,
        scenarioContext: freshInputs.scenarioContext,
        contextByPolity: freshInputs.contextByPolity,
        allowEntityExpansionByPolity,
        signal: controller.signal,
        onBatch: ({
          phase = "historical-verification", verificationPass = "initial", batchIndex, totalBatches, attempt, maxAttempts, accepted, unresolved,
          resolvedPolities, totalPolities, acceptedTotal, failedTotal, verifiedTotal, correctedTotal, sampleError,
        }) => {
          setProgress(verificationPass === "collision-recheck"
            ? "Re-checking conflicting officeholders…"
            : "Re-checking exact-date political history only…");
          setProgressInfo({
            phase,
            verificationPass,
            batchIndex,
            totalBatches,
            attempt,
            maxAttempts,
            accepted: accepted.length,
            unresolved: unresolved.length,
            resolvedPolities,
            totalPolities,
            acceptedTotal,
            failedTotal,
            verifiedTotal,
            correctedTotal,
            sampleError,
            elapsedMs: Math.max(0, Date.now() - generationStartedAtRef.current),
          });
        },
      });
      const baseRunKind = clean(result.uiRunKind || runKind).replace(/-history-recheck$/, "");
      const resultWithRun = { ...nextResult, uiRunKind: `${baseRunKind}-history-recheck` };
      const nextRows = buildRows(resultWithRun, { allowRosterExpansion, selectValid: false }).map((row) => {
        const previous = previousRows.get(row.polityKey);
        if (!previous || row.status !== "valid") return row;
        return {
          ...row,
          selected: previous.selected === true,
          allowEntityExpansion: previous.allowEntityExpansion === true,
        };
      });
      setResult(resultWithRun);
      setRows(nextRows);
      setExpandedPolity((current) => nextRows.some((row) => row.polityKey === current) ? current : (nextRows[0]?.polityKey ?? ""));
      const verification = nextResult.historicalVerification;
      const collision = verification?.collisionRechecks;
      const collisionSummary = collision?.groups
        ? ` Collision review: ${collision.groups} group(s), ${collision.resolvedPolities?.length ?? 0} polity/polities resolved, ${collision.failedPolities?.length ?? 0} failed closed.`
        : "";
      setProgress(`Historical re-check complete without regenerating politics: ${verification?.confirmed ?? 0} confirmed, ${verification?.corrected ?? 0} corrected, ${verification?.failed ?? 0} failed.${collisionSummary}`);
      setRunKind(resultWithRun.uiRunKind);
    } catch (nextError) {
      if (nextError?.name === "AbortError") setProgress("Historical re-check cancelled.");
      else setError(nextError?.message || String(nextError));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const restoreRunLog = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file || busy || applying) return;
    setError("");
    setLastApplied(null);
    try {
      const diagnostic = JSON.parse(await file.text());
      const restored = restoreResultFromDiagnostic(diagnostic, {
        scenarioId: details?.scenario?.id,
        scenarioDate,
      });
      const restoredRunKind = clean(restored.uiRunKind || "balanced");
      const restoredRows = buildRows(restored, {
        allowRosterExpansion,
        selectValid: !restoredRunKind.startsWith("test-15"),
      });
      setResult(restored);
      setRows(restoredRows);
      setRunKind(restoredRunKind);
      setExpandedPolity(restoredRows.find((row) => row.status === "valid")?.polityKey ?? "");
      setProgressInfo(null);
      setProgress(`Restored Political World review from run log without any AI calls: ${restored.generatedPolities} accepted, ${restored.failedPolities} failed.`);
    } catch (nextError) {
      setError(`Could not restore Political World run log: ${nextError?.message || String(nextError)}`);
    } finally {
      if (event?.target) event.target.value = "";
    }
  };

  const downloadRunLog = () => {
    if (!result) return;
    const scenarioName = clean(details?.scenario?.name || details?.scenario?.id || "scenario");
    const log = {
      schemaVersion: 1,
      kind: "political-world-generation-diagnostic",
      scenario: {
        id: clean(details?.scenario?.id),
        name: scenarioName,
        scenarioDate: result.scenarioDate || scenarioDate,
      },
      run: {
        mode: result.uiRunKind || runKind,
        generatedAt: result.generatedAt,
        plannedPolities: result.plan?.items?.length ?? 0,
        accepted: result.generatedPolities ?? 0,
        failed: result.failedPolities ?? 0,
      },
      batches: result.batches ?? [],
      warnings: result.warnings ?? [],
      failures: result.failures ?? [],
      acceptedProposals: (result.proposals ?? []).map((entry) => ({
        polityKey: entry.item?.polityKey,
        depth: entry.item?.depth,
        needs: entry.item?.needs,
        proposal: entry.proposal,
        historicalVerification: entry.historicalVerification ?? null,
        appliedPathsPreview: entry.validation?.appliedPaths ?? [],
      })),
      diagnostics: result.diagnostics ?? [],
      historicalVerification: result.historicalVerification ?? null,
    };
    downloadJsonFile(`political-generation-${safeFileToken(scenarioName)}-${safeFileToken(result.scenarioDate || scenarioDate)}-${safeFileToken(result.uiRunKind || runKind)}.json`, log);
  };

  const cancel = () => abortRef.current?.abort();

  const generateGeopoliticalBaseline = async () => {
    if (!inputs || busy || applying || geopoliticalApplying) return;
    if (!inputs.scenarioDate) {
      setError("Save a valid scenario start date before generating geopolitical state.");
      return;
    }
    if (dateMismatch) {
      setError("The Scenario Editor date has unsaved changes. Save the scenario first so geopolitical generation uses canonical start-date context.");
      return;
    }
    setBusy(true);
    setRunKind("geopolitical-baseline");
    setError("");
    setLastApplied(null);
    setGeopoliticalResult(null);
    setProgress("Generating formal memberships, major agreements and power tiers…");
    setProgressInfo(null);
    generationStartedAtRef.current = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { generateGeopoliticalWorldBaseline } = await import("../AI/geopoliticalWorldGenerator.js");
      const nextResult = await generateGeopoliticalWorldBaseline({
        scenarioDate: inputs.scenarioDate,
        polities: inputs.polities,
        world: inputs.world,
        scenarioContext: inputs.scenarioContext,
        signal: controller.signal,
        onBatch: ({ batchIndex, totalBatches, resolvedPolities, totalPolities, warning }) => {
          setProgressInfo({
            phase: "geopolitical-baseline",
            generationMode: "geopolitical-fast",
            batchIndex,
            totalBatches,
            attempt: 1,
            maxAttempts: 1,
            accepted: resolvedPolities,
            unresolved: Math.max(0, totalPolities - resolvedPolities),
            resolvedPolities,
            totalPolities,
            acceptedTotal: resolvedPolities,
            failedTotal: 0,
            sampleError: warning ? { polityKey: "", errors: [warning] } : null,
            elapsedMs: Math.max(0, Date.now() - generationStartedAtRef.current),
          });
        },
      });
      setGeopoliticalResult(nextResult);
      setProgress(nextResult.requestedPolities
        ? `Geopolitical baseline ready for review: ${nextResult.records.length} polity power profiles, ${new Set(nextResult.records.flatMap((record) => record.memberships.map((entry) => entry.id))).size} institutions, ${nextResult.agreements.length} major agreements in ${nextResult.modelCalls} AI call(s).`
        : "Geopolitical baseline is already initialized. No AI call was needed.");
    } catch (nextError) {
      if (nextError?.name === "AbortError") setProgress("Geopolitical generation cancelled.");
      else setError(nextError?.message || String(nextError));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const applyGeopoliticalBaseline = async () => {
    if (!details?.scenario?.id || !geopoliticalResult || busy || applying || geopoliticalApplying) return;
    setGeopoliticalApplying(true);
    setError("");
    try {
      const freshDetails = await loadScenarioDetails(details.scenario.id);
      const freshDate = savedScenarioDate(freshDetails);
      if (freshDate !== geopoliticalResult.scenarioDate) {
        throw new Error(`Scenario start date changed from ${geopoliticalResult.scenarioDate} to ${freshDate || "<blank>"}. Regenerate the geopolitical baseline.`);
      }
      const { applyGeopoliticalWorldBaseline } = await import("../AI/geopoliticalWorldGenerator.js");
      const application = applyGeopoliticalWorldBaseline({
        world: freshDetails?.data?.world ?? {},
        result: geopoliticalResult,
        date: geopoliticalResult.scenarioDate,
      });
      const saved = await saveScenario(details.scenario.id, { world: application.world });
      onDetailsChange?.(saved);
      setProgress(`Applied geopolitical substrate (${application.applied.length} canonical operation(s)).`);
      setGeopoliticalResult(null);
    } catch (nextError) {
      setError(nextError?.message || String(nextError));
    } finally {
      setGeopoliticalApplying(false);
    }
  };

  const applySelected = async () => {
    if (!details?.scenario?.id || !result || !selectedCount || busy || applying) return;
    setApplying(true);
    setError("");
    try {
      const reviews = [];
      const parseErrors = [];
      for (const row of rows) {
        if (row.status !== "valid" || !row.selected) continue;
        let actorPatch;
        try {
          actorPatch = JSON.parse(row.actorPatchText);
        } catch (parseError) {
          parseErrors.push({ polityKey: row.polityKey, message: parseError.message });
          continue;
        }
        reviews.push({
          selected: true,
          proposal: row.proposal,
          actorPatch,
          allowEntityExpansion: row.allowEntityExpansion === true,
          fillEmptyGovernmentPartyRefs: row.needs.includes("governing_alignment"),
        });
      }
      if (parseErrors.length) {
        for (const entry of parseErrors) updateRow(entry.polityKey, { sourceErrors: [`Edited actorPatch is not valid JSON: ${entry.message}`] });
        throw new Error("Fix invalid JSON in the selected political proposals before applying.");
      }

      // Re-read immediately before persistence. Generation can take minutes and the
      // Scenario Editor may have been saved by another action meanwhile; applying a
      // stale world snapshot would silently roll those changes back.
      const freshDetails = await loadScenarioDetails(details.scenario.id);
      const freshDate = savedScenarioDate(freshDetails);
      if (freshDate !== result.scenarioDate) {
        throw new Error(`Scenario start date changed from ${result.scenarioDate} to ${freshDate || "<blank>"}. Regenerate political proposals for the new canonical date.`);
      }
      const freshWorld = freshDetails?.data?.world ?? {};
      const application = applyReviewedPoliticalGeneration({
        politicalActors: freshWorld.politicalActors,
        scenarioDate: result.scenarioDate,
        reviews,
      });
      if (!application.ok) {
        for (const entry of application.errors) updateRow(entry.polityKey, { sourceErrors: entry.errors });
        throw new Error("One or more reviewed political proposals no longer validate against current scenario canon. Nothing was applied.");
      }
      if (!application.applied.length) {
        setProgress("Selected proposals no longer fill missing fields; scenario canon was left unchanged.");
        return;
      }

      const saved = await saveScenario(details.scenario.id, {
        world: {
          ...freshWorld,
          politicalActors: application.politicalActors,
        },
      });
      onDetailsChange?.(saved);
      setLastApplied(application.applied);
      setProgress(`Applied political state to ${application.applied.length} polity/polities.`);
      setResult(null);
      setRows([]);
      setExpandedPolity("");
    } catch (nextError) {
      setError(nextError?.message || String(nextError));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: "1rem", fontWeight: 800 }}>Generate Political World</div>
      <div style={{ color: "rgba(255,255,255,0.58)", fontSize: "0.78rem", lineHeight: 1.55, marginTop: "0.3rem" }}>
        Fill only missing Political Actor state for this scenario. AI output stays in a review queue until you explicitly apply it; authored values are preserved by the native Phase006A contract.
      </div>

      <div style={{ display: "grid", gap: "0.55rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: "0.85rem" }}>
        <div style={{ background: "rgba(255,255,255,0.035)", borderRadius: 12, padding: "0.65rem" }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.65rem", textTransform: "uppercase" }}>Scenario date</div>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, marginTop: "0.15rem" }}>{scenarioDate || "Not set"}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.035)", borderRadius: 12, padding: "0.65rem" }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.65rem", textTransform: "uppercase" }}>Polities</div>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, marginTop: "0.15rem" }}>{polityCount}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.035)", borderRadius: 12, padding: "0.65rem" }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.65rem", textTransform: "uppercase" }}>Actors now</div>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, marginTop: "0.15rem" }}>{actorCount}</div>
        </div>
      </div>

      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.55rem", marginTop: "0.85rem" }}>
        <select disabled={busy || applying} onChange={(event) => setMode(event.target.value)} style={selectStyle} value={mode}>
          {MODE_OPTIONS.map((option) => <option key={option.id} style={{ background: "#2b2b30", color: "#f8fafc" }} value={option.id}>{option.label}</option>)}
        </select>
        <button disabled={busy || applying || dateMismatch} onClick={() => generate(false)} style={{ ...buttonStyle, background: "rgba(124,58,237,0.28)", opacity: busy || applying || dateMismatch ? 0.55 : 1 }} type="button">
          {busy && runKind !== "test-15" && runKind !== "governing-alignment-repair" ? "Generating…" : "Generate Missing Politics"}
        </button>
        <button disabled={busy || applying || dateMismatch} onClick={repairGoverningAlignment} style={{ ...buttonStyle, background: "rgba(180,83,9,0.2)", borderColor: "rgba(245,158,11,0.25)", opacity: busy || applying || dateMismatch ? 0.55 : 1 }} type="button">
          {busy && runKind === "governing-alignment-repair" ? "Repairing government…" : "Repair Governing Alignment"}
        </button>
        <button disabled={busy || applying || geopoliticalApplying || dateMismatch} onClick={generateGeopoliticalBaseline} style={{ ...buttonStyle, background: "rgba(5,150,105,0.18)", borderColor: "rgba(52,211,153,0.25)", opacity: busy || applying || geopoliticalApplying || dateMismatch ? 0.55 : 1 }} type="button">
          {busy && runKind === "geopolitical-baseline" ? "Generating geopolitics…" : "Generate Geopolitical Baseline"}
        </button>
        <button disabled={busy || applying || dateMismatch} onClick={() => generate(true)} style={{ ...buttonStyle, background: "rgba(14,116,144,0.24)", borderColor: "rgba(34,211,238,0.24)", opacity: busy || applying || dateMismatch ? 0.55 : 1 }} type="button">
          {busy && runKind === "test-15" ? "Testing 15…" : "Test 15 Polities"}
        </button>
        <input accept="application/json,.json" onChange={restoreRunLog} ref={restoreRunLogInputRef} style={{ display: "none" }} type="file" />
        <button disabled={busy || applying || dateMismatch} onClick={() => restoreRunLogInputRef.current?.click()} style={{ ...buttonStyle, background: "rgba(255,255,255,0.045)", opacity: busy || applying || dateMismatch ? 0.55 : 1 }} type="button">Restore Run Log</button>
        {result && !busy && runKind !== "governing-alignment-repair" && <button disabled={applying || dateMismatch} onClick={recheckHistory} style={{ ...buttonStyle, background: "rgba(14,116,144,0.22)", borderColor: "rgba(34,211,238,0.22)", opacity: applying || dateMismatch ? 0.55 : 1 }} type="button">Re-check History Only</button>}
        {result && !busy && <button onClick={downloadRunLog} style={{ ...buttonStyle, background: "rgba(255,255,255,0.045)" }} type="button">Download Run Log</button>}
        {busy && <button onClick={cancel} style={{ ...buttonStyle, background: "rgba(127,29,29,0.3)" }} type="button">Cancel</button>}
      </div>
      <div style={{ color: "rgba(255,255,255,0.48)", fontSize: "0.7rem", lineHeight: 1.45, marginTop: "0.45rem" }}>
        {MODE_OPTIONS.find((option) => option.id === mode)?.description} Uses the dedicated Political World Generation model setting.
      </div>
      <div style={{ color: "rgba(103,232,249,0.72)", fontSize: "0.68rem", lineHeight: 1.45, marginTop: "0.3rem" }}>
        Test 15 Polities runs a fixed diverse RICH-depth stress set (democracies, monarchies, party states, authoritarian and disputed polities), max 5 per batch and exactly 2 attempts. Test proposals start unselected and are review-only unless you explicitly select them.
      </div>
      <div style={{ color: "rgba(251,191,36,0.72)", fontSize: "0.68rem", lineHeight: 1.45, marginTop: "0.3rem" }}>
        Repair Governing Alignment is a separate surgical pass. It may only fill missing rulingPartyIds / coalitionPartyIds from party IDs that already exist in the scenario. It never runs the historical verifier, never expands rosters, and never rewrites leaders, government form, ideology, support, traits or strategy.
      </div>
      <div style={{ color: "rgba(110,231,183,0.75)", fontSize: "0.68rem", lineHeight: 1.45, marginTop: "0.3rem" }}>
        Generate Geopolitical Baseline initializes one power tier per polity plus strategically relevant formal memberships and major standing agreements. It uses a compact 48-polity transport (about five calls for a 202-polity world), writes to world.powerStatus / world.institutions / world.agreements, and never treats alignment tags as formal membership.
      </div>
      <label style={{ alignItems: "flex-start", color: "rgba(255,255,255,0.58)", display: "flex", fontSize: "0.7rem", gap: "0.45rem", lineHeight: 1.45, marginTop: "0.55rem" }}>
        <input
          checked={allowRosterExpansion}
          disabled={busy || applying}
          onChange={(event) => setAllowRosterExpansion(event.target.checked)}
          type="checkbox"
        />
        <span><strong>Allow roster expansion proposals.</strong> Explicitly authorize the generator to propose new party/power-bloc IDs where an existing authored roster is incomplete or intentionally empty. Every accepted expansion still requires the per-polity Apply checkbox below.</span>
      </label>

      {dateMismatch && (
        <div style={{ background: "rgba(245,158,11,0.11)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: 12, color: "#fde68a", fontSize: "0.75rem", marginTop: "0.7rem", padding: "0.65rem" }}>
          Save the Scenario Editor first: the visible date ({unsavedDate}) differs from saved canonical date ({scenarioDate}). Political generation always uses saved scenario canon.
        </div>
      )}
      {busy && progressTotal > 0 && (
        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, marginTop: "0.7rem", padding: "0.65rem" }}>
          <div style={{ alignItems: "center", display: "flex", fontSize: "0.7rem", gap: "0.6rem", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.76)", fontWeight: 700 }}>
              {progressResolved} / {progressTotal} polities resolved
            </span>
            <span style={{ color: "rgba(255,255,255,0.52)" }}>{progressPercent}%</span>
          </div>
          <div
            aria-valuemax={progressTotal}
            aria-valuemin={0}
            aria-valuenow={progressResolved}
            role="progressbar"
            style={{ background: "rgba(255,255,255,0.08)", borderRadius: 999, height: 8, marginTop: "0.45rem", overflow: "hidden" }}
          >
            <div style={{ background: "rgba(139,92,246,0.9)", borderRadius: 999, height: "100%", transition: "width 180ms ease", width: `${progressPercent}%` }} />
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.68rem", lineHeight: 1.5, marginTop: "0.45rem" }}>
            {progressInfo?.phase === "historical-verification"
              ? (progressInfo?.verificationPass === "collision-recheck" ? "Historical collision re-check" : "Historical check")
              : (progressInfo?.generationMode === "quantitative-landscape-fast"
                ? "Landscape backfill"
                : (progressInfo?.generationMode === "governing-alignment-fast"
                  ? "Governing alignment"
                  : (progressInfo?.generationMode === "geopolitical-fast" ? "Geopolitical baseline" : "Generation")))} batch {(progressInfo?.batchIndex ?? 0) + 1} of {progressInfo?.totalBatches ?? "?"} · attempt {progressInfo?.attempt ?? 1} of {progressInfo?.maxAttempts ?? 2}
            {progressInfo?.phase === "historical-verification"
              ? ` · ${progressInfo?.verifiedTotal ?? 0} confirmed · ${progressInfo?.correctedTotal ?? 0} corrected · ${progressInfo?.failedTotal ?? 0} failed`
              : ` · ${progressInfo?.acceptedTotal ?? 0} accepted · ${progressInfo?.failedTotal ?? 0} failed`}
            <br />
            Estimated remaining: {progressEtaMs == null ? "estimating…" : formatDuration(progressEtaMs)}
          </div>
          {progressSampleError && (
            <div style={{ background: "rgba(127,29,29,0.13)", border: "1px solid rgba(248,113,113,0.18)", borderRadius: 10, color: "#fecaca", fontSize: "0.68rem", lineHeight: 1.45, marginTop: "0.5rem", padding: "0.5rem" }}>
              <strong>Current rejection{progressSampleError.polityKey ? ` — ${progressSampleError.polityKey}` : ""}</strong>
              {progressSampleError.errors.slice(0, 2).map((entry) => <div key={entry}>• {entry}</div>)}
            </div>
          )}
        </div>
      )}
      {progress && <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.75rem", marginTop: "0.7rem" }}>{progress}</div>}
      {error && <div style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, color: "#fecaca", fontSize: "0.75rem", marginTop: "0.7rem", padding: "0.65rem" }}>{error}</div>}
      {lastApplied?.length > 0 && (
        <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.24)", borderRadius: 12, color: "#bbf7d0", fontSize: "0.75rem", marginTop: "0.7rem", padding: "0.65rem" }}>
          Applied: {lastApplied.map((entry) => entry.polityKey).join(", ")}
        </div>
      )}

      {geopoliticalResult && !busy && (
        <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(52,211,153,0.22)", borderRadius: 12, marginTop: "0.8rem", padding: "0.7rem" }}>
          <div style={{ color: "#d1fae5", fontSize: "0.76rem", fontWeight: 800 }}>Geopolitical baseline review</div>
          <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.7rem", lineHeight: 1.5, marginTop: "0.25rem" }}>
            {geopoliticalResult.records.length} polity power profiles · {new Set(geopoliticalResult.records.flatMap((record) => record.memberships.map((entry) => entry.id))).size} formal institutions · {geopoliticalResult.agreements.length} major agreements · {geopoliticalResult.modelCalls} AI call(s).
            {geopoliticalResult.warnings.length ? ` ${geopoliticalResult.warnings.length} fallback/warning(s).` : ""}
          </div>
          <button disabled={geopoliticalApplying || dateMismatch} onClick={applyGeopoliticalBaseline} style={{ ...buttonStyle, background: "rgba(34,197,94,0.2)", borderColor: "rgba(34,197,94,0.32)", marginTop: "0.55rem", opacity: geopoliticalApplying || dateMismatch ? 0.55 : 1 }} type="button">
            {geopoliticalApplying ? "Applying…" : "Apply Geopolitical Baseline"}
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: "0.95rem" }}>
          <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", justifyContent: "space-between", marginBottom: "0.6rem" }}>
            <input
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter polities…"
              style={{ ...selectStyle, flex: 1, minWidth: 0 }}
              value={filter}
            />
            <button disabled={!selectedCount || applying} onClick={applySelected} style={{ ...buttonStyle, background: "rgba(34,197,94,0.18)", borderColor: "rgba(34,197,94,0.3)", opacity: !selectedCount || applying ? 0.5 : 1 }} type="button">
              {applying ? "Applying…" : `Apply Selected (${selectedCount})`}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", maxHeight: "30rem", overflowY: "auto", paddingRight: "0.15rem" }}>
            {visibleRows.map((row) => {
              const expanded = expandedPolity === row.polityKey;
              const failed = row.status === "failed";
              return (
                <div key={row.polityKey} style={{ background: failed ? "rgba(127,29,29,0.16)" : "rgba(255,255,255,0.035)", border: `1px solid ${failed ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.08)"}`, borderRadius: 13, padding: "0.65rem" }}>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.55rem" }}>
                    {!failed && <input checked={row.selected} onChange={(event) => updateRow(row.polityKey, { selected: event.target.checked })} type="checkbox" />}
                    <button onClick={() => setExpandedPolity(expanded ? "" : row.polityKey)} style={{ background: "none", border: 0, color: "#fff", cursor: "pointer", flex: 1, padding: 0, textAlign: "left" }} type="button">
                      <div style={{ alignItems: "center", display: "flex", gap: "0.4rem", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 800 }}>{row.polityKey}</span>
                        <span style={{ color: failed ? "#fca5a5" : "rgba(255,255,255,0.48)", fontSize: "0.64rem", textTransform: "uppercase" }}>{failed ? "failed" : `${row.depth} · ${row.confidence}`}</span>
                      </div>
                      {!failed && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.68rem", marginTop: "0.18rem" }}>{patchSummary(row.actorPatchText)}</div>}
                    </button>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: "0.65rem" }}>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.68rem", marginBottom: "0.45rem" }}>
                        Needs: {row.needs.join(", ") || "none"}
                      </div>
                      {row.sourceErrors.length > 0 && (
                        <div style={{ color: "#fecaca", fontSize: "0.7rem", lineHeight: 1.5, marginBottom: "0.55rem" }}>
                          {row.sourceErrors.map((entry) => <div key={entry}>• {entry}</div>)}
                        </div>
                      )}
                      {!failed && (
                        <>
                          <textarea
                            aria-label={`${row.polityKey} political actor patch`}
                            onChange={(event) => updateRow(row.polityKey, { actorPatchText: event.target.value, sourceErrors: [] })}
                            spellCheck={false}
                            style={textareaStyle}
                            value={row.actorPatchText}
                          />
                          <label style={{ alignItems: "center", color: "rgba(255,255,255,0.62)", display: "flex", fontSize: "0.7rem", gap: "0.45rem", marginTop: "0.5rem" }}>
                            <input
                              checked={row.allowEntityExpansion}
                              onChange={(event) => updateRow(row.polityKey, { allowEntityExpansion: event.target.checked })}
                              type="checkbox"
                            />
                            Allow this reviewed patch to add new parties/power blocs to an already-authored roster.
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PoliticalWorldGenerationPanel;
