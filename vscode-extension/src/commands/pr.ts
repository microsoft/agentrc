import * as vscode from "vscode";
import {
  createPullRequest,
  createAzurePullRequest,
  getAzureDevOpsRepo,
  isAgentrcFile
} from "../services.js";
import { getGitHubToken, getAzureDevOpsToken, detectPlatform, type PlatformInfo } from "../auth.js";
import { pickWorkspacePath } from "./analyze.js";
import { getGitRepository } from "../gitUtils.js";

export async function prCommand(): Promise<void> {
  const workspacePath = await pickWorkspacePath();
  if (!workspacePath) return;

  const repository = getGitRepository(workspacePath);
  if (!repository) return;

  // Detect remote owner/repo
  const origin = repository.state.remotes.find((r) => r.name === "origin");
  const originUrl = origin?.pushUrl ?? origin?.fetchUrl;
  if (!originUrl) {
    vscode.window.showErrorMessage("AgentRC: No origin remote found.");
    return;
  }

  const detected = detectPlatform(originUrl);
  if (!detected) {
    vscode.window.showErrorMessage(
      "AgentRC: Unsupported remote. GitHub and Azure DevOps are supported."
    );
    return;
  }

  const branch = repository.state.HEAD?.name;
  if (!branch) {
    vscode.window.showErrorMessage("AgentRC: Could not determine current branch (detached HEAD?).");
    return;
  }

  // Detect default branch by checking remote refs for origin/main or origin/master
  const refs = await repository.getRefs({ pattern: "refs/remotes/origin/*" });
  const hasMain = refs.some((r) => r.name === "origin/main");
  const hasMaster = refs.some((r) => r.name === "origin/master");
  const base = hasMain ? "main" : hasMaster ? "master" : "main";

  if (branch === base) {
    vscode.window.showErrorMessage(
      "AgentRC: Cannot create PR from the default branch. Check out a feature branch first."
    );
    return;
  }

  const title = await vscode.window.showInputBox({
    prompt: "Pull request title",
    value: `Add AgentRC AI configs for ${detected.remote.repo}`
  });
  if (!title) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "AgentRC: Creating pull request…" },
    async () => {
      try {
        // Stage, commit, and push AgentRC files (shared logic for both platforms)
        const aborted = await stageAndPush(repository, branch, title);
        if (aborted) return;

        // Guard against empty PRs when branch has no diff from base
        const baseRefs = await repository.getRefs({ pattern: `refs/remotes/origin/${base}` });
        const headRefs = await repository.getRefs({ pattern: `refs/remotes/origin/${branch}` });
        if (
          baseRefs[0]?.commit &&
          headRefs[0]?.commit &&
          baseRefs[0].commit === headRefs[0].commit
        ) {
          const proceed = await vscode.window.showWarningMessage(
            "AgentRC: No new changes detected. The PR may be empty.",
            "Continue",
            "Cancel"
          );
          if (proceed !== "Continue") return;
        }

        const prUrl = await createPR(detected, branch, base, title);

        const openAction = "Open in Browser";
        const action = await vscode.window.showInformationMessage(
          `AgentRC: Pull request created.`,
          openAction
        );
        if (action === openAction && prUrl.startsWith("https://")) {
          vscode.env.openExternal(vscode.Uri.parse(prUrl));
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `AgentRC: PR creation failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}

// ── Helpers ──

/** Stage AgentRC files, commit, and push. Returns true if the user aborted. */
async function stageAndPush(
  repository: NonNullable<ReturnType<typeof getGitRepository>>,
  branch: string,
  title: string
): Promise<boolean> {
  const allChanges = [...repository.state.workingTreeChanges, ...repository.state.indexChanges];
  const seen = new Set<string>();
  const changes = allChanges.filter((c) => {
    const key = c.uri.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (changes.length > 0) {
    const agentrcChanges = changes.filter((c) =>
      isAgentrcFile(vscode.workspace.asRelativePath(c.uri, false))
    );

    if (agentrcChanges.length === 0) {
      vscode.window.showWarningMessage("AgentRC: No AgentRC-generated files to commit.");
      return true;
    }

    const stagedNonAgentrc = repository.state.indexChanges.filter(
      (c) => !isAgentrcFile(vscode.workspace.asRelativePath(c.uri, false))
    );
    if (stagedNonAgentrc.length > 0) {
      const proceed = await vscode.window.showWarningMessage(
        `AgentRC: ${stagedNonAgentrc.length} non-AgentRC file(s) are already staged and will be included in the commit.`,
        "Continue",
        "Cancel"
      );
      if (proceed !== "Continue") return true;
    }

    await repository.add(agentrcChanges.map((c) => c.uri));
    await repository.commit(title);
  }

  await repository.push("origin", branch, true);
  return false;
}

async function createPR(
  info: PlatformInfo,
  branch: string,
  base: string,
  title: string
): Promise<string> {
  if (info.platform === "azure") {
    const { organization, project, repo } = info.remote;
    const token = await getAzureDevOpsToken();
    const repoInfo = await getAzureDevOpsRepo(token, organization, project, repo, "bearer");
    return createAzurePullRequest({
      token,
      organization,
      project,
      repoId: repoInfo.id,
      repoName: repoInfo.name,
      title,
      body: "Generated by AgentRC VS Code extension.",
      sourceBranch: branch,
      targetBranch: base,
      authMode: "bearer"
    });
  }

  const { owner, repo } = info.remote;
  const token = await getGitHubToken();
  return createPullRequest({
    token,
    owner,
    repo,
    title,
    body: "Generated by AgentRC VS Code extension.",
    head: branch,
    base
  });
}
