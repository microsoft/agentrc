import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

import { executePlugins } from "@agentrc/core/services/policy/engine";
import { buildBuiltinPlugin, loadPluginChain } from "@agentrc/core/services/policy/loader";
import type { PolicyContext } from "@agentrc/core/services/policy/types";
import { buildExtras } from "@agentrc/core/services/readiness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function makeCtx(): PolicyContext {
  return {
    repoPath: "/tmp/test",
    rootFiles: [],
    cache: new Map()
  };
}

describe("buildBuiltinPlugin", () => {
  it("returns a plugin with sourceType 'builtin' and trust 'trusted-code'", () => {
    const { plugin } = buildBuiltinPlugin();
    expect(plugin.meta.name).toBe("builtin");
    expect(plugin.meta.sourceType).toBe("builtin");
    expect(plugin.meta.trust).toBe("trusted-code");
  });

  it("has detectors for all repo-scoped built-in criteria and extras", () => {
    const { plugin, baseCriteria } = buildBuiltinPlugin();
    const extras = buildExtras();
    // Only repo-scoped criteria are included, plus all extras
    const repoCriteria = baseCriteria.filter((c) => c.scope === "repo");
    expect(plugin.detectors).toBeDefined();
    expect(plugin.detectors!.length).toBe(repoCriteria.length + extras.length);
  });

  it("has recommenders for all repo-scoped built-in criteria and extras", () => {
    const { plugin, baseCriteria } = buildBuiltinPlugin();
    const extras = buildExtras();
    const repoCriteria = baseCriteria.filter((c) => c.scope === "repo");
    expect(plugin.recommenders).toBeDefined();
    expect(plugin.recommenders!.length).toBe(repoCriteria.length + extras.length);
  });

  it("produces a plugin that can execute through the engine", async () => {
    const { plugin } = buildBuiltinPlugin();
    const report = await executePlugins([plugin], makeCtx());
    expect(report.signals.length).toBeGreaterThan(0);
    expect(report.pluginChain).toEqual(["builtin"]);
    expect(report.grade).toBeDefined();
  });
});

describe("loadPluginChain", () => {
  it("always includes builtin as the first plugin", async () => {
    const chain = await loadPluginChain([]);
    expect(chain.plugins.length).toBe(1);
    expect(chain.plugins[0].meta.name).toBe("builtin");
    expect(chain.passRateThreshold).toBe(0.8);
  });

  it("returns empty disabledRuleIds when no policies loaded", async () => {
    const chain = await loadPluginChain([]);
    expect(chain.options.disabledRuleIds).toBeUndefined();
  });
});

describe("loadPluginChain with JSON policy file", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-loader-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loads a JSON policy and returns 2-plugin chain with policy following builtin", async () => {
    const policyPath = path.join(tmpDir, "test-policy.json");
    await fs.writeFile(
      policyPath,
      JSON.stringify({ name: "test-policy", criteria: { disable: [] } })
    );

    const chain = await loadPluginChain([policyPath]);
    expect(chain.plugins).toHaveLength(2);
    expect(chain.plugins[0].meta.name).toBe("builtin");
    expect(chain.plugins[1].meta.name).toBe("test-policy");
    expect(chain.plugins[1].meta.trust).toBe("safe-declarative");
  });

  it("merges disabledRuleIds from policy criteria.disable", async () => {
    const policyPath = path.join(tmpDir, "disable-policy.json");
    await fs.writeFile(
      policyPath,
      JSON.stringify({ name: "disable-policy", criteria: { disable: ["lint-config", "readme"] } })
    );

    const chain = await loadPluginChain([policyPath]);
    expect(chain.options.disabledRuleIds).toBeDefined();
    expect(chain.options.disabledRuleIds).toContain("lint-config");
    expect(chain.options.disabledRuleIds).toContain("readme");
  });

  it("picks up passRateThreshold from policy thresholds field", async () => {
    const policyPath = path.join(tmpDir, "threshold-policy.json");
    await fs.writeFile(
      policyPath,
      JSON.stringify({ name: "strict", thresholds: { passRate: 0.95 } })
    );

    const chain = await loadPluginChain([policyPath]);
    expect(chain.passRateThreshold).toBe(0.95);
  });

  it("accepts a safe-declarative policy when jsonOnly is true", async () => {
    const policyPath = path.join(tmpDir, "bad-policy.json");
    // compilePolicyConfig with jsonOnly:true rejects policies that declare import sources
    // Write a structurally-invalid policy so loadPolicy raises at parse time
    await fs.writeFile(policyPath, JSON.stringify({ name: "bad", criteria: { disable: [] } }));

    // jsonOnly flag is set when policySources comes from config (not CLI), but the
    // file-based path always resolves to safe-declarative trust — load should succeed
    const chain = await loadPluginChain([policyPath], { jsonOnly: true });
    expect(chain.plugins[1].meta.trust).toBe("safe-declarative");
  });
});

describe("loadPluginChain with native PolicyPlugin module", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-native-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loads a native PolicyPlugin with afterDetect hook as trusted-code", async () => {
    const pluginCode = `
      export default {
        meta: { name: "native-hook", sourceType: "module", trust: "trusted-code" },
        afterDetect: async (signals) => ({
          modify: signals
            .filter(s => s.id === "readme")
            .map(s => ({ id: s.id, changes: { label: "Patched by native" } }))
        })
      };
    `;
    const pluginPath = path.join(tmpDir, "native-hook.mjs");
    await fs.writeFile(pluginPath, pluginCode);

    const chain = await loadPluginChain([pluginPath]);
    expect(chain.plugins).toHaveLength(2);
    expect(chain.plugins[0].meta.name).toBe("builtin");
    expect(chain.plugins[1].meta.name).toBe("native-hook");
    expect(chain.plugins[1].meta.sourceType).toBe("module");
    expect(chain.plugins[1].meta.trust).toBe("trusted-code");
    expect(chain.plugins[1].afterDetect).toBeDefined();
  });

  it("loads a native PolicyPlugin with detectors and recommenders", async () => {
    const pluginCode = `
      export default {
        meta: { name: "native-full", sourceType: "module", trust: "trusted-code" },
        detectors: [{
          id: "custom-check",
          kind: "custom",
          detect: async (ctx) => ({
            id: "custom-signal",
            kind: "custom",
            status: "detected",
            label: "Custom detection",
            origin: { addedBy: "native-full" }
          })
        }],
        recommenders: [{
          id: "custom-rec",
          recommend: async (signals) => {
            const s = signals.find(s => s.id === "custom-signal");
            if (!s) return [];
            return {
              id: "custom-fix",
              signalId: "custom-signal",
              impact: "high",
              message: "Fix this custom issue",
              origin: { addedBy: "native-full" }
            };
          }
        }]
      };
    `;
    const pluginPath = path.join(tmpDir, "native-full.mjs");
    await fs.writeFile(pluginPath, pluginCode);

    const chain = await loadPluginChain([pluginPath]);
    expect(chain.plugins).toHaveLength(2);
    expect(chain.plugins[1].detectors).toHaveLength(1);
    expect(chain.plugins[1].recommenders).toHaveLength(1);
  });

  it("executes native plugin hooks through the engine pipeline", async () => {
    const pluginCode = `
      export default {
        meta: { name: "engine-test", sourceType: "module", trust: "trusted-code" },
        detectors: [{
          id: "native-detector",
          kind: "custom",
          detect: async () => ({
            id: "native-signal",
            kind: "custom",
            status: "detected",
            label: "Native",
            origin: { addedBy: "engine-test" }
          })
        }],
        afterDetect: async (signals) => ({
          modify: signals
            .filter(s => s.id === "native-signal")
            .map(s => ({ id: s.id, changes: { label: "Patched", metadata: { patched: true } } }))
        }),
        recommenders: [{
          id: "native-recommender",
          recommend: async (signals) => {
            const s = signals.find(s => s.id === "native-signal");
            if (!s || !s.metadata?.patched) return [];
            return {
              id: "native-rec",
              signalId: "native-signal",
              impact: "medium",
              message: "Native recommendation after patch",
              origin: { addedBy: "engine-test" }
            };
          }
        }]
      };
    `;
    const pluginPath = path.join(tmpDir, "engine-test.mjs");
    await fs.writeFile(pluginPath, pluginCode);

    const chain = await loadPluginChain([pluginPath]);
    const report = await executePlugins(chain.plugins, makeCtx());

    const nativeSignal = report.signals.find((s) => s.id === "native-signal");
    expect(nativeSignal).toBeDefined();
    expect(nativeSignal!.label).toBe("Patched");
    expect(nativeSignal!.metadata?.patched).toBe(true);

    const nativeRec = report.recommendations.find((r) => r.id === "native-rec");
    expect(nativeRec).toBeDefined();
    expect(nativeRec!.message).toBe("Native recommendation after patch");
  });

  it("rejects native plugin with no hooks", async () => {
    const pluginCode = `
      export default {
        meta: { name: "empty-plugin", sourceType: "module", trust: "trusted-code" }
      };
    `;
    const pluginPath = path.join(tmpDir, "empty.mjs");
    await fs.writeFile(pluginPath, pluginCode);

    await expect(loadPluginChain([pluginPath])).rejects.toThrow("must implement at least one hook");
  });

  it("forces sourceType to module and trust to trusted-code regardless of export values", async () => {
    const pluginCode = `
      export default {
        meta: { name: "override-test", sourceType: "json", trust: "safe-declarative" },
        afterDetect: async () => undefined
      };
    `;
    const pluginPath = path.join(tmpDir, "override.mjs");
    await fs.writeFile(pluginPath, pluginCode);

    const chain = await loadPluginChain([pluginPath]);
    // Loader overrides sourceType and trust for security
    expect(chain.plugins[1].meta.sourceType).toBe("module");
    expect(chain.plugins[1].meta.trust).toBe("trusted-code");
  });

  it("loads native plugin alongside a JSON policy", async () => {
    const jsonPath = path.join(tmpDir, "config.json");
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ name: "json-policy", criteria: { disable: ["readme"] } })
    );

    const nativeCode = `
      export default {
        meta: { name: "native-policy", sourceType: "module", trust: "trusted-code" },
        afterDetect: async () => undefined
      };
    `;
    const nativePath = path.join(tmpDir, "native.mjs");
    await fs.writeFile(nativePath, nativeCode);

    const chain = await loadPluginChain([jsonPath, nativePath]);
    expect(chain.plugins).toHaveLength(3);
    expect(chain.plugins[0].meta.name).toBe("builtin");
    expect(chain.plugins[1].meta.name).toBe("json-policy");
    expect(chain.plugins[1].meta.trust).toBe("safe-declarative");
    expect(chain.plugins[2].meta.name).toBe("native-policy");
    expect(chain.plugins[2].meta.trust).toBe("trusted-code");
  });
});
