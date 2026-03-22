# Concepts

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

AgentRC is built around a simple loop: **measure** how AI-ready a repo is, **generate** the files that close the gaps, and **maintain** quality as code evolves. This page explains the key ideas behind each step.

## The AI-readiness problem

AI coding agents are only as effective as the context they receive. A Copilot chat session that knows your repo uses React 19 with Server Components, follows a specific naming convention, and has a particular testing strategy will produce dramatically better code than one that doesn't.

Most repos lack this structured context. AgentRC fills the gap by analyzing your repo and generating the instruction files, configs, and evaluations that teach AI agents how your codebase works.

## Maturity model

AgentRC maps every repo to a 5-level maturity model:

| Level | Name             | What it means                                       |
| ----- | ---------------- | --------------------------------------------------- |
| 1     | **Functional**   | Builds, tests, basic tooling in place               |
| 2     | **Documented**   | README, CONTRIBUTING, custom instructions exist     |
| 3     | **Standardized** | CI/CD, security policies, CODEOWNERS, observability |
| 4     | **Optimized**    | MCP servers, custom agents, AI skills configured    |
| 5     | **Autonomous**   | Full AI-native development with minimal oversight   |

The maturity level is computed from the readiness score (see below). Use `--fail-level` in CI to enforce a minimum level:

```bash
agentrc readiness --fail-level 3
```

## Readiness pillars

The readiness score is based on 9 pillars, grouped into two categories:

### Repo Health

These pillars measure general engineering maturity — things that benefit any development workflow, not just AI:

| Pillar              | What it checks                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| **Style**           | Linter config (ESLint/Biome/Prettier), type-checking config (TypeScript/Mypy) |
| **Build**           | Build script in package.json, CI workflow config                              |
| **Testing**         | Test script in package.json, area-scoped test scripts                         |
| **Docs**            | README, CONTRIBUTING guide, area-scoped READMEs                               |
| **Dev Environment** | Lockfile (npm/pnpm/yarn/bun), `.env.example`                                  |
| **Code Quality**    | Formatter config (Prettier/Biome)                                             |
| **Observability**   | Observability dependencies (OpenTelemetry, Pino, Winston, Bunyan)             |
| **Security**        | LICENSE, CODEOWNERS, SECURITY.md, Dependabot config                           |

### AI Setup

These pillars measure how well the repo is prepared for AI-assisted development:

| Pillar         | What it checks                                             |
| -------------- | ---------------------------------------------------------- |
| **AI Tooling** | Custom instructions, MCP servers, agent configs, AI skills |

At Level 2+, AgentRC also checks **instruction consistency** — if your repo has multiple instruction files (`copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`), it detects whether they diverge and suggests consolidation.

## Instructions

Instructions are the core output of AgentRC — Markdown files that teach AI coding agents about your repo's conventions, architecture, and preferences.

### How instructions work in VS Code

VS Code supports several types of instruction files. AgentRC generates the most common ones:

| File                              | Scope                      | When to use                                                    |
| --------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `AGENTS.md`                       | Always-on, whole workspace | **Recommended** — works with Copilot, Claude, and other agents |
| `.github/copilot-instructions.md` | Always-on, whole workspace | Copilot-only repos                                             |
| `.instructions.md` files          | File-pattern or task-based | Targeted rules for specific file types, languages, or folders  |

> **Deep dive:** See [Custom instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions) for the full reference on instruction file types, priority rules, and the YAML frontmatter format.

### How AgentRC generates instructions

Instructions are **generated, not templated**. AgentRC uses the Copilot SDK to analyze your actual repo content — languages, frameworks, directory structure, existing conventions — and produce instructions tailored to what it finds. No generic boilerplate.

```bash
# Generate an AGENTS.md (recommended)
agentrc instructions --output AGENTS.md

# Generate Copilot-only instructions
agentrc instructions
```

### Flat vs nested strategy

For larger repos, you can choose how instructions are organized:

- **`flat`** (default) — A single instructions file at the repo root. Simple, easy to review.
- **`nested`** — A hub file at the root plus per-topic detail files in an `.agents/` directory. Better for large repos where a single file would be unwieldy.

```bash
agentrc instructions --strategy nested
```

### Area-scoped instructions

In monorepos, different parts of the codebase often need different instructions. AgentRC supports generating per-area instructions:

```bash
# Generate root + all detected areas
agentrc instructions --areas

# Generate for a single area
agentrc instructions --area frontend

# Generate areas only (skip root)
agentrc instructions --areas-only
```

Areas are defined in `agentrc.config.json` or auto-detected by `agentrc init`. See [Configuration](configuration.md) for details.

> **Tip:** Per-area instructions map well to VS Code's `.instructions.md` files with `applyTo` patterns. See [File-based instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions#_use-instructionsmd-files) for how VS Code discovers and applies them.

## Evaluation

How do you know your instructions actually help? AgentRC includes an evaluation framework that measures the impact of instructions on AI responses.

### How it works

1. **Scaffold test cases** from your codebase — AgentRC generates implementation planning tasks that test whether the AI follows your repo's conventions:

   ```bash
   agentrc eval --init
   ```

2. **Run the evaluation** — For each test case, the evaluator compares AI responses with and without your instructions:

   ```bash
   agentrc eval agentrc.eval.json
   ```

3. **Score with a judge model** — A separate AI model evaluates whether the instructed response is better, producing a pass/fail verdict per test case.

### Eval config format

Each test case has a `prompt` (what the agent receives) and an `expectation` (what the judge checks for). Expectations can be a single string or an array of strings for structured criteria:

```json
{
  "cases": [
    {
      "id": "add-feature",
      "prompt": "Add a new CLI command that lists all detected areas",
      "expectation": [
        "Identify which files to create/modify and how the command wires into the CLI.",
        "Implementation steps: create command file, call analyzer, format output.",
        "Verification: typecheck passes, unit tests, manual test against a monorepo."
      ]
    }
  ]
}
```

All AgentRC JSON files support `//` and `/* */` comments (JSONC).

### Using evaluation as a CI gate

Set a minimum pass rate to prevent instruction drift:

```bash
agentrc eval agentrc.eval.json --fail-level 80
```

This exits with code 1 if the pass rate drops below 80%, making it easy to integrate into GitHub Actions or Azure Pipelines.

## Configs

Beyond instructions, AgentRC generates development environment configs:

- **`.vscode/mcp.json`** — [MCP server](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) configuration based on your detected stack (databases, APIs, frameworks)
- **`.vscode/settings.json`** — VS Code settings tuned for AI-assisted development

```bash
agentrc generate mcp
agentrc generate vscode
```

> **Deep dive:** See [Customize AI in VS Code](https://code.visualstudio.com/docs/copilot/customization/overview) for the full picture of how instructions, MCP servers, prompt files, custom agents, and other customizations work together.

## Policies

Policies let organizations customize the readiness scoring to match their standards. A policy can:

- **Disable** criteria that don't apply to your stack
- **Override** scoring metadata (impact, required level)
- **Set thresholds** for pass rates

```bash
agentrc readiness --policy ./policies/strict.json
```

AgentRC ships with example policies for common scenarios:

| Policy                  | Use case                                           |
| ----------------------- | -------------------------------------------------- |
| `strict.json`           | High bar — all criteria enabled, strict thresholds |
| `ai-only.json`          | Focus on AI setup pillars only                     |
| `repo-health-only.json` | Focus on repo health pillars only                  |

See [Policies](policies.md) for the full policy authoring guide.

## Batch workflows

Everything that works on one repo also works on hundreds. See [At Scale](at-scale.md) for batch processing across GitHub organizations and Azure DevOps projects.

## What's next

- [Getting Started](getting-started.md) — install and run your first assessment
- [Commands](commands.md) — full CLI reference
- [Configuration](configuration.md) — set up `agentrc.config.json` for monorepos
- [Policies](policies.md) — author custom readiness policies
- [At Scale](at-scale.md) — batch processing and automated PRs across orgs
- [CI Integration](ci-integration.md) — GitHub Actions and Azure Pipelines
- [VS Code Extension](extension.md) — sidebar views, commands, settings
- [Customize AI in VS Code](https://code.visualstudio.com/docs/copilot/customization/overview) — the full customization ecosystem
