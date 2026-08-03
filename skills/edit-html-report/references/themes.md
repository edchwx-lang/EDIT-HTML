# Theme System V2

Choose mode, then design direction, then optionally switch palette. A palette changes semantic colors only.

| Appearance | ID | Name |
|---|---|---|
| light | `warm-paper-terracotta` | 暖纸赤陶 |
| light | `precision-blueprint` | 精密蓝图 |
| light | `sandstone-archive` | 砂岩档案 |
| dark | `deep-data-blue` | 深海数据蓝 |
| dark | `institutional-navy-gold` | 海军蓝金 |
| dark | `signal-orange` | 黑场信号橙 |

Data-first defaults to `deep-data-blue`; evidence-first defaults to `warm-paper-terracotta`.

`precision-blueprint` fixed tokens: canvas `#F2F5F7`, surface `#FFFFFF`, surfaceAlt `#D9EAF4`, text `#10283F`, textMuted `#526678`, border `#B8C6D1`, accent `#075F9B`, focus/crosshair `#D75B32`, positive `#267A5E`, warning `#8A5A00`, negative `#B33A35`, tableHeader `#073B61`, tableStripe `#F2F5F7`, evidenceHighlight `#F7E4DB`.

Its eight series are `#075F9B`, `#D75B32`, `#1F7A74`, `#7C5AA6`, `#A46812`, `#3E6F8E`, `#8A4C6F`, `#527A3B`.

Keep `research-cobalt`, `linear-indigo`, `swiss-monochrome`, and `ink-teal` readable as hidden legacy themes. New selectors never show them. Migrate explicitly: `research-cobalt -> precision-blueprint`, `linear-indigo -> deep-data-blue`, `swiss-monochrome -> sandstone-archive`, `ink-teal -> institutional-navy-gold`. Never rewrite historical compiled CSS.

Theme switching must not change mode, content, order, IDs, DOM, layout geometry, typography, chart type/data/order/scale, interaction, table structure, or citations. It invalidates editor review confirmation.
