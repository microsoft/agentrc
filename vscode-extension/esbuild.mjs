import * as esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { cpSync, rmSync } from "node:fs";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * esbuild plugin: neutralise the SDK's getBundledCliPath() which calls
 * import.meta.resolve("@github/copilot/sdk"). In CJS bundles esbuild replaces
 * import.meta with {}, making .resolve undefined and crashing at runtime.
 * AgentRC always passes an explicit cliPath so this function is dead code, but
 * the SDK constructor still evaluates it as a default value.
 *
 * Validated against @github/copilot-sdk ^0.1.24–0.1.29.
 * If the SDK changes getBundledCliPath internals the build will fail with
 * a clear error message below.
 */
const SDK_SHIM_TARGET =
  'const sdkUrl = import.meta.resolve("@github/copilot/sdk");\n  const sdkPath = fileURLToPath(sdkUrl);\n  return join(dirname(dirname(sdkPath)), "index.js");';

const shimSdkImportMeta = {
  name: "shim-sdk-import-meta",
  setup(build) {
    build.onLoad({ filter: /copilot-sdk[\\/]dist[\\/]client\.js$/ }, async (args) => {
      let contents = await readFile(args.path, "utf8");
      if (!contents.includes(SDK_SHIM_TARGET)) {
        throw new Error(
          "[shim-sdk-import-meta] SDK internals changed — getBundledCliPath() " +
            "target string not found in " +
            args.path +
            ". Update the shim to match the new SDK version."
        );
      }
      contents = contents.replace(SDK_SHIM_TARGET, 'return "bundled-cli-unavailable";');
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

/** esbuild plugin: copy built-in skill assets after each build. */
const copySkillAssets = {
  name: "copy-skill-assets",
  setup(build) {
    build.onEnd(() => {
      rmSync("out/skills", { recursive: true, force: true });
      cpSync("../plugin/skills", "out/skills", { recursive: true });
    });
  }
};

async function main() {
  buildOptions.plugins.push(copySkillAssets);

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
