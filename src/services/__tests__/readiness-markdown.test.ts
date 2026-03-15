import type { ReadinessReport } from "@agentrc/core/services/readiness";
import { describe, expect, it } from "vitest";

import { formatReadinessMarkdown } from "../../commands/readiness";

describe("formatReadinessMarkdown", () => {
  function makeReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
    return {
      repoPath: "/tmp/test-repo",
      generatedAt: "2026-01-01T00:00:00.000Z",
      isMonorepo: false,
      apps: [],
      pillars: [
        { id: "style-validation", name: "Style & Validation", passed: 2, total: 2, passRate: 1 },
        { id: "build-system", name: "Build System", passed: 1, total: 2, passRate: 0.5 },
        { id: "testing", name: "Testing", passed: 0, total: 1, passRate: 0 },
        { id: "documentation", name: "Documentation", passed: 1, total: 2, passRate: 0.5 },
        { id: "dev-environment", name: "Dev Environment", passed: 1, total: 2, passRate: 0.5 },
        { id: "code-quality", name: "Code Quality", passed: 1, total: 1, passRate: 1 },
        { id: "observability", name: "Observability", passed: 0, total: 1, passRate: 0 },
        {
          id: "security-governance",
          name: "Security & Governance",
          passed: 2,
          total: 4,
          passRate: 0.5
        },
        { id: "ai-tooling", name: "AI Tooling", passed: 1, total: 4, passRate: 0.25 }
      ],
      levels: [
        { level: 1, name: "Functional", passed: 5, total: 6, passRate: 0.83, achieved: true },
        { level: 2, name: "Documented", passed: 3, total: 6, passRate: 0.5, achieved: false },
        { level: 3, name: "Standardized", passed: 1, total: 4, passRate: 0.25, achieved: false },
        { level: 4, name: "Optimized", passed: 0, total: 0, passRate: 0, achieved: false },
        { level: 5, name: "Autonomous", passed: 0, total: 0, passRate: 0, achieved: false }
      ],
      achievedLevel: 1,
      criteria: [
        {
          id: "lint-config",
          title: "Linting configured",
          pillar: "style-validation",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          status: "pass"
        },
        {
          id: "readme",
          title: "README present",
          pillar: "documentation",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          status: "fail",
          reason: "Missing README documentation."
        },
        {
          id: "custom-instructions",
          title: "Custom instructions",
          pillar: "ai-tooling",
          level: 1,
          scope: "repo",
          impact: "high",
          effort: "low",
          status: "fail",
          reason: "Missing custom instructions."
        }
      ],
      extras: [
        { id: "agents-doc", title: "AGENTS.md present", status: "pass" },
        { id: "architecture-doc", title: "Architecture guide present", status: "fail" }
      ],
      ...overrides
    };
  }

  it("renders heading with repo name and level", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    expect(md).toContain("# Readiness Report: my-repo");
    expect(md).toContain("**Level 1** — Functional");
  });

  it("includes pillar group sections", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    expect(md).toContain("## Repo Health");
    expect(md).toContain("## AI Setup");
  });

  it("renders pillar summary table", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    expect(md).toContain("| Pillar | Passed | Total | Rate |");
    expect(md).toContain("Style & Validation");
    expect(md).toContain("AI Tooling");
  });

  it("uses check emoji for passing pillars", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    // Style & Validation has 100% pass rate
    expect(md).toMatch(/✅.*Style & Validation/);
  });

  it("uses warning emoji for low-pass pillars", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    // Build System has 50% pass rate
    expect(md).toMatch(/⚠️.*Build System/);
  });

  it("includes fix-first section for failing criteria", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    expect(md).toContain("## Fix First");
    expect(md).toContain("README present");
    expect(md).toContain("Custom instructions");
  });

  it("includes extras section", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    expect(md).toContain("## Readiness Extras");
    expect(md).toContain("✅ AGENTS.md present");
    expect(md).toContain("❌ Architecture guide present");
  });

  it("includes area breakdown when present", () => {
    const md = formatReadinessMarkdown(
      makeReport({
        areaReports: [
          {
            area: { name: "frontend", applyTo: "frontend/**", source: "auto" },
            criteria: [
              {
                id: "area-readme",
                title: "Area README present",
                pillar: "documentation",
                level: 1,
                scope: "area",
                impact: "medium",
                effort: "low",
                status: "fail",
                reason: "Missing README in area directory."
              }
            ],
            pillars: [
              {
                id: "documentation",
                name: "Documentation",
                passed: 0,
                total: 1,
                passRate: 0
              }
            ]
          }
        ]
      }),
      "my-repo"
    );
    expect(md).toContain("## Per-Area Breakdown");
    expect(md).toContain("### frontend");
    expect(md).toContain("❌ Area README present");
  });

  it("includes agentrc footer with timestamp", () => {
    const md = formatReadinessMarkdown(makeReport(), "my-repo");
    expect(md).toContain("AgentRC");
    expect(md).toContain("2026-01-01");
  });

  it("handles report with no failing criteria", () => {
    const md = formatReadinessMarkdown(
      makeReport({
        criteria: [
          {
            id: "lint-config",
            title: "Linting configured",
            pillar: "style-validation",
            level: 1,
            scope: "repo",
            impact: "high",
            effort: "low",
            status: "pass"
          }
        ]
      }),
      "my-repo"
    );
    expect(md).not.toContain("## Fix First");
  });
});
