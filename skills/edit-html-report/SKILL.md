---
name: edit-html-report
description: Use when converting DOCX, PDF, PPTX, Markdown, HTML, or TXT into a source-closed, Huashu-designed, editable and versioned offline HTML report; gathering content priorities; comparing executable design samples; auditing provenance; opening the visible editor; restoring versions; or publishing artifacts.
---

# Edit HTML Report V5.1

V5.1 keeps one production boundary:

```text
Edit HTML extracts facts and assets
-> Huashu understands the material and conducts a content-only interview
-> Huashu owns content strategy and the complete website
-> Edit HTML audits and instruments without redesigning
-> artifact.html
-> the frozen editor/version/publication system
```

Huashu owns everything between the Source Pack and finished website. Never create an editorial report model, display mode, page order, component plan, chart plan, primitive tree, layout grammar, or fixed-renderer input before invoking Huashu.

## Run the workflow

1. Run `edit-html-report doctor`, `edit-html-report create <source> --out <project>`, and `edit-html-report variant create <project>`.
2. Read [references/content-pipeline.md](references/content-pipeline.md) completely. Inspect every Source Pack file and extraction warning. Edit HTML may extract and normalize facts; it must not recommend presentation.
3. Invoke `$huashu-design`. Huashu reads and summarizes the Source Pack, then conducts at most three content-only questions:
   - `purpose` is always required: purpose, occasion, and target reader;
   - `contentWeight` is always required: which source content deserves greater depth;
   - `contentClarification` is optional and may be asked only when a concrete ambiguity, conflict, omission risk, time range, terminology, or comparative focus in the Source Pack requires resolution.
   Reuse answers already present in the request. Never ask about structure, page order, layout, components, charts, interaction, theme, color, typography, visual style, or what the audience should remember. If no material-driven clarification is necessary, stop after two questions.
4. Save the actual question, original answer, origin, time, and any clarification source references in interview schema v2. Run `interview import`, then verify `interview status`. “You decide” is recorded as `user-delegated`; Huashu makes a source-driven content judgment, never a fixed-template decision.
5. Read [references/design-selection.md](references/design-selection.md), [references/huashu-design-package.md](references/huashu-design-package.md), and [references/artifact-contract.md](references/artifact-contract.md) completely. Run `design prepare` and give every prepared file, including `content-brief.json`, to Huashu.
6. Without an initial visual reference, Huashu produces three executable samples. They share one content plan and use `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive` for comparison, but must differ in narrative architecture, DOM, visualization, and core interaction. With an initial visual reference, Huashu produces one executable sample using the closest existing theme.
7. Every sample is a content-complete vertical slice using real content: an overall situation, a representative focus entity, and all material facets needed to prove depth. Import with `design candidate import`, show the actual desktop and mobile screenshots, wait for the user's choice, and confirm only that candidate.
8. Huashu expands the selected candidate itself into the complete website. “Emphasize” controls depth, not presence: retain the overall situation and expand every declared focus entity and facet. Main narrative may be compressed, but substantive detail remains genuinely usable in main/detail views. Do not expose a bulk raw-source appendix unless the user explicitly requests it.
9. Import with `design final import`. Fact, coverage, or safety failures are diagnostics returned to Huashu; Edit HTML must not rewrite wording, DOM, CSS, charts, or interactions.
10. Run `render` and `validate`. The Instrumenter only inlines local resources, injects stable edit/source attributes, adds theme/editor compatibility metadata, and emits `artifact.html`.
11. Read [references/editor-publication.md](references/editor-publication.md) completely. Run `edit-html-report editor open <project> --variant <id>` and pause. The command returns a `handoff` containing an authenticated `editorUrl` and absolute `launcherPath`.
12. In the conversation output, always provide a directly clickable editor URL and a clickable local launcher path. Never present `artifact.html` as the only result. The user must inspect the visible editor and click “确认设计与配色”; never confirm through a hidden API or on the user's behalf.
13. Only after visible confirmation may the user save an immutable version or publish. Editing, theme changes, undo/redo, or rerendering invalidates confirmation.

## Hard boundaries

- Content is source-closed and expression-free: titles, grouping, compression, hierarchy, and explanation may change; facts, values, units, times, scopes, qualifications, and relationships may not.
- External material guides visual design only and never adds report facts.
- `content-brief.json` describes content purpose and emphasis, never presentation.
- `content-bindings.json` proves traceability and coverage only; it never tells Huashu how to design.
- Every visible number and substantive claim binds to Source Pack facts and source locations.
- Huashu owns the actual DOM, CSS, local JavaScript, chart behavior, interaction semantics, responsiveness, and visual language.
- Audit failures stop output and return diagnostics; audit must not modify the site.
- Instrumenter preserves Huashu's DOM hierarchy, classes, geometry, typography, charts, and interactions.
- Everything after `artifact.html`—editing, undo/redo, themes, confirmation, versions, restore, and publishing—retains V4.3 behavior.

## Supporting references

- Theme system: [references/themes.md](references/themes.md)
- V4.x compatibility: [references/migration.md](references/migration.md)
- Editor/version/publication: [references/editor-publication.md](references/editor-publication.md)

Report the project path, variant ID, Source Pack warnings, interview status/hash, candidate IDs and hashes, selected parent hash, final-site hash, audit result, artifact validation, current theme, editor review state, authenticated editor URL, launcher path, saved version, publication, and unresolved warnings.
