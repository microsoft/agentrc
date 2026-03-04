import { readFileSync } from "fs";

import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

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
    js: "#!/usr/bin/env node"
  },
  // Keep node_modules as external — they'll be installed via npm
  external: [/^[^./]/],
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.define = {
      ...options.define,
      "process.env.AGENTRC_VERSION": JSON.stringify(pkg.version)
    };
  }
});
