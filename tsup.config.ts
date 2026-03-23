import { readFile } from "node:fs/promises";

import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

/**
 * Shim the SDK's getBundledCliPath() which calls import.meta.resolve() and
 * createRequire(__filename). In ESM bundles the bare specifier can't be
 * resolved; in CJS bundles esbuild replaces import.meta with {}. AgentRC
 * always passes an explicit cliPath so this function is dead code, but the
 * SDK constructor evaluates it as a default value.
 *
 * Identical to the shim in vscode-extension/esbuild.mjs — update both together
 * if the SDK changes getBundledCliPath internals.
 */
const SDK_FN_RE = /function getBundledCliPath\(\) \{[\s\S]*?\n\}/;

const shimSdkImportMeta: Plugin = {
  name: "shim-sdk-import-meta",
  setup(build) {
    build.onLoad({ filter: /copilot-sdk[\\/]dist[\\/]client\.js$/ }, async (args) => {
      const original = await readFile(args.path, "utf8");
      const contents = original.replace(
        SDK_FN_RE,
        'function getBundledCliPath() {\n  return "bundled-cli-unavailable";\n}'
      );
      if (contents === original) {
        throw new Error(
          "[shim-sdk-import-meta] SDK internals changed — getBundledCliPath() " +
            "not found in " +
            args.path +
            ". Update the shim in tsup.config.ts and vscode-extension/esbuild.mjs."
        );
      }
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
