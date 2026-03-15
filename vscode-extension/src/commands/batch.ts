import * as vscode from "vscode";
import { generateCopilotInstructions, loadAgentrcConfig, safeWriteFile } from "../services.js";
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
          let outputPath = path.join(workspacePath, ".github", "copilot-instructions.md");
          try {
            const config = await loadAgentrcConfig(workspacePath);
            if (config?.strategy === "nested") {
              outputPath = path.join(workspacePath, "AGENTS.md");
            }
          } catch {
            // Non-fatal
          }

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
