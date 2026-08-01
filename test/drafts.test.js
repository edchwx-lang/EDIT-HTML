import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyDraftPatch, redoDraft, undoDraft } from "../src/drafts.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";

async function editableVariant(t) {
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
    '<!doctype html><h1 data-edit-id="title">Old &amp; clear</h1>',
    "utf8"
  );
  return { projectDir, variant, artifactPath };
}

test("draft text patches escape HTML and support undo and redo", async (t) => {
  const { projectDir, variant, artifactPath } = await editableVariant(t);

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "replaceText",
    editId: "title",
    value: "New <evidence>"
  });
  assert.equal(
    await readFile(artifactPath, "utf8"),
    '<!doctype html><h1 data-edit-id="title">New &lt;evidence&gt;</h1>'
  );

  await undoDraft(projectDir, variant.variantId);
  assert.equal(
    await readFile(artifactPath, "utf8"),
    '<!doctype html><h1 data-edit-id="title">Old &amp; clear</h1>'
  );

  await redoDraft(projectDir, variant.variantId);
  assert.equal(
    await readFile(artifactPath, "utf8"),
    '<!doctype html><h1 data-edit-id="title">New &lt;evidence&gt;</h1>'
  );
});

