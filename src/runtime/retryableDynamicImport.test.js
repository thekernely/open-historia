import assert from "node:assert/strict";
import test from "node:test";
import { retryableDynamicImport } from "./retryableDynamicImport.js";

test("one pending dynamic import is shared across concurrent callers", async () => {
  let loadCalls = 0;
  let complete;
  const load = retryableDynamicImport(() => {
    loadCalls += 1;
    return new Promise((resolve) => { complete = resolve; });
  });
  const first = load();
  const second = load();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(loadCalls, 1);
  complete({ ready: true });
  assert.deepEqual(await first, { ready: true });
});

test("a rejected module load propagates the error but leaves the next attempt available", async () => {
  const failure = new TypeError("error loading dynamically imported module: /src/runtime/naval/admiral.js");
  let calls = 0;
  const load = retryableDynamicImport(() => {
    calls += 1;
    if (calls === 1) throw failure;
    return { recovered: true };
  });
  await assert.rejects(load(), (error) => error === failure);
  assert.deepEqual(await load(), { recovered: true });
  assert.equal(calls, 2);
});

test("a successful import remains cached after repeated requests", async () => {
  const module = { simulation: () => "ok" };
  let calls = 0;
  const load = retryableDynamicImport(() => {
    calls += 1;
    return Promise.resolve(module);
  });
  assert.equal(await load(), module);
  assert.equal(await load(), module);
  assert.equal(calls, 1);
});

test("two consumers of a failed import both see its rejection, then a later retry starts one new attempt", async () => {
  const failure = new Error("temporary HTTP 503");
  let calls = 0;
  const load = retryableDynamicImport(() => {
    calls += 1;
    return calls === 1 ? Promise.reject(failure) : Promise.resolve("loaded");
  });
  const first = load();
  const second = load();
  assert.equal(first, second);
  const outcomes = await Promise.allSettled([first, second]);
  assert.deepEqual(outcomes.map((result) => result.reason), [failure, failure]);
  assert.equal(await load(), "loaded");
  assert.equal(calls, 2);
});

test("non-function loader is rejected before any module operation", () => {
  assert.throws(() => retryableDynamicImport(null), TypeError);
});
