---
name: edit-html-report
description: Use when converting DOCX, PDF, PPTX, Markdown, HTML, or TXT reports into source-closed but editorially restructured, Huashu-designed, editable, versioned HTML; comparing complete material-driven design strategies; switching six color-only themes; reviewing in the visible editor; restoring versions; or publishing traceable artifacts.
---

# Edit HTML Report V4.3

Use three boundaries, in this order:

```text
immutable facts
-> source-closed, expression-free editorial content
-> complete Huashu design strategy
-> color-only theme
```

Do not ask the user to choose `data-first` or `evidence-first`. In V4.3, information priority belongs to the complete design strategy. Legacy mode fields remain derived/read-only for compatibility.

## Run the workflow

1. Run `edit-html-report doctor`. Create with `edit-html-report create <source> --out <project>`, then create a variant without `--mode`. Dry-run migration before changing a legacy project.
2. Read [references/content-pipeline.md](references/content-pipeline.md) completely. Inspect every extracted unit, warning, table, image, fact, qualification, and source location.
3. Produce one editorial report model under the following contract:
   - `sourcePolicy: closed`: report facts and data may come only from the supplied material. External references may influence visual design only.
   - `expressionPolicy: free`: retitle, summarize, split, merge, regroup, locally reorder, and convert compatible content to lists, tables, metrics, or charts.
   - Preserve facts, numbers, units, time, scope, qualifications, relationships, provenance, first-level research logic, and relative content weight.
   - Map every substantive source unit through `coverage-map.json`. A source heading is evidence, not a required display heading.
4. Validate and import the editorial model with `edit-html-report content import <project> --variant <id> --report <report-model.json> --coverage <coverage-map.json>`. Do not proceed while substantive coverage is pending or editorial validation fails.
5. Read [references/design-selection.md](references/design-selection.md), [references/huashu-design-package.md](references/huashu-design-package.md), [references/presentation-plan.md](references/presentation-plan.md), and [references/artifact-contract.md](references/artifact-contract.md) completely. Then explicitly invoke `$huashu-design` with every file in `design/huashu-input/`.
6. Choose the design path from available context:
   - Clear reference/site/screenshot/design system: create one complete strategy and compile three representative scenes (hero, data/table, master-detail/evidence).
   - Vague or absent design requirements: create three independent, material-driven complete strategies. They must differ in information priority, content composition, component tree, layout, visualization, interaction, navigation, responsive behavior, or typographic rhythm—not merely CSS.
   - For the three-strategy comparison, use the light themes by position: `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive`. Color reduces comparison fatigue; it is not the strategy difference.
7. Import candidates with `design candidate import`, show the compiled desktop/mobile showcases, and wait for selection. Confirm the selected candidate. Confirmation atomically promotes its composition and design payload; never regenerate after selection.
8. Run `render` and `validate`. The compiler may inject stable edit/source IDs, semantic theme tokens, and safe offline runtime only. It must use the confirmed component tree, composition, chart specs, layouts, and interactions and must never silently redesign or fall back to a fixed template.
9. For charts, enforce semantic behavior: line/area selects the nearest X group with a narrow crosshair/band; bar selects only the hovered bar; scatter selects the nearest point. Never fill the whole chart stage from the origin to the pointer.
10. Read [references/editor-publication.md](references/editor-publication.md) completely. From this point onward the V4.2 editor contract is frozen. Open the visible editor with `edit-html-report editor open <project> --variant <id>` and pause. The user may edit or switch among six themes, then must click “确认设计与配色”. Do not use a hidden API or click in place of the user.
11. Only after visible confirmation may the user save an immutable version and publish it. Theme changes, edits, undo/redo, and rerenders invalidate confirmation.
12. Report the project path, variant ID, editorial status and coverage, three strategy IDs/showcase hashes when applicable, selected composition/component/package hashes, theme, validation, visible-editor review state, version, publication, and warnings.

## Hard boundaries

- Facts are immutable before `artifact.html`; expression is not. Verbatim copying is not a fidelity requirement.
- A numeric paragraph is narrative unless the editorial model explicitly supplies a complete metric contract.
- Charts consume explicit compatible datasets. Never scrape numbers from prose.
- Huashu owns information priority and executable design. The compiler owns protocol safety, provenance, stable IDs, and offline execution.
- A theme changes semantic colors only; it never changes content, DOM, geometry, typography, chart type/data/order, interaction, or citations.
- Everything after `artifact.html`—visible edits, undo/redo, theme switching, confirmation, versions, restore, and publishing—keeps the existing contract.

## Supporting references

- Theme system: [references/themes.md](references/themes.md)
- Migration: [references/migration.md](references/migration.md)
- Editor/version/publication: [references/editor-publication.md](references/editor-publication.md)

Do not skip editorial validation, real Huashu invocation, compiled showcases, user strategy selection, atomic hash promotion, visible editor review, or human confirmation.
