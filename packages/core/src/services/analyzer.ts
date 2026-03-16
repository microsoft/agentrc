import fs from "fs/promises";
import path from "path";

import fg from "fast-glob";

import { fileExists, safeReadDir, readJson } from "../utils/fs";

export type RepoApp = {
  name: string;
  path: string;
  ecosystem?: "node" | "rust" | "go" | "dotnet" | "java" | "python" | "ruby" | "php";
  manifestPath?: string;
  packageJsonPath: string;
  scripts: Record<string, string>;
  hasTsConfig: boolean;
};

export type Area = {
  name: string;
  description?: string;
  applyTo: string | string[];
  path?: string;
  ecosystem?: RepoApp["ecosystem"];
  source: "auto" | "config";
  scripts?: Record<string, string>;
  hasTsConfig?: boolean;
  parentArea?: string;
  workingDirectory?: string;
};

export type RepoAnalysis = {
  path: string;
  isGitRepo: boolean;
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  isMonorepo?: boolean;
  workspaceType?:
    | "npm"
    | "pnpm"
    | "yarn"
    | "cargo"
    | "go"
    | "dotnet"
    | "gradle"
    | "maven"
    | "bazel"
    | "nx"
    | "pants"
    | "turborepo";
  workspacePatterns?: string[];
  apps?: RepoApp[];
  areas?: Area[];
};

const PACKAGE_MANAGERS: Array<{ file: string; name: string }> = [
  { file: "pnpm-lock.yaml", name: "pnpm" },
  { file: "yarn.lock", name: "yarn" },
  { file: "package-lock.json", name: "npm" },
  { file: "bun.lockb", name: "bun" },
  { file: "packages.lock.json", name: "nuget" }
];

export async function analyzeRepo(repoPath: string): Promise<RepoAnalysis> {
  const files = await safeReadDir(repoPath);
  let isGit = false;
  try {
    await fs.access(path.join(repoPath, ".git"));
    isGit = true;
  } catch {
    // not a git repo
  }
  const analysis: RepoAnalysis = {
    path: repoPath,
    isGitRepo: isGit,
    languages: [],
    frameworks: []
  };

  const hasPackageJson = files.includes("package.json");
  const hasTsConfig = files.includes("tsconfig.json");
  const hasPyProject = files.includes("pyproject.toml");
  const hasRequirements = files.includes("requirements.txt");
  const hasGoMod = files.includes("go.mod");
  const hasCargo = files.includes("Cargo.toml");
  const hasDotnet = files.some(
    (f) =>
      f.endsWith(".csproj") ||
      f.endsWith(".fsproj") ||
      f.endsWith(".sln") ||
      f.endsWith(".slnx") ||
      f === "global.json" ||
      f === "Directory.Build.props"
  );
  const hasCsproj = files.some((f) => f.endsWith(".csproj"));
  const hasFsproj = files.some((f) => f.endsWith(".fsproj"));
  const hasPomXml = files.includes("pom.xml");
  const hasBuildGradle = files.includes("build.gradle") || files.includes("build.gradle.kts");
  const hasGemfile = files.includes("Gemfile");
  const hasComposerJson = files.includes("composer.json");
  const hasCMakeLists = files.includes("CMakeLists.txt");
  const hasMakefile = files.includes("Makefile") || files.includes("GNUmakefile");
  const hasMesonBuild = files.includes("meson.build");
  const hasConfigure = files.includes("configure") || files.includes("configure.ac");
  const hasMozBuild = files.includes("moz.build");

  if (hasPackageJson) analysis.languages.push("JavaScript");
  if (hasTsConfig) analysis.languages.push("TypeScript");
  if (hasPyProject || hasRequirements) analysis.languages.push("Python");
  if (hasGoMod) analysis.languages.push("Go");
  if (hasCargo) analysis.languages.push("Rust");
  if (hasCsproj || (hasDotnet && !hasFsproj)) analysis.languages.push("C#");
  if (hasFsproj) analysis.languages.push("F#");
  if (hasPomXml || hasBuildGradle) analysis.languages.push("Java");
  if (hasGemfile) analysis.languages.push("Ruby");
  if (hasComposerJson) analysis.languages.push("PHP");
  if (hasCMakeLists || hasMesonBuild || hasConfigure || hasMozBuild) analysis.languages.push("C++");
  if (hasMakefile && !analysis.languages.length) analysis.languages.push("C");

  analysis.packageManager = await detectPackageManager(repoPath, files);

  let rootPackageJson: Record<string, unknown> | undefined;

  if (hasPackageJson) {
    rootPackageJson = await readJson(path.join(repoPath, "package.json"));
    const deps = Object.keys({
      ...(rootPackageJson?.dependencies ?? {}),
      ...(rootPackageJson?.devDependencies ?? {})
    });
    analysis.frameworks.push(...detectFrameworks(deps, files));
  }

  if (hasDotnet) {
    const dotnetFrameworks = await detectDotnetFrameworks(repoPath);
    analysis.frameworks.push(...dotnetFrameworks);
  }

  const workspace = await detectWorkspace(repoPath, files, rootPackageJson);
  if (workspace) {
    analysis.workspaceType = workspace.type;
    analysis.workspacePatterns = workspace.patterns;
  }

  let apps = await resolveWorkspaceApps(repoPath, workspace?.patterns ?? [], rootPackageJson);

  // If JS workspace didn't find multiple apps, try non-JS monorepo detection
  if (apps.length <= 1) {
    const nonJs = await detectNonJsMonorepo(repoPath, files);
    if (nonJs.apps.length > 1) {
      apps = nonJs.apps;
      if (nonJs.type) analysis.workspaceType = nonJs.type;
      if (nonJs.patterns) analysis.workspacePatterns = nonJs.patterns;
    }
  }

  if (workspace && files.includes("turbo.json") && apps.length > 1) {
    analysis.workspaceType = "turborepo";
  }

  if (files.includes("nx.json") && apps.length > 1 && analysis.workspaceType !== "turborepo") {
    analysis.workspaceType = "nx";
  }

  analysis.apps = apps;
  analysis.isMonorepo = apps.length > 1;

  analysis.languages = unique(analysis.languages);
  analysis.frameworks = unique(analysis.frameworks);

  // Detect areas from apps and folder heuristics
  analysis.areas = await detectAreas(repoPath, analysis);

  return analysis;
}

async function detectPackageManager(
  _repoPath: string,
  files: string[]
): Promise<string | undefined> {
  for (const manager of PACKAGE_MANAGERS) {
    if (files.includes(manager.file)) return manager.name;
  }

  if (files.includes("package.json")) return "npm";
  if (files.includes("pyproject.toml")) return "pip";
  if (files.includes("Cargo.toml")) return "cargo";
  if (files.includes("go.mod")) return "go";
  if (files.includes("pom.xml")) return "maven";
  if (files.includes("build.gradle") || files.includes("build.gradle.kts")) return "gradle";
  if (files.includes("Gemfile")) return "bundler";
  if (files.includes("composer.json")) return "composer";
  if (files.some((f) => f.endsWith(".sln") || f.endsWith(".slnx"))) return "nuget";
  if (
    files.includes("MODULE.bazel") ||
    files.includes("WORKSPACE") ||
    files.includes("WORKSPACE.bazel")
  )
    return "bazel";
  if (files.includes("pants.toml")) return "pants";
  if (files.includes("nx.json")) return "nx";
  return undefined;
}

function detectFrameworks(deps: string[], files: string[]): string[] {
  const frameworks: string[] = [];
  const hasFile = (file: string): boolean => files.includes(file);

  if (deps.includes("next") || hasFile("next.config.js") || hasFile("next.config.mjs"))
    frameworks.push("Next.js");
  if (deps.includes("react") || deps.includes("react-dom")) frameworks.push("React");
  if (deps.includes("vue") || hasFile("vue.config.js")) frameworks.push("Vue");
  if (deps.includes("@angular/core") || hasFile("angular.json")) frameworks.push("Angular");
  if (deps.includes("svelte") || hasFile("svelte.config.js")) frameworks.push("Svelte");
  if (deps.includes("express")) frameworks.push("Express");
  if (deps.includes("@nestjs/core")) frameworks.push("NestJS");
  if (deps.includes("fastify")) frameworks.push("Fastify");

  return frameworks;
}

async function detectDotnetFrameworks(repoPath: string): Promise<string[]> {
  const projectFiles = await fg("**/*.{csproj,fsproj}", {
    cwd: repoPath,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/bin/**", "**/obj/**"]
  });

  const frameworks: string[] = [];
  for (const projFile of projectFiles) {
    try {
      const content = await fs.readFile(path.join(repoPath, projFile), "utf8");
      frameworks.push(...parseDotnetProject(content));
    } catch {
      // ignore read errors
    }
  }
  return frameworks;
}

function parseDotnetProject(content: string): string[] {
  const frameworks: string[] = [];
  const hasPackage = (pkg: string): boolean => content.includes(`Include="${pkg}"`);

  // SDK-based detection
  if (content.includes('Sdk="Microsoft.NET.Sdk.Web"')) frameworks.push("ASP.NET Core");
  if (content.includes('Sdk="Microsoft.NET.Sdk.BlazorWebAssembly"'))
    frameworks.push("Blazor WebAssembly");

  // Package reference detection
  if (hasPackage("Microsoft.AspNetCore") || hasPackage("Microsoft.AspNetCore.App"))
    frameworks.push("ASP.NET Core");
  if (hasPackage("Microsoft.AspNetCore.Components")) frameworks.push("Blazor");
  if (hasPackage("Microsoft.EntityFrameworkCore")) frameworks.push("Entity Framework");
  if (hasPackage("Microsoft.Maui.Controls")) frameworks.push(".NET MAUI");
  if (hasPackage("Xamarin.Forms") || hasPackage("Xamarin.Essentials")) frameworks.push("Xamarin");

  // Project property detection
  if (content.includes("<UseWPF>true</UseWPF>")) frameworks.push("WPF");
  if (content.includes("<UseWindowsForms>true</UseWindowsForms>")) frameworks.push("Windows Forms");

  // Test framework detection
  if (hasPackage("xunit") || hasPackage("xunit.core")) frameworks.push("xUnit");
  if (hasPackage("NUnit") || hasPackage("nunit.framework")) frameworks.push("NUnit");
  if (hasPackage("MSTest.TestFramework")) frameworks.push("MSTest");

  // Console app fallback
  if (
    frameworks.length === 0 &&
    content.includes("<OutputType>Exe</OutputType>") &&
    content.includes('Sdk="Microsoft.NET.Sdk"')
  ) {
    frameworks.push("Console");
  }

  return frameworks;
}

async function safeReadFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function isScannableDirectory(repoPath: string, candidatePath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(candidatePath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;

    const resolvedRoot = await fs.realpath(repoPath).catch(() => path.resolve(repoPath));
    const resolvedCandidate = await fs
      .realpath(candidatePath)
      .catch(() => path.resolve(candidatePath));

    return (
      resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep)
    );
  } catch {
    return false;
  }
}

type WorkspaceConfig = {
  type: "npm" | "pnpm" | "yarn";
  patterns: string[];
};

async function detectWorkspace(
  repoPath: string,
  files: string[],
  packageJson?: Record<string, unknown>
): Promise<WorkspaceConfig | undefined> {
  if (files.includes("pnpm-workspace.yaml")) {
    const patterns = await readPnpmWorkspace(path.join(repoPath, "pnpm-workspace.yaml"));
    if (patterns.length) return { type: "pnpm", patterns };
  }

  const workspaces = packageJson?.workspaces;
  if (Array.isArray(workspaces)) {
    return { type: files.includes("yarn.lock") ? "yarn" : "npm", patterns: workspaces.map(String) };
  }

  if (workspaces && typeof workspaces === "object") {
    const packages = (workspaces as { packages?: unknown }).packages;
    if (Array.isArray(packages)) {
      return { type: files.includes("yarn.lock") ? "yarn" : "npm", patterns: packages.map(String) };
    }
  }

  return undefined;
}

async function readPnpmWorkspace(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/u);
    const patterns: string[] = [];
    let inPackages = false;
    for (const line of lines) {
      // Skip comment-only lines
      if (/^\s*#/u.test(line)) continue;
      if (!inPackages && /^\s*packages\s*:/u.test(line)) {
        // Handle inline array: packages: ["apps/*", "libs/*"]
        const inline = line.match(/packages\s*:\s*\[([^\]]+)\]/u);
        if (inline) {
          const items = inline[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/gu, ""));
          return items.filter(Boolean);
        }
        inPackages = true;
        continue;
      }
      if (inPackages) {
        const match = line.match(/^\s*-\s*(.+)$/u);
        if (match?.[1]) {
          // Strip trailing comments and quotes
          const value = match[1]
            .split("#")[0]
            .trim()
            .replace(/^['"]|['"]$/gu, "");
          if (value) patterns.push(value);
          continue;
        }
        // Non-indented, non-empty line means a new top-level key
        if (/^\S/u.test(line) && line.trim()) break;
      }
    }
    return patterns;
  } catch {
    return [];
  }
}

async function resolveWorkspaceApps(
  repoPath: string,
  patterns: string[],
  rootPackageJson?: Record<string, unknown>
): Promise<RepoApp[]> {
  const workspacePatterns = patterns
    .map((pattern) => pattern.replace(/\\/gu, "/"))
    .map((pattern) =>
      pattern.endsWith("package.json") ? pattern : path.posix.join(pattern, "package.json")
    );

  const packageJsonPaths = workspacePatterns.length
    ? (
        await fg(workspacePatterns, { cwd: repoPath, absolute: true, onlyFiles: true, dot: false })
      ).map((p) => path.normalize(p))
    : [];

  if (!packageJsonPaths.length && rootPackageJson) {
    const rootPath = path.join(repoPath, "package.json");
    return [await buildRepoApp(repoPath, rootPath, rootPackageJson)];
  }

  const apps = await Promise.all(
    packageJsonPaths.map(async (pkgPath) => {
      const pkg = await readJson(pkgPath);
      return buildRepoApp(path.dirname(pkgPath), pkgPath, pkg);
    })
  );

  return apps.filter(Boolean) as RepoApp[];
}

async function buildRepoApp(
  appPath: string,
  packageJsonPath: string,
  packageJson?: Record<string, unknown>
): Promise<RepoApp> {
  const scripts = (packageJson?.scripts ?? {}) as Record<string, string>;
  const name = typeof packageJson?.name === "string" ? packageJson.name : path.basename(appPath);
  const hasTsConfig = await fileExists(path.join(appPath, "tsconfig.json"));

  return {
    name,
    path: appPath,
    ecosystem: "node",
    manifestPath: packageJsonPath,
    packageJsonPath,
    scripts,
    hasTsConfig
  };
}

function buildNonJsApp(
  name: string,
  appPath: string,
  ecosystem: RepoApp["ecosystem"],
  manifestPath: string
): RepoApp {
  return {
    name,
    path: appPath,
    ecosystem,
    manifestPath,
    packageJsonPath: "",
    scripts: {},
    hasTsConfig: false
  };
}

// ─── Non-JS monorepo detection ───

type NonJsMonorepoResult = {
  type?: RepoAnalysis["workspaceType"];
  patterns?: string[];
  apps: RepoApp[];
};

async function detectNonJsMonorepo(
  repoPath: string,
  files: string[]
): Promise<NonJsMonorepoResult> {
  const cargoApps = await detectCargoWorkspace(repoPath);
  if (cargoApps.length > 1) return { type: "cargo", apps: cargoApps };

  const goApps = await detectGoWorkspace(repoPath);
  if (goApps.length > 1) return { type: "go", apps: goApps };

  const dotnetApps = await detectDotnetSolution(repoPath, files);
  if (dotnetApps.length > 1) return { type: "dotnet", apps: dotnetApps };

  const gradleApps = await detectGradleMultiProject(repoPath, files);
  if (gradleApps.length > 1) return { type: "gradle", apps: gradleApps };

  const mavenApps = await detectMavenMultiModule(repoPath);
  if (mavenApps.length > 1) return { type: "maven", apps: mavenApps };

  const bazelApps = await detectBazelWorkspace(repoPath, files);
  if (bazelApps.length > 1) return { type: "bazel", apps: bazelApps };

  const nxApps = await detectNxWorkspace(repoPath, files);
  if (nxApps.length > 1) return { type: "nx", apps: nxApps };

  const pantsApps = await detectPantsWorkspace(repoPath, files);
  if (pantsApps.length > 1) return { type: "pants", apps: pantsApps };

  return { apps: [] };
}

async function detectCargoWorkspace(repoPath: string): Promise<RepoApp[]> {
  const content = await safeReadFile(path.join(repoPath, "Cargo.toml"));
  if (!content) return [];

  // Extract [workspace] section up to the next section header
  const workspaceSection = content.match(/\[workspace\]([\s\S]*?)(?:\n\[|$)/u);
  if (!workspaceSection) return [];

  const membersMatch = workspaceSection[1].match(/members\s*=\s*\[([\s\S]*?)\]/u);
  if (!membersMatch) return [];

  const patterns = [...membersMatch[1].matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
  if (!patterns.length) return [];

  const tomlPaths = (
    await fg(
      patterns.map((p) => path.posix.join(p, "Cargo.toml")),
      { cwd: repoPath, absolute: true, onlyFiles: true }
    )
  ).map((p) => path.normalize(p));

  return Promise.all(
    tomlPaths.map(async (tomlPath) => {
      const dir = path.dirname(tomlPath);
      const toml = await safeReadFile(tomlPath);
      const nameMatch = toml?.match(/^\s*name\s*=\s*"([^"]+)"/mu);
      return buildNonJsApp(nameMatch?.[1] ?? path.basename(dir), dir, "rust", tomlPath);
    })
  );
}

async function detectGoWorkspace(repoPath: string): Promise<RepoApp[]> {
  const content = await safeReadFile(path.join(repoPath, "go.work"));
  if (!content) return [];

  const modules: string[] = [];

  // Block form: use ( ./cmd/server \n ./pkg/lib )
  const blockMatch = content.match(/use\s*\(([\s\S]*?)\)/u);
  if (blockMatch) {
    for (const line of blockMatch[1].split(/\r?\n/u)) {
      const trimmed = line.replace(/\/\/.*$/u, "").trim();
      if (trimmed) modules.push(trimmed);
    }
  }

  // Single-line form: use ./cmd/server
  for (const match of content.matchAll(/^use\s+(\S+)\s*$/gmu)) {
    modules.push(match[1]);
  }

  const apps: RepoApp[] = [];
  for (const mod of modules) {
    const modPath = path.resolve(repoPath, mod);
    const goModPath = path.join(modPath, "go.mod");
    if (!(await fileExists(goModPath))) continue;

    const goMod = await safeReadFile(goModPath);
    const nameMatch = goMod?.match(/^module\s+(\S+)/mu);
    const shortName = nameMatch?.[1]?.split("/").pop() ?? path.basename(modPath);
    apps.push(buildNonJsApp(shortName, modPath, "go", goModPath));
  }

  return apps;
}

async function detectDotnetSolution(repoPath: string, files: string[]): Promise<RepoApp[]> {
  // Prefer .slnx (newer XML format) over .sln (legacy text format)
  const slnxFile = files.find((f) => f.endsWith(".slnx"));
  if (slnxFile) {
    return detectSlnxProjects(repoPath, slnxFile);
  }

  const slnFile = files.find((f) => f.endsWith(".sln"));
  if (!slnFile) return [];

  const content = await safeReadFile(path.join(repoPath, slnFile));
  if (!content) return [];

  // Match: Project("{guid}") = "Name", "path\to\Project.csproj", "{guid}"
  const projectRegex = /Project\("[^"]*"\)\s*=\s*"([^"]+)",\s*"([^"]+\.(?:cs|fs|vb)proj)"/giu;
  const apps: RepoApp[] = [];

  for (const match of content.matchAll(projectRegex)) {
    const name = match[1];
    const projRelPath = match[2].replace(/\\/gu, "/");
    const projPath = path.resolve(repoPath, projRelPath);
    const appDir = path.dirname(projPath);

    if (await fileExists(projPath)) {
      apps.push(buildNonJsApp(name, appDir, "dotnet", projPath));
    }
  }

  return apps;
}

async function detectSlnxProjects(repoPath: string, slnxFile: string): Promise<RepoApp[]> {
  const content = await safeReadFile(path.join(repoPath, slnxFile));
  if (!content) return [];

  // Match: <Project Path="path/to/Project.csproj" /> (with optional extra attributes)
  const projectRegex = /<Project\s[^>]*Path="([^"]+\.(?:cs|fs|vb)proj)"[^>]*\/>/giu;
  const apps: RepoApp[] = [];

  for (const match of content.matchAll(projectRegex)) {
    const projRelPath = match[1].replace(/\\/gu, "/");
    const projPath = path.resolve(repoPath, projRelPath);
    const appDir = path.dirname(projPath);
    const name = path.basename(appDir);

    if (await fileExists(projPath)) {
      apps.push(buildNonJsApp(name, appDir, "dotnet", projPath));
    }
  }

  return apps;
}

async function detectGradleMultiProject(repoPath: string, files: string[]): Promise<RepoApp[]> {
  const settingsFile = files.includes("settings.gradle.kts")
    ? "settings.gradle.kts"
    : files.includes("settings.gradle")
      ? "settings.gradle"
      : null;
  if (!settingsFile) return [];

  const content = await safeReadFile(path.join(repoPath, settingsFile));
  if (!content) return [];

  // Extract all Gradle project references (':app', ':lib:core') from the file
  const projectNames: string[] = [];
  for (const match of content.matchAll(/['"](:(?:[\w.-]+:)*[\w.-]+)['"]/gu)) {
    projectNames.push(match[1].replace(/^:/u, "").replace(/:/gu, "/"));
  }

  const uniqueProjects = [...new Set(projectNames)];
  const apps: RepoApp[] = [];

  for (const project of uniqueProjects) {
    const projectDir = path.resolve(repoPath, project);
    const ktsPath = path.join(projectDir, "build.gradle.kts");
    const groovyPath = path.join(projectDir, "build.gradle");

    const buildFile = (await fileExists(ktsPath))
      ? ktsPath
      : (await fileExists(groovyPath))
        ? groovyPath
        : null;

    if (buildFile) {
      apps.push(buildNonJsApp(path.basename(project), projectDir, "java", buildFile));
    }
  }

  return apps;
}

async function detectMavenMultiModule(repoPath: string): Promise<RepoApp[]> {
  const content = await safeReadFile(path.join(repoPath, "pom.xml"));
  if (!content) return [];

  const apps: RepoApp[] = [];
  for (const match of content.matchAll(/<module>([^<]+)<\/module>/gu)) {
    const modName = match[1].trim();
    const modDir = path.resolve(repoPath, modName);
    const pomPath = path.join(modDir, "pom.xml");

    if (await fileExists(pomPath)) {
      apps.push(buildNonJsApp(path.basename(modName), modDir, "java", pomPath));
    }
  }

  return apps;
}

async function detectBazelWorkspace(repoPath: string, files: string[]): Promise<RepoApp[]> {
  const hasBazel =
    files.includes("MODULE.bazel") ||
    files.includes("WORKSPACE") ||
    files.includes("WORKSPACE.bazel");
  if (!hasBazel) return [];

  // Scan first-level directories for BUILD / BUILD.bazel files
  const entries = await safeReadDir(repoPath);
  const apps: RepoApp[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = path.join(repoPath, entry);
    if (!(await isScannableDirectory(repoPath, fullPath))) continue;
    const children = await safeReadDir(fullPath);
    const buildFile = children.includes("BUILD")
      ? "BUILD"
      : children.includes("BUILD.bazel")
        ? "BUILD.bazel"
        : undefined;
    if (!buildFile) continue;

    apps.push(buildNonJsApp(entry, fullPath, undefined, path.join(fullPath, buildFile)));
  }

  return apps;
}

async function detectNxWorkspace(repoPath: string, files: string[]): Promise<RepoApp[]> {
  if (!files.includes("nx.json")) return [];

  // Find project.json files (depth-limited via glob pattern)
  const projectJsonPaths = (
    await fg(["*/project.json", "*/*/project.json", "*/*/*/project.json"], {
      cwd: repoPath,
      absolute: true,
      onlyFiles: true,
      dot: false,
      followSymbolicLinks: false,
      ignore: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/build/**", "**/out/**"]
    })
  ).map((p) => path.normalize(p));

  const apps: RepoApp[] = [];
  for (const projPath of projectJsonPaths) {
    const projDir = path.dirname(projPath);
    const projJson = await readJson(projPath);
    const name = typeof projJson?.name === "string" ? projJson.name : path.basename(projDir);
    // Detect ecosystem from sibling files
    const children = await safeReadDir(projDir);
    const ecosystem: RepoApp["ecosystem"] = children.includes("package.json")
      ? "node"
      : children.includes("Cargo.toml")
        ? "rust"
        : children.includes("go.mod")
          ? "go"
          : children.includes("pyproject.toml")
            ? "python"
            : undefined;
    apps.push({
      name,
      path: projDir,
      ecosystem,
      manifestPath: projPath,
      packageJsonPath: children.includes("package.json") ? path.join(projDir, "package.json") : "",
      scripts: {},
      hasTsConfig: children.includes("tsconfig.json")
    });
  }

  return apps;
}

async function detectPantsWorkspace(repoPath: string, files: string[]): Promise<RepoApp[]> {
  if (!files.includes("pants.toml")) return [];

  // Scan first-level directories for BUILD files
  const entries = await safeReadDir(repoPath);
  const apps: RepoApp[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = path.join(repoPath, entry);
    if (!(await isScannableDirectory(repoPath, fullPath))) continue;
    const children = await safeReadDir(fullPath);
    const buildFile = children.includes("BUILD")
      ? "BUILD"
      : children.includes("BUILD.pants")
        ? "BUILD.pants"
        : undefined;
    if (!buildFile) continue;

    // Infer ecosystem from sibling files
    const ecosystem: RepoApp["ecosystem"] = children.includes("pyproject.toml")
      ? "python"
      : children.includes("go.mod")
        ? "go"
        : children.includes("Cargo.toml")
          ? "rust"
          : undefined;
    apps.push(buildNonJsApp(entry, fullPath, ecosystem, path.join(fullPath, buildFile)));
  }

  return apps;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

// ─── Area detection ───

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

async function areasFromHeuristics(repoPath: string): Promise<Area[]> {
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
  const existingNames = new Set(existingAreas.map((a) => a.name.toLowerCase()));
  const entries = await safeReadDir(repoPath);
  const areas: Area[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (FALLBACK_SKIP_DIRS.has(entry.toLowerCase())) continue;
    if (existingNames.has(entry.toLowerCase())) continue;

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
  const nonGlobPrefix = longestNonGlobPrefix(patterns[0]);
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

async function detectAreas(repoPath: string, analysis: RepoAnalysis): Promise<Area[]> {
  let autoAreas: Area[];

  if (analysis.isMonorepo && analysis.apps && analysis.apps.length > 1) {
    const appAreas = areasFromApps(repoPath, analysis.apps);
    // Also run heuristics to catch non-app directories (docs, infra, etc.)
    const heuristicAreas = await areasFromHeuristics(repoPath);
    // Merge: app areas take precedence by name
    const byName = new Map(heuristicAreas.map((a) => [a.name.toLowerCase(), a]));
    for (const a of appAreas) {
      byName.set(a.name.toLowerCase(), a);
    }
    autoAreas = Array.from(byName.values());
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
    const byName = new Map(autoAreas.map((a) => [a.name.toLowerCase(), a]));
    for (const a of fallbackAreas) {
      if (!byName.has(a.name.toLowerCase())) {
        byName.set(a.name.toLowerCase(), a);
      }
    }
    autoAreas = Array.from(byName.values());
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
  const autoByName = new Map(autoAreas.map((a) => [a.name.toLowerCase(), a]));
  for (const ca of configAreas) {
    autoByName.set(ca.name.toLowerCase(), ca);
  }

  return Array.from(autoByName.values());
}

// ─── Workspace detection ───

const WORKSPACE_SCAN_MAX_DEPTH = 3;
const WORKSPACE_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  "target",
  "build",
  "dist",
  "out",
  "vendor",
  "coverage",
  "__pycache__",
  ".cache"
]);

/**
 * Detect workspaces by scanning for `.vscode` folders (indicating directories
 * that developers open as VS Code workspaces) and by grouping auto-detected
 * areas that share a common parent directory.
 */
export async function detectWorkspaces(
  repoPath: string,
  areas: Area[]
): Promise<AgentrcConfigWorkspace[]> {
  const resolvedRoot = path.resolve(repoPath);
  const workspaces = new Map<string, AgentrcConfigWorkspace>();

  // Strategy 1: Scan for .vscode folders as workspace markers
  const vscodeDirs = await findVSCodeDirs(repoPath, repoPath, WORKSPACE_SCAN_MAX_DEPTH);
  for (const vsDir of vscodeDirs) {
    // The workspace is the parent of the .vscode folder
    const wsAbs = path.dirname(vsDir);
    const wsRel = path.relative(repoPath, wsAbs).replace(/\\/gu, "/");
    if (!wsRel || wsRel === ".") continue; // skip repo root

    const wsResolved = path.resolve(wsAbs);
    if (!wsResolved.startsWith(resolvedRoot + path.sep)) continue;

    // Find areas that fall within this workspace
    const wsAreas = areasWithinDir(wsRel, areas);
    if (wsAreas.length === 0) {
      // Run heuristic detection scoped to this workspace directory
      const scopedAreas = await areasFromHeuristics(wsAbs);
      if (scopedAreas.length === 0) continue;
      const configAreas = scopedAreas.map((a) => ({
        name: a.name,
        applyTo: Array.isArray(a.applyTo) ? a.applyTo : a.applyTo,
        description: a.description
      }));
      workspaces.set(wsRel, { name: path.basename(wsRel), path: wsRel, areas: configAreas });
    } else {
      const configAreas = wsAreas.map((a) => toWorkspaceRelativeArea(wsRel, a));
      workspaces.set(wsRel, { name: path.basename(wsRel), path: wsRel, areas: configAreas });
    }
  }

  // Strategy 2: Group areas by common parent directory (2+ siblings → workspace)
  const parentGroups = new Map<string, Area[]>();
  for (const area of areas) {
    if (!area.path) continue;
    const rel = path.relative(repoPath, area.path).replace(/\\/gu, "/");
    const segments = rel.split("/");
    if (segments.length < 2) continue; // top-level dir — not a nested workspace

    const parentRel = segments.slice(0, -1).join("/");
    if (workspaces.has(parentRel)) continue; // already found via .vscode

    if (!parentGroups.has(parentRel)) parentGroups.set(parentRel, []);
    parentGroups.get(parentRel)!.push(area);
  }

  for (const [parentRel, grouped] of parentGroups) {
    if (grouped.length < 2) continue;

    const parentAbs = path.resolve(repoPath, parentRel);
    const parentResolved = path.resolve(parentAbs);
    if (!parentResolved.startsWith(resolvedRoot + path.sep)) continue;

    const configAreas = grouped.map((a) => toWorkspaceRelativeArea(parentRel, a));
    workspaces.set(parentRel, {
      name: path.basename(parentRel),
      path: parentRel,
      areas: configAreas
    });
  }

  return Array.from(workspaces.values());
}

async function findVSCodeDirs(
  repoPath: string,
  dir: string,
  maxDepth: number,
  depth = 0
): Promise<string[]> {
  if (depth >= maxDepth) return [];
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await safeReadDir(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry === ".vscode") {
      results.push(path.join(dir, entry));
      continue;
    }
    if (entry.startsWith(".") || WORKSPACE_SKIP_DIRS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    if (await isScannableDirectory(repoPath, fullPath)) {
      results.push(...(await findVSCodeDirs(repoPath, fullPath, maxDepth, depth + 1)));
    }
  }

  return results;
}

function areasWithinDir(wsRel: string, areas: Area[]): Area[] {
  const prefix = wsRel + "/";
  return areas.filter((a) => {
    const patterns = Array.isArray(a.applyTo) ? a.applyTo : [a.applyTo];
    return patterns.some((p) => p.startsWith(prefix));
  });
}

function toWorkspaceRelativeArea(wsRel: string, area: Area): AgentrcConfigArea {
  const prefix = wsRel + "/";
  const patterns = Array.isArray(area.applyTo) ? area.applyTo : [area.applyTo];
  const relPatterns = patterns.map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p));
  return {
    name: area.name,
    applyTo: relPatterns.length === 1 ? relPatterns[0] : relPatterns,
    description: area.description
  };
}

// ─── AgentRC config ───

export type InstructionStrategy = "flat" | "nested";

export type AgentrcConfigArea = {
  name: string;
  applyTo: string | string[];
  description?: string;
  parentArea?: string;
};

export type AgentrcConfigWorkspace = {
  name: string;
  path: string;
  areas: AgentrcConfigArea[];
};

export type AgentrcConfig = {
  areas?: AgentrcConfigArea[];
  workspaces?: AgentrcConfigWorkspace[];
  policies?: string[];
  strategy?: InstructionStrategy;
  detailDir?: string;
  claudeMd?: boolean;
};

function parseConfigAreas(raw: unknown): AgentrcConfigArea[] {
  if (!Array.isArray(raw)) return [];
  const areas: AgentrcConfigArea[] = [];
  for (const entry of raw) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).name !== "string" ||
      (entry as Record<string, unknown>).applyTo === undefined
    )
      continue;
    const e = entry as Record<string, unknown>;
    if (!(e.name as string).trim()) continue;
    const rawApplyTo = e.applyTo;
    let applyTo: string | string[];
    if (typeof rawApplyTo === "string") {
      applyTo = rawApplyTo;
    } else if (Array.isArray(rawApplyTo) && rawApplyTo.every((v) => typeof v === "string")) {
      applyTo = rawApplyTo as string[];
    } else {
      continue;
    }
    if (
      (typeof applyTo === "string" && !applyTo.trim()) ||
      (Array.isArray(applyTo) && applyTo.length === 0)
    )
      continue;
    const allPatterns = Array.isArray(applyTo) ? applyTo : [applyTo];
    if (allPatterns.some((p) => p.split("/").includes(".."))) continue;
    areas.push({
      name: e.name as string,
      applyTo,
      description: typeof e.description === "string" ? e.description : undefined,
      parentArea: typeof e.parentArea === "string" ? e.parentArea : undefined
    });
  }
  return areas;
}

export async function loadAgentrcConfig(repoPath: string): Promise<AgentrcConfig | undefined> {
  // Try repo root first, then .github/
  const candidates = [
    path.join(repoPath, "agentrc.config.json"),
    path.join(repoPath, ".github", "agentrc.config.json")
  ];

  for (const candidate of candidates) {
    const json = await readJson(candidate);
    if (!json) continue;

    // Validate shape
    if (json.areas !== undefined && !Array.isArray(json.areas)) {
      return undefined;
    }
    const areas = parseConfigAreas(json.areas);

    // Parse policies array
    let policies: string[] | undefined;
    if (Array.isArray(json.policies)) {
      policies = json.policies.filter((p): p is string => typeof p === "string" && p.trim() !== "");
    }

    // Parse strategy
    let strategy: InstructionStrategy | undefined;
    if (typeof json.strategy === "string") {
      const s = json.strategy as string;
      if (s === "flat" || s === "nested") {
        strategy = s;
      }
    }

    // Parse detailDir with safety validation
    let detailDir: string | undefined;
    if (typeof json.detailDir === "string") {
      // Normalize separators so validation works on both Windows and POSIX
      const dir = (json.detailDir as string).trim().replace(/\\+/gu, "/");
      const blocklist = new Set([".git", "node_modules", ".github", "dist", "build"]);
      // Must be a single path segment — no slashes, no traversal, not in blocklist
      if (
        dir &&
        !path.isAbsolute(dir) &&
        !dir.includes("/") &&
        !dir.includes("..") &&
        !blocklist.has(dir)
      ) {
        detailDir = dir;
      }
    }

    // Parse claudeMd
    const claudeMd = json.claudeMd === true ? true : undefined;

    // Parse workspaces array
    const workspaces: AgentrcConfigWorkspace[] = [];
    if (Array.isArray(json.workspaces)) {
      for (const ws of json.workspaces) {
        if (typeof ws !== "object" || ws === null) continue;
        const w = ws as Record<string, unknown>;
        if (typeof w.name !== "string" || !(w.name as string).trim()) continue;
        if (typeof w.path !== "string" || !(w.path as string).trim()) continue;

        const wsPath = (w.path as string).trim().replace(/\\+/gu, "/").replace(/\/+$/u, "");
        if (!wsPath) continue;
        // Must be relative, no traversal, no absolute path, no root
        if (path.isAbsolute(wsPath) || wsPath === "." || wsPath.split("/").includes("..")) continue;

        const wsAreas = parseConfigAreas(w.areas);
        if (wsAreas.length === 0) continue;

        workspaces.push({
          name: (w.name as string).trim(),
          path: wsPath,
          areas: wsAreas
        });
      }
    }

    // Validate parentArea references — flat areas against flat names, workspace areas within their workspace
    const flatNames = new Set(areas.map((a) => a.name.toLowerCase()));
    for (const area of areas) {
      if (area.parentArea && !flatNames.has(area.parentArea.toLowerCase())) {
        area.parentArea = undefined;
      }
    }
    for (const ws of workspaces) {
      const wsAreaNames = new Set(ws.areas.map((a) => a.name.toLowerCase()));
      for (const area of ws.areas) {
        if (area.parentArea && !wsAreaNames.has(area.parentArea.toLowerCase())) {
          area.parentArea = undefined;
        }
      }
    }

    return {
      areas,
      workspaces: workspaces.length ? workspaces : undefined,
      policies: policies?.length ? policies : undefined,
      strategy,
      detailDir,
      claudeMd
    };
  }

  return undefined;
}

export function sanitizeAreaName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return sanitized || "unnamed";
}
