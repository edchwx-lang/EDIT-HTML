# EDIT-HTML V5.4 Agent Contract

V5.4 keeps the V5.3.2 workflow unchanged. Compatibility work only makes the same workflow executable in more local-agent and operating-system environments.

## Required capabilities

Any agent running EDIT-HTML must be able to:

1. Execute local shell commands.
2. Read and write the local project directory.
3. Use Node.js 20 or newer.
4. Install npm dependencies.
5. Install or use Playwright Chromium for browser verification.
6. Access the actual `huashu-design/SKILL.md` used by the Huashu design stage.
7. Preserve Huashu begin/attest receipt files exactly.
8. Present the authenticated local editor URL and local launcher path to the user.

## Non-negotiable gates

- The agent must invoke the Huashu design stage before candidate or final generation.
- The agent must not design the website itself.
- The agent must not simulate a Huashu receipt.
- The agent must not confirm A/B/C selection from hidden preference or agent autonomy.
- The agent must not alter Huashu-owned DOM, CSS, layout, charts, or interaction during audit or instrumentation.

## Operating-system expectations

- Windows uses `%USERPROFILE%\.codex\skills` by default.
- macOS uses `$HOME/.codex/skills` by default.
- Path comparisons must tolerate Windows case and short-path aliases and macOS `/private/var` versus `/var` aliases.
