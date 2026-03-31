import { mkdtemp, rm, readdir, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = "agentrc-scan-";

/** Create a uniquely-named temp directory for a scan. */
export async function createTempDir() {
  return mkdtemp(join(tmpdir(), PREFIX));
}

/** Remove a temp directory, ignoring ENOENT. */
export async function removeTempDir(dirPath) {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/**
 * Sweep stale temp directories older than maxAgeMs.
 * Returns the number of directories cleaned.
 */
export async function sweepStaleTempDirs({ maxAgeMs = 10 * 60 * 1000, prefix = PREFIX } = {}) {
  const base = tmpdir();
  let cleaned = 0;
  let entries;
  try {
    entries = await readdir(base);
  } catch {
    return 0;
  }
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const fullPath = join(base, entry);
    try {
      const info = await lstat(fullPath);
      if (info.isDirectory() && !info.isSymbolicLink() && now - info.mtimeMs > maxAgeMs) {
        await rm(fullPath, { recursive: true, force: true });
        cleaned++;
      }
    } catch {
      // ignore individual cleanup failures
    }
  }
  return cleaned;
}
