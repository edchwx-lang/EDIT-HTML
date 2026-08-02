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
