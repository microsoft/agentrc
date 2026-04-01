import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agentrc/core": path.resolve(__dirname, "packages/core/src")
    }
  },
  test: {
    environment: "node",
    testTimeout: 10_000,
    exclude: ["webapp/**", "node_modules/**", "dist/**", "vscode-extension/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage"
    }
  }
});
