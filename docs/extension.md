# VS Code Extension

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

The AgentRC extension brings all CLI capabilities into VS Code with tree views, visual reports, and command palette access.

## Install

The extension is not yet published to the Marketplace. Build from source:

```bash
cd vscode-extension && npm install && node esbuild.mjs
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Commands

Open the Command Palette (`⇧⌘P`) and type `AgentRC`:

| Command                               | What it does                                |
| ------------------------------------- | ------------------------------------------- |
| **Init Repository**                   | Guided onboarding (analyze → generate)      |
| **Analyze Repository**                | Detect languages, frameworks, areas         |
| **Readiness Report**                  | Score and display readiness                 |
| **Generate Instructions**             | Generate instruction files via Copilot SDK  |
| **Generate Configs**                  | Generate MCP and VS Code configs            |
| **Run Eval**                          | Evaluate instruction quality                |
| **Scaffold Eval Config**              | Create starter `agentrc.eval.json`          |
| **Create Pull Request**               | Clone → generate → open PR                  |
| **Generate Instructions (All Roots)** | Batch generate across multi-root workspaces |

## Sidebar views

The AgentRC activity bar icon gives you three tree views:

- **Workspace Status** — Quick-glance Config and Evals status. Items are color-coded (green = found, yellow = missing) and clickable: missing Config triggers **Init Repository**, missing Evals triggers **Scaffold Eval Config**. Refreshes after `init` and eval scaffold commands.
- **Analysis** — Repo structure at a glance: languages, frameworks, detected areas
- **Readiness** — Pillar-by-pillar readiness breakdown with pass/fail indicators

All views refresh automatically when you run commands.

## Settings

Configure via **Settings** (`⌘,`) → search `agentrc`:

| Setting               | Default             | Description                    |
| --------------------- | ------------------- | ------------------------------ |
| `agentrc.model`       | `claude-sonnet-4.6` | Default model for generation   |
| `agentrc.judgeModel`  | _(uses model)_      | Model for eval judging         |
| `agentrc.autoAnalyze` | `false`             | Auto-analyze on workspace open |

## Extension vs CLI

Both use the same core services. Choose based on workflow:

| Use the extension when...                | Use the CLI when...                |
| ---------------------------------------- | ---------------------------------- |
| You want visual readiness reports        | You need CI/CD integration         |
| You prefer command palette over terminal | You're batch-processing repos      |
| You want sidebar tree views              | You want JSON output for scripting |
| You're working in a single repo          | You're automating across an org    |

## Multi-root workspaces

In multi-root workspaces, commands that target a single repo will prompt you to pick a folder. The **Generate Instructions (All Roots)** command processes all workspace folders at once.

## Next steps

- [Getting Started](getting-started.md) — CLI quickstart
- [Commands](commands.md) — full CLI reference (same capabilities, different interface)
- [Configuration](configuration.md) — `agentrc.config.json` for monorepos
