import path from "path";

import { analyzeRepo } from "@agentrc/core/services/analyzer";
import type {
  AzureDevOpsOrg,
  AzureDevOpsProject,
  AzureDevOpsRepo
} from "@agentrc/core/services/azureDevops";
import {
  getAzureDevOpsToken,
  listOrganizations,
  listProjects,
  listRepos
} from "@agentrc/core/services/azureDevops";
import { scaffoldAgentrcConfig } from "@agentrc/core/services/configScaffold";
import type { FileAction } from "@agentrc/core/services/generator";
import { generateConfigs } from "@agentrc/core/services/generator";
import { buildAuthedUrl, cloneRepo, isGitRepo, setRemoteUrl } from "@agentrc/core/services/git";
import type { GitHubRepo } from "@agentrc/core/services/github";
import { getGitHubToken, listAccessibleRepos } from "@agentrc/core/services/github";
import { generateCopilotInstructions } from "@agentrc/core/services/instructions";
import { ensureDir, safeWriteFile, validateCachePath } from "@agentrc/core/utils/fs";
import { prettyPrintSummary } from "@agentrc/core/utils/logger";
import type { CommandResult } from "@agentrc/core/utils/output";
import { outputResult, outputError, deriveFileStatus, shouldLog } from "@agentrc/core/utils/output";
import { checkbox, select } from "@inquirer/prompts";

type InitOptions = {
  github?: boolean;
  provider?: string;
  yes?: boolean;
  force?: boolean;
  model?: string;
  json?: boolean;
  quiet?: boolean;
};

export async function initCommand(
  repoPathArg: string | undefined,
  options: InitOptions
): Promise<void> {
  let repoPath = path.resolve(repoPathArg ?? process.cwd());
  const provider = options.provider ?? (options.github ? "github" : undefined);

  if (provider && provider !== "github" && provider !== "azure") {
    outputError("Invalid provider. Use github or azure.", Boolean(options.json));
    return;
  }

  if (options.json && !options.yes) {
    outputError("--json requires --yes to skip interactive prompts.", true);
    return;
  }

  if (options.json && provider) {
    outputError(
      "--json with --provider is not supported. Use 'agentrc pr' for non-interactive provider workflows.",
      true
    );
    return;
  }

  if (provider === "github") {
    const token = await getGitHubToken();
    if (!token) {
      outputError(
        "Set GITHUB_TOKEN or GH_TOKEN, or authenticate with GitHub CLI.",
        Boolean(options.json)
      );
      return;
    }

    const repos = await listAccessibleRepos(token);
    if (repos.length === 0) {
      outputError("No accessible repositories found.", Boolean(options.json));
      return;
    }

    const selection = await select<GitHubRepo>({
      message: "Choose a repository",
      choices: repos.map((repo) => ({
        name: `${repo.fullName}${repo.isPrivate ? " (private)" : ""}`,
        value: repo
      }))
    });

    const cacheRoot = path.join(process.cwd(), ".agentrc-cache");
    repoPath = validateCachePath(cacheRoot, selection.owner, selection.name);
    await ensureDir(repoPath);

    const hasGit = await isGitRepo(repoPath);
    if (!hasGit) {
      await cloneRepo(selection.cloneUrl, repoPath);
    }
  }

  if (provider === "azure") {
    const token = getAzureDevOpsToken();
    if (!token) {
      outputError(
        "Set AZURE_DEVOPS_PAT (or AZDO_PAT) to use Azure DevOps mode.",
        Boolean(options.json)
      );
      return;
    }

    const orgs = await listOrganizations(token);
    if (orgs.length === 0) {
      outputError("No Azure DevOps organizations found.", Boolean(options.json));
      return;
    }

    const orgSelection = await select<AzureDevOpsOrg>({
      message: "Choose an Azure DevOps organization",
      choices: orgs.map((org) => ({
        name: org.name,
        value: org
      }))
    });

    const projects = await listProjects(token, orgSelection.name);
    if (projects.length === 0) {
      outputError("No Azure DevOps projects found.", Boolean(options.json));
      return;
    }

    const projectSelection = await select<AzureDevOpsProject>({
      message: "Choose an Azure DevOps project",
      choices: projects.map((project) => ({
        name: project.name,
        value: project
      }))
    });

    const repos = await listRepos(token, orgSelection.name, projectSelection.name);
    if (repos.length === 0) {
      outputError("No Azure DevOps repositories found.", Boolean(options.json));
      return;
    }

    const repoSelection = await select<AzureDevOpsRepo>({
      message: "Choose a repository",
      choices: repos.map((repo) => ({
        name: `${repo.name}${repo.isPrivate ? " (private)" : ""}`,
        value: repo
      }))
    });

    const cacheRoot = path.join(process.cwd(), ".agentrc-cache");
    repoPath = validateCachePath(
      cacheRoot,
      orgSelection.name,
      projectSelection.name,
      repoSelection.name
    );
    await ensureDir(repoPath);

    const hasGit = await isGitRepo(repoPath);
    if (!hasGit) {
      const authedUrl = buildAuthedUrl(repoSelection.cloneUrl, token, "azure");
      await cloneRepo(authedUrl, repoPath);
      await setRemoteUrl(repoPath, repoSelection.cloneUrl);
    }
  }
  let analysis;
  try {
    analysis = await analyzeRepo(repoPath);
  } catch (error) {
    outputError(
      `Failed to analyze repo: ${error instanceof Error ? error.message : String(error)}`,
      Boolean(options.json)
    );
    return;
  }
  if (shouldLog(options)) {
    prettyPrintSummary(analysis);
  }

  const selections = options.yes
    ? ["instructions", "mcp", "vscode"]
    : await checkbox({
        message: "What would you like to generate?",
        choices: [
          { name: "Custom instructions (.github/copilot-instructions.md)", value: "instructions" },
          { name: "MCP configuration", value: "mcp" },
          { name: "VS Code settings", value: "vscode" }
        ],
        required: true
      });

  const allFiles: FileAction[] = [];

  if (selections.includes("instructions")) {
    const outputPath = path.join(repoPath, ".github", "copilot-instructions.md");
    await ensureDir(path.dirname(outputPath));
    try {
      const content = await generateCopilotInstructions({ repoPath, model: options.model });
      const { wrote } = await safeWriteFile(outputPath, content, Boolean(options.force));
      allFiles.push({
        path: path.relative(process.cwd(), outputPath),
        action: wrote ? "wrote" : "skipped"
      });
      if (shouldLog(options)) {
        const rel = path.relative(process.cwd(), outputPath);
        process.stderr.write((wrote ? `Wrote ${rel}` : `Skipped ${rel} (exists)`) + "\n");
      }
    } catch (error) {
      outputError(
        `Failed to generate instructions: ${error instanceof Error ? error.message : String(error)}`,
        Boolean(options.json)
      );
      return;
    }
  }

  let genResult;
  try {
    genResult = await generateConfigs({
      repoPath,
      analysis,
      selections: selections.filter((item) => item !== "instructions"),
      force: Boolean(options.force)
    });
  } catch (error) {
    outputError(
      `Failed to generate configs: ${error instanceof Error ? error.message : String(error)}`,
      Boolean(options.json)
    );
    return;
  }
  allFiles.push(...genResult.files);

  // Bootstrap agentrc.config.json with detected workspaces and standalone areas
  {
    const result = await scaffoldAgentrcConfig(
      repoPath,
      analysis.areas ?? [],
      Boolean(options.force)
    );
    const rel = path.relative(process.cwd(), result.configPath);
    allFiles.push({ path: rel, action: result.wrote ? "wrote" : "skipped" });
    if (shouldLog(options)) {
      process.stderr.write((result.wrote ? `Wrote ${rel}` : `Skipped ${rel} (exists)`) + "\n");
    }
  }

  if (options.json) {
    const { ok, status } = deriveFileStatus(allFiles);
    const result: CommandResult<{
      selections: string[];
      files: FileAction[];
      analysis: typeof analysis;
    }> = {
      ok,
      status,
      data: { selections, files: allFiles, analysis }
    };
    outputResult(result, true);
  } else if (shouldLog(options)) {
    for (const file of genResult.files) {
      process.stderr.write(`${file.action === "wrote" ? "Wrote" : "Skipped"} ${file.path}\n`);
    }
    process.stderr.write("\nNext steps:\n");
    process.stderr.write("  agentrc readiness             Run readiness report across 9 pillars\n");
    if (analysis.areas && analysis.areas.length > 0) {
      process.stderr.write("  agentrc instructions --areas   Generate per-area instructions\n");
    }
    process.stderr.write("  agentrc eval --init            Scaffold evaluation test cases\n");
  }
}
