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

## Task

1. Read the report.
2. Inspect repository files only to verify the highest-impact failed criteria.
3. Create one issue when there is a meaningful readiness gap.
4. Use `noop` when the report has no actionable gap.

Submit the result with `safeoutputs create_issue` or `safeoutputs noop`. Do not
run Git commands.

## Issue format

```markdown
## Readiness snapshot

| Metric                 | Result            |
| ---------------------- | ----------------- |
| Achieved level         | [level]           |
| Highest passing pillar | [pillar and rate] |
| Lowest passing pillar  | [pillar and rate] |

## Highest-impact gaps

1. **[criterion]** — [evidence and why it matters]
2. **[criterion]** — [evidence and why it matters]
3. **[criterion]** — [evidence and why it matters]

## Recommended next step

[One bounded change, with the exact file or command involved.]

## Evidence

- [Links to relevant files, runs, issues, or pull requests]
```

Keep the report under 600 words. Do not recommend generic AI adoption work.
Prioritize gaps AgentRC can verify after a change.
