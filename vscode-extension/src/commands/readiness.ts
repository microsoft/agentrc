import * as vscode from "vscode";
import path from "node:path";
import {
  runReadinessReport,
  generateVisualReport,
  analyzeRepo,
  loadAgentrcConfig
} from "../services.js";
import { VscodeProgressReporter } from "../progress.js";
import { pickWorkspacePath, getCachedAnalysis, setCachedAnalysis } from "./analyze.js";
import { createWebviewPanel } from "../webview.js";
import { readinessTreeProvider } from "../views/providers.js";

export async function readinessCommand(): Promise<void> {
  const workspacePath = await pickWorkspacePath();
  if (!workspacePath) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AgentRC: Running readiness report…",
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

        // Load policies from agentrc.config.json
        let policies: string[] | undefined;
        try {
          const config = await loadAgentrcConfig(workspacePath);
          policies = config?.policies;
        } catch {
          // Non-fatal — proceed without policies
        }

        reporter.update("Evaluating readiness pillars…");
        const report = await runReadinessReport({ repoPath: workspacePath, policies });

        reporter.update("Generating report…");
        const repoName = path.basename(workspacePath);
        const html = generateVisualReport({
          reports: [{ repo: repoName, report }],
          title: `${repoName} — Readiness Report`
        });

        createWebviewPanel("agentrc.readinessReport", "Readiness Report", html);
        readinessTreeProvider.setReport(report);

        const policyNote = policies?.length ? ` (${policies.length} policy source(s) applied)` : "";
        reporter.succeed(`Readiness: Level ${report.achievedLevel} achieved.${policyNote}`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `AgentRC: Readiness report failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}
