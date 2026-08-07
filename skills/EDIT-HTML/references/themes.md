# V5 Theme System

Huashu first designs the executable site; theme selection changes semantic colors only.

| Appearance | ID | Name |
|---|---|---|
| light | `warm-paper-terracotta` | 暖纸赤陶 |
| light | `precision-blueprint` | 精密蓝图 |
| light | `sandstone-archive` | 砂岩档案 |
| dark | `deep-data-blue` | 深海数据蓝 |
| dark | `institutional-navy-gold` | 海军蓝金 |
| dark | `signal-orange` | 黑场信号橙 |

When there is no initial visual reference, the three candidate previews use `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive` by position. This reduces visual fatigue and must not be used to disguise three copies of the same design. After selection, all six themes remain available in the existing editor.

`precision-blueprint` fixed tokens: canvas `#F2F5F7`, surface `#FFFFFF`, surfaceAlt `#D9EAF4`, text `#10283F`, textMuted `#526678`, border `#B8C6D1`, accent `#075F9B`, focus/crosshair `#D75B32`, positive `#267A5E`, warning `#8A5A00`, negative `#B33A35`, tableHeader `#073B61`, tableStripe `#F2F5F7`, evidenceHighlight `#F7E4DB`.

Its eight series are `#075F9B`, `#D75B32`, `#1F7A74`, `#7C5AA6`, `#A46812`, `#3E6F8E`, `#8A4C6F`, and `#527A3B`.

Keep `research-cobalt`, `linear-indigo`, `swiss-monochrome`, and `ink-teal` readable as hidden legacy themes. New selectors never show them. Apply legacy mappings only through explicit historical migration; never rewrite saved compiled CSS.

Theme switching must not change content, order, IDs, DOM, layout geometry, typography, chart type/data/order/scale, interaction, table structure, or citations. It invalidates editor review confirmation.
