# Running EDIT-HTML V5.4 with Claude Code

Claude Code can run EDIT-HTML when it is operating as a local coding agent with shell and filesystem access.

## Setup

```bash
npm install
npx playwright install chromium
npm run install:local
```

On macOS, run the installer from PowerShell if `npm run install:local` is not available through the default shell:

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/install-local.ps1 -SourceRoot .
```

## Execution rules

Follow `skills/EDIT-HTML/SKILL.md` exactly. Claude Code must use the real `huashu-design/SKILL.md` in `design huashu begin`; it must not substitute a Claude-authored design phase.

When the editor opens, report the authenticated local editor URL and launcher path back to the user.
