import fs from "fs/promises";
import path from "path";

import { fileExists, safeReadDir, readJson } from "../../utils/fs";

import type {
  InstructionConsistencyResult,
  ReadinessContext,
  VscodeLocationSettings
} from "./types";

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

function validateAndNormalize(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed || path.isAbsolute(trimmed)) return undefined;
  const segments = trimmed.split(/[/\\]+/u);
  if (segments.some((s) => s === "..")) return undefined;
  let normalized = path.normalize(trimmed).replace(/\\/gu, "/");
  normalized = normalized.replace(/\/+$/u, "");
  if (!normalized || normalized === ".") return undefined;
  return normalized;
}

function extractLocationPaths(entries: unknown): string[] {
  if (!entries || typeof entries !== "object") return [];
  const paths: string[] = [];

  // Array format: [{ path: "dir" }, "dir2"]
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      let raw: string | undefined;
      if (typeof entry === "string") {
        raw = entry;
      } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.path === "string") {
          raw = obj.path;
        }
      }
      if (raw) {
        const normalized = validateAndNormalize(raw);
        if (normalized) paths.push(normalized);
      }
    }
    return paths;
  }

  // Object/map format: { "dir": true, "dir2": false }
  for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
    if (value !== true) continue;
    const normalized = validateAndNormalize(key);
    if (normalized) paths.push(normalized);
  }
  return paths;
}

function extractLocationsFromSettings(settings: Record<string, unknown>): VscodeLocationSettings {
  return {
    instructionsLocations: extractLocationPaths(settings["chat.instructionsFilesLocations"]),
    agentLocations: extractLocationPaths(settings["chat.agentFilesLocations"]),
    skillsLocations: extractLocationPaths(settings["chat.agentSkillsLocations"])
  };
}

function mergeLocations(
  a: VscodeLocationSettings,
  b: VscodeLocationSettings
): VscodeLocationSettings {
  return {
    instructionsLocations: [...a.instructionsLocations, ...b.instructionsLocations],
    agentLocations: [...a.agentLocations, ...b.agentLocations],
    skillsLocations: [...a.skillsLocations, ...b.skillsLocations]
  };
}

/**
 * Read `chat.instructionsFilesLocations`, `chat.agentFilesLocations`, and
 * `chat.agentSkillsLocations` from `.vscode/settings.json` and `*.code-workspace`
 * files in the repo root. Paths are validated to be relative and free of traversal.
 */
export async function parseVscodeLocations(
  repoPath: string,
  rootFiles: string[]
): Promise<VscodeLocationSettings> {
  const empty: VscodeLocationSettings = {
    instructionsLocations: [],
    agentLocations: [],
    skillsLocations: []
  };
  let result = { ...empty };

  // Read from .vscode/settings.json (JSONC — may contain comments)
  const settings = await readJson(path.join(repoPath, ".vscode", "settings.json"));
  if (settings) {
    result = mergeLocations(result, extractLocationsFromSettings(settings));
  }

  // Read from *.code-workspace files in the repo root (JSONC format)
  const workspaceFiles = rootFiles.filter((f) => f.endsWith(".code-workspace"));
  for (const wsFile of workspaceFiles) {
    const ws = await readJson(path.join(repoPath, wsFile));
    if (ws?.settings && typeof ws.settings === "object" && !Array.isArray(ws.settings)) {
      result = mergeLocations(
        result,
        extractLocationsFromSettings(ws.settings as Record<string, unknown>)
      );
    }
  }

  // Deduplicate
  return {
    instructionsLocations: [...new Set(result.instructionsLocations)],
    agentLocations: [...new Set(result.agentLocations)],
    skillsLocations: [...new Set(result.skillsLocations)]
  };
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

export async function hasFileBasedInstructions(
  repoPath: string,
  extraDirs?: string[]
): Promise<string[]> {
  const found: string[] = [];
  const defaultDir = path.join(repoPath, ".github", "instructions");
  try {
    const entries = await fs.readdir(defaultDir);
    found.push(
      ...entries
        .filter((e) => e.endsWith(".instructions.md"))
        .map((e) => `.github/instructions/${e}`)
    );
  } catch {
    // directory doesn't exist or not readable
  }
  for (const dir of extraDirs ?? []) {
    const fullDir = path.join(repoPath, dir);
    const normalizedDir = dir.replace(/\\/gu, "/").replace(/\/+$/u, "");
    try {
      const entries = await fs.readdir(fullDir);
      found.push(
        ...entries.filter((e) => e.endsWith(".instructions.md")).map((e) => `${normalizedDir}/${e}`)
      );
    } catch {
      // directory doesn't exist or not readable
    }
  }
  return [...new Set(found)];
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

export async function hasCustomAgents(repoPath: string, extraDirs?: string[]): Promise<string[]> {
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
  for (const dir of extraDirs ?? []) {
    if (await fileExists(path.join(repoPath, dir))) {
      found.push(dir);
    }
  }
  return [...new Set(found)];
}

export async function hasCopilotSkills(repoPath: string, extraDirs?: string[]): Promise<string[]> {
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
  for (const dir of extraDirs ?? []) {
    if (await fileExists(path.join(repoPath, dir))) {
      found.push(dir);
    }
  }
  return [...new Set(found)];
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
