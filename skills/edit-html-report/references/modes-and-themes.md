# Modes and Themes

## Structural modes

One source project produces one user-confirmed structural mode per variant.

| Mode | 中文 | Use | Structure |
|---|---|---|---|
| `data-first` | 数据优先 | Quantitative evidence is sufficient for comparison and visual encoding | High-density KPIs, charts, tables, and structured comparisons |
| `evidence-first` | 证据优先 | Narrative, policy, qualitative, or sparse quantitative material | Written explanation and argument first; original source charts, quotations, and footnotes may remain |

For a Chinese user, show both Chinese options and their characteristics together. Recommend `data-first` when `analysis.json` reaches the quantitative threshold; otherwise recommend `evidence-first`. Ask only for the structural choice. Never combine the mode with light/dark.

## Palette registry

Both modes can use every palette. The editor is the palette-selection checkpoint.

| Huashu | Theme ID | 中文 | Appearance |
|---|---|---|---|
| L01 | `warm-paper-terracotta` | 暖纸赤陶 | light |
| L02 | `research-cobalt` | 研究钴蓝 | light |
| L06 | `swiss-monochrome` | 瑞士黑白 | light |
| D01 | `ink-teal` | 墨海荧青 | dark |
| D02 | `linear-indigo` | 线性靛蓝 | dark |
| D04 | `signal-orange` | 黑场信号橙 | dark |

Defaults are `ink-teal` for data-first and `warm-paper-terracotta` for evidence-first. Defaults initialize preview state; they are not additional structural modes and are not a substitute for editor selection.

## Color-only invariant

Changing themes may change only semantic color tokens and chart color tokens. Keep the following unchanged:

- mode, section order, DOM hierarchy, stable IDs, layout geometry, widths, spacing, and typography;
- all prose, numbers, units, claims, citations, source references, and formulas;
- chart types, data, series order, scales, labels, legends, and interactions;
- table rows, columns, ordering, and merges.

The raw draft `artifact.html` remains structure-equivalent. Theme compilation may change the saved HTML's `data-theme` and injected theme CSS only.

## Density and width

- Data-first uses responsive gutters and a maximum content width of 1440px. When quantitative evidence meets the threshold, include at least four `data-kpi-id` blocks and two charts. If this is impossible, declare exactly `data-density-exception="insufficient-quantitative-evidence"`.
- Evidence-first uses responsive gutters and a 68–78ch prose measure. It has no minimum KPI or chart count; preserve useful original charts when supplied.
