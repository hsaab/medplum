---
name: build-feature-e2e
description: Builds an entire feature end-to-end for autonomous demo preparation with planning, implementation, critical-path tests, and targeted UI smoke testing. Use only when the user explicitly wants an autonomous or long-running agent to deliver a working demo-ready Medplum feature quickly and safely.
disable-model-invocation: true
---

# Build Feature E2E

## Goal

Autonomously deliver a demo-ready vertical slice: implemented behavior, critical-path tests, targeted verification, and a concise handoff summary.

## Start Here

1. Use this skill only for explicit autonomous demo-prep requests. For ordinary feature requests, use the standard feature-building workflow.
2. Do not switch into Plan mode or wait for human approval.
3. Restate the feature in one sentence.
4. Define the demo-critical path: the shortest user flow that proves the feature works.
5. Target a 15-minute first vertical slice. This is a checkpoint, not a hard stop: if more time is needed, narrow scope and keep working in 15-minute loops until the demo path is verified or honestly blocked.
6. Identify whether this is a frontend feature, backend feature, full-stack feature, or internal-code feature.
7. For design-matching frontend work, acquire a usable Figma artifact through MCP or a directly attached/local PNG/SVG before implementing visual fidelity. When Figma is available, it is the source of truth for visible UI layout, sections, labels, spacing, and interaction placement. If no artifact is accessible, stop or mark the work functional-only when the user already accepted that reduced goal.
8. Proceed autonomously unless blocked by missing credentials, destructive actions, ambiguous product requirements that would change the demo outcome, inaccessible design artifacts required for visual matching, or an external manual step.

## Medplum Demo Paths

- For app changes, define the route, resource screen, form, table, dialog, or auth flow that proves the feature.
- For API/server changes, define the FHIR resource operation, auth behavior, migration, background job, or integration path that proves the feature.
- For shared packages, identify downstream package behavior or example usage that demonstrates the changed contract.
- Prefer targeted workspace verification, then broaden only when the demo path crosses package boundaries.

## Autonomous Planning

Before editing, write a compact plan for yourself:

- Success criteria.
- Files and systems likely to change.
- Critical path tests to add or update.
- Design artifact status: Figma available, static artifact available, or visual fidelity blocked. If Figma is available, list the visible sections that must match and identify any ticket text that conflicts with the design.
- Verification commands and, for frontend work, the UI smoke path.
- Verification preflight: dependencies installed, workspace package artifacts built, backend services available, and live UI smoke possible rather than static review only.
- Risks that could make the demo fail.

Then review the plan as if you were reviewing another engineer's proposal:

- Is the vertical slice small enough to finish?
- Does it prove the requested feature end-to-end?
- Are tests focused on the critical path?
- Is any planned work speculative or unrelated?

Revise the plan once, then execute. Do not ask the user to approve the plan.

## Safety Boundaries

- Preserve existing user changes. Check the working tree before risky edits and do not revert unrelated files.
- Do not run destructive commands, touch secrets, modify production data, or change external services without explicit user approval.
- Do not commit or push unless the user explicitly asks.
- If the requested outcome requires credentials, paid external actions, destructive migrations, or manual setup, stop and report the blocker.

## Execution Loop

1. Read the immediate implementation area, public contracts, data flow, and nearby tests.
2. Implement the smallest complete path first. Defer polish until the core path works.
3. Add tests for the critical path and the highest-risk edge case.
4. Preflight test commands before running them: confirm the runner exists, required workspace `dist` artifacts exist, and required backend services are reachable. Run targeted tests first after preflight. Add typecheck or broader tests only when contracts or shared code changed.
5. If this is a frontend feature, run the `ui-smoke-test` subagent without readonly mode. Manual browser smoke can supplement the subagent, but should not replace it unless subagent launch is blocked. The smoke must load the page, exercise the demo flow, check console errors, check failed network requests, and compare visible UI against the Figma/source artifact when one exists.
6. If `ui-smoke-test` reports that no browser was launched, treat it as static review only. Run a manual browser smoke if tools allow; otherwise report UI smoke as blocked, not passed.
7. Fix failures that block the demo-critical path. Do not chase unrelated failures unless they were introduced by the change.
8. If the full feature is not reachable quickly, choose a smaller credible path before stopping. Stop with a handoff only when the demo path is verified or no honest vertical slice remains.

## Timebox Discipline

- Prefer a working vertical slice over a broad incomplete implementation.
- Optimize for a 15-minute first pass. At each 15-minute checkpoint, either verify the demo path, narrow the slice, or name the blocker.
- Do not refactor unrelated code for aesthetics.
- If stuck for more than 10 minutes on one issue, choose a smaller path or summarize the blocker only if autonomous progress is no longer possible.
- Do not run the entire test suite unless targeted verification passes and time remains.

## Demo Definition Of Done

- The demo-critical path works.
- Critical-path tests exist and pass.
- Frontend changes have a targeted UI smoke result, including console and network observations.
- Any skipped verification is named with the reason.
- The final response includes exactly what to demo and the primary changed areas.

## Final Handoff

Use this format:

```markdown
## Demo-Ready Feature
[One paragraph describing what works now.]

## Changed Areas
- [Main files or systems touched]

## Critical Path
- [Step 1]
- [Step 2]
- [Step 3]

## Verification
- `[command]`: [result]
- UI smoke: [result or "Not applicable"]

## What To Demo
1. [Action]
2. [Expected result]

## Caveats
- [Skipped check, known limitation, or "None found"]
```
