/**
 * Phase G: Compatibility adapter.
 *
 * Maps `EngineReport` from the new plugin system to the legacy
 * `ReadinessReport` shape so all existing surfaces (CLI, HTML, VS Code)
 * continue to work without changes.
 *
 * Key mapping rules:
 * - Signal metadata carries pillar/level/scope/impact/effort/checkStatus
 * - checkStatus determines ReadinessCriterionResult.status
 * - Extras are signals without pillar metadata
 * - Pillar/level summaries and achievedLevel are recomputed from criteria
 */
import type {
  ReadinessReport,
  ReadinessCriterionResult,
  ReadinessExtraResult,
  ReadinessPillarSummary,
  ReadinessLevelSummary,
  ReadinessPillar,
  ReadinessScope,
  ReadinessStatus
} from "../readiness";

import type { EngineReport, Signal, Recommendation } from "./types";

const PILLAR_NAMES: Record<ReadinessPillar, string> = {
  "style-validation": "Style & Validation",
  "build-system": "Build System",
  testing: "Testing",
  documentation: "Documentation",
  "dev-environment": "Dev Environment",
  "code-quality": "Code Quality",
  observability: "Observability",
  "security-governance": "Security & Governance",
  "workflow-automation": "Workflow Automation",
  "ai-tooling": "AI Tooling"
};

const LEVEL_NAMES: Record<number, string> = {
  1: "Functional",
  2: "Documented",
  3: "Standardized",
  4: "Optimized",
  5: "Autonomous"
};

type AdapterOptions = {
  repoPath: string;
  isMonorepo?: boolean;
  apps?: Array<{ name: string; path: string }>;
  passRateThreshold?: number;
};

/**
 * Convert an EngineReport to a legacy ReadinessReport.
 *
 * This is the bridge that lets the new plugin engine power existing
 * readiness surfaces without any surface-level changes.
 */
export function engineReportToReadiness(
  report: EngineReport,
  options: AdapterOptions
): ReadinessReport {
  const passRateThreshold = options.passRateThreshold ?? 0.8;
  const { criteria, extras } = partitionSignals(report.signals, report.recommendations);

  const pillars = summarizePillars(criteria);
  const levels = summarizeLevels(criteria, passRateThreshold);
  const achievedLevel = levels
    .filter((l) => l.achieved)
    .reduce((max, l) => Math.max(max, l.level), 0);

  return {
    repoPath: options.repoPath,
    generatedAt: new Date().toISOString(),
    isMonorepo: options.isMonorepo ?? false,
    apps: options.apps ?? [],
    pillars,
    levels,
    achievedLevel,
    criteria,
    extras,
    policies: {
      chain: report.pluginChain as string[],
      criteriaCount: criteria.length
    },
    engine: {
      signals: report.signals,
      recommendations: report.recommendations,
      policyWarnings: report.policyWarnings,
      score: report.score,
      grade: report.grade
    }
  };
}

/**
 * Partition engine signals into legacy criteria results and extra results.
 *
 * A signal is treated as a "criterion" if its metadata contains `pillar`.
 * Everything else is an "extra".
 */
function partitionSignals(
  signals: ReadonlyArray<Signal>,
  _recommendations: ReadonlyArray<Recommendation>
): { criteria: ReadinessCriterionResult[]; extras: ReadinessExtraResult[] } {
  const criteria: ReadinessCriterionResult[] = [];
  const extras: ReadinessExtraResult[] = [];

  for (const signal of signals) {
    const meta = (signal.metadata ?? {}) as Record<string, unknown>;
    if (meta.pillar) {
      criteria.push(signalToCriterion(signal, meta));
    } else {
      extras.push(signalToExtra(signal, meta));
    }
  }

  return { criteria, extras };
}

function signalToCriterion(
  signal: Signal,
  meta: Record<string, unknown>
): ReadinessCriterionResult {
  const checkStatus = meta.checkStatus as string | undefined;
  const status: ReadinessStatus =
    checkStatus === "pass" ? "pass" : checkStatus === "fail" ? "fail" : "skip";

  return {
    id: signal.id,
    title: signal.label,
    pillar: meta.pillar as ReadinessPillar,
    level: (meta.level as number) ?? 1,
    scope: (meta.scope as ReadinessScope) ?? "repo",
    impact: (meta.impact as "high" | "medium" | "low") ?? "medium",
    effort: (meta.effort as "low" | "medium" | "high") ?? "medium",
    status,
    reason: signal.reason,
    evidence: signal.evidence
  };
}

function signalToExtra(signal: Signal, meta: Record<string, unknown>): ReadinessExtraResult {
  const checkStatus = meta.checkStatus as string | undefined;
  const status: ReadinessStatus =
    checkStatus === "pass" ? "pass" : checkStatus === "fail" ? "fail" : "skip";
  return {
    id: signal.id,
    title: signal.label,
    status,
    reason: signal.reason
  };
}

function summarizePillars(criteria: ReadinessCriterionResult[]): ReadinessPillarSummary[] {
  return (Object.keys(PILLAR_NAMES) as ReadinessPillar[]).map((pillar) => {
    const items = criteria.filter((c) => c.pillar === pillar);
    const { passed, total } = countStatus(items);
    return {
      id: pillar,
      name: PILLAR_NAMES[pillar],
      passed,
      total,
      passRate: total ? passed / total : 0
    };
  });
}

function summarizeLevels(
  criteria: ReadinessCriterionResult[],
  passRateThreshold: number
): ReadinessLevelSummary[] {
  const summaries: ReadinessLevelSummary[] = [];
  for (let level = 1; level <= 5; level++) {
    const items = criteria.filter((c) => c.level === level);
    const { passed, total } = countStatus(items);
    const passRate = total ? passed / total : 0;
    summaries.push({ level, name: LEVEL_NAMES[level], passed, total, passRate, achieved: false });
  }
  for (const summary of summaries) {
    const allPrior = summaries.filter((s) => s.level <= summary.level);
    summary.achieved = allPrior.every((s) => s.total > 0 && s.passRate >= passRateThreshold);
  }
  return summaries;
}

function countStatus(items: ReadinessCriterionResult[]): { passed: number; total: number } {
  const relevant = items.filter((item) => item.status !== "skip");
  const passed = relevant.filter((item) => item.status === "pass").length;
  return { passed, total: relevant.length };
}
