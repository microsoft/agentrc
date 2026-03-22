# Copilot Instructions for This Repository

**AgentRC** is a TypeScript CLI + VS Code extension for priming repositories for AI-assisted development. See `README.md` for full architecture, command reference, and service details.

## Development Checklist

All changes MUST be verified against this checklist before considered complete:

- [ ] Implementation covers both CLI and VS Code extension (if applicable)
- [ ] Ran lint/typecheck/test/build npm tasks. ALL PASSED
- [ ] Ran Review subagent. NO BLOCKERS reported

## Build & Test

```sh
npm run build          # tsup → dist/
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (flat config)
npm run test           # vitest (single run)
npm run test:watch     # vitest (watch mode)
```

Run without building: `npx tsx src/index.ts <command> [options]`

VS Code extension: `node esbuild.mjs` from `vscode-extension/`; typecheck with `npx tsc --noEmit` from there.

## Code Style

- ESM syntax everywhere (`"type": "module"`). TypeScript strict mode, ES2022 target.
- Do not add new build/lint/test tools; use existing npm scripts.

### Cross-Platform (Windows/macOS/Linux)

- Use `path.join()` for all file paths; avoid shell-specific syntax.
- **Spawning processes:** Never assume an executable is a native binary. On Windows, CLI tools often resolve to `.bat`/`.cmd` shims (e.g., VS Code globalStorage). Use `{ shell: true }` or detect script extensions and route through `cmd.exe /c` — bare `spawn()` of a `.bat` file throws `EINVAL`.
- **ESM/CJS interop in bundles:** When bundling CJS dependencies (e.g., `vscode-jsonrpc`) into ESM output, `require()` is unavailable at runtime. If a dependency internally calls `require()`, the tsup banner must inject a `createRequire` shim. Watch for `"Dynamic require of X is not supported"` errors after adding new dependencies.
- **File path separators:** Use `path.sep` or `path.normalize()` when comparing or displaying paths. Never hardcode `/` or `\` in path logic.

## Architecture

- **Entrypoint:** `src/index.ts` → `runCli()` in `src/cli.ts`
- **Commands** (`src/commands/`) are thin orchestrators — parse options, call services, format output.
- **Services** (`src/services/`) contain all business logic. Commands never access APIs or filesystem directly.
- **Core** (`packages/core/`) — shared service library; re-exported by CLI and extension via `@agentrc/core` path alias.
- **Plugin** (`plugin/`) — built-in agent plugin with SKILL.md files for instruction generation. Copied to `dist/skills/` (CLI) and `out/skills/` (extension) at build time. Marketplace manifest at `.github/plugin/marketplace.json`.
- **UI** (`src/ui/`) — Ink/React 19 components for interactive TUI. Use Ink 6 APIs.
- **Utils** (`src/utils/`) — `output.ts`, `fs.ts`, `logger.ts`, `repo.ts`, `pr.ts`.
- **VS Code Extension** (`vscode-extension/`) — companion extension; imports CLI services via path alias `agentrc/*`. See extension-specific instructions for details.

## Conventions

### Output Discipline

- `stdout` is for JSON only (with `--json`); **all human-readable output goes to `stderr`**.
- All commands MUST support `--json` and `--quiet` flags. Use `withGlobalOpts()` from `src/cli.ts` to merge global flags into command options.
- Commands return `CommandResult<T>` with `{ ok, status, data?, errors? }` (from `src/utils/output.ts`). Status values: `"success"`, `"partial"`, `"noop"`, `"error"`.
- Use `outputResult()` / `outputError()` for final output — never `console.log()`.

### File Safety

- Use `safeWriteFile()` from `src/utils/fs.ts` for all user-path file writes. It rejects symlinks and skips existing files unless `--force`.
- Use `validateCachePath()` to prevent traversal attacks in `.agentrc-cache/`.

### Error Handling

- Services throw meaningful `Error` messages. Commands catch and pass to `outputError()`.
- Don't re-wrap errors or add extra logging in catch blocks.

### Dependencies

- CLI uses Commander, simple-git, Octokit. VS Code extension uses the built-in `vscode.git` API — **never bundle `simple-git` in the extension**.
- Copilot SDK sessions use `workingDirectory` in `SessionConfig` for scoping.

## Testing

- **Framework:** Vitest. Tests live in `src/services/__tests__/` with `.test.ts` suffix.
- **Mocking:** Use `vi.fn()` for functions, `vi.spyOn()` for methods. No `vi.mock()` — inline mocks and factory helpers preferred.
- **Filesystem tests:** Use real temp directories (`os.tmpdir()` + `fs.mkdtemp`). Clean up in `afterEach()`.
- **Test naming:** `describe()` per function/export, `it()` names start with a verb and form a sentence.
- **No shared test utils** — helper functions are scoped to each test file's `describe()` block.

## Prerequisites

- **Copilot CLI** installed and authenticated for SDK calls
- **GitHub:** `GITHUB_TOKEN` or `GH_TOKEN` env var, or `gh` CLI
- **Azure DevOps:** `AZURE_DEVOPS_PAT` env var
