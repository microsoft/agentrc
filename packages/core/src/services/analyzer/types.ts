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

export const PACKAGE_MANAGERS: Array<{ file: string; name: string }> = [
  { file: "pnpm-lock.yaml", name: "pnpm" },
  { file: "yarn.lock", name: "yarn" },
  { file: "package-lock.json", name: "npm" },
  { file: "bun.lockb", name: "bun" }
];
