import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeVariant } from "../src/finalize.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "./helpers/huashu.js";
import { confirmEditorReview } from "../src/editor-review.js";

async function authoredVariant(t, html) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Revenue reached 42 million.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, {
    mode: "evidence-first",
    theme: "editorial-light"
  });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  const authoredHtml = /\bdata-report-mode\s*=/.test(html)
    ? html
    : html.replace(/<body\b/i, '<body data-report-mode="evidence-first"');
  await writeFile(
    path.join(projectDir, "variants", variant.variantId, "artifact.html"),
    authoredHtml,
    "utf8"
  );
  await confirmEditorReview(projectDir, variant.variantId, { sessionId: "test-authored-editor" });
  return { projectDir, variant };
}

test("finalizeVariant creates an immutable saved version for a valid artifact", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><main data-block-id="summary">' +
      '<h1 data-edit-id="title">Market brief</h1>' +
      '<p data-edit-id="revenue" data-source-ref="brief.txt">Revenue reached 42 million.</p>' +
      "</main></body></html>"
  );

  const version = await finalizeVariant(projectDir, variant.variantId, {
    message: "First review"
  });

  assert.equal(version.variantId, variant.variantId);
  assert.equal(version.message, "First review");
  assert.equal(version.themeId, "warm-paper-terracotta");
  assert.equal(version.themeSchemaVersion, 2);
  assert.equal(version.schemaVersion, 4);
  assert.equal(version.reportRevision, 0);
  const savedArtifact = await readFile(
    path.join(projectDir, "versions", version.versionId, "artifact.html"),
    "utf8"
  );
  assert.match(savedArtifact, /data-theme="warm-paper-terracotta"/);
  assert.match(savedArtifact, /--report-accent:#CC785C/);
  assert.match(
    savedArtifact,
    /<body data-report-mode="evidence-first"><main data-block-id="summary">/
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
      path.join(projectDir, "versions", version.versionId, "version.json"),
        "utf8"
      )
    ),
    version
  );
  assert.equal(
    JSON.parse(await readFile(path.join(projectDir, "versions", version.versionId, "report-model.json"), "utf8")).schemaVersion,
    4
  );
  assert.equal(
    JSON.parse(await readFile(path.join(projectDir, "versions", version.versionId, "presentation-plan.json"), "utf8")).contentMutationAllowed,
    false
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(
          projectDir,
          "variants",
          variant.variantId,
          "edit-manifest.json"
        ),
        "utf8"
      )
    ),
    {
      schemaVersion: 4,
      editIds: ["title", "revenue"],
      blockIds: ["summary"],
      imageIds: [],
      chartIds: []
    }
  );
});

test("finalizeVariant rejects an editable numeric claim without a source reference", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><p data-edit-id="revenue">Revenue reached 42 million.</p></body></html>'
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /numeric edit "revenue" requires data-source-ref/
  );
});

test("finalizeVariant rejects remote runtime resources", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><img data-image-id="hero" src="https://example.com/hero.png"></body></html>'
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /remote resources are not allowed/
  );
});

test("finalizeVariant rejects local resources that were not inlined", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><img data-image-id="hero" src="./hero.png"></body></html>'
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /resource "\.\/hero\.png" must be inlined/
  );
});

test("finalizeVariant rejects duplicate editable identities", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><h1 data-edit-id="same">One</h1><p data-edit-id="same">Two</p></body></html>'
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /duplicate data-edit-id "same"/
  );
});

test("finalizeVariant rejects a source reference outside uploaded material", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><p data-edit-id="revenue" data-source-ref="web-result.json">42 million</p></body></html>'
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /unknown source reference "web-result.json"/
  );
});

test("finalizeVariant rejects a chart without material provenance", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><div data-chart-id="sales"></div>' +
      '<script type="application/json" data-chart-data-for="sales">{"values":[42]}</script>' +
      "</body></html>"
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /chart "sales" requires data-source-ref/
  );
});

test("finalizeVariant requires a formula for a derived numeric claim", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><p data-edit-id="growth" data-derived="true" data-source-ref="brief.txt">Growth was 20%.</p></body></html>'
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /derived value "growth" requires data-formula/
  );
});

test("finalizeVariant accepts a traceable derived numeric claim", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body><p data-edit-id="growth" data-derived="true" data-formula="(current - prior) / prior" data-source-ref="brief.txt">Growth was 20%.</p></body></html>'
  );

  const version = await finalizeVariant(projectDir, variant.variantId);
  assert.equal(version.variantId, variant.variantId);
});

test("finalizeVariant enforces that artifact mode matches the variant", async (t) => {
  const { projectDir, variant } = await authoredVariant(
    t,
    '<!doctype html><html><body data-report-mode="data-first"><p>Wrong structure</p></body></html>'
  );

  await assert.rejects(
    finalizeVariant(projectDir, variant.variantId),
    /artifact must declare data-report-mode="evidence-first"/
  );
});
