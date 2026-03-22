import path from "path";

import { ensureDir, fileExists, safeWriteFile } from "../utils/fs";

import type { RepoAnalysis } from "./analyzer";

export type FileAction = {
  path: string;
  action: "wrote" | "skipped" | "symlink" | "empty";
  bytes?: number;
};

export type GenerateResult = {
  files: FileAction[];
};

export type GenerateOptions = {
  repoPath: string;
  analysis: RepoAnalysis;
  selections: string[];
  force: boolean;
  dryRun?: boolean;
};

async function writeOrPreview(
  filePath: string,
  content: string,
  opts: { dryRun?: boolean; force: boolean }
): Promise<FileAction> {
  const relPath = path.relative(process.cwd(), filePath);
  if (opts.dryRun) {
    const exists = await fileExists(filePath);
    return {
      path: relPath,
      action: !exists || opts.force ? "wrote" : "skipped",
      bytes: Buffer.byteLength(content, "utf8")
    };
  }
  await ensureDir(path.dirname(filePath));
  const { wrote } = await safeWriteFile(filePath, content, opts.force);
  return { path: relPath, action: wrote ? "wrote" : "skipped" };
}

export async function generateConfigs(options: GenerateOptions): Promise<GenerateResult> {
  const { repoPath, analysis, selections, force, dryRun } = options;
  const files: FileAction[] = [];

  if (selections.includes("mcp")) {
    files.push(
      await writeOrPreview(path.join(repoPath, ".vscode", "mcp.json"), renderMcp(), {
        dryRun,
        force
      })
    );
  }

  if (selections.includes("vscode")) {
    files.push(
      await writeOrPreview(
        path.join(repoPath, ".vscode", "settings.json"),
        renderVscodeSettings(analysis),
        { dryRun, force }
      )
    );
  }

  return { files };
}

function renderMcp(): string {
  return JSON.stringify(
    {
      servers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: "${input:github_token}"
          }
        },
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
        }
      },
      inputs: [
        {
          id: "github_token",
          type: "promptString",
          description: "GitHub Personal Access Token"
        }
      ]
    },
    null,
    2
  );
}

function renderVscodeSettings(analysis: RepoAnalysis): string {
  const reviewFocus = analysis.frameworks.length
    ? `Focus on ${analysis.frameworks.join(", ")} best practices and repo conventions.`
    : "Focus on repo conventions and maintainability.";

  return JSON.stringify(
    {
      "github.copilot.chat.codeGeneration.instructions": [
        { file: ".github/copilot-instructions.md" }
      ],
      "github.copilot.chat.reviewSelection.instructions": [{ text: reviewFocus }],
      "chat.promptFiles": true,
      "chat.mcp.enabled": true
    },
    null,
    2
  );
}
