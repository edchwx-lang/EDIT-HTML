# Edit HTML Report V4.3 Design

## Goal

Replace the V4.2 `mode × direction` split with a source-closed editorial layer and one complete, material-driven design-strategy layer. Everything after `artifact.html` remains unchanged.

## Invariants

- Source facts, numbers, units, scope, qualifications, relations, and provenance are immutable.
- Editorial expression may summarize, retitle, split, merge, regroup, and convert compatible material into lists, tables, metrics, or charts.
- Editorial output may not introduce externally sourced report content.
- Every transformed module keeps source references and coverage records.
- A design strategy owns information priority, composition, component tree, layout, visualization, interaction, responsive behavior, and typographic rhythm.
- Theme owns semantic color only.
- The compiler injects stable edit/source IDs and the offline/editor protocol; it does not redesign or silently fall back.
- The existing visible-editor review, theme switching, draft history, finalize, version, restore, and publish behavior is frozen.

## Pipeline

```text
source
  -> immutable source-model
  -> source-closed editorial model + coverage validation
  -> Huashu strategy input
  -> 3 complete strategies when intent is vague, otherwise 1 strategy / 3 scenes
  -> select strategy (composition + design atomically)
  -> deterministic protocol compiler
  -> artifact.html
  -> unchanged visible editor / confirmation / versions / publish
```

## Editorial contract

The canonical report model records:

- `sourcePolicy: "closed"` and `expressionPolicy: "free"`;
- display titles that may differ from source headings;
- modules with a semantic role and transformation (`preserve`, `summarize`, `merge`, `split`, `visualize`, `fold`, `appendix`);
- source references for every substantive module;
- immutable fact records and compatible datasets;
- coverage for every substantive source unit.

Validation rejects source-free modules, changed numeric tokens, missing qualification/source mappings, and unreasoned omissions. Source headings are evidence, not mandatory display titles.

## Strategy contract

Candidate schema v3 promotes content composition and design together. A candidate contains its content-composition plan, component tree, chart/table specifications, interaction and responsive grammar, package CSS, and compiled showcases. Its manifest binds all payloads and Huashu provenance by SHA-256.

When design intent is vague, three Huashu runs receive the same editorial material but independent briefs. They must differ structurally, not merely by color. Preview themes are fixed by position to the three light palettes: Precision Blueprint, Warm Paper Terracotta, and Sandstone Archive. The selected strategy remains switchable across all six themes after compilation.

## Visualization interaction

- Line/area charts select the nearest X group and show only that group in a narrow band/crosshair tooltip.
- Bar charts select only the hovered bar.
- Scatter plots select the nearest point.
- Chart type and interaction come from explicit semantic dataset/spec fields, never by scraping rendered prose.

## Compatibility

- `schemaVersion` stays 4 for the editor/storage contract.
- `packageVersion` and `pipelineVersion` become 4.3.0.
- `mode` may be read from legacy projects but is derived/read-only in V4.3 and is not a public design choice.
- V4.2 executable candidates remain auditable but require regeneration for V4.3 rendering.

