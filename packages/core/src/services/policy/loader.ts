/**
 * Phase F: Plugin loader and chain composition.
 *
 * Resolves built-in, local/npm imperative, and compiled JSON plugins
 * into an ordered plugin chain. Source/load order determines execution.
 *
 * Loader responsibilities:
 *   - Build the built-in plugin from current `buildCriteria`/`buildExtras`
 *   - Load imperative (.ts/.js) plugins with trust "trusted-code"
 *   - Load declarative (.json) policies via the DSL compiler (trust "safe-declarative")
 *   - Aggregate disabledIds across all compiled policies into EngineOptions
 *   - Return the ready-to-execute plugin chain + engine options
 */
import type { PolicyConfig } from "../policy";
import { loadPolicy } from "../policy";
import type { ReadinessCriterion } from "../readiness";
import { buildCriteria, buildExtras } from "../readiness";

import { compilePolicyConfig } from "./compiler";
import type { CompilationResult } from "./compiler";
import type { EngineOptions } from "./engine";
import type { PolicyPlugin } from "./types";
import { isNativePlugin } from "./types";

export type LoadedChain = {
  plugins: PolicyPlugin[];
  options: EngineOptions;
  /** Pass-rate threshold (last policy wins). */
  passRateThreshold: number;
};

/**
 * Build the built-in plugin from the current `buildCriteria`/`buildExtras`.
 * Each criterion becomes a detector + recommender pair.
 * Extras also become detector + recommender pairs.
 */
export function buildBuiltinPlugin(): { plugin: PolicyPlugin; baseCriteria: ReadinessCriterion[] } {
  const baseCriteria = buildCriteria();
  const baseExtras = buildExtras();

  // Only include repo-scoped criteria — app/area-scoped criteria need
  // iteration context that the engine doesn't provide yet.
  const repoCriteria = baseCriteria.filter((c) => c.scope === "repo");

  const compiledCriteria = compilePolicyConfig(
    {
      name: "__builtin__",
      criteria: { add: repoCriteria },
      extras: { add: baseExtras }
    },
    []
  );

  const plugin: PolicyPlugin = {
    ...compiledCriteria.plugin,
    meta: {
      ...compiledCriteria.plugin.meta,
      name: "builtin",
      sourceType: "builtin",
      trust: "trusted-code"
    }
  };

  return { plugin, baseCriteria };
}

/**
 * Load a chain of plugins from policy sources.
 *
 * @param policySources - Policy file paths or npm specifiers
 * @param options - Loading options
 * @returns Ready-to-execute plugin chain and engine options
 */
export async function loadPluginChain(
  policySources: string[],
  options?: { jsonOnly?: boolean }
): Promise<LoadedChain> {
  const { plugin: builtinPlugin, baseCriteria } = buildBuiltinPlugin();
  const plugins: PolicyPlugin[] = [builtinPlugin];
  const allDisabledIds: string[] = [];
  let passRateThreshold = 0.8;

  for (const source of policySources) {
    const loaded = await loadPolicy(source, {
      jsonOnly: options?.jsonOnly
    });

    // Native PolicyPlugin exports — use directly with trusted-code trust.
    // These modules export the full plugin contract (detectors, hooks, recommenders)
    // instead of the PolicyConfig DSL (criteria.add/disable/override).
    if (isNativePlugin(loaded)) {
      plugins.push({
        ...loaded,
        meta: {
          ...loaded.meta,
          sourceType: "module",
          trust: "trusted-code"
        }
      });
      continue;
    }

    const policyConfig: PolicyConfig = loaded;

    // Check if this is a module policy (imperative plugin) with code-level hooks
    if (isImperativePlugin(policyConfig)) {
      // Module policies: wrap as trusted-code plugin
      const { plugin: imperativePlugin, compiled } = wrapImperativePolicy(
        policyConfig,
        baseCriteria
      );
      plugins.push(imperativePlugin);
      allDisabledIds.push(...compiled.disabledIds);
      if (compiled.passRateThreshold !== undefined) {
        passRateThreshold = compiled.passRateThreshold;
      }
    } else {
      // Declarative JSON policies: compile to safe-declarative plugin
      const compiled: CompilationResult = compilePolicyConfig(policyConfig, baseCriteria);
      plugins.push(compiled.plugin);
      allDisabledIds.push(...compiled.disabledIds);
      if (compiled.passRateThreshold !== undefined) {
        passRateThreshold = compiled.passRateThreshold;
      }
    }
  }

  return {
    plugins,
    options: {
      disabledRuleIds: allDisabledIds.length > 0 ? new Set(allDisabledIds) : undefined
    },
    passRateThreshold
  };
}

/**
 * Detect if a PolicyConfig contains imperative code.
 *
 * Module-sourced policies may contain check functions (criteria.add/extras.add)
 * which cannot exist in JSON policies. Any policy with add entries
 * is treated as imperative; policies with only disable/override are
 * purely declarative regardless of source format.
 */
function isImperativePlugin(config: PolicyConfig): boolean {
  const hasAddedCriteria = Boolean(config.criteria?.add?.length);
  const hasAddedExtras = Boolean(config.extras?.add?.length);
  return hasAddedCriteria || hasAddedExtras;
}

/**
 * Wrap a module-sourced PolicyConfig as a trusted-code plugin.
 * Uses the compiler for the heavy lifting, then overrides the trust tier.
 * Also propagates disabledIds and passRateThreshold from the module policy.
 */
function wrapImperativePolicy(
  config: PolicyConfig,
  baseCriteria: ReadonlyArray<ReadinessCriterion>
): { plugin: PolicyPlugin; compiled: CompilationResult } {
  const compiled = compilePolicyConfig(config, baseCriteria);
  const plugin: PolicyPlugin = {
    ...compiled.plugin,
    meta: {
      ...compiled.plugin.meta,
      sourceType: "module",
      trust: "trusted-code"
    }
  };
  return { plugin, compiled };
}
