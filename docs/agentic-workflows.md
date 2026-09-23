# Agentic Workflows

AgentRC uses [GitHub Agentic Workflows](https://github.github.com/gh-aw/) to
maintain this repository and demonstrate an auditable agent loop.

The central demo is:

```text
AgentRC measures the repository
        ↓
gh-aw gives an agent the evidence and a bounded task
        ↓
the agent proposes one instruction improvement
        ↓
AgentRC measures again
        ↓
a human reviews the draft pull request
```

For the complete stage narrative, exact browser tabs, talk track, fallback plan,
and customer Q&A, see
[Golden demo: a lone maintainer with agentic workflows](agentic-workflows-demo.md).

## Current workflow suite

| Workflow                                                                       | Trigger                        | Maximum output                                          | Purpose                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| [AgentRC Readiness Report](../.github/workflows/agentrc-readiness-report.md)   | Weekly Friday or manual        | One expiring issue                                      | Publish the highest-impact readiness gaps from deterministic AgentRC output |
| [AgentRC Readiness Upgrade](../.github/workflows/agentrc-readiness-upgrade.md) | Manual                         | One draft PR limited to instruction files               | Demonstrate measure → improve → verify → review                             |
| [Issue Triage](../.github/workflows/issue-triage.md)                           | Issue opened or reopened       | Two allowlisted labels, one issue type, and one comment | Route incoming issues without inventing missing details                     |
| [CI Failure Doctor](../.github/workflows/ci-doctor.md)                         | Failed `CI` workflow on `main` | One issue or one comment                                | Find the first meaningful error and recommend a bounded repair              |

The imported workflows retain their `source:` reference to
[`githubnext/agentics`](https://github.com/githubnext/agentics). AgentRC-specific
changes live in the local source files and should be reviewed when updating from
the catalog.

## Why these workflows

The selected catalog workflows cover three recurring maintainer jobs:

- **Issue Triage** reduces response latency without editing code.
- **CI Failure Doctor** turns a failed run into an evidence-backed diagnosis.

Two custom workflows make the demo specific to AgentRC:

- **Readiness Report** runs the product deterministically before the model starts.
- **Readiness Upgrade** limits edits to agent instruction files and requires
  before/after evidence.

The previous daily documentation, code-simplification, and weekly status
workflows were removed. They were generic, failed repeatedly in observed runs,
or produced recommendations about already retired automation. The smaller suite
keeps the ongoing work tied to concrete repository events and AgentRC's own
readiness loop.

## Safety model

The workflow source declares the boundaries. The generated lock file implements
them in GitHub Actions.

All AgentRC workflows use these rules:

- Copilot inference uses `copilot-requests: write`; the agent does not receive
  repository write permission.
- GitHub writes happen through typed safe outputs.
- Code changes are draft pull requests.
- Scheduled workflows have a stop date, concurrency control, turn limit,
  per-run AI-credit cap, daily AI-credit cap, and bounded output.
- Temporary evidence lives under `/tmp/gh-aw/agent/` so it is available in run
  artifacts.
- Workflow definitions, package manifests, generated files, and eval criteria
  are outside the readiness-upgrade write scope.
- No workflow auto-merges a pull request.

See [`.github/aw/instructions.md`](../.github/aw/instructions.md) for the
repository-specific authoring rules.

## Five-minute live demo

Use **AgentRC Readiness Report** for the safest live path.

### Before the session

1. Open the
   [source workflow](../.github/workflows/agentrc-readiness-report.md).
2. Open the generated
   [lock workflow](../.github/workflows/agentrc-readiness-report.lock.yml).
3. Keep one successful Actions run and its generated issue open in separate
   browser tabs.
4. Run the workflow once on the day of the demo.
5. Record a 60-second fallback showing the run graph and issue.

### On stage

1. **Frame the problem:** repository instructions drift as the code changes.
2. **Show the source:** point to the schedule, read-only permissions, budgets,
   tool list, and one allowed issue output.
3. **Show deterministic evidence:** AgentRC runs before the model and writes a
   full readiness report, then passes only the level and `Fix First` failures to
   the agent.
4. **Trigger the workflow:** use **Run workflow** or:

   ```bash
   gh aw run agentrc-readiness-report
   ```

5. **Switch to the prepared run:** show activation, agent, detection, and safe
   output as separate jobs.
6. **Open the issue:** connect every recommendation to AgentRC evidence.
7. **Show the audit record:**

   ```bash
   gh aw audit RUN_ID
   ```

8. **Close:** AgentRC measures; the agent interprets; GitHub Actions enforces the
   boundary; a human decides what to change.

## Ten-minute technical extension

Run **AgentRC Readiness Upgrade** after the report:

1. Show the exclusive file allowlist.
2. Show why `AGENTS.md` is explicitly exempted from protected-file blocking.
3. Trigger the workflow.
4. Use a prepared run while the live run executes.
5. Review the draft PR's evidence, before/after readiness report, and validation.
6. Emphasize that the workflow cannot change product code, dependencies,
   workflows, or eval criteria.

## Local maintenance

Use the stable compiler version pinned in CI.

```bash
gh extension install github/gh-aw
gh extension upgrade github/gh-aw
gh aw --version
npm run workflows:compile
git diff -- .gitattributes .github/aw .github/workflows
```

Commit workflow source and generated files together:

- `.github/workflows/*.md`
- `.github/workflows/*.lock.yml`
- `.github/workflows/agentics-maintenance.yml`
- `.github/aw/actions-lock.json`
- `.gitattributes`

Do not edit generated files or their action pins manually. Dependabot ignores
`github/gh-aw` and `github/gh-aw-actions` pins because only the compiler should
update them.

CI runs `npm run workflows:check`, recompiles with the pinned stable version,
and fails when generated output differs.

## Updating catalog workflows

Review upstream changes before updating:

```bash
gh aw update ci-doctor
gh aw update issue-triage
npm run workflows:compile
```

Reapply AgentRC-specific budgets, labels, schedules, and prompt edits when an
upstream update conflicts. The local `source:` field records the imported
revision.

## Demo failure modes

| Symptom                              | Fix                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Workflow is missing from Actions     | Compile and commit the `.lock.yml` on the default branch                         |
| Runtime cannot find a `gh-aw` script | Compiler and generated action pins drifted; recompile the full suite             |
| Copilot authentication fails         | Confirm organization billing policy and `copilot-requests: write`                |
| Workflow creates no output           | Inspect whether it correctly called `noop`; verify deterministic evidence exists |
| Generated PR does not trigger CI     | Normal `GITHUB_TOKEN` writes do not recursively trigger Actions                  |
| Source compiles with shell warnings  | Replace quoted command patterns with safe prefixes                               |
| Live run is slow                     | Continue with the prepared run and compare the eventual result afterward         |

## Evaluating value

Do not count runs as success. Track:

- accepted versus dismissed readiness recommendations;
- draft PR merge rate;
- false-positive triage rate;
- duplicate failure reports;
- reviewer wait time;
- AIC per accepted issue or merged PR;
- workflow failures caused by stale generated files;
- readiness or eval movement after accepted changes.
