/**
 * Phase C: Characterization baselines.
 *
 * These tests lock the existing ReadinessReport shape, pillar/level summaries,
 * and command output behavior. They serve as the parity gate before the new
 * plugin engine is wired into the readiness pipeline (Phase G).
 *
 * If any of these fail after engine integration, the compatibility adapter
 * is incorrect or incomplete.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  runReadinessReport,
  buildCriteria,
  buildExtras,
  groupPillars
} from "@agentrc/core/services/readiness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ReadinessReport shape baseline", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-baseline-"));
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name: "baseline-repo", scripts: { build: "tsc", test: "vitest" } })
    );
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("locks the top-level report fields", async () => {
    const report = await runReadinessReport({ repoPath });
    const keys = Object.keys(report).sort();
    expect(keys).toEqual([
      "achievedLevel",
      "apps",
      "areaReports",
      "criteria",
      "engine",
      "extras",
      "generatedAt",
      "isMonorepo",
      "levels",
      "pillars",
      "policies",
      "repoPath"
    ]);
  });

  it("locks ReadinessCriterionResult field set", async () => {
    const report = await runReadinessReport({ repoPath });
    const criterion = report.criteria[0];
    expect(criterion).toHaveProperty("id");
    expect(criterion).toHaveProperty("title");
    expect(criterion).toHaveProperty("pillar");
    expect(criterion).toHaveProperty("level");
    expect(criterion).toHaveProperty("scope");
    expect(criterion).toHaveProperty("impact");
    expect(criterion).toHaveProperty("effort");
    expect(criterion).toHaveProperty("status");
  });

  it("locks pillar summary fields", async () => {
    const report = await runReadinessReport({ repoPath });
    const pillar = report.pillars[0];
    expect(pillar).toHaveProperty("id");
    expect(pillar).toHaveProperty("name");
    expect(pillar).toHaveProperty("passed");
    expect(pillar).toHaveProperty("total");
    expect(pillar).toHaveProperty("passRate");
  });

  it("locks level summary fields", async () => {
    const report = await runReadinessReport({ repoPath });
    const level = report.levels[0];
    expect(level).toHaveProperty("level");
    expect(level).toHaveProperty("name");
    expect(level).toHaveProperty("passed");
    expect(level).toHaveProperty("total");
    expect(level).toHaveProperty("passRate");
    expect(level).toHaveProperty("achieved");
  });

  it("locks the allowed ReadinessStatus values", async () => {
    const report = await runReadinessReport({ repoPath });
    const statuses = new Set(report.criteria.map((c) => c.status));
    // Every status must be one of the 3 allowed values
    for (const status of statuses) {
      expect(["pass", "fail", "skip"]).toContain(status);
    }
  });

  it("locks the 9 pillar IDs", async () => {
    const report = await runReadinessReport({ repoPath });
    const pillarIds = report.pillars.map((p) => p.id).sort();
    expect(pillarIds).toEqual([
      "ai-tooling",
      "build-system",
      "code-quality",
      "dev-environment",
      "documentation",
      "observability",
      "security-governance",
      "style-validation",
      "testing"
    ]);
  });

  it("locks the 5 maturity level names", async () => {
    const report = await runReadinessReport({ repoPath });
    const levelNames = report.levels.map((l) => l.name);
    expect(levelNames).toEqual([
      "Functional",
      "Documented",
      "Standardized",
      "Optimized",
      "Autonomous"
    ]);
  });
});

describe("countStatus baseline", () => {
  it("excludes skip items from total and passed counts", async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-cs-"));
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "count-repo" }));

    try {
      const report = await runReadinessReport({ repoPath });
      // Verify skips don't inflate totals
      for (const pillar of report.pillars) {
        const criteria = report.criteria.filter((c) => c.pillar === pillar.id);
        const nonSkip = criteria.filter((c) => c.status !== "skip");
        expect(pillar.total).toBe(nonSkip.length);
      }
    } finally {
      await fs.rm(repoPath, { recursive: true, force: true });
    }
  });
});

describe("groupPillars baseline", () => {
  it("groups pillars into repo-health and ai-setup", async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-gp-"));
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "group-repo" }));

    try {
      const report = await runReadinessReport({ repoPath });
      const groups = groupPillars(report.pillars);
      expect(groups).toHaveLength(2);
      expect(groups[0].group).toBe("repo-health");
      expect(groups[0].label).toBe("Repo Health");
      expect(groups[1].group).toBe("ai-setup");
      expect(groups[1].label).toBe("AI Setup");
      // ai-tooling pillar is in the ai-setup group
      expect(groups[1].pillars.map((p) => p.id)).toContain("ai-tooling");
    } finally {
      await fs.rm(repoPath, { recursive: true, force: true });
    }
  });
});

describe("buildCriteria baseline", () => {
  it("locks the set of built-in criterion IDs", () => {
    const criteria = buildCriteria();
    const ids = criteria.map((c) => c.id).sort();
    expect(ids).toEqual([
      "apm-ci-integration",
      "apm-config",
      "apm-locked-deps",
      "area-build-script",
      "area-instructions",
      "area-readme",
      "area-test-script",
      "build-script",
      "ci-config",
      "codeowners",
      "contributing",
      "copilot-skills",
      "custom-agents",
      "custom-instructions",
      "dependabot",
      "env-example",
      "format-config",
      "instructions-consistency",
      "license",
      "lint-config",
      "lockfile",
      "mcp-config",
      "observability",
      "readme",
      "security-policy",
      "test-script",
      "typecheck-config"
    ]);
  });

  it("locks the impact and effort allowed values", () => {
    const criteria = buildCriteria();
    for (const c of criteria) {
      expect(["high", "medium", "low"]).toContain(c.impact);
      expect(["low", "medium", "high"]).toContain(c.effort);
    }
  });
});

describe("buildExtras baseline", () => {
  it("locks the set of built-in extra IDs", () => {
    const extras = buildExtras();
    const ids = extras.map((e) => e.id).sort();
    expect(ids).toEqual(["agents-doc", "architecture-doc", "pr-template", "pre-commit"]);
  });
});
