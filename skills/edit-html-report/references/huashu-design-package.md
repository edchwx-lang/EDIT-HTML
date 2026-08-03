# Huashu Executable Candidate Protocol V2

## Sequence

1. Create the variant and inspect every `design/huashu-input/` file.
2. Invoke `$huashu-design` explicitly with real content. Never fabricate invocation evidence.
3. With a reference, make one candidate covering hero, data/table, and master-detail/evidence. Without a reference, make three candidates using identical slices and one shared `previewThemeId`.
4. Compile each showcase from the same candidate grammar that will render the final report. Do not make an independent mockup.
5. Import candidates, show them to the user, and wait for selection.
6. Confirm the selected candidate. Confirmation promotes its exact payload to `design/package/`; it must not regenerate files.
7. Render and validate only the confirmed package.

## Required candidate

```text
manifest.json
tokens.json
layout-grammar.json
component-grammar.json
chart-grammar.json
table-grammar.json
interaction-grammar.json
responsive-grammar.json
components/registry.json
styles/report.css
showcases/manifest.json
showcases/desktop.png
showcases/mobile.png
```

Manifest schema v2 records `packageVersion: 4.2.0`, candidate/direction identity, `previewThemeId`, input/output/showcase SHA-256, and confirmation. Every binding references a registered safe primitive, implemented layout, package class, and built-in local interaction ID.

`styles/report.css` is content-free. It may use semantic `--report-*` variables and layout values, but no report prose/numbers/source IDs, literal colors, remote URLs/imports, arbitrary script, or data fetch.

Commands:

```text
edit-html-report design candidate import <project> --variant <id> --from <dir>
edit-html-report design candidate list <project> --variant <id>
edit-html-report design candidate status <project> --variant <id>
edit-html-report design candidate confirm <project> --variant <id> --candidate <candidate-id>
```

Legacy `design import/confirm/status` may inspect V4.1.1 projects only. A weak V4.1.1 package cannot rerender a V4.2 variant.
