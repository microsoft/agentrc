---
description: "Use when working on the VS Code extension in vscode-extension/. Covers build, git integration, path aliases, and extension-specific patterns."
applyTo: "vscode-extension/**"
---

# VS Code Extension Development

The extension lives in `vscode-extension/` and surfaces AgentRC CLI commands in VS Code.

## Build

```sh
cd vscode-extension
node esbuild.mjs         # CJS bundle → out/extension.js
node esbuild.mjs --watch  # watch mode
npx tsc --noEmit          # typecheck
```

Output is CommonJS (not ESM like the CLI). Bundled with esbuild, not tsup.

## Service Reuse via Path Alias

The extension imports shared services through the `@agentrc/core/*` path alias:

```typescript
// vscode-extension/src/services.ts — re-export layer
export { analyzeRepo } from "@agentrc/core/services/analyzer";
```

This works because `tsconfig.json` maps `@agentrc/core` to `../packages/core/src` and esbuild
resolves it at bundle time. Never duplicate core service logic in the extension.

## Git Integration

- Use the built-in `vscode.git` extension API — **never import or bundle `simple-git`**.
- The extension declares `"extensionDependencies": ["vscode.git"]`.
- Types are vendored in `src/git.d.ts` from the upstream VS Code repo.
- `gitUtils.ts` finds the deepest matching repo for monorepo support.

## Command Pattern

Commands in `vscode-extension/src/commands/` are thin wrappers:

1. Call shared service from `services.ts`
2. Update tree providers / status bar
3. Show VS Code notifications for results

## Key Differences from CLI

| Aspect        | CLI           | Extension      |
| ------------- | ------------- | -------------- |
| Module format | ESM           | CommonJS       |
| Bundler       | tsup          | esbuild        |
| Git library   | simple-git    | vscode.git API |
| Output        | stdout/stderr | VS Code UI     |
