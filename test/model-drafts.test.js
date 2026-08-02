import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyDraftPatch, redoDraft, undoDraft } from "../src/drafts.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";

test("model text patches are revisioned, rendered, auditable, and undoable", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-draft-v4-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 判断\n原始数值 42。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  const modelPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  const before = JSON.parse(await readFile(modelPath, "utf8"));
  const nodeId = before.nodes[0].children[0].nodeId;

  const changed = await applyDraftPatch(projectDir, variant.variantId, {
    type: "setText", nodeId, value: "用户修订数值 43。", baseRevision: 0
  });
  assert.equal(changed.revision, 1);
  const after = JSON.parse(await readFile(modelPath, "utf8"));
  assert.equal(after.nodes[0].children[0].text, "用户修订数值 43。");
  assert.deepEqual(after.overrides[0], {
    nodeId, field: "text", originalValue: "原始数值 42。", value: "用户修订数值 43。", sourceRefs: after.nodes[0].children[0].sourceRefs,
    changedAt: after.overrides[0].changedAt, provenance: "user-override"
  });
  assert.match(await readFile(path.join(projectDir, "variants", variant.variantId, "artifact.html"), "utf8"), /用户修订数值 43/);
  await assert.rejects(
    applyDraftPatch(projectDir, variant.variantId, { type: "setText", nodeId, value: "stale", baseRevision: 0 }),
    (error) => error.code === "REVISION_CONFLICT"
  );

  assert.equal(await undoDraft(projectDir, variant.variantId), true);
  assert.equal(JSON.parse(await readFile(modelPath, "utf8")).nodes[0].children[0].text, "原始数值 42。");
  assert.equal(await redoDraft(projectDir, variant.variantId), true);
  assert.equal(JSON.parse(await readFile(modelPath, "utf8")).nodes[0].children[0].text, "用户修订数值 43。");
});

test("chart cells edit as values instead of JSON", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-draft-v4-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 表格\n| 地区 | 规模 |\n| --- | --- |\n| 全球 | 42 |", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  const modelPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  const report = JSON.parse(await readFile(modelPath, "utf8"));
  const dataset = report.datasets.find((item) => item.kind === "table");

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "setDataCell", datasetId: dataset.datasetId, row: 0, column: 1, value: 43, baseRevision: 0
  });
  const changed = JSON.parse(await readFile(modelPath, "utf8"));
  assert.equal(changed.datasets.find((item) => item.datasetId === dataset.datasetId).rows[0][1], 43);
  assert.equal(changed.overrides.at(-1).field, "datasets.0.rows.0.1");
});

test("replacement images are copied into project-owned assets with override history", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-draft-image-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 图像\n原图说明", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  const modelPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  const report = JSON.parse(await readFile(modelPath, "utf8"));
  const image = {
    nodeId: "replacement-image",
    type: "image",
    assetPath: "source-assets/missing.png",
    alt: "原图",
    sourceRefs: report.nodes[0].children[0].sourceRefs
  };
  report.nodes[0].children.push(image);
  await writeFile(modelPath, JSON.stringify(report), "utf8");

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "replaceAsset",
    nodeId: image.nodeId,
    value: "data:image/png;base64,iVBORw0KGgo=",
    baseRevision: 0
  });
  const changed = JSON.parse(await readFile(modelPath, "utf8"));
  const changedImage = changed.nodes[0].children.find((node) => node.nodeId === image.nodeId);
  assert.match(changedImage.assetPath, /^variants\/.+\/assets\/replacement-/);
  assert.equal(Object.hasOwn(changedImage, "assetData"), false);
  assert.equal((await readFile(path.join(projectDir, ...changedImage.assetPath.split("/")))).subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(changed.overrides.at(-1).provenance, "user-override");
});

test("deleting a source-backed node records an omission and remains undoable", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-draft-delete-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# Section\nKeep this.\n\nDelete this.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  const modelPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  const before = JSON.parse(await readFile(modelPath, "utf8"));
  const deleted = before.nodes[0].children.at(-1);

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "deleteNode", nodeId: deleted.nodeId, baseRevision: 0
  });
  const changed = JSON.parse(await readFile(modelPath, "utf8"));
  assert.equal(changed.nodes[0].children.some((node) => node.nodeId === deleted.nodeId), false);
  assert.equal(changed.overrides.at(-1).field, "structure");
  const coverage = JSON.parse(await readFile(path.join(projectDir, "coverage-map.json"), "utf8"));
  const omitted = coverage.entries.find((entry) => entry.sourceId === deleted.sourceRefs[0].sourceId);
  assert.equal(omitted.status, "omitted");
  assert.match(omitted.reason, /user deleted report node/);

  assert.equal(await undoDraft(projectDir, variant.variantId), true);
  const restoredCoverage = JSON.parse(await readFile(path.join(projectDir, "coverage-map.json"), "utf8"));
  assert.equal(restoredCoverage.entries.find((entry) => entry.sourceId === deleted.sourceRefs[0].sourceId).status, "preserved");
  assert.equal(await redoDraft(projectDir, variant.variantId), true);
});

test("grid movement locates nodes nested inside master-detail dimensions", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-draft-grid-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# Section\nFirst.\n\nSecond.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  const modelPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  const report = JSON.parse(await readFile(modelPath, "utf8"));
  const sectionSourceRefs = report.nodes[0].sourceRefs;
  const children = report.nodes[0].children;
  report.nodes = [{
    nodeId: "entity-group",
    type: "entityGroup",
    title: "Entities",
    sourceRefs: sectionSourceRefs,
    entities: [{
      entityId: "entity-one",
      title: "One",
      dimensions: [{ label: "Overview", nodes: children, sourceRefs: [] }]
    }]
  }];
  await writeFile(modelPath, JSON.stringify(report), "utf8");

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "moveNode", nodeId: children[1].nodeId, direction: "left", baseRevision: 0
  });
  const changed = JSON.parse(await readFile(modelPath, "utf8"));
  assert.equal(changed.nodes[0].entities[0].dimensions[0].nodes[0].nodeId, children[1].nodeId);
  assert.equal(changed.overrides.at(-1).field, "structure");
});
