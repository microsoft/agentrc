import type { ReadinessReport } from "@agentrc/core/services/readiness";
import { generateVisualReport } from "@agentrc/core/services/visualReport";
import { describe, expect, it } from "vitest";

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
        status: "pass"
      },
      {
        id: "custom-instructions",
        title: "Custom instructions",
        pillar: "ai-tooling",
        level: 1,
        scope: "repo",
        impact: "high",
        effort: "low",
        status: "pass"
      },
      {
        id: "mcp-config",
        title: "MCP config present",
        pillar: "ai-tooling",
        level: 2,
        scope: "repo",
        impact: "high",
        effort: "low",
        status: "fail",
        reason: "Missing MCP config."
      }
    ],
    extras: [],
    ...overrides
  };
}

describe("generateVisualReport", () => {
  it("returns valid HTML", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes the report title", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }],
      title: "My Custom Report"
    });

    expect(html).toContain("My Custom Report");
  });

  it("includes repo name", () => {
    const html = generateVisualReport({
      reports: [{ repo: "my-repo", report: makeReport() }]
    });

    expect(html).toContain("my-repo");
  });

  it("includes pillar names", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain("Style &amp; Validation");
    expect(html).toContain("Build System");
    expect(html).toContain("AI Tooling");
  });

  it("includes maturity level badge", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport({ achievedLevel: 2 }) }]
    });

    expect(html).toContain("Level 2:");
    expect(html).toContain("Documented");
  });

  it("includes AI Tooling Readiness hero section", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain("AI Tooling Readiness");
  });

  it("includes maturity model descriptions", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain("Functional");
    expect(html).toContain("Documented");
    expect(html).toContain("Standardized");
    expect(html).toContain("Optimized");
    expect(html).toContain("Autonomous");
  });

  it("includes theme toggle", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain("toggleTheme");
    expect(html).toContain("data-theme");
  });

  it("includes light theme CSS variables", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain('[data-theme="light"]');
    expect(html).toContain('[data-theme="dark"]');
  });

  it("includes GitHub logo SVG", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain("header-logo");
    expect(html).toContain("<svg");
  });

  it("shows error repos", () => {
    const html = generateVisualReport({
      reports: [
        { repo: "good-repo", report: makeReport() },
        { repo: "bad-repo", report: makeReport(), error: "Clone failed" }
      ]
    });

    expect(html).toContain("bad-repo");
    expect(html).toContain("Clone failed");
  });

  it("shows summary cards with correct counts", () => {
    const html = generateVisualReport({
      reports: [
        { repo: "repo-1", report: makeReport() },
        { repo: "repo-2", report: makeReport() }
      ]
    });

    // Total repos should be 2
    expect(html).toContain(">2<");
  });

  it("includes top fixes for failing criteria", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).toContain("Fix First");
    expect(html).toContain("MCP config present");
  });

  it("shows all criteria passing when all pass", () => {
    const report = makeReport({
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
    });

    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report }]
    });

    expect(html).toContain("All Checks Passing");
  });

  it("escapes HTML in repo names", () => {
    const html = generateVisualReport({
      reports: [{ repo: '<script>alert("xss")</script>', report: makeReport() }]
    });

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders per-area breakdown when areaReports provided", () => {
    const report = makeReport({
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
              status: "pass"
            },
            {
              id: "area-build-script",
              title: "Area build script present",
              pillar: "build-system",
              level: 1,
              scope: "area",
              impact: "high",
              effort: "low",
              status: "fail",
              reason: "Missing build script in area."
            }
          ],
          pillars: []
        },
        {
          area: {
            name: "backend",
            applyTo: "backend/**",
            source: "config",
            description: "API layer"
          },
          criteria: [
            {
              id: "area-readme",
              title: "Area README present",
              pillar: "documentation",
              level: 1,
              scope: "area",
              impact: "medium",
              effort: "low",
              status: "pass"
            }
          ],
          pillars: []
        }
      ]
    });

    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report }]
    });

    expect(html).toContain("Per-Area Breakdown");
    expect(html).toContain("frontend");
    expect(html).toContain("backend");
    expect(html).toContain("frontend/**");
    expect(html).toContain("backend/**");
    expect(html).toContain("auto");
    expect(html).toContain("config");
    expect(html).toContain("Pass");
    expect(html).toContain("Fail");
  });

  it("does not render area section when no areaReports", () => {
    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report: makeReport() }]
    });

    expect(html).not.toContain("Per-Area Breakdown");
  });

  it("escapes HTML in area names", () => {
    const report = makeReport({
      areaReports: [
        {
          area: { name: '<img onerror="alert(1)">', applyTo: "x/**", source: "auto" },
          criteria: [],
          pillars: []
        }
      ]
    });

    const html = generateVisualReport({
      reports: [{ repo: "test-repo", report }]
    });

    expect(html).not.toContain('<img onerror="alert(1)">');
    expect(html).toContain("&lt;img");
  });
});
