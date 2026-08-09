import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createV5Project, createV5Variant } from "../src/v5-project.js";

test("V5 create emits a source pack without pre-design content decisions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "brief.md");
  const projectDir = path.join(root, "project");
  await writeFile(source, "# 市场判断\n2028年市场规模预计达到189亿元。\n\n| 材料 | 增速 |\n| --- | --- |\n| 铜箔 | 18% |", "utf8");

  const project = await createV5Project(source, projectDir);

  assert.equal(project.schemaVersion, 5);
  assert.equal(project.packageVersion, "5.4.0");
  assert.equal(project.toolVersion, "5.4.0");
  assert.equal(project.pipelineVersion, "5.4.0");
  assert.equal(project.artifactContractVersion, "5.4.0");
  assert.equal(project.editorRuntimeVersion, "5.4.0");
  for (const name of [
    "manifest.json",
    "readable-source.md",
    "fact-ledger.json",
    "source-map.json",
    "tables-and-datasets.json",
    "asset-contact-sheet.html",
    "extraction-warnings.json"
  ]) {
    await access(path.join(projectDir, "source-pack", name));
  }
  const manifest = JSON.parse(await readFile(path.join(projectDir, "source-pack", "manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.sourcePackSha256, /^[a-f0-9]{64}$/);
  const facts = JSON.parse(await readFile(path.join(projectDir, "source-pack", "fact-ledger.json"), "utf8"));
  assert.ok(facts.facts.some((fact) => fact.rawText.includes("189亿元")));
  assert.equal("displayIntent" in facts.facts[0], false);
  await assert.rejects(access(path.join(projectDir, "coverage-map.json")));
});

test("V5 variants start at interview and contain no report or presentation model", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-variant-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "brief.txt");
  const projectDir = path.join(root, "project");
  await writeFile(source, "核心内容", "utf8");
  await createV5Project(source, projectDir);

  const variant = await createV5Variant(projectDir, {});

  assert.equal(variant.schemaVersion, 5);
  assert.equal(variant.packageVersion, "5.4.0");
  assert.equal(variant.toolVersion, "5.4.0");
  assert.equal(variant.pipelineVersion, "5.4.0");
  assert.equal(variant.artifactContractVersion, "5.4.0");
  assert.equal(variant.editorRuntimeVersion, "5.4.0");
  assert.equal(variant.pipelineState, "awaiting-interview");
  assert.equal(variant.modeSelection, "compatibility-only");
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  await assert.rejects(access(path.join(variantDir, "report-model.json")));
  await assert.rejects(access(path.join(variantDir, "presentation-plan.json")));
  await assert.rejects(access(path.join(variantDir, "design", "huashu-input")));
});
