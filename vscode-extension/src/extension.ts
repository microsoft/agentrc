import * as vscode from "vscode";
import { analyzeCommand, getCachedAnalysis } from "./commands/analyze.js";
import { generateCommand } from "./commands/generate.js";
import { instructionsCommand } from "./commands/instructions.js";
import { readinessCommand } from "./commands/readiness.js";
import { evalCommand, evalInitCommand } from "./commands/eval.js";
import { initCommand } from "./commands/init.js";
import { prCommand } from "./commands/pr.js";
import { batchInstructionsCommand } from "./commands/batch.js";
import {
  analysisTreeProvider,
  readinessTreeProvider,
  workspaceStatusTreeProvider
} from "./views/providers.js";

export function activate(context: vscode.ExtensionContext): void {
  // Status bar — only show after analysis
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.text = "$(beaker) AgentRC";
  statusBar.tooltip = "AgentRC — click to analyze repository";
  statusBar.command = "agentrc.analyze";
  context.subscriptions.push(statusBar);

  // Tree views (createTreeView for description/badge support)
  const workspaceView = vscode.window.createTreeView("agentrc.workspace", {
    treeDataProvider: workspaceStatusTreeProvider
  });
  const analysisView = vscode.window.createTreeView("agentrc.analysis", {
    treeDataProvider: analysisTreeProvider
  });
  const readinessView = vscode.window.createTreeView("agentrc.readiness", {
    treeDataProvider: readinessTreeProvider
  });
  context.subscriptions.push(workspaceView, analysisView, readinessView);

  function updateAnalysisView(): void {
    const analysis = getCachedAnalysis();
    if (analysis) {
      const parts = [...analysis.languages.slice(0, 3), ...analysis.frameworks.slice(0, 2)];
      analysisView.description = parts.join(", ") || undefined;
    } else {
      analysisView.description = undefined;
    }
  }

  function updateReadinessView(): void {
    const report = readinessTreeProvider.getReport();
    if (report) {
      readinessView.description = `Level ${report.achievedLevel}`;
    } else {
      readinessView.description = undefined;
    }
  }

  function updateStatusBar(): void {
    const analysis = getCachedAnalysis();
    if (analysis) {
      const parts = analysis.languages.slice(0, 2);
      statusBar.text = `$(beaker) ${parts.join(", ") || "AgentRC"}`;
      statusBar.tooltip = `AgentRC — ${analysis.languages.join(", ")}${analysis.isMonorepo ? " | monorepo" : ""}`;
      statusBar.show();
    } else {
      statusBar.hide();
    }
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("agentrc.analyze", async () => {
      await analyzeCommand();
      analysisTreeProvider.refresh();
      updateAnalysisView();
      updateStatusBar();
      vscode.commands.executeCommand("agentrc.analysis.focus");
    }),
    vscode.commands.registerCommand("agentrc.generate", generateCommand),
    vscode.commands.registerCommand("agentrc.instructions", instructionsCommand),
    vscode.commands.registerCommand("agentrc.readiness", async () => {
      await readinessCommand();
      updateReadinessView();
      updateStatusBar();
    }),
    vscode.commands.registerCommand("agentrc.eval", evalCommand),
    vscode.commands.registerCommand("agentrc.evalInit", async () => {
      await evalInitCommand();
      workspaceStatusTreeProvider.refresh();
    }),
    vscode.commands.registerCommand("agentrc.init", async () => {
      await initCommand();
      analysisTreeProvider.refresh();
      workspaceStatusTreeProvider.refresh();
      updateAnalysisView();
      updateStatusBar();
      vscode.commands.executeCommand("agentrc.analysis.focus");
    }),
    vscode.commands.registerCommand("agentrc.pr", prCommand),
    vscode.commands.registerCommand("agentrc.batchInstructions", batchInstructionsCommand)
  );

  // Auto-analyze on activation if configured
  const config = vscode.workspace.getConfiguration("agentrc");
  if (config.get<boolean>("autoAnalyze") && vscode.workspace.workspaceFolders?.length) {
    analyzeCommand()
      .then(() => {
        analysisTreeProvider.refresh();
        updateAnalysisView();
        updateStatusBar();
      })
      .catch((err) => console.error("AgentRC auto-analyze failed:", err));
  }
}

export function deactivate(): void {}
