# Running EDIT-HTML V5.5 with Workbuddy

Workbuddy can run EDIT-HTML when it provides local shell execution, filesystem access, and a way to hand local URLs back to the user.

## Setup

```bash
npm ci
npm run install:local
edit-html-report doctor --json
```

The local installer is verified on Windows with Node.js 20+. It checks installed Chromium/Edge/Chrome, downloading Chromium only when needed. Do not assume the Windows installer is verified on macOS.

## Execution rules

Use the same `skills/edit-html/SKILL.md` sequence as Codex and read its bundled `vendor/huashu-design/SKILL.md` completely. No separate Huashu installation is required; `design huashu begin` uses the verified bundle by default. Preserve Huashu begin/attest receipts and stop for user A/B/C selection before final generation.

Do not bypass the Huashu design gate or redesign the site during audit and instrumentation.
