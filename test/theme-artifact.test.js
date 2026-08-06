import assert from "node:assert/strict";
import test from "node:test";

import {
  compileThemeIntoArtifact,
  renderThemeCss
} from "../src/theme-artifact.js";
import { getTheme } from "../src/themes.js";

test("renderThemeCss exposes stable semantic and chart variables", () => {
  const css = renderThemeCss(getTheme("signal-orange"));
  assert.match(css, /--report-canvas:#000000/);
  assert.match(css, /--report-accent:#FF6900/);
  assert.match(css, /--report-chart-1:#FF6900/);
  assert.match(css, /--report-chart-3:#3EA6FF/);
  assert.match(css, /--report-chart-8:#A8B0BC/);
  assert.match(css, /--report-selection:/);
  assert.match(css, /--report-table-header:/);
});

test("compileThemeIntoArtifact injects variables without changing body", () => {
  const source =
    '<!doctype html><html><head><title>Report</title></head><body><main id="report">Evidence</main></body></html>';
  const compiled = compileThemeIntoArtifact(source, "signal-orange");

  assert.match(compiled, /<html data-theme="signal-orange">/);
  assert.match(compiled, /<style data-edit-html-report-theme>/);
  assert.match(compiled, /--report-canvas:#000000/);
  assert.equal(bodyHtml(compiled), bodyHtml(source));
});

test("compileThemeIntoArtifact replaces an old compiled theme idempotently", () => {
  const source =
    '<!doctype html><html><body><main id="report">Evidence</main></body></html>';
  const first = compileThemeIntoArtifact(source, "ink-teal");
  const second = compileThemeIntoArtifact(first, "research-cobalt");

  assert.equal((second.match(/data-edit-html-report-theme/g) ?? []).length, 1);
  assert.match(second, /data-theme="research-cobalt"/);
  assert.match(second, /--report-accent:#0066FF/);
  assert.doesNotMatch(second, /--report-accent:#64FFDA/);
  assert.equal(bodyHtml(second), bodyHtml(source));
});

test("compiled theme variables come after Huashu defaults and win the cascade", () => {
  const source = '<!doctype html><html><head><style>:root{--report-accent:#123456}</style></head><body>Report</body></html>';
  const compiled = compileThemeIntoArtifact(source, "signal-orange");
  assert.ok(compiled.indexOf("--report-accent:#FF6900") > compiled.indexOf("--report-accent:#123456"));
  assert.equal((compiled.match(/data-edit-html-report-theme/g) ?? []).length, 1);
});

function bodyHtml(html) {
  return html.match(/<body\b[^>]*>[\s\S]*<\/body>/i)?.[0] ?? null;
}
