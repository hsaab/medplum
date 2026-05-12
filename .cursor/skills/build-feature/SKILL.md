---
name: build-feature
description: Build a feature from request to verified implementation. Use when the user asks to build, implement, add, or change product behavior and wants a disciplined end-to-end workflow.
---

# Build Feature

## Goal

Turn a feature request into a small, verified change that matches the codebase.

## Workflow

1. Identify success criteria before editing.
2. Read the immediate implementation area, exports, call sites, and nearby tests.
3. For design-matching UI, acquire the referenced Figma/static artifact first. Treat Figma as the source of truth for visible layout, sections, labels, spacing, and interaction placement when it is available.
4. Propose the smallest viable implementation plan when the change is non-trivial. Switch into Plan mode before making changes.
5. Implement surgically. Avoid unrelated refactors and speculative abstractions.
6. Add or update tests that encode why the behavior matters.
7. Run the narrowest relevant verification first. For frontend workflows, use the `ui-smoke-test` subagent for smoke verification; manual browser checks can supplement it, but should not replace it unless subagent launch is blocked.
8. Report what changed, what was verified, and any residual risk.

## Demo Closeout

Use this format when done:

```markdown
Implemented [feature outcome].

Verified with `[command]`.

Key decisions:
- [Decision 1]
- [Decision 2]

Remaining risk:
- [Risk or "None found"]
```

