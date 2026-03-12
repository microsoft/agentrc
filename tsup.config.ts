import { readFile } from "node:fs/promises";

import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

/**
 * Shim the SDK's getBundledCliPath() which calls import.meta.resolve().
 * In ESM bundles, import.meta.resolve("@github/copilot/sdk") throws at runtime
 * because the bare specifier can't be resolved from the bundle's execution
 * directory (e.g. stale npx cache). In CJS bundles esbuild additionally
 * replaces import.meta with {}. AgentRC always passes an explicit cliPath so
 * this function is dead code, but the SDK constructor evaluates it on load.
 *
 * Identical to the shim in vscode-extension/esbuild.mjs — update both together
 * if the SDK changes getBundledCliPath internals.
 */
const SDK_SHIM_TARGET =
  'const sdkUrl = import.meta.resolve("@github/copilot/sdk");\n  const sdkPath = fileURLToPath(sdkUrl);\n  return join(dirname(dirname(sdkPath)), "index.js");';

const shimSdkImportMeta: Plugin = {
  name: "shim-sdk-import-meta",
  setup(build) {
    build.onLoad({ filter: /copilot-sdk[\\/]dist[\\/]client\.js$/ }, async (args) => {
      let contents = await readFile(args.path, "utf8");
      if (!contents.includes(SDK_SHIM_TARGET)) {
        throw new Error(
          "[shim-sdk-import-meta] SDK internals changed — getBundledCliPath() " +
            "target string not found in " +
            args.path +
            ". Update the shim in tsup.config.ts and vscode-extension/esbuild.mjs."
        );
      }
      contents = contents.replace(SDK_SHIM_TARGET, 'return "bundled-cli-unavailable";');
      return { contents, loader: "js" };
    });
  }
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: {
    // vscode-jsonrpc is CJS and uses require("util") etc. When bundled into
    // ESM, esbuild's __require polyfill throws because `require` is undefined.
    // Providing a real require via createRequire fixes this for Node built-ins.
    // Use alias (__bannerCreateRequire) to avoid colliding with cli.ts's own
    // `import { createRequire } from "node:module"` in the bundled output.
    js: '#!/usr/bin/env node\nimport { createRequire as __bannerCreateRequire } from "node:module";\nconst require = __bannerCreateRequire(import.meta.url);'
  },
  // Keep node_modules as external — they'll be installed via npm
  external: [/^[^./]/],
  // Bundle workspace package (source .ts files) and the Copilot SDK.
  // The SDK uses dynamic import() so it won't be present in a stale npx
  // cache; bundling it avoids ERR_MODULE_NOT_FOUND in that scenario.
  // vscode-jsonrpc is a transitive dep of the SDK whose subpath exports
  // lack the .js extension, breaking ESM resolution at runtime.
  noExternal: [/@agentrc\/core/, /@github\/copilot-sdk/, /vscode-jsonrpc/],
  esbuildPlugins: [shimSdkImportMeta],
  esbuildOptions(options) {
    options.jsx = "automatic";
    // Resolve @agentrc/core subpath imports to source files
    options.alias = {
      "@agentrc/core": "./packages/core/src"
    };
  }
});
