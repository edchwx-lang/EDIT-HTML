# V4 Content Pipeline

## Canonical order

`source document → source-model → coverage-map → confirmed mode → report-model → presentation-plan → artifact.html → editor → saved version → publication`

The models have distinct authority:

- `source-model.json`: immutable source units, original order, stable source IDs, extracted assets, and warnings.
- `coverage-map.json`: every source unit's report destination or explicit omission reason.
- `report-model.json`: the only editable source for prose, tables, chart data, images, citations, and overrides.
- `presentation-plan.json`: components, binding, layout, interaction, and responsive policy only.
- `artifact.html`: regenerable offline delivery output. Never parse it back into V4 content.

## Extraction and order

Preserve DOCX paragraphs/headings/lists/tables/images/captions/links/footnotes, PPTX slide order and notes, PDF page text and image references, and Markdown/HTML/TXT block order. Infer an unstyled heading only from an explicit structural pattern; otherwise issue a warning instead of guessing.

Keep first-level sections in source order. Within a section, regroup only to connect a claim with its evidence or compare equivalent objects. Keep source wording, qualifications, units, and citation context. Controlled compression may remove repetition but may not reduce the document's dominant subject to a summary.

## Coverage lock

Before rendering and again before finalizing:

- map every non-duplicate claim, number, condition, table, figure, footnote, citation, and material to one or more report node IDs;
- block validation when a substantive entry remains `pending` or a preserved entry has no report source reference;
- record an explicit reason for `omitted` entries;
- keep hidden tab/accordion content in coverage; hidden by default does not mean omitted;
- store formula, inputs, and source IDs for every derived metric.

For reports with at least four like objects and at least three shared dimensions, group them into master-detail interaction without dropping object-specific content.
