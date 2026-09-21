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

max-ai-credits: 150
max-daily-ai-credits: 250
max-turns: 12

network: defaults

tools:
  bash:
    - "cat /tmp/gh-aw/agent/weekly-status-evidence.md"
    - "jq"
    - "safeoutputs create_issue"
    - "safeoutputs noop"

safe-outputs:
  mentions: false
  create-issue:
    title-prefix: "[weekly status] "
    labels: [automation, agentic-workflows]
    close-older-issues: true
    expires: 14d
    max: 1
  noop:
    report-as-issue: false
source: githubnext/agentics/workflows/repo-status.md@4bc8419fad05e6b032741cbfd189986700bcf71c

steps:
  - name: Collect weekly repository evidence
    env:
      GH_TOKEN: ${{ github.token }}
    run: |
      mkdir -p /tmp/gh-aw/agent
      {
        printf '# Weekly repository evidence\n\n'
        printf 'Generated: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        printf '## Pull requests\n\n```json\n'
        gh pr list --repo "$GITHUB_REPOSITORY" --state all --limit 50 \
          --json number,title,state,isDraft,createdAt,updatedAt,closedAt,mergedAt,author,url
        printf '\n```\n\n## Issues\n\n```json\n'
        gh issue list --repo "$GITHUB_REPOSITORY" --state all --limit 50 \
          --json number,title,state,createdAt,updatedAt,closedAt,author,labels,url
        printf '\n```\n\n## Workflow runs\n\n```json\n'
        gh run list --repo "$GITHUB_REPOSITORY" --limit 50 \
          --json databaseId,workflowName,status,conclusion,event,createdAt,updatedAt,url
        printf '\n```\n\n## Active workflows\n\n```json\n'
        gh workflow list --repo "$GITHUB_REPOSITORY" --all \
          --json name,state,path
        printf '\n```\n\n## Releases\n\n```json\n'
        gh release list --repo "$GITHUB_REPOSITORY" --limit 10 \
          --json tagName,name,isDraft,isPrerelease,publishedAt
        printf '\n```\n'
      } > /tmp/gh-aw/agent/weekly-status-evidence.md
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

## Execution contract

Complete this workflow with exactly two tool calls:

1. Run `cat /tmp/gh-aw/agent/weekly-status-evidence.md`.
2. Immediately submit the report with either `safeoutputs create_issue` or
   `safeoutputs noop`.

Use only the precomputed evidence. Do not run GitHub, Git, Python, or additional
shell queries. Filter timestamps mentally to compare the previous seven days
with the seven days before that. Create one issue when there is meaningful
activity or an actionable operational problem. Use `safeoutputs noop` only when
there is nothing useful to report.

Treat the `Active workflows` section as authoritative. Do not recommend fixing
or restoring failures from workflows that are no longer active. In particular,
Code Simplifier and Daily Documentation Updater were intentionally retired.
