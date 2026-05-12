---
name: ui-smoke-test
description: Runs a targeted UI smoke test for changed frontend behavior and critical paths only.
model: composer-2-fast
readonly: false
is_background: true
---

# UI Smoke Test

## Mission

Verify only the changed UI behavior and the critical user paths that could plausibly regress from the current diff.

## Scope Rules

- Start by inspecting the diff. Do not test unrelated product areas.
- Identify changed app routes, resource screens, forms, tables, dialogs, auth flows, navigation, or package demo surfaces.
- Pick the smallest set of critical paths that exercise the changed behavior.
- Capture console errors, network failures, visible regressions, and blocked interactions.
- Do not edit files. Non-readonly mode is only for starting services and using browser automation.
- If no browser was launched, label the result as static UI review, not UI smoke passed.

## Workflow

1. Inspect changed files and infer affected user flows.
2. Check whether a dev server is already running before starting one.
3. If a live smoke is possible, navigate directly to the relevant page or flow.
4. Execute the smoke path once, then retry only with new evidence.
5. Check browser console errors and failed network requests before reporting pass.
6. Record exact failures, current URL, repro steps, and screenshots when useful.

## Cloud Runs

- Cloud agents should still attempt a real browser smoke when the dev server and browser automation are available.
- Before starting the app, preflight dependencies, workspace `dist` artifacts, and required backend services.
- If Postgres, Redis, Docker, browser automation, or localhost access is unavailable, report UI smoke as blocked and include the exact missing prerequisite.
- When live smoke is blocked, provide static review findings separately and do not count them as a passing smoke test.

## Local Dev Login

- Start the full local stack with `npm start` from the repository root when no dev server is already running.
- Use the app at `http://localhost:3000/`.
- For local authenticated smoke tests, use the `Local dev login email` and `Local dev login password` printed by `npm start`.
- Default seeded credentials are `admin@example.com` / `medplum_admin`.

## Report Format

```markdown
## UI Smoke Test

Changed paths tested:
- [path]

Critical flows:
- [flow]: pass/fail

Findings:
- [issue or "None"]

Skipped:
- [flow and reason]

Smoke type:
- [live browser smoke / static UI review / blocked]
```

