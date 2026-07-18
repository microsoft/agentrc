---
name: "speckit-security"
description: "Perform a lightweight security review identifying attack surface, data classification, and CIA impact for an existing PRD."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/security.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` once from the repository root and parse `FEATURE_DIR` and `FEATURE_SPEC` from its JSON output. This supported mode resolves paths without requiring `plan.md`. It does not return `AVAILABLE_DOCS`, `PRD`, or `ARD` fields.

2. **Require PRD**: Resolve `PRD_PATH` explicitly. First try `FEATURE_DIR/prd.md`; if absent, use the single matching `docs/PRD/<feature-directory-name>-*.md` file. If multiple fallback files match, stop and ask the user to select one.
   - If missing: ERROR "prd.md not found. Run /speckit-prd first to create the Product Requirements Document."
   - Read the resolved PRD document and extract:
     - Data Model entities and their fields
     - Interface Contract (exposure points)
     - Must Have / Should Have requirements
     - User Stories (to understand user-facing attack surface)
     - Technical Constraints
     - Security Considerations section (if filled)

3. **Optional context**: Resolve `AR_PATH` explicitly. First try `FEATURE_DIR/ar.md`; if absent, use the single matching `docs/AR/<feature-directory-name>-*.md` file. If multiple fallback files match, stop and ask the user to select one. If an AR exists, read it for:
   - Component architecture and data flow
   - External dependencies and services
   - Interface definitions
   - Trust boundaries implied by architecture

4. **Load template**: Read `.specify/templates/sec-template.md` to understand required sections and structure.

5. **Execute security review workflow**:
   1. Fill **Linkage** section with references to PRD and AR (if exists)
   2. Draft **Feature Security Summary** — one-line summary and initial risk assessment
   3. **Attack Surface Analysis**:
      - Map PRD Interface Contract → Exposure Points table
      - For each endpoint/input: document authentication, authorization, and validation
      - Generate Attack Surface Diagram showing trust boundaries
      - Complete Exposure Checklist
   4. **Data Flow Analysis**:
      - Map PRD Data Model entities → Data Inventory with classifications (Public/Internal/Confidential/Restricted)
      - For EVERY entity in the PRD Data Model, assign a classification
      - Generate Data Flow Diagram showing data movement and classification levels
      - Complete Data Handling Checklist
   5. **Third-Party & Supply Chain**: List new external services and dependencies from PRD/AR
   6. **CIA Impact Assessment**:
      - Confidentiality: What could be disclosed? Map to data classifications
      - Integrity: What could be modified? Map to data entities
      - Availability: What could be disrupted? Map to components
      - Generate CIA Summary table with risk levels
   7. **Trust Boundaries**: Identify where trust changes, generate boundary diagram
   8. **Known Risks & Mitigations**: Identify risks with severity levels
   9. **Security Requirements**:
      - Generate SEC-\* requirement IDs (SEC-1, SEC-2, etc.)
      - Map to PRD Acceptance Criteria where applicable
      - Categorize: Authentication & Authorization, Data Protection, Input Validation, Operational Security
      - Each requirement must have a verification method
   10. **Compliance Considerations**: Assess GDPR, CCPA, SOC 2, HIPAA, PCI-DSS applicability
   11. **Traceability**: Complete Security Requirements Traceability table mapping SEC → PRD → AC
   12. Return: SUCCESS (security review ready for human review)

6. **Write SEC**: Resolve `SEC_PATH=FEATURE_DIR/sec.md` and save the review there using the template structure.

7. **Generate risk-level-based review checklist** at end of output:

   ```markdown
   ## Security Review Actions

   **Overall Risk Level**: [Low/Medium/High/Critical]

   ### Required Actions (based on risk level):

   **All Risk Levels:**

   - [ ] Feature Security Summary (@human-required) - Validate risk assessment
   - [ ] Risk Acceptance (@human-required) - Sign off on accepted risks
   - [ ] Review Sign-off (@human-required) - Final approval

   **Medium+ Risk:**

   - [ ] Exposure Points (@human-review) - Verify authentication/authorization coverage
   - [ ] Data Inventory (@human-review) - Confirm data classifications
   - [ ] CIA Assessment (@human-review) - Validate impact ratings
   - [ ] Trust Boundaries (@human-review) - Confirm boundary placements

   **High+ Risk:**

   - [ ] All security requirements need explicit verification plans
   - [ ] Compliance considerations need legal review
   - [ ] Consider escalating to full threat model

   **Critical Risk:**

   - [ ] STOP - Escalate to security team before proceeding
   - [ ] Full threat model required before implementation
   ```

8. **Report**: Output path to generated `sec.md`, overall risk level, count of security requirements generated, and readiness for next phase (`/speckit-plan` or `/speckit-tasks`).

## Key Rules

- Use absolute paths for all file operations
- Every Data Model entity from the PRD MUST appear in the Data Inventory
- Security requirement IDs (SEC-\*) must trace to PRD ACs where applicable
- Exposure Points table must not have contradictory rows (None vs. actual endpoints)
- CIA assessment must provide Low/Medium/High ratings for all three dimensions
- This is a LIGHTWEIGHT review — identify concerns, don't prescribe full solutions
- Flag items needing deeper investigation rather than making assumptions about security posture
