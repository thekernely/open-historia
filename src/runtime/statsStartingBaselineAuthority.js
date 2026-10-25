/*! Open Historia — scenario-approved starting Statistics versus legacy calibration © 2026 Nicholas Krol, AGPL-3.0-or-later (see LICENSE). */
import {
  COUNTRY_STATS_POPULATION_CALIBRATION_VERSION,
  isCompleteCountryStatSheet,
  normalizeCountryStatDemographicEvolution,
} from "./countryStats.js";

const calibrationVersion = (sheet) =>
  Math.max(0, Math.trunc(Number(sheet?.continuity?.populationCalibrationVersion) || 0));

const atCampaignStart = (player) => Boolean(
  player?.startDate && player?.date === player.startDate && Number(player?.round) <= 1
);

// A scenario proposal is reviewed before its application. New authored sheets
// carry explicit native-only provenance; imported 1912-style sheets predate
// that marker, but have an opt-in, scenario-dated demographic evolution clock
// which only the scenario editor authored. No unspecified legacy sheet receives
// this exemption. No mutations or migration stamps are made by this reader.
export const isReviewedStartingBaseline = (sheet, player) => {
  if (!atCampaignStart(player) || !isCompleteCountryStatSheet(sheet)) return false;
  const marker = sheet?.continuity?.scenarioBaseline;
  if (marker?.version === 1 && marker.source === "scenario-author-reviewed"
    && marker.date === player.startDate
    && Object.keys(marker).length === 3) return true;

  const evolution = sheet?.continuity?.demographicEvolution;
  if (!evolution || !normalizeCountryStatDemographicEvolution(evolution)) return false;
  return sheet.continuity.assessedDate === player.startDate
    && evolution.sourceDate === player.startDate
    && evolution.lastDate === player.startDate
    && evolution.basePopulation === sheet.population?.total;
};

export const needsLegacyComponentCapAudit = (sheet) =>
  Array.isArray(sheet?.territorialComponents)
  && sheet.territorialComponents.length === 64
  && calibrationVersion(sheet) < COUNTRY_STATS_POPULATION_CALIBRATION_VERSION;

export const needsStartPopulationCalibrationAudit = (sheet, player) => Boolean(
  sheet && atCampaignStart(player)
  && calibrationVersion(sheet) < COUNTRY_STATS_POPULATION_CALIBRATION_VERSION
  && !isReviewedStartingBaseline(sheet, player)
);
