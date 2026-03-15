import * as vscode from "vscode";
import path from "node:path";
import {
  runEval,
  generateEvalScaffold,
  analyzeRepo,
  safeWriteFile,
  DEFAULT_MODEL
} from "../services.js";
import { VscodeProgressReporter } from "../progress.js";
import { pickWorkspacePath, getCachedAnalysis, setCachedAnalysis } from "./analyze.js";
import { createWebviewPanel } from "../webview.js";
import fs from "node:fs";

export async function evalCommand(): Promise<void> {
  const workspacePath = await pickWorkspacePath();
  if (!workspacePath) return;

  const configPath = path.join(workspacePath, "agentrc.eval.json");
  if (!fs.existsSync(configPath)) {
    const action = await vscode.window.showWarningMessage(
      "AgentRC: No agentrc.eval.json found. Create one?",
      "Scaffold",
      "Cancel"
    );
    if (action === "Scaffold") {
      await evalInitCommand();
    }
    return;
  }

  const config = vscode.workspace.getConfiguration("agentrc");
  const model = config.get<string>("model") ?? DEFAULT_MODEL;
  const judgeModel = config.get<string>("judgeModel") ?? model;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AgentRC: Running eval…",
      cancellable: false
    },
    async (progress) => {
      try {
        const reporter = new VscodeProgressReporter(progress);

        reporter.update("Running evaluation…");
        const result = await runEval({
          configPath,
          repoPath: workspacePath,
          model,
          judgeModel,
          onProgress: (msg) => reporter.update(msg)
        });

        reporter.succeed(`Eval complete. ${result.summary}`);

        if (result.viewerPath && fs.existsSync(result.viewerPath)) {
          const html = fs.readFileSync(result.viewerPath, "utf-8");
          createWebviewPanel("agentrc.evalResults", "Eval Results", html);
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `AgentRC: Eval failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}

export async function evalInitCommand(): Promise<void> {
  const workspacePath = await pickWorkspacePath();
  if (!workspacePath) return;

  const config = vscode.workspace.getConfiguration("agentrc");
  const model = config.get<string>("model");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AgentRC: Scaffolding eval config…",
      cancellable: false
    },
    async (progress) => {
      try {
        const reporter = new VscodeProgressReporter(progress);

        let analysis = getCachedAnalysis();
        if (!analysis) {
          reporter.update("Analyzing repository…");
          analysis = await analyzeRepo(workspacePath);
          setCachedAnalysis(analysis);
        }

        reporter.update("Generating eval cases…");
        const evalConfig = await generateEvalScaffold({
          repoPath: workspacePath,
          count: 5,
          model,
          areas: analysis.areas,
          onProgress: (msg) => reporter.update(msg)
        });

        const outputPath = path.join(workspacePath, "agentrc.eval.json");
        await safeWriteFile(outputPath, JSON.stringify(evalConfig, null, 2) + "\n", false);

        reporter.succeed("Eval config scaffolded.");
        const doc = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(doc);
      } catch (err) {
        vscode.window.showErrorMessage(
          `AgentRC: Eval scaffold failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}
