# Artifact Contract

Read this file before authoring or repairing a variant.

## Required files

Place artifact.html in variants/<variant-id>/. The CLI derives the immutable version snapshot during finalize.

## Required attributes

- Assign a unique data-edit-id to every editable text node.
- Assign a unique data-block-id to every section that may be reordered, copied, or deleted.
- Assign a unique data-image-id to every replaceable image.
- Assign a unique data-chart-id to every editable chart.
- Assign data-source-ref to every chart and every editable element containing a number.

Use source file names as the first segment of data-source-ref. Add a page, slide, heading, paragraph, table, or cell locator when available.

## Offline artifact

Inline CSS, JavaScript, fonts, icons, images, and chart runtime. Do not use remote src, srcset, poster, CSS url(), module imports, analytics, trackers, or network fetches. Normal citation links may remain clickable only when they do not supply runtime data or assets.

## Layout

- Keep evidence-first content at approximately 1240px maximum width and body lines at 68–80 characters.
- Keep data-first content at approximately 1560px maximum width on a responsive 12-column grid.
- Keep stable side whitespace and useful mobile stacking.
- Use semantic document flow. Avoid absolute positioning for report content.

## Charts

Embed chart data as JSON in the artifact. Keep labels, units, source references, and derived formulas with the chart. Prefer tables when the available evidence does not justify a chart.

