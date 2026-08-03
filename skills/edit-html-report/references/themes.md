# Theme System V2

Choose mode before palette. A palette changes semantic colors only.

| Appearance | ID | Name |
|---|---|---|
| light | `warm-paper-terracotta` | 暖纸赤陶 |
| light | `research-cobalt` | 研究钴蓝 |
| light | `sandstone-archive` | 砂岩档案 |
| dark | `deep-data-blue` | 深海数据蓝 |
| dark | `institutional-navy-gold` | 海军蓝金 |
| dark | `signal-orange` | 黑场信号橙 |

Data-first defaults to `deep-data-blue`; evidence-first defaults to `warm-paper-terracotta`.

Each visible theme provides exactly eight series plus hover, selection, crosshair, tooltip, table header/stripe, evidence highlight, focus, status, surface, text, and border tokens. For series nine and above, reuse colors with line style, point shape, texture, and direct labels.

Keep `linear-indigo`, `swiss-monochrome`, and `ink-teal` readable as hidden compatibility themes. New selectors never show them. Migrate explicitly: `linear-indigo -> deep-data-blue`, `swiss-monochrome -> sandstone-archive`, `ink-teal -> institutional-navy-gold`. Never rewrite historical compiled CSS.

Theme switching must not change mode, content, order, IDs, layout geometry, typography, chart type/data/order/scale, interaction, table structure, or citations. Validate WCAG AA text, focus, legend separation, color-vision simulation, and Chinese labels.
