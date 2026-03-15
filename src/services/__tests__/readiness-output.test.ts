import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readinessCommand } from "../../commands/readiness";

describe("readinessCommand --output", () => {
  let tmpDir: string | undefined;

  async function setupRepo(): Promise<string> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "readiness-output-"));
    const repoPath = path.join(tmpDir, "repo");
    await fs.mkdir(repoPath);
    return repoPath;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("writes JSON file when output ends in .json", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.json");

    await readinessCommand(repoPath, { output: outputPath, quiet: true });

    const content = await fs.readFile(outputPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.repoPath).toBe(repoPath);
    expect(parsed).toHaveProperty("achievedLevel");
  });

  it("writes Markdown file for uppercase extension", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.MD");

    await readinessCommand(repoPath, { output: outputPath, quiet: true });

    const content = await fs.readFile(outputPath, "utf-8");
    expect(content).toContain("# Readiness Report:");
    expect(content).toContain("## Repo Health");
  });

  it("writes HTML file for uppercase extension", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.HTML");

    await readinessCommand(repoPath, { output: outputPath, quiet: true });

    const content = await fs.readFile(outputPath, "utf-8");
    expect(content).toContain("<!DOCTYPE html>");
  });

  it("writes default visual HTML file when --visual is used without --output", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(repoPath, "readiness-report.html");

    await readinessCommand(repoPath, { visual: true, quiet: true });

    const content = await fs.readFile(outputPath, "utf-8");
    expect(content).toContain("<!DOCTYPE html>");
  });

  it("rejects unsupported extensions before visual rendering", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.txt");
    const fallbackPath = path.join(repoPath, "readiness-report.html");

    await readinessCommand(repoPath, { output: outputPath, visual: true, quiet: true });

    expect(process.exitCode).toBe(1);
    await expect(fs.access(outputPath)).rejects.toThrow();
    await expect(fs.access(fallbackPath)).rejects.toThrow();
  });

  it("rejects --visual with non-HTML output extension", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.json");
    const fallbackPath = path.join(repoPath, "readiness-report.html");

    await readinessCommand(repoPath, { output: outputPath, visual: true, quiet: true });

    expect(process.exitCode).toBe(1);
    await expect(fs.access(outputPath)).rejects.toThrow();
    await expect(fs.access(fallbackPath)).rejects.toThrow();
  });

  it("refuses to overwrite without --force", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.json");
    await fs.writeFile(outputPath, "existing");

    await readinessCommand(repoPath, { output: outputPath, quiet: true });

    const content = await fs.readFile(outputPath, "utf-8");
    expect(content).toBe("existing");
  });

  it("overwrites with --force", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.json");
    await fs.writeFile(outputPath, "existing");

    await readinessCommand(repoPath, { output: outputPath, force: true, quiet: true });

    const content = await fs.readFile(outputPath, "utf-8");
    expect(content).not.toBe("existing");
    expect(JSON.parse(content).repoPath).toBe(repoPath);
  });

  it("rejects symlink paths", async () => {
    const repoPath = await setupRepo();
    const realPath = path.join(tmpDir ?? repoPath, "real.json");
    const linkPath = path.join(tmpDir ?? repoPath, "readiness.json");
    await fs.writeFile(realPath, "existing");
    await fs.symlink(realPath, linkPath);

    await readinessCommand(repoPath, { output: linkPath, quiet: true });

    const content = await fs.readFile(realPath, "utf-8");
    expect(content).toBe("existing");
  });

  it("sets exit code when fail-level threshold is not met", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.json");

    await readinessCommand(repoPath, { output: outputPath, failLevel: "5", quiet: true });

    expect(process.exitCode).toBe(1);
    const content = await fs.readFile(outputPath, "utf-8");
    expect(JSON.parse(content).repoPath).toBe(repoPath);
  });

  it("creates parent directories for nested output paths", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "reports", "nested", "readiness.json");

    await readinessCommand(repoPath, { output: outputPath, quiet: true });

    const content = await fs.readFile(outputPath, "utf-8");
    expect(JSON.parse(content).repoPath).toBe(repoPath);
  });

  it("emits JSON to stdout when --json is used with --output", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.json");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await readinessCommand(repoPath, { output: outputPath, json: true, quiet: true });

    const stdout = stdoutSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .join("")
      .trim();
    const parsed = JSON.parse(stdout) as { ok: boolean; status: string; data: unknown };
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("success");
    expect(parsed.data).toBeDefined();

    const fileContent = await fs.readFile(outputPath, "utf-8");
    expect(JSON.parse(fileContent).repoPath).toBe(repoPath);
  });

  it("emits JSON to stdout when --json is used with markdown output", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.md");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await readinessCommand(repoPath, { output: outputPath, json: true, quiet: true });

    const stdout = stdoutSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .join("")
      .trim();
    const parsed = JSON.parse(stdout) as { ok: boolean; status: string; data: unknown };
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("success");
    expect(parsed.data).toBeDefined();

    const fileContent = await fs.readFile(outputPath, "utf-8");
    expect(fileContent).toContain("# Readiness Report:");
  });

  it("emits JSON to stdout when --json is used with html output", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.html");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await readinessCommand(repoPath, { output: outputPath, json: true, quiet: true });

    const stdout = stdoutSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .join("")
      .trim();
    const parsed = JSON.parse(stdout) as { ok: boolean; status: string; data: unknown };
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("success");
    expect(parsed.data).toBeDefined();

    const fileContent = await fs.readFile(outputPath, "utf-8");
    expect(fileContent).toContain("<!DOCTYPE html>");
  });

  it("emits error JSON status when fail-level threshold is not met", async () => {
    const repoPath = await setupRepo();
    const outputPath = path.join(tmpDir ?? repoPath, "readiness.json");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await readinessCommand(repoPath, {
      output: outputPath,
      json: true,
      quiet: true,
      failLevel: "5"
    });

    const stdout = stdoutSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .join("")
      .trim();
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      status: string;
      errors?: string[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe("error");
    expect(parsed.errors?.[0]).toContain("below threshold");
    expect(process.exitCode).toBe(1);

    const fileContent = await fs.readFile(outputPath, "utf-8");
    expect(JSON.parse(fileContent).repoPath).toBe(repoPath);
  });
});
