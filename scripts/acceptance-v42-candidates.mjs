import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

import {
  confirmHuashuDesignCandidate,
  hashDesignPackagePayload,
  hashShowcasePayload,
  importHuashuDesignCandidate
} from "../src/design-package.js";
import { renderVariant } from "../src/renderer.js";
import { writeJsonAtomic } from "../src/io.js";

const [projectDir, variantId] = process.argv.slice(2);
if (!projectDir || !variantId) {
  throw new Error("usage: node scripts/acceptance-v42-candidates.mjs <project> <variantId>");
}

const variantDir = path.join(projectDir, "variants", variantId);
const input = JSON.parse(await readFile(
  path.join(variantDir, "design", "huashu-input", "manifest.json"),
  "utf8"
));
const variant = JSON.parse(await readFile(path.join(variantDir, "variant.json"), "utf8"));
if (variant.themeId !== "deep-data-blue") {
  throw new Error("AI server acceptance expects the data-first default deep-data-blue theme");
}

const candidates = [
  {
    candidateId: "evidence-ledger",
    designDirectionId: "evidence-ledger",
    designDirectionLabel: "A｜证据账本",
    prefix: "ledger",
    css: ledgerCss()
  },
  {
    candidateId: "signal-matrix",
    designDirectionId: "signal-matrix",
    designDirectionLabel: "B｜信号矩阵",
    prefix: "matrix",
    css: matrixCss()
  },
  {
    candidateId: "material-atlas",
    designDirectionId: "material-atlas",
    designDirectionLabel: "C｜材料图谱",
    prefix: "atlas",
    css: atlasCss()
  }
];

await writeFile(
  path.join(projectDir, "design-direction-spec.md"),
  designSpec(),
  "utf8"
);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const candidate of candidates) {
    const sourceDir = path.join(variantDir, "design", "huashu-generated", candidate.candidateId);
    await writeCandidate(sourceDir, candidate, input.inputSha256);
    await importHuashuDesignCandidate(projectDir, variantId, sourceDir);
    await confirmHuashuDesignCandidate(projectDir, variantId, candidate.candidateId, {
      confirmedBy: "acceptance-showcase-compiler"
    });
    const artifactPath = await renderVariant(projectDir, variantId);
    await captureShowcases(browser, artifactPath, sourceDir);
    await writeManifest(sourceDir, candidate, input.inputSha256);
    await importHuashuDesignCandidate(projectDir, variantId, sourceDir);
  }
} finally {
  await browser.close();
}

await clearProvisionalSelection();
await writeGallery();
process.stdout.write(JSON.stringify({
  projectDir,
  variantId,
  previewThemeId: variant.themeId,
  candidates: candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    label: candidate.designDirectionLabel,
    desktop: path.join(variantDir, "design", "candidates", candidate.candidateId, "showcases", "desktop.png"),
    mobile: path.join(variantDir, "design", "candidates", candidate.candidateId, "showcases", "mobile.png")
  })),
  gallery: path.join(projectDir, "design-candidates.html")
}, null, 2));

async function writeCandidate(candidateDir, candidate, inputSha256) {
  await rm(candidateDir, { recursive: true, force: true });
  await mkdir(path.join(candidateDir, "components"), { recursive: true });
  await mkdir(path.join(candidateDir, "styles"), { recursive: true });
  await mkdir(path.join(candidateDir, "showcases"), { recursive: true });
  const prefix = candidate.prefix;
  const payload = {
    "tokens.json": { schemaVersion: 1, tokenPolicy: "semantic-only" },
    "layout-grammar.json": {
      schemaVersion: 1,
      nodeLayouts: { section: "section-layout", content: "content-layout" },
      layouts: {
        "section-layout": { className: `${prefix}-section-layout` },
        "content-layout": { className: `${prefix}-content-layout` }
      }
    },
    "component-grammar.json": {
      schemaVersion: 1,
      bindings: {
        section: "section-component",
        metric: "metric-component",
        paragraph: "narrative-component",
        text: "narrative-component",
        list: "narrative-component",
        footnote: "narrative-component",
        table: "table-component",
        image: "figure-component",
        entityGroup: "master-detail-component",
        evidenceWarning: "warning-component"
      }
    },
    "chart-grammar.json": { schemaVersion: 1, bindings: { chart: "chart-component" } },
    "table-grammar.json": { schemaVersion: 1, componentId: "table-component" },
    "interaction-grammar.json": {
      schemaVersion: 1,
      bindings: {
        section: ["anchor-navigation"],
        table: ["row-highlight"],
        entityGroup: ["entity-tabs"],
        chart: ["chart-tooltip", "selection-band"]
      },
      interactions: {
        "anchor-navigation": { runtime: "anchor-navigation" },
        "row-highlight": { runtime: "row-highlight" },
        "entity-tabs": { runtime: "entity-tabs" },
        "chart-tooltip": { runtime: "chart-tooltip" },
        "selection-band": { runtime: "selection-band" }
      }
    },
    "responsive-grammar.json": {
      schemaVersion: 1,
      breakpoints: { mobile: 390, tablet: 800, desktop: 1280 }
    },
    "components/registry.json": {
      schemaVersion: 1,
      components: {
        "section-component": { primitive: "section", className: `${prefix}-section` },
        "narrative-component": { primitive: "narrative", className: `${prefix}-narrative` },
        "metric-component": { primitive: "metric", className: `${prefix}-metric` },
        "table-component": { primitive: "table", className: `${prefix}-table` },
        "chart-component": { primitive: "chart", className: `${prefix}-chart` },
        "figure-component": { primitive: "figure", className: `${prefix}-figure` },
        "master-detail-component": { primitive: "masterDetail", className: `${prefix}-master-detail` },
        "warning-component": { primitive: "evidenceWarning", className: `${prefix}-warning` }
      }
    }
  };
  for (const [name, value] of Object.entries(payload)) {
    await writeJsonAtomic(path.join(candidateDir, name), value);
  }
  await writeFile(path.join(candidateDir, "styles", "report.css"), candidate.css, "utf8");
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  await writeFile(path.join(candidateDir, "showcases", "desktop.png"), tinyPng);
  await writeFile(path.join(candidateDir, "showcases", "mobile.png"), tinyPng);
  await writeJsonAtomic(path.join(candidateDir, "showcases", "manifest.json"), {
    schemaVersion: 1,
    scenarios: ["hero", "data-table", "master-detail"],
    compiledFrom: "confirmed-candidate-artifact",
    selectors: [".report-header", ".data-pair", ".master-detail-grid"],
    desktop: "desktop.png",
    mobile: "mobile.png"
  });
  await writeManifest(candidateDir, candidate, inputSha256);
}

async function writeManifest(candidateDir, candidate, inputSha256) {
  const showcaseSha256 = await hashShowcasePayload(candidateDir);
  const outputSha256 = await hashDesignPackagePayload(candidateDir);
  await writeJsonAtomic(path.join(candidateDir, "manifest.json"), {
    schemaVersion: 2,
    packageVersion: "4.2.0",
    skill: "huashu-design",
    candidateId: candidate.candidateId,
    designDirectionId: candidate.designDirectionId,
    designDirectionLabel: candidate.designDirectionLabel,
    previewThemeId: "deep-data-blue",
    showcaseSha256,
    inputSha256,
    outputSha256,
    confirmation: { status: "pending", confirmedAt: null, confirmedBy: null }
  });
}

async function captureShowcases(browser, artifactPath, candidateDir) {
  const targets = [".report-header", ".data-pair", ".master-detail-grid"];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(artifactPath).href, { waitUntil: "load" });
    const buffers = [];
    for (const selector of targets) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.scrollIntoViewIfNeeded();
        buffers.push(await locator.screenshot({ animations: "disabled" }));
      }
    }
    if (buffers.length !== 3) {
      throw new Error(`showcase requires hero, data-table, and master-detail; found ${buffers.length}`);
    }
    if (errors.length) throw new Error(`showcase browser errors: ${errors.join(" | ")}`);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const composite = await stackScreenshots(buffers, viewport.width, background);
    await writeFile(path.join(candidateDir, "showcases", `${viewport.name}.png`), composite);
    await page.close();
  }
}

async function stackScreenshots(buffers, width, background) {
  const images = await Promise.all(buffers.map((buffer) => loadImage(buffer)));
  const padding = width >= 1000 ? 28 : 12;
  const gap = width >= 1000 ? 20 : 10;
  const innerWidth = width - padding * 2;
  const rendered = images.map((image) => {
    const scale = Math.min(1, innerWidth / image.width);
    return { image, width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
  });
  const height = padding * 2 + gap * (rendered.length - 1) + rendered.reduce((sum, item) => sum + item.height, 0);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  let y = padding;
  for (const item of rendered) {
    context.drawImage(item.image, padding, y, item.width, item.height);
    y += item.height + gap;
  }
  return canvas.toBuffer("image/png");
}

async function clearProvisionalSelection() {
  await rm(path.join(variantDir, "design", "package"), { recursive: true, force: true });
  const [nextVariant, project] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readJson(path.join(projectDir, "project.json"))
  ]);
  delete nextVariant.designSelection;
  nextVariant.reviewState = {
    status: "awaiting-editor-review",
    reason: "design candidate selection required",
    invalidatedAt: new Date().toISOString()
  };
  const stored = project.variants.find((item) => item.variantId === variantId);
  if (stored) {
    delete stored.designSelection;
    stored.reviewState = nextVariant.reviewState;
  }
  await writeJsonAtomic(path.join(variantDir, "variant.json"), nextVariant);
  await writeJsonAtomic(path.join(projectDir, "project.json"), project);
}

async function writeGallery() {
  const cards = candidates.map((candidate) => {
    const base = `variants/${variantId}/design/candidates/${candidate.candidateId}/showcases`;
    return `<article><header><b>${candidate.designDirectionLabel}</b><code>${candidate.candidateId}</code></header><img src="${base}/desktop.png" alt="${candidate.designDirectionLabel} desktop"><details><summary>查看 390px 移动端</summary><img class="mobile" src="${base}/mobile.png" alt="${candidate.designDirectionLabel} mobile"></details></article>`;
  }).join("");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V4.2 设计候选</title><style>*{box-sizing:border-box}body{margin:0;background:#07101f;color:#eef6ff;font-family:"Microsoft YaHei",sans-serif}header.top{padding:36px 4vw;border-bottom:1px solid #294564}h1{margin:0 0 10px;font-size:clamp(30px,5vw,64px)}p{margin:0;color:#aebdca}.grid{display:grid;gap:30px;padding:30px 4vw 60px}article{border:1px solid #294564;background:#0b1a2b}article>header{display:flex;justify-content:space-between;gap:20px;padding:18px 20px;border-bottom:1px solid #294564}code{color:#7fc2ff}img{display:block;width:100%;height:auto}details{padding:14px 20px;border-top:1px solid #294564}summary{cursor:pointer}.mobile{max-width:390px;margin:16px auto 0;border:1px solid #294564}@media(max-width:700px){article>header{display:block}code{display:block;margin-top:6px}}</style></head><body><header class="top"><h1>同内容 · 同配色 · 三种设计方向</h1><p>模式固定为数据优先，预览主题固定为深海数据蓝；只比较排版、组件、交互和信息层级。</p></header><main class="grid">${cards}</main></body></html>`;
  await writeFile(path.join(projectDir, "design-candidates.html"), html, "utf8");
}

function sharedCss() {
  return `
.report-header{background:var(--report-surface);border-bottom:1px solid var(--report-border)}
.report-header-inner,.report-shell,.chapter-nav>div{width:min(1480px,calc(100% - 64px));margin-inline:auto}
.report-header-inner{padding:68px 0 50px}.eyebrow{margin:0;color:var(--report-accent);font:700 12px/1.2 Consolas,monospace;letter-spacing:.16em}
.report-header h1{max-width:1100px;margin:14px 0 22px;font-size:clamp(44px,7vw,96px);line-height:1.02;letter-spacing:-.055em;text-wrap:balance}
.report-meta{display:flex;gap:8px;flex-wrap:wrap}.report-meta span{padding:6px 10px;border:1px solid var(--report-border);color:var(--report-text-muted);font-size:12px}
.chapter-nav{position:sticky;top:0;z-index:20;background:var(--report-canvas);border-bottom:1px solid var(--report-border)}
.chapter-nav>div{display:flex;overflow:auto}.chapter-nav a{flex:none;padding:12px 14px;color:var(--report-text-muted);text-decoration:none;border-right:1px solid var(--report-border);font-size:13px}.chapter-nav a:hover,.chapter-nav a:focus{background:var(--report-hover);color:var(--report-text)}.chapter-nav span{margin-right:8px;color:var(--report-accent);font-family:Consolas,monospace}
.report-shell{padding:18px 0 96px}.report-section{padding:58px 0;border-bottom:1px solid var(--report-border)}
.section-heading{display:grid;grid-template-columns:52px minmax(0,1fr);gap:16px;margin-bottom:28px}.section-heading>span{padding-top:8px;color:var(--report-accent);font:700 12px/1 Consolas,monospace}.section-heading h2{margin:0;font-size:clamp(30px,4vw,58px);line-height:1.12;text-wrap:balance}
.section-content{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}.section-content>*{grid-column:span 12}
.narrative-block,.structured-list,.evidence-chain{max-width:82ch;margin:0}.narrative-block{font-size:17px;text-wrap:pretty}.structured-list{padding-left:22px}.source-citation{color:var(--report-text-muted);font-size:12px}
.evidence-chain,.metric-evidence{padding:20px;border:1px solid var(--report-border);background:var(--report-surface)}.evidence-label{display:inline-block;padding:3px 7px;background:var(--report-evidence-highlight);color:var(--report-accent);font-size:11px;font-weight:800}
.metric-values{display:flex;gap:12px;align-items:baseline}.metric-values strong{color:var(--report-accent);font-size:clamp(32px,4vw,54px);line-height:1}.metric-values span{color:var(--report-text-muted)}
.data-pair,.narrative-chart-pair{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(340px,.92fr);gap:18px;align-items:start}
.table-wrap,.interactive-chart,.master-detail-grid{border:1px solid var(--report-border);background:var(--report-surface)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:11px 13px;text-align:left;border-bottom:1px solid var(--report-border)}th{background:var(--report-table-header);font-size:12px;letter-spacing:.03em}tbody tr:nth-child(even){background:var(--report-table-stripe)}tbody tr:hover{background:var(--report-hover)}.summary-row{color:var(--report-accent);font-weight:800}
.interactive-chart{margin:0;padding:18px}.interactive-chart figcaption{margin-bottom:16px;font-weight:800}.chart-stage{display:grid;gap:8px}.chart-row{position:relative;min-height:34px;cursor:crosshair}.chart-mark{height:12px}.chart-row b{text-align:right;font-variant-numeric:tabular-nums}.chart-axis{display:flex;justify-content:space-between;margin:8px 54px 0 90px;padding-top:5px;border-top:1px solid var(--report-chart-grid);color:var(--report-chart-axis);font-size:10px}
.master-detail-grid{display:grid;grid-template-columns:250px minmax(0,1fr)}.entity-selector{display:flex;flex-direction:column;border-right:1px solid var(--report-border)}.entity-selector button,.dimension-tabs button{min-height:44px;border:0;border-bottom:1px solid var(--report-border);background:transparent;text-align:left;cursor:pointer}.entity-selector button{padding:10px 14px}.entity-selector button[aria-selected="true"],.dimension-tabs button[aria-selected="true"]{background:var(--report-selection);color:var(--report-accent);font-weight:800}.entity-detail{padding:24px}.entity-panel>header{display:flex;justify-content:space-between;gap:18px}.entity-panel h3{margin:0;font-size:30px}.dimension-tabs{display:flex;gap:5px;flex-wrap:wrap}.dimension-tabs button{padding:6px 9px;border:1px solid var(--report-border)}.entity-panel article{margin-top:22px;padding-top:18px;border-top:1px solid var(--report-border)}
.source-figure{margin:0}.source-figure figcaption{color:var(--report-text-muted);font-size:12px}
@media(max-width:800px){.report-header-inner,.report-shell,.chapter-nav>div{width:calc(100% - 28px)}.report-header-inner{padding:44px 0 32px}.report-header h1{font-size:42px}.report-section{padding:38px 0}.section-heading{grid-template-columns:34px minmax(0,1fr);gap:8px}.section-heading h2{font-size:30px}.section-content{display:block}.section-content>*+*{margin-top:16px}.data-pair,.narrative-chart-pair,.master-detail-grid{grid-template-columns:minmax(0,1fr)}.entity-selector{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-right:0;border-bottom:1px solid var(--report-border)}.entity-selector button{min-width:0}.entity-panel>header{display:block}.dimension-tabs{margin-top:14px}.entity-detail{padding:16px}.table-wrap{overflow:auto}.interactive-chart{padding:14px}.chart-row{grid-template-columns:minmax(72px,100px) minmax(0,1fr) minmax(50px,auto)}}`;
}

function ledgerCss() {
  return `${sharedCss()}
body{font-size:16px}.ledger-section-layout{display:grid}.ledger-content-layout{min-width:0}.ledger-section{position:relative}.ledger-narrative{font-family:"Microsoft YaHei",sans-serif}.ledger-section>.section-heading{border-top:3px double var(--report-border);padding-top:18px}.ledger-section>.section-content{padding-left:68px}.ledger-table table{font-family:Consolas,"Microsoft YaHei",monospace}.ledger-chart{border-top:3px solid var(--report-accent)}.ledger-master-detail{border-top:3px solid var(--report-accent)}.ledger-warning{border-inline-start:6px solid var(--report-warning)}
@media(min-width:1100px){.ledger-section>.section-content>.ledger-narrative{grid-column:2/span 6}.ledger-section>.section-content>.data-pair,.ledger-section>.section-content>.narrative-chart-pair,.ledger-section>.section-content>.ledger-table,.ledger-section>.section-content>.ledger-master-detail{grid-column:2/span 11}.ledger-section>.section-content>.ledger-figure{grid-column:2/span 8}}
@media(max-width:800px){.ledger-section>.section-content{padding-left:0}.ledger-section>.section-heading{border-top-width:1px}}`;
}

function matrixCss() {
  return `${sharedCss()}
body{font-size:15px;background-image:linear-gradient(var(--report-border) 1px,transparent 1px),linear-gradient(90deg,var(--report-border) 1px,transparent 1px);background-size:48px 48px;background-position:-1px -1px}.report-header{background:var(--report-canvas)}.report-header-inner{display:grid;grid-template-columns:minmax(0,1fr) 280px;align-items:end}.report-meta{justify-content:flex-end}.matrix-section-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:28px}.matrix-section>.section-heading{display:block;position:sticky;top:70px;align-self:start;margin:0;padding:18px;border:1px solid var(--report-border);background:var(--report-canvas)}.matrix-section>.section-heading>span{display:block;margin-bottom:12px}.matrix-section>.section-content{padding:18px;border:1px solid var(--report-border);background:var(--report-canvas)}.matrix-narrative{max-width:none}.matrix-table,.matrix-chart{box-shadow:inset 0 3px 0 var(--report-accent)}.matrix-master-detail{grid-template-columns:290px minmax(0,1fr);box-shadow:inset 0 3px 0 var(--report-focus)}.matrix-warning{box-shadow:inset 5px 0 0 var(--report-warning)}
@media(min-width:1200px){.matrix-section>.section-content>.matrix-narrative{grid-column:span 6}.matrix-section>.section-content>.matrix-narrative:nth-child(even){grid-column:7/span 6}.matrix-section>.section-content>.data-pair,.matrix-section>.section-content>.narrative-chart-pair,.matrix-section>.section-content>.matrix-master-detail{grid-column:span 12}}
@media(max-width:800px){body{background-size:28px 28px}.report-header-inner{display:block}.report-meta{justify-content:flex-start}.matrix-section-layout{display:block}.matrix-section>.section-heading{position:static;margin-bottom:12px}.matrix-section>.section-content{padding:12px}.matrix-master-detail{grid-template-columns:1fr}}`;
}

function atlasCss() {
  return `${sharedCss()}
body{font-size:16px}.report-header-inner{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:40px;align-items:end}.report-meta{display:grid}.atlas-section-layout{display:grid}.atlas-section{border-bottom:0}.atlas-section>.section-heading{padding:18px 0;border-block:1px solid var(--report-border)}.atlas-section>.section-content{padding-top:8px}.atlas-narrative{padding:18px;background:var(--report-surface-alt);border-top:1px solid var(--report-border)}.atlas-table{border-radius:18px;overflow:hidden}.atlas-chart{border-radius:18px}.atlas-master-detail{grid-template-columns:320px minmax(0,1fr);border-radius:22px;overflow:hidden}.atlas-master-detail .entity-selector{padding:12px;background:var(--report-surface-alt);gap:4px}.atlas-master-detail .entity-selector button{border:1px solid transparent;border-radius:10px}.atlas-master-detail .entity-selector button[aria-selected="true"]{border-color:var(--report-focus)}.atlas-master-detail .entity-detail{padding:32px}.atlas-warning{border-radius:14px;box-shadow:inset 0 0 0 2px var(--report-warning)}
@media(min-width:1050px){.atlas-section>.section-content>.atlas-narrative{grid-column:span 4}.atlas-section>.section-content>.data-pair,.atlas-section>.section-content>.narrative-chart-pair,.atlas-section>.section-content>.atlas-master-detail{grid-column:span 12}}
@media(max-width:800px){.report-header-inner{display:block}.report-meta{display:flex}.atlas-master-detail{grid-template-columns:1fr;border-radius:14px}.atlas-master-detail .entity-detail{padding:16px}.atlas-table,.atlas-chart{border-radius:12px}}`;
}

function designSpec() {
  return `# AI 服务器报告 V4.2 设计方向 spec

本次是 V4.2 的真实验收，不新增事实、不改写原文、不改变 189 项来源覆盖，也不将正文中的每个数字放大为 KPI。受众是需要快速理解 AI 服务器核心材料技术、市场、供应链和风险关系的研究读者；使用场景同时覆盖桌面深读与 390px 移动端查阅。模式固定为 data-first，意味着优先建立数据关系、表格比较、来源绑定和 12 种材料的主从导航，而不是追求数字数量。三套方向使用同一 report-model、同一内容切片、同一 deep-data-blue 预览主题，严禁用不同颜色制造选择偏差。

共同场景必须包括：首屏标题和模式信息；能同时看见原始表格与语义兼容图表的数据区；能在 12 种材料及其实际维度之间切换的主从区；来源、证据和风险提示；桌面与移动响应式。共同技术约束包括：所有 CSS 只引用语义主题变量；无远程字体、脚本或图片；组件、布局和交互 ID 必须存在于注册表；展示截图必须从同一候选编译的 artifact 中截取并组合；正文即使含多个数字也保持 narrative，只有完整 metric 合同才可成为 KPI。

方向 A「证据账本」把报告视为可审计的研究底稿：章节标题像账簿索引，正文保持稳定阅读宽度，表格与图表作为跨栏证据展开，适合逐条核对来源。方向 B「信号矩阵」把报告视为高密度系统面板：左侧章节坐标、右侧数据工作区、细网格和明确的图表焦点，适合横向比较技术信号。方向 C「材料图谱」把 12 种材料视为核心探索对象：更强的主从组件、较宽实体导航、柔和分区和可扫描信息块，适合按材料逐项查阅。三者的差异只在排版、组件形态、交互重心和信息层级，不改变主题 token、事实、DOM 编辑 ID 或数据。`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
