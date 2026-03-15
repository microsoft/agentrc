import * as vscode from "vscode";
import { analyzeRepo } from "../services.js";
import type { RepoAnalysis } from "../types.js";

let cachedAnalysis: RepoAnalysis | undefined;

export function getCachedAnalysis(): RepoAnalysis | undefined {
  return cachedAnalysis;
}

export function setCachedAnalysis(analysis: RepoAnalysis | undefined): void {
  cachedAnalysis = analysis;
  vscode.commands.executeCommand("setContext", "agentrc.hasAnalysis", !!analysis);
}

export async function analyzeCommand(): Promise<void> {
  const workspacePath = await pickWorkspacePath();
  if (!workspacePath) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "AgentRC: Analyzing repository…" },
    async () => {
      try {
        const analysis = await analyzeRepo(workspacePath);
        setCachedAnalysis(analysis);
      } catch (err) {
        vscode.window.showErrorMessage(
          `AgentRC: Analysis failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}

export async function pickWorkspacePath(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("AgentRC: No workspace folder open.");
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0].uri.fsPath;
  }
  const picked = await vscode.window.showQuickPick(
    folders.map((f) => ({ label: f.name, description: f.uri.fsPath, fsPath: f.uri.fsPath })),
    { placeHolder: "Select workspace folder" }
  );
  return picked?.fsPath;
}
