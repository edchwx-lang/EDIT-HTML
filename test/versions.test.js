import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeVariant } from "../src/finalize.js";
import { applyDraftPatch } from "../src/drafts.js";
import { createProject } from "../src/project.js";
import { restoreVersion } from "../src/versions.js";
import { createVariant, updateVariantTheme } from "../src/variants.js";

test("restoring an old version creates a new descendant and preserves history", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, {
    mode: "evidence-first",
    theme: "editorial-light"
  });
  const artifactPath = path.join(
    projectDir,
    "variants",
    variant.variantId,
    "artifact.html"
  );
  await writeFile(
    artifactPath,
    '<!doctype html><html><body data-report-mode="evidence-first"><h1 data-edit-id="title">First</h1></body></html>',
    "utf8"
  );
  const first = await finalizeVariant(projectDir, variant.variantId);
  await updateVariantTheme(projectDir, variant.variantId, "signal-orange");
  await writeFile(
    artifactPath,
    '<!doctype html><html><body data-report-mode="evidence-first"><h1 data-edit-id="title">Second</h1></body></html>',
    "utf8"
  );
  const second = await finalizeVariant(projectDir, variant.variantId);

  const restored = await restoreVersion(projectDir, first.versionId);

  assert.equal(restored.parentVersionId, second.versionId);
  assert.equal(restored.restoredFromVersionId, first.versionId);
  assert.equal(restored.themeId, "warm-paper-terracotta");
  assert.match(
    await readFile(
      path.join(projectDir, "versions", restored.versionId, "artifact.html"),
      "utf8"
    ),
    /<h1 data-edit-id="title">First<\/h1>/
  );
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  assert.equal(project.versions.length, 3);
  assert.equal(project.variants[0].themeId, "warm-paper-terracotta");
});

test("restoring a V4 version restores its model snapshot and creates a descendant", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-v4-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 判断\n第一版。", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  const modelPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  let report = JSON.parse(await readFile(modelPath, "utf8"));
  const nodeId = report.nodes[0].children[0].nodeId;
  const first = await finalizeVariant(projectDir, variant.variantId, { message: "First model" });
  await applyDraftPatch(projectDir, variant.variantId, { type: "setText", nodeId, value: "第二版。", baseRevision: report.revision });
  const second = await finalizeVariant(projectDir, variant.variantId, { message: "Second model" });

  const restored = await restoreVersion(projectDir, first.versionId);
  report = JSON.parse(await readFile(modelPath, "utf8"));
  assert.equal(report.nodes[0].children[0].text, "第一版。");
  assert.equal(restored.parentVersionId, second.versionId);
  assert.equal(restored.restoredFromVersionId, first.versionId);
  assert.match(await readFile(path.join(projectDir, "variants", variant.variantId, "artifact.html"), "utf8"), /第一版/);
});
