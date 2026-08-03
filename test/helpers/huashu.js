import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  confirmHuashuDesignCandidate,
  hashDesignPackagePayload,
  hashShowcasePayload,
  hashHuashuProvenance,
  importHuashuDesignCandidate
  , prepareHuashuInput
} from "../../src/design-package.js";
import { renderVariant } from "../../src/renderer.js";
import { confirmEditorReview } from "../../src/editor-review.js";

export async function completeTestHuashuDesign(projectDir, variantId, { render = true, review = true } = {}) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const variant = JSON.parse(await readFile(path.join(variantDir, "variant.json"), "utf8"));
  const reportPath = path.join(variantDir, "report-model.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  if (report.editorialStatus !== "confirmed") {
    report.editorialStatus = "confirmed";
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  }
  await prepareHuashuInput(projectDir, variantId, { references: ["test://reference"] });
  const candidateId = "test-" + variantId;
  const candidateDir = path.join(variantDir, "design", ".test-candidate-source");
  await writeTestHuashuCandidate(projectDir, variantId, candidateDir, {
    candidateId,
    previewThemeId: variant.themeId
  });
  await importHuashuDesignCandidate(projectDir, variantId, candidateDir);
  await confirmHuashuDesignCandidate(projectDir, variantId, candidateId, {
    confirmedBy: "test-fixture"
  });
  const packageDir = path.join(variantDir, "design", "package");
  if (!render) return packageDir;
  const artifactPath = await renderVariant(projectDir, variantId);
  if (review) {
    await confirmEditorReview(projectDir, variantId, { sessionId: "test-editor-session" });
  }
  return artifactPath;
}

export async function writeTestHuashuCandidate(
  projectDir,
  variantId,
  candidateDir,
  {
    candidateId = "candidate-test",
    designDirectionId = "direction-test",
    designDirectionLabel = "测试方向",
    previewThemeId = "deep-data-blue",
    classPrefix = "test"
  } = {}
) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const input = JSON.parse(await readFile(
    path.join(variantDir, "design", "huashu-input", "manifest.json"),
    "utf8"
  ));
  await mkdir(path.join(candidateDir, "components"), { recursive: true });
  await mkdir(path.join(candidateDir, "styles"), { recursive: true });
  await mkdir(path.join(candidateDir, "showcases"), { recursive: true });
  const files = {
    "composition-plan.json": {
      schemaVersion: 1,
      rootOrder: [],
      groups: [],
      informationPriority: ["finding", "evidence", "qualification"]
    },
    "component-tree.json": { schemaVersion: 1, nodes: {} },
    "chart-specs.json": { schemaVersion: 1, charts: {} },
    "tokens.json": { tokenPolicy: "semantic-only" },
    "layout-grammar.json": {
      nodeLayouts: { section: "section-layout", content: "content-layout" },
      layouts: {
        "section-layout": { className: `${classPrefix}-section-layout` },
        "content-layout": { className: `${classPrefix}-content-layout` }
      }
    },
    "component-grammar.json": {
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
    "chart-grammar.json": { bindings: { chart: "chart-component" } },
    "table-grammar.json": { componentId: "table-component" },
    "interaction-grammar.json": {
      bindings: {
        section: ["anchor-navigation"],
        table: ["row-highlight"],
        entityGroup: ["entity-tabs"],
        chart: ["chart-tooltip"]
      },
      interactions: {
        "anchor-navigation": { runtime: "anchor-navigation" },
        "row-highlight": { runtime: "row-highlight" },
        "entity-tabs": { runtime: "entity-tabs" },
        "chart-tooltip": { runtime: "chart-tooltip" }
      }
    },
    "responsive-grammar.json": { breakpoints: { mobile: 390, desktop: 1280 } },
    "components/registry.json": {
      schemaVersion: 1,
      components: {
        "section-component": { primitive: "section", className: `${classPrefix}-section` },
        "narrative-component": { primitive: "narrative", className: `${classPrefix}-narrative` },
        "metric-component": { primitive: "metric", className: `${classPrefix}-metric` },
        "table-component": { primitive: "table", className: `${classPrefix}-table` },
        "chart-component": { primitive: "chart", className: `${classPrefix}-chart` },
        "figure-component": { primitive: "figure", className: `${classPrefix}-figure` },
        "master-detail-component": { primitive: "masterDetail", className: `${classPrefix}-master-detail` },
        "warning-component": { primitive: "evidenceWarning", className: `${classPrefix}-warning` }
      }
    }
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(path.join(candidateDir, name), JSON.stringify(value, null, 2), "utf8");
  }
  await writeFile(path.join(candidateDir, "styles", "report.css"), [
    `.${classPrefix}-section-layout{display:grid;gap:var(--report-space-section,2rem)}`,
    `.${classPrefix}-section{border-block-start:1px solid var(--report-border)}`,
    `.${classPrefix}-narrative{color:var(--report-text)}`,
    ".report-header{border-bottom:1px solid var(--report-border);background:var(--report-surface)}",
    ".report-header-inner,.report-shell,.chapter-nav>div{width:min(1440px,calc(100% - 64px));margin:0 auto}",
    ".report-header-inner{padding:64px 0 42px}.report-header h1{margin:12px 0;font-size:clamp(38px,6vw,80px);line-height:1.08}",
    ".report-meta{display:flex;gap:10px;flex-wrap:wrap}.report-meta span{padding:5px 10px;border:1px solid var(--report-border)}",
    ".chapter-nav{position:sticky;top:0;z-index:10;background:var(--report-canvas);border-bottom:1px solid var(--report-border)}",
    ".chapter-nav>div{display:flex;overflow:auto}.chapter-nav a{flex:none;padding:12px;color:var(--report-text-muted);text-decoration:none}",
    ".report-shell{padding:20px 0 80px}.report-section{padding:48px 0;border-bottom:1px solid var(--report-border)}",
    ".section-heading{display:grid;grid-template-columns:48px minmax(0,1fr);gap:14px}.section-heading h2{margin:0;font-size:clamp(28px,4vw,52px)}",
    ".section-content{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}.section-content>*{grid-column:span 12}",
    ".narrative-block,.evidence-chain{max-width:78ch}.evidence-chain,.metric-evidence{padding:18px 0;border-top:1px solid var(--report-border)}",
    ".metric-values{display:flex;gap:12px;align-items:baseline}.metric-values strong{color:var(--report-accent);font-size:clamp(28px,4vw,48px)}",
    ".data-pair,.narrative-chart-pair{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:20px}",
    ".table-wrap,.interactive-chart,.master-detail-grid{border:1px solid var(--report-border)}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid var(--report-border)}",
    ".master-detail-grid{display:grid;grid-template-columns:220px minmax(0,1fr)}.entity-selector{display:flex;flex-direction:column}.entity-detail{padding:20px}",
    "@media(max-width:800px){.report-header-inner,.report-shell,.chapter-nav>div{width:calc(100% - 28px)}.section-content{display:block}.data-pair,.narrative-chart-pair,.master-detail-grid{grid-template-columns:1fr}.report-section{padding:36px 0}}"
  ].join("\n"), "utf8");
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  await writeFile(path.join(candidateDir, "showcases", "desktop.png"), tinyPng);
  await writeFile(path.join(candidateDir, "showcases", "mobile.png"), tinyPng);
  await writeFile(path.join(candidateDir, "showcases", "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    scenarios: ["hero", "data-table", "master-detail"],
    desktop: "desktop.png",
    mobile: "mobile.png"
  }, null, 2), "utf8");
  const showcaseSha256 = await hashShowcasePayload(candidateDir);
  const outputSha256 = await hashDesignPackagePayload(candidateDir);
  const compositionSha256 = createHash("sha256").update(await readFile(path.join(candidateDir, "composition-plan.json"))).digest("hex");
  const componentTreeSha256 = createHash("sha256").update(await readFile(path.join(candidateDir, "component-tree.json"))).digest("hex");
  const huashuInvokedAt = new Date().toISOString();
  const huashuRunId = "test-huashu-run";
  await writeFile(path.join(candidateDir, "manifest.json"), JSON.stringify({
    schemaVersion: 3,
    packageVersion: "4.3.0",
    skill: "huashu-design",
    candidateId,
    designDirectionId,
    designDirectionLabel,
    strategyThesis: "A test-only complete strategy",
    selectionContext: "reference-clear",
    previewThemeId,
    showcaseSha256,
    inputSha256: input.inputSha256,
    outputSha256,
    compositionSha256,
    componentTreeSha256,
    huashuRunId,
    huashuInvokedAt,
    provenanceSha256: hashHuashuProvenance({ huashuRunId, huashuInvokedAt }),
    confirmation: { status: "pending", confirmedAt: null, confirmedBy: null }
  }, null, 2), "utf8");
  return candidateDir;
}
