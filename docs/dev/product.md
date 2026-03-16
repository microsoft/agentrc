# AgentRC — Product Brief

## The Problem

AI coding agents are only as effective as the context they receive. Most repositories lack the structured metadata — custom instructions, MCP configs, readiness baselines — that agents need to produce accurate, idiomatic code. Teams adopting Copilot and similar tools hit a cold-start problem: agents generate plausible but wrong code because they don't understand the repo's conventions, architecture, or tooling.

This gap widens at scale. An organization with hundreds of repos can't manually author instructions for each one, and there's no standard way to measure whether a repo is "AI-ready" or track improvement over time.

## Who It's For

- **Platform engineering teams** rolling out AI coding tools across an org — need to assess readiness, set baselines, and track adoption at scale.
- **Individual developers** who want their AI agent to understand their repo's stack, conventions, and architecture from day one.
- **Engineering leadership** evaluating readiness across portfolios, with quantifiable maturity levels and policy-driven compliance.

## What AgentRC Does

AgentRC automates the preparation work that makes AI coding agents effective:

1. **Assess** — Score any repo against a 9-pillar readiness model spanning repo health (style, build, testing, docs, dev environment, code quality, observability, security) and AI setup (instructions, MCP, agents, skills). Get a maturity level from 1–5.

2. **Generate** — Use the Copilot SDK to analyze a repo and produce tailored `copilot-instructions.md` or `AGENTS.md` files. Monorepo-aware: generates per-area instructions scoped with `applyTo` globs.

3. **Evaluate** — Measure the impact of instructions by comparing AI responses with and without them, scored by a judge model. Use as a CI gate to prevent regressions.

4. **Configure** — Generate `.vscode/mcp.json` and `.vscode/settings.json` so the dev environment is wired for AI from the start.

5. **Scale** — Batch-process repos across GitHub orgs or Azure DevOps projects. Clone, generate, and open PRs automatically. Produce consolidated readiness reports for leadership.

## Maturity Model

AgentRC's readiness assessment maps repos to a 5-level maturity model:

| Level | Name         | What it means                                       |
| ----- | ------------ | --------------------------------------------------- |
| 1     | Functional   | Builds, tests, basic tooling in place               |
| 2     | Documented   | README, CONTRIBUTING, custom instructions exist     |
| 3     | Standardized | CI/CD, security policies, CODEOWNERS, observability |
| 4     | Optimized    | MCP servers, custom agents, AI skills configured    |
| 5     | Autonomous   | Full AI-native development with minimal oversight   |

Organizations can define **readiness policies** to customize which criteria are evaluated, override scoring metadata, and set pass-rate thresholds — enforced locally or in CI.

## How It's Built

- **TypeScript CLI** (Commander.js) with an interactive TUI (Ink/React)
- **VS Code extension** with tree views, walkthrough, and webview for readiness reports
- **Copilot SDK** for instruction generation using the same models developers already use
- Supports **GitHub** (Octokit) and **Azure DevOps** (REST API) for batch operations and PR creation

## Key Design Decisions

- **Instructions are generated, not templated.** AgentRC uses the Copilot SDK to analyze actual repo content — no generic boilerplate.
- **Readiness is measurable.** The 9-pillar model produces a numeric score and maturity level, making it possible to set org-wide baselines and CI gates.
- **Evaluation closes the loop.** Teams can prove that instructions actually improve AI output, with configurable pass-rate thresholds.
- **Policy-driven compliance.** Policies are composable JSON files that can be checked into repos or distributed org-wide.
- **Batch-first.** Every workflow that works on one repo also works on hundreds — same CLI, same output format.
