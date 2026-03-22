import fs from "fs/promises";
import os from "os";
import path from "path";

import type { Area } from "@agentrc/core/services/analyzer";
import { scaffoldAgentrcConfig } from "@agentrc/core/services/configScaffold";
import { afterEach, describe, expect, it } from "vitest";

describe("scaffoldAgentrcConfig", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-scaffold-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("returns null when areas array is empty", async () => {
    const repoPath = await makeTmpDir();
    const result = await scaffoldAgentrcConfig(repoPath, []);
    expect(result).toBeNull();
    const configPath = path.join(repoPath, "agentrc.config.json");
    await expect(fs.access(configPath)).rejects.toThrow();
  });

  it("writes agentrc.config.json with standalone areas", async () => {
    const repoPath = await makeTmpDir();
    const areas: Area[] = [
      { name: "docs", applyTo: "docs/**", source: "auto" },
      { name: "src", applyTo: "src/**", source: "auto" }
    ];
    const result = await scaffoldAgentrcConfig(repoPath, areas);
    expect(result).not.toBeNull();
    expect(result!.wrote).toBe(true);
    expect(result!.configPath).toBe(path.join(repoPath, "agentrc.config.json"));

    const raw = JSON.parse(await fs.readFile(result!.configPath, "utf8"));
    expect(raw.areas).toHaveLength(2);
    expect(raw.areas[0].name).toBe("docs");
    expect(raw.areas[1].name).toBe("src");
    expect(raw.workspaces).toBeUndefined();
  });

  it("separates workspace areas from standalone areas", async () => {
    const repoPath = await makeTmpDir();
    // Two sibling package dirs trigger workspace grouping (strategy 2: 2+ siblings)
    for (const pkg of ["app", "lib"]) {
      const pkgDir = path.join(repoPath, "packages", pkg);
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, "package.json"), JSON.stringify({ name: pkg }, null, 2));
    }

    const areas: Area[] = [
      {
        name: "app",
        applyTo: "packages/app/**",
        path: path.join(repoPath, "packages", "app"),
        source: "auto"
      },
      {
        name: "lib",
        applyTo: "packages/lib/**",
        path: path.join(repoPath, "packages", "lib"),
        source: "auto"
      },
      { name: "docs", applyTo: "docs/**", source: "auto" }
    ];
    const result = await scaffoldAgentrcConfig(repoPath, areas);
    expect(result).not.toBeNull();
    expect(result!.wrote).toBe(true);

    const raw = JSON.parse(await fs.readFile(result!.configPath, "utf8"));
    // Only "docs" is a standalone area — app and lib grouped into workspace
    expect(raw.areas).toHaveLength(1);
    expect(raw.areas[0].name).toBe("docs");
    expect(raw.workspaces).toHaveLength(1);
    expect(raw.workspaces[0].path).toBe("packages");
  });

  it("skips writing when file already exists and force is false", async () => {
    const repoPath = await makeTmpDir();
    const areas: Area[] = [{ name: "src", applyTo: "src/**", source: "auto" }];

    // Write once
    const first = await scaffoldAgentrcConfig(repoPath, areas, false);
    expect(first!.wrote).toBe(true);

    // Write again without force — should skip
    const second = await scaffoldAgentrcConfig(repoPath, areas, false);
    expect(second!.wrote).toBe(false);
  });

  it("overwrites when force is true", async () => {
    const repoPath = await makeTmpDir();
    const areas: Area[] = [{ name: "src", applyTo: "src/**", source: "auto" }];

    await scaffoldAgentrcConfig(repoPath, areas, false);

    // Modify the file externally
    const configPath = path.join(repoPath, "agentrc.config.json");
    await fs.writeFile(configPath, '{"custom":true}');

    // Force overwrite
    const result = await scaffoldAgentrcConfig(repoPath, areas, true);
    expect(result!.wrote).toBe(true);

    const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(raw.custom).toBeUndefined();
    expect(raw.areas).toHaveLength(1);
  });

  it("preserves area description when present", async () => {
    const repoPath = await makeTmpDir();
    const areas: Area[] = [
      { name: "api", applyTo: "src/api/**", description: "Backend API layer", source: "auto" }
    ];
    const result = await scaffoldAgentrcConfig(repoPath, areas);
    const raw = JSON.parse(await fs.readFile(result!.configPath, "utf8"));
    expect(raw.areas[0].description).toBe("Backend API layer");
  });
});
