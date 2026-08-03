# V4.2 Content Pipeline

## Canonical order

`source -> source-model -> confirmed mode -> report-model + coverage-map -> Huashu input -> executable candidates -> selected package -> presentation-plan -> artifact -> visible review -> version/publication`

Authority:

- `source-model.json`: immutable units, order, stable source IDs, assets, chart caches, page/slide locations, and warnings.
- `report-model.json`: editable nodes, internal facts, datasets, source references, and user overrides.
- `coverage-map.json`: each source unit's fact IDs, report nodes, transformation, coverage status, or omission reason.
- `design/huashu-input/`: real-content design brief, slices, model snapshot, contracts, assets, and forbidden mutations.
- `design/candidates/<candidate-id>/`: executable content-free candidate plus desktop/mobile showcases.
- `design/package/`: exact promoted payload of the user-selected candidate.
- `presentation-plan.json`: deterministic compiler index derived from report nodes and the design package.
- `artifact.html`: regenerable offline output. Never parse it back into canonical content.

Do not create `fact-model.json`, `transformation-ledger.json`, `editorial-model.json`, or `visualization-model.json` as project facts. Temporary read-only build indexes may live under `.build/`.

## Extraction and compilation

Preserve DOCX headings, paragraphs, lists, tables, images, captions, links, footnotes, and chart caches; PPTX slide order, text, tables, charts, images, and notes; PDF pages, text blocks, table clues, and page images; and Markdown/HTML/TXT block order. Warn instead of guessing uncertain structure.

Internally identify only important claims, metrics, conditions, definitions, relations, entities, and evidence. Keep facts inside `report-model.json`. Preserve first-level research logic and relative content weight; regroup locally for claim-evidence flow or like-object comparison.

Every report node has `displayIntent`: `narrative`, `metric`, `chart-support`, `evidence`, or `warning`. Numbers do not imply KPI. A KPI requires label, value, unit, time, scope, and source. Charts read only compatible datasets; they never scrape numbers from rendered prose.

## Coverage lock

Before design, rendering, and finalization:

- map each substantive source unit to fact IDs and report node IDs;
- record `preserve`, `merge`, `split`, `summarize`, `visualize`, `fold`, or `appendix`;
- block pending substantive units, source-free preserved entries, and reason-free omissions;
- count tabbed/folded content as covered without deleting it;
- retain formula, inputs, unit, scope, and source IDs for derived metrics.

For at least four like objects sharing at least three dimensions, use master-detail interaction without dropping object-specific content.
