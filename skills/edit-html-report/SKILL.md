---
name: edit-html-report
description: Use when converting DOCX, PDF, PPTX, Markdown, HTML, or TXT reports into source-faithful, editable, versioned HTML; choosing data-first versus evidence-first; generating executable Huashu design candidates; switching six color-only themes; reviewing in the visible editor; restoring versions; or publishing traceable artifacts.
---

# Edit HTML Report V4.2

Compile reports through three independent layers:

```text
mode: data-first | evidence-first
× design direction: layout, components, hierarchy, interaction
× theme: six switchable color-only palettes
```

`source-model.json` is immutable extraction. `report-model.json` plus `coverage-map.json` are canonical content. A confirmed executable candidate is canonical design. `presentation-plan.json` is a deterministic binding index. `artifact.html` is regenerable output.

## Run the workflow

1. Run `edit-html-report doctor`. Create with `edit-html-report create <source> --out <project>`, or dry-run legacy migration.
2. Read [references/content-pipeline.md](references/content-pipeline.md) completely. Inspect warnings, substantive units, facts, transformations, and coverage.
3. Explain data-first and evidence-first in the user's language. Ask only for mode unless selected already. Create one variant. Data-first defaults to `deep-data-blue`; evidence-first defaults to `warm-paper-terracotta`.
4. Read the selected mode reference completely. Then read [references/design-selection.md](references/design-selection.md), [references/huashu-design-package.md](references/huashu-design-package.md), [references/presentation-plan.md](references/presentation-plan.md), and [references/artifact-contract.md](references/artifact-contract.md) completely.
5. Explicitly invoke `$huashu-design` with every file in `design/huashu-input/`.
   - If the user supplied a reference website, screenshot, or design system, generate exactly one executable candidate and show hero, data/table, and master-detail/evidence scenes.
   - Without a reference, generate three executable candidates from identical real content and the same `previewThemeId`. Candidates may differ only in layout, components, hierarchy, interaction, typography, and rhythm.
   - Design direction is neither mode nor theme. Never present color swaps as design directions.
6. Import each candidate with `edit-html-report design candidate import <project> --variant <id> --from <dir>`. List/status the candidates. Wait for the user to choose one.
7. Confirm exactly that candidate with `edit-html-report design candidate confirm <project> --variant <id> --candidate <candidate-id>`. Confirmation promotes the same hashed payload to `design/package/`; never regenerate a weaker package after selection.
8. Run `render` and `validate`. Missing files, stale input, mismatched showcase/package hashes, unregistered IDs, literal colors, embedded report content, remote dependencies, or a package not applied to DOM/CSS/interactions must fail. Never use a fixed-template fallback.
9. Read [references/editor-publication.md](references/editor-publication.md) completely. Open the visible editor with `edit-html-report editor open <project> --variant <id>`. Pause for the user. The user may edit or switch among six themes, then must click “确认设计与配色”. Do not confirm through a hidden API or save on the user's behalf.
10. Only after visible confirmation may the user save an immutable version and publish it. Any theme change, text/data/asset edit, undo/redo, or rerender invalidates confirmation and requires another click.
11. Report project path, variant ID, mode, design direction/candidate/package/showcase hashes, theme, coverage, warnings, review state, saved version, publication record, and verification.

## Enforce boundaries

- Never invent, weaken, reverse, or silently omit facts, numbers, conditions, citations, or source relationships.
- A paragraph remains `displayIntent: narrative` even when it contains numbers. Only a complete explicit metric with label, value, unit, time, scope, and source becomes KPI. Charts consume compatible datasets, never ad-hoc正文数字。
- Preserve first-level research logic and relative content weight. Master-detail may fold repeated entities without deleting dimensions.
- Huashu owns design grammar; the compiler owns facts, source binding, coverage, stable editor IDs, safe local primitives, and offline runtime.
- Theme switching changes semantic colors only. It never changes design direction, DOM, typography, geometry, chart/data order, interaction, or citations.
- `research-cobalt` is hidden legacy. It changes to `precision-blueprint` only through explicit migration; historical HTML is never recolored.

## Route supporting work

- Palette questions: read [references/themes.md](references/themes.md).
- Legacy compatibility: read [references/migration.md](references/migration.md).
- Editor recovery/history/publication: read [references/editor-publication.md](references/editor-publication.md).

Do not skip real Huashu invocation, executable showcases, user candidate selection, hash validation, coverage validation, the visible editor, explicit review confirmation, saved-version checkpoint, or publication record.
