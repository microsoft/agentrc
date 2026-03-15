import path from "path";

import { analyzeRepo, loadAgentrcConfig } from "@agentrc/core/services/analyzer";
import type { InstructionStrategy } from "@agentrc/core/services/instructions";
import {
  generateCopilotInstructions,
  generateAreaInstructions,
  generateNestedInstructions,
  generateNestedAreaInstructions,
  areaInstructionPath,
  writeAreaInstruction,
  writeNestedInstructions
} from "@agentrc/core/services/instructions";
import { ensureDir, safeWriteFile } from "@agentrc/core/utils/fs";
import type { CommandResult } from "@agentrc/core/utils/output";
import {
  outputResult,
  outputError,
  createProgressReporter,
  shouldLog
} from "@agentrc/core/utils/output";

function skipReason(action: string): string {
  if (action === "symlink") return "symlink";
  if (action === "empty") return "empty content";
  return "exists, use --force";
}

type InstructionsOptions = {
  repo?: string;
  output?: string;
  model?: string;
  json?: boolean;
  quiet?: boolean;
  force?: boolean;
  areas?: boolean;
  areasOnly?: boolean;
  area?: string;
  strategy?: string;
  claudeMd?: boolean;
  dryRun?: boolean;
};

export async function instructionsCommand(options: InstructionsOptions): Promise<void> {
  const repoPath = path.resolve(options.repo ?? process.cwd());
  const outputPath = path.resolve(
    options.output ?? path.join(repoPath, ".github", "copilot-instructions.md")
  );
  const progress = createProgressReporter(!shouldLog(options));
  const wantAreas = options.areas || options.areasOnly || options.area;

  // Load config for strategy merge (CLI flag > config > default "flat")
  let strategy: InstructionStrategy = "flat";
  let detailDir = ".agents";
  let claudeMd = false;
  try {
    const config = await loadAgentrcConfig(repoPath);
    strategy = (options.strategy as InstructionStrategy) ?? config?.strategy ?? "flat";
    detailDir = config?.detailDir ?? ".agents";
    claudeMd = options.claudeMd ?? config?.claudeMd ?? false;
  } catch {
    // Config loading failure is non-fatal; use defaults
    if (options.strategy === "flat" || options.strategy === "nested") {
      strategy = options.strategy;
    }
    if (options.claudeMd) claudeMd = true;
  }

  // Validate strategy value
  if (strategy !== "flat" && strategy !== "nested") {
    outputError(`Invalid strategy "${strategy}". Use "flat" or "nested".`, Boolean(options.json));
    return;
  }

  try {
    const dryRunFiles: { path: string; bytes: number }[] = [];

    // Generate root instructions unless --areas-only
    if (!options.areasOnly && !options.area) {
      if (strategy === "nested") {
        // Nested: generate AGENTS.md hub + detail files
        try {
          progress.update("Generating nested instructions...");
          const nestedResult = await generateNestedInstructions({
            repoPath,
            model: options.model,
            onProgress: shouldLog(options) ? (msg) => progress.update(msg) : undefined,
            detailDir,
            claudeMd
          });
          if (options.dryRun) {
            const dryFiles = [
              { path: nestedResult.hub.relativePath, content: nestedResult.hub.content },
              ...nestedResult.details.map((d) => ({ path: d.relativePath, content: d.content })),
              ...(nestedResult.claudeMd
                ? [
                    {
                      path: nestedResult.claudeMd.relativePath,
                      content: nestedResult.claudeMd.content
                    }
                  ]
                : [])
            ];
            for (const file of dryFiles) {
              const relPath = path.relative(process.cwd(), path.join(repoPath, file.path));
              if (shouldLog(options)) {
                progress.update(
                  `[dry-run] Would write ${relPath} (${Buffer.byteLength(file.content, "utf8")} bytes)`
                );
              }
            }
            if (options.json) {
              dryRunFiles.push(
                ...dryFiles.map((f) => ({
                  path: f.path,
                  bytes: Buffer.byteLength(f.content, "utf8")
                }))
              );
            }
          } else {
            const actions = await writeNestedInstructions(repoPath, nestedResult, options.force);
            for (const action of actions) {
              const relPath = path.relative(process.cwd(), action.path);
              if (action.action === "wrote") {
                if (shouldLog(options)) progress.succeed(`Wrote ${relPath}`);
              } else if (shouldLog(options)) {
                progress.update(`Skipped ${relPath} (${skipReason(action.action)})`);
              }
            }
            for (const warning of nestedResult.warnings) {
              if (shouldLog(options)) progress.update(`Warning: ${warning}`);
            }
            if (options.json) {
              const result: CommandResult<{ files: typeof actions }> = {
                ok: true,
                status: "success",
                data: { files: actions }
              };
              outputResult(result, true);
            }
          }
        } catch (error) {
          const msg =
            "Failed to generate nested instructions. " +
            (error instanceof Error ? error.message : String(error));
          outputError(msg, Boolean(options.json));
          if (!wantAreas) return;
        }
      } else {
        // Flat: existing behavior
        let content = "";
        try {
          progress.update("Generating instructions...");
          content = await generateCopilotInstructions({
            repoPath,
            model: options.model
          });
        } catch (error) {
          const msg =
            "Failed to generate instructions with Copilot SDK. " +
            "Ensure the Copilot CLI is installed (copilot --version) and logged in. " +
            (error instanceof Error ? error.message : String(error));
          outputError(msg, Boolean(options.json));
          if (!wantAreas) return;
        }
        if (!content && !wantAreas) {
          outputError("No instructions were generated.", Boolean(options.json));
          return;
        }

        if (content) {
          if (options.dryRun) {
            const relPath = path.relative(process.cwd(), outputPath);
            const byteCount = Buffer.byteLength(content, "utf8");
            if (shouldLog(options)) {
              progress.update(`[dry-run] Would write ${relPath} (${byteCount} bytes)`);
            }
            if (options.json) {
              dryRunFiles.push({ path: relPath, bytes: byteCount });
            }
          } else {
            await ensureDir(path.dirname(outputPath));
            const { wrote, reason } = await safeWriteFile(
              outputPath,
              content,
              Boolean(options.force)
            );

            if (!wrote) {
              const relPath = path.relative(process.cwd(), outputPath);
              const why = reason === "symlink" ? "path is a symlink" : "file exists (use --force)";
              if (options.json) {
                const result: CommandResult<{ outputPath: string; skipped: true; reason: string }> =
                  {
                    ok: true,
                    status: "noop",
                    data: { outputPath, skipped: true, reason: why }
                  };
                outputResult(result, true);
              } else if (shouldLog(options)) {
                progress.update(`Skipped ${relPath}: ${why}`);
              }
            } else {
              const byteCount = Buffer.byteLength(content, "utf8");

              if (options.json) {
                const result: CommandResult<{
                  outputPath: string;
                  model: string;
                  byteCount: number;
                }> = {
                  ok: true,
                  status: "success",
                  data: { outputPath, model: options.model ?? "default", byteCount }
                };
                outputResult(result, true);
              } else if (shouldLog(options)) {
                progress.succeed(`Updated ${path.relative(process.cwd(), outputPath)}`);
              }
            }
          }
        }
      }
    }

    // Generate area-based instructions
    if (wantAreas) {
      let analysis;
      try {
        analysis = await analyzeRepo(repoPath);
      } catch (error) {
        outputError(
          `Failed to analyze repository: ${error instanceof Error ? error.message : String(error)}`,
          Boolean(options.json)
        );
        return;
      }
      const areas = analysis.areas ?? [];

      if (areas.length === 0) {
        if (shouldLog(options)) {
          progress.update("No areas detected. Use agentrc.config.json to define custom areas.");
        }
        return;
      }

      const areaFilter = options.area?.toLowerCase();
      const targetAreas = areaFilter
        ? areas.filter((a) => a.name.toLowerCase() === areaFilter)
        : areas;

      if (options.area && targetAreas.length === 0) {
        outputError(
          `Area "${options.area}" not found. Available: ${areas.map((a) => a.name).join(", ")}`,
          Boolean(options.json)
        );
        return;
      }

      if (shouldLog(options)) {
        progress.update(`Generating instructions for ${targetAreas.length} area(s)...`);
      }

      for (const area of targetAreas) {
        try {
          if (shouldLog(options)) {
            progress.update(
              `Generating for "${area.name}" (${Array.isArray(area.applyTo) ? area.applyTo.join(", ") : area.applyTo})...`
            );
          }

          if (strategy === "nested") {
            // Nested: per-area AGENTS.md hub + detail files
            const childAreas = areas.filter((a) => a.parentArea === area.name);
            const nestedResult = await generateNestedAreaInstructions({
              repoPath,
              area,
              childAreas,
              model: options.model,
              onProgress: shouldLog(options) ? (msg) => progress.update(msg) : undefined,
              detailDir,
              claudeMd
            });
            if (options.dryRun) {
              const dryFiles = [
                { path: nestedResult.hub.relativePath, content: nestedResult.hub.content },
                ...nestedResult.details.map((d) => ({ path: d.relativePath, content: d.content })),
                ...(nestedResult.claudeMd
                  ? [
                      {
                        path: nestedResult.claudeMd.relativePath,
                        content: nestedResult.claudeMd.content
                      }
                    ]
                  : [])
              ];
              for (const file of dryFiles) {
                const relPath = path.relative(process.cwd(), path.join(repoPath, file.path));
                if (shouldLog(options)) {
                  progress.update(
                    `[dry-run] Would write ${relPath} (${Buffer.byteLength(file.content, "utf8")} bytes)`
                  );
                }
              }
              if (options.json) {
                dryRunFiles.push(
                  ...dryFiles.map((f) => ({
                    path: f.path,
                    bytes: Buffer.byteLength(f.content, "utf8")
                  }))
                );
              }
            } else {
              const actions = await writeNestedInstructions(repoPath, nestedResult, options.force);
              for (const action of actions) {
                const relPath = path.relative(process.cwd(), action.path);
                if (action.action === "wrote") {
                  if (shouldLog(options)) progress.succeed(`Wrote ${relPath}`);
                } else if (shouldLog(options)) {
                  progress.update(`Skipped ${relPath} (${skipReason(action.action)})`);
                }
              }
              for (const warning of nestedResult.warnings) {
                if (shouldLog(options)) progress.update(`Warning: ${warning}`);
              }
            }
          } else {
            // Flat: existing behavior
            const body = await generateAreaInstructions({
              repoPath,
              area,
              model: options.model,
              onProgress: shouldLog(options) ? (msg) => progress.update(msg) : undefined
            });

            if (!body.trim()) {
              if (shouldLog(options)) {
                progress.update(`Skipped "${area.name}" — no content generated.`);
              }
              continue;
            }

            if (options.dryRun) {
              if (shouldLog(options)) {
                progress.update(
                  `[dry-run] Would write area "${area.name}" (${Buffer.byteLength(body, "utf8")} bytes)`
                );
              }
              if (options.json) {
                dryRunFiles.push({
                  path: path.relative(process.cwd(), areaInstructionPath(repoPath, area)),
                  bytes: Buffer.byteLength(body, "utf8")
                });
              }
            } else {
              const result = await writeAreaInstruction(repoPath, area, body, options.force);
              if (result.status === "skipped") {
                if (shouldLog(options)) {
                  progress.update(
                    `Skipped "${area.name}" — file exists (use --force to overwrite).`
                  );
                }
                continue;
              }
              if (result.status === "symlink") {
                if (shouldLog(options)) {
                  progress.update(`Skipped "${area.name}" — path is a symlink.`);
                }
                continue;
              }
              if (shouldLog(options)) {
                progress.succeed(`Wrote ${path.relative(process.cwd(), result.filePath)}`);
              }
            }
          }
        } catch (error) {
          if (shouldLog(options)) {
            progress.update(
              `Failed for "${area.name}": ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }

    if (options.dryRun && options.json && dryRunFiles.length > 0) {
      outputResult(
        { ok: true, status: "noop" as const, data: { dryRun: true, files: dryRunFiles } },
        true
      );
    }

    if (!wantAreas && shouldLog(options) && !options.json) {
      process.stderr.write("\nNext steps:\n");
      process.stderr.write("  agentrc eval --init      Scaffold evaluation test cases\n");
      process.stderr.write("  agentrc generate mcp     Generate MCP configuration\n");
      process.stderr.write("  agentrc generate vscode  Generate VS Code settings\n");
    }
  } catch (error) {
    outputError(
      `Instructions failed: ${error instanceof Error ? error.message : String(error)}`,
      Boolean(options.json)
    );
  }
}
