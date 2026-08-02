import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject } from "../src/project.js";
import { renderVariant } from "../src/renderer.js";
import { createVariant } from "../src/variants.js";

test("data-first renderer compiles canonical models into an interactive offline report", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 市场规模\n2025 年规模为 42 亿元，同比增长 18%。\n\n| 地区 | 规模 |\n| --- | --- |\n| 全球 | 42 |\n| 中国 | 18 |\n\n# 技术约束\n功率达到 10kW。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });

  const artifactPath = await renderVariant(projectDir, variant.variantId);
  const html = await readFile(artifactPath, "utf8");

  assert.match(html, /data-report-mode="data-first"/);
  assert.match(html, /data-theme="linear-indigo"/);
  assert.match(html, /max-width:1440px/);
  assert.match(html, /data-chart-id=/);
  assert.match(html, /class="interactive-chart"[^>]*data-chart-id="[^"]+"[^>]*data-node-id="[^"]+"/);
  assert.match(html, /class="chart-tooltip"/);
  assert.match(html, /class="chart-selection-band"/);
  assert.match(html, /class="chart-axis"/);
  assert.match(html, /--report-chart-8:/);
  assert.ok(html.indexOf("市场规模") < html.indexOf("技术约束"));
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//i);
});

test("data-first renders comparable paragraph metrics as an editable sourced chart", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-metrics-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(
    source,
    "# 市场趋势\n全球市场规模从 73.6 亿元增长至 101 亿元，复合增速为 5.5%。",
    "utf8"
  );
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });

  const report = JSON.parse(await readFile(path.join(projectDir, "variants", variant.variantId, "report-model.json"), "utf8"));
  const dataset = report.datasets.find((item) => item.kind === "numeric-text");
  assert.deepEqual(dataset.columns, ["指标", "数值", "单位"]);
  assert.equal(dataset.rows.filter((row) => row[2] === "亿元").length, 2);

  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, new RegExp(`data-chart-id="chart-${dataset.datasetId}"`));
  assert.match(html, /同单位指标对比（亿元）/);
  assert.match(html, /data-chart-value="73\.6亿元"/);
  assert.match(html, /data-source-ref="brief\.md#/);
});

test("data-first does not chart unrelated single-unit paragraph values", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-single-metrics-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 判断\n2025 年市场增长 18%，功率达到 10kW。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });

  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.doesNotMatch(html, /class="metric-chart-pair"/);
});

test("renderer supports material master-detail navigation without dropping dimensions", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "材料证据", "utf8");
  await createProject(source, projectDir);
  await writeFile(path.join(projectDir, "source-assets", "nested.png"), Buffer.from("nested-image"));
  const variant = await createVariant(projectDir, { mode: "data-first" });
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  const sourceRef = { sourceId: "src-material", documentName: "brief.txt", order: 0 };
  const report = {
    schemaVersion: 4, variantId: variant.variantId, mode: "data-first", revision: 0,
    nodes: [{
      nodeId: "materials", type: "entityGroup", title: "核心材料", sourceRefs: [sourceRef],
      entities: ["PCB", "HBM", "MLCC", "液冷"].map((title, index) => ({
        entityId: "material-" + index, title,
        dimensions: ["全球市场", "国内情况", "深圳情况", "技术难点"].map((label, dimensionIndex) => ({
          label,
          text: title + label,
          sourceRefs: [sourceRef],
          ...(index === 0 && dimensionIndex === 0 ? {
            nodes: [
              { nodeId: "nested-text", type: "paragraph", text: title + label, sourceRefs: [sourceRef] },
              { nodeId: "nested-image", type: "image", assetPath: "source-assets/nested.png", sourceRefs: [sourceRef] }
            ]
          } : {})
        }))
      }))
    }], datasets: [], overrides: []
  };
  await writeFile(path.join(variantDir, "report-model.json"), JSON.stringify(report), "utf8");
  await writeFile(path.join(variantDir, "presentation-plan.json"), JSON.stringify({
    schemaVersion: 4, variantId: variant.variantId, mode: "data-first", contentMutationAllowed: false,
    bindings: [{ nodeId: "materials", component: "master-detail", layout: "split-pane", interaction: "entity-and-dimension-tabs" }]
  }), "utf8");
  await writeFile(path.join(projectDir, "coverage-map.json"), JSON.stringify({ schemaVersion: 4, entries: [] }), "utf8");

  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /class="entity-selector"/);
  assert.match(html, /data-entity-id="material-3"/);
  assert.match(html, /data-dimension="技术难点"/);
  assert.match(html, /PCB全球市场/);
  assert.match(html, /液冷技术难点/);
  assert.match(html, /src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /src="source-assets\/nested\.png"/);
});

test("document titles render once as the editable report header and empty chapter dividers stay compact", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-title-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "AI服务器核心材料专题研究报告\n一、发展情况\n（一）技术情况\n正文。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /<h1 data-edit-id="[^"]+"[^>]*>AI服务器核心材料专题研究报告<\/h1>/);
  assert.doesNotMatch(html, /<h2[^>]*>AI服务器核心材料专题研究报告<\/h2>/);
  assert.match(html, /class="report-section structural-section"/);
});

test("evidence-first renderer exposes claim, evidence, qualification, and source", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 判断\n材料性能构成约束。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /data-report-mode="evidence-first"/);
  assert.match(html, /class="evidence-chain"/);
  assert.match(html, /class="source-citation"/);
  assert.match(html, /阅读宽度/);
});

test("data-first charts add non-color encodings after the eighth series", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-series-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  const rows = Array.from({ length: 10 }, (_, index) => `| 系列${index + 1} | ${index + 1} |`).join("\n");
  await writeFile(source, "# 对比\n| 系列 | 数值 |\n| --- | ---: |\n" + rows, "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /data-series-reused="true"/);
  assert.match(html, /data-series-symbol="(?:diamond|square|circle|triangle)"/);
  assert.match(html, /repeating-linear-gradient/);
  assert.match(html, /border-style:dashed/);
});
