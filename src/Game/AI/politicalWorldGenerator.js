/*! Open Historia — Political World generation provider seam (Phase006B) */

import { callAI } from "./main.jsx";
import { generatePoliticalWorldProposalsCore } from "./politicalWorldGeneratorCore.js";

// Real provider entry point. Phase006C can call this from Scenario Editor review
// UX; Phase006B deliberately returns validated proposals and never writes world
// or scenario state itself.
export const generatePoliticalWorldProposals = (options = {}) => generatePoliticalWorldProposalsCore({
  ...options,
  callModel: options.callModel ?? callAI,
});

export { POLITICAL_WORLD_GENERATION_TOOL } from "./politicalWorldGeneratorCore.js";
