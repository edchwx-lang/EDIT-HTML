---
name: edit-html-report
description: Use when converting DOCX, PDF, PPTX, Markdown, HTML, or TXT into a source-closed, Huashu-designed, editable and versioned offline HTML report; gathering content priorities; comparing executable design samples; auditing provenance; opening the visible editor; restoring versions; or publishing artifacts.
---

# Edit HTML Report V5.0

V5 has one production boundary:

```text
Edit HTML extracts facts and assets
-> Huashu interviews, restructures content, and designs the site
-> Edit HTML audits and instruments without redesigning
-> artifact.html
-> the existing editor/version/publication system
```

Huashu owns everything between extracted source material and the finished website. Do not create an editorial report model, component plan, layout grammar, primitive tree, chart plan, or fixed-renderer input before invoking Huashu.

## Run the workflow

1. Run `edit-html-report doctor`, then `edit-html-report create <source> --out <project>` and `edit-html-report variant create <project>`.
2. Read [references/content-pipeline.md](references/content-pipeline.md) completely. Inspect `source-pack/manifest.json`, `readable-source.md`, `fact-ledger.json`, `source-map.json`, `tables-and-datasets.json`, `asset-contact-sheet.html`, all assets, and `extraction-warnings.json`. Edit HTML may extract and normalize facts; it must not recommend page order, KPIs, charts, components, or layout.
3. Invoke `$huashu-design` to understand the Source Pack and conduct exactly three content interviews:
   - `purpose`: the website purpose and target reader;
   - `contentWeight`: which parts deserve the most attention after Huashu summarizes the material;
   - `structurePreference`: preferred reading order and interaction experience.
   Reuse answers already present in the initial request. Otherwise ask each item. If the user says “你决定”, record `user-delegated`; do not substitute a preset.
4. Save the actual question, original answer, origin, and time in `interview.json`, then run `edit-html-report interview import <project> --variant <id> --from <interview.json>`. Verify with `interview status`. Do not proceed until every item is answered or delegated.
5. Read [references/design-selection.md](references/design-selection.md), [references/huashu-design-package.md](references/huashu-design-package.md), and [references/artifact-contract.md](references/artifact-contract.md) completely. Run `design prepare`; give every prepared file to `$huashu-design`.
6. Let Huashu decide content hierarchy, rewritten titles, summary depth, sequence, navigation, DOM, components, charts, tables, interactions, responsiveness, typography, and visual language:
   - without an initial visual reference, create three executable samples using real content and the three comparison palettes specified in [references/themes.md](references/themes.md);
   - with an initial website, screenshot, or design-system reference, create one executable sample using the closest existing theme;
   - each sample must include real HTML/CSS/JS, desktop and mobile screenshots rendered from that HTML, content bindings, and a rationale;
   - three samples must represent genuinely different narratives and interaction architectures, not restyling of one DOM.
7. Import each sample with `design candidate import`, list them, show both screenshots to the user, and wait for a choice. Run `design candidate confirm` only for the selected candidate.
8. Ask Huashu to expand the selected candidate itself into the complete website. The final site must preserve the candidate lineage, use only Source Pack facts, retain omitted detail in accessible detail/appendix views unless the user explicitly authorizes deletion, and use existing semantic theme variables for visible colors.
9. Import the complete site with `design final import`. A failed fact or safety audit is a diagnostic for Huashu: return the original site to Huashu for correction. The audit must not modify wording, DOM, CSS, charts, or interactions.
10. Run `render`. In V5 this invokes the Instrumenter, which only inlines local resources, injects stable edit/source attributes, adds existing theme/editor compatibility metadata, and emits `artifact.html`. It must not regenerate content or design. Run `validate` afterward.
11. Read [references/editor-publication.md](references/editor-publication.md) completely. Open the visible editor with `edit-html-report editor open <project> --variant <id>` and pause. The user must inspect the result and click “确认设计与配色”. Never confirm through a hidden API or on the user's behalf.
12. Only after visible confirmation may the user save an immutable version or publish. Edits, theme changes, undo/redo, and a new render invalidate confirmation.

## Hard boundaries

- Content is source-closed and expression-free: titles, grouping, compression, hierarchy, and explanation may change; facts, values, units, times, scopes, qualifications, and relationships may not.
- External material may guide visual design only. It cannot add report facts.
- `content-bindings.json` proves traceability only. It never tells Huashu how to design.
- Every visible number and substantive claim must bind to Source Pack facts and source locations.
- Main narrative may be highly compressed. Unselected substantive material remains reachable in detail or appendix unless the user explicitly authorizes omission.
- Huashu owns the actual DOM, CSS, local JavaScript, chart behavior, and interaction semantics. Edit HTML has no production Renderer in V5.
- Audit failures stop output and return diagnostics; audit must not modify the site.
- Instrumenter may add attributes and inline resources, but must preserve Huashu's DOM hierarchy, classes, geometry, typography, charts, and interactions.
- Everything after `artifact.html`—editing, undo/redo, themes, confirmation, versions, restore, and publishing—retains the existing behavior.

## Supporting references

- Theme system: [references/themes.md](references/themes.md)
- V4.x compatibility: [references/migration.md](references/migration.md)
- Editor/version/publication: [references/editor-publication.md](references/editor-publication.md)

Report the project path, variant ID, Source Pack warnings, interview status/hash, candidate IDs and hashes, selected parent hash, final-site hash, audit result, artifact validation, current theme, editor review state, saved version, publication, and unresolved warnings.
