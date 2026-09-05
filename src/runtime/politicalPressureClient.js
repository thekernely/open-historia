/*! Open Historia — non-blocking political pressure worker client (Continuum) */

let pressureWorker = null;
let pressureWorkerBroken = false;
let pressureRequestId = 0;
const pressurePending = new Map();

const stopWorker = ({ broken = false, reason = null } = {}) => {
  if (broken) pressureWorkerBroken = true;
  pressureWorker?.terminate?.();
  pressureWorker = null;
  for (const pending of pressurePending.values()) {
    pending.reject(reason instanceof Error ? reason : new Error("Political pressure worker stopped."));
  }
  pressurePending.clear();
};

const getPressureWorker = () => {
  if (pressureWorkerBroken || typeof Worker === "undefined") return null;
  if (pressureWorker) return pressureWorker;

  try {
    const worker = new Worker(
      new URL("./politicalPressureWorker.js", import.meta.url),
      { type: "module", name: "openhistoria-political-pressure" },
    );

    worker.onmessage = (event) => {
      const id = Number(event?.data?.id);
      const pending = pressurePending.get(id);
      if (!pending) return;
      pressurePending.delete(id);
      if (event?.data?.error) pending.reject(new Error(event.data.error));
      else pending.resolve(event?.data?.result);
    };

    worker.onerror = (event) => {
      stopWorker({
        broken: true,
        reason: new Error(event?.message || "Political pressure worker failed."),
      });
    };

    pressureWorker = worker;
    return worker;
  } catch {
    pressureWorkerBroken = true;
    return null;
  }
};

// Deliberately NO main-thread fallback. Political simulation is background-only:
// if workers are unavailable or broken, the game continues with the last valid
// political state rather than trading simulation fidelity for visible UI jank.
export const advancePoliticalPressureBatchBackground = async (payload, { signal } = {}) => {
  const worker = getPressureWorker();
  if (!worker) {
    return {
      skipped: true,
      reason: "worker-unavailable",
      patchesByPolity: {},
      changedPolities: 0,
    };
  }

  const id = ++pressureRequestId;
  return await new Promise((resolve, reject) => {
    const abort = () => {
      pressurePending.delete(id);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Political pressure update cancelled.", "AbortError"));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    pressurePending.set(id, {
      resolve: (value) => {
        signal?.removeEventListener?.("abort", abort);
        resolve(value);
      },
      reject: (error) => {
        signal?.removeEventListener?.("abort", abort);
        reject(error);
      },
    });
    signal?.addEventListener?.("abort", abort, { once: true });
    worker.postMessage({ id, payload });
  });
};

export const resetPoliticalPressureWorkerForTests = () => stopWorker();
