# Edit HTML Report Rebuild Implementation Plan

## Phase 1: Executable Core

1. Establish a zero-legacy Node 20+ ESM package and built-in test runner.
2. Test and implement safe filesystem primitives and atomic writes.
3. Test and implement create, source hashing, deterministic analysis, and inspect.
4. Test and implement variant creation/listing with mode-theme constraints.
5. Test and implement artifact contracts, provenance validation, and finalize.
6. Test the CLI through real child processes.

## Phase 2: Skill

1. Initialize edit-html-report with the official Skill scaffolder.
2. Write concise orchestration instructions.
3. Add the Huashu report profile, artifact contract, and Agent handoff reference.
4. Add CLI helper scripts and validate the Skill.

## Phase 3: Editor and Versions

1. Test patch application, undo/redo, snapshots, and non-destructive restore.
2. Test and implement the token-protected loopback API.
3. Build the no-sidebar full-viewport editor toolbar and content actions.
4. Add browser end-to-end tests.

## Phase 4: Packaging and Publishing

1. Test self-contained HTML resource validation and archive round-trips.
2. Implement local publication.
3. Test provider command construction without network calls.
4. Implement Netlify and Vercel CLI adapters with credential redaction.

## Phase 5: Formats and Acceptance

1. Add DOCX, PDF, and PPTX fixtures and pure Node parsers.
2. Add Windows x64, macOS x64, and macOS arm64 CI.
3. Run Codex and Claude Code forward tests; verify WorkBuddy fallback.
4. Run security, regression, and offline acceptance suites.

