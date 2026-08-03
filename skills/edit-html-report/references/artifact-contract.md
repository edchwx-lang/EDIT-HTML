# Deterministic Artifact Contract

- `artifact.html` declares `data-report-mode` and is generated from V4.1.1 canonical models plus a confirmed Huashu design package.
- Stable report nodes use `data-node-id`; editable text uses `data-edit-id`; movable regions use `data-block-id`; replaceable images use `data-image-id`; charts use `data-chart-id`.
- Every editable numeric value and chart carries a source reference. Derived values carry a readable formula.
- Chart data is embedded as `application/json`; visible chart marks use `var(--report-chart-1)` through `var(--report-chart-8)`.
- Runtime CSS, JavaScript, images, fonts, chart data, and interactions are local/inline. Published HTML contains no editor toolbar, token, credential, analytics, remote runtime import, or network fetch.
- Responsive layout uses semantic flow, desktop/mobile gutters, keyboard focus, readable Chinese type, and no absolute positioning for report content.
- Theme compilation changes semantic color tokens and `data-theme` only.

Validate with `edit-html-report validate <project> --variant <id>` before saving a version. Never repair an artifact directly; repair the report model, coverage map, Huashu package, deterministic compiler, or theme.
