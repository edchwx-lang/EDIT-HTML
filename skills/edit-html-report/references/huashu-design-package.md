# Huashu Design Package Protocol

## Mandatory sequence

1. Create the variant; inspect `design/huashu-input/manifest.json` and all required input files.
2. Invoke `$huashu-design` explicitly. Never claim invocation by writing `generatedBy` yourself.
3. Use real content for showcases. With a reference, show overview, data/table, and master-detail/evidence scenes in one direction. Without a reference, show three differentiated directions using identical content.
4. Wait for user confirmation before producing the formal package.
5. Keep package grammar content-free and theme-semantic. Do not copy report prose, values, citations, source IDs, or literal colors into components/runtime.
6. Run `edit-html-report design hash <package-dir>`. Put the returned SHA-256 plus `skill`, `skillVersion`, `runId`, `invokedAt`, `inputSha256`, references, and pending confirmation in `manifest.json`.
7. Import with `edit-html-report design import <project> --variant <id> --from <package-dir>` and confirm with `edit-html-report design confirm <project> --variant <id>`.
8. Check `edit-html-report design status <project> --variant <id>`. Only `confirmed` may render.

## Required package

```text
manifest.json
tokens.json
layout-grammar.json
component-grammar.json
chart-grammar.json
table-grammar.json
interaction-grammar.json
responsive-grammar.json
components/      optional
styles/          optional
runtime/         optional, local only
showcases/       optional, recommended
```

Validation rejects missing run evidence, input/output hash mismatch, report copy or numbers embedded in design files, literal colors, remote imports/fetches, and missing confirmation. Return failures to Huashu for repair; never fall back to a generic template.
