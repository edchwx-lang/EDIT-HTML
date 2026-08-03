import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importEditorialModel, validateEditorialModel } from "../src/editorial-model.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";

const sourceModel = {
  schemaVersion: 4,
  documents: [{
    documentId: "doc-1",
    name: "source.docx",
    units: [
      { sourceId: "src-heading", order: 0, type: "heading", text: "一、原文原标题", substantive: true },
      { sourceId: "src-market", order: 1, type: "paragraph", text: "2025年市场规模为42亿元，统计口径为全球。", substantive: true },
      { sourceId: "src-risk", order: 2, type: "paragraph", text: "但该预测取决于先进封装产能。", substantive: true }
    ]
  }]
};

function validFixture() {
  const refs = (sourceId) => [{ documentId: "doc-1", documentName: "source.docx", sourceId }];
  const report = {
    schemaVersion: 4,
    variantId: "v",
    mode: "data-first",
    sourcePolicy: "closed",
    expressionPolicy: "free",
    editorialStatus: "confirmed",
    nodes: [{
      nodeId: "section-market",
      type: "section",
      title: "市场边界：规模与产能约束",
      sourceRefs: [refs("src-heading")[0], refs("src-market")[0], refs("src-risk")[0]],
      transformation: "merge",
      children: [
        { nodeId: "finding", type: "paragraph", role: "finding", displayIntent: "narrative", text: "市场规模达到42亿元，口径为全球。", sourceRefs: refs("src-market"), transformation: "summarize" },
        { nodeId: "qualification", type: "paragraph", role: "qualification", displayIntent: "warning", text: "预测仍取决于先进封装产能。", sourceRefs: refs("src-risk"), transformation: "summarize" }
      ]
    }],
    facts: [], datasets: [], overrides: []
  };
  const coverage = {
    schemaVersion: 4,
    variantId: "v",
    entries: sourceModel.documents[0].units.map((unit) => ({
      sourceId: unit.sourceId,
      substantive: true,
      status: "preserved",
      coverageStatus: "covered",
      transformation: unit.sourceId === "src-heading" ? "merge" : "summarize",
      reportNodeIds: [unit.sourceId === "src-risk" ? "qualification" : "finding"],
      factIds: []
    }))
  };
  return { report, coverage };
}

test("source-closed expression-free editorial model may retitle, merge, and summarize", () => {
  const { report, coverage } = validFixture();
  assert.notEqual(report.nodes[0].title, sourceModel.documents[0].units[0].text);
  assert.doesNotThrow(() => validateEditorialModel(sourceModel, report, coverage));
});

test("editorial validation rejects changed numbers and source-free substantive prose", () => {
  const changed = validFixture();
  changed.report.nodes[0].children[0].text = "市场规模达到88亿元，口径为全球。";
  assert.throws(() => validateEditorialModel(sourceModel, changed.report, changed.coverage), /numeric token 88/);

  const sourceFree = validFixture();
  sourceFree.report.nodes[0].children.push({
    nodeId: "external", type: "paragraph", role: "finding", displayIntent: "narrative",
    text: "外部机构认为需求将翻倍。", sourceRefs: [], transformation: "summarize"
  });
  assert.throws(() => validateEditorialModel(sourceModel, sourceFree.report, sourceFree.coverage), /source reference/);

  const forgedWithReference = validFixture();
  forgedWithReference.report.nodes[0].children.push({
    nodeId: "forged-ref", type: "paragraph", role: "finding", displayIntent: "narrative",
    text: "External analysts claim demand will triple indefinitely.",
    sourceRefs: forgedWithReference.report.nodes[0].children[0].sourceRefs,
    transformation: "summarize"
  });
  assert.throws(() => validateEditorialModel(sourceModel, forgedWithReference.report, forgedWithReference.coverage), /not lexically supported/);
});

test("editorial validation rejects changed units, reversed qualifications, forged datasets, and imported overrides", () => {
  const changedUnit = validFixture();
  changedUnit.report.nodes[0].children[0].text = "市场规模达到42万元，口径为全球。";
  assert.throws(() => validateEditorialModel(sourceModel, changedUnit.report, changedUnit.coverage), /unsupported unit or qualifier/);

  const reversed = validFixture();
  reversed.report.nodes[0].children[1].text = "预测不受先进封装产能限制。";
  assert.throws(() => validateEditorialModel(sourceModel, reversed.report, reversed.coverage), /unsupported unit or qualifier/);

  const forged = validFixture();
  forged.report.datasets = [{ datasetId: "external", nodeId: "finding", kind: "semantic", relation: "trend", x: ["2025", "2026"], series: [{ name: "外部", values: [999, 1000] }] }];
  assert.throws(() => validateEditorialModel(sourceModel, forged.report, forged.coverage), /dataset is not source-derived/);

  const override = validFixture();
  override.report.nodes[0].children[0].text = "市场规模达到999亿元。";
  override.report.overrides = [{ nodeId: "finding", field: "text", provenance: "user-override" }];
  assert.throws(() => validateEditorialModel(sourceModel, override.report, override.coverage), /editorial import cannot contain user overrides/);
});

test("a public V4.3 variant has no mode question and regenerates Huashu input after editorial import", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v43-editorial-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "brief.md");
  const project = path.join(root, "project");
  await writeFile(source, "# 原文市场标题\n2025年市场规模为42亿元，统计口径为全球。", "utf8");
  await createProject(source, project);
  const variant = await createVariant(project, {});
  assert.equal(variant.modeSelection, "strategy-derived");
  assert.equal(variant.themeId, "precision-blueprint");
  const variantDir = path.join(project, "variants", variant.variantId);
  const report = JSON.parse(await readFile(path.join(variantDir, "report-model.json"), "utf8"));
  const coverage = JSON.parse(await readFile(path.join(project, "coverage-map.json"), "utf8"));
  report.editorialStatus = "confirmed";
  report.nodes[0].title = "市场边界：42亿元的全球口径";
  report.nodes[0].sourceRefs.push(...report.nodes[0].children[0].sourceRefs);
  report.nodes[0].transformation = "summarize";
  const reportPath = path.join(root, "editorial-report.json");
  const coveragePath = path.join(root, "editorial-coverage.json");
  await writeFile(reportPath, JSON.stringify(report), "utf8");
  await writeFile(coveragePath, JSON.stringify(coverage), "utf8");
  const imported = await importEditorialModel(project, variant.variantId, { reportPath, coveragePath });
  assert.equal(imported.editorialStatus, "confirmed");
  const huashuInput = JSON.parse(await readFile(path.join(variantDir, "design", "huashu-input", "manifest.json"), "utf8"));
  assert.equal(huashuInput.strategySelection, "three-material-driven-strategies");
});
