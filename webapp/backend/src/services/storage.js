/**
 * Report storage — file-based JSON persistence or in-memory for tests.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

let cleanupTimer = null;
let activeStorage = null;

/**
 * Create a storage backend.
 * When reportsDir is ":memory:", uses an in-memory Map (for tests).
 */
export function createStorage(reportsDir) {
  if (reportsDir === ":memory:") {
    activeStorage = createMemoryStorage();
  } else {
    activeStorage = createFileStorage(reportsDir);
  }
  return activeStorage;
}

/** Start periodic cleanup of expired reports. */
export function startReportCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    if (activeStorage) activeStorage.cleanupExpired().catch(() => {});
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

/** Stop the periodic cleanup timer. */
export function stopReportCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

function createMemoryStorage() {
  const store = new Map();

  return {
    async saveReport(report) {
      const id = randomUUID();
      store.set(id, { report, createdAt: Date.now() });
      return id;
    },

    async getReport(id) {
      if (!UUID_RE.test(id)) return null;
      const entry = store.get(id);
      if (!entry) return null;
      if (Date.now() - entry.createdAt > TTL_MS) {
        store.delete(id);
        return null;
      }
      return entry.report;
    },

    async cleanupExpired() {
      const now = Date.now();
      let cleaned = 0;
      for (const [id, entry] of store) {
        if (now - entry.createdAt > TTL_MS) {
          store.delete(id);
          cleaned++;
        }
      }
      return cleaned;
    }
  };
}

function createFileStorage(reportsDir) {
  // Eagerly create the directory so first writes never fail on an empty volume
  const dirReady = mkdir(reportsDir, { recursive: true });

  async function ensureDir() {
    await dirReady;
  }

  return {
    async saveReport(report) {
      await ensureDir();
      const id = randomUUID();
      const filePath = join(reportsDir, `${id}.json`);
      const tmpPath = join(reportsDir, `${id}.tmp`);
      const payload = JSON.stringify(report);
      // Atomic write: temp file + rename
      await writeFile(tmpPath, payload, "utf-8");
      await rename(tmpPath, filePath);
      return id;
    },

    async getReport(id) {
      if (!UUID_RE.test(id)) return null;
      await ensureDir();
      const filePath = join(reportsDir, `${id}.json`);
      try {
        const info = await stat(filePath);
        if (Date.now() - info.mtimeMs > TTL_MS) {
          await rm(filePath, { force: true });
          return null;
        }
        const data = await readFile(filePath, "utf-8");
        return JSON.parse(data);
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },

    async cleanupExpired() {
      await ensureDir();
      const entries = await readdir(reportsDir);
      const now = Date.now();
      let cleaned = 0;
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const filePath = join(reportsDir, entry);
        try {
          const info = await stat(filePath);
          if (now - info.mtimeMs > TTL_MS) {
            await rm(filePath, { force: true });
            cleaned++;
          }
        } catch {
          // ignore
        }
      }
      return cleaned;
    }
  };
}
