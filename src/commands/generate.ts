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
      strategy: options.strategy
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
      force: Boolean(options.force)
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
    const result: CommandResult<{ type: string; files: FileAction[] }> = {
      ok,
      status,
      data: { type, files: genResult.files }
    };
    outputResult(result, true);
    if (!ok) process.exitCode = 1;
  } else {
    for (const file of genResult.files) {
      if (shouldLog(options)) {
        process.stderr.write(`${file.action === "wrote" ? "Wrote" : "Skipped"} ${file.path}\n`);
      }
    }
    if (genResult.files.length === 0 && shouldLog(options)) {
      process.stderr.write("No changes made.\n");
    }
  }
}
