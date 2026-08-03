---
name: edit-html-report
description: Use when converting DOCX, PDF, PPTX, Markdown, HTML, or TXT research reports and project proposals into source-faithful, editable, versioned HTML reports; choosing data-first versus evidence-first; invoking Huashu Design for real-content showcases and a confirmed design package; changing report palettes; reopening the local editor; restoring versions; or publishing traceable local/public artifacts.
---

# Edit HTML Report V4.1.1

Compile reports through structured content and a confirmed Huashu design package. Treat `source-model.json` as immutable extraction, `report-model.json` plus `coverage-map.json` as the only canonical compiler models, `presentation-plan.json` as a generated design-package index, and `artifact.html` as deterministic output.

## Run the workflow

1. Run `edit-html-report doctor`. Create a project with `edit-html-report create <source> --out <project>`, or inspect V3 migration with `edit-html-report migrate <project> --dry-run`.
2. Read [references/content-pipeline.md](references/content-pipeline.md) completely. Inspect extraction warnings, substantive source units, facts, transformations, and coverage.
3. Present data-first and evidence-first in the user's language, recommend one with source evidence, and ask only for mode unless already selected. Create exactly one variant with `edit-html-report variant create <project> --mode <data-first|evidence-first>`.
4. Read the selected mode reference completely: [references/data-first.md](references/data-first.md) or [references/evidence-first.md](references/evidence-first.md). Then read [references/huashu-design-package.md](references/huashu-design-package.md), [references/presentation-plan.md](references/presentation-plan.md), and [references/artifact-contract.md](references/artifact-contract.md) completely.
5. Explicitly invoke `$huashu-design` with `design/huashu-input/`. Use the real content slices. With a supplied reference, show one coherent direction across overview, data/table, and master-detail/evidence scenes. Without a reference or design system, show three real-content directions.
6. Obtain user confirmation. Produce a content-free, semantic-token design package; compute its hash with `edit-html-report design hash <package-dir>`, record the hash and real Huashu run details in `manifest.json`, import it with `edit-html-report design import <project> --variant <id> --from <package-dir>`, then record confirmation with `edit-html-report design confirm <project> --variant <id>`.
7. Run `edit-html-report render <project> --variant <id>` and `edit-html-report validate <project> --variant <id>`. Missing, stale, tampered, hard-coded, remote-dependent, or unconfirmed packages must fail. Never substitute a built-in template.
8. Read [references/editor-publication.md](references/editor-publication.md) completely. Open the persistent editor with `edit-html-report editor open <project> --variant <id>`. Let the user edit, switch among six visible palettes, and save an immutable version. Publish only an explicitly saved clean version.
9. Report project path, variant ID, mode, palette, Huashu run ID and hashes, coverage result, warnings, saved version ID, publication record/path or URL, and verification results.

## Enforce boundaries

- Never invent, supplement, weaken, reverse, or silently omit facts, numbers, qualifications, citations, or source relationships.
- Preserve first-level research logic and relative content weight. Allow only local claim-evidence grouping, like-object comparison, de-duplication, and explicit transformations recorded in `coverage-map.json`.
- Visualize only semantically clear, unit-compatible data. Derived values require formula, inputs, and source IDs.
- In data-first, rebuild statistical screenshots, table screenshots, process diagrams, and relationship diagrams from reliable structured data; otherwise emit a warning. In evidence-first, preserve original evidence selectively while preferring native redraws for quantitative charts.
- Huashu controls layout, hierarchy, components, chart/table grammar, interaction, responsive behavior, and visual rhythm. It never controls facts, source binding, coverage, or editor IDs.
- The deterministic compiler owns `data-node-id`, `data-edit-id`, `data-block-id`, `data-chart-id`, `data-image-id`, offline runtime, and chart data compatibility.

## Route supporting work

- Palette questions: read [references/themes.md](references/themes.md).
- V3 or legacy compatibility: read [references/migration.md](references/migration.md).
- Editor recovery, history, or publication: read [references/editor-publication.md](references/editor-publication.md).

Do not skip Huashu invocation evidence, showcase confirmation, coverage validation, the editor, the saved-version checkpoint, or the publication record.
