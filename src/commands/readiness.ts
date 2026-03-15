import path from "path";

import { parsePolicySources } from "@agentrc/core/services/policy";
import type {
  ReadinessReport,
  ReadinessCriterionResult,
  AreaReadinessReport,
  ReadinessPillarSummary
} from "@agentrc/core/services/readiness";
import { runReadinessReport, groupPillars } from "@agentrc/core/services/readiness";
import { generateVisualReport } from "@agentrc/core/services/visualReport";
import { safeWriteFile } from "@agentrc/core/utils/fs";
import type { CommandResult } from "@agentrc/core/utils/output";
import { outputResult, outputError, shouldLog } from "@agentrc/core/utils/output";
import chalk from "chalk";

type ReadinessOptions = {
  json?: boolean;
  quiet?: boolean;
  output?: string;
  force?: boolean;
  visual?: boolean;
  perArea?: boolean;
  policy?: string;
  failLevel?: string;
};

export async function readinessCommand(
  repoPathArg: string | undefined,
  options: ReadinessOptions
): Promise<void> {
  const repoPath = path.resolve(repoPathArg ?? process.cwd());
  const repoName = path.basename(repoPath);
  const resolvedOutputPath = options.output ? path.resolve(options.output) : "";
  const outputExt = options.output ? path.extname(options.output).toLowerCase() : "";
  let failLevelError: string | undefined;

  let report: ReadinessReport;
  try {
    const policies = parsePolicySources(options.policy);
    report = await runReadinessReport({ repoPath, perArea: options.perArea, policies });
  } catch (error) {
    outputError(
      `Failed to generate readiness report: ${error instanceof Error ? error.message : String(error)}`,
      Boolean(options.json)
    );
    return;
  }

  // Check --fail-level threshold early so it applies regardless of output format
  const failLevel = Number.parseInt(options.failLevel ?? "", 10);
  if (Number.isFinite(failLevel)) {
    const clamped = Math.max(1, Math.min(5, failLevel));
    if (clamped !== failLevel && shouldLog(options)) {
      process.stderr.write(`Warning: --fail-level clamped to ${clamped} (valid range: 1–5)\n`);
    }
    if ((report.achievedLevel ?? 0) < clamped) {
      failLevelError = `Readiness level ${report.achievedLevel ?? 0} is below threshold ${clamped}`;
      if (shouldLog(options)) {
        process.stderr.write(`Error: ${failLevelError}\n`);
      }
      process.exitCode = 1;
    }
  }

  const jsonResult: CommandResult<ReadinessReport> = failLevelError
    ? {
        ok: false,
        status: "error",
        data: report,
        errors: [failLevelError]
      }
    : {
        ok: true,
        status: "success",
        data: report
      };
  const emitJsonResult = (): void => outputResult(jsonResult, true);

  // Validate output extension early, before any output branch
  if (options.output) {
    if (outputExt !== ".json" && outputExt !== ".md" && outputExt !== ".html") {
      outputError(
        `Unsupported output format: ${outputExt || "(no extension)"}. Use .json, .md, or .html`,
        Boolean(options.json)
      );
      return;
    }
  }

  if (options.visual && outputExt && outputExt !== ".html") {
    outputError(
      `Cannot use --visual with ${outputExt} output. Use a .html output path or omit --output.`,
      Boolean(options.json)
    );
    return;
  }

  // Generate visual HTML report
  if (options.visual || outputExt === ".html") {
    const html = generateVisualReport({
      reports: [{ repo: repoName, report }],
      title: `Readiness Report: ${repoName}`,
      generatedAt: new Date().toISOString()
    });

    const outputPath = options.output
      ? resolvedOutputPath
      : path.join(repoPath, "readiness-report.html");

    const { wrote, reason } = await safeWriteFile(outputPath, html, Boolean(options.force));
    if (!wrote) {
      const why = reason === "symlink" ? "path is a symlink" : "file exists (use --force)";
      outputError(`Skipped ${outputPath}: ${why}`, Boolean(options.json));
      return;
    }
    if (shouldLog(options)) {
      process.stderr.write(chalk.green(`✓ Visual report generated: ${outputPath}`) + "\n");
    }
    if (options.json) {
      emitJsonResult();
    }
    return;
  }

  // Output to Markdown file
  if (outputExt === ".md") {
    const md = formatReadinessMarkdown(report, repoName);
    const { wrote, reason } = await safeWriteFile(resolvedOutputPath, md, Boolean(options.force));
    if (!wrote) {
      const why = reason === "symlink" ? "path is a symlink" : "file exists (use --force)";
      outputError(`Skipped ${resolvedOutputPath}: ${why}`, Boolean(options.json));
      return;
    }
    if (shouldLog(options)) {
      process.stderr.write(chalk.green(`✓ Markdown report saved: ${resolvedOutputPath}`) + "\n");
    }
    if (options.json) {
      emitJsonResult();
    }
    return;
  }

  // Output to JSON file
  if (outputExt === ".json") {
    const { wrote, reason } = await safeWriteFile(
      resolvedOutputPath,
      JSON.stringify(report, null, 2),
      Boolean(options.force)
    );
    if (!wrote) {
      const why = reason === "symlink" ? "path is a symlink" : "file exists (use --force)";
      outputError(`Skipped ${resolvedOutputPath}: ${why}`, Boolean(options.json));
      return;
    }
    if (shouldLog(options)) {
      process.stderr.write(chalk.green(`✓ JSON report saved: ${resolvedOutputPath}`) + "\n");
    }
    if (options.json) {
      emitJsonResult();
    }
    return;
  }

  if (options.json) {
    emitJsonResult();
    return;
  }

  if (shouldLog(options)) {
    printReadinessChecklist(report);
  }
}

function printReadinessChecklist(report: ReadinessReport): void {
  const log = (msg: string) => process.stderr.write(msg + "\n");
  log(chalk.bold("Readiness report"));
  log(`- Repo: ${report.repoPath}`);
  log(
    `- Monorepo: ${report.isMonorepo ? "yes" : "no"}${report.apps.length ? ` (${report.apps.length} apps)` : ""}`
  );
  log(`- Level: ${report.achievedLevel ?? 1} (${levelName(report.achievedLevel ?? 1)})`);

  const groups = groupPillars(report.pillars);
  for (const { label, pillars } of groups) {
    if (pillars.length === 0) continue;
    log(chalk.bold(`\n${label}`));
    for (const pillar of pillars) {
      const rate = formatPercent(pillar.passRate);
      const icon = pillar.passRate >= 0.8 ? chalk.green("●") : chalk.yellow("●");
      log(`${icon} ${pillar.name}: ${pillar.passed}/${pillar.total} (${rate})`);
    }
  }

  log(chalk.bold("\nFix first"));
  const fixes = rankFixes(report.criteria);
  if (!fixes.length) {
    log(chalk.green("✔ No failing criteria detected."));
  } else {
    for (const fix of fixes) {
      const impact = colorImpact(fix.impact);
      const effort = colorEffort(fix.effort);
      const scope = fix.scope === "app" ? "app" : "repo";
      const detail = fix.appSummary
        ? ` (${fix.appSummary.passed}/${fix.appSummary.total} apps)`
        : "";
      log(`- ${impact} impact / ${effort} effort • ${fix.title}${detail} [${scope}]`);
      if (fix.reason) {
        log(`  ${chalk.dim(fix.reason)}`);
      }
      if (fix.appFailures?.length) {
        log(`  ${chalk.dim(`Apps: ${fix.appFailures.join(", ")}`)}`);
      }
    }
  }

  if (report.extras.length) {
    log(chalk.bold("\nReadiness extras"));
    for (const extra of report.extras) {
      const icon = extra.status === "pass" ? chalk.green("✔") : chalk.red("✖");
      log(`${icon} ${extra.title}`);
    }
  }

  if (report.areaReports?.length) {
    printAreaBreakdown(report.areaReports);
  }
}

function rankFixes(criteria: ReadinessCriterionResult[]): ReadinessCriterionResult[] {
  return criteria
    .filter((criterion) => criterion.status === "fail")
    .sort((a, b) => {
      const impactDelta = impactWeight(b.impact) - impactWeight(a.impact);
      if (impactDelta !== 0) return impactDelta;
      return effortWeight(a.effort) - effortWeight(b.effort);
    });
}

function impactWeight(value: "high" | "medium" | "low"): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function effortWeight(value: "low" | "medium" | "high"): number {
  if (value === "low") return 1;
  if (value === "medium") return 2;
  return 3;
}

function colorImpact(value: "high" | "medium" | "low"): string {
  if (value === "high") return chalk.red("High");
  if (value === "medium") return chalk.yellow("Medium");
  return chalk.green("Low");
}

function colorEffort(value: "low" | "medium" | "high"): string {
  if (value === "high") return chalk.red("High");
  if (value === "medium") return chalk.yellow("Medium");
  return chalk.green("Low");
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function levelName(level: number): string {
  if (level === 2) return "Documented";
  if (level === 3) return "Standardized";
  if (level === 4) return "Optimized";
  if (level === 5) return "Autonomous";
  return "Functional";
}

function printAreaBreakdown(areaReports: AreaReadinessReport[]): void {
  const log = (msg: string) => process.stderr.write(msg + "\n");
  log(chalk.bold("\nPer-area breakdown"));
  for (const ar of areaReports) {
    // Sum across all pillar summaries for this area
    const passed = ar.pillars.reduce((sum, p) => sum + p.passed, 0);
    const total = ar.pillars.reduce((sum, p) => sum + p.total, 0);
    const pct = total ? Math.round((passed / total) * 100) : 0;
    const icon = total > 0 && passed / total >= 0.8 ? chalk.green("●") : chalk.yellow("●");
    const source = ar.area.source === "config" ? chalk.dim(" (config)") : "";
    log(`${icon} ${ar.area.name}${source}: ${passed}/${total} (${pct}%)`);

    const failures = ar.criteria.filter((c) => c.status === "fail");
    for (const f of failures) {
      log(`  ${chalk.red("✖")} ${f.title}${f.reason ? ` — ${chalk.dim(f.reason)}` : ""}`);
    }
  }
}

export function formatReadinessMarkdown(report: ReadinessReport, repoName: string): string {
  const lines: string[] = [];

  lines.push(`# Readiness Report: ${repoName}`);
  lines.push("");
  lines.push(`**Level ${report.achievedLevel}** — ${levelName(report.achievedLevel)}`);
  lines.push("");

  // Pillar summary table
  const groups = groupPillars(report.pillars);
  for (const { label, pillars } of groups) {
    if (pillars.length === 0) continue;
    lines.push(`## ${label}`);
    lines.push("");
    lines.push("| Pillar | Passed | Total | Rate |");
    lines.push("| --- | ---: | ---: | ---: |");
    for (const pillar of pillars) {
      const icon = pillar.passRate >= 0.8 ? "✅" : "⚠️";
      lines.push(
        `| ${icon} ${pillar.name} | ${pillar.passed} | ${pillar.total} | ${formatPercent(pillar.passRate)} |`
      );
    }
    lines.push("");
  }

  // Fix-first list
  const fixes = rankFixes(report.criteria);
  if (fixes.length > 0) {
    lines.push("## Fix First");
    lines.push("");
    for (const fix of fixes) {
      const detail = fix.appSummary
        ? ` (${fix.appSummary.passed}/${fix.appSummary.total} apps)`
        : "";
      lines.push(`- **${fix.title}**${detail} — ${fix.impact} impact, ${fix.effort} effort`);
      if (fix.reason) {
        lines.push(`  - ${fix.reason}`);
      }
    }
    lines.push("");
  }

  // Extras
  if (report.extras.length > 0) {
    lines.push("## Readiness Extras");
    lines.push("");
    for (const extra of report.extras) {
      const icon = extra.status === "pass" ? "✅" : "❌";
      lines.push(`- ${icon} ${extra.title}`);
    }
    lines.push("");
  }

  // Area breakdown
  if (report.areaReports?.length) {
    lines.push("## Per-Area Breakdown");
    lines.push("");
    for (const ar of report.areaReports) {
      const passed = ar.pillars.reduce(
        (sum: number, p: ReadinessPillarSummary) => sum + p.passed,
        0
      );
      const total = ar.pillars.reduce((sum: number, p: ReadinessPillarSummary) => sum + p.total, 0);
      const pct = total ? Math.round((passed / total) * 100) : 0;
      lines.push(`### ${ar.area.name} — ${passed}/${total} (${pct}%)`);
      lines.push("");
      const failures = ar.criteria.filter((c) => c.status === "fail");
      if (failures.length > 0) {
        for (const f of failures) {
          lines.push(`- ❌ ${f.title}${f.reason ? ` — ${f.reason}` : ""}`);
        }
      } else {
        lines.push("All criteria passing.");
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(
    `*Generated by [AgentRC](https://github.com/microsoft/agentrc) on ${report.generatedAt}*`
  );
  lines.push("");

  return lines.join("\n");
}
