# V4.3 Content Pipeline

## Canonical order

`source -> immutable source-model -> source-closed editorial model + coverage -> Huashu strategy input -> selected complete strategy -> protocol compiler -> artifact -> unchanged visible review/version/publication`

`source-model.json` is immutable extraction. `report-model.json` is editorial expression plus internal facts/datasets. `coverage-map.json` proves where every substantive source unit went. `artifact.html` is regenerable and is never parsed back into canonical content.

## Source closed, expression free

All report facts, numbers, units, conditions, qualifications, relations, and citations must come from the supplied source. External material may guide visual design only.

Editorial production may:

- replace source headings with useful display/navigation titles;
- summarize without changing factual meaning or scope;
- split a long paragraph into finding, explanation, evidence, and qualification;
- merge related source units and regroup locally;
- convert compatible source material into lists, tables, metrics, or charts;
- fold repeated entities into master-detail interaction.

It may not add external claims, change numbers or qualifications, reverse relations, erase provenance, change first-level research logic, or distort relative content weight.

Every substantive editorial node requires source references and an allowed transformation. Every substantive source unit requires a covered mapping or a reasoned omission. Numeric fidelity is checked before design. User changes made later in the visible editor remain auditable overrides under the existing editor contract.

A number does not imply KPI. A KPI needs label, value, unit, time, scope, and source. A chart needs an explicit semantic dataset and relation; it never scrapes rendered prose.
