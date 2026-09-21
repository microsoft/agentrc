---
name: AgentRC Readiness Report
description: |
  Runs AgentRC against its own repository and publishes one evidence-backed
  readiness report with the highest-impact gaps and concrete next steps.

on:
  schedule: weekly on friday
  workflow_dispatch:
  stop-after: +6mo

permissions:
  contents: read
  copilot-requests: write

concurrency:
  group: agentrc-readiness-report
  cancel-in-progress: true

engine: copilot
strict: true
max-ai-credits: 150
max-daily-ai-credits: 300
max-turns: 20
timeout-minutes: 12

network:
  allowed: [defaults, node]

tools:
  bash:
    - "cat /tmp/gh-aw/agent/readiness.md"
    - "jq"
    - "safeoutputs create_issue"
    - "safeoutputs noop"

safe-outputs:
  create-issue:
    title-prefix: "[agentrc readiness] "
    labels: [automation, agentic-workflows]
    close-older-issues: true
    expires: 14d
    max: 1
  noop:
    report-as-issue: false

steps:
  - name: Setup Node.js
    uses: actions/setup-node@v7
    with:
      node-version: 22
      cache: npm
  - name: Install dependencies
    run: npm ci
  - name: Build AgentRC
    run: npm run build
  - name: Capture readiness evidence
    run: |
      mkdir -p /tmp/gh-aw/agent
      node dist/index.js readiness \
        --output /tmp/gh-aw/agent/readiness.md \
        --force
---

# AgentRC Self-Readiness Report

Use the deterministic AgentRC report at
`/tmp/gh-aw/agent/readiness.md` as the source of truth. Do not rescore the
repository yourself.

## Execution contract

Complete this workflow with exactly two tool calls:

1. Run `cat /tmp/gh-aw/agent/readiness.md`.
2. Immediately submit the result with either `safeoutputs create_issue` or
   `safeoutputs noop`.

Do not inspect other repository files. Do not run Git commands. Do not use
another program to parse or transform the report. The AgentRC output is already
the complete evidence source.

Copy only criteria listed under the report's `## Fix First` heading. Never treat
a row marked with `✅` as a gap, even if other text in that row is surprising or
contradictory.

Create one issue when `## Fix First` contains at least one item. Use
`safeoutputs noop` only when `## Fix First` is empty.

## Issue format

```markdown
## Readiness snapshot

| Metric               | Result                           |
| -------------------- | -------------------------------- |
| Achieved level       | [copy the level from the report] |
| Passing pillars      | [count rows marked ✅]           |
| Pillars needing work | [count rows marked ⚠️]           |

## Highest-impact gaps

Copy at most the first three items from `## Fix First`, preserving each
criterion's impact, effort, and reason.

## Recommended next step

[One bounded change for the first failed criterion. Use an exact file or command
only when the report provides it; otherwise ask a maintainer to verify the
recommended implementation.]

## Evidence

- [Links to relevant files, runs, issues, or pull requests]
```

Keep the report under 600 words. Do not recommend generic AI adoption work.
Prioritize gaps AgentRC can verify after a change.
