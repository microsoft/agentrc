# AgentRC Copilot Instructions

`@microsoft/agentrc` is a CLI tool (and VS Code extension) that sets up repositories for AI-assisted development. It analyzes repos, generates instruction files, evaluates AI responses, and runs readiness reports.

## Architecture

```
src/                   # CLI entry point and commands
  cli.ts               # Commander program, withGlobalOpts helper
  commands/            # Thin command wrappers (parse args → call services)
  ui/                  # Ink/React TUI components
packages/core/src/     # Shared services and utilities (bundled into dist)
  services/            # analyzer, generator, instructions, readiness, policy, ...
  utils/               # fs, output, logger, repo, pr
plugin/skills/         # Built-in skill markdown files (copied to dist/skills/ on build)
vscode-extension/      # See .github/instructions/vscode-extension.instructions.md
```

`@agentrc/core` (in `packages/core/`) is **bundled** into the CLI output — it is not an external npm package. Use the `@agentrc/core/*` path alias for all cross-package imports.

## Build & Test

```sh
npm run build          # tsup → dist/index.js (ESM, Node 20)
npm run dev            # tsx src/index.ts (run from source)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest run
npm run test:coverage  # vitest run --coverage
```

Output is ESM (`"type": "module"`). All node_modules are external except `@agentrc/core`, `@github/copilot-sdk`, and `vscode-jsonrpc` (bundled via `noExternal` in `tsup.config.ts`).

> **SDK shim**: `tsup.config.ts` patches `getBundledCliPath()` in the Copilot SDK. An identical shim lives in `vscode-extension/esbuild.mjs` — update **both** together if SDK internals change.

## Command Pattern

Commands in `src/commands/` are thin wrappers:

1. Resolve paths and options
2. Call services from `@agentrc/core/services/*`
3. Write output using the output utilities

Wrap every command action with `withGlobalOpts` (from `src/cli.ts`) so `--json`, `--quiet`, and `--accessible` are merged into the options object.

## Output Convention

| Stream   | Purpose                                           |
| -------- | ------------------------------------------------- |
| `stdout` | Machine-readable JSON only (when `--json` is set) |
| `stderr` | Human-readable progress, logs, warnings, errors   |

Never write progress to stdout. Use `outputResult` / `outputError` from `@agentrc/core/utils/output`. Use `shouldLog(options)` before writing stderr text. Use `createProgressReporter(silent)` for step-by-step progress.

`CommandResult<T>` shape: `{ ok, status: "success"|"partial"|"noop"|"error", data?, errors? }`.

## Skills

Built-in skills live in `plugin/skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`). They are copied to `dist/skills/` on build via `tsup.config.ts`'s `onSuccess` hook. Resolve the skills directory with `getSkillDirectory()` from `@agentrc/core/services/skills` — never hardcode paths.

## Code Conventions

- **Type imports**: always use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports` is enforced).
- **Import order**: alphabetical, grouped by node built-ins → external packages → internal (`@agentrc/core/*`) → relative. ESLint enforces this.
- **Tests**: test files live in `src/services/__tests__/` and use vitest. Default timeout is 10 s.
- **Unused vars**: prefix with `_` to suppress the lint warning.
- **Strict TypeScript**: `strict: true`, `moduleResolution: Bundler`, target `ES2022`.
