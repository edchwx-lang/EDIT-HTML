# Theme System V2

Choose mode before palette. A palette changes color tokens only.

Visible palettes:

| Appearance | ID | Name |
|---|---|---|
| light | `warm-paper-terracotta` | 暖纸赤陶 |
| light | `research-cobalt` | 研究钴蓝 |
| light | `sandstone-archive` | 砂岩档案 |
| dark | `linear-indigo` | 线性靛蓝 |
| dark | `institutional-navy-gold` | 海军蓝金 |
| dark | `signal-orange` | 黑场信号橙 |

Data-first defaults to `linear-indigo`; evidence-first defaults to `warm-paper-terracotta`. Defaults initialize the editor and are not a user choice.

Every theme provides exactly eight chart series plus hover, selection, crosshair, tooltip, table header/stripe, evidence highlight, focus, status, surface, text, and border tokens. For series nine and above, reuse colors with line style, point shape, texture, and direct labels.

Hidden compatibility IDs remain readable but never appear in new selectors. Migrate explicitly: `swiss-monochrome → sandstone-archive`, `ink-teal → institutional-navy-gold`. Never rewrite CSS already saved in historical versions.

Theme switching must not change mode, order, content, IDs, layout geometry, typography, chart type/data/order/scale, interaction, table structure, or citations. Verify WCAG AA body contrast, visible focus, legend separation, color-vision simulation, and Chinese labels.
