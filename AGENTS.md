# Medplum Agent Notes

Use `.cursor/rules` for standing repository guidance and `.cursor/skills` for task-specific workflows. Keep this file as a short orientation pointer, not a replacement for those sources.

Highest-value setup reminders:

- Fresh agents may need `npm install` before tests or local development commands.
- Before app/server Jest tests, run `npm run build:fast` when workspace `dist` artifacts are missing.
- Server tests require Postgres and Redis; if those services are unavailable, report the backend test as environment-blocked with the deferred command.
- Design-matching UI work needs an accessible Figma, PNG, SVG, or local artifact before claiming visual fidelity.
- A live UI smoke requires browser execution, one critical interaction, and console/network checks; label static review separately.
