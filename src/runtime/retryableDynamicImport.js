/*! Open Historia — recoverable lazy-module import © 2026, AGPL-3.0-or-later (see LICENSE). */
// Share one pending import across callers and keep a successful module loaded.
// Unlike a permanently cached Promise, a rejected attempt must not prevent a
// later user-initiated retry. This does not bypass browser-level module caches.
export const retryableDynamicImport = (load) => {
  if (typeof load !== "function") throw new TypeError("The module loader must be a function.");
  let pending = null;
  return () => {
    if (pending) return pending;
    const attempt = Promise.resolve().then(load);
    const observed = attempt.catch((error) => {
      if (pending === observed) pending = null;
      throw error;
    });
    pending = observed;
    return observed;
  };
};
