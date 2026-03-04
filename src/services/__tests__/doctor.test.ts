import { afterEach, describe, expect, it, vi } from "vitest";

import * as copilot from "../copilot";
import type { CheckResult } from "../doctor";
import {
  checkAzureDevOps,
  checkCopilotCli,
  checkGit,
  checkGitHubToken,
  checkNodeVersion,
  runDoctorChecks
} from "../doctor";
import * as github from "../github";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.AZURE_DEVOPS_PAT;
  delete process.env.AZDO_PAT;
});

describe("checkNodeVersion", () => {
  it("returns ok when Node.js major version is >= 20", async () => {
    const result = await checkNodeVersion();
    const major = parseInt(process.versions.node.split(".")[0], 10);
    expect(result.ok).toBe(major >= 20);
    expect(result.required).toBe(true);
    expect(result.name).toBe("Node.js");
  });
});

describe("checkGit", () => {
  // Uses real git — safe, fast, and available in CI
  it("returns ok when git is available", async () => {
    const result = await checkGit();
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("git version");
    expect(result.required).toBe(true);
  });
});

describe("checkCopilotCli", () => {
  it("returns ok when Copilot CLI is ready", async () => {
    vi.spyOn(copilot, "assertCopilotCliReady").mockResolvedValue({ cliPath: "/usr/bin/copilot" });

    const result = await checkCopilotCli();
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("/usr/bin/copilot");
    expect(result.required).toBe(true);
  });

  it("returns failure with incompatibility detail when headless unsupported", async () => {
    vi.spyOn(copilot, "assertCopilotCliReady").mockRejectedValue(
      new Error("Copilot CLI at /usr/bin/copilot does not support --headless (SDK server mode).")
    );

    const result = await checkCopilotCli();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("does not support --headless");
    expect(result.fix).toBeDefined();
  });

  it("returns not found when no CLI candidate exists", async () => {
    vi.spyOn(copilot, "assertCopilotCliReady").mockRejectedValue(
      new Error("No Copilot CLI found.")
    );

    const result = await checkCopilotCli();
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("not found");
  });
});

describe("checkGitHubToken", () => {
  it("detects GITHUB_TOKEN from environment", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    vi.spyOn(github, "getGitHubToken").mockResolvedValue("ghp_test");

    const result = await checkGitHubToken();
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("via GITHUB_TOKEN");
  });

  it("detects GH_TOKEN from environment", async () => {
    process.env.GH_TOKEN = "ghp_test";
    vi.spyOn(github, "getGitHubToken").mockResolvedValue("ghp_test");

    const result = await checkGitHubToken();
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("via GH_TOKEN");
  });

  it("reports gh CLI as source when no env var set", async () => {
    vi.spyOn(github, "getGitHubToken").mockResolvedValue("ghp_from_cli");

    const result = await checkGitHubToken();
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("via gh CLI");
  });

  it("returns failure when no token found", async () => {
    vi.spyOn(github, "getGitHubToken").mockResolvedValue(null);

    const result = await checkGitHubToken();
    expect(result.ok).toBe(false);
    expect(result.fix).toContain("gh auth login");
  });
});

describe("checkAzureDevOps", () => {
  it("returns ok with detail when PAT is set", async () => {
    process.env.AZURE_DEVOPS_PAT = "pat_test";

    const result = await checkAzureDevOps();
    expect(result.ok).toBe(true);
    expect(result.required).toBe(false);
    expect(result.detail).toContain("AZURE_DEVOPS_PAT");
  });

  it("returns ok (not failure) when PAT is not set since it is optional", async () => {
    const result = await checkAzureDevOps();
    expect(result.ok).toBe(true);
    expect(result.required).toBe(false);
    expect(result.detail).toContain("optional");
  });
});

describe("runDoctorChecks", () => {
  it("runs all checks in parallel and reports hasFailures", async () => {
    vi.spyOn(copilot, "assertCopilotCliReady").mockResolvedValue({ cliPath: "/usr/bin/copilot" });
    vi.spyOn(github, "getGitHubToken").mockResolvedValue("ghp_test");
    process.env.GITHUB_TOKEN = "ghp_test";

    const { checks, hasFailures } = await runDoctorChecks();
    expect(checks).toHaveLength(5);
    expect(hasFailures).toBe(false);
  });

  it("reports hasFailures when a required check fails", async () => {
    vi.spyOn(copilot, "assertCopilotCliReady").mockRejectedValue(new Error("not found"));
    vi.spyOn(github, "getGitHubToken").mockResolvedValue(null);

    const { checks, hasFailures } = await runDoctorChecks();
    expect(checks).toHaveLength(5);
    expect(hasFailures).toBe(true);
    // Azure DevOps is optional and ok, should not contribute to failures
    const azdo = checks.find((c: CheckResult) => c.name === "Azure DevOps");
    expect(azdo?.ok).toBe(true);
  });
});
