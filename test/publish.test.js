import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeVariant } from "../src/finalize.js";
import { createProject } from "../src/project.js";
import { publishLocal } from "../src/publish.js";
import { createVariant } from "../src/variants.js";

test("publishLocal exports the selected saved version, never the current draft", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  const output = path.join(sandbox, "published.html");
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
    '<!doctype html><p data-edit-id="body">Saved</p>',
    "utf8"
  );
  const version = await finalizeVariant(projectDir, variant.variantId);
  await writeFile(
    artifactPath,
    '<!doctype html><p data-edit-id="body">Unsaved draft</p>',
    "utf8"
  );

  await publishLocal(projectDir, version.versionId, output);

  const published = await readFile(output, "utf8");
  assert.match(published, /data-theme="warm-paper-terracotta"/);
  assert.match(published, /<p data-edit-id="body">Saved<\/p>/);
  assert.doesNotMatch(published, /Unsaved draft/);
});
