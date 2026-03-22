import * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs";
import {
  generateCopilotInstructions,
  generateAreaInstructions,
  generateNestedInstructions,
  generateNestedAreaInstructions,
  writeAreaInstruction,
  writeNestedInstructions,
  safeWriteFile,
  analyzeRepo,
  loadAgentrcConfig,
  stripJsonComments
} from "../services.js";
import { VscodeProgressReporter } from "../progress.js";
import { pickWorkspacePath, getCachedAnalysis, setCachedAnalysis } from "./analyze.js";

const FORMAT_OPTIONS = [
  {
    label: "$(file) copilot-instructions.md",
    description: ".github/copilot-instructions.md",
    value: "copilot-instructions" as const,
    relativePath: path.join(".github", "copilot-instructions.md")
  },
  {
    label: "$(robot) AGENTS.md",
    description: "AGENTS.md at repo root",
    value: "agents-md" as const,
    relativePath: "AGENTS.md"
  }
];

const STRATEGY_OPTIONS = [
  {
    label: "$(file) Flat",
    description: "Single instruction file (default)",
    value: "flat" as const
  },
  {
    label: "$(list-tree) Nested",
    description: "Hub + detail files in .agents/",
    value: "nested" as const
  }
];

export async function instructionsCommand(): Promise<void> {
  const workspacePath = await pickWorkspacePath();
  if (!workspacePath) return;

  const model = vscode.workspace.getConfiguration("agentrc").get<string>("model");

  // Pick format
  const formatPick = await vscode.window.showQuickPick(FORMAT_OPTIONS, {
    placeHolder: "Choose instruction format"
  });
  if (!formatPick) return;

  // Pick strategy
  let strategy: "flat" | "nested" = "flat";
  let detailDir = ".agents";
  let claudeMd = false;

  // Load config to get defaults
  try {
    const config = await loadAgentrcConfig(workspacePath);
    if (config?.strategy === "flat" || config?.strategy === "nested") {
      strategy = config.strategy;
    }
    if (config?.detailDir) detailDir = config.detailDir;
    if (config?.claudeMd) claudeMd = true;
  } catch {
    // Non-fatal
  }

  const strategyPick = await vscode.window.showQuickPick(
    STRATEGY_OPTIONS.map((s) => ({ ...s, picked: s.value === strategy })),
    { placeHolder: "Choose instruction strategy" }
  );
  if (!strategyPick) return;
  strategy = strategyPick.value;

  // For nested strategy, ask about CLAUDE.md
  if (strategy === "nested" && !claudeMd) {
    const claudePick = await vscode.window.showQuickPick(
      [
        { label: "No", description: "Skip CLAUDE.md generation", value: false },
        {
          label: "Yes",
          description: "Generate CLAUDE.md with @AGENTS.md transclusion",
          value: true
        }
      ],
      { placeHolder: "Generate CLAUDE.md alongside AGENTS.md?" }
    );
    if (claudePick) claudeMd = claudePick.value;
  }

  // Write strategy choice back to agentrc.config.json
  try {
    const configPath = path.join(workspacePath, "agentrc.config.json");
    let existing: Record<string, unknown> = {};
    try {
      const raw = await fs.promises.readFile(configPath, "utf-8");
      const parsed: unknown = JSON.parse(stripJsonComments(raw));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err; // Malformed JSON — bubble to outer non-fatal catch
      }
    }
    if (
      existing.strategy !== strategy ||
      existing.detailDir !== detailDir ||
      existing.claudeMd !== claudeMd
    ) {
      existing.strategy = strategy;
      if (strategy === "nested") {
        existing.detailDir = detailDir;
        existing.claudeMd = claudeMd;
      } else {
        delete existing.detailDir;
        delete existing.claudeMd;
      }
      await safeWriteFile(configPath, JSON.stringify(existing, null, 2) + "\n", true);
    }
  } catch {
    // Non-fatal — config write-back failure shouldn't block generation
  }

  // Ensure analysis is available before starting progress
  let analysis = getCachedAnalysis();
  if (!analysis) {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "AgentRC: Analyzing repository…" },
      async () => {
        analysis = await analyzeRepo(workspacePath);
        setCachedAnalysis(analysis!);
      }
    );
  }
  if (!analysis) return;

  // Collect area selections before starting generation progress
  let selectedAreas: typeof analysis.areas = undefined;
  if (analysis.areas && analysis.areas.length > 0) {
    const picked = await vscode.window.showQuickPick(
      analysis.areas.map((a) => ({
        label: a.name,
        description: a.description,
        detail: Array.isArray(a.applyTo) ? a.applyTo.join(", ") : a.applyTo,
        area: a
      })),
      { placeHolder: "Select areas for instructions (or Escape for root only)", canPickMany: true }
    );
    if (picked && picked.length > 0) {
      selectedAreas = picked.map((p) => p.area);
    }
  }

  const instructionFile = path.join(workspacePath, formatPick.relativePath);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `AgentRC: Generating ${formatPick.relativePath}…`,
      cancellable: false
    },
    async (progress) => {
      try {
        const reporter = new VscodeProgressReporter(progress);

        if (strategy === "nested") {
          // Nested strategy: generate hub + detail files
          reporter.update("Generating nested instructions…");
          const nestedResult = await generateNestedInstructions({
            repoPath: workspacePath,
            model,
            onProgress: (msg) => reporter.update(msg),
            detailDir,
            claudeMd
          });
          const actions = await writeNestedInstructions(workspacePath, nestedResult, false);
          let wroteCount = actions.filter((a) => a.action === "wrote").length;
          let skippedCount = actions.filter((a) => a.action !== "wrote").length;
          for (const warning of nestedResult.warnings) {
            reporter.update(`Warning: ${warning}`);
          }

          // Handle areas for nested
          if (selectedAreas) {
            const allAreas = analysis!.areas ?? [];
            for (const area of selectedAreas) {
              reporter.update(`Generating nested instructions for ${area.name}…`);
              const childAreas = allAreas.filter((a) => a.parentArea === area.name);
              const areaResult = await generateNestedAreaInstructions({
                repoPath: workspacePath,
                area,
                childAreas,
                model,
                onProgress: (msg) => reporter.update(msg),
                detailDir,
                claudeMd
              });
              const areaActions = await writeNestedInstructions(workspacePath, areaResult, false);
              const areaWrote = areaActions.filter((a) => a.action === "wrote").length;
              const areaSkipped = areaActions.filter((a) => a.action !== "wrote").length;
              wroteCount += areaWrote;
              skippedCount += areaSkipped;
              if (areaWrote > 0) reporter.succeed(`Wrote ${areaWrote} files for ${area.name}`);
              if (areaSkipped > 0)
                reporter.update(`Skipped ${areaSkipped} existing files for ${area.name}`);
              for (const warning of areaResult.warnings) {
                reporter.update(`Warning: ${warning}`);
              }
            }
          }

          if (skippedCount > 0 && wroteCount === 0) {
            reporter.succeed("All instruction files already exist.");
          } else {
            reporter.succeed(`Generated ${wroteCount} instruction files.`);
          }

          // Open the hub file
          try {
            const hubPath = path.join(workspacePath, nestedResult.hub.relativePath);
            const doc = await vscode.workspace.openTextDocument(hubPath);
            await vscode.window.showTextDocument(doc);
          } catch {
            // Hub may not exist if all were skipped
          }
        } else {
          // Flat strategy: existing behavior
          reporter.update("Generating root instructions…");
          const content = await generateCopilotInstructions({
            repoPath: workspacePath,
            model,
            onProgress: (msg) => reporter.update(msg)
          });

          let rootSkipped = false;
          if (content.trim()) {
            const dir = path.dirname(instructionFile);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            const { wrote } = await safeWriteFile(instructionFile, content, false);
            if (!wrote) rootSkipped = true;
          }

          let areasSkipped = 0;
          const areaBodies = new Map<string, string>();
          if (selectedAreas) {
            for (const area of selectedAreas) {
              reporter.update(`Generating instructions for ${area.name}…`);
              const body = await generateAreaInstructions({
                repoPath: workspacePath,
                area,
                model,
                onProgress: (msg) => reporter.update(msg)
              });
              areaBodies.set(area.name, body);
              if (body.trim()) {
                const result = await writeAreaInstruction(workspacePath, area, body, false);
                if (result.status === "skipped") areasSkipped++;
              }
            }
          }

          const totalSkipped = (rootSkipped ? 1 : 0) + areasSkipped;
          const areasWithContent = selectedAreas
            ? selectedAreas.filter((a) => (areaBodies.get(a.name) ?? "").trim()).length
            : 0;
          const totalFiles = (content.trim() ? 1 : 0) + areasWithContent;

          if (totalSkipped > 0 && totalSkipped === totalFiles) {
            reporter.succeed("All instruction files already exist.");
            const overwrite = "Overwrite";
            const action = await vscode.window.showWarningMessage(
              `AgentRC: All ${totalSkipped} instruction files already exist.`,
              overwrite
            );
            if (action === overwrite) {
              try {
                reporter.update("Overwriting instructions…");
                if (content.trim()) {
                  await safeWriteFile(instructionFile, content, true);
                }
                if (selectedAreas) {
                  for (const area of selectedAreas) {
                    const body = areaBodies.get(area.name) ?? "";
                    if (body.trim()) {
                      await writeAreaInstruction(workspacePath, area, body, true);
                    }
                  }
                }
                reporter.succeed("Instructions overwritten.");
              } catch (err) {
                vscode.window.showErrorMessage(
                  `AgentRC: Instruction overwrite failed — ${err instanceof Error ? err.message : String(err)}`
                );
              }
            }
          } else {
            reporter.succeed("Instructions generated.");
          }

          // Open the generated file
          try {
            const doc = await vscode.workspace.openTextDocument(instructionFile);
            await vscode.window.showTextDocument(doc);
          } catch {
            // File may not exist if generation produced no content
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `AgentRC: Instruction generation failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}
