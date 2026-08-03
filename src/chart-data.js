const NON_COMPARABLE_UNITS = new Set(["年", "月", "日", "天"]);

export function visualizationForDataset(dataset) {
  if (dataset?.kind === "semantic") return semanticVisualization(dataset);
  if (dataset?.kind === "table") return tableVisualization(dataset);
  if (dataset?.kind === "numeric-text") return numericTextVisualization(dataset);
  return null;
}

function semanticVisualization(dataset) {
  const chartType = dataset.chartType ?? relationChartType(dataset.relation);
  if (!new Set(["line", "area", "bar", "scatter"]).has(chartType)) return null;
  if (chartType === "line" || chartType === "area") {
    if (!Array.isArray(dataset.x) || dataset.x.length < 2 || !dataset.series?.length) return null;
    const groups = dataset.x.map((label, index) => ({
      label: String(label),
      values: dataset.series.flatMap((series) => {
        const value = Number(series.values?.[index]);
        return Number.isFinite(value) ? [{ series: String(series.name), value, unit: String(series.unit ?? "") }] : [];
      })
    }));
    if (groups.some((group) => !group.values.length)) return null;
    return {
      chartType,
      relation: dataset.relation,
      groups,
      series: dataset.series,
      interaction: "nearest-x-group",
      caption: dataset.caption ?? "趋势"
    };
  }
  if (chartType === "bar") {
    const rows = dataset.rows ?? [];
    if (rows.length < 2) return null;
    return { chartType, relation: dataset.relation, rows, interaction: "hovered-bar", caption: dataset.caption ?? "对比" };
  }
  const points = dataset.points ?? [];
  if (points.length < 2) return null;
  return { chartType, relation: dataset.relation, points, interaction: "nearest-point", caption: dataset.caption ?? "分布" };
}

function relationChartType(relation) {
  if (relation === "trend") return "line";
  if (relation === "distribution") return "scatter";
  return "bar";
}

export function isVisualizationEligible(dataset) {
  return Boolean(visualizationForDataset(dataset));
}

function tableVisualization(dataset) {
  const rows = dataset.rows ?? [];
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((row) => row.length), 0);
  let selected = null;
  for (let column = 1; column < width; column += 1) {
    const parsed = rows.map((row) => parseNumericCell(row[column]));
    const count = parsed.filter(Boolean).length;
    if (count < 2 || (selected && selected.count >= count)) continue;
    selected = { column, parsed, count };
  }
  if (!selected) return null;
  const labelColumn = findLabelColumn(rows, selected.column);
  const chartRows = rows.flatMap((row, index) => {
    const parsed = selected.parsed[index];
    if (!parsed || parsed.value < 0) return [];
    const preferredLabel = row[labelColumn];
    const fallbackLabel = row.find((cell) => String(cell ?? "").trim() && !parseNumericCell(cell));
    return [{
      label: String(parseNumericCell(preferredLabel) ? (fallbackLabel ?? index + 1) : (preferredLabel ?? index + 1)),
      value: parsed.value,
      unit: parsed.unit,
      displayValue: parsed.raw
    }];
  });
  if (chartRows.length < 2) return null;
  const columnLabel = dataset.columns?.[selected.column] ?? "数值";
  const unit = dominantUnit(chartRows) || unitFromLabel(columnLabel);
  return { rows: chartRows, unit, caption: "数据对比 · " + columnLabel };
}

function numericTextVisualization(dataset) {
  const canonicalRows = (dataset.rows ?? []).map((row, index) => ({
    label: String(row[0] ?? `指标 ${index + 1}`),
    value: Number(row[1]),
    unit: String(row[2] ?? "").trim(),
    displayValue: formatDisplayValue(row[1], row[2])
  }));
  const legacyRows = (dataset.values ?? []).map((item, index) => ({
    label: String(item.contextLabel ?? item.label ?? `指标 ${index + 1}`),
    value: Number(item.value),
    unit: String(item.unit ?? "").trim(),
    displayValue: String(item.label ?? formatDisplayValue(item.value, item.unit))
  }));
  const rows = canonicalRows.length ? canonicalRows : legacyRows;
  const uniqueRows = [...new Map(rows.map((row) => [`${row.unit}\u0000${row.value}`, row])).values()];
  const groups = new Map();
  for (const row of uniqueRows) {
    if (!Number.isFinite(row.value) || row.value < 0 || !row.unit || NON_COMPARABLE_UNITS.has(row.unit)) continue;
    if (!groups.has(row.unit)) groups.set(row.unit, []);
    groups.get(row.unit).push(row);
  }
  const selected = [...groups.entries()]
    .filter(([, values]) => values.length >= 2)
    .sort((left, right) => right[1].length - left[1].length)[0];
  if (!selected) return null;
  const [unit, comparableRows] = selected;
  return {
    rows: comparableRows.slice(0, 12),
    unit,
    caption: `同单位指标对比（${unit}）`
  };
}

function findLabelColumn(rows, numericColumn) {
  for (let column = numericColumn - 1; column >= 0; column -= 1) {
    const textCount = rows.filter((row) => {
      const value = String(row[column] ?? "").trim();
      return value && !parseNumericCell(value);
    }).length;
    if (textCount >= Math.ceil(rows.length / 2)) return column;
  }
  return 0;
}

function parseNumericCell(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^([+-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*([^\d]*)$/u);
  if (!match) return null;
  const numeric = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(numeric)) return null;
  return { raw, value: numeric, unit: match[2].trim() };
}

function dominantUnit(rows) {
  const counts = new Map();
  for (const row of rows) if (row.unit) counts.set(row.unit, (counts.get(row.unit) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
}

function unitFromLabel(label) {
  return String(label).match(/(?:亿美元|亿元|万元|美元|GB\/s|Gbps|kW|MW|W|nm|μm|mm|cm|%|‰)/u)?.[0] ?? "";
}

function formatDisplayValue(value, unit) {
  return String(value ?? "") + String(unit ?? "");
}
