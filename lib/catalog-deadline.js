import { AsyncLocalStorage } from "node:async_hooks";
import { setMaxListeners } from "node:events";

const builds = new AsyncLocalStorage();

function deadlineError() {
  const error = new Error("Catalog build exceeded its time budget");
  error.code = "CATALOG_BUILD_TIMEOUT";
  error.retryAfterSeconds = 5;
  return error;
}

export function checkCatalogDeadline() {
  const build = builds.getStore();
  if (build && (build.signal.aborted || Date.now() >= build.deadlineAt)) throw deadlineError();
}

/** A shared build owns its deadline; one disconnected caller cannot cancel other waiters. */
export async function withCatalogDeadline(task, timeoutMs = 20_000) {
  if (builds.getStore()) return task();
  const controller = new AbortController();
  // Each bounded concurrent provider request subscribes to the shared signal.
  setMaxListeners(64, controller.signal);
  const deadlineAt = Date.now() + timeoutMs;
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(deadlineError()); reject(deadlineError()); }, timeoutMs);
  });
  try {
    return await builds.run({ signal: controller.signal, deadlineAt }, async () => {
      const result = await Promise.race([Promise.resolve().then(task), expired]);
      checkCatalogDeadline();
      return result;
    });
  } finally { clearTimeout(timer); }
}

/** Include HTTP headers AND body consumption in the remaining build budget. */
export async function fetchWithCatalogDeadline(input, options = {}) {
  const build = builds.getStore();
  if (!build) return globalThis.fetch(input, options);
  if (build.signal.aborted || Date.now() >= build.deadlineAt) throw deadlineError();
  const controller = new AbortController();
  const abort = () => controller.abort(build.signal.reason || deadlineError());
  const abortCaller = () => controller.abort(options.signal?.reason);
  build.signal.addEventListener("abort", abort, { once: true });
  options.signal?.addEventListener("abort", abortCaller, { once: true });
  if (options.signal?.aborted) abortCaller();
  const cleanup = () => {
    build.signal.removeEventListener("abort", abort);
    options.signal?.removeEventListener("abort", abortCaller);
  };
  try {
    const response = await globalThis.fetch(input, { ...options, signal: controller.signal });
    return new Proxy(response, {
      get(target, property) {
        if (["json", "text", "arrayBuffer", "blob", "formData"].includes(property)) {
          return async (...args) => {
            try { return await target[property](...args); }
            finally { cleanup(); }
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  } catch (error) { cleanup(); throw error; }
}
