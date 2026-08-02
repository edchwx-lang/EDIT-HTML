import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateCoverage, walkNodes } from "./report-model.js";
import { compileThemeIntoArtifact } from "./theme-artifact.js";
import { writeTextAtomic } from "./io.js";

export async function renderVariant(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [variant, report, presentation, coverage] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readJson(path.join(variantDir, "report-model.json")),
    readJson(path.join(variantDir, "presentation-plan.json")),
    readJson(path.join(projectDir, "coverage-map.json"))
  ]);
  validateCoverage(coverage, report);
  const assets = await inlineAssets(projectDir, report);
  const html = compileThemeIntoArtifact(
    renderReport({ report, presentation, assets }),
    variant.themeId
  );
  const artifactPath = path.join(variantDir, "artifact.html");
  await writeTextAtomic(artifactPath, html);
  return artifactPath;
}

export function renderReport({ report, presentation, assets = new Map() }) {
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
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml(title) + '</title><style>' + reportCss() + chartAxisCss() + '</style></head>' +
    '<body data-report-mode="' + report.mode + '"><header class="report-header"><div class="report-header-inner">' +
    '<p class="eyebrow">EDIT HTML REPORT · V4</p><h1' + editableTitle + '>' + escapeHtml(title) + '</h1>' +
    '<div class="report-meta"><span>模式：' + modeLabel + '</span><span>' + modeNote + '</span></div></div></header>' +
    (navigation ? '<nav class="chapter-nav" aria-label="章节导航"><div>' + navigation + '</div></nav>' : '') +
    '<main class="report-shell">' + body + '</main><div class="chart-tooltip" role="status"></div>' +
    '<script>' + reportScript() + '</script></body></html>';
}

function renderNode(node, context) {
  if (node.type === "legacyHtml") return '<section class="legacy-html" data-node-id="' + escapeAttribute(node.nodeId) + '">' + node.html + '</section>';
  if (node.type === "entityGroup") return renderMasterDetail(node, context);
  if (node.type === "section") return renderSection(node, context);
  if (node.type === "table") return renderTable(node, context);
  if (node.type === "image") return renderImage(node, context.assets);
  if (node.type === "list") return renderList(node);
  return renderText(node, context.report.mode);
}

function renderSection(section, context) {
  const index = String((context.sectionIndex ?? 0) + 1).padStart(2, "0");
  const children = (section.children ?? []).map((child) => renderNode(child, {
    ...context,
    binding: context.bindings.get(child.nodeId)
  })).join("");
  const structural = !section.children?.length;
  return '<section id="' + escapeAttribute(section.nodeId) + '" class="report-section' + (structural ? ' structural-section' : '') + '" data-block-id="' + escapeAttribute(section.nodeId) + '" data-node-id="' + escapeAttribute(section.nodeId) + '">' +
    '<header class="section-heading"><span>' + index + '</span><h2 data-edit-id="' + escapeAttribute(section.nodeId) + '"' + sourceAttribute(section) + '>' + escapeHtml(section.title) + '</h2></header>' +
    '<div class="section-content">' + children + '</div></section>';
}

function renderText(node, mode) {
  const source = sourceAttribute(node);
  if (mode === "evidence-first") {
    return '<article class="evidence-chain" data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' +
      '<div class="evidence-label">原文证据</div><p data-edit-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' + escapeHtml(node.text ?? "") + '</p>' +
      renderCitation(node.sourceRefs) + '</article>';
  }
  const values = numericTokens(node.text);
  if (values.length) {
    return '<article class="metric-evidence" data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' +
      '<div class="metric-values">' + values.map((value) => '<strong>' + escapeHtml(value) + '</strong>').join('') + '</div>' +
      '<p data-edit-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' + escapeHtml(node.text ?? "") + '</p>' + renderCitation(node.sourceRefs) + '</article>';
  }
  return '<p class="narrative-block" data-edit-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + source + '>' + escapeHtml(node.text ?? "") + '</p>';
}

function renderList(node) {
  const tag = node.ordered ? "ol" : "ul";
  return '<' + tag + ' class="structured-list" data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '" data-edit-id="' + escapeAttribute(node.nodeId) + '"' + sourceAttribute(node) + '>' +
    (node.items ?? []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</' + tag + '>';
}

function renderTable(node, context) {
  const rows = node.rows ?? [];
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  const table = '<div class="table-wrap" data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"><table' + sourceAttribute(node) + '><thead><tr>' +
    head.map((cell) => '<th>' + escapeHtml(cell) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map((row, rowIndex) => '<tr class="' + (rowIndex === body.length - 1 ? 'summary-row' : '') + '">' + row.map((cell, columnIndex) => '<td data-cell-row="' + rowIndex + '" data-cell-column="' + columnIndex + '">' + escapeHtml(cell) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
  if (context.report.mode !== "data-first") return table + renderCitation(node.sourceRefs);
  const dataset = context.report.datasets.find((item) => item.nodeId === node.nodeId);
  const chart = dataset ? renderChart(dataset, node.sourceRefs) : "";
  return '<div class="data-pair">' + table + chart + '</div>';
}

function renderChart(dataset, sourceRefs) {
  const rows = dataset.rows ?? [];
  const numericColumn = findNumericColumn(rows);
  if (numericColumn === -1) return "";
  const values = rows.map((row) => Number(String(row[numericColumn]).replaceAll(',', ''))).filter(Number.isFinite);
  const max = Math.max(...values, 1);
  const chartId = "chart-" + dataset.datasetId;
  const source = sourceRefs?.[0] ? sourceRefs[0].documentName + "#" + sourceRefs[0].sourceId : "unknown";
  const marks = rows.map((row, index) => {
    const value = Number(String(row[numericColumn]).replaceAll(',', ''));
    if (!Number.isFinite(value)) return "";
    const label = row[0] ?? String(index + 1);
    const width = Math.max(2, value / max * 100);
    const series = (index % 8) + 1;
    const reused = index >= 8;
    const symbols = ["circle", "square", "triangle", "diamond"];
    const symbol = symbols[Math.floor(index / 8) % symbols.length];
    const markStyle = reused
      ? 'width:' + width.toFixed(2) + '%;background:repeating-linear-gradient(135deg,var(--report-chart-' + series + ') 0 4px,color-mix(in srgb,var(--report-chart-' + series + ') 35%,transparent) 4px 8px);border:1px solid var(--report-chart-' + series + ');border-style:dashed'
      : 'width:' + width.toFixed(2) + '%;background:var(--report-chart-' + series + ')';
    return '<button class="chart-row" type="button" data-chart-label="' + escapeAttribute(label) + '" data-chart-value="' + escapeAttribute(value) + '"' + (reused ? ' data-series-reused="true" data-series-symbol="' + symbol + '"' : '') + '><span>' + (reused ? '<em class="series-symbol" aria-hidden="true">◆</em>' : '') + escapeHtml(label) + '</span><i class="chart-mark" data-chart-mark style="' + markStyle + '"></i><b>' + escapeHtml(value) + '</b></button>';
  }).join('');
  const axis = '<div class="chart-axis" aria-label="数值坐标">' + [0, 0.25, 0.5, 0.75, 1].map((ratio) => '<span>' + escapeHtml(formatAxisValue(max * ratio)) + '</span>').join('') + '</div>';
  return '<figure class="interactive-chart" data-chart-id="' + escapeAttribute(chartId) + '" data-node-id="' + escapeAttribute(dataset.nodeId) + '" data-source-ref="' + escapeAttribute(source) + '"><figcaption>数据对比</figcaption><div class="chart-stage"><div class="chart-selection-band"></div>' + marks + '</div>' + axis +
    '<script type="application/json" data-chart-data-for="' + escapeAttribute(chartId) + '">' + escapeScriptJson(JSON.stringify(dataset)) + '</script></figure>';
}

function renderImage(node, assets) {
  const source = node.assetData ?? assets.get(node.assetPath) ?? node.assetPath;
  return '<figure class="source-figure" data-image-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"' + sourceAttribute(node) + '><img src="' + escapeAttribute(source) + '" alt="' + escapeAttribute(node.alt ?? '') + '"><figcaption>' + escapeHtml(node.caption || node.alt || '') + '</figcaption></figure>';
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
  return '<section class="report-section master-detail" data-block-id="' + escapeAttribute(node.nodeId) + '" data-node-id="' + escapeAttribute(node.nodeId) + '"><header class="section-heading"><span>◎</span><h2>' + escapeHtml(node.title) + '</h2></header><div class="master-detail-grid"><aside class="entity-selector">' + buttons + '</aside><div class="entity-detail">' + panels + '</div></div></section>';
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

function reportCss() {
  return '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--report-canvas);color:var(--report-text);font-family:"Noto Sans CJK SC","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.75}button{font:inherit;color:inherit}.report-header{border-bottom:1px solid var(--report-border);background:var(--report-surface)}.report-header-inner,.report-shell,.chapter-nav>div{width:calc(100% - 64px);max-width:1440px;margin:0 auto}.report-header-inner{padding:72px 0 48px}.eyebrow{margin:0;color:var(--report-accent);font-size:12px;font-weight:800;letter-spacing:.16em}.report-header h1{max-width:1100px;margin:14px 0 22px;font-family:"Noto Serif CJK SC","Songti SC",serif;font-size:clamp(42px,7vw,92px);line-height:1.05;letter-spacing:-.04em;text-wrap:balance}.report-meta{display:flex;gap:12px;flex-wrap:wrap}.report-meta span{padding:6px 12px;border:1px solid var(--report-border);font-size:13px}.chapter-nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--report-canvas) 92%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--report-border)}.chapter-nav>div{display:flex;overflow:auto}.chapter-nav a{flex:none;padding:13px 18px;color:var(--report-text-muted);text-decoration:none;border-right:1px solid var(--report-border);font-size:14px}.chapter-nav a:hover,.chapter-nav a:focus{background:var(--report-hover);color:var(--report-text)}.chapter-nav span{margin-right:8px;color:var(--report-accent);font-family:monospace}.report-shell{padding:24px 0 96px}.report-section{padding:64px 0;border-bottom:1px solid var(--report-border)}.structural-section{padding:28px 0}.structural-section .section-heading{margin-bottom:0}.structural-section .section-heading h2{font-size:clamp(28px,3vw,44px)}.section-heading{display:grid;grid-template-columns:56px minmax(0,1fr);gap:16px;align-items:start;margin-bottom:28px}.section-heading>span{padding-top:10px;color:var(--report-accent);font-family:monospace;font-weight:800}.section-heading h2{margin:0;font-family:"Noto Serif CJK SC","Songti SC",serif;font-size:clamp(32px,4vw,58px);line-height:1.15;text-wrap:balance}.section-content{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}.narrative-block,.evidence-chain,.metric-evidence,.structured-list,.source-figure,.data-pair{grid-column:span 12;margin:0}.narrative-block{max-width:78ch;font-size:18px}.metric-evidence{display:grid;grid-template-columns:minmax(180px,3fr) minmax(0,7fr);gap:24px;padding:24px 0;border-top:1px solid var(--report-border)}.metric-values{display:flex;gap:12px;flex-wrap:wrap}.metric-values strong{color:var(--report-accent);font-size:clamp(28px,4vw,48px);line-height:1}.metric-evidence p{margin:0}.evidence-chain{max-width:78ch;padding:22px 0;border-top:1px solid var(--report-border)}.evidence-chain p{margin:8px 0}.evidence-label{display:inline-block;padding:2px 8px;background:var(--report-evidence-highlight);color:var(--report-accent);font-size:12px;font-weight:800}.source-citation{margin:12px 0 0!important;color:var(--report-text-muted);font-size:12px}.data-pair{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:24px;align-items:start}.table-wrap{overflow:auto;border:1px solid var(--report-border)}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--report-border)}th{background:var(--report-table-header);font-size:13px}tbody tr:nth-child(even){background:var(--report-table-stripe)}tbody tr:hover{background:var(--report-hover)}.summary-row{font-weight:800;color:var(--report-accent)}.interactive-chart{margin:0;padding:18px;border:1px solid var(--report-border);background:var(--report-surface)}.interactive-chart figcaption{margin-bottom:14px;font-weight:800}.chart-stage{position:relative;display:grid;gap:9px}.chart-selection-band{position:absolute;inset:0 auto 0 0;width:0;background:var(--report-selection);pointer-events:none;transition:.15s}.chart-row{position:relative;display:grid;grid-template-columns:80px minmax(0,1fr) 54px;gap:10px;align-items:center;min-height:34px;padding:0;border:0;background:transparent;text-align:left;cursor:crosshair}.chart-mark{display:block;height:14px;min-width:2px}.series-symbol{display:inline-block;margin-right:4px;color:var(--report-chart-axis);font-style:normal}.chart-row b{text-align:right;font-variant-numeric:tabular-nums}.chart-tooltip{position:fixed;z-index:30;display:none;pointer-events:none;padding:8px 10px;background:var(--report-chart-tooltip-background);color:var(--report-chart-tooltip-text);font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.2)}.source-figure img{display:block;max-width:100%;height:auto}.source-figure figcaption{color:var(--report-text-muted);font-size:13px}.master-detail-grid{display:grid;grid-template-columns:220px minmax(0,1fr);border:1px solid var(--report-border)}.entity-selector{display:flex;flex-direction:column;border-right:1px solid var(--report-border)}.entity-selector button,.dimension-tabs button{min-height:44px;border:0;border-bottom:1px solid var(--report-border);background:transparent;text-align:left;cursor:pointer}.entity-selector button{padding:10px 16px}.entity-selector button[aria-selected="true"],.dimension-tabs button[aria-selected="true"]{background:var(--report-selection);color:var(--report-accent);font-weight:800}.entity-detail{padding:24px}.entity-panel>header{display:flex;justify-content:space-between;gap:20px;align-items:start}.entity-panel h3{margin:0;font-size:30px}.dimension-tabs{display:flex;gap:4px;flex-wrap:wrap}.dimension-tabs button{padding:6px 10px;border:1px solid var(--report-border)}.entity-panel article{margin-top:24px;padding-top:20px;border-top:1px solid var(--report-border)}[hidden]{display:none!important}.legacy-html{max-width:100%;overflow:auto}@media(max-width:800px){.report-header-inner,.report-shell,.chapter-nav>div{width:calc(100% - 32px)}.report-header-inner{padding:46px 0 34px}.section-content{display:block}.metric-evidence,.data-pair,.master-detail-grid{grid-template-columns:1fr}.metric-evidence,.data-pair{display:grid}.entity-selector{display:grid;grid-template-columns:repeat(2,1fr);border-right:0;border-bottom:1px solid var(--report-border)}.entity-panel>header{display:block}.dimension-tabs{margin-top:16px}.report-section{padding:44px 0}.structural-section{padding:22px 0}}';
}

function chartAxisCss() {
  return '.chart-axis{display:flex;justify-content:space-between;margin:8px 54px 0 90px;padding-top:5px;border-top:1px solid var(--report-chart-grid);color:var(--report-chart-axis);font-size:10px;font-variant-numeric:tabular-nums}';
}

function reportScript() {
  return `(()=>{const tooltip=document.querySelector('.chart-tooltip');document.querySelectorAll('.chart-row').forEach(row=>{const show=e=>{tooltip.textContent=row.dataset.chartLabel+'：'+row.dataset.chartValue;tooltip.style.display='block';tooltip.style.left=(e.clientX+14)+'px';tooltip.style.top=(e.clientY+14)+'px';const stage=row.closest('.chart-stage');const band=stage.querySelector('.chart-selection-band');band.style.width=Math.max(0,e.clientX-stage.getBoundingClientRect().left)+'px'};row.addEventListener('pointermove',show);row.addEventListener('focus',()=>show({clientX:row.getBoundingClientRect().right,clientY:row.getBoundingClientRect().top}));row.addEventListener('pointerleave',()=>{tooltip.style.display='none';row.closest('.chart-stage').querySelector('.chart-selection-band').style.width='0'});row.addEventListener('blur',()=>{tooltip.style.display='none'})});document.querySelectorAll('.master-detail').forEach(root=>{root.querySelectorAll('[data-entity-id]').forEach(button=>button.addEventListener('click',()=>{root.querySelectorAll('[data-entity-id]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));root.querySelectorAll('[data-entity-panel]').forEach(panel=>panel.hidden=panel.dataset.entityPanel!==button.dataset.entityId)}));root.querySelectorAll('.entity-panel').forEach(panel=>panel.querySelectorAll('[data-dimension]').forEach(button=>button.addEventListener('click',()=>{panel.querySelectorAll('[data-dimension]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));panel.querySelectorAll('[data-dimension-panel]').forEach(item=>item.hidden=item.dataset.dimensionPanel!==button.dataset.dimension)})))})})();`;
}

function formatAxisValue(value) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function numericTokens(text = '') { return text.match(/[-+]?\d+(?:[.,]\d+)*(?:%|‰|亿元|万元|美元|GB\/s|Gbps|kW)?/gu) ?? []; }
function findNumericColumn(rows) { if (!rows.length) return -1; const width = Math.max(...rows.map((row) => row.length)); for (let column = 1; column < width; column += 1) if (rows.some((row) => Number.isFinite(Number(String(row[column]).replaceAll(',', ''))))) return column; return -1; }
function sourceAttribute(node) { const ref = node.sourceRefs?.[0]; return ref ? ' data-source-ref="' + escapeAttribute(ref.documentName + '#' + ref.sourceId) + '"' : ''; }
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function escapeAttribute(value) { return escapeHtml(value); }
function escapeScriptJson(value) { return value.replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026'); }
function mimeFor(filePath) { const extension = path.extname(filePath).toLowerCase(); return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml'})[extension] ?? 'application/octet-stream'; }
async function readJson(filePath) { return JSON.parse(await readFile(filePath, 'utf8')); }
