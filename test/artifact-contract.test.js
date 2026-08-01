import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  validateModeArtifact,
  validateVisibleChartMarks
} from "../src/artifact-contract.js";

const quantitativeAnalysis = {
  recommendation: {
    numericTokenCount: 12,
    quantitativeThreshold: 8
  }
};

function fixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function chart(id, color = 1) {
  return (
    `<figure data-chart-id="${id}" data-source-ref="brief.txt">` +
    `<svg><rect data-chart-mark style="fill:var(--report-chart-${color})"></rect></svg>` +
    `</figure>`
  );
}

test("data-first rejects a quantitatively rich artifact with fewer than four KPIs", () => {
  const html =
    '<body data-report-mode="data-first">' +
    '<section data-kpi-id="one"></section>' +
    '<section data-kpi-id="two"></section>' +
    '<section data-kpi-id="three"></section>' +
    chart("sales") +
    chart("margin", 2) +
    "</body>";

  assert.throws(
    () => validateModeArtifact({ html, mode: "data-first", analysis: quantitativeAnalysis }),
    /data-first requires at least 4 KPI blocks; found 3/
  );
});

test("data-first rejects a quantitatively rich artifact with fewer than two charts", () => {
  const html =
    '<body data-report-mode="data-first">' +
    ["one", "two", "three", "four"]
      .map((id) => `<section data-kpi-id="${id}"></section>`)
      .join("") +
    chart("sales") +
    "</body>";

  assert.throws(
    () => validateModeArtifact({ html, mode: "data-first", analysis: quantitativeAnalysis }),
    /data-first requires at least 2 charts; found 1/
  );
});

test("the exact insufficient-evidence exception bypasses data-first density minimums", () => {
  const html =
    '<body data-report-mode="data-first" ' +
    'data-density-exception="insufficient-quantitative-evidence"></body>';

  assert.doesNotThrow(() =>
    validateModeArtifact({ html, mode: "data-first", analysis: quantitativeAnalysis })
  );
});

test("evidence-first does not require KPI blocks or charts", () => {
  assert.doesNotThrow(() =>
    validateModeArtifact({
      html: '<body data-report-mode="evidence-first"><article>Argument</article></body>',
      mode: "evidence-first",
      analysis: quantitativeAnalysis
    })
  );
});

test("artifact mode declaration must match the variant mode", () => {
  assert.throws(
    () =>
      validateModeArtifact({
        html: '<body data-report-mode="evidence-first"></body>',
        mode: "data-first",
        analysis: quantitativeAnalysis
      }),
    /artifact must declare data-report-mode="data-first"/
  );
});

test("every chart requires a descendant visible mark using a report chart color", () => {
  assert.throws(
    () =>
      validateVisibleChartMarks(
        '<figure data-chart-id="sales"><svg><rect data-chart-mark fill="#123456"></rect></svg></figure>'
      ),
    /chart "sales" requires a data-chart-mark using var\(--report-chart-N\)/
  );

  assert.doesNotThrow(() =>
    validateVisibleChartMarks(
      '<figure data-chart-id="sales"><svg><path data-chart-mark stroke="var(--report-chart-2)"></path></svg></figure>'
    )
  );
});

test("reference artifacts satisfy their respective mode contracts", () => {
  assert.doesNotThrow(() =>
    validateModeArtifact({
      html: fixture("data-first-artifact.html"),
      mode: "data-first",
      analysis: quantitativeAnalysis
    })
  );
  assert.doesNotThrow(() =>
    validateModeArtifact({
      html: fixture("evidence-first-artifact.html"),
      mode: "evidence-first",
      analysis: quantitativeAnalysis
    })
  );
});
