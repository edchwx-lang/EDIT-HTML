# Agent Handoff

Read this file after project creation and before variant creation.

## Inspect the extracted boundary

Use `analysis.json` as the complete material boundary. Inspect document names, media types, extracted text, warnings, numeric-token counts, and the deterministic mode recommendation.

## Maintain report-plan.json

Before variant creation, write:

- `schemaVersion: 1`;
- audience and supported decision;
- `confirmedMode`;
- `selectedThemeId: null` until the user selects a palette in the editor;
- ordered sections with one communicative purpose each;
- supported conclusions and exact source references;
- chart candidates, formulas, unresolved material, and exclusions.

After variant creation, add `variantId`. After the editor choice, write `selectedThemeId`. After saving, add `savedVersionId`. Do not record a default theme as the user's selection.

Every claim must point to a source file. Every derived number must include its formula and input references. The deterministic recommendation is evidence, not a mandate; present both modes in the user's system language and let an explicit user choice win.
