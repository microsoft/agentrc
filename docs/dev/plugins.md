# AgentRC Plugin System

The unified plugin policy system allows both imperative (code) plugins and declarative (JSON) policies to run through the same engine.

## Architecture

```
PolicyConfig (JSON) ──┐
                       ├─→ compilePolicyConfig() ──→ PolicyPlugin
Module policy (.ts) ──┘

Built-in criteria ──→ buildBuiltinPlugin() ──→ PolicyPlugin

PolicyPlugin[] ──→ executePlugins() ──→ EngineReport
                                          └─→ engineReportToReadiness() ──→ ReadinessReport
```

### Pipeline Stages

The engine executes plugins through 5 deterministic stages:

1. **Detect** — All detectors emit signals about repository state
2. **afterDetect** — Hooks can modify/add/remove signals via patches
3. **beforeRecommend** — Last chance to adjust signals before recommendations
4. **Recommend** — Recommenders emit actionable recommendations from signals
5. **afterRecommend** — Hooks can modify/add/remove recommendations via patches

After hooks complete, the engine resolves `supersedes` conflicts and computes a score.

## Plugin Contract

```typescript
type PolicyPlugin = {
  meta: PluginMeta;
  detectors?: Detector[];
  afterDetect?: (signals, ctx) => Promise<SignalPatch | undefined>;
  beforeRecommend?: (signals, ctx) => Promise<SignalPatch | undefined>;
  recommenders?: Recommender[];
  afterRecommend?: (recs, signals, ctx) => Promise<RecommendationPatch | undefined>;
  onError?: (error, stage, ctx) => boolean;
};
```

### Trust Model

| Trust Tier         | Source                         | Capabilities                                   |
| ------------------ | ------------------------------ | ---------------------------------------------- |
| `trusted-code`     | `.ts`/`.js` module or built-in | Full lifecycle hooks, arbitrary code           |
| `safe-declarative` | `.json` policy file            | Disable, override metadata, static checks only |

### Immutable Patches

All hook stages return patch objects instead of mutating arrays directly:

```typescript
type SignalPatch = {
  add?: Signal[];
  remove?: string[]; // IDs to remove
  modify?: Array<{ id: string; changes: Partial<Signal> }>;
};
```

The engine applies patches and automatically records provenance (`origin.modifiedBy`).

### Conflict Resolution

Use `supersedes` on recommendations for explicit conflict resolution:

```typescript
const rec: Recommendation = {
  id: "strict-lint-fix",
  signalId: "lint-config",
  impact: "high",
  message: "Use stricter lint rules",
  supersedes: ["basic-lint-fix"], // Replaces this recommendation
  origin: { addedBy: "strict-policy" }
};
```

Circular supersedes chains drop all involved recommendations.

## Writing a Plugin

There are three authoring APIs:

- **`PolicyConfig`** — The high-level authoring API. You write a config object with `criteria`/`extras`/`thresholds` and the engine compiles it into a `PolicyPlugin` under the hood. This is the recommended approach for most use cases.
- **`PolicyPlugin` (native export)** — Export the full `PolicyPlugin` contract directly from a `.ts`/`.js`/`.mjs` module. Use this when you need direct control over the 5-stage pipeline hooks (signal mutation, cross-signal recommendations, rich recommendation metadata).
- **JSON** — Static declarative policy for disabling/overriding criteria. Config-file sourced policies are restricted to JSON only for security.

### Imperative Plugin (TypeScript via PolicyConfig)

```typescript
// my-policy.ts
import type { PolicyConfig } from "agentrc/services/policy";

const policy: PolicyConfig = {
  name: "my-custom-policy",
  criteria: {
    disable: ["env-example"], // Skip this check
    override: {
      "lint-config": { title: "Custom Lint Title", impact: "medium" }
    },
    add: [
      {
        id: "custom-check",
        title: "My Custom Check",
        pillar: "code-quality",
        level: 2,
        scope: "repo",
        impact: "high",
        effort: "low",
        check: async (ctx) => {
          // Your check logic here
          return { status: "pass", reason: "All good" };
        }
      }
    ]
  }
};

export default policy;
```

### Native Plugin (TypeScript via PolicyPlugin)

Export a `PolicyPlugin` object directly when you need the full 5-stage pipeline. The loader detects native exports by looking for a `meta` property instead of a root-level `name` string, and unconditionally sets `meta.sourceType: "module"` and `meta.trust: "trusted-code"`.

```typescript
// my-native-plugin.mjs
import type { PolicyPlugin } from "@agentrc/core/services/policy/types";

const plugin: PolicyPlugin = {
  meta: {
    name: "my-native-plugin",
    version: "1.0.0"
  },

  // Detectors emit signals about repository state
  detectors: [
    {
      id: "my-signal",
      label: "My Custom Signal",
      detect: async (ctx) => {
        const found = ctx.rootFiles.includes(".myconfig");
        return {
          status: found ? "detected" : "not-detected",
          evidence: found ? [".myconfig present"] : [],
          kind: "file"
        };
      }
    }
  ],

  // afterDetect hook: mutate signals after all detectors run
  afterDetect: async (signals, ctx) => {
    // Example: add a synthetic signal based on detected state
    return {
      add: [],
      remove: [],
      modify: []
    };
  },

  // Recommenders derive actionable items from signals
  recommenders: [
    {
      id: "my-recommender",
      recommend: async (signals, ctx) => {
        const signal = signals.find((s) => s.id === "my-signal");
        if (signal?.status === "not-detected") {
          return [
            {
              id: "add-myconfig",
              signalId: "my-signal",
              impact: "medium",
              message: "Add a .myconfig file to configure the tool",
              origin: { addedBy: "my-native-plugin" }
            }
          ];
        }
        return [];
      }
    }
  ]
};

export default plugin;
```

Use native plugin exports via `--policy`:

```bash
agentrc readiness --policy ./my-native-plugin.mjs
```

Or publish as an npm package and reference by package name:

```bash
agentrc readiness --policy @myorg/agentrc-policy-custom
```

> **Note:** Native plugin exports are only supported via `--policy` (CLI flag) or npm packages. Config-file sourced policies (`agentrc.config.json`) are restricted to JSON for security.

### Declarative Policy (JSON)

```json
{
  "name": "strict-policy",
  "criteria": {
    "disable": ["env-example"],
    "override": {
      "lint-config": { "impact": "high" }
    }
  },
  "thresholds": {
    "passRate": 0.9
  }
}
```

## Using Policies

### CLI

```bash
# Single policy
agentrc readiness --policy ./my-policy.json

# Multiple policies (comma-separated)
agentrc readiness --policy ./base.json,./strict.json

# npm package policy
agentrc readiness --policy @org/agentrc-policy-strict
```

### Configuration File

In `agentrc.config.json`:

```json
{
  "policies": ["./policies/strict.json"]
}
```

The config file also supports `areas` and `workspaces` for monorepo configuration — see [examples/agentrc.config.json](../examples/agentrc.config.json) for a full example.

Config-sourced policies are restricted to JSON-only for security.

## Scoring

The engine computes a score from final recommendations:

- Each recommendation has an `impact`: critical (5), high (4), medium (3), low (2), info (0)
- Score = 1 - (total deductions / max possible weight)
- Max weight = number of detected signals × 5 (signals with status "not-detected" are excluded)
- Grades: A ≥ 0.9, B ≥ 0.8, C ≥ 0.7, D ≥ 0.6, F < 0.6

## Shadow Mode

> **Status: In development.** Shadow mode infrastructure (`compareShadow`, `writeShadowLog`) is implemented but not yet wired into the production readiness path. The `.agentrc-cache/shadow-mode.log` file is **not** written during normal `agentrc readiness` runs.

Shadow mode is designed to validate the new plugin engine against the legacy system before switching it on by default. When wired in, it will run both paths in parallel and log discrepancies:

```typescript
import { compareShadow, writeShadowLog } from "agentrc/services/policy/shadow";

// Compare legacy ReadinessReport against a new EngineReport
const result = compareShadow(legacyReport, engineReport, {
  repoPath: "/path/to/repo",
  useNewEngine: false // Use legacy output by default
});

// Write any discrepancies to .agentrc-cache/shadow-mode.log
if (result.discrepancies.length > 0) {
  await writeShadowLog(repoPath, result.discrepancies);
}
```

To run the plugin engine alongside the legacy path today, pass `shadow: true` to `runReadinessReport`. This populates `report.engine` with engine signals, recommendations, and score, but does not replace the legacy output:

```typescript
const report = await runReadinessReport({ repoPath, shadow: true });
// report.engine contains: signals, recommendations, policyWarnings, score, grade
```
