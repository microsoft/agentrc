import path from "path";

import { safeReadDir, readJson } from "../../utils/fs";
import { analyzeRepo, loadAgentrcConfig } from "../analyzer";
import type { ExtraDefinition, PolicyConfig } from "../policy";
import { loadPolicy, resolveChain } from "../policy";
import { executePlugins } from "../policy/engine";
import { loadPluginChain } from "../policy/loader";
import type { PolicyContext } from "../policy/types";
import { isNativePlugin } from "../policy/types";

import { parseVscodeLocations } from "./checkers";
import { buildCriteria } from "./criteria";
import { buildExtras, runExtras } from "./extras";
import { summarizePillars, summarizeLevels } from "./scoring";
import type {
  ReadinessContext,
  ReadinessCriterion,
  ReadinessCriterionResult,
  ReadinessReport,
  ReadinessStatus,
  AreaReadinessReport
} from "./types";

// ── Re-exports: keep the public API surface identical ──
export type {
  ReadinessPillar,
  PillarGroup,
  ReadinessScope,
  ReadinessStatus,
  ReadinessCriterionResult,
  ReadinessExtraResult,
  ReadinessPillarSummary,
  ReadinessLevelSummary,
  AreaReadinessReport,
  ReadinessReport,
  ReadinessContext,
  ReadinessCriterion,
  CheckResult,
  InstructionConsistencyResult,
  VscodeLocationSettings
} from "./types";
export { PILLAR_GROUPS, PILLAR_GROUP_NAMES } from "./types";
export { groupPillars, getLevelName, getLevelDescription } from "./scoring";
export { buildCriteria } from "./criteria";
export { buildExtras } from "./extras";
export { contentSimilarity, checkInstructionConsistency } from "./checkers";

type ReadinessOptions = {
  repoPath: string;
  includeExtras?: boolean;
  perArea?: boolean;
  policies?: string[];
  shadow?: boolean;
};

export async function runReadinessReport(options: ReadinessOptions): Promise<ReadinessReport> {
  const repoPath = options.repoPath;
  const analysis = await analyzeRepo(repoPath);
  const rootFiles = await safeReadDir(repoPath);
  const rootPackageJson = await readJson(path.join(repoPath, "package.json"));
  const apps = analysis.apps?.length ? analysis.apps : [];
  const vscodeLocations = await parseVscodeLocations(repoPath, rootFiles);

  const context: ReadinessContext = {
    repoPath,
    analysis,
    apps,
    rootFiles,
    rootPackageJson,
    vscodeLocations
  };

  // ── Policy resolution ──
  let policySources = options.policies;
  let isConfigSourced = false;
  if (!policySources?.length) {
    const agentrcConfig = await loadAgentrcConfig(repoPath);
    if (agentrcConfig?.policies?.length) {
      policySources = agentrcConfig.policies;
      isConfigSourced = true;
    }
  }

  const baseCriteria = buildCriteria();
  const baseExtras = buildExtras();
  let resolvedCriteria: ReadinessCriterion[];
  let resolvedExtras: ExtraDefinition[];
  let passRateThreshold = 0.8;
  let policyInfo: { chain: string[]; criteriaCount: number } | undefined;

  if (policySources?.length) {
    const policyConfigs: PolicyConfig[] = [];
    for (const source of policySources) {
      const loaded = await loadPolicy(source, { jsonOnly: isConfigSourced });
      // Native PolicyPlugin exports require the engine path (loadPluginChain + executePlugins).
      // The legacy resolveChain path only supports PolicyConfig objects.
      if (isNativePlugin(loaded)) {
        throw new Error(
          `Policy "${source}" exports a native PolicyPlugin and cannot be used with the legacy criteria path. ` +
            `Native plugins are supported through the plugin engine — this is an internal error.`
        );
      }
      policyConfigs.push(loaded);
    }
    const resolved = resolveChain(baseCriteria, baseExtras, policyConfigs);
    resolvedCriteria = resolved.criteria;
    resolvedExtras = resolved.extras;
    passRateThreshold = resolved.thresholds.passRate;
    policyInfo = { chain: resolved.chain, criteriaCount: resolved.criteria.length };
  } else {
    resolvedCriteria = baseCriteria;
    resolvedExtras = baseExtras;
  }

  const criteriaResults: ReadinessCriterionResult[] = [];

  for (const criterion of resolvedCriteria) {
    if (criterion.scope === "repo") {
      const result = await criterion.check(context);
      criteriaResults.push({
        id: criterion.id,
        title: criterion.title,
        pillar: criterion.pillar,
        level: criterion.level,
        scope: criterion.scope,
        impact: criterion.impact,
        effort: criterion.effort,
        status: result.status,
        reason: result.reason,
        evidence: result.evidence
      });
      continue;
    }

    if (criterion.scope === "area") {
      if (!options.perArea) continue;
      const areas = analysis.areas ?? [];
      if (areas.length === 0) continue;
      criteriaResults.push({
        id: criterion.id,
        title: criterion.title,
        pillar: criterion.pillar,
        level: criterion.level,
        scope: criterion.scope,
        impact: criterion.impact,
        effort: criterion.effort,
        status: "skip",
        reason: "Run with --per-area for area breakdown."
      });
      continue;
    }

    const appResults = await Promise.all(
      apps.map(async (app) => ({
        app,
        result: await criterion.check(context, app)
      }))
    );

    if (!appResults.length) {
      criteriaResults.push({
        id: criterion.id,
        title: criterion.title,
        pillar: criterion.pillar,
        level: criterion.level,
        scope: criterion.scope,
        impact: criterion.impact,
        effort: criterion.effort,
        status: "skip",
        reason: "No application packages detected."
      });
      continue;
    }

    const passed = appResults.filter((entry) => entry.result.status === "pass").length;
    const total = appResults.length;
    const passRate = total ? passed / total : 0;
    const status: ReadinessStatus = passRate >= passRateThreshold ? "pass" : "fail";
    const failures = appResults
      .filter((entry) => entry.result.status !== "pass")
      .map((entry) => entry.app.name);

    criteriaResults.push({
      id: criterion.id,
      title: criterion.title,
      pillar: criterion.pillar,
      level: criterion.level,
      scope: criterion.scope,
      impact: criterion.impact,
      effort: criterion.effort,
      status,
      reason: status === "pass" ? undefined : `Only ${passed}/${total} apps pass this check.`,
      passRate,
      appSummary: { passed, total },
      appFailures: failures
    });
  }

  // Per-area breakdown
  let areaReports: AreaReadinessReport[] | undefined;
  const areas = analysis.areas ?? [];

  if (options.perArea && areas.length > 0) {
    const areaCriteria = resolvedCriteria.filter((c) => c.scope === "area");
    areaReports = [];

    for (const area of areas) {
      if (!area.path) continue;
      const areaFiles = await safeReadDir(area.path);
      const areaContext: ReadinessContext = {
        ...context,
        areaPath: area.path,
        areaFiles
      };

      const areaResults: ReadinessCriterionResult[] = [];
      for (const criterion of areaCriteria) {
        const result = await criterion.check(areaContext, undefined, area);
        areaResults.push({
          id: criterion.id,
          title: criterion.title,
          pillar: criterion.pillar,
          level: criterion.level,
          scope: criterion.scope,
          impact: criterion.impact,
          effort: criterion.effort,
          status: result.status,
          reason: result.reason,
          evidence: result.evidence
        });
      }

      const areaPillars = summarizePillars(areaResults);
      areaReports.push({ area, criteria: areaResults, pillars: areaPillars });
    }

    // Update aggregate area criteria in main results
    for (const criterion of criteriaResults) {
      if (criterion.scope !== "area") continue;
      const perAreaResults = areaReports
        .map((ar) => ar.criteria.find((c) => c.id === criterion.id))
        .filter(Boolean) as ReadinessCriterionResult[];
      if (!perAreaResults.length) continue;

      const passed = perAreaResults.filter((r) => r.status === "pass").length;
      const total = perAreaResults.length;
      const passRate = total ? passed / total : 0;
      criterion.status = passRate >= passRateThreshold ? "pass" : "fail";
      criterion.reason =
        criterion.status === "pass" ? undefined : `Only ${passed}/${total} areas pass this check.`;
      criterion.passRate = passRate;
      criterion.areaSummary = { passed, total };
      criterion.areaFailures = areaReports
        .filter((ar) => ar.criteria.find((c) => c.id === criterion.id)?.status !== "pass")
        .map((ar) => ar.area.name);
    }
  }

  // Compute summaries after area aggregation so they reflect final statuses
  const pillars = summarizePillars(criteriaResults);
  const levels = summarizeLevels(criteriaResults, passRateThreshold);
  const achievedLevel = levels
    .filter((level) => level.achieved)
    .reduce((acc, level) => Math.max(acc, level.level), 0);

  const extras = options.includeExtras === false ? [] : await runExtras(context, resolvedExtras);

  // ── Plugin engine: run shadow comparison when opts.shadow is enabled ──
  let engine: ReadinessReport["engine"];
  if (options.shadow) {
    const policyCtx: PolicyContext = {
      repoPath,
      rootFiles,
      rootPackageJson,
      cache: new Map(),
      analysis,
      apps
    };
    const engineChain = await loadPluginChain(policySources ?? [], { jsonOnly: isConfigSourced });
    const engineReport = await executePlugins(engineChain.plugins, policyCtx, engineChain.options);
    engine = {
      signals: engineReport.signals,
      recommendations: engineReport.recommendations,
      policyWarnings: engineReport.policyWarnings,
      score: engineReport.score,
      grade: engineReport.grade
    };
  }

  return {
    repoPath,
    generatedAt: new Date().toISOString(),
    isMonorepo: analysis.isMonorepo ?? false,
    apps: apps.map((app) => ({ name: app.name, path: app.path })),
    pillars,
    levels,
    achievedLevel,
    criteria: criteriaResults,
    extras,
    areaReports,
    policies: policyInfo,
    engine
  };
}
