import * as esbuild from "esbuild";
import { readFile } from "node:fs/promises";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * esbuild plugin: neutralise the SDK's getBundledCliPath() which calls
 * import.meta.resolve() and createRequire(__filename). In CJS bundles esbuild
 * replaces import.meta with {}, making .resolve undefined and crashing at
 * runtime. AgentRC always passes an explicit cliPath so this function is dead
 * code, but the SDK constructor still evaluates it as a default value.
 *
 * Validated against @github/copilot-sdk 0.1.24–0.2.0.
 * If the SDK changes getBundledCliPath internals the build will fail with
 * a clear error message below.
 */
const SDK_FN_RE = /function getBundledCliPath\(\) \{[\s\S]*?\n\}/;

const shimSdkImportMeta = {
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

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  outfile: "out/extension.js",
  // Keep Copilot SDK bundled: packaged extensions may not have node_modules at runtime.
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  plugins: [shimSdkImportMeta],
  alias: {
    // Resolve @agentrc/core imports via the packages/core/src directory
    "@agentrc/core": "../packages/core/src"
  }
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    console.log(production ? "Production build complete." : "Build complete.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
