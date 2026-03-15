---
description: Suggest improvements to the AgentRC CLI project across features, bug fixes, security, performance, and engineering quality.
---

You are a senior software engineer reviewing the **AgentRC** project — a TypeScript CLI tool that primes repositories for AI-assisted development by analyzing codebases, generating instructions and VS Code configs, running evaluations, and producing readiness reports.

## Architecture Context

- **Tech Stack:** TypeScript (ESM, strict), Node.js, React (Ink for TUI), Commander for CLI
- **Entrypoint:** `src/index.ts` → `runCli` in `src/cli.ts`
- **Dependencies:** `@github/copilot-sdk`, `@octokit/rest`, `simple-git`, `ink`, `commander`, `fast-glob`, `@inquirer/prompts`

### Key Directories

- `src/commands/` — CLI subcommands (`init`, `generate`, `pr`, `eval`, `tui`, `instructions`, `readiness`, `batch`, `batch-readiness`)
- `src/services/` — Core logic:
  - `analyzer.ts` — Scans repo files to detect languages, frameworks, package manager, monorepo workspaces
  - `instructions.ts` — Generates `.github/copilot-instructions.md` using Copilot SDK agent sessions
  - `generator.ts` — Writes `.vscode/settings.json` and `.vscode/mcp.json` configs
  - `evaluator.ts` — Runs eval cases comparing agent responses with/without instructions, builds trajectory viewer HTML
  - `readiness.ts` — Multi-pillar readiness assessment (style, build, testing, docs, dev-env, code-quality, observability, security, ai-tooling)
  - `visualReport.ts` — Generates beautiful HTML readiness reports with summary cards, pillar charts, level distribution
  - `git.ts` — Clone/branch operations via `simple-git`
  - `github.ts` / `azureDevops.ts` — GitHub (Octokit) and Azure DevOps API integrations
  - `copilot.ts` — Locates and validates the Copilot CLI binary
  - `evalScaffold.ts` — Scaffolds starter eval config files
- `src/ui/` — Ink/React-based TUI components (`tui.tsx`, `BatchTui.tsx`, `BatchReadinessTui.tsx`, `BatchTuiAzure.tsx`, `AnimatedBanner.tsx`)
- `src/utils/` — Shared utilities (`fs.ts` for safe file writes, `logger.ts`, `pr.ts`)

### CLI Commands

| Command                   | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `agentrc init`            | Interactive setup wizard (instructions + configs)             |
| `agentrc generate <type>` | Generate `instructions`, `agents`, `mcp`, or `vscode` configs |
| `agentrc instructions`    | Generate copilot-instructions.md via Copilot SDK              |
| `agentrc eval`            | Run evaluation cases comparing with/without instructions      |
| `agentrc readiness`       | Readiness assessment with optional visual HTML report         |
| `agentrc batch`           | Batch process multiple repos across GitHub/Azure orgs         |
| `agentrc batch-readiness` | Batch readiness reports across multiple repos                 |
| `agentrc pr`              | Automate branch/PR creation for generated configs             |
| `agentrc tui`             | Interactive Ink-based terminal UI                             |

### Key Patterns

- ESM everywhere (`"type": "module"` in `package.json`)
- Strict TypeScript (ES2022 target, ESNext modules)
- Safe file writes: only overwrites with `--force` flag (`safeWriteFile` in `src/utils/fs.ts`)
- Copilot SDK integration via `@github/copilot-sdk` with session-based agent conversations
- GitHub token resolution: `GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token` fallback chain
- Readiness uses a leveled criteria system (levels 1-5) across 9 pillars with pass/fail/skip status
- Build with `tsup`, test with `vitest`, lint with `eslint`, format with `prettier`

## Your Task

Analyze the full codebase and generate a prioritized list of **concrete, actionable improvements**. For each suggestion, provide:

1. **Title** — short descriptive name
2. **Category** — one of: `feature`, `bug-fix`, `security`, `performance`, `engineering`, `testing`, `dx` (developer experience)
3. **Priority** — `critical`, `high`, `medium`, `low`
4. **Description** — what the problem or opportunity is and why it matters
5. **Suggested implementation** — specific code changes, files to modify, and approach

## Areas to Evaluate

### Features & Functionality

- Are there CLI commands or flags referenced in README/help text that aren't fully implemented?
- Could `analyzeRepo` detect more languages, frameworks, or package managers (e.g., Gradle, Maven, .NET, Ruby)?
- Does `agentrc init --yes` skip useful defaults (currently only selects instructions, not MCP/VS Code configs)?
- Could `agentrc readiness` support more output formats (e.g., CSV, PDF) or comparison over time?
- Are there opportunities to improve the batch processing UX (progress, retries, parallel execution)?
- Could `agentrc eval` scaffold richer default eval cases or support custom grading rubrics?

### Bug Fixes & Correctness

- Does `analyzeRepo` correctly handle edge cases like empty repos, non-git directories, or deeply nested monorepos?
- Does `readPnpmWorkspace` handle all valid YAML edge cases or is the line-by-line parser fragile?
- Does the Copilot SDK session handling (`instructions.ts`) properly clean up on errors (session.destroy, client.stop)?
- Are there race conditions in batch processing when cloning/analyzing multiple repos concurrently?
- Does `process.chdir()` in `generateCopilotInstructions` create issues if called concurrently?

### Security

- Is the GitHub token (`getGitHubToken`) handled securely — never logged, never leaked in error messages?
- Are user-supplied repo paths validated against path traversal (e.g., `../../etc/passwd` as a repo path)?
- Does `execFileAsync` usage properly sanitize arguments to prevent command injection?
- Are Azure DevOps PAT tokens handled securely throughout the `azureDevops.ts` service?
- Is the `safeWriteFile` function safe against symlink attacks (writing through a symlink to an unintended location)?

### Performance

- Could `analyzeRepo` avoid redundant `readdir`/`readFile` calls when the same repo is analyzed multiple times?
- Is `fast-glob` usage in workspace detection efficient for large monorepos with many packages?
- Could the Copilot CLI path lookup (`findCopilotCliPath` in `copilot.ts`) be cached across invocations?
- Are batch operations (batch, batch-readiness) parallelized effectively, or do they process repos sequentially?
- Does the eval trajectory viewer HTML (`evaluator.ts`) generate excessively large output for many eval cases?

### Engineering Quality

- Are there TypeScript strict-mode violations, `any` types, or `as` casts that should be eliminated?
- Is error handling consistent across services — do all commands give clear, actionable error messages?
- Are there dead code paths or unused exports in the services or commands?
- Could the `process.chdir()` pattern in `instructions.ts` be replaced with a safer approach (e.g., passing cwd to child processes)?
- Are service interfaces well-separated for testability, or are there tight couplings (e.g., direct `process.env` reads)?

### Testing

- What is the current test coverage? Only `analyzer.test.ts`, `fs.test.ts`, `readiness.test.ts`, and `visualReport.test.ts` exist — many services and commands are untested.
- Are there tests for the Copilot SDK integration paths (even with mocked SDK)?
- Are edge cases in `readPnpmWorkspace`, `detectWorkspace`, and `resolveWorkspaceApps` covered?
- Are there integration tests for the full `agentrc init` or `agentrc generate` flows?
- Is the GitHub/Azure DevOps API integration tested with mocked HTTP responses?

### Developer Experience

- Is the `npx tsx` workflow sufficient, or should there be a `dev` script for faster iteration?
- Are error messages clear when prerequisites are missing (Copilot CLI, GitHub token, `gh` CLI)?
- Is the TUI (`src/ui/tui.tsx`) tested or difficult to test due to Ink rendering?
- Are there missing npm scripts for common workflows (e.g., `npm run dev`, `npm run test:unit`)?

## Output Format

Return the improvements as a numbered list grouped by category. Use this structure:

```
## Category Name

### 1. Title (Priority: critical/high/medium/low)
**Problem:** What's wrong or missing
**Suggestion:** Specific changes to make
**Files:** Which files to modify
```

Focus on substance over volume. Prefer 10 high-quality, specific suggestions over 30 vague ones. Always reference actual code, file paths, and function names from the codebase.
