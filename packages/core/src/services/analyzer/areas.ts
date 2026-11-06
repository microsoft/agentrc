import path from "path";

import { safeReadDir, readJson } from "../../utils/fs";

import { isScannableDirectory } from "./apps";
import { loadAgentrcConfig } from "./config";
import type { AgentrcConfigArea } from "./config";
import type { RepoApp, Area, RepoAnalysis } from "./types";

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function areaIdentity(applyTo: Area["applyTo"]): string {
  const patterns = Array.isArray(applyTo) ? applyTo : [applyTo];
  return JSON.stringify(unique(patterns.map((pattern) => pattern.replace(/\\/gu, "/"))).sort());
}

const AREA_HEURISTIC_DIRS = [
  "frontend",
  "backend",
  "api",
  "web",
  "mobile",
  "app",
  "server",
  "client",
  "infra",
  "infrastructure",
  "shared",
  "common",
  "lib",
  "libs",
  "packages",
  "services",
  "docs",
  "scripts",
  "tools",
  "cli",
  "sdk",
  "core",
  "admin",
  "portal",
  "dashboard",
  "worker",
  "functions",
  // Browser / engine components
  "browser",
  "devtools",
  "toolkit",
  "dom",
  "layout",
  "media",
  "security",
  "testing",
  "extensions",
  "modules",
  "editor",
  "remote",
  "storage"
];

// Directories to skip in fallback area detection
const FALLBACK_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "target",
  "build",
  "dist",
  "out",
  "output",
  ".output",
  ".next",
  "vendor",
  "third_party",
  "other-licenses",
  "coverage",
  "__pycache__",
  ".cache",
  ".vscode",
  ".idea",
  ".github",
  ".gitlab",
  ".circleci",
  "supply-chain",
  "gradle",
  ".cargo"
]);

const MIN_FALLBACK_CHILDREN = 3;
const MIN_AREAS_FOR_FALLBACK = 3;
const MIN_TOPLEVEL_DIRS_FOR_FALLBACK = 10;

const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  "setup.py",
  "setup.cfg",
  "CMakeLists.txt",
  "meson.build",
  "BUILD",
  "BUILD.bazel",
  "moz.build"
];

const CODE_EXTENSIONS = [
  ".ts",
  ".js",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".rb",
  ".php",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".swift",
  ".kt",
  ".scala"
];

function areasFromApps(repoPath: string, apps: RepoApp[]): Area[] {
  return apps.map((app) => {
    const rel = path.relative(repoPath, app.path).replace(/\\/gu, "/");
    return {
      name: app.name,
      applyTo: `${rel}/**`,
      path: app.path,
      ecosystem: app.ecosystem,
      source: "auto" as const,
      scripts: Object.keys(app.scripts).length > 0 ? app.scripts : undefined,
      hasTsConfig: app.hasTsConfig || undefined
    };
  });
}

export async function areasFromHeuristics(repoPath: string): Promise<Area[]> {
  const entries = await safeReadDir(repoPath);
  const areas: Area[] = [];

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    if (!AREA_HEURISTIC_DIRS.includes(lower)) continue;

    const fullPath = path.join(repoPath, entry);
    if (!(await isScannableDirectory(repoPath, fullPath))) continue;

    // Check if the directory has meaningful content (manifest or code files)
    const children = await safeReadDir(fullPath);
    const hasManifest = children.some((c) => MANIFEST_FILES.includes(c));
    const hasCode = children.some((c) => CODE_EXTENSIONS.some((ext) => c.endsWith(ext)));
    const hasSrcDir = children.includes("src");

    if (!hasManifest && !hasCode && !hasSrcDir) continue;

    // Read scripts from manifest if present
    let scripts: Record<string, string> | undefined;
    let hasTsConfig: boolean | undefined;
    if (children.includes("package.json")) {
      const pkg = await readJson(path.join(fullPath, "package.json"));
      const pkgScripts = (pkg?.scripts ?? {}) as Record<string, string>;
      if (Object.keys(pkgScripts).length > 0) scripts = pkgScripts;
    }
    if (children.includes("tsconfig.json")) {
      hasTsConfig = true;
    }

    areas.push({
      name: entry,
      applyTo: `${entry}/**`,
      path: fullPath,
      source: "auto",
      scripts,
      hasTsConfig
    });
  }

  return areas;
}

/**
 * Fallback area detection for large repos (e.g., Firefox, Chromium) where
 * neither workspace managers nor the heuristic directory list provide good coverage.
 * Scans first-level directories that contain code or manifests and meet a
 * small minimum-size threshold to reduce noise.
 */
async function areasFromFallback(repoPath: string, existingAreas: Area[]): Promise<Area[]> {
  const existingIdentities = new Set(existingAreas.map((area) => areaIdentity(area.applyTo)));
  const entries = await safeReadDir(repoPath);
  const areas: Area[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (FALLBACK_SKIP_DIRS.has(entry.toLowerCase())) continue;
    if (existingIdentities.has(areaIdentity(`${entry}/**`))) continue;

    const fullPath = path.join(repoPath, entry);
    if (!(await isScannableDirectory(repoPath, fullPath))) continue;

    const children = await safeReadDir(fullPath);
    if (children.length < MIN_FALLBACK_CHILDREN) continue;

    const hasManifest = children.some((c) => MANIFEST_FILES.includes(c));
    const hasCode = children.some((c) => CODE_EXTENSIONS.some((ext) => c.endsWith(ext)));
    const hasSrcDir = children.includes("src");

    if (!hasManifest && !hasCode && !hasSrcDir) continue;

    areas.push({
      name: entry,
      applyTo: `${entry}/**`,
      path: fullPath,
      source: "auto"
    });
  }

  return areas;
}

const GLOB_CHARS = /[*?[\\]/u;

function longestNonGlobPrefix(pattern: string): string | undefined {
  const segments = pattern.split("/").filter((s) => s !== ".");
  const prefixSegments: string[] = [];
  for (const segment of segments) {
    if (GLOB_CHARS.test(segment)) break;
    prefixSegments.push(segment);
  }
  return prefixSegments.length > 0 ? prefixSegments.join("/") : undefined;
}

async function resolveConfigArea(
  repoPath: string,
  resolvedRoot: string,
  ca: AgentrcConfigArea
): Promise<Area | undefined> {
  const patterns = Array.isArray(ca.applyTo) ? ca.applyTo : [ca.applyTo];
  const nonGlobPrefix = longestNonGlobPrefix(patterns[0].replace(/\\/gu, "/"));
  const basePath = nonGlobPrefix ? path.join(repoPath, nonGlobPrefix) : repoPath;

  const resolved = path.resolve(basePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return undefined;

  let scripts: Record<string, string> | undefined;
  let hasTsConfig: boolean | undefined;
  try {
    const children = await safeReadDir(basePath);
    if (children.includes("package.json")) {
      const pkg = await readJson(path.join(basePath, "package.json"));
      const pkgScripts = (pkg?.scripts ?? {}) as Record<string, string>;
      if (Object.keys(pkgScripts).length > 0) scripts = pkgScripts;
    }
    if (children.includes("tsconfig.json")) hasTsConfig = true;
  } catch {
    // Directory may not exist yet for config areas
  }

  return {
    name: ca.name,
    description: ca.description,
    applyTo: ca.applyTo,
    path: basePath,
    source: "config" as const,
    scripts,
    hasTsConfig,
    parentArea: ca.parentArea
  };
}

export async function detectAreas(repoPath: string, analysis: RepoAnalysis): Promise<Area[]> {
  let autoAreas: Area[];

  if (analysis.isMonorepo && analysis.apps && analysis.apps.length > 1) {
    const appAreas = areasFromApps(repoPath, analysis.apps);
    // Also run heuristics to catch non-app directories (docs, infra, etc.)
    const heuristicAreas = await areasFromHeuristics(repoPath);
    // Merge: app areas take precedence by name
    const byIdentity = new Map(heuristicAreas.map((area) => [areaIdentity(area.applyTo), area]));
    for (const area of appAreas) {
      byIdentity.set(areaIdentity(area.applyTo), area);
    }
    autoAreas = Array.from(byIdentity.values());
  } else {
    autoAreas = await areasFromHeuristics(repoPath);
  }

  // Smart fallback: if few areas detected but repo has many top-level dirs,
  // scan all first-level directories for code content
  const topLevelEntries = await safeReadDir(repoPath);
  const topLevelDirCount = (
    await Promise.all(
      topLevelEntries
        .filter((e) => !e.startsWith("."))
        .map(async (e) => isScannableDirectory(repoPath, path.join(repoPath, e)))
    )
  ).filter(Boolean).length;

  if (
    autoAreas.length < MIN_AREAS_FOR_FALLBACK &&
    topLevelDirCount > MIN_TOPLEVEL_DIRS_FOR_FALLBACK
  ) {
    const fallbackAreas = await areasFromFallback(repoPath, autoAreas);
    const byIdentity = new Map(autoAreas.map((area) => [areaIdentity(area.applyTo), area]));
    for (const area of fallbackAreas) {
      const identity = areaIdentity(area.applyTo);
      if (!byIdentity.has(identity)) {
        byIdentity.set(identity, area);
      }
    }
    autoAreas = Array.from(byIdentity.values());
  }

  // Merge with config areas (flat + workspace)
  const config = await loadAgentrcConfig(repoPath);
  if (!config?.areas?.length && !config?.workspaces?.length) return autoAreas;

  const resolvedRoot = path.resolve(repoPath);
  const configAreas: Area[] = [];

  // Process flat config areas
  for (const ca of config.areas ?? []) {
    const area = await resolveConfigArea(repoPath, resolvedRoot, ca);
    if (area) configAreas.push(area);
  }

  // Process workspace areas — flatten into namespaced Area entries
  for (const ws of config.workspaces ?? []) {
    const wsAbsPath = path.resolve(repoPath, ws.path);
    if (!wsAbsPath.startsWith(resolvedRoot + path.sep) && wsAbsPath !== resolvedRoot) continue;

    for (const ca of ws.areas) {
      // Resolve applyTo patterns relative to the workspace path
      const rawPatterns = Array.isArray(ca.applyTo) ? ca.applyTo : [ca.applyTo];
      const repoRelativePatterns = rawPatterns.map((p) => `${ws.path}/${p}`);
      const repoRelativeApplyTo =
        repoRelativePatterns.length === 1 ? repoRelativePatterns[0] : repoRelativePatterns;

      const namespacedArea: AgentrcConfigArea = {
        ...ca,
        name: `${ws.name}/${ca.name}`,
        applyTo: repoRelativeApplyTo,
        parentArea: ca.parentArea ? `${ws.name}/${ca.parentArea}` : undefined
      };
      const area = await resolveConfigArea(repoPath, resolvedRoot, namespacedArea);
      if (area) {
        area.workingDirectory = ws.path;
        configAreas.push(area);
      }
    }
  }

  // Config areas override auto-detected by name (case-insensitive)
  const byIdentity = new Map(autoAreas.map((area) => [areaIdentity(area.applyTo), area]));
  for (const area of configAreas) {
    byIdentity.set(areaIdentity(area.applyTo), area);
  }

  const areas = Array.from(byIdentity.values());
  const identityByName = new Map(
    configAreas.map((area) => [area.name.toLowerCase(), areaIdentity(area.applyTo)])
  );
  for (const area of areas) {
    if (!area.parentArea) continue;
    const parentIdentity = identityByName.get(area.parentArea.toLowerCase());
    const parent = parentIdentity ? byIdentity.get(parentIdentity) : undefined;
    if (parent) {
      area.parentArea = parent === area ? undefined : parent.name;
    }
  }

  return areas;
}

// ─── Workspace detection ───
