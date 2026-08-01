# Agent Handoff

Read this file after project creation and before variant creation.

## Inputs

Use analysis.json as the extracted-material boundary. Inspect:

- document names and media types;
- extracted text and extraction warnings;
- numeric-token, table, image, and heading counts;
- the deterministic mode recommendation.

## Produce report-plan.json

Write:

- schemaVersion: 1;
- audience and decision the report supports;
- confirmed mode and theme;
- ordered sections with one communicative purpose each;
- supported conclusions;
- chart candidates with exact source references;
- excluded or unresolved material;
- variantId after variant creation.

Every planned claim must point to a source file. Every derived number must include a formula and all input references. Do not turn the deterministic recommendation into a mandate; explain the tradeoff and let an explicit user choice win.

