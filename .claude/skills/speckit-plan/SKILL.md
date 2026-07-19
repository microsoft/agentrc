---
name: "speckit-plan"
description: "Execute the implementation planning workflow using the plan template to generate design artifacts."
argument-hint: "Optional guidance for the planning phase"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/plan.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before planning)**:

- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing slash commands from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):

    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

  - **Mandatory hook** (`optional: false`):

    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```

    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.

- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC. If `.specify/memory/constitution.md` exists, read it; otherwise record that no project constitution is available, skip constitution-derived gates, and tell the user to run `/speckit-constitution` before relying on them. Do not attempt to read or create a missing constitution during planning. Load IMPL_PLAN template (already copied). Also discover formal workflow artifacts using this precedence:
   - PRD: `SPECS_DIR/prd.md`, then `docs/PRD/<feature-prefix>-*.md`
   - AR: `SPECS_DIR/ar.md`, then `docs/AR/<feature-prefix>-*.md`
   - SEC: `SPECS_DIR/sec.md`, then `docs/SEC/<feature-prefix>-*.md`
   - If PRD exists: Read it as enriched requirements source (MoSCoW requirements, prioritized user stories, technical constraints). Use alongside or in preference to spec.md for requirements extraction.
   - If AR exists: Read it for architecture decisions, component design, and technical constraints. Incorporate selected option and implementation guardrails into the plan.
   - If SEC exists: Read it for security requirements (SEC-\* IDs), trust boundaries, and data classifications. Incorporate security tasks into the plan.

3. **Mode + Risk Gate** (read execution mode and risk triggers before artifact generation):

   a. Determine the execution mode and risk trigger state. **Preferred**: run `.specify/scripts/bash/check-prerequisites.sh --json` to obtain `EXECUTION_MODE`, `HAS_RISK_TRIGGERS`, and `RISK_TRIGGERS` from the authoritative shell functions. **Fallback** (if script unavailable): read manually:
   - Read `EXECUTION_MODE` from `SPECS_DIR/.feature-config.json` (key: `mode`), falling back to project default (`defaultMode` in `.specify/config.json`), then to `"balanced"` if neither exists
   - **Backward compatibility**: If `.feature-config.json` does not exist (features created before adaptive execution modes were added), display: `"Note: No execution mode configured for this feature. Defaulting to balanced. Run /speckit-specify to set a mode explicitly."` and continue with balanced mode.
   - **Validate** the mode is one of `fast`, `balanced`, or `detailed`. If invalid, emit: `"ERROR: Unknown execution mode '{value}'. Valid values: fast, balanced, detailed. Re-run /speckit-specify to reset."` and halt.
   - Read `RISK_TRIGGERS` by scanning FEATURE_SPEC for risk-indicating keywords (see `contracts/risk-triggers.md` for the canonical keyword catalog)
   - Set `HAS_RISK_TRIGGERS` to `true` if any keywords matched, `false` otherwise

   b. **Risk Trigger Notification** (if triggers detected in fast or balanced mode):
   If `HAS_RISK_TRIGGERS` is `true` AND `EXECUTION_MODE` is `fast` or `balanced`, display this notification **before** any AR/SEC artifact generation begins: `"Risk triggers detected in spec: [<matched keywords>]. Adding Architecture Review (AR) and Security Review (SEC) to this run. Continuing with escalated artifact set..."`

   c. **AR/SEC Artifact Gating** (mode-dependent):

   | Mode       | HAS_RISK_TRIGGERS | AR       | SEC      | Plan Depth                                                                                         |
   | ---------- | ----------------- | -------- | -------- | -------------------------------------------------------------------------------------------------- |
   | `fast`     | `false`           | Skip     | Skip     | Condensed: merge Summary and Technical Context into single block, omit PRD cross-reference section |
   | `fast`     | `true`            | Generate | Generate | Condensed (same as above)                                                                          |
   | `balanced` | `false`           | Skip     | Skip     | Full: all Technical Context fields, all sections                                                   |
   | `balanced` | `true`            | Generate | Generate | Full                                                                                               |
   | `detailed` | any               | Generate | Generate | Full, with explicit decision rationale section                                                     |
   - When generating AR: write to `SPECS_DIR/ar.md`
   - When generating SEC: write to `SPECS_DIR/sec.md`
   - For `detailed` mode: generate AR first, then SEC, then proceed to plan — establishing the rationale-before-implementation sequence. Include explicit decision rationale section in plan output.
   - For `fast` or `balanced` with triggers: generate AR and SEC before plan artifact generation

   d. Track `escalated` status: set to `true` if risk triggers caused AR/SEC to be added in fast or balanced mode; `false` otherwise (including detailed mode where AR/SEC are always included)

4. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Phase 1: Update agent context by running the agent script
   - Re-evaluate Constitution Check post-design
   - Apply plan depth rules from step 3c (condensed for fast, full for balanced/detailed)

5. **Run Summary Generation** (always, after plan is complete):

   After all artifacts are generated, create `SPECS_DIR/run-summary.md` with this structure:

   ```markdown
   # Run Summary: {BRANCH}

   **Date**: {YYYY-MM-DD}
   **Execution Mode**: {EXECUTION_MODE} ({MODE_SOURCE from .feature-config.json})

   ## Risk Assessment

   **Triggers Detected**: {comma-separated keywords, or "None"}
   **Escalated**: {Yes/No — true if triggers caused AR/SEC to be added in fast/balanced mode}

   ## Artifacts Generated

   - {list each filename created during this run, e.g., spec.md, plan.md, ar.md, sec.md, research.md, data-model.md, quickstart.md, run-summary.md}

   ## Token Estimate

   **Estimated tokens this run**: {N}
   _Token count is self-reported by the AI agent based on approximate context window usage during this plan run._
   ```

   - `run-summary.md` is overwritten on each plan run (not appended)
   - Token count should be the AI's best estimate of total tokens consumed during the full `/speckit-plan` workflow

6. **Stop and report**: Command ends after Phase 2 planning. Report branch, IMPL_PLAN path, and generated artifacts (including run-summary.md).

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.

- If it does not exist, or no hooks are registered under `hooks.after_plan`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_plan` key.
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing slash commands from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:

    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```

    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.

  - **Optional hook** (`optional: true`):

    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Command ends after Phase 2 planning. Report branch, IMPL_PLAN path, and generated artifacts (including run-summary.md).

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Define interface contracts** (if project has external interfaces) → `/contracts/`:
   - Identify what interfaces the project exposes to users or other systems
   - Document the contract format appropriate for the project type
   - Examples: public APIs for libraries, command schemas for CLI tools, endpoints for web services, grammars for parsers, UI contracts for applications
   - Skip if project is purely internal (build scripts, one-off tools, etc.)

3. **Create quickstart validation guide** → `quickstart.md`:
   - Document runnable validation scenarios that prove the feature works end-to-end
   - Include prerequisites, setup commands, test/run commands, and expected outcomes
   - Use links or references to contracts and data model details instead of duplicating them
   - Do not include full implementation code, model/service/controller bodies, migrations, or complete test suites
   - Keep this artifact as a validation/run guide; implementation details belong in `tasks.md` and the implementation phase

**Output**: data-model.md, /contracts/\*, quickstart.md

## Key rules

- Use absolute paths for filesystem operations; use project-relative paths for references in documentation
- ERROR on gate failures or unresolved clarifications

## Done When

- [ ] Plan workflow executed and design artifacts generated
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Completion reported to user with branch, plan path, and generated artifacts
