# AgentRC

**Context engineering for AI coding agents.**

[![CI](https://github.com/microsoft/agentrc/actions/workflows/ci.yml/badge.svg)](https://github.com/microsoft/agentrc/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> [!WARNING]
> **Experimental** — Under active development. Expect breaking changes. [Open an issue](https://github.com/microsoft/agentrc/issues) with feedback.

---

AI coding agents work best when they know how to build, test, and lint your code — plus your architecture, conventions, and the external services your team relies on. Most repos ship none of that.

AgentRC reads your codebase and generates the files that close that gap — then evaluates whether they actually help, so the context doesn't go stale as your code evolves.

```bash
npx github:microsoft/agentrc
```

Works as a CLI, as a [VS Code extension](docs/extension.md), and in your [CI/CD pipeline](docs/ci-integration.md) to monitor drift. No config needed — runs on any repo with Node.js 20+.

![AgentRC — Measure, Generate, Maintain cycle](docs/assets/agentrc-overview.png)

## What it does

### Measure

Score your repo’s AI-readiness across 9 pillars and a 5-level maturity model. Find out what context is missing — from basic linting to MCP server configs.

```bash
npx github:microsoft/agentrc readiness
```

### Generate

Produce tailored instruction files, evals, and dev configs via the Copilot SDK. No templates — AgentRC reads your actual code and generates context specific to your stack.

```bash
npx github:microsoft/agentrc instructions
```

### Maintain

Context goes stale as your codebase evolves. Evaluate whether your instructions still improve agent responses, and run the check in CI so drift doesn't slip through.

```bash
npx github:microsoft/agentrc eval
```

## Works at every scale

| Workflow                  | Command                                   |
| ------------------------- | ----------------------------------------- |
| Interactive hub           | `agentrc`                                 |
| One-time setup            | `agentrc init`                            |
| CI quality gate           | `agentrc readiness --fail-level 3 --json` |
| Batch across an org       | `agentrc batch`                           |
| Automated PR for any repo | `agentrc pr owner/repo`                   |

Works with **GitHub** and **Azure DevOps**. Supports monorepos, multi-root VS Code workspaces, and custom [policies](docs/policies.md).

## What gets generated

| File                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `.github/copilot-instructions.md` | Teaches AI agents your repo's conventions  |
| `.vscode/mcp.json`                | Connects AI to your stack's tools and data |
| `.vscode/settings.json`           | Tunes VS Code for AI-assisted development  |
| `agentrc.eval.json`               | Test cases to measure instruction quality  |

> For multi-agent support (Copilot + Claude + others), generate `AGENTS.md` with `--output AGENTS.md`. See [Custom instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions).

## Documentation

|                                                |                                                         |
| ---------------------------------------------- | ------------------------------------------------------- |
| **[Getting Started](docs/getting-started.md)** | Prerequisites and first run                             |
| **[Concepts](docs/concepts.md)**               | Maturity model, readiness pillars, how generation works |
| **[Commands](docs/commands.md)**               | Full CLI reference                                      |
| **[Configuration](docs/configuration.md)**     | Areas, workspaces, monorepos                            |
| **[Policies](docs/policies.md)**               | Custom readiness scoring                                |
| **[At Scale](docs/at-scale.md)**               | Batch processing across orgs                            |
| **[CI Integration](docs/ci-integration.md)**   | GitHub Actions & Azure Pipelines                        |
| **[VS Code Extension](docs/extension.md)**     | Sidebar views, commands, settings                       |
| **[Agent Plugin](plugin/README.md)**           | Install as a Copilot agent plugin with built-in skills  |
| **[Examples](examples/)**                      | Configs, evals, and policies                            |

[Customize AI in VS Code](https://code.visualstudio.com/docs/copilot/customization/overview) · [Custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions) · [CONTRIBUTING.md](CONTRIBUTING.md)

## Troubleshooting

**"Copilot CLI not found"** — Install the [GitHub Copilot Chat extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) in VS Code. The CLI is bundled with it.

**"Copilot CLI not logged in"** — Run `copilot` in your terminal, then `/login`.

**"GitHub auth required"** — `brew install gh && gh auth login`, or set `GITHUB_TOKEN` (or `GH_TOKEN`).

**"Azure DevOps auth required"** — Set `AZURE_DEVOPS_PAT` or `AZDO_PAT`.

## License

[MIT](LICENSE)

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party's policies.
