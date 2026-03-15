import { createRequire } from "node:module";

import { DEFAULT_MODEL, DEFAULT_JUDGE_MODEL } from "@agentrc/core/config";
import { Argument, Command } from "commander";

import { analyzeCommand } from "./commands/analyze";
import { batchCommand } from "./commands/batch";
import { batchReadinessCommand } from "./commands/batchReadiness";
import { evalCommand } from "./commands/eval";
import { generateCommand } from "./commands/generate";
import { initCommand } from "./commands/init";
import { instructionsCommand } from "./commands/instructions";
import { prCommand } from "./commands/pr";
import { readinessCommand } from "./commands/readiness";
import { tuiCommand } from "./commands/tui";

const _require = createRequire(import.meta.url);
export const CLI_VERSION = (_require("../package.json") as { version: string }).version;

/**
 * Merge program-level --json/--quiet into each command's local options
 * so every action handler receives a unified options object.
 */
export function withGlobalOpts<TArgs extends unknown[], TOptions extends Record<string, unknown>>(
  fn: (...args: [...TArgs, TOptions]) => Promise<void>
): (...raw: unknown[]) => Promise<void> {
  return async (...raw: unknown[]) => {
    const cmd = raw[raw.length - 1] as Command;
    const localOpts = raw[raw.length - 2] as TOptions;
    const globalOpts = cmd.optsWithGlobals();
    const merged = {
      ...localOpts,
      json: globalOpts.json,
      quiet: globalOpts.quiet,
      accessible: globalOpts.accessible ?? false
    } as TOptions;
    raw[raw.length - 2] = merged;
    raw.pop(); // remove Command
    await (fn as (...args: unknown[]) => Promise<void>)(...raw);
  };
}

export function runCli(argv: string[]): void {
  const program = new Command();

  program
    .name("agentrc")
    .description("Set up repositories for AI-assisted development")
    .version(CLI_VERSION)
    .option("--json", "Output machine-readable JSON to stdout")
    .option("--quiet", "Suppress stderr progress output")
    .option("--accessible", "Enable screen reader friendly output");

  program
    .command("init")
    .description("Init repository — analyze & generate instructions")
    .argument("[path]", "Path to a local repository")
    .option("--github", "Use a GitHub repository")
    .option("--provider <provider>", "Repo provider (github|azure)")
    .option("--yes", "Accept defaults (generates instructions, MCP, and VS Code configs)")
    .option("--force", "Overwrite existing files")
    .option("--model <name>", "Model for instructions generation", DEFAULT_MODEL)
    .action(withGlobalOpts(initCommand));

  program
    .command("analyze")
    .description("Detect languages, frameworks, monorepo structure, and areas")
    .argument("[path]", "Path to a local repository")
    .option("--output <path>", "Write report to file (.json or .md)")
    .option("--force", "Overwrite existing output file")
    .action(withGlobalOpts(analyzeCommand));

  program
    .command("generate")
    .description("Generate instructions, agents, MCP, or VS Code configs")
    .addArgument(
      new Argument("<type>", "Config type to generate").choices([
        "instructions",
        "agents",
        "mcp",
        "vscode"
      ])
    )
    .argument("[path]", "Path to a local repository")
    .option("--force", "Overwrite existing files")
    .option("--per-app", "(deprecated) Use `agentrc instructions --areas` instead")
    .option("--model <name>", "Model for instructions generation", DEFAULT_MODEL)
    .option("--strategy <mode>", "Instruction strategy (flat or nested)")
    .action(withGlobalOpts(generateCommand));

  program
    .command("pr")
    .description("Create a PR with generated configs on GitHub or Azure DevOps")
    .argument("[repo]", "Repo identifier (github: owner/name, azure: org/project/repo)")
    .option("--branch <name>", "Branch name")
    .option("--provider <provider>", "Repo provider (github|azure)")
    .option("--model <name>", "Model for instructions generation", DEFAULT_MODEL)
    .action(withGlobalOpts(prCommand));

  program
    .command("eval")
    .description("Compare AI responses with and without instructions")
    .argument("[path]", "Path to eval config JSON")
    .option("--repo <path>", "Repository path", process.cwd())
    .option("--model <name>", "Model for responses", DEFAULT_MODEL)
    .option("--judge-model <name>", "Model for judging", DEFAULT_JUDGE_MODEL)
    .option("--list-models", "List Copilot CLI models and exit")
    .option("--output <path>", "Write results JSON to file")
    .option("--init", "Create a starter agentrc.eval.json file")
    .option("--count <number>", "Number of eval cases to generate (with --init)")
    .option("--fail-level <number>", "Exit with error if pass rate (%) falls below threshold")
    .action(withGlobalOpts(evalCommand));

  program
    .command("tui")
    .description("Interactive terminal UI for generation, evaluation, and batch workflows")
    .option("--repo <path>", "Repository path", process.cwd())
    .option("--no-animation", "Skip the animated banner intro")
    .action(withGlobalOpts(tuiCommand));

  program
    .command("instructions")
    .description("Generate instructions for the repository")
    .option("--repo <path>", "Repository path", process.cwd())
    .option("--output <path>", "Output path for instructions")
    .option("--model <name>", "Model for instructions generation", DEFAULT_MODEL)
    .option("--force", "Overwrite existing area instruction files")
    .option("--areas", "Also generate instructions for detected areas")
    .option("--areas-only", "Generate only area instructions (skip root)")
    .option("--area <name>", "Generate instructions for a specific area")
    .option("--strategy <mode>", "Instruction strategy (flat or nested)")
    .option("--claude-md", "Generate CLAUDE.md files alongside AGENTS.md (nested strategy)")
    .option("--dry-run", "Preview generated files without writing anything")
    .action(withGlobalOpts(instructionsCommand));

  program
    .command("readiness")
    .description("Run readiness report across 9 maturity pillars")
    .argument("[path]", "Path to a local repository")
    .option("--output <path>", "Write report to file (.json, .md, or .html)")
    .option("--force", "Overwrite existing output file")
    .option("--visual", "Generate visual HTML report")
    .option("--per-area", "Show per-area readiness breakdown")
    .option("--policy <sources>", "Policy sources (comma-separated: paths, npm packages)")
    .option("--fail-level <number>", "Exit with error if readiness level is below threshold (1–5)")
    .action(withGlobalOpts(readinessCommand));

  program
    .command("batch")
    .description("Batch process multiple repos across orgs")
    .argument("[repos...]", "Repos in owner/name form (GitHub) or org/project/repo (Azure)")
    .option("--output <path>", "Write results JSON to file")
    .option("--provider <provider>", "Repo provider (github|azure)", "github")
    .option("--model <name>", "Model for instructions generation", DEFAULT_MODEL)
    .option("--branch <name>", "Branch name for PRs")
    .action(withGlobalOpts(batchCommand));

  program
    .command("batch-readiness")
    .description("Run batch readiness report for multiple repos")
    .option("--output <path>", "Write HTML report to file")
    .option("--policy <sources>", "Policy sources (comma-separated: paths, npm packages)")
    .action(withGlobalOpts(batchReadinessCommand));

  program.parse(argv);
}
