import path from "path";

import { fileExists, readJson } from "../../utils/fs";
import { sanitizeAreaName } from "../analyzer";

import {
  hasLintConfig,
  hasTypecheckConfig,
  hasGithubWorkflows,
  hasFormatterConfig,
  hasCodeowners,
  hasLicense,
  hasReadme,
  hasAnyFile,
  hasCustomInstructions,
  hasFileBasedInstructions,
  hasMcpConfig,
  hasCustomAgents,
  hasCopilotSkills,
  readAllDependencies,
  checkInstructionConsistency
} from "./checkers";
import type { ReadinessCriterion } from "./types";

export function buildCriteria(): ReadinessCriterion[] {
  return [
    {
      id: "lint-config",
      title: "Linting configured",
      pillar: "style-validation",
      level: 1,
      scope: "repo",
      impact: "high",
      effort: "low",
      check: async (context) => {
        const found = await hasLintConfig(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing ESLint/Biome/Prettier configuration.",
          evidence: ["eslint.config.js", ".eslintrc", "biome.json", ".prettierrc"]
        };
      }
    },
    {
      id: "typecheck-config",
      title: "Type checking configured",
      pillar: "style-validation",
      level: 2,
      scope: "repo",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        const found = await hasTypecheckConfig(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing type checking config (tsconfig or equivalent).",
          evidence: ["tsconfig.json", "pyproject.toml", "mypy.ini"]
        };
      }
    },
    {
      id: "build-script",
      title: "Build script present",
      pillar: "build-system",
      level: 1,
      scope: "app",
      impact: "high",
      effort: "low",
      check: async (_context, app) => {
        const found = Boolean(app?.scripts?.build);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing build script in package.json."
        };
      }
    },
    {
      id: "ci-config",
      title: "CI workflow configured",
      pillar: "build-system",
      level: 2,
      scope: "repo",
      impact: "high",
      effort: "medium",
      check: async (context) => {
        const found = await hasGithubWorkflows(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing .github/workflows CI configuration.",
          evidence: [".github/workflows"]
        };
      }
    },
    {
      id: "test-script",
      title: "Test script present",
      pillar: "testing",
      level: 1,
      scope: "app",
      impact: "high",
      effort: "low",
      check: async (_context, app) => {
        const found = Boolean(app?.scripts?.test);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing test script in package.json."
        };
      }
    },
    {
      id: "readme",
      title: "README present",
      pillar: "documentation",
      level: 1,
      scope: "repo",
      impact: "high",
      effort: "low",
      check: async (context) => {
        const found = await hasReadme(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing README documentation.",
          evidence: ["README.md"]
        };
      }
    },
    {
      id: "contributing",
      title: "CONTRIBUTING guide present",
      pillar: "documentation",
      level: 2,
      scope: "repo",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        const found = await fileExists(path.join(context.repoPath, "CONTRIBUTING.md"));
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing CONTRIBUTING.md for contributor workflows."
        };
      }
    },
    {
      id: "lockfile",
      title: "Lockfile present",
      pillar: "dev-environment",
      level: 1,
      scope: "repo",
      impact: "high",
      effort: "low",
      check: async (context) => {
        const found = hasAnyFile(context.rootFiles, [
          "pnpm-lock.yaml",
          "yarn.lock",
          "package-lock.json",
          "bun.lockb"
        ]);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing package manager lockfile."
        };
      }
    },
    {
      id: "env-example",
      title: "Environment example present",
      pillar: "dev-environment",
      level: 2,
      scope: "repo",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        const found = hasAnyFile(context.rootFiles, [".env.example", ".env.sample"]);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing .env.example or .env.sample for setup guidance."
        };
      }
    },
    {
      id: "format-config",
      title: "Formatter configured",
      pillar: "code-quality",
      level: 2,
      scope: "repo",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        const found = await hasFormatterConfig(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing Prettier/Biome formatting config."
        };
      }
    },
    {
      id: "codeowners",
      title: "CODEOWNERS present",
      pillar: "security-governance",
      level: 2,
      scope: "repo",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        const found = await hasCodeowners(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing CODEOWNERS file."
        };
      }
    },
    {
      id: "license",
      title: "LICENSE present",
      pillar: "security-governance",
      level: 1,
      scope: "repo",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        const found = await hasLicense(context.repoPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing LICENSE file."
        };
      }
    },
    {
      id: "security-policy",
      title: "Security policy present",
      pillar: "security-governance",
      level: 3,
      scope: "repo",
      impact: "high",
      effort: "low",
      check: async (context) => {
        const found = await fileExists(path.join(context.repoPath, "SECURITY.md"));
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing SECURITY.md policy."
        };
      }
    },
    {
      id: "dependabot",
      title: "Dependabot configured",
      pillar: "security-governance",
      level: 3,
      scope: "repo",
      impact: "medium",
      effort: "medium",
      check: async (context) => {
        const found = await fileExists(path.join(context.repoPath, ".github", "dependabot.yml"));
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing .github/dependabot.yml configuration."
        };
      }
    },
    {
      id: "observability",
      title: "Observability tooling present",
      pillar: "observability",
      level: 3,
      scope: "repo",
      impact: "medium",
      effort: "medium",
      check: async (context) => {
        const deps = await readAllDependencies(context);
        const has = deps.some((dep) =>
          ["@opentelemetry/api", "@opentelemetry/sdk", "pino", "winston", "bunyan"].includes(dep)
        );
        return {
          status: has ? "pass" : "fail",
          reason: "No observability dependencies detected (OpenTelemetry/logging)."
        };
      }
    },
    {
      id: "custom-instructions",
      title: "Custom instructions or agent guidance",
      pillar: "ai-tooling",
      level: 1,
      scope: "repo",
      impact: "high",
      effort: "low",
      check: async (context) => {
        const rootFound = await hasCustomInstructions(context.repoPath);
        if (rootFound.length === 0) {
          return {
            status: "fail",
            reason:
              "Missing custom instructions (e.g. copilot-instructions.md, CLAUDE.md, AGENTS.md, .cursorrules).",
            evidence: [
              "copilot-instructions.md",
              "CLAUDE.md",
              "AGENTS.md",
              ".cursorrules",
              ".github/copilot-instructions.md"
            ]
          };
        }

        // Check for area instructions (.github/instructions/*.instructions.md)
        const fileBasedInstructions = await hasFileBasedInstructions(
          context.repoPath,
          context.vscodeLocations?.instructionsLocations
        );
        const areas = context.analysis.areas ?? [];

        // For monorepos or repos with detected areas, check coverage
        if (areas.length > 0) {
          if (fileBasedInstructions.length === 0) {
            return {
              status: "pass",
              reason: `Root instructions found, but no area instructions for ${areas.length} detected areas. Run \`agentrc instructions --areas\` to generate.`,
              evidence: [...rootFound, ...areas.map((a) => `${a.name}: missing .instructions.md`)]
            };
          }
          return {
            status: "pass",
            reason: `Root + ${fileBasedInstructions.length} area instruction(s) found.`,
            evidence: [...rootFound, ...fileBasedInstructions]
          };
        }

        // File-based instructions found (e.g. from VS Code location settings) without areas
        if (fileBasedInstructions.length > 0) {
          return {
            status: "pass",
            reason: `Root + ${fileBasedInstructions.length} file-based instruction(s) found.`,
            evidence: [...rootFound, ...fileBasedInstructions]
          };
        }

        // For monorepos without areas, check per-app instructions (legacy behavior)
        if (context.analysis.isMonorepo && context.apps.length > 1) {
          const appsMissing: string[] = [];
          for (const app of context.apps) {
            const appFound = await hasCustomInstructions(app.path);
            if (appFound.length === 0) {
              appsMissing.push(app.name);
            }
          }
          if (appsMissing.length > 0) {
            return {
              status: "pass",
              reason: `Root instructions found, but ${appsMissing.length}/${context.apps.length} apps missing their own: ${appsMissing.join(", ")}`,
              evidence: [
                ...rootFound,
                ...appsMissing.map((name) => `${name}: missing app-level instructions`)
              ]
            };
          }
        }

        return {
          status: "pass",
          evidence: rootFound
        };
      }
    },
    {
      id: "instructions-consistency",
      title: "AI instruction files are consistent",
      pillar: "ai-tooling",
      level: 2,
      scope: "repo",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        const rootFound = await hasCustomInstructions(context.repoPath);
        if (rootFound.length <= 1) {
          return { status: "skip", reason: "Fewer than 2 instruction files found." };
        }
        const result = await checkInstructionConsistency(context.repoPath, rootFound);
        if (result.unified) {
          return {
            status: "pass",
            reason: `${rootFound.length} instruction files are consistent.`,
            evidence: rootFound
          };
        }
        return {
          status: "fail",
          reason: `${rootFound.length} instruction files are diverging (${result.similarity !== undefined ? `${Math.round(result.similarity * 100)}% similar` : "different content"}). Consider consolidating or symlinking them.`,
          evidence: rootFound
        };
      }
    },
    {
      id: "mcp-config",
      title: "MCP configuration present",
      pillar: "ai-tooling",
      level: 2,
      scope: "repo",
      impact: "high",
      effort: "low",
      check: async (context) => {
        const found = await hasMcpConfig(context.repoPath);
        return {
          status: found.length > 0 ? "pass" : "fail",
          reason: "Missing MCP (Model Context Protocol) configuration (e.g. .vscode/mcp.json).",
          evidence:
            found.length > 0
              ? found
              : [".vscode/mcp.json", ".vscode/settings.json (mcp section)", "mcp.json"]
        };
      }
    },
    {
      id: "custom-agents",
      title: "Custom AI agents configured",
      pillar: "ai-tooling",
      level: 3,
      scope: "repo",
      impact: "medium",
      effort: "medium",
      check: async (context) => {
        const found = await hasCustomAgents(
          context.repoPath,
          context.vscodeLocations?.agentLocations
        );
        return {
          status: found.length > 0 ? "pass" : "fail",
          reason: "No custom AI agents configured (e.g. .github/agents/, .copilot/agents/).",
          evidence:
            found.length > 0
              ? found
              : [".github/agents/", ".copilot/agents/", ".github/copilot/agents/"]
        };
      }
    },
    {
      id: "copilot-skills",
      title: "Copilot/Claude skills present",
      pillar: "ai-tooling",
      level: 3,
      scope: "repo",
      impact: "medium",
      effort: "medium",
      check: async (context) => {
        const found = await hasCopilotSkills(
          context.repoPath,
          context.vscodeLocations?.skillsLocations
        );
        return {
          status: found.length > 0 ? "pass" : "fail",
          reason: "No Copilot or Claude skills found (e.g. .copilot/skills/, .github/skills/).",
          evidence:
            found.length > 0 ? found : [".copilot/skills/", ".github/skills/", ".claude/skills/"]
        };
      }
    },
    // ── Area-scoped criteria (only run when areaPath is set) ──
    {
      id: "area-readme",
      title: "Area README present",
      pillar: "documentation",
      level: 1,
      scope: "area",
      impact: "medium",
      effort: "low",
      check: async (context) => {
        if (!context.areaPath || !context.areaFiles) {
          return { status: "skip", reason: "No area context." };
        }
        const found = context.areaFiles.some(
          (f) => f.toLowerCase() === "readme.md" || f.toLowerCase() === "readme"
        );
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing README in area directory."
        };
      }
    },
    {
      id: "area-build-script",
      title: "Area build script present",
      pillar: "build-system",
      level: 1,
      scope: "area",
      impact: "high",
      effort: "low",
      check: async (context, _app, area) => {
        if (!context.areaPath || !context.areaFiles) {
          return { status: "skip", reason: "No area context." };
        }
        // Check area.scripts from enriched Area type
        if (area?.scripts?.build) {
          return { status: "pass" };
        }
        // Fallback: check for package.json with build script in area
        const pkgPath = path.join(context.areaPath, "package.json");
        const pkg = await readJson(pkgPath);
        const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
        const found = Boolean(scripts.build);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing build script in area."
        };
      }
    },
    {
      id: "area-test-script",
      title: "Area test script present",
      pillar: "testing",
      level: 1,
      scope: "area",
      impact: "high",
      effort: "low",
      check: async (context, _app, area) => {
        if (!context.areaPath || !context.areaFiles) {
          return { status: "skip", reason: "No area context." };
        }
        if (area?.scripts?.test) {
          return { status: "pass" };
        }
        const pkgPath = path.join(context.areaPath, "package.json");
        const pkg = await readJson(pkgPath);
        const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
        const found = Boolean(scripts.test);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : "Missing test script in area."
        };
      }
    },
    {
      id: "area-instructions",
      title: "Area-specific instructions present",
      pillar: "ai-tooling",
      level: 2,
      scope: "area",
      impact: "high",
      effort: "low",
      check: async (context, _app, area) => {
        if (!area) {
          return { status: "skip", reason: "No area context." };
        }
        const sanitized = sanitizeAreaName(area.name);
        const instructionPath = path.join(
          context.repoPath,
          ".github",
          "instructions",
          `${sanitized}.instructions.md`
        );
        const found = await fileExists(instructionPath);
        return {
          status: found ? "pass" : "fail",
          reason: found ? undefined : `Missing .github/instructions/${sanitized}.instructions.md`
        };
      }
    }
  ];
}
