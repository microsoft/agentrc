# Golden demo: a lone maintainer with agentic workflows

This demo explains GitHub Agentic Workflows through the daily work of
maintaining AgentRC alone.

The point is not that an agent can edit code. The point is that the repository
can handle the first pass on recurring work, then ask for attention with
evidence and a bounded proposed action.

## The promise

> I am the maintainer, product manager, support queue, release engineer, and
> documentation team for AgentRC. Every interruption takes time away from the
> product. Agentic Workflows gives the repository a first shift. New issues
> arrive with a first-pass assessment. Failed CI arrives with a diagnosis.
> Agent-readiness drift becomes one short-lived issue. I still decide what
> changes, but I start with evidence instead of an empty queue.

## The one-minute explanation

Agentic Workflows runs coding agents inside GitHub Actions.

The Markdown workflow has two parts:

1. The YAML frontmatter defines the event, permissions, tools, budget, timeout,
   and allowed outputs.
2. The Markdown body describes the judgment the agent should apply.

`gh aw compile` turns that source into a pinned Actions workflow. The agent
normally reads and reasons. A separate safe-output job validates and applies a
declared GitHub operation such as adding two allowlisted labels, creating one
issue, or opening one draft pull request.

That split is the customer story:

```text
reasoning can be flexible
        |
        v
effects stay typed and bounded
```

## Why this demo fits AgentRC

AgentRC prepares repositories for AI-assisted development. Its own maintenance
work is therefore the best test:

- Can the repository spot when its agent instructions drift?
- Can it explain a failed readiness criterion without inventing a score?
- Can it propose one instruction change without touching product code?
- Can it triage incoming issues without gaining general write access?

The demo answers each question with the same pattern:

```text
deterministic evidence
        |
        v
agent judgment
        |
        v
one constrained GitHub output
        |
        v
maintainer review
```

## Demo at a glance

Use the first eight minutes for the core story. Add the readiness-upgrade
extension when the audience wants technical depth.

| Time | What you show                                                                             | What you say                                                                                    |
| ---: | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0:00 | AgentRC issue or Actions queue                                                            | "A lone maintainer loses the day in small interruptions."                                       |
| 0:45 | [Issue Triage source](../.github/workflows/issue-triage.md)                               | "I describe the judgment once. The frontmatter limits what can happen."                         |
| 2:15 | Create one prepared issue                                                                 | "The repository starts the first pass when the issue arrives. I do not start a chat."           |
| 3:00 | Compiled `.lock.yml` and run graph                                                        | "The Markdown compiles into normal Actions with pinned dependencies and separate jobs."         |
| 4:30 | Applied labels and triage comment                                                         | "I still own the decision. The agent has organized the evidence and asked for the next action." |
| 5:30 | [Readiness Report source](../.github/workflows/agentrc-readiness-report.md)               | "The same pattern works before a user reports anything. AgentRC checks itself every Friday."    |
| 6:30 | [Successful readiness run](https://github.com/microsoft/agentrc/actions/runs/35547941277) | "AgentRC produces the score. The model summarizes only deterministic failures."                 |
| 7:15 | [Readiness issue #367](https://github.com/microsoft/agentrc/issues/367)                   | "I get one expiring issue, not another dashboard to remember."                                  |
| 8:00 | Close                                                                                     | "The repository handles the first shift. I review outcomes."                                    |

## Set up before presenting

### Use these browser tabs

Open the tabs in this order:

1. [`microsoft/agentrc`](https://github.com/microsoft/agentrc)
2. [Issue Triage source](../.github/workflows/issue-triage.md)
3. [Issue Triage lock file](../.github/workflows/issue-triage.lock.yml)
4. [Actions](https://github.com/microsoft/agentrc/actions)
5. [Successful Issue Triage run](https://github.com/microsoft/agentrc/actions/runs/35564164534)
6. [Readiness Report source](../.github/workflows/agentrc-readiness-report.md)
7. [Successful Readiness Report run](https://github.com/microsoft/agentrc/actions/runs/35547941277)
8. [Readiness report issue #367](https://github.com/microsoft/agentrc/issues/367)
9. [Readiness Upgrade source](../.github/workflows/agentrc-readiness-upgrade.md)

Keep the successful runs open even when you plan to trigger a live run. Hosted
runner startup and model latency are not stage cues.

### Verify the repository

```bash
gh auth status
gh aw --version
npm run workflows:check
git status --short
```

AgentRC pins stable `gh-aw v0.88.7` in CI. The newest public pre-release may be
newer. State the version you are demonstrating instead of saying "latest."

### Prepare the issue

Use a disposable issue or a fork for the live trigger.

```markdown
Title: VS Code extension ignores nested instruction strategy

When I run "AgentRC: Batch Instructions" in a multi-root workspace, a root with
`strategy: "nested"` produces one flat file.

Expected:

- `AGENTS.md` hub
- detail files under `.agents/`

Actual:

- one flat instruction file

AgentRC version: 2.1.0
VS Code: 1.125
```

Expected first-pass output:

- classification label: `bug`
- routing label: `vscode-extension`
- issue type: Bug, when available
- one comment with suitability, related issues, and a focused next step

The workflow cannot apply arbitrary labels. Its allowlist and `max: 2` limit are
part of the source.

## The core demo

### Beat 1: start with the maintainer's day

Open the issues list.

Say:

> The cost of maintaining a repository alone is not one giant task. It is a
> stream of five-minute context switches. Is this issue complete? Is it a
> duplicate? Which part of the project owns it? Is it ready for a coding agent?
> Each question is small. Together they keep me from building AgentRC.

Do not start with product architecture. Start with the queue.

### Beat 2: show the contract

Open [`issue-triage.md`](../.github/workflows/issue-triage.md).

Point to these lines:

- `issues: [opened, reopened]`
- read-only repository permissions
- `copilot-requests: write`
- per-run and daily AI-credit caps
- `max-turns`
- the GitHub toolset
- the label allowlist
- `max: 2` labels
- `max: 1` comment
- `max: 1` issue type
- `noop.report-as-issue: false`

Say:

> The prompt is not the security boundary. This frontmatter is. The model can
> reason about the issue, but it cannot invent a label, post five comments, edit
> code, or merge a pull request.

Then point to the Markdown instructions.

> This is where I encode the maintainer judgment I repeat today: ask for missing
> evidence, distinguish duplicates from related issues, and say whether the
> task is ready for a coding agent.

### Beat 3: trigger work without opening a chat

Create the prepared issue.

Say:

> I am not assigning a bot and waiting in a chat window. The issue event starts
> the workflow. I can go back to the work I was doing.

While the run starts, switch to the source and lock file.

### Beat 4: show source versus execution

Open [`issue-triage.lock.yml`](../.github/workflows/issue-triage.lock.yml).

Do not scroll through the whole generated file. Show:

- the `gh-aw-metadata` header
- compiler version
- pinned Actions references
- job-level permissions

Say:

> I review a short source file, but GitHub runs standard Actions YAML. The
> compiler resolves and pins the implementation. CI recompiles every source
> workflow and fails if the lock files drift.

Open the live run or the
[prepared run](https://github.com/microsoft/agentrc/actions/runs/35564164534).

Show the job sequence:

```text
pre-activation
  -> activation
  -> agent
  -> detection
  -> safe outputs
  -> conclusion
```

Say:

> The agent does not carry the issue-write token while it reasons. It requests
> a typed output. Another job validates and applies that output.

### Beat 5: return to the issue

Refresh the issue.

Show the labels, issue type, and triage comment.

Say:

> I did not outsource the product decision. I removed the blank-page work. The
> issue now has a first-pass classification, the missing evidence, and one
> recommended next step. I can accept it, correct it, assign it, or close it.

If the workflow chooses `noop`, use that as evidence of restraint:

> No output is a valid result. A workflow that acts on every event becomes a
> second inbox.

## The proactive maintenance proof

Issue triage reacts to people. AgentRC Readiness Report catches drift before a
user reports it.

Open
[`agentrc-readiness-report.md`](../.github/workflows/agentrc-readiness-report.md).

Show the deterministic setup:

```bash
node dist/index.js readiness \
  --output /tmp/gh-aw/agent/readiness-full.md \
  --force
```

Then show how the pre-step extracts only the level and `Fix First` section.

Say:

> The model does not decide AgentRC's score. AgentRC does. The model receives
> only the failed criteria, then turns them into one short-lived maintainer
> issue.

Open the
[successful run](https://github.com/microsoft/agentrc/actions/runs/35547941277)
and [issue #367](https://github.com/microsoft/agentrc/issues/367).

Point out:

- every job succeeded
- the run used 12 AIC
- the issue expires after 14 days
- older readiness issues close automatically
- no issue is created when there is nothing to fix

Say:

> I no longer need to remember to audit whether the repository is ready for
> agents. The repository checks itself and gives me one expiring item when
> something needs attention.

## Optional technical extension: from finding to draft PR

Open
[`agentrc-readiness-upgrade.md`](../.github/workflows/agentrc-readiness-upgrade.md).

This workflow runs only when the maintainer triggers it.

Show:

- `workflow_dispatch`
- `draft: true`
- `max: 1` pull request
- `max-patch-files: 1`
- `allowed-files` limited to agent instruction files
- package manifests, workflow files, code, tests, and eval criteria excluded
- baseline and after reports

Say:

> The scheduled workflow finds the problem. The manual workflow proposes the
> repair. That distinction matters. Detection can be ambient. Change stays
> deliberate.

The output is one draft PR. AgentRC reruns readiness before opening it.

## What gets easier for a lone maintainer

| Maintenance task      | Before                                              | With `gh-aw`                                                 |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| New issue             | Stop, read, search, classify, ask questions         | Review one bounded triage report                             |
| Failed CI             | Open every failed job and find the first real error | Start with one evidence-backed diagnosis                     |
| Agent-readiness drift | Remember to rerun an audit and interpret the report | Receive one expiring issue from deterministic AgentRC output |
| Instruction repair    | Edit broad context files and hope behavior improves | Review one draft PR limited to one instruction file          |
| Automation updates    | Hand-edit YAML and hope pins stay aligned           | Review Markdown source and compiler-generated lock files     |

The time savings are not "the agent writes everything." The repository removes
the first-pass work and preserves maintainer authority.

## The controls to explain

### Reasoning and effects are separate

The agent can inspect context and choose a request. A separate safe-output job
applies the request with narrower permissions.

### Safe outputs are typed capabilities

`add-labels`, `add-comment`, `create-issue`, and `create-pull-request` are not
generic write access. Each output has its own limits and validation.

### Deterministic work stays deterministic

AgentRC computes readiness before the model starts. CI, tests, builds, and
workflow compilation remain conventional Actions steps.

### The compiler is part of deployment

Source `.md`, generated `.lock.yml`, shared action helpers, and the compiler
version move together. AgentRC CI recompiles the suite and rejects drift.

### Cost is a workflow property

Each workflow declares turn, timeout, per-run AIC, and daily AIC limits. The run
stores usage and audit evidence.

## The closing line

> Agentic Workflows does not give me an autonomous engineering team. It gives
> my repository a reliable first shift. The repository watches the recurring
> work, gathers the evidence, and proposes one bounded action. I stay the
> maintainer, but I spend less of the day getting ready to decide.

## Questions to expect

### Why not use ordinary GitHub Actions?

Use ordinary Actions when the steps are known in advance. Use an Agentic
Workflow when the next step depends on repository context, such as whether an
issue is complete, whether two reports describe the same bug, or which failure
in a log is the root cause.

### Can it write to the repository?

The agent job is read-only by default. Writes go through declared safe outputs
in separate jobs. AgentRC's code-changing demo can open one draft PR that
touches one allowlisted instruction file.

### What stops prompt injection?

No control makes an LLM immune to prompt injection. The workflow reduces the
impact through input integrity, a sandbox, network controls, read-only
reasoning, output validation, protected files, and narrow credentials. Treat
these as risk controls, not a guarantee.

### Does every result require approval?

No. Labels and comments may apply automatically within the declared limits.
Code changes are draft PRs and still go through repository review and rules.
Staged safe outputs or GitHub Environment reviewers can add a human gate where
needed.

### What does it cost?

Actions compute and model inference are separate meters. AgentRC declares AIC
caps per run and per day. Show the usage line on the successful run instead of
estimating on stage.

### Can the company standardize workflows?

Yes. Platform teams can distribute versioned workflows and shared components,
pin imports, and set model, budget, timeout, and capability policy at repository,
organization, or enterprise scope.

### Is it generally available?

No. GitHub Agentic Workflows is in public preview and changes quickly. AgentRC
pins the stable compiler it has tested rather than compiling against whatever
release appeared most recently.

## Failure plan

| What goes wrong                  | What to do on stage                                                       |
| -------------------------------- | ------------------------------------------------------------------------- |
| Hosted runner is slow            | Switch to the prepared successful run and keep narrating                  |
| The agent returns `noop`         | Explain that restraint is part of the contract                            |
| The live issue output differs    | Compare it with the output limits, not an expected sentence               |
| Compilation fails                | Show the error as a policy check, then switch to the prepared lock file   |
| Model access fails               | Use the prepared run; after the session, check Copilot policy and billing |
| Network or GitHub is unavailable | Use the recording and screenshots from the rehearsal                      |

## After the demo

1. Close the synthetic issue.
2. Delete any staged outputs or demo branches.
3. Preserve the successful run URL for the next presentation.
4. Check AIC and tool use with `gh aw audit RUN_ID`.
5. Update this guide when the pinned compiler, workflow contract, or run links
   change.

## Public references

- [GitHub Agentic Workflows](https://github.com/github/gh-aw)
- [Official workflow catalog](https://github.com/githubnext/agentics)
- [AgentRC workflow rebuild PR](https://github.com/microsoft/agentrc/pull/347)
- [GitHub Agentic Workflows public preview](https://github.blog/changelog/2026-06-11-github-agentic-workflows-is-now-in-public-preview/)
- [Security architecture](https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/)
- [Aspire cross-repository documentation case study](https://github.blog/ai-and-ml/github-copilot/automating-cross-repo-documentation-with-github-agentic-workflows/)
