import { isVisualizationEligible } from "./chart-data.js";

export function validateModeArtifact({ html, mode, report }) {
  validateArtifactMode(html, mode);
  validateVisibleChartMarks(html);
  if (mode !== "data-first" || !report) return;
  const chartIds = new Set(attributeValues(html, "data-chart-id"));
  for (const dataset of report.datasets ?? []) {
    if (!isVisualizationEligible(dataset)) continue;
    if (!chartIds.has("chart-" + dataset.datasetId)) {
      throw new Error(`eligible dataset "${dataset.datasetId}" requires a visualization`);
    }
  }
  if (chartIds.size && (!/class=["'][^"']*chart-tooltip/i.test(html) || !/class=["'][^"']*chart-selection-band/i.test(html))) {
    throw new Error("data-first charts require an interactive tooltip and selection band");
  }
}

export function validateArtifactMode(html, mode) {
  const declaredMode = attributeValues(html, "data-report-mode")[0];
  if (declaredMode !== mode) {
    throw new Error(`artifact must declare data-report-mode="${mode}"`);
  }
}

export function validateVisibleChartMarks(html) {
  for (const chart of chartElements(html)) {
    const markTags =
      chart.contents.match(/<[a-z][^>]*\bdata-chart-mark(?:\s*=\s*["'][^"']*["'])?[^>]*>/gi) ??
      [];
    const hasThemedMark = markTags.some((tag) =>
      /\b(?:style|fill|stroke)\s*=\s*["'][^"']*var\(\s*--report-chart-\d+\s*\)[^"']*["']/i.test(
        tag
      )
    );
    if (!hasThemedMark) {
      throw new Error(
        `chart "${chart.id}" requires a data-chart-mark using var(--report-chart-N)`
      );
    }
  }
}

function attributeValues(html, attribute) {
  const values = [];
  const pattern = new RegExp(
    "\\b" + attribute + "\\s*=\\s*[\"']([^\"']+)[\"']",
    "gi"
  );
  for (const match of html.matchAll(pattern)) values.push(match[1]);
  return values;
}

function chartElements(html) {
  const charts = [];
  const openingPattern =
    /<([a-z][\w-]*)\b([^>]*\bdata-chart-id\s*=\s*["']([^"']+)["'][^>]*)>/gi;
  for (const match of html.matchAll(openingPattern)) {
    const [openingTag, tagName, , id] = match;
    const contentStart = match.index + openingTag.length;
    const closingPattern = new RegExp("<\\/" + escapeRegExp(tagName) + "\\s*>", "i");
    const closingMatch = closingPattern.exec(html.slice(contentStart));
    charts.push({
      id,
      contents: closingMatch
        ? html.slice(contentStart, contentStart + closingMatch.index)
        : ""
    });
  }
  return charts;
}

function escapeRegExp(value) {
  return value.replace(/[\^$.*+?()[\]{}|]/g, "\\$&");
}
