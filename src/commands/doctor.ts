import { execFile } from "node:child_process";
import { promisify } from "node:util";

import chalk from "chalk";

import { findCopilotCliConfig, assertCopilotCliReady } from "../services/copilot";
import { getGitHubToken } from "../services/github";
import type { CommandResult } from "../utils/output";
import { outputResult, shouldLog } from "../utils/output";

const execFileAsync = promisify(execFile);

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
};

type DoctorOptions = {
  json?: boolean;
  quiet?: boolean;
  accessible?: boolean;
};

async function checkNodeVersion(): Promise<CheckResult> {
  const version = process.versions.node;
  const major = parseInt(version.split(".")[0], 10);
  if (major >= 20) {
    return { name: "Node.js", ok: true, detail: `v${version}` };
  }
  return {
    name: "Node.js",
    ok: false,
    detail: `v${version} (requires >=20)`,
    fix: "Install Node.js 20 or later from https://nodejs.org"
  };
}

async function checkGit(): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync("git", ["--version"], { timeout: 5000 });
    const version = stdout.trim();
    return { name: "git", ok: true, detail: version };
  } catch {
    return {
      name: "git",
      ok: false,
      detail: "not found",
      fix: "Install git from https://git-scm.com"
    };
  }
}

async function checkCopilotCli(): Promise<CheckResult> {
  try {
    const config = await findCopilotCliConfig();
    const desc = config.cliArgs ? `${config.cliPath} ${config.cliArgs.join(" ")}` : config.cliPath;

    try {
      await assertCopilotCliReady();
      return { name: "Copilot CLI", ok: true, detail: desc };
    } catch {
      return {
        name: "Copilot CLI",
        ok: false,
        detail: `found at ${desc} but incompatible (no --headless support)`,
        fix: "Update the GitHub Copilot Chat extension in VS Code, or run: npm install -g @github/copilot"
      };
    }
  } catch {
    return {
      name: "Copilot CLI",
      ok: false,
      detail: "not found",
      fix: "Install the GitHub Copilot Chat extension in VS Code, or run: npm install -g @github/copilot"
    };
  }
}

async function checkGitHubToken(): Promise<CheckResult> {
  const token = await getGitHubToken();
  if (token) {
    const source = process.env.GITHUB_TOKEN
      ? "GITHUB_TOKEN"
      : process.env.GH_TOKEN
        ? "GH_TOKEN"
        : "gh CLI";
    return { name: "GitHub auth", ok: true, detail: `via ${source}` };
  }
  return {
    name: "GitHub auth",
    ok: false,
    detail: "no token found",
    fix: "Set GITHUB_TOKEN or GH_TOKEN, or run: gh auth login"
  };
}

async function checkAzureDevOps(): Promise<CheckResult> {
  const pat = process.env.AZURE_DEVOPS_PAT ?? process.env.AZDO_PAT;
  if (pat) {
    const source = process.env.AZURE_DEVOPS_PAT ? "AZURE_DEVOPS_PAT" : "AZDO_PAT";
    return { name: "Azure DevOps", ok: true, detail: `PAT set via ${source}` };
  }
  return {
    name: "Azure DevOps",
    ok: false,
    detail: "no PAT found (optional)",
    fix: "Set AZURE_DEVOPS_PAT for Azure DevOps workflows"
  };
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const checks: CheckResult[] = [];

  // Run required checks in parallel
  const [nodeResult, gitResult, copilotResult, ghResult, azdoResult] = await Promise.all([
    checkNodeVersion(),
    checkGit(),
    checkCopilotCli(),
    checkGitHubToken(),
    checkAzureDevOps()
  ]);
  checks.push(nodeResult, gitResult, copilotResult, ghResult, azdoResult);

  const requiredChecks = checks.filter((c) => c.name !== "Azure DevOps");
  const hasFailures = requiredChecks.some((c) => !c.ok);

  const result: CommandResult<{ checks: CheckResult[] }> = {
    ok: !hasFailures,
    status: hasFailures ? "error" : "success",
    data: { checks }
  };

  if (options.json) {
    outputResult(result, true);
    return;
  }

  if (shouldLog(options)) {
    const acc = options.accessible;
    process.stderr.write("\n  AgentRC Doctor\n\n");
    for (const check of checks) {
      const icon = check.ok
        ? acc
          ? chalk.green("OK")
          : chalk.green("✓")
        : acc
          ? chalk.red("FAIL")
          : chalk.red("✗");
      const label = check.ok ? check.name : chalk.red(check.name);
      const sep = acc ? " - " : " — ";
      process.stderr.write(`  ${icon} ${label}${sep}${check.detail}\n`);
      if (!check.ok && check.fix) {
        const arrow = acc ? chalk.dim("->") : chalk.dim("→");
        process.stderr.write(`    ${arrow} ${chalk.dim(check.fix)}\n`);
      }
    }
    process.stderr.write("\n");

    if (hasFailures) {
      process.stderr.write(
        chalk.red("  Some required checks failed. Fix the issues above and try again.\n\n")
      );
    } else {
      process.stderr.write(chalk.green("  All required checks passed!\n\n"));
    }
  }

  if (hasFailures) {
    process.exitCode = 1;
  }
}
