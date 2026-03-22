import path from "path";

import { analyzeRepo } from "@agentrc/core/services/analyzer";
import type { FileAction } from "@agentrc/core/services/generator";
import { generateConfigs } from "@agentrc/core/services/generator";
import type { CommandResult } from "@agentrc/core/utils/output";
import { outputResult, outputError, deriveFileStatus, shouldLog } from "@agentrc/core/utils/output";

import { instructionsCommand } from "./instructions";

type GenerateOptions = {
  force?: boolean;
  perApp?: boolean;
  model?: string;
  json?: boolean;
  quiet?: boolean;
  strategy?: string;
  dryRun?: boolean;
};

export async function generateCommand(
  type: string,
  repoPathArg: string | undefined,
  options: GenerateOptions
): Promise<void> {
  const repoPath = path.resolve(repoPathArg ?? process.cwd());

  if (type === "instructions" || type === "agents") {
    if (!options.quiet) {
      process.stderr.write(
        `⚠ \`generate ${type}\` is deprecated — use \`agentrc instructions\` directly.\n`
      );
    }
    if (options.perApp && !options.quiet) {
      process.stderr.write(
        `⚠ --per-app is deprecated — use \`agentrc instructions --areas\` instead.\n`
      );
    }
    // Delegate to the canonical instructions command
    const output = type === "agents" ? path.join(repoPath, "AGENTS.md") : undefined;
    await instructionsCommand({
      repo: repoPath,
      output,
      force: options.force,
      model: options.model,
      json: options.json,
      quiet: options.quiet,
      areas: options.perApp,
      strategy: options.strategy,
      dryRun: options.dryRun
    });
    return;
  }

  let analysis;
  try {
    analysis = await analyzeRepo(repoPath);
  } catch (error) {
    outputError(
      `Failed to analyze repo: ${error instanceof Error ? error.message : String(error)}`,
      Boolean(options.json)
    );
    return;
  }

  const selections = [type];
  let genResult;
  try {
    genResult = await generateConfigs({
      repoPath,
      analysis,
      selections,
      force: Boolean(options.force),
      dryRun: Boolean(options.dryRun)
    });
  } catch (error) {
    outputError(
      `Failed to generate configs: ${error instanceof Error ? error.message : String(error)}`,
      Boolean(options.json)
    );
    return;
  }

  if (options.json) {
    const { ok, status } = deriveFileStatus(genResult.files);
    const result: CommandResult<{ type: string; files: FileAction[]; dryRun?: boolean }> = {
      ok,
      status: options.dryRun ? "noop" : status,
      data: { type, files: genResult.files, dryRun: options.dryRun }
    };
    outputResult(result, true);
    if (!ok) process.exitCode = 1;
  } else {
    for (const file of genResult.files) {
      if (shouldLog(options)) {
        const prefix = options.dryRun
          ? file.action === "wrote"
            ? "[dry-run] Would write"
            : "[dry-run] Would skip"
          : file.action === "wrote"
            ? "Wrote"
            : "Skipped";
        const suffix = options.dryRun && file.bytes !== undefined ? ` (${file.bytes} bytes)` : "";
        process.stderr.write(`${prefix} ${file.path}${suffix}\n`);
      }
    }
    if (genResult.files.length === 0 && shouldLog(options)) {
      process.stderr.write("No changes made.\n");
    }
  }
}
