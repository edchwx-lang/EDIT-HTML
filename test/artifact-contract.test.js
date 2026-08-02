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

test("data-first no longer enforces arbitrary KPI or chart minimums", () => {
  const html =
    '<body data-report-mode="data-first">' +
    '<div class="chart-tooltip"></div><div class="chart-selection-band"></div>' +
    chart("chart-dataset-sales") +
    "</body>";

  assert.doesNotThrow(() => validateModeArtifact({
    html, mode: "data-first", analysis: quantitativeAnalysis,
    report: { datasets: [{ datasetId: "dataset-sales", kind: "table", rows: [["全球", 42], ["中国", 18]] }] }
  }));
});

test("data-first rejects an eligible dataset that is not visualized", () => {
  assert.throws(
    () => validateModeArtifact({
      html: '<body data-report-mode="data-first"></body>',
      mode: "data-first",
      analysis: quantitativeAnalysis,
      report: { datasets: [{ datasetId: "dataset-sales", kind: "table", rows: [["全球", 42], ["中国", 18]] }] }
    }),
    /eligible dataset "dataset-sales" requires a visualization/
  );
});

test("data-first charts require tooltip and selection-band interaction", () => {
  assert.throws(() =>
    validateModeArtifact({
      html: '<body data-report-mode="data-first">' + chart("chart-dataset-sales") + '</body>',
      mode: "data-first",
      report: { datasets: [{ datasetId: "dataset-sales", kind: "table", rows: [["全球", 42], ["中国", 18]] }] }
    }),
    /interactive tooltip and selection band/
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

test("data-first requires comparable numeric-text datasets but not isolated metrics", () => {
  const comparable = {
    datasetId: "dataset-market",
    kind: "numeric-text",
    columns: ["指标", "数值", "单位"],
    rows: [["2024 年规模", 73.6, "亿元"], ["2030 年规模", 101, "亿元"]]
  };
  assert.throws(
    () => validateModeArtifact({
      html: '<body data-report-mode="data-first"></body>',
      mode: "data-first",
      report: { datasets: [comparable] }
    }),
    /eligible dataset "dataset-market" requires a visualization/
  );
  assert.doesNotThrow(() => validateModeArtifact({
    html: '<body data-report-mode="data-first"></body>',
    mode: "data-first",
    report: {
      datasets: [{
        datasetId: "dataset-isolated",
        kind: "numeric-text",
        columns: ["指标", "数值", "单位"],
        rows: [["市场增长", 18, "%"], ["机柜功率", 10, "kW"]]
      }]
    }
  }));
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
