# Edit HTML Report Rebuild Design

## Goal

Build a local, Agent-neutral tool that turns user-provided source material into an editable, traceable HTML report and can version, package, and publish it. The rebuild does not reuse the former Runner, Electron app, fixed drive paths, Python runtime, Blueprint renderer, or cloud orchestration.

## Boundaries

- Require Node.js 20 or newer as the only system runtime.
- Support Codex, Claude Code, and WorkBuddy through one Skill file and one CLI.
- Keep the CLI model-neutral. The active Agent analyzes content and authors the report.
- Use only facts found in user material. Web references may inform visual design but never report claims.
- Provide content-level editing, not free-canvas layout editing.
- Keep credentials outside projects and generated HTML.
- Treat visual benchmarking as a later gate; this phase must pass functional, data-integrity, offline, and security tests.

## Architecture

Use one ESM Node package with focused modules:

1. cli: stable commands and exit behavior.
2. project: workspace creation, source hashing, schemas, and atomic JSON writes.
3. analysis: deterministic source extraction plus an Agent handoff contract.
4. variants: immutable variant identities and mode/theme validation.
5. artifacts: editable-node contracts, provenance checks, and HTML finalization.
6. versions: draft patches, immutable snapshots, and non-destructive restoration.
7. editor: loopback-only HTTP server with a scoped session token.
8. packaging: portable archive and self-contained HTML checks.
9. publish: local output plus process adapters for official Netlify and Vercel CLIs.
10. skill: concise orchestration instructions and Huashu report design profile.

Prefer pure Node parsers for DOCX, PDF, and PPTX. Introduce a signed platform sidecar only if fixture tests prove a format cannot be handled reliably in Node.

## Project Contract

Each report is a directory:

    project.json
    analysis.json
    report-plan.json
    deployments.json
    source/
    variants/<variant-id>/
      artifact.html
      edit-manifest.json
      charts.json
      provenance.json
      draft-patches.jsonl
    versions/<version-id>/
      artifact.html
      version.json

Editable HTML uses data-edit-id, data-block-id, data-image-id, data-chart-id, and data-source-ref. Themes may change tokens and chart palettes only; they may not alter information architecture.

## Data Flow

create copies and hashes source files, extracts deterministic text, and writes analysis.json. The Agent reads analysis.json, confirms evidence-first or data-first, then creates a variant and authors its artifact. finalize validates edit IDs, provenance, numeric claims, and external resources before creating a saved version. open exposes the chosen variant through a loopback editor. pack archives the project. publish accepts only a saved version.

## Security and Failure Handling

- Bind the editor to 127.0.0.1 and require a high-entropy session token.
- Resolve every requested path beneath the project root and reject traversal.
- Write JSON and HTML atomically through sibling temporary files and rename.
- Never persist provider tokens.
- Refuse publication of dirty drafts or artifacts containing remote resource requests.
- Preserve failed deployment metadata without marking the version published.

## Testing

Use Node's built-in test runner and fixture directories. Follow red-green-refactor for each behavior. Cover project creation, source hashing, variants, schemas, provenance, numeric derivations, patches, versions, traversal, offline HTML, archive round-trips, provider command construction, editor actions, and multi-variant regression. Add Windows and macOS CI after the first vertical slice.

## Delivery Sequence

1. Core CLI and project/variant/finalize vertical slice.
2. Skill and Huashu profile.
3. Editor, patches, and version restoration.
4. Packaging and local publication.
5. Netlify/Vercel adapters.
6. DOCX/PDF/PPTX fixtures, cross-platform CI, and Agent forward tests.

