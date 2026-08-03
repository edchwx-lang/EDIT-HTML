import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject } from "../src/project.js";
import { renderVariant } from "../src/renderer.js";
import { renderReport } from "../src/renderer.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "./helpers/huashu.js";

test("data-first renderer compiles canonical models into an interactive offline report", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 市场规模\n2025 年规模为 42 亿元，同比增长 18%。\n\n| 地区 | 规模 |\n| --- | --- |\n| 全球 | 42 |\n| 中国 | 18 |\n\n# 技术约束\n功率达到 10kW。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });

  const artifactPath = await renderVariant(projectDir, variant.variantId);
  const html = await readFile(artifactPath, "utf8");

  assert.match(html, /data-report-mode="data-first"/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
  assert.match(html, /data-theme="deep-data-blue"/);
  assert.match(html, /data-design-package="[0-9a-f]{64}"/);
  assert.match(html, /width:min\(1440px/);
  assert.match(html, /data-chart-id=/);
  assert.match(html, /class="interactive-chart[^"]*"[^>]*data-chart-id="[^"]+"[^>]*data-node-id="[^"]+"/);
  assert.match(html, /data-chart-component-id="chart-component"/);
  assert.match(html, /data-chart-layout-id="content-layout"/);
  assert.match(html, /data-chart-interaction-ids="chart-tooltip"/);
  assert.match(html, /test-chart/);
  assert.match(html, /class="chart-tooltip"/);
  assert.match(html, /class="chart-selection-band"/);
  assert.match(html, /class="chart-axis"/);
  assert.match(html, /--report-chart-8:/);
  assert.ok(html.indexOf("市场规模") < html.indexOf("技术约束"));
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//i);
});

test("data-first keeps numeric prose narrative and does not synthesize paragraph datasets", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-prose-numbers-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(
    source,
    "# Market trend\nGlobal market grows from 73.6 billion to 101 billion, with CAGR at 5.5% and shipment cycle near 18 months.",
    "utf8"
  );
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });

  const report = JSON.parse(await readFile(path.join(projectDir, "variants", variant.variantId, "report-model.json"), "utf8"));
  const paragraph = report.nodes.flatMap((node) => node.children ?? []).find((node) => node.type === "paragraph");
  assert.equal(paragraph.displayIntent, "narrative");
  assert.equal(report.datasets.some((item) => item.nodeId === paragraph.nodeId), false);

  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.doesNotMatch(html, /data-chart-id="chart-dataset-/);
  assert.doesNotMatch(html, /class="metric-values"/);
  assert.doesNotMatch(html, /class="narrative-chart-pair/);
});

test("data-first does not chart unrelated single-unit paragraph values", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-single-metrics-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 判断\n2025 年市场增长 18%，功率达到 10kW。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });

  const report = JSON.parse(await readFile(path.join(projectDir, "variants", variant.variantId, "report-model.json"), "utf8"));
  const paragraph = report.nodes.flatMap((node) => node.children ?? []).find((node) => node.type === "paragraph");
  assert.equal(paragraph.displayIntent, "narrative");
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.doesNotMatch(html, /class="metric-chart-pair"/);
  assert.doesNotMatch(html, /class="metric-values"/);
});

test("data-first renders only a complete explicit metric contract as KPI", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-explicit-metric-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 市场规模\n2025年全球市场规模为101亿元。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  const reportPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const paragraph = report.nodes.flatMap((node) => node.children ?? []).find((node) => node.type === "paragraph");
  paragraph.displayIntent = "metric";
  paragraph.metric = {
    label: "全球市场规模",
    value: 101,
    unit: "亿元",
    time: "2025",
    scope: "全球",
    source: paragraph.sourceRefs[0]
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /class="metric-values"/);
  assert.match(html, />101亿元<\/strong>/);
  assert.match(html, /全球市场规模/);
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
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  const sourceModel = JSON.parse(await readFile(path.join(projectDir, "source-model.json"), "utf8"));
  const sourceRef = { sourceId: sourceModel.documents[0].units[0].sourceId, documentName: "brief.txt", order: 0 };
  const report = {
    schemaVersion: 4, variantId: variant.variantId, mode: "data-first", revision: 0,
    sourcePolicy: "closed", expressionPolicy: "free", editorialStatus: "confirmed",
    nodes: [{
      nodeId: "materials", type: "entityGroup", title: "核心材料", transformation: "merge", sourceRefs: [sourceRef],
      entities: ["PCB", "HBM", "MLCC", "液冷"].map((title, index) => ({
        entityId: "material-" + index, title,
        dimensions: ["全球市场", "国内情况", "深圳情况", "技术难点"].map((label, dimensionIndex) => ({
          label,
          text: title + label,
          sourceRefs: [sourceRef],
          ...(index === 0 && dimensionIndex === 0 ? {
            nodes: [
              { nodeId: "nested-text", type: "paragraph", text: title + label, transformation: "preserve", sourceRefs: [sourceRef] },
              { nodeId: "nested-image", type: "image", assetPath: "source-assets/nested.png", transformation: "preserve", sourceRefs: [sourceRef] }
            ]
          } : {})
        }))
      }))
    }], datasets: [], overrides: [{
      nodeId: "nested-text", field: "text", changedAt: new Date().toISOString(), provenance: "user-override"
    }]
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
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /<h1 data-edit-id="[^"]+"[^>]*>AI服务器核心材料专题研究报告<\/h1>/);
  assert.doesNotMatch(html, /<h2[^>]*>AI服务器核心材料专题研究报告<\/h2>/);
  assert.match(html, /class="report-section [^"]*structural-section"/);
});

test("evidence-first renderer exposes claim, evidence, qualification, and source", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-render-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 判断\n材料性能构成约束。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /data-report-mode="evidence-first"/);
  assert.match(html, /class="evidence-chain [^"]+"/);
  assert.match(html, /class="source-citation"/);
  assert.match(html, /设计策略/);
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
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  const html = await readFile(await renderVariant(projectDir, variant.variantId), "utf8");
  assert.match(html, /data-series-reused="true"/);
  assert.match(html, /data-series-symbol="(?:diamond|square|circle|triangle)"/);
  assert.match(html, /repeating-linear-gradient/);
  assert.match(html, /border-style:dashed/);
});

test("semantic line charts expose nearest-x groups and a narrow crosshair instead of cumulative fill", () => {
  const sourceRef = { sourceId: "src-trend", documentName: "brief.md" };
  const report = {
    schemaVersion: 4, variantId: "v", mode: "data-first", revision: 0,
    nodes: [{ nodeId: "trend", type: "paragraph", text: "出货量趋势", displayIntent: "chart-support", sourceRefs: [sourceRef] }],
    datasets: [{ datasetId: "trend", nodeId: "trend", kind: "semantic", relation: "trend", chartType: "line", x: ["2023", "2024"], series: [{ name: "出货量", unit: "万台", values: [118, 155] }] }],
    facts: [], overrides: []
  };
  const presentation = {
    schemaVersion: 4, variantId: "v", mode: "data-first", contentMutationAllowed: false,
    designDirectionId: "trend-strategy", designDirectionLabel: "趋势坐标", strategyThesis: "按时间定位数据组",
    designOutputSha256: "a".repeat(64), previewThemeId: "precision-blueprint",
    bindings: [{ nodeId: "trend", componentId: "narrative", layoutId: "flow", interactionIds: ["chart-tooltip"], packageClass: "narrative flow", primitive: "narrative", chartComponentId: "chart", chartLayoutId: "flow", chartInteractionIds: ["nearest-x-group"], chartPrimitive: "chart" }]
  };
  const html = renderReport({ report, presentation, designPackage: { stylesheet: ".flow{display:block}" } });
  assert.match(html, /class="chart-x-group"/);
  assert.match(html, /data-chart-label="2024"/);
  assert.match(html, /出货量: 155万台/);
  assert.match(html, /chart-selection-band\{width:2px!important;opacity:0\}/);
  assert.match(html, /querySelectorAll\('\.trend-stage'\)/);
  assert.match(html, /ratio=Math\.max\(0,Math\.min\(1,/);
  assert.match(html, /data-group-index="1"/);
  assert.doesNotMatch(html, /band\.style\.width=Math\.max/);
  assert.doesNotMatch(html, /\?\? 0/);
});
