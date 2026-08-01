import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeVariant } from "../src/finalize.js";
import { createProject } from "../src/project.js";
import { restoreVersion } from "../src/versions.js";
import { createVariant } from "../src/variants.js";

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
    '<!doctype html><h1 data-edit-id="title">First</h1>',
    "utf8"
  );
  const first = await finalizeVariant(projectDir, variant.variantId);
  await writeFile(
    artifactPath,
    '<!doctype html><h1 data-edit-id="title">Second</h1>',
    "utf8"
  );
  const second = await finalizeVariant(projectDir, variant.variantId);

  const restored = await restoreVersion(projectDir, first.versionId);

  assert.equal(restored.parentVersionId, second.versionId);
  assert.equal(restored.restoredFromVersionId, first.versionId);
  assert.equal(
    await readFile(
      path.join(projectDir, "versions", restored.versionId, "artifact.html"),
      "utf8"
    ),
    '<!doctype html><h1 data-edit-id="title">First</h1>'
  );
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  assert.equal(project.versions.length, 3);
});

