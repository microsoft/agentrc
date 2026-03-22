import fs from "fs/promises";
import path from "path";

import * as vscode from "vscode";

export class WorkspaceStatusTreeProvider
  implements vscode.TreeDataProvider<WorkspaceStatusItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<WorkspaceStatusItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: WorkspaceStatusItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorkspaceStatusItem): Promise<WorkspaceStatusItem[]> {
    if (element) return [];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return [];
    return Promise.all([this.buildConfigItem(root), this.buildEvalItem(root)]);
  }

  private async buildConfigItem(root: string): Promise<WorkspaceStatusItem> {
    const candidates = [
      path.join(root, "agentrc.config.json"),
      path.join(root, ".github", "agentrc.config.json")
    ];
    const found = await Promise.all(
      candidates.map((p) =>
        fs
          .access(p)
          .then(() => true)
          .catch(() => false)
      )
    ).then((results) => results.some(Boolean));

    const item = new WorkspaceStatusItem(
      "Config",
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon(
      "settings-gear",
      found
        ? new vscode.ThemeColor("charts.green")
        : new vscode.ThemeColor("charts.yellow")
    );
    if (found) {
      item.description = "agentrc.config.json found";
      item.tooltip = "agentrc.config.json is present. Run agentrc init to regenerate.";
    } else {
      item.description = "not found — click to create";
      item.tooltip =
        "No agentrc.config.json found. Click to run agentrc init and scaffold one.";
      item.command = {
        command: "agentrc.init",
        title: "Create agentrc.config.json"
      };
    }
    return item;
  }

  private async buildEvalItem(root: string): Promise<WorkspaceStatusItem> {
    const evalPath = path.join(root, "agentrc.eval.json");
    const found = await fs.access(evalPath).then(
      () => true,
      () => false
    );

    const item = new WorkspaceStatusItem(
      "Evals",
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon(
      "beaker",
      found
        ? new vscode.ThemeColor("charts.green")
        : new vscode.ThemeColor("charts.yellow")
    );
    if (found) {
      item.description = "agentrc.eval.json found";
      item.tooltip = "agentrc.eval.json is present. Run agentrc eval to execute tests.";
    } else {
      item.description = "not found — click to create";
      item.tooltip = "No agentrc.eval.json found. Click to scaffold evaluation test cases.";
      item.command = {
        command: "agentrc.evalInit",
        title: "Create agentrc.eval.json"
      };
    }
    return item;
  }
}

class WorkspaceStatusItem extends vscode.TreeItem {
  constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
  }
}
