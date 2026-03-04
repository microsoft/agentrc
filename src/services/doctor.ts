import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { assertCopilotCliReady } from "./copilot";
import { getGitHubToken } from "./github";

const execFileAsync = promisify(execFile);

export type CheckResult = {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
  fix?: string;
};

export type DoctorResult = {
  checks: CheckResult[];
  hasFailures: boolean;
};

export async function checkNodeVersion(): Promise<CheckResult> {
  const version = process.versions.node;
  const major = parseInt(version.split(".")[0], 10);
  if (major >= 20) {
    return { name: "Node.js", ok: true, required: true, detail: `v${version}` };
  }
  return {
    name: "Node.js",
    ok: false,
    required: true,
    detail: `v${version} (requires >=20)`,
    fix: "Install Node.js 20 or later from https://nodejs.org"
  };
}

export async function checkGit(): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync("git", ["--version"], { timeout: 5000 });
    return { name: "git", ok: true, required: true, detail: stdout.trim() };
  } catch {
    return {
      name: "git",
      ok: false,
      required: true,
      detail: "not found",
      fix: "Install git from https://git-scm.com"
    };
  }
}

export async function checkCopilotCli(): Promise<CheckResult> {
  try {
    const config = await assertCopilotCliReady();
    const desc = config.cliArgs ? `${config.cliPath} ${config.cliArgs.join(" ")}` : config.cliPath;
    return { name: "Copilot CLI", ok: true, required: true, detail: desc };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isIncompatible = message.includes("does not support --headless");
    return {
      name: "Copilot CLI",
      ok: false,
      required: true,
      detail: isIncompatible ? message : "not found",
      fix: "Install the GitHub Copilot Chat extension in VS Code, or run: npm install -g @github/copilot"
    };
  }
}

export async function checkGitHubToken(): Promise<CheckResult> {
  const token = await getGitHubToken();
  if (token) {
    const source = process.env.GITHUB_TOKEN
      ? "GITHUB_TOKEN"
      : process.env.GH_TOKEN
        ? "GH_TOKEN"
        : "gh CLI";
    return { name: "GitHub auth", ok: true, required: true, detail: `via ${source}` };
  }
  return {
    name: "GitHub auth",
    ok: false,
    required: true,
    detail: "no token found",
    fix: "Set GITHUB_TOKEN or GH_TOKEN, or run: gh auth login"
  };
}

export async function checkAzureDevOps(): Promise<CheckResult> {
  const pat = process.env.AZURE_DEVOPS_PAT ?? process.env.AZDO_PAT;
  if (pat) {
    const source = process.env.AZURE_DEVOPS_PAT ? "AZURE_DEVOPS_PAT" : "AZDO_PAT";
    return { name: "Azure DevOps", ok: true, required: false, detail: `PAT set via ${source}` };
  }
  return {
    name: "Azure DevOps",
    ok: true,
    required: false,
    detail: "not configured (optional; set AZURE_DEVOPS_PAT for Azure DevOps workflows)"
  };
}

export async function runDoctorChecks(): Promise<DoctorResult> {
  const checks = await Promise.all([
    checkNodeVersion(),
    checkGit(),
    checkCopilotCli(),
    checkGitHubToken(),
    checkAzureDevOps()
  ]);

  const hasFailures = checks.filter((c) => c.required).some((c) => !c.ok);

  return { checks, hasFailures };
}
