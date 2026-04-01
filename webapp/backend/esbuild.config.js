import { build } from "esbuild";

await build({
  entryPoints: ["src/server.js"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  sourcemap: true,
  // Keep node_modules external — they're installed via npm ci
  packages: "external",
  // Bundle @agentrc/core (TypeScript source) into the output
  alias: {
    "@agentrc/core": "../../packages/core/src",
  },
  banner: {
    js: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
  loader: { ".ts": "ts" },
});
