# Running EDIT-HTML V5.4 with Workbuddy

Workbuddy can run EDIT-HTML when it provides local shell execution, filesystem access, and a way to hand local URLs back to the user.

## Setup

```bash
npm install
npx playwright install chromium
npm run install:local
```

If Workbuddy runs on macOS and the `powershell` command is unavailable, use `pwsh` directly:

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/install-local.ps1 -SourceRoot .
```

## Execution rules

Use the same `skills/EDIT-HTML/SKILL.md` sequence as Codex. Workbuddy must preserve Huashu begin/attest receipts and must stop for user A/B/C selection before final generation.

Do not bypass the Huashu design gate or redesign the site during audit and instrumentation.
