import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeVariant } from "../src/finalize.js";
import { createProject } from "../src/project.js";
import { listPublications, publishLocal } from "../src/publish.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "./helpers/huashu.js";
import { confirmEditorReview } from "../src/editor-review.js";

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
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  const artifactPath = path.join(
    projectDir,
    "variants",
    variant.variantId,
    "artifact.html"
  );
  await writeFile(
    artifactPath,
    '<!doctype html><body data-report-mode="evidence-first"><p data-edit-id="body">Saved</p></body>',
    "utf8"
  );
  await confirmEditorReview(projectDir, variant.variantId, { sessionId: "test-publish-editor" });
  const version = await finalizeVariant(projectDir, variant.variantId);
  await writeFile(
    artifactPath,
    '<!doctype html><body data-report-mode="evidence-first"><p data-edit-id="body">Unsaved draft</p></body>',
    "utf8"
  );

  const publication = await publishLocal(projectDir, version.versionId, output);

  const published = await readFile(output, "utf8");
  assert.match(published, /data-theme="warm-paper-terracotta"/);
  assert.match(published, /<p data-edit-id="body">Saved<\/p>/);
  assert.doesNotMatch(published, /Unsaved draft/);
  assert.match(publication.publicationId, /^[0-9a-f-]{36}$/);
  assert.equal(publication.status, "published");
  assert.equal(publication.themeId, "warm-paper-terracotta");
  assert.equal(
    await readFile(path.join(projectDir, "publications", publication.publicationId, "report.html"), "utf8"),
    published
  );
  assert.equal((await listPublications(projectDir))[0].outputPath, output);
  assert.equal(
    JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8")).publications[0].publicationId,
    publication.publicationId
  );
});
