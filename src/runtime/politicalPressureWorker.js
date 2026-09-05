/*! Open Historia — political pressure background worker (Continuum) */

import { advancePoliticalPressureBatch } from "./politicalPressure.js";

self.onmessage = (event) => {
  const id = Number(event?.data?.id);
  try {
    const result = advancePoliticalPressureBatch(event?.data?.payload || {});
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error?.message || "Political pressure worker failed." });
  }
};
