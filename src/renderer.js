import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateCoverage, walkNodes } from "./report-model.js";
import {
  compilePresentationPlan,
  loadConfirmedHuashuDesignPackage
} from "./design-package.js";
import { visualizationForDataset } from "./chart-data.js";
import { compileThemeIntoArtifact } from "./theme-artifact.js";
import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import { markAwaitingEditorReview } from "./editor-review.js";

export async function renderVariant(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [variant, report, coverage, designPackage] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readJson(path.join(variantDir, "report-model.json")),
    readJson(path.join(projectDir, "coverage-map.json")),
    loadConfirmedHuashuDesignPackage(projectDir, variantId)
  ]);
  validateCoverage(coverage, report);
  const presentation = compilePresentationPlan(report, designPackage);
  await writeJsonAtomic(path.join(variantDir, "presentation-plan.json"), presentation);
  const assets = await inlineAssets(projectDir, report);
  const html = compileThemeIntoArtifact(
    renderReport({ report, presentation, assets, designPackage }),
    variant.themeId
  );
  const artifactPath = path.join(variantDir, "artifact.html");
  await writeTextAtomic(artifactPath, html);
  await markAwaitingEditorReview(projectDir, variantId, { reason: "rendered" });
  return artifactPath;
}

export function renderReport({ report, presentation, assets = new Map(), designPackage = null }) {
  if (presentation.contentMutationAllowed !== false) throw new Error("presentation plan must prohibit content mutation");
  if (presentation.mode !== report.mode) throw new Error("presentation mode must match report mode");
  const bindings = new Map((presentation.bindings ?? []).map((binding) => [binding.nodeId, binding]));
  const titleNode = report.nodes.find((node) => node.type === "section");
  const title = titleNode?.title ?? "研究报告";
  const titleIsHeaderOnly = titleNode?.level === 0 && !(titleNode.children?.length);
  const renderedNodes = titleIsHeaderOnly ? report.nodes.filter((node) => node !== titleNode) : report.nodes;
  const navigation = renderedNodes.filter((node) => node.type === "section").map((node, index) =>
    '<a href="#' + escapeAttribute(node.nodeId) + '"><span>' + String(index + 1).padStart(2, "0") + '</span>' + escapeHtml(node.title) + '</a>'
  ).join("");
  const body = renderedNodes.map((node, index) => renderNode(node, {
    report,
    binding: bindings.get(node.nodeId),
    bindings,
    assets,
    sectionIndex: index
  })).join("");
  const modeLabel = report.mode === "data-first" ? "数据优先" : "证据优先";
  const modeNote = report.mode === "data-first" ? "高密度数据 · 分层交互" : "阅读宽度 · 观点与证据链";
  const editableTitle = titleIsHeaderOnly
    ? ' data-edit-id="' + escapeAttribute(titleNode.nodeId) + '"' + sourceAttribute(titleNode)
    : "";
  const packageStyles = designPackage?.stylesheet ?? "";
  const designAttributes = presentation.designDirectionId
    ? ' data-design-direction="' + escapeAttribute(presentation.designDirectionId) + '"' +
      ' data-design-package-sha="' + escapeAttribute(presentation.designOutputSha256) + '"' +
      ' data-preview-theme="' + escapeAttribute(presentation.previewThemeId) + '"'
    : "";
  return '<!doctype html><html lang="zh-CN"' + designAttributes + '><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Crect%20width%3D%2216%22%20height%3D%2216%22%20rx%3D%223%22%2F%3E%3C%2Fsvg%3E">' +
    '<title>' + escapeHtml(title) + '</title><style data-edit-html-report-base>' + baseReportCss() + chartAxisCss() + '</style>' +
    '<style data-design-package="' + escapeAttribute(presentation.designOutputSha256 ?? "legacy") + '">' + packageStyles + '</style></head>' +
    '<body data-report-mode="' + report.mode + '"><header class="report-header"><div class="report-header-inner">' +
    '<p class="eyebrow">EDIT HTML REPORT · V4</p><h1' + editableTitle + '>' + escapeHtml(title) + '</h1>' +
    '<div class="report-meta"><span>模式：' + modeLabel + '</span><span>' + modeNote + '</span></div></div></header>' +
    (navigation ? '<nav class="chapter-nav" aria-label="章节导航"><div>' + navigation + '</div></nav>' : '') +
    '<main class="report-shell">' + body + '</main><div class="chart-tooltip" role="status"></div>' +
    '<script>' + reportScript() + '</script></body></html>';
}

function renderNode(node, context) {
  if (node.type === "legacyHtml") return '<section class="legacy-html" data-node-id="' + escapeAttribute(node.nodeId) + '">' + node.html + '</section>';
  const primitive = context.binding?.primitive;
  if (primitive === "masterDetail") return renderMasterDetail(node, context);
  if (primitive === "section" || primitive === "hero") return renderSection(node, context);
  if (primitive === "table") return renderTable(node, context);
  if (primitive === "figure") return renderImage(node, context.assets, context);
  if (primitive === "narrative" && node.type === "list") return renderList(node, context);
  if (["narrative", "metric", "evidenceWarning"].includes(primitive)) return renderText(node, context);
  if (context.binding) throw new Error(`unsupported design primitive ${primitive ?? "missing"}`);
  if (node.type === "entityGroup") return renderMasterDetail(node, context);
  if (node.type === "section") return renderSection(node, context);
  if (node.type === "table") return renderTable(node, context);
  if (node.type === "image") return renderImage(node, context.assets, context);
  if (node.type === "list") return renderList(node, context);
  return renderText(node, context);
}

function renderSection(section, context) {
  const index = String((context.sectionIndex ?? 0) + 1).padStart(2, "0");
  const children = (section.children ?? []).map((child) => renderNode(child, {
    ...context,
    binding: context.bindings.get(child.nodeId)
  })).join("");
  const structural = !section.children?.length;
  return '<section id="' + escapeAttribute(section.nodeId) + '" class="report-section ' + bindingClass(context) + (structural ? ' structural-section' : '') + '"' + bindingData(context) + ' data-block-id="' + escapeAttribute(section.nodeId) + '" data-node-id="' + escapeAttribute(section.nodeId) + '">' +
    '<header class="section-heading"><span>' + index + '</span><h2 data-edit-id="' + escapeAttribute(section.nodeId) + '"' + sourceAttribute(section) + '>' + escapeHtml(section.title) + '</h2></header>' +
    '<div class="section-content">' + children + '</div></section>';
}

function renderText(node, context) {
  const mode = context.report.mode;
  const source = sourceAttribute(node);
  if (mode === "evidence-first" || node.displayIntent === "evidence" || node.displayIntent === "warning") {
    return '<article class="evidence-chain ' + bindingClass(context) + '"' + bindingData(context) + ' data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' +
      '<div class="evidence-label">原文证据</div><p data-edit-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' + escapeHtml(node.text ?? "") + '</p>' +
      renderCitation(node.sourceRefs) + '</article>';
  }
  const dataset = node.displayIntent === "chart-support"
    ? context.report.datasets.find((item) => item.nodeId === node.nodeId)
    : null;
  if (node.displayIntent === "metric") {
    assertCompleteMetric(node);
    const displayValue = String(node.metric.value) + String(node.metric.unit);
    const metric = '<article class="metric-evidence ' + bindingClass(context) + '"' + bindingData(context) + ' data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' +
      '<div class="metric-values"><strong>' + escapeHtml(displayValue) + '</strong><span>' + escapeHtml(node.metric.label) + '</span></div>' +
      '<p class="metric-scope">' + escapeHtml(node.metric.time + " · " + node.metric.scope) + '</p>' +
      '<p data-edit-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' + escapeHtml(node.text ?? "") + '</p>' + renderCitation(node.sourceRefs) + '</article>';
    return metric;
  }
  const narrative = '<p class="narrative-block ' + bindingClass(context) + '"' + bindingData(context) + ' data-edit-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' + escapeHtml(node.text ?? "") + '</p>';
  if (node.displayIntent === "chart-support" && dataset) {
    const chart = renderChart(dataset, node.sourceRefs, context.binding);
    if (chart) return '<div class="narrative-chart-pair">' + narrative + chart + '</div>';
  }
  return narrative;
}

function renderList(node, context = {}) {
  const tag = node.ordered ? "ol" : "ul";
  return '<' + tag + ' class="structured-list ' + bindingClass(context) + '"' + bindingData(context) + ' data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '" data-edit-id="' + escapeAttribute(node.nodeId) + '"' + sourceAttribute(node) + '>' +
    (node.items ?? []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</' + tag + '>';
}

function renderTable(node, context) {
  const rows = node.rows ?? [];
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  const table = '<div class="table-wrap ' + bindingClass(context) + '"' + bindingData(context) + ' data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"><table' + sourceAttribute(node) + '><thead><tr>' +
    head.map((cell) => '<th>' + escapeHtml(cell) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map((row, rowIndex) => '<tr class="' + (rowIndex === body.length - 1 ? 'summary-row' : '') + '">' + row.map((cell, columnIndex) => '<td data-cell-row="' + rowIndex + '" data-cell-column="' + columnIndex + '">' + escapeHtml(cell) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
  if (context.report.mode !== "data-first") return table + renderCitation(node.sourceRefs);
  const dataset = node.displayIntent === "chart-support"
    ? context.report.datasets.find((item) => item.nodeId === node.nodeId)
    : null;
  const chart = dataset ? renderChart(dataset, node.sourceRefs, context.binding) : "";
  return '<div class="data-pair">' + table + chart + '</div>';
}

function renderChart(dataset, sourceRefs, binding = null) {
  const visualization = visualizationForDataset(dataset);
  if (!visualization) return "";
  const rows = visualization.rows;
  const values = rows.map((row) => row.value);
  const max = Math.max(...values, 1);
  const chartId = "chart-" + dataset.datasetId;
  const source = sourceRefs?.[0] ? sourceRefs[0].documentName + "#" + sourceRefs[0].sourceId : "unknown";
  const marks = rows.map((row, index) => {
    const value = row.value;
    const label = row.label ?? String(index + 1);
    const displayValue = row.displayValue ?? formatAxisValue(value) + (row.unit ?? "");
    const width = Math.max(2, value / max * 100);
    const series = (index % 8) + 1;
    const reused = index >= 8;
    const symbols = ["circle", "square", "triangle", "diamond"];
    const symbol = symbols[Math.floor(index / 8) % symbols.length];
    const markStyle = reused
      ? 'width:' + width.toFixed(2) + '%;background:repeating-linear-gradient(135deg,var(--report-chart-' + series + ') 0 4px,color-mix(in srgb,var(--report-chart-' + series + ') 35%,transparent) 4px 8px);border:1px solid var(--report-chart-' + series + ');border-style:dashed'
      : 'width:' + width.toFixed(2) + '%;background:var(--report-chart-' + series + ')';
    return '<button class="chart-row" type="button" data-chart-label="' + escapeAttribute(label) + '" data-chart-value="' + escapeAttribute(displayValue) + '"' + (reused ? ' data-series-reused="true" data-series-symbol="' + symbol + '"' : '') + '><span title="' + escapeAttribute(label) + '">' + (reused ? '<em class="series-symbol" aria-hidden="true">◆</em>' : '') + escapeHtml(label) + '</span><i class="chart-mark" data-chart-mark style="' + markStyle + '"></i><b>' + escapeHtml(displayValue) + '</b></button>';
  }).join('');
  const axis = '<div class="chart-axis" aria-label="数值坐标">' + [0, 0.25, 0.5, 0.75, 1].map((ratio) => '<span>' + escapeHtml(formatAxisValue(max * ratio)) + '</span>').join('') + '</div>';
  const chartClass = binding?.chartPackageClass ? ' ' + escapeAttribute(binding.chartPackageClass) : '';
  const chartBindingData = binding?.chartComponentId
    ? ' data-chart-component-id="' + escapeAttribute(binding.chartComponentId) + '"' +
      ' data-chart-layout-id="' + escapeAttribute(binding.chartLayoutId) + '"' +
      ' data-chart-interaction-ids="' + escapeAttribute((binding.chartInteractionIds ?? []).join(" ")) + '"'
    : '';
  return '<figure class="interactive-chart' + chartClass + '"' + chartBindingData + ' data-chart-id="' + escapeAttribute(chartId) + '" data-node-id="' + escapeAttribute(dataset.nodeId) + '" data-chart-unit="' + escapeAttribute(visualization.unit) + '" data-source-ref="' + escapeAttribute(source) + '"><figcaption>' + escapeHtml(visualization.caption) + '</figcaption><div class="chart-stage"><div class="chart-selection-band"></div>' + marks + '</div>' + axis +
    '<script type="application/json" data-chart-data-for="' + escapeAttribute(chartId) + '">' + escapeScriptJson(JSON.stringify(dataset)) + '</script></figure>';
}

function renderImage(node, assets, context = {}) {
  const source = node.assetData ?? assets.get(node.assetPath) ?? node.assetPath;
  return '<figure class="source-figure ' + bindingClass(context) + '"' + bindingData(context) + ' data-image-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + sourceAttribute(node) + '><img src="' + escapeAttribute(source) + '" alt="' + escapeAttribute(node.alt ?? '') + '"><figcaption>' + escapeHtml(node.caption || node.alt || '') + '</figcaption></figure>';
}

function renderMasterDetail(node, context) {
  const entities = node.entities ?? [];
  const buttons = entities.map((entity, index) => '<button type="button" data-entity-id="' + escapeAttribute(entity.entityId) + '" aria-selected="' + (index === 0) + '">' + escapeHtml(entity.title) + '</button>').join('');
  const panels = entities.map((entity, entityIndex) => {
    const tabs = entity.dimensions.map((dimension, index) => '<button type="button" data-dimension="' + escapeAttribute(dimension.label) + '" aria-selected="' + (index === 0) + '">' + escapeHtml(dimension.label) + '</button>').join('');
    const dimensions = entity.dimensions.map((dimension, index) => {
      const contents = dimension.nodes?.length
        ? dimension.nodes.map((child) => renderNode(child, {
            ...context,
            binding: context.bindings.get(child.nodeId)
          })).join("")
        : '<p>' + escapeHtml(dimension.text) + '</p>';
      return '<article data-dimension-panel="' + escapeAttribute(dimension.label) + '"' + (index ? ' hidden' : '') + '><h4>' + escapeHtml(dimension.label) + '</h4>' + contents + renderCitation(dimension.sourceRefs) + '</article>';
    }).join('');
    return '<div class="entity-panel" data-entity-panel="' + escapeAttribute(entity.entityId) + '"' + (entityIndex ? ' hidden' : '') + '><header><h3>' + escapeHtml(entity.title) + '</h3><div class="dimension-tabs">' + tabs + '</div></header>' + dimensions + '</div>';
  }).join('');
  return '<section class="report-section master-detail ' + bindingClass(context) + '"' + bindingData(context) + ' data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"><header class="section-heading"><span>◎</span><h2>' + escapeHtml(node.title) + '</h2></header><div class="master-detail-grid"><aside class="entity-selector">' + buttons + '</aside><div class="entity-detail">' + panels + '</div></div></section>';
}

function renderCitation(sourceRefs = []) {
  if (!sourceRefs.length) return "";
  return '<p class="source-citation">来源：' + sourceRefs.map((ref) => escapeHtml(ref.documentName + (ref.page ? " · P" + ref.page : ref.slide ? " · S" + ref.slide : "") + " · " + ref.sourceId)).join('；') + '</p>';
}

async function inlineAssets(projectDir, report) {
  const paths = new Set();
  walkNodes(report.nodes, (node) => { if (node.type === "image" && node.assetPath && !node.assetPath.startsWith("data:")) paths.add(node.assetPath); });
  const assets = new Map();
  for (const assetPath of paths) {
    try {
      const bytes = await readFile(path.join(projectDir, ...assetPath.split('/')));
      assets.set(assetPath, 'data:' + mimeFor(assetPath) + ';base64,' + bytes.toString('base64'));
    } catch {
      assets.set(assetPath, 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="#ddd"/><text x="50%" y="50%" text-anchor="middle">图像资源缺失</text></svg>').toString('base64'));
    }
  }
  return assets;
}

function baseReportCss() {
  return '*{box-sizing:border-box}html{scroll-behavior:smooth;max-width:100%;overflow-x:hidden}body{margin:0;max-width:100%;overflow-x:hidden;background:var(--report-canvas);color:var(--report-text);font-family:"Microsoft YaHei",sans-serif;line-height:1.65}button{font:inherit;color:inherit}.source-figure img{display:block;max-width:100%;height:auto}.table-wrap{max-width:100%;overflow:auto}[hidden]{display:none!important}.chart-stage{position:relative}.chart-selection-band{position:absolute;inset:0 auto 0 0;width:0;background:var(--report-selection);pointer-events:none}.chart-row{display:grid;grid-template-columns:minmax(90px,150px) minmax(0,1fr) minmax(60px,auto);gap:10px;align-items:center;width:100%;border:0;background:transparent;text-align:left}.chart-mark{display:block;min-width:2px}.chart-tooltip{position:fixed;z-index:30;display:none;pointer-events:none;padding:8px 10px;background:var(--report-chart-tooltip-background);color:var(--report-chart-tooltip-text)}';
}

function chartAxisCss() {
  return '.narrative-chart-pair{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(360px,.9fr);gap:24px;align-items:start;grid-column:span 12}.chart-axis{display:flex;justify-content:space-between;margin:8px 54px 0 90px;padding-top:5px;border-top:1px solid var(--report-chart-grid);color:var(--report-chart-axis);font-size:10px;font-variant-numeric:tabular-nums}@media(max-width:800px){.narrative-chart-pair{grid-template-columns:1fr}}';
}

function reportScript() {
  return `(()=>{const tooltip=document.querySelector('.chart-tooltip');document.querySelectorAll('.chart-row').forEach(row=>{const show=e=>{tooltip.textContent=row.dataset.chartLabel+'：'+row.dataset.chartValue;tooltip.style.display='block';tooltip.style.left=(e.clientX+14)+'px';tooltip.style.top=(e.clientY+14)+'px';const stage=row.closest('.chart-stage');const band=stage.querySelector('.chart-selection-band');band.style.width=Math.max(0,e.clientX-stage.getBoundingClientRect().left)+'px'};row.addEventListener('pointermove',show);row.addEventListener('focus',()=>show({clientX:row.getBoundingClientRect().right,clientY:row.getBoundingClientRect().top}));row.addEventListener('pointerleave',()=>{tooltip.style.display='none';row.closest('.chart-stage').querySelector('.chart-selection-band').style.width='0'});row.addEventListener('blur',()=>{tooltip.style.display='none'})});document.querySelectorAll('.master-detail').forEach(root=>{root.querySelectorAll('[data-entity-id]').forEach(button=>button.addEventListener('click',()=>{root.querySelectorAll('[data-entity-id]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));root.querySelectorAll('[data-entity-panel]').forEach(panel=>panel.hidden=panel.dataset.entityPanel!==button.dataset.entityId)}));root.querySelectorAll('.entity-panel').forEach(panel=>panel.querySelectorAll('[data-dimension]').forEach(button=>button.addEventListener('click',()=>{panel.querySelectorAll('[data-dimension]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));panel.querySelectorAll('[data-dimension-panel]').forEach(item=>item.hidden=item.dataset.dimensionPanel!==button.dataset.dimension)})))})})();`;
}

function formatAxisValue(value) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function bindingClass(context = {}) { return escapeAttribute(context.binding?.packageClass ?? ""); }
function bindingData(context = {}) {
  const binding = context.binding;
  if (!binding?.componentId) return "";
  return ' data-component-id="' + escapeAttribute(binding.componentId) + '"' +
    ' data-layout-id="' + escapeAttribute(binding.layoutId) + '"' +
    ' data-interaction-ids="' + escapeAttribute((binding.interactionIds ?? []).join(" ")) + '"';
}
function assertCompleteMetric(node) {
  const metric = node.metric;
  const required = ["label", "value", "unit", "time", "scope", "source"];
  const missing = required.filter((field) => metric?.[field] === undefined || metric?.[field] === null || metric?.[field] === "");
  if (missing.length || !node.sourceRefs?.length) {
    throw new Error(`metric node ${node.nodeId} requires label, value, unit, time, scope, and source`);
  }
}
function sourceAttribute(node) { const ref = node.sourceRefs?.[0]; return ref ? ' data-source-ref="' + escapeAttribute(ref.documentName + '#' + ref.sourceId) + '"' : ''; }
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function escapeAttribute(value) { return escapeHtml(value); }
function escapeScriptJson(value) { return value.replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026'); }
function mimeFor(filePath) { const extension = path.extname(filePath).toLowerCase(); return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml'})[extension] ?? 'application/octet-stream'; }
async function readJson(filePath) { return JSON.parse(await readFile(filePath, 'utf8')); }
