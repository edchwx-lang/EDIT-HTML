# Artifact Contract

Read this file before authoring or repairing a variant.

## Identity and mode

- Place the mutable draft at `variants/<variant-id>/artifact.html`.
- Declare the variant mode on the artifact with `data-report-mode="data-first"` or `data-report-mode="evidence-first"`.
- Assign unique `data-edit-id`, `data-block-id`, `data-image-id`, `data-kpi-id`, and `data-chart-id` values where applicable.
- Attach `data-source-ref` to every chart and editable element containing a number.
- Mark calculated values with `data-derived="true"` and a human-readable `data-formula`.

Use a source file name as the first segment of `data-source-ref`; append a page, slide, heading, paragraph, table, or cell locator when available.

## Charts

Embed every chart dataset as JSON in `<script type="application/json" data-chart-data-for="<chart-id>">`. Each chart needs a descendant visual element carrying `data-chart-mark` whose `style`, `fill`, or `stroke` uses `var(--report-chart-N)`. Do not hard-code chart colors.

For quantitatively sufficient data-first material, provide at least four unique KPI blocks and two unique charts, unless the artifact declares exactly `data-density-exception="insufficient-quantitative-evidence"`. Evidence-first has no chart minimum.

## Semantic theme variables

Use only these theme-owned variables for color:

- `--report-canvas`, `--report-surface`, `--report-surface-alt`;
- `--report-text`, `--report-text-muted`, `--report-border`;
- `--report-accent`, `--report-focus`;
- `--report-positive`, `--report-warning`, `--report-negative`;
- `--report-chart-1`, `--report-chart-2`, `--report-chart-3` and future numbered chart colors;
- `--report-chart-grid`, `--report-chart-axis`;
- `--report-chart-tooltip-background`, `--report-chart-tooltip-text`.

Theme switches must not change layout, typography, content, data, or chart type.

## Offline and responsive output

Inline CSS, JavaScript, fonts, icons, images, chart runtime, and chart data. Do not use remote runtime URLs, imports, analytics, trackers, or network fetches. Use semantic document flow and responsive gutters; avoid absolute positioning for report content.
