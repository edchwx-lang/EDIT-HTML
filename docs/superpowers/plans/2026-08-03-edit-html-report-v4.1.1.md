# Edit HTML Report V4.1.1 implementation plan

## Boundary

Only change the pipeline before `artifact.html`:

`source-model -> report-model + coverage-map -> Huashu input -> confirmed design package -> deterministic HTML compiler`

Freeze drafts, editor sessions, editor shell, undo/redo, versions, finalize, publishing, packaging, launchers, editor APIs, version records, and publication records. New artifacts must satisfy the existing DOM editing contract.

## Contract changes

- Keep `schemaVersion: 4`; set `packageVersion` and `pipelineVersion` to `4.1.1`.
- Make `report-model.json` and `coverage-map.json` the only canonical compiler outputs after extraction.
- Stop generating a presentation plan with the built-in `huashu-presentation-mapper`.
- Create `design/huashu-input/` from real report content and immutable snapshots.
- Require an imported Huashu package with verifiable input/output SHA-256 values and a confirmed showcase before rendering.
- Compile `presentation-plan.json` deterministically from report nodes and the design package grammar.
- Reject hard-coded report copy, numbers, colors, remote runtime dependencies, unbound components, and unconfirmed packages.
- Add `deep-data-blue` as the visible data-first default. Keep `linear-indigo` readable as a hidden legacy theme.

## Implementation order

1. Add frozen downstream contract tests.
2. Add design-package tests that fail without Huashu input/package support.
3. Implement Huashu input generation, package import, confirmation, hashing, and validation.
4. Split content compilation from design compilation and remove the direct mapper.
5. Gate render/validate on a valid confirmed design package.
6. Upgrade themes and compatibility behavior.
7. Update schemas, CLI, Skill instructions, references, and agent metadata.
8. Run unit, E2E, syntax, Skill, and package verification.

## Acceptance

- A new variant has `report-model.json`, shared `coverage-map.json`, and a complete Huashu input package, but no formal `artifact.html`.
- `render` fails clearly when the package is missing, stale, tampered, hard-coded, remotely dependent, or unconfirmed.
- Importing and confirming a valid Huashu package allows deterministic rendering.
- Generated HTML retains all existing editable IDs, chart data, source bindings, offline behavior, theme switching, and downstream editor/version/publication behavior.
- Six visible themes remain; `deep-data-blue` replaces visible `linear-indigo` without rewriting historical HTML.
