# Running EDIT-HTML V5.5 with Claude Code

Claude Code can run EDIT-HTML when it is operating as a local coding agent with shell and filesystem access.

## Setup

```bash
npm ci
npm run install:local
edit-html-report doctor --json
```

The local installer is verified on Windows with Node.js 20+. It checks installed Chromium/Edge/Chrome, downloading Chromium only when needed. Do not assume the Windows installer is verified on macOS.

## Execution rules

Follow `skills/edit-html/SKILL.md` exactly, including its content-only adaptation. Read the bundled `vendor/huashu-design/SKILL.md` completely; `design huashu begin` binds that real provider by default. No separately installed Huashu Skill is required. Do not substitute a generic agent-authored design phase.

When the editor opens, report the authenticated local editor URL and launcher path back to the user.
