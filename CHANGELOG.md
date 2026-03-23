# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Features

- **`--dry-run` for generate** — preview which files would be created or skipped without writing anything (`agentrc generate mcp --dry-run`)
- **JSONC support** — `agentrc.config.json`, `agentrc.eval.json`, and policy files now accept `//` and `/* */` comments
- **Array eval expectations** — `expectation` field in eval configs accepts `string[]` for structured criteria
- **Config status in TUI** — the interactive TUI now shows whether `agentrc.config.json` is present, with a `[C]` keybinding to scaffold it when missing (#74)
- **Workspace Status view in VS Code** — a new **Workspace Status** tree view in the AgentRC sidebar surfaces Config and Evals presence, with clickable items that trigger `agentrc init` or `agentrc eval --init` respectively (#74)

### Bug Fixes

- **Config scaffolding for simple repos** — `agentrc init` and the TUI now create `agentrc.config.json` even when no areas are detected, producing a minimal `{}` stub. Previously failed with "No areas detected. Cannot scaffold agentrc.config.json." (#79)
- **TUI model/eval picker blank on discovery failure** — the model picker now falls back to a preferred model list when CLI model discovery fails or returns empty, so the picker always renders (#78)
- **TUI screen artifacts on resize** — resizing the terminal while the TUI is open no longer produces stacked ghost renders of the banner (#76)

### Dependencies

- Bump `@github/copilot-sdk` from 0.1.32 to 0.2.0 (#73)

## [2.1.0]

### Features

- **Agent plugin & marketplace** — expose built-in instruction-generation skills as a VS Code agent plugin (`plugin/`) with marketplace manifest (`.github/plugin/marketplace.json`). Skills can be installed from source or discovered through the marketplace.
- **SKILL.md-based prompts** — replace hardcoded inline prompts with SKILL.md assets loaded via the Copilot SDK `skillDirectories` option and invoked with `/skill-name` prefixes.
- **Enhanced .NET detection** — F# support, framework parsing, and expanded signals (#60)
- **De-branded terminology** — `--dry-run` flag, batch instructions command (#55)

### Bug Fixes

- Fix instruction generation error: `Dynamic require of "util" is not supported` (#52)
- Fix Windows `.bat`/`.cmd` shim spawn failure in `copilotSdk.ts` (#53)

### Documentation

- Rewrite README as concise landing page, add 8 user-facing doc pages (getting-started, concepts, commands, configuration, policies, ci-integration, at-scale, extension) (#62)
- Add cross-platform guidance for process spawning and ESM/CJS interop

### Dependencies

- Bump `simple-git` production dependency (#49)
- Bump `github/gh-aw` from 0.50.5 to 0.57.2 (#51)
- Bump `actions/download-artifact` from 6.0.0 to 8.0.0 (#48)
- Bump dev dependencies (#50)
- Bump `undici` in vscode-extension (#59)

## [2.0.0]

### Complete Rewrite

AgentRC vNext is a complete rewrite as a TypeScript CLI tool (ESM, strict, ES2022) for priming repositories for AI-assisted development and evaluation.

### New Commands

- **`agentrc readiness`** — AI readiness report scoring repos across 9 pillars (style, build, testing, docs, dev-env, code-quality, observability, security, AI tooling) with a 5-level maturity model (Functional → Autonomous).
- **`agentrc readiness --visual`** — GitHub-themed HTML report with light/dark toggle, expandable pillar details, and maturity model descriptions.
- **`agentrc readiness --per-area`** — Per-area readiness scoring for monorepos with area-scoped criteria and aggregate thresholds.
- **`agentrc readiness --policy`** — Customizable readiness policies (disable/override criteria, tune thresholds) via JSON, JS/TS, or npm packages; chainable with last-wins semantics.
- **`agentrc batch-readiness`** — Consolidated visual readiness report across multiple repositories, with `--policy` support.
- **`agentrc generate instructions`** — Generate `copilot-instructions.md` via Copilot SDK, with `--per-app` support for monorepos.
- **`agentrc generate agents`** — Generate `AGENTS.md` guidance files.
- **`agentrc instructions --areas`** — Generate file-based `.instructions.md` files scoped to detected areas with `applyTo` glob patterns.
- **`agentrc eval --init`** — AI-powered eval scaffold generation that analyzes codebases and produces cross-cutting, area-aware eval cases.
- **`agentrc eval --list-models`** — List available Copilot CLI models.
- **`agentrc analyze`** — Standalone repo analysis command with structured `--json` output.

### VS Code Extension

- 8 command palette commands: Analyze, Generate Configs, Generate Instructions, AI Readiness Report, Run Eval, Scaffold Eval, Initialize Repository, Create PR.
- Sidebar tree views: Analysis (languages, frameworks, monorepo areas) and Readiness (9-pillar scores with color-coded criteria).
- Webview panels for readiness HTML reports and eval results.
- Dynamic status bar showing detected languages after analysis.
- PR creation with default-branch guard, selective file staging, and GitHub auth via VS Code API.
- esbuild-bundled CJS output; CI typecheck and release-time VSIX packaging.

### New Features

- **Azure DevOps integration** — Full support for batch processing, PR creation, and repo cloning via Azure DevOps PAT authentication.
- **Headless automation** — Global `--json` and `--quiet` flags on all commands; `CommandResult<T>` envelope with `ok`/`status`/`data`/`errors`. Headless batch mode via positional args or stdin piping.
- **Policy system** — Layered policy chain for readiness reports: disable/override criteria, add extras, tune pass-rate thresholds. Config-sourced policies restricted to JSON-only for security.
- **Per-area readiness** — 4 area-scoped criteria (`area-readme`, `area-build-script`, `area-test-script`, `area-instructions`) with 80% aggregate pass threshold.
- **File-based area instructions** — `.instructions.md` files with YAML frontmatter (`description`, `applyTo`) for VS Code Copilot area scoping.
- **Expanded monorepo detection** — Bazel (`MODULE.bazel`/`WORKSPACE`), Nx (`project.json`), Pants (`pants.toml`), Turborepo overlay, in addition to Cargo, Go, .NET, Gradle, Maven, npm/pnpm/yarn workspaces.
- **Smart area fallback** — Large repos with 10+ top-level dirs automatically discover areas via heuristic scanning with symlink-safe directory traversal.
- **Eval trajectory viewer** — Interactive HTML viewer comparing responses with/without instructions, including token usage, tool call metrics, and duration tracking.
- **Windows Copilot CLI support** — `.cmd`/`.bat` wrapper handling via `cmd /c`, npm-loader.js detection, and `CopilotCliConfig` type replacing bare string paths.
- **Copilot CLI discovery** — Cross-platform discovery with TTL caching and glob-based fallback for VS Code extension paths.
- **Centralized model defaults** — Default model set to `claude-sonnet-4.5` via `src/config.ts`.

### Improvements

- All file write paths now use `safeWriteFile()` — instructions, agents, and area files all reject symlinks and respect `--force`.
- Unified `agentrc pr` command: both GitHub and Azure DevOps generate all three artifacts (instructions + MCP + VS Code configs) with consistent branch naming.
- `CommandResult<T>` output envelope with structured JSON to stdout; human-readable output to stderr.
- `ProgressReporter` interface for silent or human-readable progress across CLI and headless modes.
- Symlink-safe directory scanning via `isScannableDirectory()` with `lstat` + `realpath` containment checks.
- Path traversal protection via `validateCachePath` for cloned repo paths and double-layer defense for area `applyTo` patterns.
- Credential sanitization in git push error messages to prevent token leaks.
- `buildAuthedUrl` utility supporting both GitHub (`x-access-token`) and Azure DevOps (`pat`) auth.
- `checkRepoHasInstructions` now re-throws non-404 errors instead of silently returning false.
- `init --yes` now generates instructions, MCP, and VS Code configs (previously only instructions).
- CSP meta tags added to eval and readiness HTML report generators.

### Removed

- Removed stub commands: `templates`, `update`, `config`.
- Removed `src/utils/cwd.ts` — replaced by Copilot SDK `workingDirectory` session config.

### Testing & Tooling

- Vitest test framework with 267 tests across 13 test files covering analyzer, generator, git, readiness, visual report, fs utilities, cache path validation, policies, boundaries, CLI, output utilities, and PR helpers.
- ESLint flat config with TypeScript, import ordering, and Prettier integration.
- CI workflow with lint, typecheck, tests (Node 20/22, Ubuntu/macOS/Windows), build verification, and extension typecheck.
- CI dogfooding: runs `agentrc analyze --json` and `agentrc readiness --json` on the repo itself.
- Release automation via release-please with VSIX packaging for the VS Code extension.
- Code coverage via `@vitest/coverage-v8`.

### Project Setup

- Added CONTRIBUTING.md, SECURITY.md, LICENSE (MIT), and CODEOWNERS.
- Added issue templates (bug report, feature request) and PR template.
- Added `.github/agents/` with multi-model code review agents (Opus, Gemini, Codex).
- Added `.github/prompts/` with reusable prompts (deslop, review, generate-improvements).
- Added examples folder with sample eval config and CLI usage guide.
- Added `.prettierrc.json` with project formatting rules.
