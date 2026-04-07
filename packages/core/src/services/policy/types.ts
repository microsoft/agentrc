// ─── Signal & Recommendation Types ───
// Core types for the unified plugin policy system.
// Both imperative hook plugins and declarative JSON policies compile to
// the same runtime contract via these types.

import type { RepoAnalysis, RepoApp } from "../analyzer";

/** Classification of what a signal detects. */
export type SignalKind = "file" | "setting" | "mcp-server" | "model-config" | "git" | "custom";

/** Result status of a signal detection. */
export type SignalStatus = "detected" | "not-detected" | "error";

/** Tracks which plugin created or modified a signal/recommendation. */
export type Provenance = {
  addedBy: string;
  modifiedBy?: string[];
};

/** A single detection emitted by a detector. */
export type Signal = {
  id: string;
  kind: SignalKind;
  status: SignalStatus;
  label: string;
  evidence?: string[];
  reason?: string;
  origin: Provenance;
  metadata?: Record<string, unknown>;
};

/** Impact level for a recommendation. */
export type RecommendationImpact = "critical" | "high" | "medium" | "low" | "info";

/** An actionable recommendation derived from signals. */
export type Recommendation = {
  id: string;
  signalId: string;
  impact: RecommendationImpact;
  message: string;
  origin: Provenance;
  supersedes?: string[];
  metadata?: Record<string, unknown>;
};

/** A warning emitted during policy execution (non-fatal). */
export type PolicyWarning = {
  pluginName: string;
  stage: PluginStage;
  message: string;
};

// ─── Patch types for immutable hook returns ───

export type SignalPatch = {
  add?: Signal[];
  remove?: string[];
  modify?: Array<{ id: string; changes: Partial<Omit<Signal, "id" | "origin">> }>;
};

export type RecommendationPatch = {
  add?: Recommendation[];
  remove?: string[];
  modify?: Array<{ id: string; changes: Partial<Omit<Recommendation, "id" | "origin">> }>;
};

// ─── Plugin lifecycle ───

export type PluginStage =
  | "detect"
  | "afterDetect"
  | "beforeRecommend"
  | "recommend"
  | "afterRecommend";

/** Read-only context available to all plugin lifecycle stages. */
export type PolicyContext = {
  repoPath: string;
  rootFiles: string[];
  rootPackageJson?: Record<string, unknown>;
  /** Shared key-value cache scoped to a single engine run. */
  cache: Map<string, unknown>;
  /** Full repo analysis, populated when running inside the readiness engine. */
  analysis?: RepoAnalysis;
  /** Detected repo apps, populated when running inside the readiness engine. */
  apps?: RepoApp[];
};

/** A detector emits signals about the state of a repository. */
export type Detector = {
  id: string;
  kind: SignalKind;
  detect: (ctx: PolicyContext) => Promise<Signal | Signal[]>;
};

/** A recommender emits actionable recommendations based on signals. */
export type Recommender = {
  id: string;
  recommend: (
    signals: ReadonlyArray<Signal>,
    ctx: PolicyContext
  ) => Promise<Recommendation | Recommendation[]>;
};

/** Trust tier determines what a plugin is allowed to do. */
export type PluginTrust = "trusted-code" | "safe-declarative";

/** Source type of the plugin. */
export type PluginSourceType = "module" | "json" | "builtin";

/** Metadata describing a plugin. */
export type PluginMeta = {
  name: string;
  version?: string;
  /** Semver range of engine versions this plugin is compatible with. */
  engine?: string;
  /** Capabilities this plugin implements (e.g. "detect", "recommend", "hook"). */
  capabilities?: string[];
  sourceType: PluginSourceType;
  trust: PluginTrust;
};

/**
 * The canonical plugin contract.
 * Both imperative module plugins and compiled JSON policies implement this.
 * All hook stages are optional — plugins only implement what they need.
 */
export type PolicyPlugin = {
  meta: PluginMeta;

  /** Detectors that emit signals about repository state. */
  detectors?: Detector[];

  /** Called after all detectors run. Returns a patch to mutate signals. */
  afterDetect?: (
    signals: ReadonlyArray<Signal>,
    ctx: PolicyContext
  ) => Promise<SignalPatch | undefined>;

  /** Called before recommenders run. Returns a patch to mutate signals. */
  beforeRecommend?: (
    signals: ReadonlyArray<Signal>,
    ctx: PolicyContext
  ) => Promise<SignalPatch | undefined>;

  /** Recommenders that emit actionable recommendations. */
  recommenders?: Recommender[];

  /** Called after all recommenders run. Returns a patch to mutate recommendations. */
  afterRecommend?: (
    recommendations: ReadonlyArray<Recommendation>,
    signals: ReadonlyArray<Signal>,
    ctx: PolicyContext
  ) => Promise<RecommendationPatch | undefined>;

  /** Per-plugin error handler. Return true to continue remaining detectors/recommenders for this plugin, false to abort them. Does not affect other plugins in the chain. Note: return value is ignored for hook stages (afterDetect, beforeRecommend, afterRecommend); only effective in detect/recommend loops. */
  onError?: (error: Error, stage: PluginStage, ctx: PolicyContext) => boolean;
};

// ─── Type guards ───

/**
 * Detect whether a loaded module export is a native PolicyPlugin.
 *
 * Native plugins export a `PolicyPlugin` object directly (with a `meta` property)
 * instead of a `PolicyConfig` object (which has a top-level `name` string).
 * This allows module authors to use the full plugin lifecycle API
 * (afterDetect, beforeRecommend, afterRecommend hooks with SignalPatch/RecommendationPatch)
 * rather than being limited to the criteria.add/disable/override DSL.
 */
export function isNativePlugin(obj: unknown): obj is PolicyPlugin {
  if (typeof obj !== "object" || obj === null) return false;
  const record = obj as Record<string, unknown>;
  if (typeof record.meta !== "object" || record.meta === null) return false;
  const meta = record.meta as Record<string, unknown>;
  return typeof meta.name === "string" && meta.name.trim().length > 0;
}

/**
 * Validate that a native plugin export has the minimum required structure.
 * Throws descriptive errors for invalid plugins.
 */
export function validateNativePlugin(obj: PolicyPlugin, source: string): void {
  const { meta } = obj;
  if (!meta.name?.trim()) {
    throw new Error(`Native plugin "${source}" is invalid: meta.name is required`);
  }
  const hasHooks =
    obj.detectors?.length ||
    obj.afterDetect ||
    obj.beforeRecommend ||
    obj.recommenders?.length ||
    obj.afterRecommend;
  if (!hasHooks) {
    throw new Error(
      `Native plugin "${source}" is invalid: must implement at least one hook (detectors, afterDetect, beforeRecommend, recommenders, or afterRecommend)`
    );
  }
}

// ─── Engine output ───

/** Grade label for a readiness score. */
export type Grade = "A" | "B" | "C" | "D" | "F";

/** Complete output from the plugin engine. */
export type EngineReport = {
  readonly signals: ReadonlyArray<Signal>;
  readonly recommendations: ReadonlyArray<Recommendation>;
  readonly policyWarnings: ReadonlyArray<PolicyWarning>;
  readonly score: number;
  readonly grade: Grade;
  readonly pluginChain: ReadonlyArray<string>;
};

// ─── Scoring ───

const IMPACT_WEIGHTS: Record<RecommendationImpact, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 0
};

/**
 * Engine-level scoring reducer.
 * Score = 1 - (weighted unresolved recommendations / max possible weight).
 * Max weight per signal is "critical" (5) — a single critical recommendation
 * against one signal will produce score 0. This is intentional: critical
 * findings are designed to dominate the score.
 */
export function calculateScore(
  signals: ReadonlyArray<Signal>,
  recommendations: ReadonlyArray<Recommendation>
): { score: number; grade: Grade } {
  // Exclude not-detected (skipped/non-applicable) signals from scoring denominator.
  // Including them would inflate maxWeight and artificially boost scores for repos
  // with many non-applicable criteria.
  const activeSignals = signals.filter((s) => s.status !== "not-detected");
  if (activeSignals.length === 0) {
    return { score: 1, grade: "A" };
  }

  const maxWeight = activeSignals.length * IMPACT_WEIGHTS.critical;

  const deductions = recommendations.reduce((sum, rec) => sum + IMPACT_WEIGHTS[rec.impact], 0);

  const score = Math.max(0, Math.min(1, 1 - deductions / maxWeight));
  return { score, grade: scoreToGrade(score) };
}

function scoreToGrade(score: number): Grade {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

// ─── Patch application ───

/** Apply a SignalPatch to a list of signals, recording provenance. */
export function applySignalPatch(
  signals: Signal[],
  patch: SignalPatch,
  pluginName: string
): Signal[] {
  let result = [...signals];

  if (patch.remove?.length) {
    const removeSet = new Set(patch.remove);
    result = result.filter((s) => !removeSet.has(s.id));
  }

  if (patch.modify?.length) {
    for (const mod of patch.modify) {
      const idx = result.findIndex((s) => s.id === mod.id);
      if (idx >= 0) {
        const existing = result[idx];
        const changes = { ...mod.changes };
        // Deep-merge metadata to avoid wiping existing fields (e.g. checkStatus)
        if (changes.metadata && existing.metadata) {
          changes.metadata = { ...existing.metadata, ...changes.metadata };
        }
        result[idx] = {
          ...existing,
          ...changes,
          origin: {
            ...existing.origin,
            modifiedBy: [...(existing.origin.modifiedBy ?? []), pluginName]
          }
        };
      }
    }
  }

  if (patch.add?.length) {
    result.push(
      ...patch.add.map((s) => ({
        ...s,
        evidence: s.evidence ? [...s.evidence] : undefined,
        metadata: s.metadata ? { ...s.metadata } : undefined
      }))
    );
  }

  return result;
}

/** Apply a RecommendationPatch to a list of recommendations, recording provenance. */
export function applyRecommendationPatch(
  recommendations: Recommendation[],
  patch: RecommendationPatch,
  pluginName: string
): Recommendation[] {
  let result = [...recommendations];

  if (patch.remove?.length) {
    const removeSet = new Set(patch.remove);
    result = result.filter((r) => !removeSet.has(r.id));
  }

  if (patch.modify?.length) {
    for (const mod of patch.modify) {
      const idx = result.findIndex((r) => r.id === mod.id);
      if (idx >= 0) {
        const existing = result[idx];
        result[idx] = {
          ...existing,
          ...mod.changes,
          origin: {
            ...existing.origin,
            modifiedBy: [...(existing.origin.modifiedBy ?? []), pluginName]
          }
        };
      }
    }
  }

  if (patch.add?.length) {
    result.push(
      ...patch.add.map((r) => ({
        ...r,
        supersedes: r.supersedes ? [...r.supersedes] : undefined,
        metadata: r.metadata ? { ...r.metadata } : undefined
      }))
    );
  }

  return result;
}

/**
 * Resolve supersedes: remove recommendations that are superseded by others.
 * Records provenance on the superseding recommendation.
 * Circular supersedes chains result in all involved recommendations being dropped.
 */
export function resolveSupersedes(recommendations: Recommendation[]): Recommendation[] {
  const supersededIds = new Set<string>();
  const recIds = new Set(recommendations.map((r) => r.id));
  for (const rec of recommendations) {
    if (rec.supersedes?.length) {
      for (const id of rec.supersedes) {
        // Only supersede IDs that actually exist in the list
        if (recIds.has(id)) {
          supersededIds.add(id);
        }
      }
    }
  }
  return recommendations
    .filter((r) => !supersededIds.has(r.id))
    .map((r) => {
      if (!r.supersedes?.length) return r;
      // Record which recommendations were actually superseded
      const actuallySuperseded = r.supersedes.filter((id) => supersededIds.has(id));
      if (actuallySuperseded.length === 0) return r;
      return {
        ...r,
        origin: {
          ...r.origin,
          modifiedBy: [
            ...(r.origin.modifiedBy ?? []),
            ...actuallySuperseded.map((id) => `superseded:${id}`)
          ]
        }
      };
    });
}
