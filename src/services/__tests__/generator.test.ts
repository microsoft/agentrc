import fs from "fs/promises";
import os from "os";
import path from "path";

import type { RepoAnalysis } from "@agentrc/core/services/analyzer";
import { generateConfigs } from "@agentrc/core/services/generator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("generateConfigs", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-gen-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeAnalysis(overrides?: Partial<RepoAnalysis>): RepoAnalysis {
    return {
      path: tmpDir,
      isGitRepo: false,
      languages: ["TypeScript"],
      frameworks: [],
      ...overrides
    };
  }

  it("generates valid mcp.json", async () => {
    const analysis = makeAnalysis();
    const { files } = await generateConfigs({
      repoPath: tmpDir,
      analysis,
      selections: ["mcp"],
      force: false
    });

    const content = await fs.readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf8");
    const parsed = JSON.parse(content);

    expect(parsed.servers).toBeDefined();
    expect(parsed.servers.github).toBeDefined();
    expect(parsed.servers.filesystem).toBeDefined();
    expect(files.some((f) => f.action === "wrote")).toBe(true);
  });

  it("generates valid vscode settings with frameworks", async () => {
    const analysis = makeAnalysis({ frameworks: ["React", "Next.js"] });
    await generateConfigs({
      repoPath: tmpDir,
      analysis,
      selections: ["vscode"],
      force: false
    });

    const content = await fs.readFile(path.join(tmpDir, ".vscode", "settings.json"), "utf8");
    const parsed = JSON.parse(content);

    expect(parsed["github.copilot.chat.codeGeneration.instructions"]).toBeDefined();
    expect(parsed["chat.mcp.enabled"]).toBe(true);
    // Should mention frameworks in review instructions
    const reviewText = parsed["github.copilot.chat.reviewSelection.instructions"][0].text;
    expect(reviewText).toContain("React");
    expect(reviewText).toContain("Next.js");
  });

  it("generates fallback review text when no frameworks", async () => {
    const analysis = makeAnalysis({ frameworks: [] });
    await generateConfigs({
      repoPath: tmpDir,
      analysis,
      selections: ["vscode"],
      force: false
    });

    const content = await fs.readFile(path.join(tmpDir, ".vscode", "settings.json"), "utf8");
    const parsed = JSON.parse(content);
    const reviewText = parsed["github.copilot.chat.reviewSelection.instructions"][0].text;
    expect(reviewText).toContain("repo conventions");
  });

  it("skips existing files without force", async () => {
    await fs.mkdir(path.join(tmpDir, ".vscode"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".vscode", "mcp.json"), "original", "utf8");

    const analysis = makeAnalysis();
    const { files } = await generateConfigs({
      repoPath: tmpDir,
      analysis,
      selections: ["mcp"],
      force: false
    });

    const content = await fs.readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf8");
    expect(content).toBe("original");
    expect(files.some((f) => f.action === "skipped")).toBe(true);
  });

  it("overwrites existing files with force", async () => {
    await fs.mkdir(path.join(tmpDir, ".vscode"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".vscode", "mcp.json"), "original", "utf8");

    const analysis = makeAnalysis();
    const { files } = await generateConfigs({
      repoPath: tmpDir,
      analysis,
      selections: ["mcp"],
      force: true
    });

    const content = await fs.readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf8");
    expect(content).not.toBe("original");
    expect(files.some((f) => f.action === "wrote")).toBe(true);
  });

  it("does nothing with empty selections", async () => {
    const analysis = makeAnalysis();
    const { files } = await generateConfigs({
      repoPath: tmpDir,
      analysis,
      selections: [],
      force: false
    });

    expect(files).toHaveLength(0);
  });

  describe("dryRun", () => {
    it("does not create files on disk", async () => {
      const analysis = makeAnalysis();
      const { files } = await generateConfigs({
        repoPath: tmpDir,
        analysis,
        selections: ["mcp", "vscode"],
        force: false,
        dryRun: true
      });

      expect(files).toHaveLength(2);
      for (const f of files) {
        expect(f.action).toBe("wrote");
        expect(f.bytes).toBeGreaterThan(0);
      }

      // No files should exist on disk
      const vscodeDir = path.join(tmpDir, ".vscode");
      await expect(fs.access(vscodeDir)).rejects.toThrow();
    });

    it("reports skipped when file exists and force is false", async () => {
      await fs.mkdir(path.join(tmpDir, ".vscode"), { recursive: true });
      await fs.writeFile(path.join(tmpDir, ".vscode", "mcp.json"), "original", "utf8");

      const analysis = makeAnalysis();
      const { files } = await generateConfigs({
        repoPath: tmpDir,
        analysis,
        selections: ["mcp"],
        force: false,
        dryRun: true
      });

      expect(files).toHaveLength(1);
      expect(files[0].action).toBe("skipped");
      expect(files[0].bytes).toBeGreaterThan(0);

      // Original file untouched
      const content = await fs.readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf8");
      expect(content).toBe("original");
    });

    it("reports wrote when file exists and force is true", async () => {
      await fs.mkdir(path.join(tmpDir, ".vscode"), { recursive: true });
      await fs.writeFile(path.join(tmpDir, ".vscode", "mcp.json"), "original", "utf8");

      const analysis = makeAnalysis();
      const { files } = await generateConfigs({
        repoPath: tmpDir,
        analysis,
        selections: ["mcp"],
        force: true,
        dryRun: true
      });

      expect(files).toHaveLength(1);
      expect(files[0].action).toBe("wrote");

      // Original file still untouched despite force — dry run doesn't write
      const content = await fs.readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf8");
      expect(content).toBe("original");
    });
  });
});
