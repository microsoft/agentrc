import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { confirm } from "@inquirer/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offerApmInit } from "../../commands/init";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  checkbox: vi.fn(),
  select: vi.fn()
}));

vi.mock("child_process", () => ({
  execFile: vi.fn()
}));

const mockConfirm = vi.mocked(confirm);
const mockExecFile = vi.mocked(execFile);

describe("offerApmInit", () => {
  let repoPath: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-apm-init-"));
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockConfirm.mockReset();
    mockExecFile.mockReset();
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  function mockApmNotInstalled(): void {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === "function" ? _opts : cb;
      if (callback) callback(new Error("not found"), "", "");
      return {} as ReturnType<typeof execFile>;
    });
  }

  function mockApmInstalled(): void {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = typeof _opts === "function" ? _opts : cb;
      if (callback) callback(null, "1.0.0", "");
      return {} as ReturnType<typeof execFile>;
    });
  }

  it("auto-initializes APM when --yes is set and apm is installed", async () => {
    mockApmInstalled();
    await offerApmInit(repoPath, { yes: true });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockExecFile).toHaveBeenCalledTimes(2); // --version + init --yes
  });

  it("skips when --yes is set but apm is not installed", async () => {
    mockApmNotInstalled();
    await offerApmInit(repoPath, { yes: true });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("skips when --json is set", async () => {
    await offerApmInit(repoPath, { json: true });
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("skips when apm.yml already exists", async () => {
    await fs.writeFile(path.join(repoPath, "apm.yml"), "name: test");
    await offerApmInit(repoPath, {});
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("shows tip when apm is not installed and not quiet", async () => {
    mockApmNotInstalled();
    await offerApmInit(repoPath, {});
    const output = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(output).toContain("APM");
    expect(output).toContain("https://github.com/microsoft/apm");
  });

  it("suppresses tip when --quiet is set", async () => {
    mockApmNotInstalled();
    await offerApmInit(repoPath, { quiet: true });
    const tipCalls = stderrSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes("APM"));
    expect(tipCalls).toHaveLength(0);
  });

  it("prompts when apm is installed and no apm.yml", async () => {
    mockApmInstalled();
    mockConfirm.mockResolvedValue(false);
    await offerApmInit(repoPath, {});
    expect(mockConfirm).toHaveBeenCalledOnce();
  });
});
