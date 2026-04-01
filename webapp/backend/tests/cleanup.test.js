import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTempDir, removeTempDir } from "../src/utils/cleanup.js";
import { existsSync } from "node:fs";

describe("cleanup", () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await removeTempDir(tempDir);
    }
  });

  it("createTempDir creates a directory", async () => {
    tempDir = await createTempDir();
    expect(tempDir).toContain("agentrc-scan-");
    expect(existsSync(tempDir)).toBe(true);
  });

  it("removeTempDir removes an existing directory", async () => {
    tempDir = await createTempDir();
    await removeTempDir(tempDir);
    expect(existsSync(tempDir)).toBe(false);
    tempDir = null; // Already cleaned
  });

  it("removeTempDir ignores non-existent path", async () => {
    await expect(removeTempDir("/tmp/agentrc-scan-nonexistent-12345")).resolves.toBeUndefined();
  });
});
