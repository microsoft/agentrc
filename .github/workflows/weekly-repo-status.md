---
name: Weekly Repository Status
description: |
  Creates a weekly repository status report. It gathers recent repository
  activity (issues, PRs, discussions, releases, code changes) and generates
  one concise GitHub issue with delivery, quality, and agent-readiness signals.

on:
  schedule: weekly on monday
  workflow_dispatch:
  stop-after: +6mo

permissions:
  contents: read
  actions: read
  issues: read
  pull-requests: read
  copilot-requests: write

concurrency:
  group: weekly-repo-status
  cancel-in-progress: true

max-ai-credits: 100
max-daily-ai-credits: 150
max-turns: 10

network: defaults

tools:
  bash: ["cat", "ls", "find", "grep", "head", "tail", "wc"]
  github:
    toolsets: [default, actions]
    min-integrity: approved

safe-outputs:
  mentions: false
  create-issue:
    title-prefix: "[weekly status] "
    labels: [automation, agentic-workflows]
    close-older-issues: true
    expires: 14d
    max: 1
source: githubnext/agentics/workflows/repo-status.md@4bc8419fad05e6b032741cbfd189986700bcf71c
---

# Weekly AgentRC Status

Create one concise weekly status report for AgentRC as a GitHub issue.

## What to include

- Pull requests merged, opened, and still waiting for review
- Issues opened, closed, and still waiting for a maintainer response
- CI and Agentic Workflow health, including repeated failures or noisy automation
- Release activity and meaningful user-facing changes
- AgentRC readiness, instruction, evaluation, and extension work
- At most three evidence-backed recommendations for the next week

## Style

- Lead with the state of the repository, not a narrative recap.
- Link every problem or recommendation to a run, issue, pull request, or file.
- Separate verified facts from recommendations.
- Keep the issue under 700 words.

## Process

1. Gather activity from the previous seven days.
2. Compare the current week with the preceding seven days.
3. Inspect repeated workflow failures before recommending new automation.
4. Create one issue. If there is no meaningful change, use `noop`.
