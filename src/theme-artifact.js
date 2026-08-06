import { getTheme } from "./themes.js";

const TOKEN_VARIABLES = {
  canvas: "--report-canvas",
  surface: "--report-surface",
  surfaceAlt: "--report-surface-alt",
  text: "--report-text",
  textMuted: "--report-text-muted",
  border: "--report-border",
  accent: "--report-accent",
  focus: "--report-focus",
  positive: "--report-positive",
  warning: "--report-warning",
  negative: "--report-negative",
  hover: "--report-hover",
  selection: "--report-selection",
  crosshair: "--report-crosshair",
  tableHeader: "--report-table-header",
  tableStripe: "--report-table-stripe",
  evidenceHighlight: "--report-evidence-highlight"
};

export function renderThemeCss(theme) {
  const declarations = Object.entries(TOKEN_VARIABLES)
    .filter(([token]) => theme.tokens[token])
    .map(([token, variable]) => variable + ":" + theme.tokens[token]);
  theme.chart.categorical.forEach((color, index) => {
    declarations.push("--report-chart-" + (index + 1) + ":" + color);
  });
  declarations.push("--report-chart-grid:" + theme.chart.grid);
  declarations.push("--report-chart-axis:" + theme.chart.axis);
  declarations.push(
    "--report-chart-tooltip-background:" + theme.chart.tooltipBackground
  );
  declarations.push("--report-chart-tooltip-text:" + theme.chart.tooltipText);
  return ":root{" + declarations.join(";") + "}";
}

export function compileThemeIntoArtifact(html, themeId) {
  const theme = getTheme(themeId);
  const style =
    "<style data-edit-html-report-theme>" + renderThemeCss(theme) + "</style>";
  let compiled = html;
  const existingStyle =
    /<style\b[^>]*\bdata-edit-html-report-theme(?:\s*=\s*["'][^"']*["'])?[^>]*>[\s\S]*?<\/style>/i;
  compiled = compiled.replace(existingStyle, "");
  if (/<\/head\s*>/i.test(compiled)) {
    compiled = compiled.replace(/<\/head\s*>/i, style + "</head>");
  } else if (/<head\b[^>]*>/i.test(compiled)) {
    compiled = compiled.replace(/<head\b[^>]*>/i, (tag) => tag + style);
  } else if (/<html\b[^>]*>/i.test(compiled)) {
    compiled = compiled.replace(
      /<html\b[^>]*>/i,
      (tag) => tag + "<head>" + style + "</head>"
    );
  } else {
    const doctype = compiled.match(/^\s*<!doctype html>/i)?.[0] ?? "<!doctype html>";
    const fragment = compiled.replace(/^\s*<!doctype html>/i, "");
    compiled =
      doctype +
      '<html><head>' +
      style +
      "</head><body>" +
      fragment +
      "</body></html>";
  }

  compiled = compiled.replace(/<html\b([^>]*)>/i, (tag, attributes) => {
    if (/\bdata-theme\s*=\s*["'][^"']*["']/i.test(attributes)) {
      return tag.replace(
        /\bdata-theme\s*=\s*["'][^"']*["']/i,
        'data-theme="' + theme.themeId + '"'
      );
    }
    return "<html" + attributes + ' data-theme="' + theme.themeId + '">';
  });
  return compiled;
}
