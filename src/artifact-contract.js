import { getModeProfile } from "./modes/index.js";

const DENSITY_EXCEPTION = "insufficient-quantitative-evidence";

export function validateModeArtifact({ html, mode, analysis }) {
  const profile = getModeProfile(mode);
  const declaredMode = attributeValues(html, "data-report-mode")[0];
  if (declaredMode !== mode) {
    throw new Error(`artifact must declare data-report-mode="${mode}"`);
  }

  validateVisibleChartMarks(html);
  if (mode !== "data-first" || !hasSufficientQuantitativeEvidence(analysis)) {
    return;
  }
  if (attributeValues(html, "data-density-exception").includes(DENSITY_EXCEPTION)) {
    return;
  }

  const kpiCount = new Set(attributeValues(html, "data-kpi-id")).size;
  if (kpiCount < profile.minKpiCount) {
    throw new Error(
      `data-first requires at least ${profile.minKpiCount} KPI blocks; found ${kpiCount}`
    );
  }
  const chartCount = new Set(attributeValues(html, "data-chart-id")).size;
  if (chartCount < profile.minChartCount) {
    throw new Error(
      `data-first requires at least ${profile.minChartCount} charts; found ${chartCount}`
    );
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

function hasSufficientQuantitativeEvidence(analysis) {
  const recommendation = analysis?.recommendation ?? {};
  const count = Number(recommendation.numericTokenCount ?? 0);
  const threshold = Number(recommendation.quantitativeThreshold ?? 8);
  return count >= threshold;
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
