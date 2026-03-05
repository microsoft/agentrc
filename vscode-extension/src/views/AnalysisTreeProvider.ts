import * as vscode from "vscode";
import type { RepoAnalysis } from "../types.js";
import { getCachedAnalysis } from "../commands/analyze.js";

export class AnalysisTreeProvider implements vscode.TreeDataProvider<AnalysisItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AnalysisItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AnalysisItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnalysisItem): AnalysisItem[] {
    if (element) return element.children ?? [];
    const analysis = getCachedAnalysis();
    if (!analysis) return [];
    return this.getRootItems(analysis);
  }

  private getRootItems(analysis: RepoAnalysis): AnalysisItem[] {
    const items: AnalysisItem[] = [];

    if (analysis.languages.length > 0) {
      const langs = new AnalysisItem(
        "Languages",
        vscode.TreeItemCollapsibleState.Expanded,
        analysis.languages.map((l) => {
          const item = new AnalysisItem(l, vscode.TreeItemCollapsibleState.None);
          item.contextValue = "language";
          return item;
        })
      );
      langs.iconPath = new vscode.ThemeIcon("code");
      langs.description = `${analysis.languages.length}`;
      langs.contextValue = "category";
      items.push(langs);
    }

    if (analysis.frameworks.length > 0) {
      const frameworks = new AnalysisItem(
        "Frameworks",
        vscode.TreeItemCollapsibleState.Expanded,
        analysis.frameworks.map((f) => {
          const item = new AnalysisItem(f, vscode.TreeItemCollapsibleState.None);
          item.contextValue = "framework";
          return item;
        })
      );
      frameworks.iconPath = new vscode.ThemeIcon("extensions");
      frameworks.description = `${analysis.frameworks.length}`;
      frameworks.contextValue = "category";
      items.push(frameworks);
    }

    if (analysis.areas && analysis.areas.length > 0) {
      const areas = new AnalysisItem(
        analysis.isMonorepo ? "Monorepo" : "Areas",
        vscode.TreeItemCollapsibleState.Expanded,
        analysis.areas.map((a) => {
          const item = new AnalysisItem(a.name, vscode.TreeItemCollapsibleState.None);
          item.description = typeof a.applyTo === "string" ? a.applyTo : a.applyTo.join(", ");
          item.iconPath = new vscode.ThemeIcon("folder");
          item.contextValue = "area";
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**${a.name}**`);
          if (a.description) md.appendMarkdown(`\n\n${a.description}`);
          md.appendMarkdown(
            `\n\nGlobs: ${typeof a.applyTo === "string" ? "`" + a.applyTo + "`" : a.applyTo.map((g) => "`" + g + "`").join(", ")}`
          );
          item.tooltip = md;
          return item;
        })
      );
      areas.iconPath = new vscode.ThemeIcon("folder-library");
      areas.description = analysis.workspaceType ?? undefined;
      areas.contextValue = "category";
      items.push(areas);
    }

    if (analysis.packageManager) {
      const pm = new AnalysisItem("Package Manager", vscode.TreeItemCollapsibleState.None);
      pm.description = analysis.packageManager;
      pm.iconPath = new vscode.ThemeIcon("package");
      pm.contextValue = "info";
      items.push(pm);
    }

    return items;
  }
}

class AnalysisItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children?: AnalysisItem[]
  ) {
    super(label, collapsibleState);
  }
}
