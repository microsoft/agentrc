import fs from "fs/promises";
import os from "os";
import path from "path";

import { runReadinessReport } from "@agentrc/core/services/readiness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const AGENT_PLUGINS_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

describe("runReadinessReport", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-readiness-"));
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  async function writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(repoPath, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }

  async function writePackageJson(pkg: Record<string, unknown>): Promise<void> {
    await writeFile("package.json", JSON.stringify(pkg, null, 2));
  }

  it("returns a valid report structure", async () => {
    await writePackageJson({ name: "test-repo", scripts: { build: "tsc", test: "vitest" } });
    const report = await runReadinessReport({ repoPath });

    expect(report.repoPath).toBe(repoPath);
    expect(report.generatedAt).toBeTruthy();
    expect(report.pillars).toBeInstanceOf(Array);
    expect(report.levels).toBeInstanceOf(Array);
    expect(report.criteria).toBeInstanceOf(Array);
    expect(typeof report.achievedLevel).toBe("number");
  });

  it("has all expected pillars", async () => {
    await writePackageJson({ name: "test-repo" });
    const report = await runReadinessReport({ repoPath });

    const pillarIds = report.pillars.map((p) => p.id);
    expect(pillarIds).toContain("style-validation");
    expect(pillarIds).toContain("build-system");
    expect(pillarIds).toContain("testing");
    expect(pillarIds).toContain("documentation");
    expect(pillarIds).toContain("dev-environment");
    expect(pillarIds).toContain("code-quality");
    expect(pillarIds).toContain("observability");
    expect(pillarIds).toContain("security-governance");
    expect(pillarIds).toContain("ai-tooling");
  });

  it("has 5 maturity levels", async () => {
    await writePackageJson({ name: "test-repo" });
    const report = await runReadinessReport({ repoPath });

    expect(report.levels).toHaveLength(5);
    expect(report.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
  });

  describe("style-validation pillar", () => {
    it("passes lint-config when eslint.config.js exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("eslint.config.js", "export default [];");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "lint-config");

      expect(criterion?.status).toBe("pass");
    });

    it("fails lint-config when no lint config exists", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "lint-config");

      expect(criterion?.status).toBe("fail");
    });

    it("passes typecheck-config when tsconfig.json exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("tsconfig.json", "{}");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "typecheck-config");

      expect(criterion?.status).toBe("pass");
    });
  });

  describe("documentation pillar", () => {
    it("passes readme when README.md exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("README.md", "# Test");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "readme");

      expect(criterion?.status).toBe("pass");
    });

    it("passes contributing when CONTRIBUTING.md exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("CONTRIBUTING.md", "# Contributing");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "contributing");

      expect(criterion?.status).toBe("pass");
    });
  });

  describe("dev-environment pillar", () => {
    it("passes lockfile when package-lock.json exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("package-lock.json", "{}");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "lockfile");

      expect(criterion?.status).toBe("pass");
    });

    it("passes env-example when .env.example exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".env.example", "API_KEY=your-key");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "env-example");

      expect(criterion?.status).toBe("pass");
    });
  });

  describe("security-governance pillar", () => {
    it("passes codeowners when CODEOWNERS exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("CODEOWNERS", "* @owner");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "codeowners");

      expect(criterion?.status).toBe("pass");
    });

    it("passes codeowners when .github/CODEOWNERS exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".github/CODEOWNERS", "* @owner");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "codeowners");

      expect(criterion?.status).toBe("pass");
    });

    it("passes license when LICENSE exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("LICENSE", "MIT License");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "license");

      expect(criterion?.status).toBe("pass");
    });

    it("passes security-policy when SECURITY.md exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("SECURITY.md", "# Security");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "security-policy");

      expect(criterion?.status).toBe("pass");
    });

    it("passes dependabot when .github/dependabot.yml exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".github/dependabot.yml", "version: 2");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "dependabot");

      expect(criterion?.status).toBe("pass");
    });
  });

  describe("ai-tooling pillar", () => {
    it("passes custom-instructions when copilot-instructions.md exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".github/copilot-instructions.md", "# Instructions");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
    });

    it("passes custom-instructions when CLAUDE.md exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("CLAUDE.md", "# Claude instructions");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
    });

    it("passes custom-instructions when AGENTS.md exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("AGENTS.md", "# Agents guidance");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
    });

    it("passes custom-instructions when GEMINI.md exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("GEMINI.md", "# Gemini instructions");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
    });

    it("passes custom-instructions when only file-based instructions exist", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        ".github/instructions/nested/api.instructions.md",
        "---\napplyTo: src/api/**\n---\n# API"
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain(".github/instructions/nested/api.instructions.md");
    });

    it("passes custom-instructions for nested Copilot CLI instructions", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("packages/api/AGENTS.md", "# API instructions");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain("packages/api/AGENTS.md");
    });

    it("passes custom-instructions when .cursorrules exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".cursorrules", "rules here");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
    });

    it("mentions missing area instructions when areas detected", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".github/copilot-instructions.md", "# Instructions");
      // Create a heuristic area directory
      await writeFile("frontend/index.ts", "export {};");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.reason).toContain("no area instructions");
      expect(criterion?.evidence).toEqual(
        expect.arrayContaining([expect.stringContaining("missing .instructions.md")])
      );
    });

    it("reports area instructions count when present with areas", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".github/copilot-instructions.md", "# Instructions");
      // Create a heuristic area directory
      await writeFile("frontend/index.ts", "export {};");
      // Create an area instruction
      await writeFile(
        ".github/instructions/frontend.instructions.md",
        "---\napplyTo: frontend/**\n---\n# Frontend"
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.reason).toContain("area instruction");
      expect(criterion?.evidence).toEqual(
        expect.arrayContaining([expect.stringContaining("frontend.instructions.md")])
      );
    });

    it("fails custom-instructions when none exist", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");

      expect(criterion?.status).toBe("fail");
    });

    it("passes mcp-config when .vscode/mcp.json exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".vscode/mcp.json", "{}");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "mcp-config");

      expect(criterion?.status).toBe("pass");
    });

    it.each([".mcp.json", ".github/mcp.json"])(
      "passes mcp-config when Copilot CLI workspace config %s exists",
      async (configPath) => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(configPath, JSON.stringify({ mcpServers: {} }));

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "mcp-config");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toContain(configPath);
      }
    );

    it("passes mcp-config for a nested Copilot CLI workspace config", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("packages/api/.mcp.json", JSON.stringify({ mcpServers: {} }));

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "mcp-config");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain("packages/api/.mcp.json");
    });

    it("passes mcp-config when .vscode/settings.json has mcp key", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        ".vscode/settings.json",
        JSON.stringify({ "github.copilot.chat.mcp.enabled": true })
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "mcp-config");

      expect(criterion?.status).toBe("pass");
    });

    it("passes custom-agents when .github/agents directory exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".github/agents/.gitkeep", "");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-agents");

      expect(criterion?.status).toBe("pass");
    });

    it("passes custom-agents when .claude/agents directory exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".claude/agents/reviewer.agent.md", "# Reviewer");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-agents");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain(".claude/agents");
    });

    it("passes custom-agents for a nested Copilot CLI agents directory", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("packages/api/.github/agents/reviewer.agent.md", "# Reviewer");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-agents");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain("packages/api/.github/agents");
    });

    it("passes copilot-skills when .copilot/skills directory exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".copilot/skills/.gitkeep", "");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "copilot-skills");

      expect(criterion?.status).toBe("pass");
    });

    it("passes copilot-skills when .agents/skills directory exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".agents/skills/review/SKILL.md", "# Review");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "copilot-skills");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain(".agents/skills");
    });

    it("passes copilot-skills for a nested Copilot CLI skills directory", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("packages/api/.github/skills/review/SKILL.md", "# Review");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "copilot-skills");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain("packages/api/.github/skills");
    });

    it("passes copilot-skills for a root Agent Plugins package", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        "plugin.json",
        JSON.stringify({ $schema: AGENT_PLUGINS_SCHEMA, name: "test-plugin" })
      );
      await writeFile(
        "skills/review/SKILL.md",
        "---\nname: review\ndescription: Review code.\n---\n"
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "copilot-skills");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.reason).toBeUndefined();
      expect(criterion?.evidence).toContain("skills");
    });

    it("passes custom-agents for an Agent Plugins package", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        "plugins/review/plugin.json",
        JSON.stringify({ $schema: AGENT_PLUGINS_SCHEMA, name: "review" })
      );
      await writeFile("plugins/review/com.github.copilot/agents/reviewer.agent.md", "# Reviewer");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-agents");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain("plugins/review/com.github.copilot/agents");
    });

    it("passes custom-instructions for Agent Plugin rules", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        "plugins/review/plugin.json",
        JSON.stringify({ $schema: AGENT_PLUGINS_SCHEMA, name: "review" })
      );
      await writeFile("plugins/review/com.github.copilot/rules/review.md", "# Review rules");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "custom-instructions");
      const consistency = report.criteria.find((c) => c.id === "instructions-consistency");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.evidence).toContain("plugins/review/com.github.copilot/rules");
      expect(consistency?.status).toBe("skip");
    });

    it.each([".claude/settings.json", ".github/copilot/settings.json"])(
      "detects extra plugin marketplaces in %s",
      async (settingsPath) => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          settingsPath,
          JSON.stringify({
            extraKnownMarketplaces: {
              local: { source: { source: "directory", path: "./plugins" } }
            }
          })
        );

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "plugin-marketplaces");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toContain(`${settingsPath} (extraKnownMarketplaces)`);
      }
    );

    it.each([".claude/settings.local.json", ".github/copilot/settings.local.json"])(
      "detects enabled plugins in %s",
      async (settingsPath) => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(settingsPath, JSON.stringify({ enabledPlugins: { "review@local": true } }));

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "enabled-plugins");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toContain(`${settingsPath} (enabledPlugins)`);
      }
    );

    it("does not count disabled plugin entries as enabled", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        ".github/copilot/settings.json",
        JSON.stringify({ enabledPlugins: { "review@local": false } })
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "enabled-plugins");

      expect(criterion?.status).toBe("skip");
    });

    it("passes mcp-config for a nested Agent Plugins package", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        "plugins/deploy/plugin.json",
        JSON.stringify({ $schema: AGENT_PLUGINS_SCHEMA, name: "deploy-tools" })
      );
      await writeFile("plugins/deploy/mcp.json", JSON.stringify({ mcpServers: {} }));

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "mcp-config");

      expect(criterion?.status).toBe("pass");
      expect(criterion?.reason).toBeUndefined();
      expect(criterion?.evidence).toContain("plugins/deploy/mcp.json");
    });

    it("ignores nonconforming plugin manifests for standard skill discovery", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("invalid-json/plugin.json", "{");
      await writeFile("invalid-json/skills/review/SKILL.md", "# Review");
      await writeFile(
        "unsupported/plugin.json",
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json",
          name: "unsupported"
        })
      );
      await writeFile("unsupported/skills/review/SKILL.md", "# Review");
      await writeFile("legacy/plugin.json", JSON.stringify({ name: "legacy" }));
      await writeFile("legacy/skills/review/SKILL.md", "# Review");
      await writeFile(
        "invalid-name/plugin.json",
        JSON.stringify({ $schema: AGENT_PLUGINS_SCHEMA, name: "Invalid-Name" })
      );
      await writeFile("invalid-name/skills/review/SKILL.md", "# Review");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "copilot-skills");

      expect(criterion?.status).toBe("fail");
    });

    describe("vscode location settings", () => {
      it("detects file-based instructions from chat.instructionsFilesLocations in settings.json", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(".github/copilot-instructions.md", "# Instructions");
        await writeFile(
          ".vscode/settings.json",
          JSON.stringify({
            "chat.instructionsFilesLocations": [{ path: "docs/instructions" }]
          })
        );
        await writeFile("docs/instructions/api.instructions.md", "# API rules");
        await writeFile("frontend/index.ts", "export {};");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "custom-instructions");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(
          expect.arrayContaining([expect.stringContaining("docs/instructions/api.instructions.md")])
        );
      });

      it("detects file-based instructions from .code-workspace settings", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(".github/copilot-instructions.md", "# Instructions");
        await writeFile(
          "project.code-workspace",
          JSON.stringify({
            folders: [{ path: "." }],
            settings: {
              "chat.instructionsFilesLocations": [{ path: "custom-rules" }]
            }
          })
        );
        await writeFile("custom-rules/style.instructions.md", "# Style");
        await writeFile("frontend/index.ts", "export {};");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "custom-instructions");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(
          expect.arrayContaining([expect.stringContaining("custom-rules/style.instructions.md")])
        );
      });

      it("passes custom-agents when chat.agentFilesLocations points to agents dir", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          ".vscode/settings.json",
          JSON.stringify({
            "chat.agentFilesLocations": [{ path: "my-agents" }]
          })
        );
        await writeFile("my-agents/planner.agent.md", "# Planner");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "custom-agents");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(expect.arrayContaining(["my-agents"]));
      });

      it("passes copilot-skills when chat.agentSkillsLocations points to skills dir", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          ".vscode/settings.json",
          JSON.stringify({
            "chat.agentSkillsLocations": [{ path: "tools/skills" }]
          })
        );
        await writeFile("tools/skills/testing/SKILL.md", "# Testing skill");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "copilot-skills");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(expect.arrayContaining(["tools/skills"]));
      });

      it("merges locations from settings.json and .code-workspace files", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          ".vscode/settings.json",
          JSON.stringify({
            "chat.agentFilesLocations": [{ path: "agents-a" }]
          })
        );
        await writeFile(
          "mono.code-workspace",
          JSON.stringify({
            folders: [{ path: "." }],
            settings: {
              "chat.agentFilesLocations": [{ path: "agents-b" }]
            }
          })
        );
        await writeFile("agents-a/review.agent.md", "# Review");
        await writeFile("agents-b/plan.agent.md", "# Plan");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "custom-agents");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(expect.arrayContaining(["agents-a", "agents-b"]));
      });

      it("handles string entries in location arrays", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          ".vscode/settings.json",
          JSON.stringify({
            "chat.agentSkillsLocations": ["my-skills"]
          })
        );
        await writeFile("my-skills/debug/SKILL.md", "# Debug");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "copilot-skills");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(expect.arrayContaining(["my-skills"]));
      });

      it("handles object/map format for location settings", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          "project.code-workspace",
          JSON.stringify({
            folders: [{ path: "." }],
            settings: {
              "chat.agentFilesLocations": {
                "agents/team": true,
                "agents/disabled": false
              },
              "chat.agentSkillsLocations": {
                "skills/active": true
              }
            }
          })
        );
        await writeFile("agents/team/review.agent.md", "# Review");
        await writeFile("agents/disabled/skip.agent.md", "# Skip");
        await writeFile("skills/active/test/SKILL.md", "# Test skill");

        const report = await runReadinessReport({ repoPath });

        const agentsCriterion = report.criteria.find((c) => c.id === "custom-agents");
        expect(agentsCriterion?.status).toBe("pass");
        expect(agentsCriterion?.evidence).toEqual(expect.arrayContaining(["agents/team"]));
        expect(agentsCriterion?.evidence).not.toEqual(expect.arrayContaining(["agents/disabled"]));

        const skillsCriterion = report.criteria.find((c) => c.id === "copilot-skills");
        expect(skillsCriterion?.status).toBe("pass");
        expect(skillsCriterion?.evidence).toEqual(expect.arrayContaining(["skills/active"]));
      });

      it("rejects path traversal and absolute paths in location settings", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          ".vscode/settings.json",
          JSON.stringify({
            "chat.agentFilesLocations": [
              { path: "../outside" },
              { path: "/etc/agents" },
              { path: "." },
              { path: "valid-agents" }
            ]
          })
        );
        await writeFile("valid-agents/test.agent.md", "# Test");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "custom-agents");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(["valid-agents"]);
        expect(criterion?.evidence).not.toEqual(
          expect.arrayContaining([expect.stringContaining("..")])
        );
      });

      it("ignores invalid entries in location arrays", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          ".vscode/settings.json",
          JSON.stringify({
            "chat.agentSkillsLocations": [
              { notPath: "invalid" },
              null,
              123,
              "",
              { path: "real-skills" }
            ]
          })
        );
        await writeFile("real-skills/testing/SKILL.md", "# Testing");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "copilot-skills");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(["real-skills"]);
      });

      it("parses JSONC settings with comments and trailing commas", async () => {
        await writePackageJson({ name: "test-repo" });
        const jsonc = `{
  // Custom agent locations
  "chat.agentFilesLocations": [
    { "path": "my-agents" }, // workspace agents
  ]
}`;
        await writeFile(".vscode/settings.json", jsonc);
        await writeFile("my-agents/review.agent.md", "# Review");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "custom-agents");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(expect.arrayContaining(["my-agents"]));
      });

      it("parses JSONC .code-workspace files with comments", async () => {
        await writePackageJson({ name: "test-repo" });
        const jsonc = `{
  // Workspace folders
  "folders": [{ "path": "." }],
  "settings": {
    // Skills location
    "chat.agentSkillsLocations": [
      { "path": "tools/skills" },
    ]
  }
}`;
        await writeFile("project.code-workspace", jsonc);
        await writeFile("tools/skills/testing/SKILL.md", "# Testing");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "copilot-skills");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.evidence).toEqual(expect.arrayContaining(["tools/skills"]));
      });
    });

    describe("instructions-consistency", () => {
      it("skips when only one instruction file exists", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(".github/copilot-instructions.md", "# Instructions");

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "instructions-consistency");

        expect(criterion?.status).toBe("skip");
      });

      it("skips when no instruction files exist", async () => {
        await writePackageJson({ name: "test-repo" });

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "instructions-consistency");

        expect(criterion?.status).toBe("skip");
      });

      it("passes when two instruction files have identical content", async () => {
        await writePackageJson({ name: "test-repo" });
        const content = "# Shared instructions\n\nUse TypeScript strict mode.\n";
        await writeFile(".github/copilot-instructions.md", content);
        await writeFile("CLAUDE.md", content);

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "instructions-consistency");

        expect(criterion?.status).toBe("pass");
        expect(criterion?.reason).toContain("consistent");
      });

      it("passes when instruction files are symlinked", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(".github/copilot-instructions.md", "# Instructions\n\nShared content.");
        const target = path.join(repoPath, ".github", "copilot-instructions.md");
        const link = path.join(repoPath, "CLAUDE.md");
        await fs.symlink(target, link);

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "instructions-consistency");

        expect(criterion?.status).toBe("pass");
      });

      it("fails when instruction files have diverging content", async () => {
        await writePackageJson({ name: "test-repo" });
        await writeFile(
          ".github/copilot-instructions.md",
          "# Copilot\n\nUse React for all frontend components.\nFollow functional patterns."
        );
        await writeFile(
          "CLAUDE.md",
          "# Claude\n\nUse Vue.js for UI development.\nPrefer class-based components."
        );

        const report = await runReadinessReport({ repoPath });
        const criterion = report.criteria.find((c) => c.id === "instructions-consistency");

        expect(criterion?.status).toBe("fail");
        expect(criterion?.reason).toContain("diverging");
        expect(criterion?.reason).toContain("% similar");
        expect(criterion?.evidence).toContain(".github/copilot-instructions.md");
        expect(criterion?.evidence).toContain("CLAUDE.md");
      });
    });
  });

  describe("build-system pillar", () => {
    it("passes ci-config when .github/workflows exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(".github/workflows/ci.yml", "name: CI");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "ci-config");

      expect(criterion?.status).toBe("pass");
    });
  });

  describe("achieved level", () => {
    it("achieves level 1 with basic setup", async () => {
      await writePackageJson({
        name: "test-repo",
        scripts: { build: "tsc", test: "vitest" }
      });
      await writeFile("eslint.config.js", "export default [];");
      await writeFile("README.md", "# Test");
      await writeFile("package-lock.json", "{}");
      await writeFile("LICENSE", "MIT");

      const report = await runReadinessReport({ repoPath });

      expect(report.achievedLevel).toBeGreaterThanOrEqual(1);
    });

    it("is 0 for an empty repo", async () => {
      await writePackageJson({ name: "empty-repo" });

      const report = await runReadinessReport({ repoPath });

      // Level 0 means nothing achieved (most L1 checks fail)
      expect(report.achievedLevel).toBeLessThanOrEqual(1);
    });
  });

  describe("pillar summaries", () => {
    it("calculates passRate correctly", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("eslint.config.js", "export default [];");

      const report = await runReadinessReport({ repoPath });
      const stylePillar = report.pillars.find((p) => p.id === "style-validation");

      expect(stylePillar).toBeDefined();
      expect(stylePillar!.passed).toBeGreaterThanOrEqual(1);
      expect(stylePillar!.total).toBeGreaterThanOrEqual(1);
      expect(stylePillar!.passRate).toBe(stylePillar!.passed / stylePillar!.total);
    });
  });

  describe("extras", () => {
    it("includes extras by default", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath });

      expect(report.extras.length).toBeGreaterThan(0);
      const extraIds = report.extras.map((e) => e.id);
      expect(extraIds).toContain("pr-template");
      expect(extraIds).toContain("pre-commit");
      expect(extraIds).toContain("architecture-doc");
    });

    it("excludes extras when disabled", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath, includeExtras: false });

      expect(report.extras).toHaveLength(0);
    });

    it("excludes reason when extra passes", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("AGENTS.md", "# Agent instructions");

      const report = await runReadinessReport({ repoPath });

      const agentsExtra = report.extras.find((e) => e.id === "agents-doc");
      expect(agentsExtra?.status).toBe("pass");
      expect(agentsExtra?.reason).toBeUndefined();
    });

    it("includes reason when extra fails", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath });

      const agentsExtra = report.extras.find((e) => e.id === "agents-doc");
      expect(agentsExtra?.status).toBe("fail");
      expect(agentsExtra?.reason).toBeTruthy();
    });
  });

  describe("per-area readiness", () => {
    it("returns areaReports when perArea is true and areas exist", async () => {
      await writePackageJson({ name: "test-repo" });
      // Create two heuristic areas with meaningful content
      await writeFile("frontend/index.ts", "export {};");
      await writeFile(
        "backend/package.json",
        JSON.stringify({ name: "backend", scripts: { build: "tsc", test: "vitest" } })
      );

      const report = await runReadinessReport({ repoPath, perArea: true });

      expect(report.areaReports).toBeDefined();
      expect(report.areaReports!.length).toBe(2);
      const areaNames = report.areaReports!.map((ar) => ar.area.name).sort();
      expect(areaNames).toContain("frontend");
      expect(areaNames).toContain("backend");
    });

    it("does not return areaReports when perArea is false", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");

      const report = await runReadinessReport({ repoPath, perArea: false });

      expect(report.areaReports).toBeUndefined();
    });

    it("does not return areaReports when no areas exist", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath, perArea: true });

      expect(report.areaReports).toBeUndefined();
    });

    it("passes area-readme when area has README.md", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");
      await writeFile("frontend/README.md", "# Frontend");

      const report = await runReadinessReport({ repoPath, perArea: true });

      const frontendReport = report.areaReports!.find((ar) => ar.area.name === "frontend");
      const readmeCriterion = frontendReport!.criteria.find((c) => c.id === "area-readme");
      expect(readmeCriterion?.status).toBe("pass");
    });

    it("fails area-readme when area has no README", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");

      const report = await runReadinessReport({ repoPath, perArea: true });

      const frontendReport = report.areaReports!.find((ar) => ar.area.name === "frontend");
      const readmeCriterion = frontendReport!.criteria.find((c) => c.id === "area-readme");
      expect(readmeCriterion?.status).toBe("fail");
    });

    it("passes area-build-script when area has build script", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        "backend/package.json",
        JSON.stringify({ name: "backend", scripts: { build: "tsc" } })
      );

      const report = await runReadinessReport({ repoPath, perArea: true });

      const backendReport = report.areaReports!.find((ar) => ar.area.name === "backend");
      const buildCriterion = backendReport!.criteria.find((c) => c.id === "area-build-script");
      expect(buildCriterion?.status).toBe("pass");
    });

    it("fails area-build-script when area has no build script", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");

      const report = await runReadinessReport({ repoPath, perArea: true });

      const frontendReport = report.areaReports!.find((ar) => ar.area.name === "frontend");
      const buildCriterion = frontendReport!.criteria.find((c) => c.id === "area-build-script");
      expect(buildCriterion?.status).toBe("fail");
    });

    it("passes area-test-script when area has test script", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile(
        "backend/package.json",
        JSON.stringify({ name: "backend", scripts: { test: "vitest" } })
      );

      const report = await runReadinessReport({ repoPath, perArea: true });

      const backendReport = report.areaReports!.find((ar) => ar.area.name === "backend");
      const testCriterion = backendReport!.criteria.find((c) => c.id === "area-test-script");
      expect(testCriterion?.status).toBe("pass");
    });

    it("passes area-instructions when matching instruction file exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");
      await writeFile(
        ".github/instructions/frontend.instructions.md",
        "---\napplyTo: frontend/**\n---\n# Frontend"
      );

      const report = await runReadinessReport({ repoPath, perArea: true });

      const frontendReport = report.areaReports!.find((ar) => ar.area.name === "frontend");
      const instrCriterion = frontendReport!.criteria.find((c) => c.id === "area-instructions");
      expect(instrCriterion?.status).toBe("pass");
    });

    it("fails area-instructions when no matching instruction file", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");

      const report = await runReadinessReport({ repoPath, perArea: true });

      const frontendReport = report.areaReports!.find((ar) => ar.area.name === "frontend");
      const instrCriterion = frontendReport!.criteria.find((c) => c.id === "area-instructions");
      expect(instrCriterion?.status).toBe("fail");
    });

    it("includes aggregate area criteria in main criteria list", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");
      await writeFile("frontend/README.md", "# Frontend");
      await writeFile("backend/package.json", JSON.stringify({ name: "backend" }));
      await writeFile("backend/README.md", "# Backend");

      const report = await runReadinessReport({ repoPath, perArea: true });

      const areaReadme = report.criteria.find((c) => c.id === "area-readme");
      expect(areaReadme).toBeDefined();
      expect(areaReadme!.scope).toBe("area");
      expect(areaReadme!.areaSummary).toBeDefined();
      expect(areaReadme!.areaSummary!.passed).toBe(2);
      expect(areaReadme!.areaSummary!.total).toBe(2);
      expect(areaReadme!.status).toBe("pass");
    });

    it("area criteria excluded when perArea is false", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");

      const report = await runReadinessReport({ repoPath });

      const areaReadme = report.criteria.find((c) => c.id === "area-readme");
      expect(areaReadme).toBeUndefined();
    });

    it("aggregate passes at exactly 80% threshold", async () => {
      await writePackageJson({ name: "test-repo" });
      // 5 areas: 4 with README (80%) and 1 without
      await writeFile("frontend/index.ts", "export {};");
      await writeFile("frontend/README.md", "# Frontend");
      await writeFile("backend/package.json", JSON.stringify({ name: "backend" }));
      await writeFile("backend/README.md", "# Backend");
      await writeFile("api/package.json", JSON.stringify({ name: "api" }));
      await writeFile("api/README.md", "# API");
      await writeFile("server/package.json", JSON.stringify({ name: "server" }));
      await writeFile("server/README.md", "# Server");
      await writeFile("client/index.ts", "export {};");
      // client has no README

      const report = await runReadinessReport({ repoPath, perArea: true });

      const areaReadme = report.criteria.find((c) => c.id === "area-readme");
      expect(areaReadme!.areaSummary!.passed).toBe(4);
      expect(areaReadme!.areaSummary!.total).toBe(5);
      expect(areaReadme!.status).toBe("pass"); // 4/5 = 80% >= 0.8
    });

    it("aggregate fails below 80% threshold", async () => {
      await writePackageJson({ name: "test-repo" });
      // 5 areas: 3 with README (60%) and 2 without
      await writeFile("frontend/index.ts", "export {};");
      await writeFile("frontend/README.md", "# Frontend");
      await writeFile("backend/package.json", JSON.stringify({ name: "backend" }));
      await writeFile("backend/README.md", "# Backend");
      await writeFile("api/package.json", JSON.stringify({ name: "api" }));
      await writeFile("api/README.md", "# API");
      await writeFile("server/package.json", JSON.stringify({ name: "server" }));
      // server has no README
      await writeFile("client/index.ts", "export {};");
      // client has no README

      const report = await runReadinessReport({ repoPath, perArea: true });

      const areaReadme = report.criteria.find((c) => c.id === "area-readme");
      expect(areaReadme!.areaSummary!.passed).toBe(3);
      expect(areaReadme!.areaSummary!.total).toBe(5);
      expect(areaReadme!.status).toBe("fail"); // 3/5 = 60% < 0.8
      expect(areaReadme!.areaFailures).toContain("server");
      expect(areaReadme!.areaFailures).toContain("client");
    });

    it("pillars reflect area aggregate results with --per-area", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("frontend/index.ts", "export {};");
      await writeFile("frontend/README.md", "# Frontend");

      const report = await runReadinessReport({ repoPath, perArea: true });

      // area-readme passes (1/1 = 100%), so documentation pillar should count it
      const docPillar = report.pillars.find((p) => p.id === "documentation");
      expect(docPillar).toBeDefined();
      const areaReadme = report.criteria.find((c) => c.id === "area-readme");
      expect(areaReadme!.status).toBe("pass");
      // Pillar should include this pass in its count
      expect(docPillar!.passed).toBeGreaterThanOrEqual(1);
    });
  });

  describe("policy integration", () => {
    it("disables a criterion via JSON policy", async () => {
      await writePackageJson({ name: "test-repo" });
      // Write a JSON policy that disables lint-config
      const policyPath = path.join(repoPath, "test-policy.json");
      await fs.writeFile(
        policyPath,
        JSON.stringify({
          name: "test-policy",
          criteria: { disable: ["lint-config"] }
        }),
        "utf8"
      );

      const report = await runReadinessReport({ repoPath, policies: [policyPath] });

      expect(report.criteria.find((c) => c.id === "lint-config")).toBeUndefined();
      expect(report.policies).toBeDefined();
      expect(report.policies!.chain).toEqual(["test-policy"]);
      expect(report.policies!.criteriaCount).toBeGreaterThan(0);
    });

    it("overrides passRate threshold via policy", async () => {
      await writePackageJson({ name: "test-repo" });
      const policyPath = path.join(repoPath, "threshold-policy.json");
      await fs.writeFile(
        policyPath,
        JSON.stringify({
          name: "strict",
          thresholds: { passRate: 1.0 }
        }),
        "utf8"
      );

      const report = await runReadinessReport({ repoPath, policies: [policyPath] });

      expect(report.policies!.chain).toEqual(["strict"]);
    });

    it("falls back to agentrc.config.json policies", async () => {
      await writePackageJson({ name: "test-repo" });
      // Write a policy file using absolute path
      const policyPath = path.join(repoPath, "config-policy.json");
      await fs.writeFile(
        policyPath,
        JSON.stringify({ name: "from-config", criteria: { disable: ["readme"] } }),
        "utf8"
      );
      // Reference it from agentrc.config.json with absolute path
      await writeFile("agentrc.config.json", JSON.stringify({ policies: [policyPath] }));

      const report = await runReadinessReport({ repoPath });

      expect(report.policies!.chain).toEqual(["from-config"]);
      expect(report.criteria.find((c) => c.id === "readme")).toBeUndefined();
    });

    it("rejects module policies from agentrc.config.json", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("agentrc.config.json", JSON.stringify({ policies: ["./my-policy.ts"] }));

      await expect(runReadinessReport({ repoPath })).rejects.toThrow(
        "only JSON policies are allowed from agentrc.config.json"
      );
    });
  });

  describe("ai-tooling pillar — APM criteria", () => {
    it("fails apm-config when apm.yml does not exist", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-config");

      expect(criterion).toBeDefined();
      expect(criterion?.status).toBe("fail");
      expect(criterion?.reason).toContain("No apm.yml found");
      expect(criterion?.pillar).toBe("ai-tooling");
    });

    it("passes apm-config when apm.yml exists", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("apm.yml", "name: test-package\nversion: 1.0.0");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-config");

      expect(criterion?.status).toBe("pass");
    });

    it("skips apm-locked-deps when apm.yml does not exist", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-locked-deps");

      expect(criterion?.status).toBe("skip");
      expect(criterion?.reason).toContain("No apm.yml found");
    });

    it("fails apm-locked-deps when apm.yml exists but no lockfile", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("apm.yml", "name: test-package\nversion: 1.0.0");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-locked-deps");

      expect(criterion?.status).toBe("fail");
      expect(criterion?.reason).toContain("dependencies are not locked");
    });

    it("passes apm-locked-deps when both apm.yml and apm.lock.yaml exist", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("apm.yml", "name: test-package\nversion: 1.0.0");
      await writeFile("apm.lock.yaml", "dependencies: {}");

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-locked-deps");

      expect(criterion?.status).toBe("pass");
    });

    it("skips apm-ci-integration when apm.yml does not exist", async () => {
      await writePackageJson({ name: "test-repo" });

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-ci-integration");

      expect(criterion?.status).toBe("skip");
    });

    it("fails apm-ci-integration when apm.yml exists but no workflow uses apm", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("apm.yml", "name: test-package\nversion: 1.0.0");
      await writeFile(
        ".github/workflows/ci.yml",
        "name: CI\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm install"
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-ci-integration");

      expect(criterion?.status).toBe("fail");
      expect(criterion?.reason).toContain("No APM step found in CI");
    });

    it("passes apm-ci-integration when apm install is in a workflow", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("apm.yml", "name: test-package\nversion: 1.0.0");
      await writeFile(
        ".github/workflows/ci.yml",
        "name: CI\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: apm install"
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-ci-integration");

      expect(criterion?.status).toBe("pass");
    });

    it("passes apm-ci-integration when apm audit is in a workflow", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("apm.yml", "name: test-package\nversion: 1.0.0");
      await writeFile(
        ".github/workflows/security.yml",
        "name: Security\njobs:\n  audit:\n    runs-on: ubuntu-latest\n    steps:\n      - run: apm audit --ci"
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-ci-integration");

      expect(criterion?.status).toBe("pass");
    });

    it("passes apm-ci-integration when microsoft/apm-action is used", async () => {
      await writePackageJson({ name: "test-repo" });
      await writeFile("apm.yml", "name: test-package\nversion: 1.0.0");
      await writeFile(
        ".github/workflows/apm.yml",
        "name: APM\njobs:\n  apm:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: microsoft/apm-action@v1"
      );

      const report = await runReadinessReport({ repoPath });
      const criterion = report.criteria.find((c) => c.id === "apm-ci-integration");

      expect(criterion?.status).toBe("pass");
    });
  });
});
