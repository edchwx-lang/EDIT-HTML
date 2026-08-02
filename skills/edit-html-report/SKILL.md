---
name: edit-html-report
description: Use when converting DOCX, PDF, PPTX, Markdown, HTML, or TXT research reports and project proposals into source-faithful, editable, versioned HTML reports; choosing data-first versus evidence-first; changing report palettes; reopening the local editor; restoring versions; or publishing traceable local/public artifacts.
---

# Edit HTML Report V4

Build reports from structured content, never by directly rewriting generated HTML. `source-model.json` is immutable extraction, `coverage-map.json` is the completeness lock, `report-model.json` is the editable fact source, `presentation-plan.json` is Huashu Design's layout-only output, and `artifact.html` is deterministic output.

## Run the complete workflow

1. Run `edit-html-report doctor`. Create a V4 project with `edit-html-report create <source> --out <project>`, or inspect migration first with `edit-html-report migrate <project> --dry-run`.
2. Read [references/content-pipeline.md](references/content-pipeline.md) completely. Inspect extraction warnings, every substantive source unit, and coverage before choosing a mode.
3. Present both structural choices in the user's system language, recommend one, explain why, and ask only for the mode unless the user already selected it:
   - 数据优先：原文结构 + 高密度可视化 + 分层交互；突出 data。
   - 证据优先：判断—证据—解释—边界—来源；突出 insight。
4. After confirmation, create exactly one variant with `edit-html-report variant create <project> --mode <data-first|evidence-first>`. Do not ask for a palette before this step.
5. Read the selected mode reference completely: [references/data-first.md](references/data-first.md) or [references/evidence-first.md](references/evidence-first.md). Read [references/presentation-plan.md](references/presentation-plan.md) and [references/artifact-contract.md](references/artifact-contract.md) completely.
6. Run `edit-html-report render <project> --variant <id>` and `edit-html-report validate <project> --variant <id>`. Fix the models or presentation plan; never hand-edit `artifact.html` as the source of truth.
7. Read [references/editor-publication.md](references/editor-publication.md) completely. Open the persistent local editor with `edit-html-report editor open <project> --variant <id>`. This step is mandatory before publication.
8. Let the user edit, switch among the six palettes, and save an immutable version. Do not close the editor after saving. Publish only the latest explicitly saved version; never publish a dirty draft.
9. Report the project path, variant ID, mode, palette, saved version ID, publication record/path or URL, coverage result, warnings, and verification results.

## Enforce the fact boundary

- Do not invent, supplement, weaken, or reverse facts, numbers, qualifications, citations, or source relationships.
- Preserve first-level section order. Allow only local claim-evidence grouping or like-object comparison.
- A substantive unit may be omitted only as duplicate/format-only content with an explicit coverage reason.
- Derived values require formula, inputs, and source IDs. User edits retain original value, source IDs, timestamp, and `user-override` provenance.
- Huashu Design may choose components, grids, hierarchy, responsive behavior, and interaction only. It may not rewrite content or coverage.

## Route supporting work

- Theme changes or palette questions: read [references/themes.md](references/themes.md).
- V3 projects, legacy HTML, or compatibility: read [references/migration.md](references/migration.md).
- Editor recovery, history, local/public publication, or dirty-state questions: read [references/editor-publication.md](references/editor-publication.md).

Do not skip the editor, saved-version checkpoint, coverage validation, or publication record.
