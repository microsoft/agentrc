# AgentRC — AI Repository Setup

Prime your repositories for AI-assisted development, right from VS Code.

## Getting Started

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for **AgentRC** — or click the **AgentRC** icon in the Activity Bar to start from the sidebar.

First time? Run **AgentRC: Get Started** (or open the walkthrough from the Welcome tab) for a guided 5-step setup.

## Features

### Analyze Repository

Detect languages, frameworks, package managers, and monorepo structure. Results populate the **Analysis** tree view in the sidebar.

`AgentRC: Analyze Repository`

### Readiness Report

Score your repo across **9 pillars** grouped into **Repo Health** and **AI Setup**, with maturity levels from Functional (1) to Autonomous (5).

- Interactive HTML report with dark/light theme
- Drill-down into criteria in the **Readiness** tree view
- Pass/fail icons with evidence for each criterion

`AgentRC: Readiness Report`

### Generate Instructions

Create AI instruction files using the Copilot SDK. Choose your format:

- **copilot-instructions.md** — GitHub Copilot's native format
- **AGENTS.md** — Broader agent format at repo root

For monorepos, pick specific areas to generate per-area instruction files with `applyTo` scoping.

`AgentRC: Generate Instructions`

In multi-root workspaces, generate instructions for all workspace roots at once.

`AgentRC: Generate Instructions (All Roots)`

### Generate Configs

Set up MCP servers (`.vscode/mcp.json`) and VS Code settings (`.vscode/settings.json`) tuned to your project.

`AgentRC: Generate Configs`

### Evaluate Instructions

Measure how much your instructions improve AI responses by comparing with/without using a judge model. Results display in an interactive viewer inside VS Code.

`AgentRC: Run Eval` · `AgentRC: Scaffold Eval Config`

### Initialize Repository

One command to analyze, generate instructions, and create configs:

`AgentRC: Initialize Repository`

### Create Pull Request

Commit AgentRC-generated files and open a PR directly from VS Code. Supports both **GitHub** and **Azure DevOps** repositories — the platform is detected automatically from your git remote.

`AgentRC: Create Pull Request`

## Sidebar Views

The **AgentRC** Activity Bar icon opens three tree views:

| View                  | Contents                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace Status**  | Config and Evals presence — green when found, yellow when missing. Click a missing item to scaffold it (`agentrc init` or `agentrc eval --init`). |
| **Analysis**          | Languages, frameworks, monorepo areas — with action buttons for instructions and configs                                                                 |
| **Readiness**         | Maturity level, pillar groups (Repo Health / AI Setup), criteria pass/fail with evidence tooltips                                                        |

All views show welcome screens with action buttons when no data is loaded yet.

## Settings

| Setting               | Default             | Description                                        |
| --------------------- | ------------------- | -------------------------------------------------- |
| `agentrc.model`       | `claude-sonnet-4.6` | Default Copilot model for generation               |
| `agentrc.autoAnalyze` | `false`             | Automatically analyze repository on workspace open |
| `agentrc.judgeModel`  | _(uses model)_      | Copilot model for judging eval responses           |

## Requirements

- **VS Code 1.109.0+**
- **GitHub Copilot Chat extension** (provides the Copilot CLI)
- **Copilot authentication** — run `copilot` → `/login` in your terminal
- **GitHub account** — for GitHub PR creation (authenticated via VS Code)
- **Microsoft account** _(optional)_ — for Azure DevOps PR creation (authenticated via VS Code)

## Links

- [AgentRC CLI on GitHub](https://github.com/microsoft/agentrc)
- [Contributing Guide](https://github.com/microsoft/agentrc/blob/main/CONTRIBUTING.md)
- [License (MIT)](https://github.com/microsoft/agentrc/blob/main/LICENSE)
