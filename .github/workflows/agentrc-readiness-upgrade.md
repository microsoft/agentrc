---
name: AgentRC Readiness Upgrade
description: |
  Demonstrates AgentRC improving its own agent instructions: capture a baseline,
  make one bounded instruction change, verify it, and open a draft pull request.

on:
  workflow_dispatch:
  stop-after: +6mo

permissions:
  contents: read
  copilot-requests: write

concurrency:
  group: agentrc-readiness-upgrade
  cancel-in-progress: false

engine: copilot
strict: true
max-ai-credits: 250
max-daily-ai-credits: 300
max-turns: 20
timeout-minutes: 25

network:
  allowed: [defaults, node]

tools:
  edit:
  bash:
    - "cat /tmp/gh-aw/agent/readiness-before.md"
    - "cat AGENTS.md"
    - "find .github/instructions -name"
    - "git diff"
    - "git status"
    - "node dist/index.js readiness"
    - "npm run format:check"

safe-outputs:
  create-pull-request:
    title-prefix: "[agentrc readiness] "
    labels: [automation, agentic-workflows]
    draft: true
    max: 1
    max-patch-files: 1
    allowed-files:
      - AGENTS.md
      - .github/copilot-instructions.md
      - .github/instructions/*.instructions.md
    protected-files:
      policy: blocked
      exclude:
        - AGENTS.md
        - .github/copilot-instructions.md
        - .github/instructions/
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
  - name: Capture readiness baseline
    run: |
      mkdir -p /tmp/gh-aw/agent
      node dist/index.js readiness \
        --output /tmp/gh-aw/agent/readiness-before.md \
        --force
---

# Improve AgentRC's Own Instructions

Demonstrate the AgentRC loop on this repository:

`measure -> inspect evidence -> improve one instruction -> verify -> review`

## Guardrails

- Read `/tmp/gh-aw/agent/readiness-before.md` before proposing a change.
- Change only `AGENTS.md`, `.github/copilot-instructions.md`, or one scoped
  `.github/instructions/*.instructions.md` file.
- Do not modify product code, workflow definitions, package manifests, lock
  files, generated files, tests, or evaluation criteria.
- Make one coherent improvement tied to repository evidence.
- Do not add generic advice that could apply to any TypeScript repository.

## Process

1. Inspect the baseline and the existing instruction files.
2. Find one missing, stale, contradictory, or overly broad instruction that
   affects real AgentRC work.
3. Edit the smallest appropriate instruction file.
4. Run:

   ```bash
   node dist/index.js readiness \
     --output /tmp/gh-aw/agent/readiness-after.md \
     --force
   npm run format:check
   ```

5. Compare before and after. A readiness score need not change when the fix
   improves accuracy or removes stale guidance; explain the measurable evidence
   used instead.
6. If no justified improvement exists, use `noop`.
7. Otherwise create one draft PR.

Call the `create_pull_request` or `noop` safe-output tool directly. Do not
construct a shell command for safe outputs.

## Pull request requirements

Include:

- the evidence that exposed the instruction gap;
- the exact behavior the new instruction should change;
- before/after readiness results;
- validation performed;
- why the change is safe and limited to agent guidance.
