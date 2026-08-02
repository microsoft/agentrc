import * as vscode from "vscode";
import {
  generateCopilotInstructions,
  generateNestedInstructions,
  loadAgentrcConfig,
  safeWriteFile,
  writeNestedInstructions
} from "../services.js";
import { VscodeProgressReporter } from "../progress.js";
import path from "node:path";

export async function batchInstructionsCommand(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("AgentRC: No workspace folders open.");
    return;
  }
  if (folders.length === 1) {
    vscode.window.showInformationMessage(
      "AgentRC: Only one workspace root — use 'Generate Instructions' instead."
    );
    return;
  }

  const model = vscode.workspace.getConfiguration("agentrc").get<string>("model");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AgentRC: Generating instructions for all roots…",
      cancellable: false
    },
    async (progress) => {
      const reporter = new VscodeProgressReporter(progress);
      let wrote = 0;
      let skipped = 0;
      let failed = 0;

      for (const folder of folders) {
        const workspacePath = folder.uri.fsPath;
        const name = folder.name;
        try {
          const config = await loadAgentrcConfig(workspacePath).catch(() => undefined);

          if (config?.strategy === "nested") {
            const detailDir = config.detailDir ?? ".agents";
            const claudeMd = config.claudeMd ?? false;

            reporter.update(`[${name}] Generating nested instructions…`);
            const nestedResult = await generateNestedInstructions({
              repoPath: workspacePath,
              model,
              onProgress: (msg) => reporter.update(msg),
              detailDir,
              claudeMd
            });

            const actions = await writeNestedInstructions(workspacePath, nestedResult, false);
            if (actions.some((a) => a.action === "wrote")) {
              wrote++;
            } else {
              skipped++;
              reporter.update(`[${name}] Skipped: instruction files already exist`);
            }

            for (const warning of nestedResult.warnings) {
              reporter.update(`Warning: ${warning}`);
            }
          } else {
            const outputPath = path.join(workspacePath, ".github", "copilot-instructions.md");

            reporter.update(`[${name}] Generating…`);
            const content = await generateCopilotInstructions({
              repoPath: workspacePath,
              model
            });

            if (!content) {
              skipped++;
              continue;
            }

            const { wrote: didWrite, reason } = await safeWriteFile(outputPath, content, false);
            if (didWrite) {
              wrote++;
            } else {
              skipped++;
              reporter.update(
                `[${name}] Skipped: ${reason === "exists" ? "file already exists" : (reason ?? "unknown")}`
              );
            }
          }
        } catch (err) {
          failed++;
          reporter.update(`[${name}] Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      reporter.succeed(
        `Done: ${wrote} generated, ${skipped} skipped, ${failed} failed (${folders.length} roots)`
      );
    }
  );
}
