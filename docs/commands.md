# Commands

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

Full CLI reference. Run any command with `npx github:microsoft/agentrc <command>`. All commands support `--json` and `--quiet` global flags.

## Global options

| Flag           | Effect                        |
| -------------- | ----------------------------- |
| `--json`       | Structured JSON to stdout     |
| `--quiet`      | Suppress stderr progress      |
| `--accessible` | Screen-reader friendly output |

JSON output uses a `CommandResult<T>` envelope:

```json
{ "ok": true, "status": "success", "data": { ... } }
```

---

## `agentrc init`

Interactive repo onboarding — analyzes your stack and generates instructions and configs in one pass.

```bash
agentrc init [path]
```

| Flag             | Default             | Description                         |
| ---------------- | ------------------- | ----------------------------------- |
| `--github`       |                     | Use a GitHub repository             |
| `--provider <p>` |                     | `github` or `azure`                 |
| `--yes`          |                     | Accept all defaults (headless mode) |
| `--force`        |                     | Overwrite existing files            |
| `--model <name>` | `claude-sonnet-4.6` | Model for generation                |

For monorepos, auto-detects workspaces and creates `agentrc.config.json`.

---

## `agentrc analyze`

Inspect repo structure — languages, frameworks, monorepo layout, areas.

```bash
agentrc analyze [path]
```

| Flag              | Default | Description                     |
| ----------------- | ------- | ------------------------------- |
| `--output <path>` |         | Write report (`.json` or `.md`) |
| `--force`         |         | Overwrite existing output       |

---

## `agentrc readiness`

Score readiness across 9 pillars. See [Concepts — Readiness pillars](concepts.md#readiness-pillars).

```bash
agentrc readiness [path]
```

| Flag                 | Default | Description                                  |
| -------------------- | ------- | -------------------------------------------- |
| `--output <path>`    |         | Write report (`.json`, `.md`, or `.html`)    |
| `--force`            |         | Overwrite existing output                    |
| `--visual`           |         | Generate HTML report                         |
| `--per-area`         |         | Include per-area breakdown                   |
| `--policy <sources>` |         | Comma-separated policy paths or npm packages |
| `--fail-level <n>`   |         | Exit 1 if maturity level < n (1–5)           |

---

## `agentrc instructions`

Generate tailored instruction files via the Copilot SDK.

```bash
agentrc instructions
```

| Flag                | Default                           | Description                             |
| ------------------- | --------------------------------- | --------------------------------------- |
| `--repo <path>`     | cwd                               | Repository path                         |
| `--output <path>`   | `.github/copilot-instructions.md` | Output file                             |
| `--model <name>`    | `claude-sonnet-4.6`               | Model for generation                    |
| `--force`           |                                   | Overwrite existing area files           |
| `--strategy <mode>` | `flat`                            | `flat` or `nested`                      |
| `--areas`           |                                   | Also generate for detected areas        |
| `--areas-only`      |                                   | Only area instructions (skip root)      |
| `--area <name>`     |                                   | Single area                             |
| `--claude-md`       |                                   | Also generate `CLAUDE.md` (nested only) |
| `--dry-run`         |                                   | Preview without writing                 |

See [Concepts — Instructions](concepts.md#instructions) for strategy and area details.

---

## `agentrc eval`

Evaluate instruction quality with a judge model.

```bash
agentrc eval [path]          # path to eval config (default: ./agentrc.eval.json)
agentrc eval --init          # scaffold test cases
```

| Flag                   | Default             | Description                                    |
| ---------------------- | ------------------- | ---------------------------------------------- |
| `--repo <path>`        | cwd                 | Repository path                                |
| `--model <name>`       | `claude-sonnet-4.6` | Model for responses                            |
| `--judge-model <name>` | `claude-sonnet-4.6` | Model for judging                              |
| `--list-models`        |                     | List available models and exit                 |
| `--output <path>`      |                     | Write results JSON                             |
| `--init`               |                     | Scaffold starter eval config                   |
| `--count <n>`          | `5`                 | Number of test cases to generate with `--init` |
| `--fail-level <n>`     |                     | Exit 1 if pass rate < n%                       |

See [Concepts — Evaluation](concepts.md#evaluation) for how scoring works.

---

## `agentrc generate`

Generate MCP and VS Code configs.

```bash
agentrc generate <type> [path]
```

Types: `mcp`, `vscode` (also `instructions` and `agents`, but deprecated — use `agentrc instructions`).

| Flag                | Default             | Description              |
| ------------------- | ------------------- | ------------------------ |
| `--force`           |                     | Overwrite existing files |
| `--model <name>`    | `claude-sonnet-4.6` | Model for generation     |
| `--strategy <mode>` | `flat`              | Instruction strategy     |

---

## `agentrc batch`

Batch-process repos across a GitHub org or Azure DevOps project. See [At Scale](at-scale.md) for detailed usage and examples.

```bash
agentrc batch                              # interactive TUI
agentrc batch owner/repo1 owner/repo2      # GitHub (headless)
agentrc batch org/project/repo --provider azure  # Azure DevOps
```

| Flag              | Default             | Description          |
| ----------------- | ------------------- | -------------------- |
| `--output <path>` |                     | Write results JSON   |
| `--provider <p>`  | `github`            | `github` or `azure`  |
| `--model <name>`  | `claude-sonnet-4.6` | Model for generation |
| `--branch <name>` |                     | Branch name for PRs  |

Repos can also be piped via stdin (one per line).

---

## `agentrc batch-readiness`

Consolidated readiness report across multiple repos.

```bash
agentrc batch-readiness --output team.html
```

| Flag                 | Default | Description                                  |
| -------------------- | ------- | -------------------------------------------- |
| `--output <path>`    |         | Write HTML report                            |
| `--policy <sources>` |         | Comma-separated policy paths or npm packages |

---

## `agentrc pr`

Clone a repo, generate configs, and open a PR. See [At Scale](at-scale.md) for the full workflow.

```bash
agentrc pr owner/repo-name                      # GitHub
agentrc pr org/project/repo --provider azure    # Azure DevOps
```

| Flag              | Default                 | Description          |
| ----------------- | ----------------------- | -------------------- |
| `--branch <name>` | `agentrc/add-ai-config` | Branch name          |
| `--provider <p>`  |                         | `github` or `azure`  |
| `--model <name>`  | `claude-sonnet-4.6`     | Model for generation |

---

## `agentrc tui`

Interactive terminal UI for all workflows.

```bash
agentrc tui
```

| Flag             | Default | Description          |
| ---------------- | ------- | -------------------- |
| `--repo <path>`  | cwd     | Repository path      |
| `--no-animation` |         | Skip animated banner |

## Next steps

- [Concepts](concepts.md) — understand maturity model and readiness pillars
- [Configuration](configuration.md) — `agentrc.config.json` for areas, workspaces, monorepos
- [At Scale](at-scale.md) — batch processing and automated PRs
- [CI Integration](ci-integration.md) — use `--fail-level` and `--json` in pipelines
