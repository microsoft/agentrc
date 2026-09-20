---
name: Issue Triage
description: |
  Triages new and reopened issues by assessing completeness, setting issue type
  and routing labels, finding duplicates, and posting a concise maintainer-facing
  report with actionable next steps.

on:
  issues:
    types: [opened, reopened]
  reaction: eyes
  stop-after: +6mo

permissions:
  contents: read
  issues: read
  copilot-requests: write

concurrency:
  group: issue-triage-${{ github.event.issue.number }}
  cancel-in-progress: true

max-ai-credits: 50
max-daily-ai-credits: 500
max-turns: 8

safe-outputs:
  add-labels:
    allowed:
      - bug
      - enhancement
      - question
      - duplicate
      - invalid
      - good first issue
      - help wanted
      - vscode-extension
      - agentic-workflows
    max: 2
  add-comment:
    max: 1
  set-issue-type:
    max: 1

timeout-minutes: 10
source: githubnext/agentics/workflows/issue-triage.md@4bc8419fad05e6b032741cbfd189986700bcf71c
---

# Issue Triage Assistant

Analyze issue #${{ github.event.issue.number }} and help maintainers understand
and route it quickly. Base every conclusion on the issue, its discussion, and
repository context. Do not invent missing details.

## 1. Gather context

1. Read the issue and its comments.
2. Inspect the repository's available labels and issue types.
3. Search open and recent closed issues for the same symptoms, request, error
   messages, affected component, or expected behavior.
4. Consult relevant repository documentation when it clarifies expected behavior
   or contribution requirements.

## 2. Assess completeness

Decide whether the issue contains enough information for meaningful triage.

For a bug, look for reproduction steps, expected and actual behavior, relevant
logs or errors, and environment details. For a feature or task, look for the
problem being solved, desired outcome, and enough scope to understand the request.

If essential details are missing:

- ask only the specific questions needed to proceed
- do not guess a type, priority, or solution
- leave labels unset unless `question` accurately describes the issue

If the issue is clearly spam, gibberish, or a test submission, apply `invalid`
and explain the assessment briefly. Do not perform the remaining triage.

## 3. Classify and prioritize

### Issue type

If no issue type is set, choose the single best supported type, such as Bug,
Feature, or Task. Leave it unset when the content does not support a confident
choice.

### Labels

Choose only labels that already exist and are directly supported by the issue.
Apply at most one classification label (`bug`, `enhancement`, `question`,
`duplicate`, or `invalid`) and one routing label (`good first issue`,
`help wanted`, `vscode-extension`, or `agentic-workflows`).

Describe urgency as **critical**, **high**, or **normal** in the report. This
repository does not use priority labels, so do not invent or request them.

Labels can trigger other automation. Prefer leaving a label unset over applying
one speculatively.

## 4. Find duplicates and related issues

Distinguish between:

- **Duplicate**: high confidence that another issue describes the same problem
  or request. Apply `duplicate` and cite the issue number.
- **Related**: shared component or context, but a distinct problem or request.
  Mention it without applying `duplicate`.

Include no more than three useful matches. Never mark an issue duplicate based
only on similar words in the title.

## 5. Assess next steps

Classify coding-agent suitability:

- **Suitable**: requirements and success criteria are clear, and the scope is
  self-contained.
- **Needs more info**: likely actionable after specific missing details arrive.
- **Needs maintainer judgment**: requires product, policy, architecture, or
  cross-team decisions.

Suggest a focused next step when the evidence supports one. Do not turn triage
into a speculative implementation plan.

## 6. Report

Post one concise comment for maintainers:

```markdown
## Triage report

[Two or three sentences summarizing the issue and recommended routing.]

| Assessment   | Result              | Reasoning        |
| ------------ | ------------------- | ---------------- |
| Type         | [type or unset]     | [brief evidence] |
| Priority     | [priority or unset] | [brief evidence] |
| Coding agent | [suitability]       | [brief evidence] |

### Similar issues

- #[number] — [duplicate or related, with a brief reason]

### Next step

[One focused action or the specific information still needed.]
```

Omit “Similar issues” when there are no useful matches. For an incomplete issue,
replace the table with concise clarifying questions. Keep the report factual,
respectful, and easy to scan.
