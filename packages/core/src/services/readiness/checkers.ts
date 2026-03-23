import fs from "fs/promises";
import path from "path";

import { fileExists, safeReadDir, readJson } from "../../utils/fs";

import type { InstructionConsistencyResult, ReadinessContext } from "./types";

export function hasAnyFile(files: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => files.includes(candidate));
}

export async function hasReadme(repoPath: string): Promise<boolean> {
  const files = await safeReadDir(repoPath);
  return files.some(
    (file) => file.toLowerCase() === "readme.md" || file.toLowerCase() === "readme"
  );
}

export async function hasLintConfig(repoPath: string): Promise<boolean> {
  return hasAnyFile(await safeReadDir(repoPath), [
    "eslint.config.js",
    "eslint.config.mjs",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
    "biome.json",
    "biome.jsonc",
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.js",
    ".prettierrc.cjs",
    "prettier.config.js",
    "prettier.config.cjs"
  ]);
}

export async function hasFormatterConfig(repoPath: string): Promise<boolean> {
  return hasAnyFile(await safeReadDir(repoPath), [
    "biome.json",
    "biome.jsonc",
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.js",
    ".prettierrc.cjs",
    "prettier.config.js",
    "prettier.config.cjs"
  ]);
}

export async function hasTypecheckConfig(repoPath: string): Promise<boolean> {
  return hasAnyFile(await safeReadDir(repoPath), [
    "tsconfig.json",
    "tsconfig.base.json",
    "pyproject.toml",
    "mypy.ini"
  ]);
}

export async function hasGithubWorkflows(repoPath: string): Promise<boolean> {
  return fileExists(path.join(repoPath, ".github", "workflows"));
}

export async function hasCodeowners(repoPath: string): Promise<boolean> {
  const root = await fileExists(path.join(repoPath, "CODEOWNERS"));
  const github = await fileExists(path.join(repoPath, ".github", "CODEOWNERS"));
  return root || github;
}

export async function hasLicense(repoPath: string): Promise<boolean> {
  const files = await safeReadDir(repoPath);
  return files.some((file) => file.toLowerCase().startsWith("license"));
}

export async function hasPullRequestTemplate(repoPath: string): Promise<boolean> {
  const direct = await fileExists(path.join(repoPath, ".github", "PULL_REQUEST_TEMPLATE.md"));
  if (direct) return true;
  const dir = path.join(repoPath, ".github", "PULL_REQUEST_TEMPLATE");
  try {
    const entries = await fs.readdir(dir);
    return entries.some((entry) => entry.toLowerCase().endsWith(".md"));
  } catch {
    return false;
  }
}

export async function hasPrecommitConfig(repoPath: string): Promise<boolean> {
  const precommit = await fileExists(path.join(repoPath, ".pre-commit-config.yaml"));
  if (precommit) return true;
  return fileExists(path.join(repoPath, ".husky"));
}

export async function hasArchitectureDoc(repoPath: string): Promise<boolean> {
  const files = await safeReadDir(repoPath);
  if (files.some((file) => file.toLowerCase() === "architecture.md")) return true;
  return fileExists(path.join(repoPath, "docs", "architecture.md"));
}

export async function hasCustomInstructions(repoPath: string): Promise<string[]> {
  const found: string[] = [];
  const candidates = [
    ".github/copilot-instructions.md",
    "CLAUDE.md",
    ".claude/CLAUDE.md",
    "AGENTS.md",
    ".github/AGENTS.md",
    ".cursorrules",
    ".cursorignore",
    ".windsurfrules",
    ".github/instructions.md",
    "copilot-instructions.md"
  ];
  for (const candidate of candidates) {
    if (await fileExists(path.join(repoPath, candidate))) {
      found.push(candidate);
    }
  }
  return found;
}

export async function hasFileBasedInstructions(repoPath: string): Promise<string[]> {
  const instructionsDir = path.join(repoPath, ".github", "instructions");
  try {
    const entries = await fs.readdir(instructionsDir);
    return entries
      .filter((e) => e.endsWith(".instructions.md"))
      .map((e) => `.github/instructions/${e}`);
  } catch {
    return [];
  }
}

/**
 * Jaccard similarity on normalized line sets.
 * Returns 1.0 for identical (after normalization), 0.0 for completely disjoint.
 */
export function contentSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split("\n")
        .map((l) => l.trim().replace(/\s+/gu, " "))
        .filter((l) => l.length > 0)
    );
  const setA = normalize(a);
  const setB = normalize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const line of setA) {
    if (setB.has(line)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Check whether multiple instruction files in a repo are consistent.
 * Files sharing the same realpath (symlinks) are treated as unified.
 * For distinct files, content is compared via Jaccard similarity.
 */
export async function checkInstructionConsistency(
  repoPath: string,
  foundFiles: string[]
): Promise<InstructionConsistencyResult> {
  if (foundFiles.length <= 1) {
    return { unified: true, files: foundFiles };
  }

  // Group files by their real path (symlinks collapse)
  const realPathMap = new Map<string, string[]>();
  for (const file of foundFiles) {
    const fullPath = path.join(repoPath, file);
    try {
      const real = await fs.realpath(fullPath);
      const group = realPathMap.get(real) ?? [];
      group.push(file);
      realPathMap.set(real, group);
    } catch {
      // If realpath fails, treat as unique
      realPathMap.set(fullPath, [file]);
    }
  }

  const groups = [...realPathMap.values()];
  // All files resolve to the same real path → unified via symlinks
  if (groups.length <= 1) {
    return { unified: true, files: foundFiles };
  }

  // Read content from one representative file per group and compare pairwise
  const contents: string[] = [];
  for (const group of groups) {
    try {
      contents.push(await fs.readFile(path.join(repoPath, group[0]), "utf8"));
    } catch {
      contents.push("");
    }
  }

  // Compute minimum pairwise similarity
  let minSimilarity = 1;
  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      minSimilarity = Math.min(minSimilarity, contentSimilarity(contents[i], contents[j]));
    }
  }

  return {
    unified: minSimilarity >= 0.9,
    files: foundFiles,
    similarity: Math.round(minSimilarity * 100) / 100
  };
}

export async function hasMcpConfig(repoPath: string): Promise<string[]> {
  const found: string[] = [];
  // Check .vscode/mcp.json
  if (await fileExists(path.join(repoPath, ".vscode", "mcp.json"))) {
    found.push(".vscode/mcp.json");
  }
  // Check root mcp.json
  if (await fileExists(path.join(repoPath, "mcp.json"))) {
    found.push("mcp.json");
  }
  // Check .vscode/settings.json for MCP section
  const settings = await readJson(path.join(repoPath, ".vscode", "settings.json"));
  if (settings && (settings["mcp"] || settings["github.copilot.chat.mcp.enabled"])) {
    found.push(".vscode/settings.json (mcp section)");
  }
  // Check .claude/mcp.json
  if (await fileExists(path.join(repoPath, ".claude", "mcp.json"))) {
    found.push(".claude/mcp.json");
  }
  return found;
}

export async function hasCustomAgents(repoPath: string): Promise<string[]> {
  const found: string[] = [];
  const agentDirs = [".github/agents", ".copilot/agents", ".github/copilot/agents"];
  for (const dir of agentDirs) {
    if (await fileExists(path.join(repoPath, dir))) {
      found.push(dir);
    }
  }
  // Check for agent config files
  const agentFiles = [".github/copilot-agents.yml", ".github/copilot-agents.yaml"];
  for (const agentFile of agentFiles) {
    if (await fileExists(path.join(repoPath, agentFile))) {
      found.push(agentFile);
    }
  }
  return found;
}

export async function hasCopilotSkills(repoPath: string): Promise<string[]> {
  const found: string[] = [];
  const skillDirs = [
    ".copilot/skills",
    ".github/skills",
    ".claude/skills",
    ".github/copilot/skills"
  ];
  for (const dir of skillDirs) {
    if (await fileExists(path.join(repoPath, dir))) {
      found.push(dir);
    }
  }
  return found;
}

export async function hasIssueTemplates(repoPath: string): Promise<boolean> {
  const single = await fileExists(path.join(repoPath, ".github", "ISSUE_TEMPLATE.md"));
  if (single) return true;
  const dir = path.join(repoPath, ".github", "ISSUE_TEMPLATE");
  try {
    const entries = await fs.readdir(dir);
    return entries.some((e) => /\.(md|yml|yaml)$/iu.test(e));
  } catch {
    return false;
  }
}

export async function hasCommitConvention(repoPath: string): Promise<boolean> {
  const configs = [
    ".commitlintrc",
    ".commitlintrc.json",
    ".commitlintrc.yml",
    ".commitlintrc.yaml",
    ".commitlintrc.js",
    ".commitlintrc.cjs",
    ".commitlintrc.mjs",
    ".commitlintrc.ts",
    "commitlint.config.js",
    "commitlint.config.cjs",
    "commitlint.config.mjs",
    "commitlint.config.ts",
    ".cz-config.js",
    ".czrc"
  ];
  for (const config of configs) {
    if (await fileExists(path.join(repoPath, config))) return true;
  }
  const pkg = await readJson(path.join(repoPath, "package.json"));
  if (pkg) {
    const allDeps = {
      ...((pkg.dependencies as Record<string, unknown>) ?? {}),
      ...((pkg.devDependencies as Record<string, unknown>) ?? {})
    };
    if (
      Object.keys(allDeps).some(
        (dep) => dep.startsWith("@commitlint/") || dep === "commitlint" || dep === "commitizen"
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function hasReleaseAutomation(
  repoPath: string
): Promise<{ found: boolean; evidence: string[] }> {
  const evidence: string[] = [];
  const configs = [
    "release.config.js",
    "release.config.cjs",
    "release.config.mjs",
    "release.config.ts",
    ".releaserc",
    ".releaserc.json",
    ".releaserc.yml",
    ".releaserc.yaml",
    ".releaserc.js",
    ".releaserc.cjs",
    ".changeset/config.json",
    "release-please-config.json"
  ];
  for (const config of configs) {
    if (await fileExists(path.join(repoPath, config))) {
      evidence.push(config);
    }
  }
  const workflowsDir = path.join(repoPath, ".github", "workflows");
  try {
    const workflows = await fs.readdir(workflowsDir);
    for (const workflow of workflows) {
      if (!/\.ya?ml$/iu.test(workflow)) continue;
      try {
        const content = await fs.readFile(path.join(workflowsDir, workflow), "utf8");
        if (
          content.includes("semantic-release") ||
          content.includes("changesets/action") ||
          content.includes("googleapis/release-please-action")
        ) {
          evidence.push(`.github/workflows/${workflow}`);
        }
      } catch {
        // skip unreadable workflow
      }
    }
  } catch {
    // no workflows directory
  }
  return { found: evidence.length > 0, evidence };
}

export async function hasAutoLabeler(repoPath: string): Promise<boolean> {
  for (const file of [".github/labeler.yml", ".github/labeler.yaml", ".github/labeler.json"]) {
    if (await fileExists(path.join(repoPath, file))) return true;
  }
  const workflowsDir = path.join(repoPath, ".github", "workflows");
  try {
    const workflows = await fs.readdir(workflowsDir);
    for (const workflow of workflows) {
      if (!/\.ya?ml$/iu.test(workflow)) continue;
      try {
        const content = await fs.readFile(path.join(workflowsDir, workflow), "utf8");
        if (content.includes("actions/labeler")) return true;
      } catch {
        // skip unreadable workflow
      }
    }
  } catch {
    // no workflows directory
  }
  return false;
}

export async function hasBranchRulesets(repoPath: string): Promise<boolean> {
  const rulesetsDir = path.join(repoPath, ".github", "rulesets");
  if (await fileExists(rulesetsDir)) {
    try {
      const entries = await fs.readdir(rulesetsDir);
      if (entries.some((e) => e.endsWith(".json"))) return true;
    } catch {
      // skip unreadable directory
    }
  }
  const rootFiles = await safeReadDir(repoPath);
  if (
    rootFiles.some(
      (f) =>
        f.toLowerCase() === "branch_protection.md" || f.toLowerCase() === "branch-protection.md"
    )
  )
    return true;
  return fileExists(path.join(repoPath, ".github", "branch-protection.json"));
}

export async function readAllDependencies(context: ReadinessContext): Promise<string[]> {
  const dependencies: string[] = [];
  const apps = context.apps.length ? context.apps : [];
  for (const app of apps) {
    if (!app.packageJsonPath) continue;
    const pkg = await readJson(app.packageJsonPath);
    const deps = (pkg?.dependencies ?? {}) as Record<string, unknown>;
    const devDeps = (pkg?.devDependencies ?? {}) as Record<string, unknown>;
    dependencies.push(
      ...Object.keys({
        ...deps,
        ...devDeps
      })
    );
  }

  if (!apps.length && context.rootPackageJson) {
    const rootDeps = (context.rootPackageJson.dependencies ?? {}) as Record<string, unknown>;
    const rootDevDeps = (context.rootPackageJson.devDependencies ?? {}) as Record<string, unknown>;
    dependencies.push(
      ...Object.keys({
        ...rootDeps,
        ...rootDevDeps
      })
    );
  }

  return Array.from(new Set(dependencies));
}
