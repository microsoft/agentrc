# Getting Started

> [AgentRC](https://github.com/microsoft/agentrc) — prime your repositories for AI-assisted development.

## Prerequisites

- **Node.js 20+**
- **GitHub Copilot CLI** — bundled with the [VS Code Copilot Chat extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat). Run `copilot` → `/login` to authenticate.
- **Git host auth** — GitHub: `gh` CLI or `GITHUB_TOKEN`/`GH_TOKEN` env var. Azure DevOps: `AZURE_DEVOPS_PAT` (or `AZDO_PAT`) env var.

## Run

No install needed:

```bash
npx github:microsoft/agentrc
```

The TUI is an interactive menu where you can generate instructions, score readiness, run evals, and batch-process repos — all from one place. On first run, start with **init** to scaffold everything in one pass:

```bash
npx github:microsoft/agentrc init
```

`init` analyzes your repo, scores readiness, and generates tailored instructions and configs. Commit the output:

| File                              | What it does                               |
| --------------------------------- | ------------------------------------------ |
| `.github/copilot-instructions.md` | Teaches AI agents your repo’s conventions  |
| `.vscode/mcp.json`                | Connects AI to your stack's tools and data |
| `.vscode/settings.json`           | Tunes VS Code for AI-assisted dev          |

> **Tip:** For multi-agent support (Copilot + Claude + others), also generate `AGENTS.md`:
>
> ```bash
> npx github:microsoft/agentrc instructions --output AGENTS.md
> ```
>
> See [Custom instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions) for details on instruction file types.

## Verify

Measure whether your instructions actually improve AI responses:

```bash
npx github:microsoft/agentrc eval --init   # scaffold test cases
npx github:microsoft/agentrc eval          # run evaluation
```

## Keep it green

Add to CI to catch drift:

```bash
npx github:microsoft/agentrc readiness --fail-level 3 --json    # gate on maturity level
npx github:microsoft/agentrc eval --fail-level 80 --json        # gate on eval pass rate
```

See [CI Integration](ci-integration.md) for full GitHub Actions and Azure Pipelines examples.

## Next steps

- [Concepts](concepts.md) — maturity model, readiness pillars, how instructions are generated
- [Commands](commands.md) — full CLI reference
- [Configuration](configuration.md) — `agentrc.config.json` for monorepos
- [At Scale](at-scale.md) — batch processing across GitHub orgs and Azure DevOps
- [Customize AI in VS Code](https://code.visualstudio.com/docs/copilot/customization/overview) — instructions, MCP servers, prompt files, custom agents
