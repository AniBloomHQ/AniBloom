import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Bounded development cache. Only prepared catalogs and requested mapping records persist. */
export async function createLocalCatalogCache({ file, maxEntries = 512, maxBytes = 8 * 1024 * 1024, now = Date.now } = {}) {
  const entries = new Map();
  let bytes = 0;
  let timer;
  let writing = Promise.resolve();
  const persistent = key => /^(catalog-response|verified-identity|provider-mapping):/.test(key);
  const remove = key => {
    const entry = entries.get(key);
    if (entry) bytes -= entry.bytes;
    entries.delete(key);
  };
  const put = (key, value, expiresAt) => {
    const encoded = JSON.stringify(value);
    const size = Buffer.byteLength(encoded);
    if (size > Math.min(2 * 1024 * 1024, maxBytes) || expiresAt <= now()) return;
    remove(key);
    entries.set(key, { value: JSON.parse(encoded), expiresAt, bytes: size });
    bytes += size;
    while (entries.size > maxEntries || bytes > maxBytes) remove(entries.keys().next().value);
  };
  if (file) {
    try {
      if ((await stat(file)).size <= maxBytes * 2) {
        const saved = JSON.parse(await readFile(file, "utf8"));
        if (saved.version === 1 && Array.isArray(saved.entries)) {
          for (const [key, entry] of saved.entries.slice(-maxEntries)) {
            if (typeof key === "string" && persistent(key) && Number.isFinite(entry?.expiresAt)) put(key, entry.value, entry.expiresAt);
          }
        }
      }
    } catch { /* A missing/corrupt local cache is a cold start, not an outage. */ }
  }
  async function flush() {
    clearTimeout(timer);
    if (!file) return;
    const snapshot = [...entries].filter(([key, entry]) => persistent(key) && entry.expiresAt > now())
      .map(([key, { value, expiresAt }]) => [key, { value, expiresAt }]);
    writing = writing.catch(() => {}).then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, entries: snapshot }), { mode: 0o600 });
      await rename(temporary, file);
    });
    return writing;
  }
  function persist() {
    clearTimeout(timer);
    timer = setTimeout(() => { flush().catch(() => console.warn("[cache] local persistence unavailable")); }, 250);
    timer.unref?.();
  }
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) { remove(key); return undefined; }
      entries.delete(key);
      entries.set(key, entry);
      return structuredClone(entry.value);
    },
    async set(key, value, { ttl }) {
      if (!Number.isFinite(ttl) || ttl <= 0) return;
      put(key, value, now() + ttl * 1000);
      if (persistent(key)) persist();
    },
    async delete(key) { remove(key); if (persistent(key)) persist(); },
    flush,
  };
}
